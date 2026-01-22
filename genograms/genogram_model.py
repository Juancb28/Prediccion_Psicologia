import google.generativeai as genai
import json
import re
import os
import base64
from typing import Dict, List, Optional
from pathlib import Path

class GenogramGenerator:
    
    def __init__(self, api_key: str, icons_path: str = None):
        genai.configure(api_key=api_key)
        self.model = genai.GenerativeModel('models/gemini-2.5-flash')
        
        # Ruta a los iconos SVG
        if icons_path is None:
            self.icons_path = Path(__file__).parent / 'icons_genograms'
        else:
            self.icons_path = Path(icons_path)
        
        # Cache de SVGs cargados
        self.svg_cache = {}
    
    def extract_family_info(self, transcription: str) -> Dict:
        prompt = f"""
        Analiza la siguiente transcripción (que puede incluir múltiples sesiones de terapia) y extrae la información familiar acumulada para crear un genograma completo.
        
        Transcripciones:
        {transcription}
        
        Extrae la siguiente información estrictamente en formato JSON:
        {{
            "personas": [
                {{
                    "id": "identificador_único",
                    "nombre": "nombre completo",
                    "genero": "masculino/femenino",
                    "edad": edad_o_null,
                    "vivo": true/false,
                    "orientacion": "heterosexual/gay/lesbiana/bisexual/trans/otro" (si se menciona),
                    "condiciones": ["consultante", "enfermedad", "consumo", "tratamiento", "diagnostico_fijo", "diagnostico_presuntivo", "muerte", "embarazada", "padre_soltero", "madre_soltera"] (lista de condiciones que apliquen),
                    "notas": "información adicional relevante"
                }}
            ],
            "relaciones": [
                {{
                    "tipo": "pareja/padre-hijo/hermanos/gemelos",
                    "persona1_id": "id_persona1",
                    "persona2_id": "id_persona2",
                    "estado_civil": "casados/union_libre_legalizado/union_libre_novios/divorciado/separado" (solo para parejas),
                    "calidad_relacion": "alianza_buena/conflictiva_violenta/distante/nibuena_nimala/toxica_simbiotica/abuso_sexual_violacion" (si se menciona),
                    "notas": "información adicional"
                }}
            ]
        }}
        
        Reglas importantes:
        - Responde UNICAMENTE con el objeto JSON.
        - Usa IDs únicos y descriptivos (ej: "juan_garcia").
        - Para relaciones padres-hijos usa tipo "padre-hijo" (persona1 es el padre/madre).
        - Si no hay información de edad, usa null.
        - Identifica si la persona es el consultante (paciente que habla).
        - Detecta condiciones como enfermedades, consumo de sustancias, tratamientos.
        
        Reglas de Simbología y Contexto (para tu comprensión de atributos):
        - Sexo y edad: El símbolo de cuadrado representa al sexo masculino, y es válido tanto para hombres adultos como para niños. El símbolo de círculo representa al sexo femenino.
        - Orientación sexual: Cuando un individuo de sexo masculino es identificado como gay, se debe registrar 'gay' en orientacion. Esto aplica independientemente de la edad (niño o adulto).
        - Consistencia semántica: Toda referencia a “hombre” puede interpretarse también como “niño”.
        
        Asegúrate de extraer fielmente la orientación sexual si se menciona explícitamente.
        """

        response = self.model.generate_content(prompt)
        
        response_text = response.text
        # Clean markdown code blocks if present
        if '```json' in response_text:
            response_text = response_text.split('```json')[1].split('```')[0]
        elif '```' in response_text:
            response_text = response_text.split('```')[1].split('```')[0]
            
        json_match = re.search(r'\{[\s\S]*\}', response_text)
        
        if json_match:
            data = json.loads(json_match.group())
            # DEBUG: Print the extracted JSON to stdout so we can see it in server logs
            print("DEBUG JSON FROM GEMINI:")
            print(json.dumps(data, indent=2, ensure_ascii=False))
            return data
        else:
            print(f"DEBUG RAW RESPONSE: {response_text}")
            raise ValueError("No se pudo extraer información estructurada de la respuesta de Gemini")

    
    def load_svg(self, path: str) -> str:
        """Carga un archivo SVG y lo retorna como string"""
        if path in self.svg_cache:
            return self.svg_cache[path]
        
        full_path = self.icons_path / path
        if not full_path.exists():
            print(f"Advertencia: No se encontró el SVG en {full_path}")
            return ""
        
        with open(full_path, 'r', encoding='utf-8') as f:
            content = f.read()
            self.svg_cache[path] = content
            return content
    
    def get_person_icon_path(self, persona: Dict) -> str:
        """Determina qué icono SVG usar para una persona"""
        genero = persona.get('genero', 'masculino')
        edad = persona.get('edad')
        condiciones = persona.get('condiciones', [])
        orientacion = str(persona.get('orientacion', 'heterosexual')).lower()
        
        # Determinar carpeta base
        carpeta = 'hombre_nino' if genero == 'masculino' else 'mujer_nina'
        
        # Prioridad de condiciones
        if not persona.get('vivo', True):
            return f"{carpeta}/{carpeta.split('_')[0]}_muerte.svg"
        
        if 'consultante' in condiciones:
            return f"{carpeta}/{carpeta.split('_')[0]}_consultante_identificado.svg"
        
        if 'diagnostico_fijo' in condiciones:
            return f"{carpeta}/{carpeta.split('_')[0]}_diagnostico_fijo.svg"
        
        if 'diagnostico_presuntivo' in condiciones:
            return f"{carpeta}/{carpeta.split('_')[0]}_diagnostico_presuntivo.svg"
        
        if 'tratamiento' in condiciones and 'consumo' in condiciones:
            return f"{carpeta}/{carpeta.split('_')[0]}_diagnostico_enfermedad_tratamiento_consumo_tratamiento.svg"
        
        if 'enfermedad' in condiciones and 'consumo' in condiciones:
            return f"{carpeta}/{carpeta.split('_')[0]}_enfermedad_consumo.svg"
        
        if 'diagnostico_definitivo' in condiciones and 'consumo' in condiciones:
            return f"{carpeta}/{carpeta.split('_')[0]}_diagnostico_definitivo_consumo.svg"
        
        if (orientacion == 'gay' or orientacion == 'homosexual') and 'consumo' in condiciones:
            return f"{carpeta}/hombre_gay_consumo.svg"
        
        if (orientacion == 'lesbiana' or orientacion == 'homosexual') and 'consumo' in condiciones and genero == 'femenino':
             return f"{carpeta}/mujer_lesbiana_consumo.svg"
        
        if orientacion == 'gay' or orientacion == 'homosexual':
            return f"{carpeta}/hombre_gay.svg"
        
        if orientacion == 'lesbiana' or (orientacion == 'homosexual' and genero == 'femenino'):
            return f"{carpeta}/mujer_lesbiana.svg"
        
        if orientacion == 'bisexual':
            return f"{carpeta}/{carpeta.split('_')[0]}_bisexual.svg"
        
        if orientacion == 'trans':
            return f"{carpeta}/{carpeta.split('_')[0]}_trans.svg"
        
        if 'madre_soltera' in condiciones:
            return f"{carpeta}/mujer_madre_soltera.svg"
        
        if 'padre_soltero' in condiciones:
            return f"{carpeta}/hombre_padre_soltero.svg"
        
        if 'embarazada' in condiciones:
            return f"{carpeta}/mujer_nina _embarazada.svg"
        
        if 'tratamiento' in condiciones:
            return f"{carpeta}/{carpeta.split('_')[0]}_tratamiento.svg"
        
        if 'consumo' in condiciones:
            return f"{carpeta}/{carpeta.split('_')[0]}_presuncion_consumo_sustancias.svg"
        
        # Por defecto, usar el icono básico (niño si edad < 18, adulto si no)
        if edad and edad < 18:
            return f"{carpeta}/{carpeta.split('_')[0]}_nino.svg" if genero == 'masculino' else f"{carpeta}/mujer_nina.svg"
        
        # Si no hay edad especificada, usar icono adulto genérico
        return f"{carpeta}/{carpeta.split('_')[0]}_nino.svg" if genero == 'masculino' else f"{carpeta}/mujer_nina.svg"
    
    def get_relation_icon_path(self, relacion: Dict) -> str:
        """Determina qué icono usar para una relación"""
        tipo = relacion.get('tipo')
        estado_civil = relacion.get('estado_civil')
        calidad = relacion.get('calidad_relacion')
        
        # Para parejas, priorizar estado civil
        if tipo == 'pareja' and estado_civil:
            if estado_civil == 'casados':
                return 'estado_civil/casados/casados_horizontal.svg'
            elif estado_civil == 'union_libre_legalizado':
                return 'estado_civil/union_libre_legalizado/union_libre_legalizado.svg'
            elif estado_civil == 'union_libre_novios':
                return 'estado_civil/union_libre_novios/union_libre_novios_horizontal.svg'
            elif estado_civil == 'divorciado':
                return 'estado_civil/divorciado/divorciado.svg'
            elif estado_civil == 'separado':
                return 'estado_civil/separado/separado.svg'
        
        # Para calidad de relación
        if calidad:
            if calidad == 'alianza_buena':
                return 'relaciones/relacion_alianza_buena/relacion_alianza_buena_horizontal.svg'
            elif calidad == 'conflictiva_violenta':
                return 'relaciones/relacion_conflictiva_violenta/relacion_conflictiva_violenta.svg'
            elif calidad == 'distante':
                return 'relaciones/relacion_distante/relacion_distante_horizontal.svg'
            elif calidad == 'nibuena_nimala':
                return 'relaciones/relacion_nibuena_nimala/relacion_nibuena_nimala_horizontal.svg'
            elif calidad == 'toxica_simbiotica':
                return 'relaciones/relacion_toxica_simbiotica/relacion_toxica_simbiotica_horizontal.svg'
            elif calidad == 'abuso_sexual_violacion':
                # Buscar archivo que existe
                base_path = 'relaciones/relacion_abuso_sexual_violacion/relacion_abuso_sexual_violacion'
                # Probar diferentes variaciones
                for suffix in ['_horizontal.svg', '.svg', '_h.svg']:
                    test_path = base_path.replace('.svg', '') + suffix
                    if (self.icons_path / test_path).exists():
                        return test_path
                return base_path + '.svg'  # fallback
        
        # Relaciones padre-hijo
        if tipo == 'padre-hijo':
            return 'parentesco/hijos/hijo_izq.svg'  # Por defecto
        
        # Gemelos
        if tipo == 'gemelos':
            return 'parentesco/gemelos/gemelos.svg'
        
        return None
    
    def create_genogram(self, family_data: Dict, output_file: str = "genograma") -> str:
        """Genera un HTML interactivo con el genograma usando SVGs personalizados"""
        
        personas = family_data.get('personas', [])
        relaciones = family_data.get('relaciones', [])
        
        if not personas:
            raise ValueError("No hay personas en los datos familiares")
        
        # Constantes de diseño (ajustadas para mejor visualización)
        ICON_SIZE = 60
        SPACING_X = 140
        SPACING_Y = 180
        COUPLE_SPACING = 80  # Espacio entre parejas
        START_X = 100
        START_Y = 100
        
        # Organizar personas por generaciones y familias nucleares
        estructura = self._organize_family_structure(personas, relaciones)
        
        # Calcular posiciones basadas en la estructura familiar
        posiciones = self._calculate_positions(estructura, ICON_SIZE, SPACING_X, SPACING_Y, COUPLE_SPACING, START_X, START_Y)
        
        # Calcular dimensiones del SVG
        max_x = max([pos['x'] for pos in posiciones.values()], default=START_X) + ICON_SIZE + 200
        max_y = max([pos['y'] for pos in posiciones.values()], default=START_Y) + ICON_SIZE + 200
        
        # Construir SVG
        svg_content = f'<svg id="genogram-svg" width="{max_x}" height="{max_y}" xmlns="http://www.w3.org/2000/svg">\n'
        
        # Fondo
        svg_content += f'  <rect width="100%" height="100%" fill="#ffffff"/>\n'
        
        # Dibujar relaciones primero (para que queden detrás)
        svg_content += '  <!-- Relaciones -->\n'
        svg_content += self._render_all_relations(relaciones, posiciones, personas, ICON_SIZE)
        
        # Dibujar personas
        svg_content += '  <!-- Personas -->\n'
        for persona in personas:
            persona_id = persona['id']
            if persona_id in posiciones:
                pos = posiciones[persona_id]
                svg_content += self._render_person(persona, pos['x'], pos['y'], ICON_SIZE)
        
        svg_content += '</svg>\n'
        
        # Crear HTML completo con svg-pan-zoom
        html_content = f'''<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Genograma Familiar</title>
    <script src="https://cdn.jsdelivr.net/npm/svg-pan-zoom@3.6.1/dist/svg-pan-zoom.min.js"></script>
    <style>
        body {{
            margin: 0;
            padding: 20px;
            font-family: Arial, sans-serif;
            background: #f0f0f0;
        }}
        #genogram-container {{
            background: white;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            padding: 20px;
            max-width: 100%;
            overflow: hidden;
        }}
        #genogram-svg {{
            border: 1px solid #ddd;
            cursor: move;
        }}
        .controls {{
            margin-bottom: 15px;
            display: flex;
            gap: 10px;
        }}
        button {{
            padding: 10px 20px;
            background: #4CAF50;
            color: white;
            border: none;
            border-radius: 5px;
            cursor: pointer;
            font-size: 14px;
        }}
        button:hover {{
            background: #45a049;
        }}
        h1 {{
            margin-top: 0;
            color: #333;
        }}
    </style>
</head>
<body>
    <div id="genogram-container">
        <h1>📊 Genograma Familiar</h1>
        <div class="controls">
            <button onclick="panZoom.zoomIn()">🔍 Zoom In</button>
            <button onclick="panZoom.zoomOut()">🔍 Zoom Out</button>
            <button onclick="panZoom.reset()">🔄 Reset</button>
            <button onclick="panZoom.fit()">📐 Ajustar</button>
        </div>
        {svg_content}
    </div>
    <script>
        var panZoom = svgPanZoom('#genogram-svg', {{
            zoomEnabled: true,
            controlIconsEnabled: false,
            fit: true,
            center: true,
            minZoom: 0.5,
            maxZoom: 10
        }});
    </script>
</body>
</html>'''
        
        # Guardar archivo
        output_path = f"{output_file}.html"
        with open(output_path, 'w', encoding='utf-8') as f:
            f.write(html_content)
        
        return output_path
    
    def _organize_family_structure(self, personas: List[Dict], relaciones: List[Dict]) -> Dict:
        """Organiza la estructura familiar en generaciones con parejas agrupadas"""
        # Crear mapas de relaciones
        parejas = {}  # {persona_id: pareja_id}
        hijos_de = {}  # {padre_id: [hijo_ids]}
        padres_de = {}  # {hijo_id: [padre_ids]}
        
        for rel in relaciones:
            if rel['tipo'] == 'pareja':
                p1, p2 = rel['persona1_id'], rel['persona2_id']
                parejas[p1] = p2
                parejas[p2] = p1
            elif rel['tipo'] == 'padre-hijo':
                padre, hijo = rel['persona1_id'], rel['persona2_id']
                if padre not in hijos_de:
                    hijos_de[padre] = []
                hijos_de[padre].append(hijo)
                if hijo not in padres_de:
                    padres_de[hijo] = []
                padres_de[hijo].append(padre)
        
        # Encontrar generación raíz (personas sin padres)
        personas_con_padres = set(padres_de.keys())
        raices = [p['id'] for p in personas if p['id'] not in personas_con_padres]
        
        if not raices:
            raices = [personas[0]['id']]  # Usar primera persona si no hay raíces claras
        
        # Organizar en generaciones
        generaciones = []
        procesadas = set()
        generacion_actual = raices
        
        while generacion_actual:
            # Agrupar parejas en esta generación
            gen_grupos = []
            pendientes = list(generacion_actual)
            
            while pendientes:
                persona_id = pendientes.pop(0)
                if persona_id in procesadas:
                    continue
                    
                # Verificar si tiene pareja
                if persona_id in parejas:
                    pareja_id = parejas[persona_id]
                    if pareja_id in pendientes:
                        pendientes.remove(pareja_id)
                        gen_grupos.append([persona_id, pareja_id])
                        procesadas.add(persona_id)
                        procesadas.add(pareja_id)
                    else:
                        gen_grupos.append([persona_id])
                        procesadas.add(persona_id)
                else:
                    gen_grupos.append([persona_id])
                    procesadas.add(persona_id)
            
            generaciones.append(gen_grupos)
            
            # Encontrar siguiente generación (hijos)
            siguiente = []
            for persona_id in generacion_actual:
                if persona_id in hijos_de:
                    for hijo_id in hijos_de[persona_id]:
                        if hijo_id not in procesadas and hijo_id not in siguiente:
                            siguiente.append(hijo_id)
            
            generacion_actual = siguiente
        
        # Agregar personas no procesadas
        no_procesadas = [p['id'] for p in personas if p['id'] not in procesadas]
        if no_procesadas:
            generaciones.append([[pid] for pid in no_procesadas])
        
        return {'generaciones': generaciones, 'parejas': parejas, 'hijos_de': hijos_de, 'padres_de': padres_de}
    
    def _calculate_positions(self, estructura: Dict, icon_size: float, spacing_x: float, spacing_y: float, couple_spacing: float, start_x: float, start_y: float) -> Dict:
        """Calcula posiciones para cada persona basándose en la estructura familiar"""
        posiciones = {}
        generaciones = estructura['generaciones']
        
        for gen_idx, grupos in enumerate(generaciones):
            y = start_y + (gen_idx * spacing_y)
            
            # Calcular ancho total de la generación
            ancho_total = 0
            for grupo in grupos:
                if len(grupo) == 2:
                    ancho_total += couple_spacing
                else:
                    ancho_total += icon_size
                ancho_total += spacing_x  # Espacio entre grupos
            
            # Centrar la generación
            x_actual = start_x + (800 - ancho_total) / 2  # 800 es un ancho aproximado del canvas
            
            for grupo in grupos:
                if len(grupo) == 2:
                    # Pareja: colocar lado a lado
                    posiciones[grupo[0]] = {'x': x_actual, 'y': y}
                    posiciones[grupo[1]] = {'x': x_actual + couple_spacing, 'y': y}
                    x_actual += couple_spacing + spacing_x
                else:
                    # Persona sola
                    posiciones[grupo[0]] = {'x': x_actual, 'y': y}
                    x_actual += icon_size + spacing_x
        
        return posiciones
    
    def _render_all_relations(self, relaciones: List[Dict], posiciones: Dict, personas: List[Dict], icon_size: float) -> str:
        """Renderiza todas las relaciones con líneas apropiadas según el tipo"""
        svg = ''
        parejas_procesadas = set()
        
        # Agrupar información de relaciones
        hijos_por_padre = {}   # {padre_id: [hijo_ids]}
        parejas = {}           # {persona1_id: persona2_id}
        
        # Identificar parejas
        for rel in relaciones:
            if rel.get('tipo') == 'pareja':
                p1, p2 = rel['persona1_id'], rel['persona2_id']
                parejas[p1] = p2
                parejas[p2] = p1
        
        # Agrupar hijos por padres
        for rel in relaciones:
            if rel.get('tipo') == 'padre-hijo':
                padre_id = rel['persona1_id']
                hijo_id = rel['persona2_id']
                
                if padre_id not in hijos_por_padre:
                    hijos_por_padre[padre_id] = []
                hijos_por_padre[padre_id].append(hijo_id)
        
        # Dibujar líneas de pareja (con líneas verticales desde cada uno)
        for rel in relaciones:
            if rel.get('tipo') == 'pareja':
                p1_id = rel['persona1_id']
                p2_id = rel['persona2_id']
                
                if p1_id not in posiciones or p2_id not in posiciones:
                    continue
                
                key = tuple(sorted([p1_id, p2_id]))
                if key in parejas_procesadas:
                    continue
                parejas_procesadas.add(key)
                
                p1_pos = posiciones[p1_id]
                p2_pos = posiciones[p2_id]
                
                # Centros de las figuras (en la parte inferior)
                x1 = p1_pos['x'] + icon_size / 2
                y1 = p1_pos['y'] + icon_size  # Parte inferior de la figura
                x2 = p2_pos['x'] + icon_size / 2
                y2 = p2_pos['y'] + icon_size  # Parte inferior de la figura
                
                # Distancia de separación (líneas verticales desde cada padre)
                separation = 20
                linea_pareja_y = max(y1, y2) + separation
                
                # Línea vertical desde persona 1 hacia abajo
                svg += f'  <line x1="{x1}" y1="{y1}" x2="{x1}" y2="{linea_pareja_y}" stroke="black" stroke-width="2"/>\n'
                
                # Línea vertical desde persona 2 hacia abajo
                svg += f'  <line x1="{x2}" y1="{y2}" x2="{x2}" y2="{linea_pareja_y}" stroke="black" stroke-width="2"/>\n'
                
                # Línea horizontal conectando las dos líneas verticales
                svg += f'  <line x1="{x1}" y1="{linea_pareja_y}" x2="{x2}" y2="{linea_pareja_y}" stroke="black" stroke-width="2"/>\n'
                
                # Si tienen hijos, dibujar conexiones
                hijos = []
                if p1_id in hijos_por_padre:
                    hijos.extend(hijos_por_padre[p1_id])
                if p2_id in hijos_por_padre:
                    for hijo in hijos_por_padre[p2_id]:
                        if hijo not in hijos:
                            hijos.append(hijo)
                
                if hijos:
                    hijos_validos = [h for h in hijos if h in posiciones]
                    
                    if hijos_validos:
                        # Punto medio de la línea de pareja
                        mid_x = (x1 + x2) / 2
                        
                        # Calcular la posición de la línea horizontal de hijos (arriba de los hijos)
                        min_hijo_y = min([posiciones[h]['y'] for h in hijos_validos])
                        linea_hijos_y = min_hijo_y - 30  # 30px arriba del hijo más alto
                        
                        # Línea vertical desde el punto medio de la pareja hasta la línea de hijos
                        svg += f'  <line x1="{mid_x}" y1="{linea_pareja_y}" x2="{mid_x}" y2="{linea_hijos_y}" stroke="black" stroke-width="2"/>\n'
                        
                        # Si hay múltiples hijos, dibujar línea horizontal entre ellos
                        if len(hijos_validos) > 1:
                            hijo_xs = [posiciones[h]['x'] + icon_size/2 for h in hijos_validos]
                            min_x = min(hijo_xs)
                            max_x = max(hijo_xs)
                            svg += f'  <line x1="{min_x}" y1="{linea_hijos_y}" x2="{max_x}" y2="{linea_hijos_y}" stroke="black" stroke-width="2"/>\n'
                        else:
                            # Si hay un solo hijo, dibujar una pequeña línea horizontal en el punto de conexión
                            hijo_x = posiciones[hijos_validos[0]]['x'] + icon_size / 2
                            svg += f'  <line x1="{mid_x}" y1="{linea_hijos_y}" x2="{hijo_x}" y2="{linea_hijos_y}" stroke="black" stroke-width="2"/>\n'
                        
                        # Líneas verticales desde cada hijo hacia arriba hasta la línea horizontal
                        for hijo_id in hijos_validos:
                            hijo_x = posiciones[hijo_id]['x'] + icon_size / 2
                            hijo_y = posiciones[hijo_id]['y']
                            svg += f'  <line x1="{hijo_x}" y1="{hijo_y}" x2="{hijo_x}" y2="{linea_hijos_y}" stroke="black" stroke-width="2"/>\n'
        
        # Dibujar líneas para padres solteros con hijos
        padres_en_pareja = set(parejas.keys())
        for padre_id, hijos in hijos_por_padre.items():
            if padre_id in padres_en_pareja:
                continue  # Ya procesado con la pareja
            
            if padre_id not in posiciones:
                continue
            
            padre_pos = posiciones[padre_id]
            padre_x = padre_pos['x'] + icon_size / 2
            padre_y = padre_pos['y'] + icon_size  # Parte inferior
            
            hijos_validos = [h for h in hijos if h in posiciones]
            if not hijos_validos:
                continue
            
            # Calcular la posición de la línea horizontal de hijos
            min_hijo_y = min([posiciones[h]['y'] for h in hijos_validos])
            linea_hijos_y = min_hijo_y - 30
            
            # Línea vertical desde el padre hacia la línea de hijos
            svg += f'  <line x1="{padre_x}" y1="{padre_y}" x2="{padre_x}" y2="{linea_hijos_y}" stroke="black" stroke-width="2"/>\n'
            
            # Si hay múltiples hijos, dibujar línea horizontal entre ellos
            if len(hijos_validos) > 1:
                hijo_xs = [posiciones[h]['x'] + icon_size/2 for h in hijos_validos]
                min_x = min(hijo_xs)
                max_x = max(hijo_xs)
                svg += f'  <line x1="{min_x}" y1="{linea_hijos_y}" x2="{max_x}" y2="{linea_hijos_y}" stroke="black" stroke-width="2"/>\n'
            else:
                # Si hay un solo hijo, dibujar línea horizontal hasta el hijo
                hijo_x = posiciones[hijos_validos[0]]['x'] + icon_size / 2
                svg += f'  <line x1="{padre_x}" y1="{linea_hijos_y}" x2="{hijo_x}" y2="{linea_hijos_y}" stroke="black" stroke-width="2"/>\n'
            
            # Líneas verticales desde cada hijo hacia arriba
            for hijo_id in hijos_validos:
                hijo_x = posiciones[hijo_id]['x'] + icon_size / 2
                hijo_y = posiciones[hijo_id]['y']
                svg += f'  <line x1="{hijo_x}" y1="{hijo_y}" x2="{hijo_x}" y2="{linea_hijos_y}" stroke="black" stroke-width="2"/>\n'
        
        return svg
    
    def _organize_generations(self, personas: List[Dict], relaciones: List[Dict]) -> List[List[str]]:
        """Organiza personas en generaciones basándose en relaciones padre-hijo"""
        generaciones = []
        personas_procesadas = set()
        
        # Encontrar raíces (personas sin padres)
        personas_con_padres = set()
        for rel in relaciones:
            if rel['tipo'] == 'padre-hijo':
                personas_con_padres.add(rel['persona2_id'])
        
        raices = [p['id'] for p in personas if p['id'] not in personas_con_padres]
        
        if not raices:
            # Si no hay raíces claras, usar todas las personas en una sola generación
            return [[p['id'] for p in personas]]
        
        # BFS para organizar por generaciones
        generacion_actual = raices
        
        while generacion_actual:
            generaciones.append(generacion_actual)
            personas_procesadas.update(generacion_actual)
            
            # Encontrar hijos de la generación actual
            siguiente_generacion = []
            for rel in relaciones:
                if rel['tipo'] == 'padre-hijo' and rel['persona1_id'] in generacion_actual:
                    hijo_id = rel['persona2_id']
                    if hijo_id not in personas_procesadas and hijo_id not in siguiente_generacion:
                        siguiente_generacion.append(hijo_id)
            
            generacion_actual = siguiente_generacion
        
        # Agregar personas no procesadas
        no_procesadas = [p['id'] for p in personas if p['id'] not in personas_procesadas]
        if no_procesadas:
            generaciones.append(no_procesadas)
        
        return generaciones
    
    def _render_person(self, persona: Dict, x: float, y: float, size: float) -> str:
        """Renderiza una persona con su icono SVG y datos"""
        genero = persona.get('genero', 'masculino')
        nombre = persona.get('nombre') or 'Sin nombre'
        edad = persona.get('edad')
        vivo = persona.get('vivo', True)
        orientacion = str(persona.get('orientacion', 'heterosexual')).lower()
        
        # Símbolo de orientación sexual (triángulo invertido para gay/homosexual)
        orientation_mark = ''
        if orientacion in ['gay', 'homosexual', 'lesbiana']:
             # Triángulo invertido dentro de la figura
             # Scaling relative to size (which is usually around 60)
             p1 = f"{size*0.2},{size*0.25}" # Top-left
             p2 = f"{size*0.8},{size*0.25}" # Top-right
             p3 = f"{size*0.5},{size*0.85}" # Bottom-center
             orientation_mark = f'<polygon points="{p1} {p2} {p3}" fill="none" stroke="black" stroke-width="1.5"/>'
        
        # Determinar forma base: círculo para mujer, cuadrado para hombre
        if genero == 'femenino':
            shape = f'<circle cx="{size/2}" cy="{size/2}" r="{size/2}" fill="white" stroke="black" stroke-width="2"/>'
        else:
            shape = f'<rect width="{size}" height="{size}" fill="white" stroke="black" stroke-width="2"/>'
        
        # Si no está vivo, agregar X
        death_mark = ''
        if not vivo:
            death_mark = f'<line x1="0" y1="0" x2="{size}" y2="{size}" stroke="black" stroke-width="2"/><line x1="{size}" y1="0" x2="0" y2="{size}" stroke="black" stroke-width="2"/>'
        
        # Texto del nombre (arriba de la figura)
        text_y_nombre = y - 10
        nombre_lines = []
        # Dividir nombre si es muy largo
        if len(nombre) > 15:
            palabras = nombre.split()
            nombre_lines = [' '.join(palabras[:len(palabras)//2]), ' '.join(palabras[len(palabras)//2:])]
        else:
            nombre_lines = [nombre]
        
        nombre_svg = ''
        for i, line in enumerate(nombre_lines):
            line_y = text_y_nombre - (len(nombre_lines) - 1 - i) * 14
            nombre_svg += f'<text x="{x + size/2}" y="{line_y}" text-anchor="middle" font-size="11" font-family="Arial" font-weight="bold">{line}</text>\n'
        
        # Edad y otros datos (debajo de la figura)
        text_y_edad = y + size + 15
        edad_svg = ''
        if edad:
            edad_svg = f'<text x="{x + size/2}" y="{text_y_edad}" text-anchor="middle" font-size="10" font-family="Arial">{edad} años</text>\n'
        
        # Información adicional (ocupación, estado)
        info_lines = []
        notas = persona.get('notas', '')
        if notas and len(notas) < 30:
            info_lines.append(notas[:25])
        
        info_svg = ''
        for i, line in enumerate(info_lines):
            line_y = text_y_edad + 14 * (i + 1)
            info_svg += f'<text x="{x + size/2}" y="{line_y}" text-anchor="middle" font-size="9" font-family="Arial" fill="#666">{line}</text>\n'
        
        # Marcadores de condiciones especiales
        condiciones = persona.get('condiciones', [])
        markers_svg = ''
        if 'consultante' in condiciones:
            # Doble borde para consultante
            if genero == 'femenino':
                markers_svg += f'<circle cx="{size/2}" cy="{size/2}" r="{size/2 + 4}" fill="none" stroke="black" stroke-width="2"/>'
            else:
                markers_svg += f'<rect x="-4" y="-4" width="{size + 8}" height="{size + 8}" fill="none" stroke="black" stroke-width="2"/>'
        
        return f'''  <g id="person-{persona["id"]}">
    {nombre_svg}
    <g transform="translate({x},{y})">
      {shape}
      {death_mark}
      {markers_svg}
    </g>
    {edad_svg}
    {info_svg}
  </g>
'''
    
    def process_transcription(self, transcription: str, output_file: str = "genograma") -> str:
        """Procesa una transcripción y genera el genograma completo"""
        print("Extrayendo información con Gemini...")
        family_data = self.extract_family_info(transcription)
        print(f"Generando genograma para {len(family_data['personas'])} personas...")
        return self.create_genogram(family_data, output_file)

# Ejemplo de uso
if __name__ == "__main__":
    transcripcion_ejemplo = """
    Mi nombre es Juan García de 45 años. Estoy casado con María López de 42. 
    Tenemos dos hijos: Pedro de 15 y Ana de 12. Mi padre Roberto tiene 70 años.
    Mi relación con María es muy buena. Pedro está en tratamiento por ansiedad.
    """
    
    API_KEY = "AIzaSyBpC1JV-hGJdBqXSBrY6SYksnAiz9uUreY" 
    
    generator = GenogramGenerator(api_key=API_KEY)
    try:
        output = generator.process_transcription(transcripcion_ejemplo, "genograma_test")
        print(f"✅ Genograma generado exitosamente: {output}")
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()