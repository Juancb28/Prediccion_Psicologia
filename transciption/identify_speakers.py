"""
Identificación de hablantes usando enrollment (resemblyzer)
Compara las voces detectadas con audios de referencia
y reemplaza las etiquetas genéricas (SPEAKER_00, SPEAKER_01) por nombres reales
"""
import os
import json
import numpy as np
from pathlib import Path
from resemblyzer import VoiceEncoder, preprocess_wav
from pyannote.audio import Audio
import torch
from pyannote.core import Segment

def extract_speaker_embeddings(audio_path, labeled_segments, output_dir="outputs"):
    """
    Extrae embeddings de voz para cada hablante detectado
    
    Args:
        audio_path: Ruta al audio original
        labeled_segments: Segmentos etiquetados con speakers
        output_dir: Directorio de salida
    
    Returns:
        dict: {speaker_id: embedding_vector}
    """
    # print("Extrayendo embeddings de hablantes detectados...")
    
    encoder = VoiceEncoder()
    audio = Audio(sample_rate=16000, mono=True)
    
    # Agrupar segmentos por hablante
    speaker_segments = {}
    for seg in labeled_segments:
        spk = seg['speaker']
        if spk not in speaker_segments:
            speaker_segments[spk] = []
        speaker_segments[spk].append(seg)
    
    # Extraer embeddings
    speaker_embeddings = {}
    
    for speaker, segments in speaker_segments.items():
        print(f"  Procesando {speaker}...")
        
        # Tomar varios segmentos para mejor representación
        sample_segments = segments[:min(5, len(segments))]
        embeddings_list = []
        
        for seg in sample_segments:
            try:
                # Extraer el fragmento de audio
                # pyannote.Audio.crop expects a Segment (with .start/.end)
                segment = Segment(seg['start'], seg['end'])
                waveform, sample_rate = audio.crop(audio_path, segment)
                
                # Convertir a numpy y obtener embedding
                wav_np = waveform.squeeze().numpy()
                if len(wav_np) > 1600:  # Mínimo 0.1s a 16kHz
                    embedding = encoder.embed_utterance(wav_np)
                    embeddings_list.append(embedding)
            except Exception as e:
                print(f"    Advertencia: Error procesando segmento {seg['start']:.1f}s: {e}")
                continue
        
        if embeddings_list:
            # Promedio de embeddings
            speaker_embeddings[speaker] = np.mean(embeddings_list, axis=0)
            print(f"    ✓ Embedding generado ({len(embeddings_list)} segmentos)")
        else:
            print(f"    ⚠ No se pudo generar embedding")
    
    return speaker_embeddings

def load_reference_embeddings(refs_dir="refs"):
    """
    Carga embeddings de audios de referencia
    
    Args:
        refs_dir: Directorio con audios de referencia (WAV files)
    
    Returns:
        dict: {nombre: embedding_vector}
    """
    print(f"\nCargando audios de referencia desde '{refs_dir}'...")
    
    if not os.path.exists(refs_dir):
        print(f"⚠ Directorio '{refs_dir}' no encontrado")
        return {}
    
    encoder = VoiceEncoder()
    reference_embeddings = {}
    
    for file in Path(refs_dir).glob("*.wav"):
        name = file.stem  # nombre del archivo sin extensión
        print(f"  Procesando: {name}.wav")
        
        try:
            wav = preprocess_wav(str(file))
            embedding = encoder.embed_utterance(wav)
            reference_embeddings[name] = embedding
            print(f"    ✓ Embedding generado")
        except Exception as e:
            print(f"    ⚠ Error: {e}")
    
    return reference_embeddings

def identify_speakers(labeled_json_path, audio_path, refs_dir="refs", threshold=0.75, output_dir="outputs"):
    """
    Identifica hablantes comparando con audios de referencia
    
    Args:
        labeled_json_path: JSON con segmentos etiquetados
        audio_path: Ruta al audio original
        refs_dir: Directorio con audios de referencia
        threshold: Umbral de similitud (0-1, recomendado 0.75)
        output_dir: Directorio de salida
    
    Returns:
        dict: Mapeo de speaker_id -> nombre identificado
    """
    print("=== Identificación de Hablantes con Enrollment ===\n")
    
    # Cargar segmentos etiquetados
    with open(labeled_json_path, 'r', encoding='utf-8') as f:
        labeled_segments = json.load(f)
    
    # Extraer embeddings de hablantes detectados
    speaker_embeddings = extract_speaker_embeddings(audio_path, labeled_segments, output_dir)
    
    if not speaker_embeddings:
        print("⚠ No se pudieron extraer embeddings de hablantes")
        return {}
    
    # Cargar embeddings de referencia
    reference_embeddings = load_reference_embeddings(refs_dir)

    if not reference_embeddings:
        print("⚠ No hay audios de referencia para comparar")
        return {}

    # Buscar la referencia al psicólogo (archivo cuyo nombre contenga 'psicolog')
    psych_key = None
    for name in reference_embeddings.keys():
        if 'psicolog' in name.lower():
            psych_key = name
            break

    if psych_key is None:
        # Si no hay un archivo claramente etiquetado, tomar el primero pero avisar
        psych_key = next(iter(reference_embeddings.keys()))
        print(f"⚠ No se encontró referencia con 'psicolog' en el nombre. Usando '{psych_key}' como psicólogo.\n" +
              "(Para evitar ambigüedad, añade un archivo de referencia cuyo nombre contenga 'psicologo' o 'psicóloga')")

    psych_emb = reference_embeddings[psych_key]

    # Comparar solo contra la referencia del psicólogo. Si supera el umbral,
    # etiquetamos como el nombre del psicólogo; en caso contrario, etiquetamos
    # como 'OTRO'. Esto garantiza que solo se reconozca la voz del psicólogo.
    print("\n--- Identificando SOLO la voz del psicólogo ---")
    speaker_mapping = {}

    for speaker, spk_emb in speaker_embeddings.items():
        similarity = np.dot(spk_emb, psych_emb) / (np.linalg.norm(spk_emb) * np.linalg.norm(psych_emb))
        print(f"{speaker} vs {psych_key}: {similarity:.3f}")

        if similarity >= threshold:
            speaker_mapping[speaker] = psych_key
            print(f"  ✓ {speaker} identificado como {psych_key} (similitud: {similarity:.3f})")
        else:
            speaker_mapping[speaker] = 'OTRO'
            print(f"  ⚠ {speaker} marcado como OTRO (similitud: {similarity:.3f} < {threshold})")
    
    # Aplicar mapeo y guardar
    print("\n--- Generando transcripción identificada ---")
    audio_name = Path(audio_path).stem
    
    # Reemplazar speaker IDs por nombres
    identified_segments = []
    for seg in labeled_segments:
        new_seg = seg.copy()
        new_seg['speaker'] = speaker_mapping.get(seg['speaker'], seg['speaker'])
        identified_segments.append(new_seg)
    
    # Guardar JSON identificado
    output_json = os.path.join(output_dir, f"{audio_name}_identified.json")
    with open(output_json, 'w', encoding='utf-8') as f:
        json.dump({
            'segments': identified_segments,
            'speaker_mapping': speaker_mapping
        }, f, ensure_ascii=False, indent=2)
    print(f"✓ JSON identificado guardado: {output_json}")
    
    # Guardar TXT identificado
    output_txt = os.path.join(output_dir, f"{audio_name}_identified.txt")
    with open(output_txt, 'w', encoding='utf-8') as f:
        f.write("TRANSCRIPCIÓN CON HABLANTES IDENTIFICADOS\n")
        f.write("="*50 + "\n\n")
        
        current_speaker = None
        for seg in identified_segments:
            if seg['speaker'] != current_speaker:
                if current_speaker is not None:
                    f.write("\n\n")
                current_speaker = seg['speaker']
                f.write(f"【{seg['speaker']}】\n")
            
            f.write(f"[{seg['start']:.1f}s - {seg['end']:.1f}s] {seg['text']}\n")
        
        # Resumen
        speakers = set(seg['speaker'] for seg in identified_segments)
        f.write("\n" + "="*50 + "\n")
        f.write(f"HABLANTES IDENTIFICADOS: {len(speakers)}\n")
        for spk in sorted(speakers):
            count = sum(1 for seg in identified_segments if seg['speaker'] == spk)
            duration = sum(seg['end'] - seg['start'] for seg in identified_segments if seg['speaker'] == spk)
            f.write(f"  {spk}: {count} intervenciones, {duration:.1f}s total\n")
    
    print(f"✓ TXT identificado guardado: {output_txt}")
    
    # Resumen
    #print(f"\n--- Resumen de Identificación ---")
    for orig, identified in speaker_mapping.items():
        status = "✓ Identificado" if orig != identified else "⚠ No identificado"
        print(f"{orig} → {identified} ({status})")
    
    return speaker_mapping

if __name__ == "__main__":
    import sys
    
    if len(sys.argv) < 3:
        print("Uso: python identify_speakers.py <ruta_audio> <ruta_labeled_json> [umbral] [dir_refs]")
        print("Ejemplo: python identify_speakers.py recordings/test.wav outputs/test_labeled.json 0.75 refs")
        sys.exit(1)
    
    """
    Utiliza el patron de ejecucion 
    """
    audio_path = sys.argv[1]
    labeled_json = sys.argv[2]
    threshold = float(sys.argv[3]) if len(sys.argv) > 3 else 0.75
    refs_dir = sys.argv[4] if len(sys.argv) > 4 else "refs"
    
    try:
        identify_speakers(labeled_json, audio_path, refs_dir, threshold)
        print("\n✓ Identificación completada exitosamente")
    except Exception as e:
        print(f"\n⚠ Error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)