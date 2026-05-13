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
// 보안: chrome.storage.local 에 KEEPIOO_SECRET (사장님 1회 popup 에서 입력).
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
// 한국은 DST (서머타임) 없음 → UTC+9 고정. 단순 9*3600s offset 사용 안전.
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

/**
 * fail audit 보고 (W-1 fix) — 사고 시 keepioo published API 에 result='fail' 기록.
 * 매번 catch 분기에서 호출. 실패해도 throw 안 함 (cleanup 우선).
 */
async function reportFail(secret, next, errorMessage) {
  try {
    await fetch(`${KEEPIOO_BASE}/api/naver-extension/published`, {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        queueId: next?.queueId,
        blogPostId: next?.blogPostId,
        result: "fail",
        errorMessage: String(errorMessage ?? "unknown").slice(0, 500),
      }),
    });
  } catch (e) {
    console.warn("[keepioo-naver] reportFail error:", e?.message);
  }
}

async function getSecret() {
  const { keepioo_secret } = await chrome.storage.local.get(["keepioo_secret"]);
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

  // 2. background window 로 글쓰기 페이지 열기 (focused:false).
  //    visibility='visible' 유지 (naver 봇 탐지 회피).
  //    minimize 는 inject 후로 미룸 — 즉시 minimize 하면 content.js inject 가
  //    abort 될 가능성 (Could not establish connection 사고).
  const win = await chrome.windows.create({
    url: "https://blog.naver.com/GoBlogWrite.naver",
    focused: false,
  });
  const tab = win.tabs?.[0];
  if (!tab) throw new Error("window.tabs[0] 없음");

  // 3. tab 로드 대기 (max 30s)
  const ready = await waitForTabReady(tab.id, 30000);
  if (!ready) {
    await chrome.windows.remove(win.id).catch(() => undefined);
    throw new Error("글쓰기 페이지 로드 timeout");
  }
  // tab.url 검증 — cookies 만료 시 naver 로그인 페이지로 redirect (C-2 fix).
  // blog.naver.com 외 페이지면 cookies 만료. content.js inject 의미 X.
  const finalTab = await chrome.tabs.get(tab.id);
  if (!finalTab.url || !finalTab.url.includes("blog.naver.com")) {
    await chrome.windows.remove(win.id).catch(() => undefined);
    // fail audit 보고 (W-1 fix)
    await reportFail(secret, next, `cookies 만료 의심: redirect to ${finalTab.url?.slice(0, 100)}`);
    throw new Error(`cookies 만료 — naver 로그인 redirect (${finalTab.url?.slice(0, 60)})`);
  }

  // 4. content.js 강제 inject — manifest content_scripts 가 background window 에서
  //    안정적이지 못한 사고 (Receiving end does not exist) → executeScript 로 직접 inject.
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["content.js"],
    });
    console.log("[keepioo-naver] content.js executeScript injected");
  } catch (e) {
    console.warn("[keepioo-naver] executeScript fail:", e?.message);
  }
  // listener 등록 대기
  await new Promise((r) => setTimeout(r, 2000));

  // 5. minimize — content.js inject 끝난 후 (사장님 작업 방해 ↓)
  await chrome.windows.update(win.id, { state: "minimized" }).catch(() => undefined);

  // 6. content.js 에 publish 명령 — retry 패턴
  let result;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      result = await chrome.tabs.sendMessage(tab.id, {
        type: "naver-publish",
        payload: next,
        dryRun,
      });
      break;
    } catch (e) {
      if (attempt === 3) {
        await chrome.windows.remove(win.id).catch(() => undefined);
        // fail audit 보고 (W-1 fix) — throw 전 audit 남김
        await reportFail(secret, next, `sendMessage fail x3: ${e?.message ?? e}`);
        throw new Error(`content.js 메시지 fail (3 attempts): ${e?.message ?? e}`);
      }
      console.warn(`[keepioo-naver] sendMessage attempt ${attempt} fail, retry...`);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  // 7. 결과 keepioo 보고
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

  // 8. window close (사장님 작업 방해 X)
  await chrome.windows.remove(win.id).catch(() => undefined);
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
