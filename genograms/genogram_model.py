import google.genai as genai
import json
import ast
import re
import time
import os
import base64
import datetime
import sys
from typing import Dict, List, Optional
from pathlib import Path

class GenogramGenerator:
    
    def __init__(self, api_key: Optional[str] = None, icons_path: str = None):
        # New google.genai SDK uses a Client object. Make api_key optional so
        # generator can be instantiated for local/demo rendering without
        # contacting the model service.
        # If api_key not provided, try to find it in environment variables
        # or in a project `.env` file (simple KEY=VALUE parser).
        key = api_key or os.environ.get('GEMINI_API_KEY') or os.environ.get('GENAI_API_KEY') or os.environ.get('API_KEY')
        if not key:
            # Try to read a .env file in project root
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
                            # Only set if not already present
                            if k not in os.environ:
                                os.environ[k] = v
                    # Re-check common names
                    key = os.environ.get('GEMINI_API_KEY') or os.environ.get('GENAI_API_KEY') or os.environ.get('API_KEY')
            except Exception:
                key = None

        if key:
            self.client = genai.Client(api_key=key)
            # Use gemini-2.5-flash which was verified to have quota
            self.model_id = 'gemini-2.5-flash'
        else:
            self.client = None
            self.model_id = None
        
        # Ruta a los iconos SVG
        if icons_path is None:
            self.icons_path = Path(__file__).parent / 'icons_genograms'
        else:
            self.icons_path = Path(icons_path)
        
        # Cache de SVGs cargados
        self.svg_cache = {}
    
    def extract_family_info(self, transcription: str) -> Dict:
        prompt = f"""
        Analiza la siguiente transcripción (que puede incluir múltiples sesiones de terapia o información previa del paciente) y extrae la información familiar COMPLETA para un genograma profesional.
        
        REGLAS DE EXTRACCIÓN:
        - EXTRAE a todas las personas mencionadas con un rol familiar o relacional (padres, hijos, abuelos, tíos, primos, hermanos, parejas actuales o anteriores, etc.)
        - ABUELOS: Es fundamental incluir a los abuelos (paternos y maternos) si se mencionan.
        - RELACIONES DE PAREJA: Usa tipo "pareja". Incluye matrimonios, uniones libres, novios, divorcios o separaciones.
        - RELACIONES PADRE-HIJO: Usa tipo "padre-hijo". IMPORTANTE: Si un hijo es de una pareja (ej: "tienen un hijo"), crea DOS relaciones "padre-hijo", una para cada progenitor.
        - CALIDAD DE RELACIÓN: Sé preciso. Si se menciona "buena relación", usa "alianza_buena".
        - Si no se menciona la edad o ocupación, usa null.
        - Sé muy preciso con los nombres y los géneros.
        
        Transcripciones e Información:
        {transcription}
        
        Extrae la siguiente información estrictamente en formato JSON:
        {{
            "personas": [
                {{
                    "id": "identificador_único_basado_en_nombre",
                    "nombre": "nombre completo",
                    "genero": "masculino/femenino",
                    "edad": edad_o_null,
                    "ocupacion": "ocupación/profesión si se menciona" o null,
                    "vivo": true/false,
                    "orientacion": "heterosexual/gay/lesbiana/bisexual/trans/otro" (si se menciona),
                    "condiciones": ["consultante", "enfermedad", "consumo", "tratamiento", "diagnostico_fijo", "muerte", "padre_soltero", "madre_soltera", "embarazada"],
                    "notas": "información adicional relevante (personalidad, rol, etc.)"
                }}
            ],
            "relaciones": [
                {{
                    "tipo": "pareja" o "padre-hijo" o "gemelos",
                    "persona1_id": "id_progenitor_o_pareja1",
                    "persona2_id": "id_descendiente_o_pareja2",
                    "estado_civil": "casados/union_libre/novios/divorciado/separado/union_libre_legalizado",
                    "fecha": "año de inicio o evento" o null,
                    "calidad_relacion": "alianza_buena/conflictiva/distante/toxica/abuso_sexual_violacion/nibuena_nimala/conflictiva_violenta/toxica_simbiotica"
                }}
            ]
        }}
        
        Reglas importantes:
        - Responde UNICAMENTE con el objeto JSON válido.
        - Los IDs deben coincidir exactamente entre la lista de personas y la lista de relaciones.
        - El "consultante" es el paciente principal. Identifícalo en "condiciones".
        - No omitas a nadie por ser de una generación lejana (como abuelos).
        """

        # 3. Call the SDK
        try:
            # Try to use JSON mode
            response = self.client.models.generate_content(
                model=self.model_id,
                contents=prompt,
                config={'response_mime_type': 'application/json'}
            )
            response_text = response.text
        except Exception as e:
            try:
                response = self.client.models.generate_content(
                    model=self.model_id,
                    contents=prompt
                )
                response_text = response.text
            except Exception as e2:
                raise RuntimeError(f"Gemini API call failed: {e2}")

        # Hyper-robust JSON extraction
        data = None
        
        # Helper to find valid JSON in a string by trying substrings
        def find_best_json(text):
            # Try full text first
            try:
                return json.loads(text.strip())
            except Exception:
                pass
            
            # Find all potential start { and try pairing with last }
            starts = [m.start() for m in re.finditer('{', text)]
            ends = [m.start() for m in re.finditer('}', text)]
            
            if not starts or not ends:
                return None
                
            # Try from longest possible to shortest
            for s in starts:
                for e in reversed(ends):
                    if e > s:
                        candidate = text[s:e+1]
                        try:
                            return json.loads(candidate)
                        except Exception:
                            # Try simple quote fix
                            try:
                                cleaned = candidate.replace("'", '"')
                                return json.loads(cleaned)
                            except Exception:
                                continue
            return None

        data = find_best_json(response_text)
        
        if data is None:
            # Last ditch effort: regex for personas and relaciones arrays
            print(f"DEBUG: Hyper-parsing failed. Raw: {response_text[:300]}...", file=sys.stderr)
            raise ValueError("La respuesta del modelo no contiene un formato JSON procesable.")

        print(f"DEBUG: JSON extracted. Persons: {len(data.get('personas', []))}", file=sys.stderr)
        return data

    
    def load_svg(self, path: str) -> str:
        """Carga un archivo SVG y lo retorna como string"""
        if path in self.svg_cache:
            return self.svg_cache[path]
        
        full_path = self.icons_path / path
        if not full_path.exists():
            print(f"Advertencia: No se encontró el SVG en {full_path}", file=sys.stderr)
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

        # Normalize IDs to avoid mismatches from heuristic extractor
        def _norm_id(s: str) -> str:
            if s is None:
                return ''
            return re.sub(r"\W+", '_', str(s).strip().lower())

        # Rebuild personas list with normalized ids and keep a map for names
        id_map = {}
        new_personas = []
        for p in personas:
            orig_id = p.get('id') or p.get('nombre') or ''
            nid = _norm_id(orig_id)
            # If collision, append a suffix
            suffix = 1
            base = nid or ('person' + str(len(new_personas)+1))
            nid_unique = base
            while nid_unique in id_map:
                suffix += 1
                nid_unique = f"{base}_{suffix}"
            id_map[p.get('id')] = nid_unique
            p['id'] = nid_unique
            new_personas.append(p)
        personas = new_personas

        # Normalize relaciones ids
        for r in relaciones:
            if 'persona1_id' in r:
                r['persona1_id'] = id_map.get(r['persona1_id'], _norm_id(r.get('persona1_id')))
            if 'persona2_id' in r:
                r['persona2_id'] = id_map.get(r['persona2_id'], _norm_id(r.get('persona2_id')))

        # FILTER: KEEP ALL relationships for processing (do not filter here)
        # 1. Inferir parejas faltantes si comparten el mismo hijo
        hijos_map = {} # hijo_id -> set(padres_ids)
        for r in relaciones:
            if r.get('tipo', 'padre-hijo') == 'padre-hijo':
                p, h = r.get('persona1_id'), r.get('persona2_id')
                if p and h:
                    if h not in hijos_map: hijos_map[h] = set()
                    hijos_map[h].add(p)
        
        # Si dos personas comparten un hijo, crear relación de pareja implícita si no existe
        parejas_existentes = set()
        for r in relaciones:
            if r.get('tipo') == 'pareja':
                parejas_existentes.add(tuple(sorted([r['persona1_id'], r['persona2_id']])))
        
        for h, padres in hijos_map.items():
            if len(padres) == 2:
                p_list = sorted(list(padres))
                pair = tuple(p_list)
                if pair not in parejas_existentes:
                    relaciones.append({'tipo': 'pareja', 'persona1_id': p_list[0], 'persona2_id': p_list[1], 'estado_civil': 'union_libre'})
                    parejas_existentes.add(pair)

        if not personas:
            raise ValueError("No hay personas en los datos familiares")
        
        # Constantes de diseño (ajustadas para mejor visualización profesional)
        ICON_SIZE = 50  # Tamaño mediano para símbolos
        SPACING_X = 180  # Más espacio horizontal entre personas
        SPACING_Y = 180  # Más espacio vertical entre generaciones
        COUPLE_SPACING = 120  # Espacio entre pareja
        START_X = 100
        START_Y = 100
        
        # Organizar personas por generaciones basadas únicamente en padre-hijo
        generaciones = self._organize_generations(personas, relaciones)

        # Calcular posiciones basadas en generaciones (simple jerárquico)
        posiciones = self._calculate_positions_simple(generaciones, ICON_SIZE, SPACING_X, SPACING_Y, START_X, START_Y)
        
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
        
        # Guardar archivo (asegurando que el directorio existe)
        output_path = f"{output_file}.html"
        out_p = Path(output_path)
        out_p.parent.mkdir(parents=True, exist_ok=True)
        
        with open(out_p, 'w', encoding='utf-8') as f:
            f.write(html_content)
        
        return str(out_p.absolute())
    
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
        # Strategy: if there is a consultante (patient), build centered generations
        # up to grandparents (2 ancestor levels) and direct children. Otherwise
        # fall back to previous root->children BFS.

        # Find consultante (focal person) if present
        consultantes = [p['id'] for p in personas if 'condiciones' in p and 'consultante' in p.get('condiciones', [])]

        generaciones_ids: List[List[str]] = []
        procesadas = set()

        if consultantes:
            focal = consultantes[0]

            # Ancestors up to 2 levels (parents, grandparents)
            ancestor_levels = []
            current_level = [focal]
            for _ in range(2):
                parents = []
                for pid in current_level:
                    parents.extend(padres_de.get(pid, []))
                parents = list(dict.fromkeys(parents))
                if not parents:
                    break
                ancestor_levels.insert(0, parents)
                current_level = parents

            # Add ancestor_levels (may be empty) in top-down order
            for anc in ancestor_levels:
                generaciones_ids.append(anc)

            # Build focal group (focal + pareja si aplica)
            focal_group = [focal]
            pareja = parejas.get(focal)
            if pareja and pareja not in focal_group:
                focal_group.append(pareja)

            # Children generation (direct children of focal and pareja)
            children = []
            for pid in focal_group:
                children.extend(hijos_de.get(pid, []))
            children = list(dict.fromkeys(children))

            # If focal has children, the desired order is: ancestors -> focal -> children
            if children:
                generaciones_ids.append(focal_group)
                generaciones_ids.append(children)
                # mark processed those we just added
                for gen in generaciones_ids:
                    for pid in gen:
                        procesadas.add(pid)

                # Append any remaining unconnected persons at the end
                no_conectadas = [p['id'] for p in personas if p['id'] not in procesadas]
                if no_conectadas:
                    generaciones_ids.append(no_conectadas)

            else:
                # If focal has NO children, we want focal to be the last (bottom-most)
                # generation. So first mark ancestors as processed, then append any
                # unconnected people, and finally append focal as the last generation.
                for gen in generaciones_ids:
                    for pid in gen:
                        procesadas.add(pid)

                no_conectadas = [p['id'] for p in personas if p['id'] not in procesadas and p['id'] not in focal_group]
                if no_conectadas:
                    generaciones_ids.append(no_conectadas)

                # Finally, append focal_group so it is bottom-most
                generaciones_ids.append(focal_group)
                for pid in focal_group:
                    procesadas.add(pid)

        else:
            # Fallback: existing behavior (roots -> children BFS)
            personas_con_padres = set(padres_de.keys())
            raices = [p['id'] for p in personas if p['id'] not in personas_con_padres]
            if not raices:
                raices = [personas[0]['id']]

            generacion_actual = raices
            while generacion_actual:
                generaciones_ids.append(list(generacion_actual))
                for pid in generacion_actual:
                    procesadas.add(pid)

                siguiente = []
                for persona_id in generacion_actual:
                    if persona_id in hijos_de:
                        for hijo_id in hijos_de[persona_id]:
                            if hijo_id not in procesadas and hijo_id not in siguiente:
                                siguiente.append(hijo_id)
                generacion_actual = siguiente

            no_procesadas = [p['id'] for p in personas if p['id'] not in procesadas]
            if no_procesadas:
                generaciones_ids.append(no_procesadas)

        # Convert generaciones_ids (list of id lists) into grupos (parejas agrupadas)
        # Before grouping, detect explicit or implied grandparents and move them
        # to the top generation. We detect grandparents in two ways:
        #  - personas referenced as parent-of-parent via `padres_de` (explicit)
        #  - personas whose `nombre` or `notas` include keywords like 'abuelo'/'abuela'
        generaciones_groups: List[List[List[str]]] = []

        # detect grandparents by parent-of-parent
        grandparents_set = set()
        for child_id, parents in padres_de.items():
            for parent_id in parents:
                for grand in padres_de.get(parent_id, []):
                    grandparents_set.add(grand)

        # detect by keyword in nombre/notas
        keywords = ('abuelo', 'abuela', 'abuelos', 'abuela paterna', 'abuelo paterno', 'abuela materna', 'abuelo materno')
        for p in personas:
            text = ((p.get('nombre') or '') + ' ' + (p.get('notas') or '')).lower()
            if any(k in text for k in keywords):
                grandparents_set.add(p['id'])

        # If we have detected grandparents, ensure they appear in the first generation
        if grandparents_set:
            # remove grandparents from any existing generation lists
            for gen in generaciones_ids:
                for gid in list(gen):
                    if gid in grandparents_set:
                        gen.remove(gid)

            # insert or prepend first generation
            if generaciones_ids:
                first = generaciones_ids[0]
                # prepend unique grandparents
                for gid in grandparents_set:
                    if gid not in first:
                        first.insert(0, gid)
            else:
                generaciones_ids.insert(0, list(grandparents_set))
        for gen in generaciones_ids:
            pendientes = list(gen)
            grupos: List[List[str]] = []
            while pendientes:
                pid = pendientes.pop(0)
                if pid in parejas and parejas[pid] in pendientes:
                    pareja_id = parejas[pid]
                    pendientes.remove(pareja_id)
                    grupos.append([pid, pareja_id])
                else:
                    grupos.append([pid])
            generaciones_groups.append(grupos)

        return {'generaciones': generaciones_groups, 'parejas': parejas, 'hijos_de': hijos_de, 'padres_de': padres_de}
    
    def _calculate_positions(self, estructura: Dict, icon_size: float, spacing_x: float, spacing_y: float, couple_spacing: float, start_x: float, start_y: float) -> Dict:
        """Calcula posiciones para cada persona basándose en la estructura familiar"""
        posiciones = {}
        generaciones = estructura['generaciones']
        # First, compute each generation's width so we can center using the widest
        gen_widths = []
        gen_layouts = []  # store per-generation layout metrics
        for grupos in generaciones:
            ancho_total = 0
            elements = []
            for grupo in grupos:
                if len(grupo) == 2:
                    w = couple_spacing
                else:
                    w = icon_size
                elements.append({'grupo': grupo, 'width': w})
                ancho_total += w
                ancho_total += spacing_x
            gen_widths.append(ancho_total)
            gen_layouts.append({'elements': elements, 'ancho_total': ancho_total})

        canvas_w = max(gen_widths) if gen_widths else 800

        for gen_idx, layout in enumerate(gen_layouts):
            grupos = layout['elements']
            y = start_y + (gen_idx * spacing_y)

            ancho_total = layout['ancho_total']
            x_actual = start_x + max(0, (canvas_w - ancho_total) / 2)

            for item in grupos:
                grupo = item['grupo']
                if len(grupo) == 2:
                    posiciones[grupo[0]] = {'x': x_actual, 'y': y}
                    posiciones[grupo[1]] = {'x': x_actual + couple_spacing, 'y': y}
                    x_actual += couple_spacing + spacing_x
                else:
                    posiciones[grupo[0]] = {'x': x_actual, 'y': y}
                    x_actual += icon_size + spacing_x
        
        return posiciones

    def _calculate_positions_simple(self, generaciones: List[List[str]], icon_size: float, spacing_x: float, spacing_y: float, start_x: float, start_y: float) -> Dict:
        """
        Calcula posiciones para una estructura de genograma multigeracional básica:
        - Cada generación en su propio nivel Y
        - Intenta centrar las personas horizontalmente
        """
        posiciones = {}
        
        # Encontrar el ancho máximo de generación para centrar
        max_gen_width = 0
        for gen in generaciones:
            width = len(gen) * (icon_size + spacing_x) - spacing_x
            if width > max_gen_width:
                max_gen_width = width
        
        canvas_center_x = start_x + max_gen_width / 2
        
        for gen_idx, gen in enumerate(generaciones):
            y = start_y + gen_idx * spacing_y
            gen_width = len(gen) * (icon_size + spacing_x) - spacing_x
            current_x = canvas_center_x - gen_width / 2
            
            for pid in gen:
                posiciones[pid] = {'x': current_x, 'y': y}
                current_x += icon_size + spacing_x
                
        return posiciones
    
    def _render_all_relations(self, relaciones: List[Dict], posiciones: Dict, personas: List[Dict], icon_size: float) -> str:
        """
        Renderiza relaciones de manera robusta:
        - Línea horizontal para cada pareja
        - Línea T-junction hacia sus hijos comunes
        - Línea directa para padres solteros
        """
        svg = ""
        
        # 1. Identificar parejas y agrupar hijos por unidad familiar
        unidades_familiares = {}
        hijos_para_solteros = {}  # padre_id -> set([hijos])
        
        # Primero buscar relaciones de pareja explícitas
        for rel in relaciones:
            if rel.get('tipo', 'pareja') == 'pareja':
                p1, p2 = rel.get('persona1_id'), rel.get('persona2_id')
                if p1 in posiciones and p2 in posiciones:
                    key = tuple(sorted([p1, p2]))
                    if key not in unidades_familiares:
                        unidades_familiares[key] = {'hijos': set(), 'rel_pareja': rel}

        # Asociar hijos a parejas (si ambos son padres) o a solteros
        for rel in relaciones:
            if rel.get('tipo', 'padre-hijo') == 'padre-hijo':
                padre, hijo = rel.get('persona1_id'), rel.get('persona2_id')
                if padre in posiciones and hijo in posiciones:
                    encontrada_unidad = False
                    for key in unidades_familiares:
                        if padre in key:
                            # Strict association: only if both members of the unit are parents of the same child
                            other_parent = key[1] if key[0] == padre else key[0]
                            is_shared = any(r.get('tipo', 'padre-hijo') == 'padre-hijo' and 
                                           r.get('persona1_id') == other_parent and 
                                           r.get('persona2_id') == hijo for r in relaciones)
                            if is_shared:
                                unidades_familiares[key]['hijos'].add(hijo)
                                encontrada_unidad = True
                                break # avoid adding to other pairs the parent might have
                    
                    if not encontrada_unidad:
                        if padre not in hijos_para_solteros:
                            hijos_para_solteros[padre] = set()
                        hijos_para_solteros[padre].add(hijo)

        # 2. Renderizar Unidades Familiares (Parejas + Hijos comunes)
        for i, (pair_key, info) in enumerate(unidades_familiares.items()):
            p1_id, p2_id = pair_key
            rel_pareja = info['rel_pareja']
            hijos = sorted([h for h in info['hijos'] if h in posiciones])
            
            p1_pos, p2_pos = posiciones[p1_id], posiciones[p2_id]
            x1, x2 = p1_pos['x'] + icon_size/2, p2_pos['x'] + icon_size/2
            y1, y2 = p1_pos['y'] + icon_size/2, p2_pos['y'] + icon_size/2
            
            # Altura de la línea de pareja
            offset_y = 30 + (i % 3 * 10) # Stagger slightly
            y_joint = max(p1_pos['y'], p2_pos['y']) + icon_size + offset_y
            
            # Dibujar conexión de pareja
            svg += f'  <line x1="{x1}" y1="{p1_pos["y"] + icon_size}" x2="{x1}" y2="{y_joint}" stroke="black" stroke-width="2"/>\n'
            svg += f'  <line x1="{x2}" y1="{p2_pos["y"] + icon_size}" x2="{x2}" y2="{y_joint}" stroke="black" stroke-width="2"/>\n'
            svg += f'  <line x1="{x1}" y1="{y_joint}" x2="{x2}" y2="{y_joint}" stroke="black" stroke-width="2"/>\n'
            
            # Icono estado civil centrado
            cx = (x1 + x2) / 2
            estado_icon = self.get_relation_icon_path(rel_pareja)
            if estado_icon:
                icon_svg = self.load_svg(estado_icon)
                if icon_svg:
                    svg += f'  <g transform="translate({cx - 15}, {y_joint - 15}) scale(0.6)">{icon_svg}</g>\n'

            # Dibujar conexión a hijos (solo si están ABAJO de los padres)
            hijos_descendientes = [h for h in hijos if posiciones[h]['y'] > max(p1_pos['y'], p2_pos['y'])]
            if hijos_descendientes:
                y_min_hijos = min([posiciones[h]['y'] for h in hijos_descendientes])
                y_hijos_dist = y_min_hijos - 30 
                
                # Center vertical line to distribution
                svg += f'  <line x1="{cx}" y1="{y_joint}" x2="{cx}" y2="{y_hijos_dist}" stroke="black" stroke-width="2"/>\n'
                
                hx_coords = [posiciones[h]['x'] + icon_size/2 for h in hijos_descendientes]
                if len(hijos_descendientes) > 1:
                    svg += f'  <line x1="{min(hx_coords)}" y1="{y_hijos_dist}" x2="{max(hx_coords)}" y2="{y_hijos_dist}" stroke="black" stroke-width="2"/>\n'
                
                for h_id in hijos_descendientes:
                    h_pos = posiciones[h_id]
                    svg += f'  <line x1="{h_pos["x"] + icon_size/2}" y1="{y_hijos_dist}" x2="{h_pos["x"] + icon_size/2}" y2="{h_pos["y"]}" stroke="black" stroke-width="1.5"/>\n'

        # 3. Renderizar Solteros (Padres con hijos no compartidos)
        for padre_id, hijos_ids in hijos_para_solteros.items():
            p_pos = posiciones[padre_id]
            px = p_pos['x'] + icon_size/2
            
            hijos = sorted([h for h in hijos_ids if h in posiciones])
            # Only children strictly below
            hijos_desc = [h for h in hijos if posiciones[h]['y'] > p_pos['y']]
            
            if hijos_desc:
                y_min_h = min([posiciones[h]['y'] for h in hijos_desc])
                y_dist = y_min_h - 25
                
                svg += f'  <line x1="{px}" y1="{p_pos["y"] + icon_size}" x2="{px}" y2="{y_dist}" stroke="black" stroke-width="2"/>\n'
                
                hx_c = [posiciones[h]['x'] + icon_size/2 for h in hijos_desc]
                if len(hijos_desc) > 1:
                    svg += f'  <line x1="{min(hx_c)}" y1="{y_dist}" x2="{max(hx_c)}" y2="{y_dist}" stroke="black" stroke-width="2"/>\n'
                
                for h_id in hijos_desc:
                    h_p = posiciones[h_id]
                    svg += f'  <line x1="{h_p["x"] + icon_size/2}" y1="{y_dist}" x2="{h_p["x"] + icon_size/2}" y2="{h_p["y"]}" stroke="black" stroke-width="1.5"/>\n'
                    
        return svg
    
    def _organize_generations(self, personas: List[Dict], relaciones: List[Dict]) -> List[List[str]]:
        """Organiza personas en generaciones basándose en relaciones padre-hijo"""
        generaciones = []
        personas_procesadas = set()
        
        # Encontrar raíces (personas sin padres mencionados)
        personas_con_padres = set()
        for rel in relaciones:
            if rel.get('tipo', 'padre-hijo') == 'padre-hijo':
                personas_con_padres.add(rel['persona2_id'])
        
        raices = [p['id'] for p in personas if p['id'] not in personas_con_padres]
        
        if not raices:
            return [[p['id'] for p in personas]]
        
        # BFS para organizar por generaciones
        generacion_actual = raices
        
        while generacion_actual:
            generaciones.append(list(generacion_actual))
            personas_procesadas.update(generacion_actual)
            
            # Encontrar hijos de la generación actual
            siguiente_generacion = []
            for rel in relaciones:
                if rel.get('tipo', 'padre-hijo') == 'padre-hijo' and rel['persona1_id'] in generacion_actual:
                    hijo_id = rel['persona2_id']
                    if hijo_id not in personas_procesadas and hijo_id not in siguiente_generacion:
                        siguiente_generacion.append(hijo_id)
            
            generacion_actual = siguiente_generacion
        
        # Agregar personas no procesadas (como hijos que no tienen padres en la lista)
        no_procesadas = [p['id'] for p in personas if p['id'] not in personas_procesadas]
        if no_procesadas:
            generaciones.append(no_procesadas)
        
        return generaciones

    def _heuristic_extract_family_info(self, transcription: str) -> Dict:
        """A very small heuristic extractor that finds simple patterns in the
        concatenated transcription and returns a minimal `family_data` dict.

        This is intentionally conservative — it extracts the consultante name,
        explicit mentions of parents, partners and children lists using simple
        regex patterns. It's a fallback for when the model API is unavailable.
        """
        personas = {}
        relaciones = []

        text = transcription.replace('\n', ' ')[:800000]  # trim huge inputs

        # Find consultante: 'me llamo X' or 'mi nombre es X'
        m = re.search(r"\b(?:me llamo|mi nombre es)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)", text, re.IGNORECASE)
        consultante_name = None
        if m:
            consultante_name = m.group(1).strip()
            cid = re.sub(r"\W+", '_', consultante_name.lower())
            personas[cid] = {'id': cid, 'nombre': consultante_name, 'genero': 'femenino', 'condiciones': ['consultante']}

        # Married/partner: 'estoy casado con X' / 'casada con X'
        m2 = re.search(r"\b(?:estoy casad[oa]|casad[oa]? con)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)", text, re.IGNORECASE)
        if m2 and consultante_name:
            partner = m2.group(1).strip()
            pid = re.sub(r"\W+", '_', partner.lower())
            if pid not in personas:
                personas[pid] = {'id': pid, 'nombre': partner, 'genero': 'masculino'}
            # add pareja relation
            relaciones.append({'tipo': 'pareja', 'persona1_id': re.sub(r"\W+", '_', consultante_name.lower()), 'persona2_id': pid})

        # Parents: 'mi padre NAME' or 'mi madre NAME'
        for m in re.finditer(r"\bmi\s+(padre|madre)\s+(?:se llama\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)", text, re.IGNORECASE):
            role, name = m.groups()
            name = name.strip()
            pid = re.sub(r"\W+", '_', name.lower())
            genero = 'masculino' if role.lower() == 'padre' else 'femenino'
            if pid not in personas:
                personas[pid] = {'id': pid, 'nombre': name, 'genero': genero}
            # link to consultante if known
            if consultante_name:
                relaciones.append({'tipo': 'padre-hijo', 'persona1_id': pid, 'persona2_id': re.sub(r"\W+", '_', consultante_name.lower())})

        # Children lists: 'tenemos dos hijos: Pedro y Ana' or 'tengo un hijo: Pedro'
        m3 = re.search(r"\b(?:tenemos|tengo)\s+(?:[\w\s]+)?(?:hijos|hijo|hijas|hija)[:\s]+([A-Z][\w\s, y]+)", text, re.IGNORECASE)
        if m3 and consultante_name:
            kids_str = m3.group(1)
            parts = re.split(r",| y | e ", kids_str)
            for kraw in parts:
                k = kraw.strip()
                if not k:
                    continue
                kid_id = re.sub(r"\W+", '_', k.lower())
                if kid_id not in personas:
                    personas[kid_id] = {'id': kid_id, 'nombre': k, 'genero': 'masculino'}
                # add padre-hijo between consultante (and partner if any) and kid
                relaciones.append({'tipo': 'padre-hijo', 'persona1_id': re.sub(r"\W+", '_', consultante_name.lower()), 'persona2_id': kid_id})
                # if partner exists, link partner too
                partner_id = None
                for rel in relaciones:
                    if rel['tipo'] == 'pareja' and rel['persona1_id'] == re.sub(r"\W+", '_', consultante_name.lower()):
                        partner_id = rel['persona2_id']
                if partner_id:
                    relaciones.append({'tipo': 'padre-hijo', 'persona1_id': partner_id, 'persona2_id': kid_id})

        # Grandparents: look for 'mi abuelo' or 'mi abuela' mentions (we add as persons but may not link)
        for m in re.finditer(r"\bmi\s+abuel[ao]\s+(?:se llama\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)", text, re.IGNORECASE):
            name = m.group(1).strip()
            gid = re.sub(r"\W+", '_', name.lower())
            if gid not in personas:
                personas[gid] = {'id': gid, 'nombre': name}

        # Fallback: if no consultante found, try to detect any proper name as focal
        if not consultante_name and personas:
            # pick first person as consultante
            any_id = next(iter(personas))
            personas[any_id].setdefault('condiciones', []).append('consultante')

        # Build arrays
        person_list = list(personas.values())

        # Ensure unique relaciones by ids
        unique_rels = []
        seen = set()
        for r in relaciones:
            key = (r.get('tipo'), r.get('persona1_id'), r.get('persona2_id'))
            if key not in seen:
                unique_rels.append(r)
                seen.add(key)

        return {'personas': person_list, 'relaciones': unique_rels}
    
    def _render_person(self, persona: Dict, x: float, y: float, size: float) -> str:
        """Renderiza una persona en el genograma con diseño profesional y coordenadas relativas"""
        nombre = str(persona.get('nombre') or '???')
        edad = persona.get('edad')
        ocupacion = str(persona.get('ocupacion') or '')
        genero = persona.get('genero', 'masculino')
        vivo = persona.get('vivo', True)
        condiciones = persona.get('condiciones') or []
        if not isinstance(condiciones, list):
            condiciones = []
        
        # Coordenadas relativas (dentro del grupo transformado a x,y)
        cx = size / 2
        cy = size / 2
        
        # 1. Símbolo base (cuadrado o círculo)
        if genero == 'femenino':
            shape = f'<circle cx="{cx}" cy="{cy}" r="{size/2}" fill="white" stroke="black" stroke-width="2.5"/>'
        else:
            shape = f'<rect x="0" y="0" width="{size}" height="{size}" fill="white" stroke="black" stroke-width="2.5"/>'
        
        # 2. Marca de muerte (X)
        death_mark = ''
        if not vivo:
            if genero == 'femenino':
                death_mark = f'<line x1="{cx - size/4}" y1="{cy - size/4}" x2="{cx + size/4}" y2="{cy + size/4}" stroke="black" stroke-width="2"/><line x1="{cx + size/4}" y1="{cy - size/4}" x2="{cx - size/4}" y2="{cy + size/4}" stroke="black" stroke-width="2"/>'
            else:
                death_mark = f'<line x1="{size/4}" y1="{size/4}" x2="{size*3/4}" y2="{size*3/4}" stroke="black" stroke-width="2"/><line x1="{size*3/4}" y1="{size/4}" x2="{size/4}" y2="{size*3/4}" stroke="black" stroke-width="2"/>'
        
        # 3. Etiquetas de texto (Nombres arriba)
        nombre_svg = ""
        nombre_lines = []
        if len(nombre) > 15:
            palabras = nombre.split()
            mid = len(palabras) // 2
            nombre_lines = [' '.join(palabras[:mid]), ' '.join(palabras[mid:])]
        else:
            nombre_lines = [nombre]
            
        for i, line in enumerate(nombre_lines):
            # Posicionamiento relativo: arriba del símbolo (y < 0)
            line_y = -10 - (len(nombre_lines) - 1 - i) * 15
            nombre_svg += f'<text x="{cx}" y="{line_y}" text-anchor="middle" font-size="14" font-family="Arial, sans-serif" font-weight="bold" fill="#000">{line}</text>\n'
            
        # 4. Edad DENTRO del símbolo
        edad_svg = ""
        if edad:
             # Centrado verticalmente dentro de la figura
             edad_svg = f'<text x="{cx}" y="{cy + 7}" text-anchor="middle" font-size="18" font-family="Arial, sans-serif" font-weight="bold" fill="#000">{edad}</text>\n'
             
        # 5. Ocupación debajo
        ocupacion_svg = ""
        if not ocupacion:
            notas = str(persona.get('notas') or '')
            if notas and len(notas) < 25:
                ocupacion = notas
                
        if ocupacion:
            ocupacion_text = ocupacion[:25] + ('...' if len(ocupacion) > 25 else '')
            ocupacion_svg = f'<text x="{cx}" y="{size + 18}" text-anchor="middle" font-size="11" font-family="Arial, sans-serif" fill="#666">{ocupacion_text}</text>\n'
            
        # 6. Marca de consultante (doble borde)
        consultante_mark = ""
        if 'consultante' in condiciones:
            if genero == 'femenino':
                consultante_mark = f'<circle cx="{cx}" cy="{cy}" r="{size/2 + 5}" fill="none" stroke="black" stroke-width="2.5"/>'
            else:
                consultante_mark = f'<rect x="-5" y="-5" width="{size + 10}" height="{size + 10}" fill="none" stroke="black" stroke-width="2.5"/>'
                
        # 7. Unir todo en un solo grupo transformado
        return f'''<g id="person-{persona["id"]}" transform="translate({x},{y})">
{shape}
{death_mark}
{nombre_svg}
{edad_svg}
{ocupacion_svg}
{consultante_mark}
</g>
'''
    
    def process_transcription(self, transcription: str, output_file: str = "genograma") -> str:
        """Procesa una transcripción y genera el genograma completo"""
        # Save the concatenated transcription to outputs for inspection/debug
        try:
            project_root = Path(__file__).resolve().parents[1]
            out_dir = project_root / 'outputs'
            out_dir.mkdir(parents=True, exist_ok=True)
            concat_path = out_dir / f"{Path(output_file).stem}_transcription_concat.txt"
            with open(concat_path, 'w', encoding='utf-8') as cf:
                cf.write(transcription)
            print(f"DEBUG: transcription concatenated saved to {concat_path} (size={os.path.getsize(concat_path)} bytes)")
        except Exception:
            pass

        print("Extrayendo información con Gemini...")
        family_data = self.extract_family_info(transcription)
        print(f"Generando genograma para {len(family_data['personas'])} personas...")
        return self.create_genogram(family_data, output_file)

    def collect_transcriptions(self, patient_folder: str, base_paths: Optional[List[str]] = None) -> str:
        """Busca y concatena transcripciones de un paciente en `outputs/` y `recordings/`.

        - `patient_folder` es el nombre de la carpeta del paciente (ej: 'patient_elisa').
        - `base_paths` lista de carpetas raíz donde buscar (por defecto ['outputs','recordings']).
        Retorna una sola cadena con todo el texto concatenado.
        """
        if base_paths is None:
            base_paths = ['outputs', 'recordings']

        project_root = Path(__file__).resolve().parents[1]
        collected = []
        found_files = []

        for base in base_paths:
            candidate_dir = project_root / base / patient_folder
            if not candidate_dir.exists():
                continue

            for root, _, files in os.walk(candidate_dir):
                for fname in sorted(files):
                    if not fname.lower().endswith(('.txt', '.json', '.md')):
                        continue
                    fpath = Path(root) / fname
                    try:
                        with open(fpath, 'r', encoding='utf-8') as fh:
                            text = fh.read().strip()
                            if text:
                                header = f"\n\n--- SESSION: {fpath.relative_to(project_root)} ---\n\n"
                                collected.append(header + text)
                                found_files.append(str(fpath))
                    except Exception as e:
                        print(f"No se pudo leer {fpath}: {e}")

        if not collected:
            raise FileNotFoundError(f"No se encontraron transcripciones para '{patient_folder}' en {base_paths}")

        # Loguear qué archivos se tomaron (rutas y tamaños)
        try:
            print(f"DEBUG: collect_transcriptions patient_folder={patient_folder} base_paths={base_paths}")
            print(f"DEBUG: archivos encontrados: {len(found_files)}")
            for f in found_files:
                try:
                    sz = os.path.getsize(f)
                except Exception:
                    sz = 'unknown'
                print(f"  - {f} (size={sz} bytes)")
        except Exception as e:
            print(f"DEBUG: error al imprimir detalles de transcripciones: {e}")

        # Concatenar en orden cronológico si fuera necesario (ya usamos sorted filenames)
        return '\n'.join(collected)

    def process_patient_sessions(self, patient_folder: str, output_file: str = "genograma") -> str:
        """Genera el genograma usando todas las transcripciones encontradas para `patient_folder`.

        Busca en `outputs/` y `recordings/` por defecto. Devuelve la ruta del HTML generado.
        """
        print(f"Buscando transcripciones para paciente: {patient_folder}")
        transcription = self.collect_transcriptions(patient_folder)
        print(f"Se encontraron y concatenaron transcripciones. Longitud total: {len(transcription)} caracteres")
        return self.process_transcription(transcription, output_file)

    def build_family_from_transcriptions(self, patient_folder: str, base_paths: Optional[List[str]] = None) -> Dict:
        """Recoge todas las transcripciones de `patient_folder`, llama a Gemini
        para extraer información familiar y devuelve un dict con solo las
        personas y relaciones padre-hijo (filtrando abuelos/abuelas).

        Retorna: { 'personas': [...], 'relaciones': [...] }
        """
        # Concatenar transcripciones
        transcription = self.collect_transcriptions(patient_folder, base_paths)

        # Extraer con Gemini (se lanzará RuntimeError si la API falla)
        family_data = self.extract_family_info(transcription)

        personas = family_data.get('personas', [])
        relaciones = family_data.get('relaciones', [])

        # Filtrar: eliminar personas cuyo nombre o notas indiquen 'abuelo/abuela'
        gp_keywords = ('abuelo', 'abuela', 'abuelos')
        removed_ids = set()
        for p in personas:
            text = ((p.get('nombre') or '') + ' ' + (p.get('notas') or '')).lower()
            if any(k in text for k in gp_keywords):
                removed_ids.add(p['id'])

        personas_filtered = [p for p in personas if p['id'] not in removed_ids]

        # Mantener sólo relaciones tipo padre-hijo y que no involucren ids removidos
        relaciones_filtered = [r for r in relaciones if r.get('tipo') == 'padre-hijo' and r.get('persona1_id') not in removed_ids and r.get('persona2_id') not in removed_ids]

        # Asegurar que todas las personas referenciadas en relaciones estén en la lista
        ids_in_rels = set()
        for r in relaciones_filtered:
            ids_in_rels.add(r.get('persona1_id'))
            ids_in_rels.add(r.get('persona2_id'))

        existing_ids = {p['id'] for p in personas_filtered}
        for mid in ids_in_rels - existing_ids:
            # crear persona placeholder mínima
            personas_filtered.append({'id': mid, 'nombre': mid, 'genero': 'masculino'})

        return {'personas': personas_filtered, 'relaciones': relaciones_filtered}

    def generate_genogram_from_patient(self, patient_folder: str, output_file: str = "genograma_from_patient") -> str:
        """Pipeline: toma todas las transcripciones de `patient_folder`, extrae
        la familia (solo padres/hijos) y genera el genograma.
        Devuelve la ruta al HTML generado.
        """
        family = self.build_family_from_transcriptions(patient_folder)
        return self.create_genogram(family, output_file)

    def list_transcription_files(self, patient_folder: str, base_paths: Optional[List[str]] = None) -> List[Path]:
        """Devuelve la lista de paths a archivos de transcripción para un paciente."""
        if base_paths is None:
            base_paths = ['outputs', 'recordings']

        project_root = Path(__file__).resolve().parents[1]
        found_files: List[Path] = []

        for base in base_paths:
            candidate_dir = project_root / base / patient_folder
            if not candidate_dir.exists():
                continue

            for root, _, files in os.walk(candidate_dir):
                for fname in sorted(files):
                    if not fname.lower().endswith(('.txt', '.json', '.md')):
                        continue
                    found_files.append(Path(root) / fname)

        return found_files

    def build_family_from_transcriptions_chunked(self, patient_folder: str, base_paths: Optional[List[str]] = None) -> Dict:
        """Similar a `build_family_from_transcriptions` pero procesa cada sesión
        por separado (evita enviar todo el texto en una sola llamada a Gemini).

        Esto ayuda a no exceder cuotas/token limits; aún usa Gemini para cada
        sesión y agrega resultados deduplicando.
        """
        files = self.list_transcription_files(patient_folder, base_paths)
        if not files:
            raise FileNotFoundError(f"No se encontraron transcripciones para '{patient_folder}'")

        personas_map: Dict[str, Dict] = {}
        relaciones_set = set()
        # Process sessions in small batches with retry/backoff on quota errors
        batch_size = 3
        max_retries = 4
        base_delay = 10

        for i in range(0, len(files), batch_size):
            batch = files[i:i+batch_size]
            for fpath in batch:
                try:
                    with open(fpath, 'r', encoding='utf-8') as fh:
                        text = fh.read().strip()
                    if not text:
                        continue

                    attempts = 0
                    while True:
                        try:
                            session_family = self.extract_family_info(text)
                            for p in session_family.get('personas', []):
                                personas_map[p['id']] = p
                            for r in session_family.get('relaciones', []):
                                if r.get('tipo') == 'padre-hijo':
                                    relaciones_set.add((r.get('tipo'), r.get('persona1_id'), r.get('persona2_id')))
                            break
                        except Exception as e:
                            msg = str(e)
                            # Detect quota errors and retry with backoff
                            if 'RESOURCE_EXHAUSTED' in msg or 'quota' in msg.lower():
                                # Try to parse retry seconds from message
                                m = re.search(r"retry.*?(\d+\.?\d*)s", msg, re.IGNORECASE)
                                if m:
                                    delay = float(m.group(1)) + 1.0
                                else:
                                    delay = base_delay * (2 ** attempts)
                                attempts += 1
                                if attempts > max_retries:
                                    # Save failing transcription for inspection and continue
                                    ts = datetime.datetime.utcnow().strftime('%Y%m%dT%H%M%SZ')
                                    outpath = Path(__file__).resolve().parents[1] / 'outputs' / f'failed_extraction_{ts}.txt'
                                    outpath.parent.mkdir(parents=True, exist_ok=True)
                                    with open(outpath, 'w', encoding='utf-8') as of:
                                        of.write(f"ERROR: {msg}\n\nFILE: {fpath}\n\n{text[:1000]}")
                                    raise RuntimeError(f"Gemini quota exhausted repeatedly; saved failing transcription to {outpath}")
                                time.sleep(delay)
                                continue
                            else:
                                # Non-quota error: save transcription and continue
                                ts = datetime.datetime.utcnow().strftime('%Y%m%dT%H%M%SZ')
                                outpath = Path(__file__).resolve().parents[1] / 'outputs' / f'failed_extraction_{ts}.txt'
                                outpath.parent.mkdir(parents=True, exist_ok=True)
                                with open(outpath, 'w', encoding='utf-8') as of:
                                    of.write(f"ERROR: {msg}\n\nFILE: {fpath}\n\n{text[:1000]}")
                                break
                except Exception:
                    # If the outer read/open fails, continue to next file
                    continue

        personas = list(personas_map.values())
        relaciones = [{'tipo': t, 'persona1_id': a, 'persona2_id': b} for (t, a, b) in relaciones_set]

        # Filter out grandparents like before
        gp_keywords = ('abuelo', 'abuela', 'abuelos')
        removed_ids = set()
        for p in personas:
            text = ((p.get('nombre') or '') + ' ' + (p.get('notas') or '')).lower()
            if any(k in text for k in gp_keywords):
                removed_ids.add(p['id'])

        personas_filtered = [p for p in personas if p['id'] not in removed_ids]
        relaciones_filtered = [r for r in relaciones if r.get('persona1_id') not in removed_ids and r.get('persona2_id') not in removed_ids]

        # Add placeholders for referenced ids not present
        ids_in_rels = set()
        for r in relaciones_filtered:
            ids_in_rels.add(r['persona1_id'])
            ids_in_rels.add(r['persona2_id'])
        existing_ids = {p['id'] for p in personas_filtered}
        for mid in ids_in_rels - existing_ids:
            personas_filtered.append({'id': mid, 'nombre': mid, 'genero': 'masculino'})

        return {'personas': personas_filtered, 'relaciones': relaciones_filtered}

    def generate_genogram_from_patient_chunked(self, patient_folder: str, output_file: str = "genograma_from_patient_chunked") -> str:
        """Pipeline que usa extracción por sesión y genera genograma."""
        family = self.build_family_from_transcriptions_chunked(patient_folder)
        return self.create_genogram(family, output_file)

    def _find_session_with_note(self, patient_folder: str, note_keyword: str = 'árbol') -> Optional[Path]:
        """Recorre las sesiones del paciente y devuelve la path a la transcripción
        de la sesión cuya información contenga `note_keyword` (case-insensitive).
        Revisa `*_labeled.txt`, `*_transcription.txt` y `process_*.log` dentro de
        cada carpeta de sesión.
        """
        files = self.list_transcription_files(patient_folder)
        if not files:
            return None

        # Group by session folder
        sessions = {}
        for p in files:
            sess_dir = p.parent
            sessions.setdefault(str(sess_dir).lower(), []).append(p)

        for sess_dir, file_list in sessions.items():
            for p in file_list:
                try:
                    with open(p, 'r', encoding='utf-8') as fh:
                        sample = fh.read(4096).lower()
                    if note_keyword.lower() in sample:
                        # Prefer a full transcription file if available
                        # Search for *_transcription.txt in same dir
                        sd = Path(sess_dir)
                        for candidate in sd.iterdir():
                            if candidate.name.lower().endswith('transcription.txt'):
                                return candidate
                        return p
                except Exception:
                    continue

        return None

    def _extract_patient_info_from_text(self, text: str, patient_id_hint: Optional[str] = None) -> Dict:
        """Intenta extraer nombre/id del consultante desde el texto usando heurísticas.
        Devuelve un dict mínimo: {'id': id, 'nombre': nombre, 'condiciones': ['consultante']}
        """
        # Look for patterns like "Mi nombre es X" or "Paciente: X" or "Paciente es X"
        m = re.search(r"mi nombre es\s+([A-Z][a-zA-ZñÑáéíóúÁÉÍÓÚ\s'-]+)", text, re.IGNORECASE)
        if not m:
            m = re.search(r"paciente[:\-]\s*([A-Z][a-zA-ZñÑáéíóúÁÉÍÓÚ\s'-]+)", text, re.IGNORECASE)
        if not m:
            # fallback: look for a capitalized single token near start
            m = re.search(r"^\s*([A-Z][a-z]{2,})(?:\s|$)", text)

        if m:
            name = m.group(1).strip()
            pid = (patient_id_hint or name).lower().replace(' ', '_')
            return {'id': pid, 'nombre': name, 'genero': None, 'edad': None, 'vivo': True, 'orientacion': None, 'condiciones': ['consultante'], 'notas': ''}
        # If nothing found, use hint or default
        pid = (patient_id_hint or 'consultante').lower()
        return {'id': pid, 'nombre': None, 'genero': None, 'edad': None, 'vivo': True, 'orientacion': None, 'condiciones': ['consultante'], 'notas': ''}

    def generate_genogram_from_patient_by_note(self, patient_folder: str, note_keyword: str = 'árbol', output_file: str = 'genograma_by_note') -> Optional[str]:
        """Genera genograma sólo si existe una sesión del paciente que contenga
        `note_keyword` en su información. Recupera la transcripción de esa sesión
        y añade información mínima del consultante extraída del paciente o de la sesión.
        Devuelve la ruta al HTML generado o None si no se encontró la sesión.
        """
        sess_path = self._find_session_with_note(patient_folder, note_keyword)
        if not sess_path:
            return None

        # Read full transcription text (prefer labeled or transcription files)
        try:
            with open(sess_path, 'r', encoding='utf-8') as fh:
                session_text = fh.read()
        except Exception:
            session_text = ''

        # Try to recover patient info from files in the patient folder
        project_root = Path(__file__).resolve().parents[1]
        patient_dir = project_root / 'outputs' / patient_folder
        patient_info = None
        # look for explicit patient info files
        for fname in ('patient_info.json', f'{patient_folder}_info.json', f'{patient_folder}_profile.json'):
            fpath = patient_dir / fname
            if fpath.exists():
                try:
                    with open(fpath, 'r', encoding='utf-8') as pf:
                        patient_info = json.load(pf)
                        break
                except Exception:
                    patient_info = None

        if not patient_info:
            # fallback: extract from session_text heuristically
            patient_info = self._extract_patient_info_from_text(session_text, patient_id_hint=patient_folder)

        # Build a combined prompt so model knows the patient identity
        combined_text = f"PACIENTE_INFO:\n{json.dumps(patient_info)}\n\nSESION_TRANSCRIPCION:\n{session_text}"

        family = self.extract_family_info(combined_text)
        # Ensure consultante info present: merge patient_info into personas if missing
        personas = {p['id']: p for p in family.get('personas', [])}
        if patient_info.get('id') and patient_info['id'] not in personas:
            personas[patient_info['id']] = patient_info

        relaciones = family.get('relaciones', [])

        return self.create_genogram({'personas': list(personas.values()), 'relaciones': relaciones}, output_file)
    
    def generate_genogram_from_specific_session(self, patient_folder: str, session_number: str, output_file: str = 'genograma_by_session') -> Optional[str]:
        """Genera genograma usando la transcripción de una sesión específica.
        
        Args:
            patient_folder: Nombre de la carpeta del paciente (ej: 'patient_elisa')
            session_number: Número de sesión (ej: '1', '2', '3')
            output_file: Nombre del archivo de salida
            
        Returns:
            Ruta al HTML generado o None si no se encontró la transcripción
        """
        project_root = Path(__file__).resolve().parents[1]
        
        # Buscar carpeta de la sesión específica
        session_dir = project_root / 'outputs' / patient_folder / f'sesion_{session_number}'
        
        if not session_dir.exists():
            print(f"ERROR: No existe la carpeta de sesión: {session_dir}")
            return None
        
        # Buscar archivo de transcripción en la carpeta de sesión
        transcription_file = None
        for pattern in ['*_labeled.txt', '*_transcription.txt', '*.txt']:
            matches = list(session_dir.glob(pattern))
            if matches:
                transcription_file = matches[0]
                break
        
        if not transcription_file:
            print(f"ERROR: No se encontró archivo de transcripción en {session_dir}")
            return None
        
        # Leer transcripción
        try:
            with open(transcription_file, 'r', encoding='utf-8') as fh:
                session_text = fh.read()
        except Exception as e:
            print(f"ERROR leyendo transcripción: {e}")
            return None
        
        # Extraer información del paciente (similar al método anterior)
        patient_info = None
        patient_dir = project_root / 'outputs' / patient_folder
        for fname in ('patient_info.json', f'{patient_folder}_info.json', f'{patient_folder}_profile.json'):
            fpath = patient_dir / fname
            if fpath.exists():
                try:
                    with open(fpath, 'r', encoding='utf-8') as pf:
                        patient_info = json.load(pf)
                        break
                except Exception:
                    patient_info = None
        
        if not patient_info:
            patient_info = self._extract_patient_info_from_text(session_text, patient_id_hint=patient_folder)
        
        # Asegurar que patient_info tiene condición de consultante
        if patient_info and 'condiciones' not in patient_info:
            patient_info['condiciones'] = ['consultante']
        elif patient_info and 'consultante' not in patient_info.get('condiciones', []):
            patient_info['condiciones'].append('consultante')
        
        # Construir prompt combinado con información del paciente
        combined_text = f"PACIENTE_INFO:\n{json.dumps(patient_info, ensure_ascii=False)}\n\nSESION_TRANSCRIPCION:\n{session_text}"
        
        # Extraer información familiar
        family = self.extract_family_info(combined_text)
        
        # Asegurar que la información del consultante esté presente en personas
        personas = {p['id']: p for p in family.get('personas', [])}
        
        # Si el consultante no está en las personas extraídas, agregarlo desde patient_info
        consultante_exists = any('consultante' in p.get('condiciones', []) for p in personas.values())
        if not consultante_exists and patient_info and patient_info.get('id'):
            # Agregar patient_info como consultante
            personas[patient_info['id']] = patient_info
            print(f"DEBUG: Agregando consultante desde patient_info: {patient_info.get('nombre', 'sin nombre')}")
        
        # Extraer relaciones
        relaciones = family.get('relaciones', [])
        
        # Definir ruta de salida persistente
        output_dir = project_root / 'outputs' / patient_folder
        final_output_path = output_dir / 'genograma'
        
        return self.create_genogram({'personas': list(personas.values()), 'relaciones': relaciones}, str(final_output_path))


# Ejemplo de uso (requiere variable de entorno GEMINI_API_KEY válida)
if __name__ == "__main__":
    transcripcion_ejemplo = """
    Mi nombre es Juan García de 45 años. Estoy casado con María López de 42. 
    Tenemos dos hijos: Pedro de 15 y Ana de 12. Mi padre Roberto tiene 70 años.
    Mi relación con María es muy buena. Pedro está en tratamiento por ansiedad.
    """

    # Do not hardcode API keys here. Set GEMINI_API_KEY in the environment
    # or pass it to GenogramGenerator explicitly when instantiating.
    generator = GenogramGenerator()
    try:
        output = generator.process_transcription(transcripcion_ejemplo, "genograma_test")
        print(f"✅ Genograma generado exitosamente: {output}")
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()