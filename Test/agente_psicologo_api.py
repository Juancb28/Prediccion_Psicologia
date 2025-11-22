from flask import Flask, request, jsonify
from flask_cors import CORS
import requests
import json
import logging
from datetime import datetime
import os

app = Flask(__name__)
CORS(app)

# Configurar logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class PsicologoOllamaClient:
    """Cliente especializado para análisis psicológico con Ollama"""
    
    def __init__(self, base_url="http://localhost:11434"):
        self.base_url = base_url
        self.model = "gemma2:2b"
    
    def analizar_sesion(self, transcripcion, formato="txt", metadata=None):
        """Analiza una sesión de terapia y genera un informe completo"""
        
        system_prompt = """
        Eres un psicólogo clínico experimentado con más de 15 años de práctica.
        Tu tarea es analizar transcripciones de sesiones terapéuticas y generar informes profesionales.
        
        INSTRUCCIONES:
        1. Lee cuidadosamente toda la transcripción de la sesión
        2. Identifica los temas principales discutidos
        3. Detecta emociones predominantes del paciente
        4. Identifica patrones de pensamiento o comportamiento
        5. Nota cualquier preocupación clínica significativa
        6. Proporciona observaciones terapéuticas relevantes
        
        FORMATO DE RESPUESTA:
        Debes estructurar tu análisis en las siguientes secciones:
        
        ## RESUMEN EJECUTIVO
        [Breve resumen de 2-3 líneas]
        
        ## TEMAS PRINCIPALES
        - [Tema 1]
        - [Tema 2]
        - [Tema 3]
        
        ## ESTADO EMOCIONAL
        [Descripción del estado emocional predominante]
        
        ## OBSERVACIONES CLÍNICAS
        [Observaciones importantes desde perspectiva clínica]
        
        ## PATRONES IDENTIFICADOS
        [Patrones de pensamiento o comportamiento detectados]
        
        ## RECOMENDACIONES
        [Sugerencias para próximas sesiones o intervenciones]
        
        ## NOTAS ADICIONALES
        [Cualquier otra información relevante]
        
        Mantén un tono profesional, empático y objetivo.
        """
        
        if formato == "json":
            prompt = f"""{system_prompt}

Transcripción en formato JSON:
{json.dumps(transcripcion, indent=2, ensure_ascii=False)}

Analiza esta sesión y proporciona tu informe profesional.
"""
        else:
            prompt = f"""{system_prompt}

Transcripción:
{transcripcion}

Analiza esta sesión y proporciona tu informe profesional.
"""
        
        logger.info(f"[Psicólogo] Iniciando análisis ({formato})...")
        
        try:
            analisis = self._generate(prompt, max_tokens=2000)
            logger.info(f"[Psicólogo] Análisis completado ({len(analisis)} chars)")
            
            return {
                "status": "success",
                "analisis": analisis,
                "metadata": {
                    "fecha_analisis": datetime.now().isoformat(),
                    "modelo": self.model,
                    "formato_entrada": formato,
                    "longitud_analisis": len(analisis),
                    **(metadata or {})
                }
            }
        except Exception as e:
            logger.error(f"[Psicólogo] Error: {str(e)}")
            return {"status": "error", "error": str(e)}
    
    def generar_resumen_breve(self, transcripcion):
        """Genera un resumen breve (máximo 150 palabras)"""
        prompt = f"""
        Eres un psicólogo clínico. Lee esta transcripción de sesión terapéutica 
        y genera un resumen breve de máximo 150 palabras que capture:
        1. El motivo principal de consulta
        2. Los temas discutidos
        3. El estado emocional del paciente
        
        Transcripción:
        {transcripcion}
        
        Resumen:
        """
        try:
            return self._generate(prompt, max_tokens=300)
        except Exception as e:
            return f"Error: {str(e)}"
    
    def identificar_emociones(self, transcripcion):
        """Identifica emociones predominantes"""
        prompt = f"""
        Como psicólogo, analiza esta transcripción e identifica las emociones 
        predominantes del paciente. Clasifícalas por intensidad (Alta/Media/Baja).
        
        Transcripción:
        {transcripcion}
        
        Formato:
        - [Emoción]: [Intensidad] - [Breve justificación]
        """
        try:
            return self._generate(prompt, max_tokens=500)
        except Exception as e:
            return f"Error: {str(e)}"
    
    def extraer_temas_clave(self, transcripcion):
        """Extrae los temas clave"""
        prompt = f"""
        Analiza esta transcripción y extrae los 5 temas más importantes.
        Para cada tema, proporciona una breve descripción.
        
        Transcripción:
        {transcripcion}
        
        Formato:
        1. [Tema]: [Descripción]
        2. [Tema]: [Descripción]
        ...
        """
        try:
            return self._generate(prompt, max_tokens=600)
        except Exception as e:
            return f"Error: {str(e)}"
    
    def _generate(self, prompt, max_tokens=1000, temperature=0.7):
        """Genera respuestas con Ollama"""
        url = f"{self.base_url}/api/generate"
        payload = {
            "model": self.model,
            "prompt": prompt,
            "stream": True,
            "options": {
                "num_predict": max_tokens,
                "temperature": temperature
            }
        }
        
        response = requests.post(url, json=payload, stream=True, timeout=120)
        result = ""
        
        if response.status_code == 200:
            for line in response.iter_lines():
                if line:
                    data = json.loads(line)
                    if "response" in data:
                        result += data["response"]
                    if data.get("done", False):
                        break
            return result.strip()
        else:
            raise Exception(f"Error HTTP: {response.status_code}")


psicologo = PsicologoOllamaClient()


@app.route('/api/analizar-sesion', methods=['POST'])
def analizar_sesion():
    """Endpoint principal para analizar sesiones"""
    try:
        content_type = request.content_type
        
        if 'application/json' in content_type:
            data = request.get_json()
            
            if 'transcripcion' in data:
                transcripcion = data['transcripcion']
                formato = data.get('formato', 'txt')
                metadata = data.get('metadata', {})
                
                resultado = psicologo.analizar_sesion(
                    transcripcion, formato=formato, metadata=metadata
                )
                return jsonify(resultado)
            
            elif 'dialogo' in data or 'turnos' in data:
                transcripcion = data
                resultado = psicologo.analizar_sesion(
                    transcripcion, formato='json',
                    metadata=data.get('metadata', {})
                )
                return jsonify(resultado)
        
        elif 'text/plain' in content_type:
            transcripcion = request.data.decode('utf-8')
            resultado = psicologo.analizar_sesion(transcripcion, formato='txt')
            return jsonify(resultado)
        
        elif 'multipart/form-data' in content_type:
            if 'archivo' not in request.files:
                return jsonify({"error": "No se encontró archivo"}), 400
            
            archivo = request.files['archivo']
            contenido = archivo.read().decode('utf-8')
            
            try:
                transcripcion = json.loads(contenido)
                formato = 'json'
            except:
                transcripcion = contenido
                formato = 'txt'
            
            resultado = psicologo.analizar_sesion(transcripcion, formato=formato)
            return jsonify(resultado)
        
        else:
            return jsonify({"error": "Tipo de contenido no soportado"}), 400
            
    except Exception as e:
        logger.error(f"[API] Error: {str(e)}")
        return jsonify({"error": str(e)}), 500


@app.route('/api/resumen-breve', methods=['POST'])
def resumen_breve():
    """Genera un resumen breve"""
    try:
        data = request.get_json()
        transcripcion = data.get('transcripcion', '')
        
        if not transcripcion:
            return jsonify({"error": "Transcripción vacía"}), 400
        
        if isinstance(transcripcion, dict):
            transcripcion = json.dumps(transcripcion, indent=2, ensure_ascii=False)
        
        resumen = psicologo.generar_resumen_breve(transcripcion)
        return jsonify({"status": "success", "resumen": resumen})
        
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/identificar-emociones', methods=['POST'])
def identificar_emociones():
    """Identifica emociones"""
    try:
        data = request.get_json()
        transcripcion = data.get('transcripcion', '')
        
        if not transcripcion:
            return jsonify({"error": "Transcripción vacía"}), 400
        
        if isinstance(transcripcion, dict):
            transcripcion = json.dumps(transcripcion, indent=2, ensure_ascii=False)
        
        emociones = psicologo.identificar_emociones(transcripcion)
        return jsonify({"status": "success", "emociones": emociones})
        
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/temas-clave', methods=['POST'])
def temas_clave():
    """Extrae temas clave"""
    try:
        data = request.get_json()
        transcripcion = data.get('transcripcion', '')
        
        if not transcripcion:
            return jsonify({"error": "Transcripción vacía"}), 400
        
        if isinstance(transcripcion, dict):
            transcripcion = json.dumps(transcripcion, indent=2, ensure_ascii=False)
        
        temas = psicologo.extraer_temas_clave(transcripcion)
        return jsonify({"status": "success", "temas": temas})
        
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/health', methods=['GET'])
def health():
    """Verifica estado del servicio"""
    try:
        response = requests.get("http://localhost:11434/api/tags", timeout=3)
        ollama_status = "online" if response.status_code == 200 else "offline"
        
        return jsonify({
            "status": "online",
            "service": "Psicólogo IA - Análisis de Sesiones",
            "ollama": ollama_status,
            "modelo": psicologo.model
        })
    except Exception as e:
        return jsonify({"status": "error", "error": str(e)}), 500


if __name__ == '__main__':
    print("\n" + "="*70)
    print("🧠 Servicio Psicólogo IA - Análisis de Sesiones")
    print("="*70)
    print("📍 URL: http://localhost:5000")
    print("📡 Endpoints:")
    print("   - POST /api/analizar-sesion")
    print("   - POST /api/resumen-breve")
    print("   - POST /api/identificar-emociones")
    print("   - POST /api/temas-clave")
    print("   - GET  /api/health")
    print("="*70)
    
    try:
        response = requests.get("http://localhost:11434/api/tags", timeout=3)
        if response.status_code == 200:
            print("Ollama conectado")
            models = response.json().get('models', [])
            if psicologo.model in [m['name'] for m in models]:
                print(f"Modelo '{psicologo.model}' encontrado")
            else:
                print(f"Modelo '{psicologo.model}' no encontrado")
        else:
            print("Ollama no responde")
    except:
        print("Ollama no está corriendo")
        print("   Ejecuta: ollama serve")
    
    print("="*70 + "\n")
    
    app.run(host='0.0.0.0', port=5000, debug=False, threaded=True)