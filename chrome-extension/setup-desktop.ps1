#Requires -Version 5.1
<#
.SYNOPSIS
keepioo 네이버 블로그 자동 발행 — Chrome Extension 본체 PC 1회 설치 스크립트.

.DESCRIPTION
24시간 가동 본체 PC 에서 1회 실행. 자동 처리:
  1. github.com/keeper0301/government-information clone (또는 pull)
  2. NAVER_EXTENSION_SECRET 32 바이트 무작위 생성
  3. chrome-extension/local-secret.txt 작성 (gitignored, popup.js 가 자동 로드)
  4. Vercel env 업데이트 안내 + Chrome 으로 Vercel 페이지 열기
  5. Vercel 재배포 trigger (빈 commit push)
  6. chrome://extensions/ 열기 + 폴더 경로 클립보드 복사

사장님 manual (3회):
  - Vercel env 페이지에서 NAVER_EXTENSION_SECRET 값 갱신 (클립보드 Ctrl+V)
  - chrome://extensions/ 에서 "개발자 모드 ON" → "압축해제된 확장 프로그램 로드" → 경로 붙여넣기
  - Extension popup 핀 고정 + 클릭 → secret 자동 로드 확인 → 🧪 Dry-run

.EXAMPLE
PS> iwr https://raw.githubusercontent.com/keeper0301/government-information/master/chrome-extension/setup-desktop.ps1 -UseBasicParsing -OutFile $env:TEMP\keepioo-setup.ps1; & $env:TEMP\keepioo-setup.ps1
#>

$Utf8NoBom = [System.Text.UTF8Encoding]::new($false)
$OutputEncoding = $Utf8NoBom
[Console]::InputEncoding = $Utf8NoBom
[Console]::OutputEncoding = $Utf8NoBom
try { chcp.com 65001 > $null } catch { }
$PSDefaultParameterValues["Out-File:Encoding"] = "utf8"
$PSDefaultParameterValues["Set-Content:Encoding"] = "utf8"
$PSDefaultParameterValues["Add-Content:Encoding"] = "utf8"
$env:PYTHONUTF8 = "1"
$env:PYTHONIOENCODING = "utf-8"
$ErrorActionPreference = "Stop"
# git credential helper 없을 때 GUI prompt 무한 대기 방지 (reviewer W-2)
$env:GIT_TERMINAL_PROMPT = "0"

function Section($t) { Write-Host ""; Write-Host "═══ $t ═══" -ForegroundColor Cyan }
function Step($n, $m) { Write-Host "[$n] $m" -ForegroundColor Yellow }
function Ok($m)   { Write-Host "  ✓ $m" -ForegroundColor Green }
function Warn($m) { Write-Host "  ⚠ $m" -ForegroundColor DarkYellow }
function Die($m)  { Write-Host "❌ $m" -ForegroundColor Red; exit 1 }

# ────────────────────────────────────────────────────────────
# 0. 환경 검사 — Chrome + git
# ────────────────────────────────────────────────────────────
Section "0. 환경 검사"

$chromePaths = @(
    "$env:PROGRAMFILES\Google\Chrome\Application\chrome.exe",
    "${env:PROGRAMFILES(X86)}\Google\Chrome\Application\chrome.exe",
    "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
)
$chromeExe = $chromePaths | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $chromeExe) { Die "Chrome 을 찾을 수 없습니다. https://www.google.com/chrome 에서 설치 후 재실행." }
Ok "Chrome: $chromeExe"

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Die "git 이 PATH 에 없습니다. https://git-scm.com 에서 설치 후 재실행."
}
Ok "git: $(git --version)"

# ────────────────────────────────────────────────────────────
# 1. repo clone / pull
# ────────────────────────────────────────────────────────────
Section "1. repo 동기화"

$repoPath = Join-Path $env:USERPROFILE "keepioo\government-information"
$repoUrl  = "https://github.com/keeper0301/government-information.git"

if (Test-Path (Join-Path $repoPath ".git")) {
    Step "1a" "기존 repo pull → $repoPath"
    # branch/remote 검증 (P2 codex fix) — 잘못된 fork·다른 branch 에 commit/push 차단
    $currentBranch = (git -C $repoPath rev-parse --abbrev-ref HEAD 2>$null).Trim()
    $currentRemote = (git -C $repoPath remote get-url origin 2>$null).Trim()
    if ($currentBranch -ne "master") {
        Die "현재 branch: $currentBranch (expected: master). 사장님 작업 충돌 위험 → 수동으로 master checkout 후 재실행."
    }
    if ($currentRemote -notmatch "keeper0301/government-information") {
        Die "잘못된 remote: $currentRemote (expected: keeper0301/government-information). 다른 fork 의심 → 수동 확인 후 재실행."
    }
    # --ff-only — 충돌·rebase 사고 회피 (reviewer I-7)
    git -C $repoPath pull --ff-only
    if ($LASTEXITCODE -ne 0) {
        Die "git pull --ff-only 실패. $repoPath 에 local commit 있을 수 있음. 수동 정리 후 재실행."
    }
} else {
    Step "1b" "신규 clone → $repoPath"
    $repoParent = Split-Path $repoPath -Parent
    if (-not (Test-Path $repoParent)) { New-Item -ItemType Directory -Path $repoParent | Out-Null }
    git clone $repoUrl $repoPath
}
$extPath = Join-Path $repoPath "chrome-extension"
if (-not (Test-Path $extPath)) { Die "chrome-extension 폴더가 없습니다. master 브랜치 확인 필요." }
Ok "extension 경로: $extPath"

# ────────────────────────────────────────────────────────────
# 2. SECRET 생성 + local-secret.txt
# ────────────────────────────────────────────────────────────
Section "2. NAVER_EXTENSION_SECRET 생성/회전"

$secretPath = Join-Path $extPath "local-secret.txt"

# 재실행 idempotency — 기존 SECRET 유지 / 새로 회전 선택 (reviewer I-4)
$existingSecret = $null
if (Test-Path $secretPath) {
    $existingSecret = (Get-Content $secretPath -Raw).Trim()
}
$rotate = $true
if ($existingSecret -and $existingSecret.Length -ge 32) {
    Write-Host "  기존 local-secret.txt 발견 ($($existingSecret.Substring(0,6))...$($existingSecret.Substring($existingSecret.Length-4)))." -ForegroundColor Yellow
    $ans = Read-Host "  새 SECRET 으로 회전하시겠습니까? Vercel env 도 다시 갱신해야 함. [y/N]"
    if ($ans -notin @("y","Y","yes")) {
        $rotate = $false
        $secret = $existingSecret
        Ok "기존 SECRET 유지 — Vercel/redeploy 단계 skip"
    }
}

if ($rotate) {
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    $bytes = New-Object byte[] 32
    $rng.GetBytes($bytes)
    $secret = ([System.BitConverter]::ToString($bytes) -replace '-','').ToLower()
    [System.IO.File]::WriteAllText($secretPath, $secret, [System.Text.UTF8Encoding]::new($false))
    Ok "local-secret.txt 작성 (popup.js 가 자동 로드)"
    Ok "SECRET 마스킹: $($secret.Substring(0,6))...$($secret.Substring($secret.Length-4))"
}

# ────────────────────────────────────────────────────────────
# 3. Vercel env 업데이트 안내 (manual — UI 안전)
# ────────────────────────────────────────────────────────────
if (-not $rotate) {
    Section "3. Vercel env 업데이트 — skip (회전 안 함)"
} else {
Section "3. Vercel env 업데이트"

# secret 클립보드 노출 try/finally — Ctrl+C / 에러 종료에도 즉시 정리 (P1 codex fix)
try {
    Set-Clipboard -Value $secret
    Write-Host "  📋 클립보드에 신규 SECRET 복사됨." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  Vercel 페이지가 곧 열립니다. 다음 순서로 진행:" -ForegroundColor Yellow
    Write-Host "    [1] NAVER_EXTENSION_SECRET 항목 옆 ⋮ → Edit" -ForegroundColor White
    Write-Host "    [2] Value 입력란에 Ctrl+V (클립보드 붙여넣기)" -ForegroundColor White
    Write-Host "    [3] 'Sensitive' 체크는 ON 권장 (보안). 재설치 시 setup-desktop.ps1 가 새 SECRET 회전으로 처리." -ForegroundColor White
    Write-Host "    [4] Save 클릭" -ForegroundColor White
    Write-Host ""

    Start-Process $chromeExe "https://vercel.com/keeper0301-8938s-projects/government-information/settings/environment-variables"

    Write-Host ""
    $null = Read-Host "  완료했으면 Enter 키"
} finally {
    # 즉시 클립보드 비움 — Vercel 작업 끝나면 secret 더 이상 필요 X
    Set-Clipboard -Value " "
    Write-Host "  🔒 클립보드 정리 (secret 잔존 차단)." -ForegroundColor DarkGray
}

# ────────────────────────────────────────────────────────────
# 4. Vercel 재배포 trigger — 빈 commit push
# ────────────────────────────────────────────────────────────
Section "4. Vercel 재배포 trigger"

Push-Location $repoPath
try {
    git commit --allow-empty -m "chore(naver-extension): NAVER_EXTENSION_SECRET 회전 — Vercel redeploy trigger" | Out-Null
    if ($LASTEXITCODE -eq 0) {
        # `-c credential.helper=` (P1 codex fix) — GIT_TERMINAL_PROMPT 만으로는 GCM
        # browser popup 차단 못 함. helper 무력화로 캐시 없을 시 즉시 실패.
        git -c credential.helper= push origin master 2>&1 | Out-Null
        if ($LASTEXITCODE -eq 0) {
            Ok "빈 commit push 완료 — Vercel auto-deploy 시작 (대략 1~2분)"
        } else {
            Warn "git push 실패 (credentials 캐시 없음/네트워크). Vercel 대시보드에서 수동 Redeploy 권장."
        }
    } else {
        Warn "git commit 실패. Vercel 대시보드에서 수동 Redeploy 권장."
    }
} finally {
    Pop-Location
}
} # end if ($rotate)

# ────────────────────────────────────────────────────────────
# 5. Chrome Extension 로드 안내
# ────────────────────────────────────────────────────────────
Section "5. Extension 로드 (마지막 manual 단계)"

Set-Clipboard -Value $extPath
Write-Host "  📋 클립보드에 extension 폴더 경로 복사됨:" -ForegroundColor Yellow
Write-Host "    $extPath" -ForegroundColor White
Write-Host ""
Write-Host "  Chrome 이 곧 chrome://extensions/ 를 엽니다." -ForegroundColor Yellow
Write-Host ""
Write-Host "    [1] 우상단 '개발자 모드' 토글 ON" -ForegroundColor White
Write-Host "    [2] 좌상단 '압축해제된 확장 프로그램 로드' 클릭" -ForegroundColor White
Write-Host "    [3] 파일 다이얼로그에서 Ctrl+L → Ctrl+V → Enter (경로 붙여넣기)" -ForegroundColor White
Write-Host "    [4] Chrome 우상단 🧩 퍼즐 아이콘 → 'Keepioo Naver Publisher' 옆 📌 핀 클릭" -ForegroundColor White
Write-Host "    [5] 핀 고정한 아이콘 → popup → secret 자동 로드 확인 → 🧪 Dry-run 클릭" -ForegroundColor White
Write-Host ""

Start-Sleep -Seconds 2
Start-Process $chromeExe "chrome://extensions/"

Ok "셋업 종료. 위 5단계 완료 후 자동 발행 가동."
Write-Host ""
Write-Host "  📅 자동 발행 schedule: 매일 KST 09:30 / 12:30 / 15:30 / 18:30 / 21:30" -ForegroundColor Cyan
Write-Host "  (Chrome 가동 중일 때만. PC 24/7 가동 + Chrome 백그라운드 모드 권장)" -ForegroundColor Cyan

# 마지막 클립보드 정리 — Section 5 의 폴더 경로 잔존 차단
Set-Clipboard -Value " "
Write-Host ""
Write-Host "  🔒 클립보드 초기화 완료." -ForegroundColor DarkGray
