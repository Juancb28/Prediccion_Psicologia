# activate.ps1
$ErrorActionPreference = "Stop"

Write-Host "`n=== Activando entorno de desarrollo ===" -ForegroundColor Cyan

# Navegar al proyecto
Set-Location "D:\Software\Projects\AI - Project\Prediccion_Psicologia"

# Activar venv
.\venv\Scripts\Activate.ps1

# Cargar variables de entorno desde .env
if (Test-Path .env) {
    Get-Content .env | ForEach-Object {
        if ($_ -match "^([^#].+?)=(.+)$") {
            [Environment]::SetEnvironmentVariable($matches[1], $matches[2], "Process")
        }
    }
    Write-Host "✓ Variables cargadas desde .env" -ForegroundColor Green
} else {
    Write-Host "⚠ Archivo .env no encontrado" -ForegroundColor Yellow
}

# Mostrar configuración
Write-Host "`n=== Configuración actual ===" -ForegroundColor Green
python -c "import torch, sys; print(f'Python: {sys.version.split()[0]}'); print(f'PyTorch: {torch.__version__}'); print(f'CUDA: {\"Sí\" if torch.cuda.is_available() else \"No\"}'); print(f'GPU: {torch.cuda.get_device_name(0) if torch.cuda.is_available() else \"N/A\"}')"
Write-Host ""