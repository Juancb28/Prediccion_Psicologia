import google.genai as genai
import json
import ast
import re
import time
import os
import base64
import datetime
from typing import Dict, List, Optional
from pathlib import Path

class GenogramGenerator:
    
    def __init__(self, api_key: Optional[str] = None, icons_path: str = None):
        # API key setup code...
        key = api_key or os.environ.get('GEMINI_API_KEY') or os.environ.get('GENAI_API_KEY') or os.environ.get('API_KEY')
        if not key:
            try:
                project_root = Path(__file__).resolve().parents[1]
                env_path = project_root / '.env'
                if env_path.exists():
                    with open(env_path, 'r', encoding='utf-8') as ef:
                        for line in ef:
                            line = line.strip()
                            if not line or line.startswith('#') or '=' not in line:
                                continue
                            k, v = line.split('=', 1)
                            k = k.strip()
                            v = v.strip().strip('"').strip("'")
                            if k not in os.environ:
                                os.environ[k] = v
                    key = os.environ.get('GEMINI_API_KEY') or os.environ.get('GENAI_API_KEY') or os.environ.get('API_KEY')
            except Exception:
                key = None

        self.client = genai.Client(api_key=key) if key else None
        self.model_name = 'models/gemini-2.5-flash'
        
        if icons_path is None:
            self.icons_path = Path(__file__).parent / 'icons_genograms'
        else:
            self.icons_path = Path(icons_path)
        
        self.svg_cache = {}
    
    def _render_person_fixed(self, persona: Dict, x: float, y: float, size: float) -> str:
        """Renderiza una persona en el genograma con posicionamiento correcto"""
        nombre = persona.get('nombre', '???')
        edad = persona.get('edad')
        ocupacion = persona.get('ocupacion', '')
        genero = persona.get('genero', 'masculino')
        vivo = persona.get('vivo', True)
        condiciones = persona.get('condiciones', [])
        
        # Si no hay ocupación, usar notas
        if not ocupacion:
            notas = persona.get('notas', '')
            if notas and len(notas) < 30:
                ocupacion = notas
        
        # Forma base
        if genero == 'femenino':
            shape = f'<circle cx="{size/2}" cy="{size/2}" r="{size/2}" fill="white" stroke="black" stroke-width="2"/>'
        else:
            shape = f'<rect x="0" y="0" width="{size}" height="{size}" fill="white" stroke="black" stroke-width="2"/>'
        
        # Marca de muerte
        death_mark = ''
        if not vivo:
            if genero == 'femenino':
                death_mark = f'<line x1="{size/2 - 15}" y1="{size/2 - 15}" x2="{size/2 + 15}" y2="{size/2 + 15}" stroke="black" stroke-width="2"/><line x1="{size/2 + 15}" y1="{size/2 - 15}" x2="{size/2 - 15}" y2="{size/2 + 15}" stroke="black" stroke-width="2"/>'
            else:
                death_mark = f'<line x1="5" y1="5" x2="{size-5}" y2="{size-5}" stroke="black" stroke-width="2"/><line x1="{size-5}" y1="5" x2="5" y2="{size-5}" stroke="black" stroke-width="2"/>'
        
        # Nombre (coordenadas ABSOLUTAS para posicionar en x,y)
      nombre_svg_lines = []
        if len(nombre) > 15:
            palabras = nombre.split()
            mid = len(palabras) // 2
            nombre_lines = [' '.join(palabras[:mid]), ' '.join(palabras[mid:])]
        else:
            nombre_lines = [nombre]
        
        for i, line in enumerate(nombre_lines):
            line_y = y - 8 - (len(nombre_lines) - 1 - i) * 15
            nombre_svg_lines.append(f'<text x="{x + size/2}" y="{line_y}" text-anchor="middle" font-size="14" font-family="Arial" font-weight="bold" fill="#000">{line}</text>')
        nombre_svg = '\n'.join(nombre_svg_lines)
        
        # Edad (dentro del símbolo, coordenadas ABSOLUTAS)
        edad_svg = ''
        if edad:
            edad_svg = f'<text x="{x + size/2}" y="{y + size/2 + 6}" text-anchor="middle" font-size="18" font-family="Arial" font-weight="bold" fill="#000">{edad}</text>'
        
        # Ocupación (debajo, coordenadas ABSOLUTAS)
        ocupacion_svg = ''
        if ocupacion:
            ocupacion_text = ocupacion[:25] + ('...' if len(ocupacion) > 25 else '')
            ocupacion_svg = f'<text x="{x + size/2}" y="{y + size + 18}" text-anchor="middle" font-size="11" font-family="Arial" fill="#666">{ocupacion_text}</text>'
        
        # Consultante (doble borde, coordenadas ABSOLUTAS)
        consultante_mark = ''
        if 'consultante' in condiciones:
            if genero == 'femenino':
                consultante_mark = f'<circle cx="{x + size/2}" cy="{y + size/2}" r="{size/2 + 5}" fill="none" stroke="black" stroke-width="2.5"/>'
            else:
                consultante_mark = f'<rect x="{x - 5}" y="{y - 5}" width="{size + 10}" height="{size + 10}" fill="none" stroke="black" stroke-width="2.5"/>'
        
        # Combinar el contenido interno
        inner_content = shape
        if death_mark:
            inner_content += '\n' + death_mark
        
        # CLAVE: Usar transform="translate({x},{y})" solo para el símbolo interno
        # Textos y marcas usan coordenadas absolutas
        svg_output = f'''<g id="person-{persona["id"]}">
{nombre_svg}
<g transform="translate({x},{y})">
{inner_content}
</g>
{edad_svg}
{ocupacion_svg}
{consultante_mark}
</g>
'''
        return svg_output
