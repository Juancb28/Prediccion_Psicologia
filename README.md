# Prediccion_Psicologia
App desarrollada para la predicción de problemas mentales, utilizado únicamente por los profesionales de salud.


cd agentes

# Compilar
javac -cp "lib/*" *.java

# Ejecutar
java -cp "lib/*:." AnalizadorSesion ../transciption/sesion_001.txt

# En Bash, ejecutar el servidor server.js
node server.js

# Instalar dependencias/librerias
"D:/Software/Projects/AI _Project/Prediccion_Psicologia/.venv/Scripts/python.exe" -m pip install --upgrade pip setuptools wheel
"D:/Software/Projects/AI _Project/Prediccion_Psicologia/.venv/Scripts/python.exe" -m pip install --upgrade pip setuptools wheel
"D:/Software/Projects/AI _Project/Prediccion_Psicologia/.venv/Scripts/python.exe" -m pip install -r requirements.txt


# Ejecutar python
.venv/Scripts/activate    # or source .venv/Scripts/activate
python transciption/process_all.py


Pasos rápidos (Bash)
--------------------

Sigue estos pasos en una terminal Bash (`bash.exe`) desde la raíz del proyecto `Prediccion_Psicologia`.

1) Abrir la carpeta del proyecto (si aún no estás ahí):

```bash
cd "D:/Software/Projects/AI _Project/Prediccion_Psicologia"
```

2) Activar el entorno virtual `.venv`:

```bash
source .venv/Scripts/activate
# Verifica que el intérprete corresponde al .venv
python -c "import sys; print(sys.executable)"
```

3) Actualizar herramientas de empaquetado e instalar dependencias:

```bash
python -m pip install --upgrade pip setuptools wheel
python -m pip install -r requirements.txt
```

4) (Opcional, para usar la GPU NVIDIA) Instalar PyTorch y torchaudio con CUDA 12.1
	 - Solo si quieres ejecutar en GPU (recomendado para acelerar modelos grandes). Ya lo instalamos en este proyecto; si necesitas repetir:

```bash
python -m pip install --force-reinstall --index-url https://download.pytorch.org/whl/cu121 \
	--extra-index-url https://pypi.org/simple "torch==2.5.1+cu121" "torchaudio==2.5.1+cu121"
```

5) Configurar el token de Hugging Face (si el pipeline lo necesita):

```bash
# crea/edita el archivo .env en la raíz del proyecto y agrega:
echo "HUGGINGFACE_TOKEN=hf_...TU_TOKEN_AQUI..." > .env
```

6) Ejecutar el pipeline completo (transcripción → diarización → etiquetado):

```bash
python transciption/process_all.py
```

7) Consultar los resultados (archivos generados en `outputs/`):

```bash
ls outputs/
head -n 40 outputs/Test_transcription.txt
cat outputs/Test_diarization.txt
cat outputs/Test_labeled.txt
```

Notas y resolución de problemas rápidos:
- Si ves advertencias como "Failed to launch Triton kernels": es solo una advertencia de rendimiento (Triton no está disponible en Windows). La transcripción seguirá funcionando pero un poco más lenta.
- Si `pyannote.audio` indica incompatibilidad con `huggingface_hub`, revisa `requirements.txt` o usa el token en `.env`. En este repositorio ya añadimos compatibilidad en tiempo de ejecución para muchas instalaciones.
- Si `torchaudio` lanza errores tipo "no attribute list_audio_backends", reinstala `torch` y `torchaudio` con las mismas variantes (p. ej. la línea de instalación de cu121 arriba).

Si quieres, puedo añadir un script `run_pipeline.sh` con estos comandos para ejecutarlo todo con un solo `./run_pipeline.sh`.

Ejecutar cuando ya está todo instalado (Bash)
-------------------------------------------

Si ya instalaste todas las dependencias anteriormente (pero no has activado el entorno en esta sesión), usa estos pasos rápidos en Bash:

1) Sitúate en la carpeta del proyecto:

```bash
cd "D:/Software/Projects/AI _Project/Prediccion_Psicologia"
```

2) Activa el entorno virtual `.venv`:

```bash
source .venv/Scripts/activate
```

3) (Comprobación opcional) Verifica que estás usando el intérprete del venv y que torch puede usar la GPU:

```bash
python -c "import sys,torch; print('python=', sys.executable); print('torch=', getattr(torch,'__version__',None), 'cuda=', getattr(torch.version,'cuda',None), 'cuda_available=', torch.cuda.is_available())"
```

4) Ejecuta el pipeline (transcripción → diarización → etiquetado):

```bash
python transciption/process_all.py
```

5) Revisa los resultados en `outputs/`:

```bash
ls outputs/
head -n 40 outputs/*_transcription.txt
```

Eso es todo — estos pasos asumen que `pip install -r requirements.txt` ya se ejecutó antes y que `.venv` contiene las dependencias necesarias.