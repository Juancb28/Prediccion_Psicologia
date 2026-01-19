# Prediccion_Psicologia
App desarrollada para la predicción de problemas mentales, utilizado únicamente por los profesionales de salud.

## 🚀 Inicio Rápido

### 1. Iniciar el Servidor

```bash
# En Bash o terminal
node server.js
```

El servidor iniciará en `http://localhost:3000`

### 2. Abrir en Navegador

```
http://localhost:3000
```

Se abrirá automáticamente el dashboard. La URL cambiará según el módulo que estés navegando:
- `/dashboard` - Panel principal
- `/pacientes` - Lista de pacientes
- `/agenda` - Gestión de citas
- `/sesiones` - Lista de sesiones
- `/perfil` - Perfil del psicólogo

## 📋 Enrutamiento

La aplicación ahora usa **URLs limpias y enrutamiento declarativo**:

✅ `/dashboard` → Panel principal
✅ `/pacientes` → Lista de pacientes
✅ `/pacientes/:id` → Detalle de paciente
✅ `/agenda` → Agenda de citas
✅ `/sesiones` → Lista de sesiones
✅ `/sesiones/:id` → Detalle de sesión
✅ `/perfil` → Perfil del psicólogo

Para más detalles, consulta [ENRUTAMIENTO.md](ENRUTAMIENTO.md)

## 🧪 Probar Rutas

### Windows (PowerShell)
```powershell
.\test-routes.ps1
```

### Linux/Mac (Bash)
```bash
bash test-routes.sh
```

---

## 🔧 Desarrollo

### Compilar Agentes Java
"D:/Software/Projects/AI _Project/Prediccion_Psicologia/.venv/Scripts/python.exe" -m pip install --upgrade pip setuptools wheel
"D:/Software/Projects/AI _Project/Prediccion_Psicologia/.venv/Scripts/python.exe" -m pip install --upgrade pip setuptools wheel
"D:/Software/Projects/AI _Project/Prediccion_Psicologia/.venv/Scripts/python.exe" -m pip install -r requirements.txt


# Ejecutar python
.venv/Scripts/activate    # or source .venv/Scripts/activate
python transciption/process_all.py


## 🔧 Desarrollo

### Compilar Agentes Java

```bash
cd agentes
javac -cp "lib/*" *.java
java -cp "lib/*:." AnalizadorSesion ../transciption/sesion_001.txt
```

### Instalar Dependencias Python

```bash
# Instalar dependencias/librerias
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

### Verificar Entorno (opcional)

```bash
python -c "import sys,torch; print('python=', sys.executable); print('torch=', getattr(torch,'__version__',None), 'cuda=', getattr(torch.version,'cuda',None), 'cuda_available=', torch.cuda.is_available())"
```

---

## 📖 Pasos Rápidos (Desarrollo Diario)

```bash
# 1. Activar entorno virtual
source .venv/Scripts/activate

# 2. Iniciar servidor
node server.js

# 3. Abrir navegador
# http://localhost:3000
```

---

## 🌐 URLs del Sistema

- **Dashboard**: `http://localhost:3000/dashboard`
- **Pacientes**: `http://localhost:3000/pacientes`
- **Agenda**: `http://localhost:3000/agenda`
- **Sesiones**: `http://localhost:3000/sesiones`
- **Perfil**: `http://localhost:3000/perfil`
