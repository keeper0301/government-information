// popup.js — KEEPIOO_SECRET 저장 + manual trigger

const statusEl = document.getElementById("status");
const secretEl = document.getElementById("secret");

function setStatus(msg) {
  statusEl.textContent = msg;
}

// ────────────────────────────────────────────────────────────
// 자동 부트스트랩 — extension 폴더의 local-secret.txt 가 있으면 한 번만 chrome.storage 로 옮김.
// setup-desktop.ps1 가 만들어주는 파일. 사장님 manual 입력 없이 popup 첫 open 에서 가동.
// ────────────────────────────────────────────────────────────
async function autoBootstrapSecret() {
  try {
    const url = chrome.runtime.getURL("local-secret.txt");
    const r = await fetch(url);
    if (!r.ok) return null;
    const txt = (await r.text()).trim();
    // 사장님이 직접 secret 입력했으면 (다름) 덮어쓰기 안 함 — 사장님 의도 우선
    const { keepioo_secret } = await chrome.storage.local.get(["keepioo_secret"]);
    if (keepioo_secret) return keepioo_secret;
    if (!txt) return null;
    await chrome.storage.local.set({ keepioo_secret: txt });
    return txt;
  } catch {
    return null;
  }
}

// 초기 상태 표시 — auto-bootstrap 우선, 없으면 기존 storage 값
(async () => {
  const auto = await autoBootstrapSecret();
  const secret = auto ?? (await chrome.storage.local.get(["keepioo_secret"])).keepioo_secret;
  if (secret) {
    secretEl.placeholder = `저장됨 (${secret.slice(0, 4)}...${secret.slice(-2)})`;
    if (auto) {
      setStatus(`✅ local-secret.txt 자동 로드됨 (${secret.slice(0, 4)}...${secret.slice(-2)})\n바로 🧪 Dry-run 가능.`);
    }
  }
})();

document.getElementById("save-secret").addEventListener("click", async () => {
  const v = secretEl.value.trim();
  if (!v) { setStatus("❌ secret 입력 필요"); return; }
  await chrome.storage.local.set({ keepioo_secret: v });
  setStatus(`✅ 저장 완료 (${v.slice(0, 4)}...${v.slice(-2)})`);
  secretEl.value = "";
});

document.getElementById("manual-dry-run").addEventListener("click", async () => {
  setStatus("🧪 dry-run 시작 — 약 60초 대기...");
  try {
    const r = await chrome.runtime.sendMessage({ type: "manual-trigger", dryRun: true });
    setStatus(formatResult(r));
  } catch (e) {
    setStatus(`❌ ${e?.message ?? e}`);
  }
});

document.getElementById("manual-publish").addEventListener("click", async () => {
  if (!confirm("실 발행 1건 진행합니다. 사장님 네이버 블로그에 글 게시. 진행할까요?")) return;
  setStatus("🚀 발행 시작 — 약 60초 대기...");
  try {
    const r = await chrome.runtime.sendMessage({ type: "manual-trigger", dryRun: false });
    setStatus(formatResult(r));
  } catch (e) {
    setStatus(`❌ ${e?.message ?? e}`);
  }
});

function formatResult(r) {
  if (!r) return "응답 없음";
  if (r.ok === false) return `❌ ${r.error ?? "unknown"}`;
  const result = r.result ?? {};
  if (result.skipped) return `⏸  skip: ${result.skipped}`;
  if (result.ok === false) return `❌ ${result.error ?? "unknown"}`;
  const inner = result.result ?? result;
  if (inner.dryRun) return `✅ dry-run OK\n${JSON.stringify(inner.debug, null, 2)}`;
  return `✅ 발행 성공\n${inner.naverUrl ?? "(URL 없음)"}\n${JSON.stringify(inner.debug, null, 2)}`;
}
