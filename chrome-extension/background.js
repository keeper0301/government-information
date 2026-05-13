// ============================================================
// Keepioo Naver Publisher - Background Service Worker (Manifest V3)
// ============================================================
// chrome.alarms 매일 5회 KST 09:30 ~ 21:30 발화.
// 각 발화 시:
//   1) keepioo /api/naver-extension/next — 큐 글 1건 (시간대·cap 검사 포함)
//   2) chrome.tabs.create({active:false}) — naver 글쓰기 페이지 invisible tab
//   3) chrome.tabs.sendMessage — content.js 에 publish payload 전달
//   4) 결과 받고 → keepioo /api/naver-extension/published 보고 → tab close
//
// 보안: chrome.storage.sync 에 KEEPIOO_SECRET (사장님 1회 popup 에서 입력).
// ============================================================

const KEEPIOO_BASE = "https://www.keepioo.com";

// 5 schedule — 각 시간 fire (KST). chrome.alarms 는 UTC 기준이지만 우리는
// when 으로 next 시점 계산.
const SCHEDULES = [
  { name: "naver-0930", hour: 9, minute: 30 },
  { name: "naver-1230", hour: 12, minute: 30 },
  { name: "naver-1530", hour: 15, minute: 30 },
  { name: "naver-1830", hour: 18, minute: 30 },
  { name: "naver-2130", hour: 21, minute: 30 },
];

// 다음 KST hh:mm 의 epoch ms
function nextKstFire(hour, minute) {
  const now = new Date();
  const kstNow = new Date(now.getTime() + 9 * 3600_000);
  const kstTarget = new Date(Date.UTC(
    kstNow.getUTCFullYear(),
    kstNow.getUTCMonth(),
    kstNow.getUTCDate(),
    hour,
    minute,
    0,
  ));
  let targetEpoch = kstTarget.getTime() - 9 * 3600_000;
  if (targetEpoch <= now.getTime()) {
    targetEpoch += 24 * 3600_000;
  }
  return targetEpoch;
}

async function registerAlarms() {
  for (const s of SCHEDULES) {
    await chrome.alarms.create(s.name, {
      when: nextKstFire(s.hour, s.minute),
      periodInMinutes: 24 * 60, // 24h 반복
    });
  }
  console.log("[keepioo-naver] 5 alarms registered");
}

chrome.runtime.onInstalled.addListener(() => registerAlarms());
chrome.runtime.onStartup.addListener(() => registerAlarms());

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (!alarm.name.startsWith("naver-")) return;
  console.log(`[keepioo-naver] alarm fire: ${alarm.name}`);
  await runPublishOnce(false);
});

// popup 에서 사장님 manual trigger
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "manual-trigger") {
    runPublishOnce(msg.dryRun === true)
      .then((r) => sendResponse({ ok: true, result: r }))
      .catch((e) => sendResponse({ ok: false, error: e?.message ?? String(e) }));
    return true; // async
  }
  return false;
});

async function getSecret() {
  const { keepioo_secret } = await chrome.storage.sync.get(["keepioo_secret"]);
  if (!keepioo_secret) throw new Error("KEEPIOO_SECRET 미설정 — popup 에서 입력 필요");
  return keepioo_secret;
}

async function runPublishOnce(dryRun = false) {
  const secret = await getSecret();
  const force = dryRun ? "?force=1" : "";

  // 1. 큐 조회
  const nextRes = await fetch(`${KEEPIOO_BASE}/api/naver-extension/next${force}`, {
    headers: { Authorization: `Bearer ${secret}` },
  });
  if (!nextRes.ok) throw new Error(`/next ${nextRes.status}`);
  const next = await nextRes.json();
  console.log("[keepioo-naver] next:", next.status);

  if (next.status !== "ready") {
    // outside_hours / daily_cap_reached / no_pending — 정상 skip
    return { skipped: next.status };
  }

  // 2. invisible tab 으로 글쓰기 페이지 열기
  const tab = await chrome.tabs.create({
    url: "https://blog.naver.com/GoBlogWrite.naver",
    active: false,
  });

  // 3. tab 로드 대기 (max 30s)
  const ready = await waitForTabReady(tab.id, 30000);
  if (!ready) {
    await chrome.tabs.remove(tab.id).catch(() => undefined);
    throw new Error("글쓰기 페이지 로드 timeout");
  }
  // content.js inject 대기 (manifest 의 document_idle)
  await new Promise((r) => setTimeout(r, 3000));

  // 4. content.js 에 publish 명령
  let result;
  try {
    result = await chrome.tabs.sendMessage(tab.id, {
      type: "naver-publish",
      payload: next,
      dryRun,
    });
  } catch (e) {
    await chrome.tabs.remove(tab.id).catch(() => undefined);
    throw new Error(`content.js 메시지 fail: ${e?.message ?? e}`);
  }

  // 5. 결과 keepioo 보고
  if (result?.ok) {
    const r = result.result;
    await fetch(`${KEEPIOO_BASE}/api/naver-extension/published`, {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        queueId: next.queueId,
        blogPostId: next.blogPostId,
        result: dryRun ? "skipped" : "success",
        naverUrl: r.naverUrl ?? null,
        skipReason: dryRun ? "dry_run" : null,
        details: r.debug,
      }),
    });
  } else {
    await fetch(`${KEEPIOO_BASE}/api/naver-extension/published`, {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        queueId: next.queueId,
        blogPostId: next.blogPostId,
        result: "fail",
        errorMessage: result?.error ?? "unknown",
      }),
    });
  }

  // 6. tab close (사장님 작업 방해 X)
  await chrome.tabs.remove(tab.id).catch(() => undefined);
  return result;
}

function waitForTabReady(tabId, timeoutMs) {
  return new Promise((resolve) => {
    const start = Date.now();
    const check = () => {
      chrome.tabs.get(tabId, (tab) => {
        if (chrome.runtime.lastError) { resolve(false); return; }
        if (tab.status === "complete") { resolve(true); return; }
        if (Date.now() - start > timeoutMs) { resolve(false); return; }
        setTimeout(check, 500);
      });
    };
    check();
  });
}
