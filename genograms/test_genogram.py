#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Script de prueba para verificar que el generador de genogramas funciona correctamente
"""

import sys
import os
from pathlib import Path

# Agregar el directorio actual al path
sys.path.insert(0, str(Path(__file__).parent))

from genogram_model import GenogramGenerator

def test_basic_genogram():
    """Prueba básica de generación de genograma"""
    
    # Transcripción de ejemplo
    transcripcion = """
    Hola, soy María González, tengo 35 años. Estoy casada con Pedro Martínez de 38 años.
    Tenemos dos hijos: Sofía de 10 años y Carlos de 7 años. 
    Mi esposo y yo tenemos una muy buena relación. 
    Sofía está en tratamiento por ansiedad.
    Mi madre, Carmen, tiene 65 años y vive con nosotros.
    Mi padre falleció hace 3 años.
    """
    
    API_KEY = os.environ.get('GEMINI_API_KEY', 'AIzaSyBpC1JV-hGJdBqXSBrY6SYksnAiz9uUreY')
    
    print("🧪 Iniciando prueba de generación de genograma...")
    print(f"📝 Transcripción: {len(transcripcion)} caracteres")
    print(f"📂 Directorio de trabajo: {Path.cwd()}")
    
    try:
        generator = GenogramGenerator(api_key=API_KEY)
        print("✅ Generador inicializado")
        
        # Verificar que la carpeta de iconos existe
        icons_path = generator.icons_path
        print(f"📁 Ruta de iconos: {icons_path}")
        print(f"   Existe: {icons_path.exists()}")
        
        if icons_path.exists():
            # Listar algunas subcarpetas
            subdirs = [d.name for d in icons_path.iterdir() if d.is_dir()]
            print(f"   Subcarpetas encontradas: {subdirs}")
        
        # Generar genograma
        print("\n🔄 Generando genograma...")
        output_path = generator.process_transcription(
            transcripcion, 
            str(Path(__file__).parent / "test_genogram")
        )
        
        print(f"\n✅ ¡Genograma generado exitosamente!")
        print(f"📄 Archivo: {output_path}")
        print(f"   Tamaño: {Path(output_path).stat().st_size} bytes")
        
        # Verificar que el archivo se creó
        if Path(output_path).exists():
            print("✅ El archivo HTML existe y se puede abrir en un navegador")
            print(f"   Para verlo, abre: file:///{output_path}")
        else:
            print("❌ El archivo no se creó correctamente")
            
    except Exception as e:
        print(f"\n❌ Error durante la prueba: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    test_basic_genogram()
