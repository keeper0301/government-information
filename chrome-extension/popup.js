// popup.js — KEEPIOO_SECRET 저장 + manual trigger

const statusEl = document.getElementById("status");
const secretEl = document.getElementById("secret");

function setStatus(msg) {
  statusEl.textContent = msg;
}

// 기존 저장된 secret 표시 (마스크)
chrome.storage.local.get(["keepioo_secret"]).then(({ keepioo_secret }) => {
  if (keepioo_secret) {
    secretEl.placeholder = `저장됨 (${keepioo_secret.slice(0, 4)}...${keepioo_secret.slice(-2)})`;
  }
});

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
