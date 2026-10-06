# 예약 실행 결과를 파일에 남기고 수집 도구의 성공 여부를 그대로 돌려줍니다.
param(
    [Parameter(Mandatory = $true)][string]$EnvironmentFile,
    [Parameter(Mandatory = $true)][string]$NodeExecutable,
    [Parameter(Mandatory = $true)][string]$LogDirectory
)

$ErrorActionPreference = 'Stop'
# 창 없이 실행해도 노드의 한국어 출력이 깨지지 않도록 문자 인코딩을 맞춥니다.
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$OutputEncoding = [Console]::OutputEncoding
$collectorPath = Join-Path $PSScriptRoot 'pc-press-recovery.cjs'
if (-not (Test-Path -LiteralPath $LogDirectory)) {
    New-Item -ItemType Directory -Path $LogDirectory -Force | Out-Null
}
$logPath = Join-Path $LogDirectory ('수집-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.log')
try {
    $environmentPath = (Resolve-Path -LiteralPath $EnvironmentFile).Path
    $nodePath = (Resolve-Path -LiteralPath $NodeExecutable).Path
    if (-not (Test-Path -LiteralPath $collectorPath -PathType Leaf)) {
        throw '개인 컴퓨터 수집 도구를 찾을 수 없습니다.'
    }
    Set-Location -LiteralPath (Split-Path $PSScriptRoot -Parent)
    # 노드의 경고 출력만으로 실패를 판단하지 않고 실제 종료 코드를 사용합니다.
    $ErrorActionPreference = 'Continue'
    try {
        & $nodePath "--env-file=$environmentPath" $collectorPath *>> $logPath
        $collectionExitCode = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = 'Stop'
    }
    exit $collectionExitCode
} catch {
    # 환경 설정과 실행 오류도 기록하며 비밀값의 내용을 읽거나 출력하지 않습니다.
    $_.Exception.Message | Add-Content -LiteralPath $logPath
    exit 1
}
