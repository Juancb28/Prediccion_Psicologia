#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Script para generar genogramas desde línea de comandos
Uso: python generate_genogram.py <transcription_file> <output_file>
"""

import sys
import os
from pathlib import Path

# Agregar el directorio actual al path para importar genogram_model
sys.path.insert(0, str(Path(__file__).parent))

from genogram_model import GenogramGenerator

def main():
    if len(sys.argv) < 3:
        print("Uso: python generate_genogram.py <transcription_file> <output_file>")
        sys.exit(1)
    
    transcription_file = sys.argv[1]
    output_file = sys.argv[2]
    
    # Leer transcripción
    if not os.path.exists(transcription_file):
        print(f"Error: No se encontró el archivo {transcription_file}")
        sys.exit(1)
    
    with open(transcription_file, 'r', encoding='utf-8') as f:
        transcription = f.read()
    
    if not transcription.strip():
        print("Error: La transcripción está vacía")
        sys.exit(1)
    
    # API Key de Gemini (deberías usar variable de entorno en producción)
    API_KEY = os.environ.get('GEMINI_API_KEY', 'AIzaSyBpC1JV-hGJdBqXSBrY6SYksnAiz9uUreY')
    
    # Generar genograma
    try:
        generator = GenogramGenerator(api_key=API_KEY)
        output_path = generator.process_transcription(transcription, output_file)
        print(f"SUCCESS: {output_path}")
    except Exception as e:
        print(f"ERROR: {str(e)}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    main()
