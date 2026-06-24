# WiPay local dev — PowerShell-safe startup (use ";" not "&&")
# Run from repo root: .\start-dev.ps1

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "Starting WiPay dev environment..." -ForegroundColor Cyan

# Frontend (Terminal 1)
Write-Host "`n[1/2] Frontend -> http://localhost:5173" -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root\wipay-frontend'; npm run dev"

Start-Sleep -Seconds 2

# Backend (Terminal 2)
Write-Host "[2/2] Backend API -> http://127.0.0.1:8000" -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root\wipay-backend'; php artisan serve --host=127.0.0.1 --port=8000"

Write-Host "`nDatabase: PostgreSQL (wipay @ 127.0.0.1:5432)" -ForegroundColor Cyan
Write-Host "Login: admin / password" -ForegroundColor Yellow
Write-Host "Open http://localhost:5173/login" -ForegroundColor Yellow
