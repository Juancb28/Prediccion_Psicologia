"""
Diarización de audio + asignación de texto a cada hablante
Combina la transcripción de Whisper con la diarización de pyannote
Genera un archivo TXT con el texto etiquetado por hablante
"""
import os
import json
import torch
from dotenv import load_dotenv
from pathlib import Path
import pkg_resources

# Force torchaudio to use the soundfile backend to avoid torchcodec/FFmpeg
# which requires additional native libraries. This prevents torchaudio from
# importing torchcodec (and its libtorchcodec) when loading audio files.
os.environ.setdefault("TORCHAUDIO_USE_SOUNDFILE", "1")
try:
    import torchaudio
    try:
        torchaudio.set_audio_backend("soundfile")
    except Exception:
        # Older torchaudio versions may not expose set_audio_backend; ignore.
        pass
except Exception:
    # If torchaudio is not available for backend switching, continue and
    # let subsequent imports surface useful errors.
    pass

from pyannote.audio import Pipeline
import whisper

load_dotenv()

def assign_speakers_to_text(transcription, diarization):
    """
    Asigna cada segmento de texto al hablante correspondiente
    basándose en la superposición temporal
    
    Args:
        transcription: Resultado de Whisper (dict)
        diarization: Resultado de pyannote (Annotation)
    
    Returns:
        list: Segmentos con speaker asignado
    """
    labeled_segments = []
    
    for segment in transcription['segments']:
        start = segment['start']
        end = segment['end']
        text = segment['text'].strip()
        
        # Calcular punto medio del segmento
        midpoint = (start + end) / 2
        
        # Encontrar el hablante en ese momento
        speaker = None
        max_overlap = 0
        
        for turn, _, spk in diarization.itertracks(yield_label=True):
            overlap_start = max(start, turn.start)
            overlap_end = min(end, turn.end)
            overlap = max(0, overlap_end - overlap_start)
            
            if overlap > max_overlap:
                max_overlap = overlap
                speaker = spk
        
        labeled_segments.append({
            'start': start,
            'end': end,
            'speaker': speaker if speaker else 'UNKNOWN',
            'text': text
        })
    
    return labeled_segments

def diarize_and_label(audio_path, transcription_path=None, output_dir="outputs"):
    """
    Realiza diarización y asigna texto a cada hablante
    
    Args:
        audio_path: Ruta al archivo de audio
        transcription_path: Ruta al JSON de transcripción (opcional, se genera si no existe)
        output_dir: Directorio de salida
    
    Returns:
        list: Segmentos etiquetados
    """
    print("=== Diarización y Etiquetado ===\n")
    
    # Allow running fully offline / local: avoid requiring a Hugging Face
    # token or attempting to authenticate. If you have a local cached
    # pyannote pipeline, set `PYANNOTE_LOCAL_PIPELINE` to that folder/path.
    # Otherwise the code will attempt to load the standard pipeline in
    # offline mode (`local_files_only=True`) and will raise a clear error
    # if the model is not available locally. This avoids any automatic
    # Hugging Face authentication or network downloads.
    os.environ.setdefault("HF_HUB_DISABLE_SYMLINKS", "1")
    os.environ.setdefault("HF_HUB_DISABLE_SYMLINKS_WARNING", "1")

    # Monkey-patch speechbrain fetching to avoid symlink permission errors on Windows.
    try:
        import speechbrain.utils.fetching as _sb_fetch
        import shutil as _shutil
        import pathlib as _pathlib

        _orig_link_with_strategy = getattr(_sb_fetch, 'link_with_strategy', None)

        if _orig_link_with_strategy is not None:
            def _link_with_strategy_compat(src, dst, strategy):
                try:
                    return _orig_link_with_strategy(src, dst, strategy)
                except OSError as oe:
                    # Fallback: copy file or directory when symlink is not permitted
                    src_p = _pathlib.Path(src)
                    dst_p = _pathlib.Path(dst)
                    dst_p.parent.mkdir(parents=True, exist_ok=True)
                    if src_p.is_dir():
                        _shutil.copytree(src_p, dst_p, dirs_exist_ok=True)
                    else:
                        _shutil.copy2(src_p, dst_p)
                    return dst_p

            _sb_fetch.link_with_strategy = _link_with_strategy_compat
    except Exception:
        pass

    # Check huggingface_hub version compatibility: pyannote.audio 3.x expects
    # older API that accepts `use_auth_token`. Newer huggingface_hub removed
    # that keyword and renamed it to `token`. Detect incompatible versions
    # and provide actionable instructions.
    try:
        hf_ver = pkg_resources.get_distribution('huggingface-hub').version
    except Exception:
        hf_ver = None

    if hf_ver:
        # treat 0.14.0+ as formally incompatible for pyannote.audio 3.1.1
        try:
            major, minor, *_ = [int(x) for x in hf_ver.split('.')]
        except Exception:
            major = minor = 0

        if (major == 0 and minor >= 14) or (major >= 1):
            # Instead of aborting, warn and attempt runtime compatibility shims below.
            print(
                f"⚠ Advertencia: 'huggingface_hub' versión detectada: {hf_ver}. "
                "pyannote.audio (3.x) historically required the older 'use_auth_token' API. "
                "The script will attempt compatibility wrappers and proceed; if the pipeline fails, "
                "consider installing a compatible version: `pip install huggingface_hub==0.13.4`."
            )
    
    # Crear directorio de salida
    Path(output_dir).mkdir(parents=True, exist_ok=True)
    audio_name = Path(audio_path).stem
    
    # 1. Obtener transcripción
    if transcription_path and os.path.exists(transcription_path):
        print(f"Cargando transcripción existente: {transcription_path}")
        with open(transcription_path, 'r', encoding='utf-8') as f:
            transcription = json.load(f)
    else:
        print("Generando transcripción con Whisper...")
        model = whisper.load_model("small")
        transcription = model.transcribe(audio_path, language="es", word_timestamps=True)
        
        # Guardar transcripción
        trans_json = os.path.join(output_dir, f"{audio_name}_transcription.json")
        with open(trans_json, 'w', encoding='utf-8') as f:
            json.dump(transcription, f, ensure_ascii=False, indent=2)
        print(f"✓ Transcripción guardada: {trans_json}")
    
    # 2. Realizar diarización
    print("\nRealizando diarización con pyannote...")
    print(f"GPU disponible: {torch.cuda.is_available()}")
    if torch.cuda.is_available():
        print(f"GPU: {torch.cuda.get_device_name(0)}")
    
    # Crear pipeline de pyannote. Different pyannote/huggingface versions expect
    # different parameter names. Provide compatibility wrappers for hf_hub_download
    # so that pyannote internals work regardless of installed huggingface_hub.
    try:
        # Prefer an explicit env var. If not present, attempt to autodiscover
        # a cached pipeline under the Hugging Face cache (usual location
        # is ~/.cache/huggingface/hub/models--pyannote--speaker-diarization/snapshots).
        local_pipeline = os.environ.get("PYANNOTE_LOCAL_PIPELINE")
        if not local_pipeline:
            try:
                hf_home = os.environ.get("HF_HOME") or str(Path.home() / ".cache" / "huggingface")
                snapshots_dir = os.path.join(hf_home, "hub", "models--pyannote--speaker-diarization", "snapshots")
                if os.path.isdir(snapshots_dir):
                    candidates = [os.path.join(snapshots_dir, d) for d in os.listdir(snapshots_dir) if os.path.isdir(os.path.join(snapshots_dir, d))]
                    if candidates:
                        # Pick the most recent by directory mtime
                        candidates.sort(key=lambda p: os.path.getmtime(p))
                        local_pipeline = candidates[-1]
                        print(f"Autodetectado pipeline pyannote en caché: {local_pipeline}")
            except Exception:
                local_pipeline = None

        if not local_pipeline:
            raise RuntimeError(
                "Se requiere un pipeline pyannote local. "
                "Establezca la variable de entorno PYANNOTE_LOCAL_PIPELINE con la ruta al pipeline descargado localmente, "
                "o descargue el pipeline en caché con huggingface tooling."
            )

        # If a directory was provided, look for common config filenames
        cfg_path = local_pipeline
        if os.path.isdir(local_pipeline):
            for name in ("config.yaml", "config.yml", "pipeline.yaml", "pipeline.yml"):
                candidate = os.path.join(local_pipeline, name)
                if os.path.isfile(candidate):
                    cfg_path = candidate
                    break

        print(f"Cargando pipeline pyannote desde ruta local (config): {cfg_path}")
        pipeline = Pipeline.from_pretrained(cfg_path)
    except Exception as e:
        raise RuntimeError(
            "No se pudo inicializar pyannote Pipeline desde la ruta local proporcionada. "
            "Asegúrese de que PYANNOTE_LOCAL_PIPELINE apunte a una carpeta válida que contenga el pipeline descargado. "
            f"Detalle: {e}"
        )

    # Mover pipeline a GPU si está disponible
    if torch.cuda.is_available():
        pipeline.to(torch.device("cuda"))

    

    diarization = pipeline(audio_path)
    
    # Guardar diarización
    diar_txt = os.path.join(output_dir, f"{audio_name}_diarization.txt")
    with open(diar_txt, 'w', encoding='utf-8') as f:
        f.write("DIARIZACIÓN (Turnos de habla)\n")
        f.write("="*50 + "\n\n")
        for turn, _, speaker in diarization.itertracks(yield_label=True):
            f.write(f"[{turn.start:.1f}s - {turn.end:.1f}s] {speaker}\n")
    print(f"✓ Diarización guardada: {diar_txt}")
    
    # 3. Asignar hablantes a texto
    print("\nAsignando texto a cada hablante...")
    labeled_segments = assign_speakers_to_text(transcription, diarization)
    
    # 4. Guardar resultado etiquetado
    output_json = os.path.join(output_dir, f"{audio_name}_labeled.json")
    with open(output_json, 'w', encoding='utf-8') as f:
        json.dump(labeled_segments, f, ensure_ascii=False, indent=2)
    print(f"✓ Etiquetado JSON guardado: {output_json}")
    
    # 5. Generar TXT legible con etiquetas
    output_txt = os.path.join(output_dir, f"{audio_name}_labeled.txt")
    with open(output_txt, 'w', encoding='utf-8') as f:
        f.write("TRANSCRIPCIÓN ETIQUETADA POR HABLANTE\n")
        f.write("="*50 + "\n\n")
        
        current_speaker = None
        for seg in labeled_segments:
            # Cambio de hablante: nueva línea
            if seg['speaker'] != current_speaker:
                if current_speaker is not None:
                    f.write("\n\n")
                current_speaker = seg['speaker']
                f.write(f"{seg['speaker']}:\n")
            
            f.write(f"[{seg['start']:.1f}s - {seg['end']:.1f}s] {seg['text']}\n")
        
        # Resumen de hablantes
        speakers = set(seg['speaker'] for seg in labeled_segments)
        f.write("\n" + "="*50 + "\n")
        f.write(f"RESUMEN: {len(speakers)} hablantes detectados\n")
        for spk in sorted(speakers):
            count = sum(1 for seg in labeled_segments if seg['speaker'] == spk)
            duration = sum(seg['end'] - seg['start'] for seg in labeled_segments if seg['speaker'] == spk)
            f.write(f"  {spk}: {count} intervenciones, {duration:.1f}s total\n")
    
    print(f"✓ Etiquetado TXT guardado: {output_txt}")
    
    # Mostrar resumen
    speakers = set(seg['speaker'] for seg in labeled_segments)
    print(f"\n--- Resumen ---")
    print(f"Hablantes detectados: {len(speakers)}")
    for spk in sorted(speakers):
        count = sum(1 for seg in labeled_segments if seg['speaker'] == spk)
        print(f"  {spk}: {count} intervenciones")
    
    return labeled_segments

if __name__ == "__main__":
    import sys
    
    if len(sys.argv) < 2:
        print("Uso: python diarize_and_label.py <ruta_audio> [ruta_transcripcion_json]")
        print("Ejemplo: python diarize_and_label.py recordings/test.wav")
        print("         python diarize_and_label.py recordings/test.wav outputs/test_transcription.json")
        sys.exit(1)
    
    audio_path = sys.argv[1]
    transcription_path = sys.argv[2] if len(sys.argv) > 2 else None
    
    try:
        diarize_and_label(audio_path, transcription_path)
        print("\n✓ Diarización y etiquetado completados exitosamente")
    except Exception as e:
        print(f"\n⚠ Error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)