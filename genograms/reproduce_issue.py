#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Script de reproducción para verificar la generación de genogramas con múltiples generaciones.
"""

import sys
import os
from pathlib import Path

# Agregar el directorio actual al path
sys.path.insert(0, str(Path(__file__).parent))

from genogram_model import GenogramGenerator

def reproduce():
    # Transcripción compleja: 3 generaciones + pareja + estados civiles
    transcripcion = """
    Hola, soy Ana. Mi abuelo materno se llama Roberto y mi abuela materna es Carmen. 
    Ellos son los padres de mi madre, Elena. 
    Mi padre se llama Carlos y está casado con Elena. 
    Yo tengo un hermano llamado Lucas. 
    Mi abuelo Roberto falleció hace 5 años. 
    Carlos y Elena tienen una relación de alianza buena.
    """
    
    # Intentar obtener API KEY del entorno o de .env
    from dotenv import load_dotenv
    env_path = Path(__file__).parent.parent / '.env'
    load_dotenv(dotenv_path=env_path)
    API_KEY = os.environ.get('GEMINI_API_KEY')
    
    print("🧪 Ejecutando reproducción con 3 generaciones...")
    
    try:
        generator = GenogramGenerator(api_key=API_KEY)
        # Forzar el renderizado a un archivo de prueba
        output_path = generator.process_transcription(
            transcripcion, 
            str(Path(__file__).parent / "reproduce_fix")
        )
        
        print(f"\n✅ Genograma generado: {output_path}")
        
        # Leer el HTML para verificar presencia de abuelos y relaciones
        with open(output_path, 'r', encoding='utf-8') as f:
            content = f.read()
            
        print("\n🔍 Verificando contenido del HTML:")
        if "Roberto" in content:
            print("  ✅ Abuelo Roberto encontrado en el SVG")
        else:
            print("  ❌ Abuelo Roberto NO encontrado")
            
        if "Carmen" in content:
            print("  ✅ Abuela Carmen encontrada en el SVG")
        else:
            print("  ❌ Abuela Carmen NO encontrada")
            
        if "<line" in content:
            print("  ✅ Líneas de relación encontradas")
        else:
            print("  ❌ No se encontraron líneas de relación")
            
    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    reproduce()
