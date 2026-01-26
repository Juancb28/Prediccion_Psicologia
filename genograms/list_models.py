import google.generativeai as genai
import os
from pathlib import Path

def main():
    # Try to find API key
    key = os.environ.get('GEMINI_API_KEY')
    if not key:
        project_root = Path(__file__).resolve().parents[1]
        env_path = project_root / '.env'
        if env_path.exists():
            with open(env_path, 'r', encoding='utf-8') as ef:
                for line in ef:
                    if '=' in line and not line.startswith('#'):
                        k, v = line.split('=', 1)
                        if k.strip() in ('GEMINI_API_KEY', 'GENAI_API_KEY', 'API_KEY'):
                            key = v.strip().strip('"').strip("'")
                            break
    
    if not key:
        print("Error: No API key found.")
        return

    genai.configure(api_key=key)
    try:
        print("Listing models...")
        for m in genai.list_models():
            if 'generateContent' in m.supported_generation_methods:
                print(f"Model: {m.name}")
    except Exception as e:
        print(f"Error listing models: {e}")

if __name__ == "__main__":
    main()
