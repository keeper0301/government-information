// popup.js — KEEPIOO_SECRET 저장 + manual trigger

const statusEl = document.getElementById("status");
const secretEl = document.getElementById("secret");

function setStatus(msg) {
  statusEl.textContent = msg;
}

// ────────────────────────────────────────────────────────────
// 자동 부트스트랩 — extension 폴더의 local-secret.txt 가 source of truth.
// setup-desktop.ps1 가 만들어주는 파일. 사장님 manual 입력 없이 popup 첫 open 에서 가동.
//
// 정책 (P1 fix — codex review):
//   - local-secret.txt 가 있고 내용이 있으면: 항상 storage 와 동기화 (rotation 대응)
//   - local-secret.txt 가 없거나 비어있으면: storage 값 유지 (manual 설치 경로 보호)
// ────────────────────────────────────────────────────────────
async function autoBootstrapSecret() {
  try {
    const url = chrome.runtime.getURL("local-secret.txt");
    const r = await fetch(url);
    const { keepioo_secret } = await chrome.storage.local.get(["keepioo_secret"]);
    if (!r.ok) return { source: keepioo_secret ? "storage" : "none", value: keepioo_secret ?? null };
    const txt = (await r.text()).trim();
    if (!txt) return { source: keepioo_secret ? "storage" : "none", value: keepioo_secret ?? null };
    // local-secret.txt 가 진실원 — storage 와 다르면 덮어씀 (회전 시 stale 401 사고 차단)
    if (keepioo_secret !== txt) {
      await chrome.storage.local.set({ keepioo_secret: txt });
    }
    return { source: "file", value: txt };
  } catch {
    return { source: "none", value: null };
  }
}

// 초기 상태 표시 — auto-bootstrap 결과의 source 로 분기 (P1 fix: 거짓 status 차단)
(async () => {
  const result = await autoBootstrapSecret();
  const secret = result.value;
  if (secret) {
    secretEl.placeholder = `저장됨 (${secret.slice(0, 4)}...${secret.slice(-2)})`;
    if (result.source === "file") {
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
  await runDryRun();
});

async function runDryRun() {
  setStatus("🧪 dry-run 시작 — 약 60초 대기...");
  try {
    const r = await chrome.runtime.sendMessage({ type: "manual-trigger", dryRun: true });
    setStatus(formatResult(r));
  } catch (e) {
    setStatus(`❌ ${e?.message ?? e}`);
  }
}

if (new URLSearchParams(location.search).get("autoDryRun") === "1") {
  setTimeout(() => {
    runDryRun();
  }, 1000);
}

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
  if (result.ok === false) {
    return `❌ ${result.error ?? "unknown"}\n${JSON.stringify(result.debug ?? {}, null, 2)}`;
  }
  const inner = result.result ?? result;
  if (inner.dryRun) return `✅ dry-run OK\n${JSON.stringify(inner.debug, null, 2)}`;
  return `✅ 발행 성공\n${inner.naverUrl ?? "(URL 없음)"}\n${JSON.stringify(inner.debug, null, 2)}`;
}
