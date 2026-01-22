import os
import sys
import json
import requests
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

def generate_summary(text):
    api_key = os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY")
    
    if not api_key:
        return {"ok": False, "error": "Google API Key not found in environment variables"}

    headers = {
        "Content-Type": "application/json"
    }

    prompt_text = f"""
    Actúa como un psicólogo clínico. Analiza la siguiente transcripción de una sesión de terapia y proporciona un resumen profesional.
    
    Tarea:
    1. Identifica la información más relevante reportada por el paciente (quejas, emociones, pensamientos clave).
    2. Genera un resumen conciso (máximo 250 palabras) utilizando un lenguaje profesional y objetivo.
    
    Transcripción:
    {text}
    
    Resumen:
    """
    
    payload = {
        "contents": [{
            "parts": [{"text": prompt_text}]
        }]
    }

    models_to_try = [
        "gemini-2.0-flash", 
        "gemini-flash-latest", 
        "gemini-pro-latest",
        "gemini-2.0-flash-exp"
    ]
    last_error = None

    for model in models_to_try:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
        try:
            response = requests.post(url, headers=headers, json=payload, timeout=30)
            
            if response.status_code == 200:
                data = response.json()
                try:
                    summary = data['candidates'][0]['content']['parts'][0]['text']
                    return {"ok": True, "summary": summary.strip()}
                except (KeyError, IndexError):
                     # Maybe safety blocked?
                     last_error = f"Model {model} returned invalid format: {str(data)}"
                     continue
            else:
                 last_error = f"Model {model} error {response.status_code}: {response.text}"
                 continue

        except Exception as e:
            last_error = str(e)
            continue
            
    return {"ok": False, "error": f"All models failed. Last error: {last_error}"}

if __name__ == "__main__":
    try:
        # Set stdin encoding to utf-8 explicitly for Windows
        if sys.platform == "win32":
            sys.stdin.reconfigure(encoding='utf-8')

        input_text = ""
        if len(sys.argv) > 1:
            if os.path.isfile(sys.argv[1]):
                with open(sys.argv[1], 'r', encoding='utf-8') as f:
                    input_text = f.read()
            else:
                input_text = sys.argv[1]
        else:
            input_text = sys.stdin.read()

        if not input_text or not input_text.strip():
             print(json.dumps({"ok": False, "error": "No input text provided"}))
             sys.exit(1)

        result = generate_summary(input_text)
        print(json.dumps(result))
        
    except Exception as e:
        print(json.dumps({"ok": False, "error": f"Script error: {str(e)}"}))
        sys.exit(1)
