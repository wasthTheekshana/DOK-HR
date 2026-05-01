# ============================================================
# Run this AFTER you have saved all CSVs from Oracle SQL Developer
# into: D:\Project\DOK-HR\db_migration\csv\
#
# Usage (from project root):
#   cd D:\Project\DOK-HR
#   .\db_migration\4_run_import.ps1
# ============================================================

$container = "dokcrm_postgres"
$db        = "dok_hr"
$user      = "dokcrm"
$csvDir    = "$PSScriptRoot\csv"
$tables    = @(
    "sites", "users", "site_task_types", "tasks", "attendance",
    "custom_ot_records", "payroll_saved_records",
    "cost_varient", "profit_amount", "poya_days"
)

Write-Host ""
Write-Host "=== DOK-HR: Oracle → PostgreSQL Data Import ===" -ForegroundColor Cyan
Write-Host ""

# 1. Check Docker container is running
Write-Host "Checking Docker container..." -ForegroundColor Yellow
$running = docker ps --filter "name=$container" --format "{{.Names}}"
if ($running -ne $container) {
    Write-Host "ERROR: Container '$container' is not running." -ForegroundColor Red
    Write-Host "Start it with: docker start $container"
    exit 1
}
Write-Host "  Container is running." -ForegroundColor Green

# 2. Check all CSV files exist
Write-Host ""
Write-Host "Checking CSV files in $csvDir ..." -ForegroundColor Yellow
$missing = @()
foreach ($t in $tables) {
    $f = "$csvDir\$t.csv"
    if (Test-Path $f) {
        Write-Host "  Found: $t.csv" -ForegroundColor Green
    } else {
        Write-Host "  MISSING: $t.csv" -ForegroundColor Red
        $missing += $t
    }
}
if ($missing.Count -gt 0) {
    Write-Host ""
    Write-Host "ERROR: Missing CSV files for: $($missing -join ', ')" -ForegroundColor Red
    Write-Host "Export them from Oracle SQL Developer first (see 1_oracle_export_queries.sql)"
    exit 1
}

# 3. Create /csv directory in container and copy all CSV files
Write-Host ""
Write-Host "Copying CSVs into container..." -ForegroundColor Yellow
docker exec $container mkdir -p /csv
foreach ($t in $tables) {
    docker cp "$csvDir\$t.csv" "${container}:/csv/$t.csv"
    Write-Host "  Copied $t.csv" -ForegroundColor Green
}

# 4. Copy SQL scripts into container
Write-Host ""
Write-Host "Copying SQL scripts into container..." -ForegroundColor Yellow
docker cp "$PSScriptRoot\2_import_data.sql"     "${container}:/import_data.sql"
docker cp "$PSScriptRoot\3_reset_sequences.sql" "${container}:/reset_sequences.sql"
Write-Host "  Done." -ForegroundColor Green

# 5. Drop and recreate schema (clean slate)
Write-Host ""
Write-Host "Recreating schema in $db ..." -ForegroundColor Yellow
docker cp "$PSScriptRoot\..\server\src\db\schema_postgres.sql" "${container}:/schema_postgres.sql"
docker exec -it $container psql -U $user -d $db -c "
DROP TABLE IF EXISTS temporary_assignments, attendance, tasks, site_task_types,
    profit_amount, cost_varient, payroll_saved_records, custom_ot_records,
    poya_days, users, sites CASCADE;
"
docker exec -it $container psql -U $user -d $db -f /schema_postgres.sql
Write-Host "  Schema created." -ForegroundColor Green

# 6. Import data
Write-Host ""
Write-Host "Importing data..." -ForegroundColor Yellow
docker exec -it $container psql -U $user -d $db -f /import_data.sql

# 7. Reset sequences
Write-Host ""
Write-Host "Resetting identity sequences..." -ForegroundColor Yellow
docker exec -it $container psql -U $user -d $db -f /reset_sequences.sql

Write-Host ""
Write-Host "=== Import complete! ===" -ForegroundColor Cyan
Write-Host "Start the server: cd server && npm run dev"
Write-Host ""
