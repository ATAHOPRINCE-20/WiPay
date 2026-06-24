# One-time PostgreSQL setup for WiPay (Windows)
# Requires PostgreSQL 17+ installed and postgres superuser password.

param(
    [string]$SuperPassword = "postgres",
    [string]$DbPassword    = "wipay_dev_2026"
)

$psql = "C:\Program Files\PostgreSQL\17\bin\psql.exe"
if (-not (Test-Path $psql)) {
    Write-Error "psql not found. Install PostgreSQL 17 first."
    exit 1
}

$env:PGPASSWORD = $SuperPassword

Write-Host "Creating wipay_user and wipay database..." -ForegroundColor Cyan

& $psql -U postgres -h localhost -c @"
DO `$`$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'wipay_user') THEN
    CREATE USER wipay_user WITH PASSWORD '$DbPassword';
  END IF;
END `$`$;
"@

$dbExists = & $psql -U postgres -h localhost -tAc "SELECT 1 FROM pg_database WHERE datname='wipay'"
if ($dbExists -ne "1") {
    & $psql -U postgres -h localhost -c "CREATE DATABASE wipay OWNER wipay_user;"
}

& $psql -U postgres -h localhost -d wipay -c @"
GRANT ALL ON SCHEMA public TO wipay_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO wipay_user;
"@

Write-Host "Done. Update wipay-backend/.env with:" -ForegroundColor Green
Write-Host "  DB_CONNECTION=pgsql"
Write-Host "  DB_HOST=127.0.0.1"
Write-Host "  DB_PORT=5432"
Write-Host "  DB_DATABASE=wipay"
Write-Host "  DB_USERNAME=wipay_user"
Write-Host "  DB_PASSWORD=$DbPassword"
Write-Host ""
Write-Host "Then run: php artisan migrate:fresh --seed"
