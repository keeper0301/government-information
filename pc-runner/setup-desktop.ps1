# ============================================================
# PC runner desktop setup (2026-05-25)
# ============================================================
# 사장님 PC 에 keepioo-pc-runner 설치 자동화.
#
# 사용:
#   PowerShell (관리자 X) 실행 → cd 본 ps1 위치 → ./setup-desktop.ps1
# ============================================================

$ErrorActionPreference = "Stop"

$Target = "C:\Users\cgc09\keepioo-pc-runner"
$Source = $PSScriptRoot

Write-Host ""
Write-Host "===== keepioo PC runner setup =====" -ForegroundColor Cyan
Write-Host ""

# 1. 폴더 생성
if (-not (Test-Path $Target)) {
    New-Item -ItemType Directory -Path $Target -Force | Out-Null
    Write-Host "[1] 폴더 생성: $Target" -ForegroundColor Green
} else {
    Write-Host "[1] 폴더 존재: $Target" -ForegroundColor Yellow
}

# 2. 스크립트 복사
Copy-Item "$Source\local-press-runner.mjs" -Destination $Target -Force
Write-Host "[2] local-press-runner.mjs 복사 완료" -ForegroundColor Green

# 3. package.json 생성
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
Write-Host "[3] package.json 생성" -ForegroundColor Green

# 4. .env 템플릿 (사장님 직접 입력)
$envTpl = @"
# PC_RUNNER_SECRET 발급 후 입력
# (Vercel env 와 동일한 값)
PC_RUNNER_SECRET=
"@
if (-not (Test-Path "$Target\.env")) {
    Set-Content -Path "$Target\.env" -Value $envTpl -Encoding UTF8
    Write-Host "[4] .env 템플릿 생성 — PC_RUNNER_SECRET 직접 입력 필요" -ForegroundColor Yellow
}

# 5. npm install
Set-Location $Target
Write-Host "[5] npm install dotenv 진행..." -ForegroundColor Cyan
npm install --silent 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Host "    npm install 실패 — 사장님 직접 'npm install' 실행 필요" -ForegroundColor Red
    exit 1
}
Write-Host "    dotenv 설치 완료" -ForegroundColor Green

# 6. 안내
Write-Host ""
Write-Host "===== setup 완료 =====" -ForegroundColor Cyan
Write-Host ""
Write-Host "다음 단계:" -ForegroundColor White
Write-Host "  1. Vercel dashboard 에서 PC_RUNNER_SECRET 환경변수 추가" -ForegroundColor White
Write-Host "  2. $Target\.env 에 동일한 PC_RUNNER_SECRET 입력" -ForegroundColor White
Write-Host "  3. dry-run: cd $Target; node local-press-runner.mjs" -ForegroundColor White
Write-Host "  4. 정상 동작 확인 후 Task Scheduler 매일 KST 09:30 가동" -ForegroundColor White
Write-Host ""
