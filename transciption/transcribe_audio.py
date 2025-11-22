"""
Transcripción de audio usando Whisper
Genera un archivo JSON con la transcripción completa y segmentos con timestamps
"""
import os
import json
import torch
import whisper
from dotenv import load_dotenv
from pathlib import Path

load_dotenv()

"""
Transcribe un archivo de audio usando Whisper

Args:
    audio_path: Ruta al archivo de audio
    model_size: Tamaño del modelo Whisper (tiny, base, small, medium, large)
    language: Código de idioma (es, en, etc.)
    output_dir: Directorio de salida

Returns:
    dict: Resultado de la transcripción
"""
def transcribe_audio(audio_path, model_size="small", language="es", output_dir="outputs"):
   
    # Verificar archivo
    if not os.path.exists(audio_path):
        raise FileNotFoundError(f"Archivo no encontrado: {audio_path}")
    
    # Crear directorio de salida
    Path(output_dir).mkdir(parents=True, exist_ok=True)
    
    # Información del sistema
    # print(f"GPU disponible: {torch.cuda.is_available()}")
    
    """
    if torch.cuda.is_available():
        print(f"GPU: {torch.cuda.get_device_name(0)}")
    """
    
    print(f"Archivo: {audio_path}")
    print(f"Modelo: {model_size}")
    print(f"Idioma: {language}\n")
    
    # Cargar modelo y transcribir
    # print("Cargando modelo Whisper...")
    model = whisper.load_model(model_size)
    
    # print("Transcribiendo audio...")
    result = model.transcribe(
        audio_path,
        language=language,
        verbose=False,
        word_timestamps=True  # Importante para sincronizar con diarización
    )
    
    # Preparar salida
    audio_name = Path(audio_path).stem
    output_json = os.path.join(output_dir, f"{audio_name}_transcription.json")
    output_txt = os.path.join(output_dir, f"{audio_name}_transcription.txt")
    
    # Guardar JSON completo
    with open(output_json, 'w', encoding='utf-8') as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
    
    #print(f"✓ Transcripción guardada: {output_json}")
    
    # Guardar TXT simple
    with open(output_txt, 'w', encoding='utf-8') as f:
        f.write(f"TRANSCRIPCIÓN COMPLETA\n")
        f.write(f"{'='*50}\n\n")
        f.write(result['text'])
        f.write(f"\n\n{'='*50}\n")
        f.write(f"SEGMENTOS CON TIMESTAMPS\n")
        f.write(f"{'='*50}\n\n")
        for seg in result['segments']:
            f.write(f"[{seg['start']:.1f}s - {seg['end']:.1f}s] {seg['text'].strip()}\n")
    print(f"✓ Texto guardado: {output_txt}")
    
    # Mostrar resumen
    # print(f"\n--- Resumen ---")
    # print(f"Duración: {result['segments'][-1]['end']:.1f}s")
    # print(f"Segmentos: {len(result['segments'])}")
    # print(f"Texto completo ({len(result['text'])} caracteres):")
    # print(result['text'][:200] + "..." if len(result['text']) > 200 else result['text'])
    
    return result

if __name__ == "__main__":
    import sys
    
    # Uso desde línea de comandos
    if len(sys.argv) < 2:
        print("Uso: python transcribe_audio.py <ruta_audio> [modelo] [idioma]")
        print("Ejemplo: python transcribe_audio.py recordings/test.wav small es")
        sys.exit(1)
    
    audio_path = sys.argv[1]
    model_size = sys.argv[2] if len(sys.argv) > 2 else "small"
    language = sys.argv[3] if len(sys.argv) > 3 else "es"
    
    try:
        transcribe_audio(audio_path, model_size, language)
        # print("\n✓ Transcripción completada exitosamente")
    except Exception as e:
        print(f"\n Error: {e}")
        sys.exit(1)