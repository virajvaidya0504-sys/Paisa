# Starts Paisa at http://127.0.0.1:8000 (this computer only; no network access).
# First run also installs dependencies and builds the web app. Stop with Ctrl+C.
$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$port = 8000

if (Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue) {
    Write-Host "Port $port is already in use. Is Paisa already running? Open http://127.0.0.1:$port" -ForegroundColor Yellow
    exit 1
}

Set-Location "$root\backend"
if (-not (Test-Path ".venv")) {
    Write-Host "First run: setting up Python environment..."
    python -m venv .venv
    .\.venv\Scripts\python.exe -m pip install -r requirements.txt
}

if (-not (Test-Path "$root\frontend\dist")) {
    Write-Host "First run: building the web app..."
    Push-Location "$root\frontend"
    npm install
    npm run build
    Pop-Location
}

# Open the browser a moment after the server starts.
Start-Job { Start-Sleep 2; Start-Process "http://127.0.0.1:8000" } | Out-Null

Write-Host "Paisa is running at http://127.0.0.1:$port  (Ctrl+C to stop)" -ForegroundColor Green
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port $port
