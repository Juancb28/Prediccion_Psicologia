import google.generativeai as genai
import os
from pathlib import Path

def test_model(model_name):
    print(f"--- Testing {model_name} ---")
    try:
        model = genai.GenerativeModel(model_name)
        response = model.generate_content("Hola, responde solo 'ok'")
        print(f"Result: {response.text.strip()}")
        return True
    except Exception as e:
        print(f"Error: {e}")
        return False

def main():
    # Load API Key
    project_root = Path(__file__).resolve().parents[1]
    env_path = project_root / '.env'
    key = None
    if env_path.exists():
        with open(env_path, 'r', encoding='utf-8') as ef:
            for line in ef:
                if 'GEMINI_API_KEY=' in line:
                    key = line.split('=', 1)[1].strip().strip('"').strip("'")
    
    if not key:
        print("API Key not found in .env")
        return

    genai.configure(api_key=key)
    
    models = [
        'models/gemini-flash-latest',
        'models/gemini-flash-lite-latest',
        'models/gemini-pro-latest',
        'models/gemini-1.5-flash',
        'models/gemini-1.5-flash-8b',
        'models/gemini-2.0-flash',
        'models/gemini-2.0-flash-lite-preview-02-05',
        'models/gemini-2.5-flash'
    ]
    
    for m in models:
        test_model(m)

if __name__ == "__main__":
    main()
