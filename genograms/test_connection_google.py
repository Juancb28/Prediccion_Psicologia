import google.genai as genai
import warnings
warnings.filterwarnings('ignore', category=FutureWarning)


genai.configure(api_key='AIzaSyBpC1JV-hGJdBqXSBrY6SYksnAiz9uUreY')

try:
    print("Probando conexión con Google Gemini...")

    model = genai.GenerativeModel('models/gemini-2.5-flash')
    response = model.generate_content('Responde solo con la palabra: "Conectado"')
    print(f"Estado de la API: {response.text.strip()}")
    print("\n¡Conexión exitosa con Google Gemini API!")
    
except Exception as e:
    print(f"Error: {e}")