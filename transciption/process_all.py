"""
Pipeline completo: Transcripción → Diarización → Identificación
Ejecuta todo el proceso en secuencia
"""
import sys
import os
from pathlib import Path

# Importar los módulos anteriores
# Ensure the local `transciption` package directory is on sys.path so
# imports work when running the script from the project root.
SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from transcribe_audio import transcribe_audio
from diarize_and_label import diarize_and_label
from identify_speakers import identify_speakers

def process_audio_complete(audio_path, model_size="small", language="es", 
                          refs_dir="refs", threshold=0.75, output_dir="outputs"):
    """
    Procesa un audio completamente: transcripción + diarización + identificación
    
    Args:
        audio_path: Ruta al archivo de audio
        model_size: Tamaño del modelo Whisper
        language: Idioma del audio
        refs_dir: Directorio con audios de referencia
        threshold: Umbral de similitud para identificación
        output_dir: Directorio de salida
    """
    print("="*60)
    print("PIPELINE COMPLETO DE ANÁLISIS DE AUDIO")
    print("="*60)
    print(f"\nArchivo: {audio_path}")
    print(f"Salida: {output_dir}/\n")
    
    audio_name = Path(audio_path).stem
    Path(output_dir).mkdir(parents=True, exist_ok=True)
    
    # PASO 1: Transcripción
    print("\n" + "="*60)
    print("PASO 1/3: TRANSCRIPCIÓN")
    print("="*60 + "\n")
    
    transcription = transcribe_audio(audio_path, model_size, language, output_dir)
    transcription_json = os.path.join(output_dir, f"{audio_name}_transcription.json")
    
    # PASO 2: Diarización y etiquetado
    print("\n" + "="*60)
    print("PASO 2/3: DIARIZACIÓN Y ETIQUETADO")
    print("="*60 + "\n")
    
    labeled_segments = diarize_and_label(audio_path, transcription_json, output_dir)
    labeled_json = os.path.join(output_dir, f"{audio_name}_labeled.json")
    
    # PASO 3: Identificación (si hay audios de referencia)
    if os.path.exists(refs_dir) and any(Path(refs_dir).glob("*.wav")):
        print("\n" + "="*60)
        print("PASO 3/3: IDENTIFICACIÓN DE HABLANTES")
        print("="*60 + "\n")
        
        speaker_mapping = identify_speakers(labeled_json, audio_path, refs_dir, threshold, output_dir)
    else:
        print("\n" + "="*60)
        print("PASO 3/3: IDENTIFICACIÓN (OMITIDO)")
        print("="*60)
        print(f"\n⚠ No se encontraron audios de referencia en '{refs_dir}'")
        print("  Para identificar hablantes, coloca archivos WAV en esa carpeta con nombres descriptivos")
        print("  Ejemplo: refs/psicologo.wav, refs/paciente.wav")
    
    # Resumen final
    print("\n" + "="*60)
    print("✓ PROCESO COMPLETADO")
    print("="*60)
    print(f"\nArchivos generados en '{output_dir}/':")
    for file in sorted(Path(output_dir).glob(f"{audio_name}*")):
        print(f"  • {file.name}")
    print()

if __name__ == "__main__":
    # This script is locked to a single audio file by design.
    # To change the audio, edit this file and set `audio_path` accordingly.
    audio_path = os.path.join("recordings", "Test.wav")
    model_size = "small"
    language = "es"
    threshold = 0.75
    refs_dir = "refs"

    try:
        process_audio_complete(audio_path, model_size, language, refs_dir, threshold)
        print("="*60)
        print("✓ TODO COMPLETADO EXITOSAMENTE")
        print("="*60)
    except Exception as e:
        print(f"\n{'='*60}")
        print("⚠ ERROR EN EL PROCESO")
        print("="*60)
        print(f"\n{e}\n")
        import traceback
        traceback.print_exc()
        sys.exit(1)