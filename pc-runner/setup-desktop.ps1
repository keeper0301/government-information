# ============================================================
# PC runner desktop setup (2026-05-25)
# ============================================================
# Installs keepioo-pc-runner on the current Windows user profile.
#
# Usage:
#   PowerShell (non-admin) -> cd to this ps1 directory -> ./setup-desktop.ps1
# ============================================================

$ErrorActionPreference = "Stop"

$Target = Join-Path $env:USERPROFILE "keepioo-pc-runner"
$Source = $PSScriptRoot

Write-Host ""
Write-Host "===== keepioo PC runner setup =====" -ForegroundColor Cyan
Write-Host ""

# 1. Create folder
if (-not (Test-Path $Target)) {
    New-Item -ItemType Directory -Path $Target -Force | Out-Null
    Write-Host "[1] Created folder: $Target" -ForegroundColor Green
} else {
    Write-Host "[1] Folder exists: $Target" -ForegroundColor Yellow
}

# 2. Copy runner script
Copy-Item "$Source\local-press-runner.mjs" -Destination $Target -Force
Write-Host "[2] Copied local-press-runner.mjs" -ForegroundColor Green

# 3. Create package.json
$pkg = @"
{
  "name": "keepioo-pc-runner",
  "version": "1.0.0",
  "type": "module",
  "dependencies": {
    "dotenv": "^16.0.0"
  }
}
"@
Set-Content -Path "$Target\package.json" -Value $pkg -Encoding UTF8
Write-Host "[3] Created package.json" -ForegroundColor Green

# 4. .env template (operator fills the secret)
$envTpl = @"
# Fill after issuing PC_RUNNER_SECRET
# Must match the Vercel env value
PC_RUNNER_SECRET=
"@
if (-not (Test-Path "$Target\.env")) {
    Set-Content -Path "$Target\.env" -Value $envTpl -Encoding UTF8
    Write-Host "[4] Created .env template - fill PC_RUNNER_SECRET manually" -ForegroundColor Yellow
}

# 5. npm install
Set-Location $Target
Write-Host "[5] npm install dotenv..." -ForegroundColor Cyan
# Preserve npm exit code by using redirection instead of a pipeline.
npm install --silent 1>$null 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "    npm install failed - run 'npm install' manually" -ForegroundColor Red
    exit 1
}
Write-Host "    dotenv installed" -ForegroundColor Green

# 6. Check PC_RUNNER_SECRET and run dry-run
$envContent = Get-Content "$Target\.env" -Raw -ErrorAction SilentlyContinue
if ($envContent -match "PC_RUNNER_SECRET=.+\S") {
    Write-Host "[6] .env PC_RUNNER_SECRET found" -ForegroundColor Green
    Write-Host ""
    Write-Host "===== dry-run start =====" -ForegroundColor Cyan
    Write-Host ""
    node local-press-runner.mjs
    Write-Host ""
    Write-Host "===== dry-run complete =====" -ForegroundColor Cyan
    Write-Host "After confirming output, schedule Task Scheduler daily at KST 09:30" -ForegroundColor White
} else {
    Write-Host "[6] .env PC_RUNNER_SECRET missing" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "===== setup complete =====" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Next steps:" -ForegroundColor White
    Write-Host "  1. Add PC_RUNNER_SECRET in Vercel dashboard" -ForegroundColor White
    Write-Host "  2. Fill the same PC_RUNNER_SECRET in $Target\.env" -ForegroundColor White
    Write-Host "  3. Re-run ./setup-desktop.ps1 for automatic dry-run" -ForegroundColor White
    Write-Host ""
}
