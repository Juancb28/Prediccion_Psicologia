import os
import json
import whisper
import torch
import warnings
from pathlib import Path

# Silenciar warnings de Whisper
warnings.filterwarnings('ignore', message='.*FP16 is not supported on CPU.*')
warnings.filterwarnings('ignore', message='.*Torch was not compiled with flash attention.*')
warnings.filterwarnings('ignore', message='.*Failed to launch Triton kernels.*')

def transcribe_audio(audio_path, model_size='small', language='es', output_dir='outputs'):
    """
    Transcribe an audio file using Whisper and save JSON/TXT outputs.
    Returns the transcription dict.
    """
    # Configurar dispositivo (forzar GPU si está disponible)
    device = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"Dispositivo: {device}")
    if device == "cuda":
        print(f"GPU detectada: {torch.cuda.get_device_name(0)}")
    
    print("Cargando modelo Whisper...")
    model = whisper.load_model(model_size, device=device)
    print(f"Modelo cargado en {device.upper()}")
    print("Transcribiendo audio...")
    transcription = model.transcribe(audio_path, language=language, word_timestamps=True, fp16=(device=="cuda"))

    audio_name = Path(audio_path).stem
    Path(output_dir).mkdir(parents=True, exist_ok=True)

    json_path = os.path.join(output_dir, f"{audio_name}_transcription.json")
    txt_path = os.path.join(output_dir, f"{audio_name}_transcription.txt")

    with open(json_path, 'w', encoding='utf-8') as jf:
        json.dump(transcription, jf, ensure_ascii=False, indent=2)

    # Save a formatted text transcript: full transcription + segments with timestamps
    full_text = transcription.get('text') or ''
    segments = transcription.get('segments', [])

    with open(txt_path, 'w', encoding='utf-8') as tf:
        tf.write("TRANSCRIPCIÓN COMPLETA\n")
        tf.write("==================================================\n\n")
        if full_text:
            # Ensure single leading space like example
            tf.write(f" {full_text}\n\n")
        else:
            tf.write("\n")

        tf.write("==================================================\n")
        tf.write("SEGMENTOS CON TIMESTAMPS\n")
        tf.write("==================================================\n\n")

        for seg in segments:
            start = seg.get('start', 0.0)
            end = seg.get('end', 0.0)
            text = seg.get('text', '').strip()
            # Format times with one decimal like the example
            tf.write(f"[{start:.1f}s - {end:.1f}s] {text}\n")

    print(f"✓ Transcripción guardada: {json_path}")
    print(f"✓ Texto guardado: {txt_path}")

    return transcription
