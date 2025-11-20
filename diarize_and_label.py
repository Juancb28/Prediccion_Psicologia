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
from pyannote.audio import Pipeline
import whisper
import pkg_resources

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
    
    # Verificar token de Hugging Face
    hf_token = os.environ.get("HUGGINGFACE_TOKEN")
    if not hf_token:
        raise ValueError("HUGGINGFACE_TOKEN no configurado en .env")

    # On Windows creating symlinks may require elevated privileges (Developer Mode
    # or admin). Hugging Face Hub and pyannote may try to create symlinks in the
    # cache which fails with WinError 1314. Force the hub to avoid symlinks and
    # use copies instead to work without admin privileges.
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
        # treat 0.14.0+ as incompatible for pyannote.audio 3.1.1
        try:
            major, minor, *_ = [int(x) for x in hf_ver.split('.')]
        except Exception:
            major = minor = 0

        if (major == 0 and minor >= 14) or (major >= 1):
            raise RuntimeError(
                f"Incompatible 'huggingface_hub' version detected: {hf_ver}. "
                "pyannote.audio (3.x) expects the older API that accepts 'use_auth_token'. "
                "Please install a compatible version: `pip install huggingface_hub==0.13.4` "
                "and re-run the script. You may also update your project's `requirements.txt`."
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
        import huggingface_hub as _hf_hub
        import inspect

        # If hf_hub_download does not accept 'use_auth_token' but accepts 'token',
        # wrap it so calls with 'use_auth_token' still work. pyannote may have
        # already imported the function into its own module, so patch that
        # reference too.
        try:
            sig = inspect.signature(_hf_hub.hf_hub_download)
            params = sig.parameters
            if 'use_auth_token' not in params and 'token' in params:
                _orig_hf_hub_download = _hf_hub.hf_hub_download

                def _hf_hub_download_compat(*args, **kwargs):
                    if 'use_auth_token' in kwargs and 'token' not in kwargs:
                        kwargs['token'] = kwargs.pop('use_auth_token')
                    return _orig_hf_hub_download(*args, **kwargs)

                _hf_hub.hf_hub_download = _hf_hub_download_compat

                # Also try to patch pyannote's local reference if present
                try:
                    import pyannote.audio.core.pipeline as _py_pipeline
                    if hasattr(_py_pipeline, 'hf_hub_download'):
                        _py_pipeline.hf_hub_download = _hf_hub_download_compat
                except Exception:
                    pass
        except Exception:
            # If anything goes wrong inspecting/wrapping, continue and we'll
            # attempt other authentication strategies below.
            pass

        # Try to initialize pipeline. First attempt: let pyannote handle auth
        # via environment/login (recommended). We'll login explicitly and then
        # call from_pretrained without extra kwargs to avoid passing unknown
        # parameters into pyannote internals.
        from huggingface_hub import login
        print("Intentando autenticar con Hugging Face Hub...")
        login(token=hf_token)
        pipeline = Pipeline.from_pretrained("pyannote/speaker-diarization")
    except Exception as e:
        raise RuntimeError(f"No se pudo inicializar pyannote Pipeline: {e}")

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