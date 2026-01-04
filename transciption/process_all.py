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
        print(f"\nNo se encontraron audios de referencia en '{refs_dir}'")
        print("  Para identificar hablantes, coloca archivos WAV en esa carpeta con nombres descriptivos")
        print("  Ejemplo: refs/psicologo.wav, refs/paciente.wav")
    
    # Resumen final
    print("\n" + "="*60)
    print("PROCESO COMPLETADO")
    print("="*60)
    print(f"\nArchivos generados en '{output_dir}/':")
    for file in sorted(Path(output_dir).glob(f"{audio_name}*")):
        print(f"  • {file.name}")
    print()

if __name__ == "__main__":
    # Accept command-line args to process any audio file in CI / server usage.
    # Usage: python process_all.py <audio_path> [model_size] [language] [refs_dir] [threshold] [output_dir]
    
    audio_path = None
    # audio_path = "D:/Software/Projects/AI _Project/Prediccion_Psicologia/recordings/Test.wav"
    model_size = "small"
    language = "es"
    refs_dir = "refs"
    threshold = 0.75
    output_dir = "outputs"

    if len(sys.argv) >= 2:
        audio_path = sys.argv[1]
    if len(sys.argv) >= 3:
        model_size = sys.argv[2]
    if len(sys.argv) >= 4:
        language = sys.argv[3]
    if len(sys.argv) >= 5:
        refs_dir = sys.argv[4]
    if len(sys.argv) >= 6:
        try:
            threshold = float(sys.argv[5])
        except Exception:
            pass
    if len(sys.argv) >= 7:
        output_dir = sys.argv[6]

    if not audio_path:
        print("Usage: python process_all.py <audio_path> [model_size] [language] [refs_dir] [threshold] [output_dir]")
        sys.exit(2)

    try:
        process_audio_complete(audio_path, model_size, language, refs_dir, threshold, output_dir)
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