#!/usr/bin/env bash
# ============================================================
# keepioo Playwright 러너 — 한국 클라우드 VM 원클릭 셋업 (Ubuntu 기준)
# ============================================================
# 네이버 클라우드 Micro 등 한국 리전 Ubuntu 서버에서 1회 실행하면:
#   1) Node 20 설치
#   2) keepioo 공개 저장소 clone
#   3) Playwright + 풀 chromium 설치 (정적 collector 못 잡는 JS 렌더 시·군용)
#   4) 6시간마다 자동 수집 cron 등록 (KST 10/16/22/4)
#
# 실행:
#   curl -fsSL https://raw.githubusercontent.com/keeper0301/government-information/master/playwright/setup-vm.sh | bash -s -- <KEEPIOO_API_KEY>
#   또는: bash setup-vm.sh <KEEPIOO_API_KEY>
#
# <KEEPIOO_API_KEY> = Vercel 의 IMPORT_PRESS_API_KEY 환경변수 값 (사장님이 입력).
# ============================================================
set -euo pipefail

API_KEY="${1:-}"
if [ -z "$API_KEY" ]; then
  echo "❌ 사용법: bash setup-vm.sh <KEEPIOO_API_KEY>"
  echo "   (KEEPIOO_API_KEY = Vercel 의 IMPORT_PRESS_API_KEY 값)"
  exit 1
fi

REPO_DIR="$HOME/keepioo-runner"
APP_DIR="$REPO_DIR/playwright"
ENV_FILE="$APP_DIR/.runner-env"

echo "==> 1/5 시스템 패키지 + Node 20 설치"
sudo apt-get update -y
sudo apt-get install -y curl git
if ! command -v node >/dev/null 2>&1 || [ "$(node -v | cut -d. -f1 | tr -d v)" -lt 20 ]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi
echo "    node $(node -v)"

echo "==> 2/5 저장소 clone/업데이트 (공개 repo)"
if [ -d "$REPO_DIR/.git" ]; then
  git -C "$REPO_DIR" pull --ff-only
else
  git clone --depth 1 https://github.com/keeper0301/government-information.git "$REPO_DIR"
fi

echo "==> 3/5 Playwright 의존성 + chromium 설치 (시간 걸림)"
cd "$APP_DIR"
npm install --no-package-lock
npx playwright install --with-deps chromium

echo "==> 4/5 환경변수 파일 작성"
cat > "$ENV_FILE" <<EOF
KEEPIOO_API_URL=https://www.keepioo.com
KEEPIOO_API_KEY=$API_KEY
EOF
chmod 600 "$ENV_FILE"

echo "==> 5/5 6시간마다 cron 등록 (KST 10/16/22/4 = UTC 1/7/13/19)"
RUN_CMD="cd $APP_DIR && set -a && . $ENV_FILE && set +a && /usr/bin/node runner.mjs >> $APP_DIR/runner.log 2>&1"
CRON_LINE="0 1,7,13,19 * * * $RUN_CMD"
# 기존 동일 cron 제거 후 재등록 (중복 방지)
( crontab -l 2>/dev/null | grep -vF "$APP_DIR/runner.mjs" ; echo "$CRON_LINE" ) | crontab -

echo ""
echo "✅ 셋업 완료."
echo "   - 자동 수집: 매일 KST 10/16/22/4 (cron)"
echo "   - 로그: $APP_DIR/runner.log"
echo ""
echo "지금 1회 수동 테스트 실행:"
echo "   cd $APP_DIR && set -a && . $ENV_FILE && set +a && node runner.mjs"
