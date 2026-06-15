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
const NAVER_WRITE = "https://blog.naver.com/GoBlogWrite.naver";

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
  await runPublishBatch(false, {
    allowLoginWait: false,
    batchLimit: 3,
    stopOnFail: true,
    source: alarm.name,
  });
});

// popup 에서 사장님 manual trigger
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "manual-trigger") {
    runPublishOnce(msg.dryRun === true, { allowLoginWait: true })
      .then((r) => sendResponse({ ok: true, result: r }))
      .catch((e) => sendResponse({ ok: false, error: e?.message ?? String(e) }));
    return true; // async
  }
  if (msg?.type === "manual-batch") {
    runPublishBatch(false, {
      allowLoginWait: true,
      batchLimit: Number(msg.batchLimit ?? 7),
      stopOnFail: true,
      source: "manual-batch",
    })
      .then((r) => sendResponse({ ok: true, result: r }))
      .catch((e) => sendResponse({ ok: false, error: e?.message ?? String(e) }));
    return true; // async
  }
  if (msg?.type === "debugger-paste") {
    const tabId = _sender?.tab?.id;
    if (!tabId) {
      sendResponse({ ok: false, error: "sender tab id 없음" });
      return false;
    }
    dispatchCtrlV(tabId)
      .then(() => sendResponse({ ok: true }))
      .catch((e) => sendResponse({ ok: false, error: e?.message ?? String(e) }));
    return true;
  }
  if (msg?.type === "debugger-insert-text") {
    const tabId = _sender?.tab?.id;
    if (!tabId) {
      sendResponse({ ok: false, error: "sender tab id 없음" });
      return false;
    }
    insertTextViaDebugger(tabId, String(msg.text ?? ""))
      .then(() => sendResponse({ ok: true }))
      .catch((e) => sendResponse({ ok: false, error: e?.message ?? String(e) }));
    return true;
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
        details: { stage: "background_fail" },
      }),
    });
  } catch (e) {
    console.warn("[keepioo-naver] reportFail error:", e?.message);
  }
}

async function dispatchCtrlV(tabId) {
  const target = { tabId };
  let attached = false;
  try {
    await debuggerAttach(target);
    attached = true;
    await debuggerSendCommand(target, "Input.dispatchKeyEvent", {
      type: "keyDown",
      key: "Control",
      code: "ControlLeft",
      windowsVirtualKeyCode: 17,
      nativeVirtualKeyCode: 17,
      modifiers: 2,
    });
    await debuggerSendCommand(target, "Input.dispatchKeyEvent", {
      type: "keyDown",
      key: "v",
      code: "KeyV",
      windowsVirtualKeyCode: 86,
      nativeVirtualKeyCode: 86,
      modifiers: 2,
      commands: ["paste"],
    });
    await debuggerSendCommand(target, "Input.dispatchKeyEvent", {
      type: "keyUp",
      key: "v",
      code: "KeyV",
      windowsVirtualKeyCode: 86,
      nativeVirtualKeyCode: 86,
      modifiers: 2,
    });
    await debuggerSendCommand(target, "Input.dispatchKeyEvent", {
      type: "keyUp",
      key: "Control",
      code: "ControlLeft",
      windowsVirtualKeyCode: 17,
      nativeVirtualKeyCode: 17,
      modifiers: 0,
    });
  } finally {
    if (attached) await debuggerDetach(target).catch(() => undefined);
  }
}

async function insertTextViaDebugger(tabId, text) {
  const target = { tabId };
  let attached = false;
  try {
    await debuggerAttach(target);
    attached = true;
    await debuggerSendCommand(target, "Input.insertText", { text });
  } finally {
    if (attached) await debuggerDetach(target).catch(() => undefined);
  }
}

function debuggerAttach(target) {
  return new Promise((resolve, reject) => {
    chrome.debugger.attach(target, "1.3", () => {
      const err = chrome.runtime.lastError;
      if (err) reject(new Error(err.message));
      else resolve();
    });
  });
}

function debuggerSendCommand(target, method, params) {
  return new Promise((resolve, reject) => {
    chrome.debugger.sendCommand(target, method, params, (result) => {
      const err = chrome.runtime.lastError;
      if (err) reject(new Error(err.message));
      else resolve(result);
    });
  });
}

function debuggerDetach(target) {
  return new Promise((resolve, reject) => {
    chrome.debugger.detach(target, () => {
      const err = chrome.runtime.lastError;
      if (err) reject(new Error(err.message));
      else resolve();
    });
  });
}

async function getSecret() {
  const { keepioo_secret } = await chrome.storage.local.get(["keepioo_secret"]);
  if (!keepioo_secret) throw new Error("KEEPIOO_SECRET 미설정 — popup 에서 입력 필요");
  return keepioo_secret;
}

async function runPublishBatch(dryRun = false, options = {}) {
  const batchLimit = Math.max(1, Math.min(Number(options.batchLimit ?? 1), 7));
  const stopOnFail = options.stopOnFail !== false;
  const results = [];
  for (let i = 0; i < batchLimit; i++) {
    let item;
    try {
      item = await runPublishOnce(dryRun, options);
    } catch (e) {
      results.push({ ok: false, error: e?.message ?? String(e) });
      if (stopOnFail) break;
      continue;
    }
    results.push(item);
    if (dryRun || item?.skipped) break;
    const inner = item?.result ?? item;
    if (inner?.dryRun || item?.ok === false) break;
    // 네이버/서버 rate limit 완충. 한 alarm 에서 여러 건 처리해도 사람 조작에
    // 가까운 속도로 유지하고, naver_publish_audit 반영 시간을 준다.
    await new Promise((r) => setTimeout(r, 5000));
  }
  return {
    batch: true,
    source: options.source ?? "unknown",
    attempted: results.filter((r) => !r?.skipped).length,
    published: results.filter((r) => {
      const inner = r?.result ?? r;
      return r?.ok !== false && !r?.skipped && !inner?.dryRun;
    }).length,
    stoppedReason: results.at(-1)?.skipped ?? (results.at(-1)?.ok === false ? "fail" : "limit"),
    results,
  };
}

async function runPublishOnce(dryRun = false, options = {}) {
  const allowLoginWait = options.allowLoginWait === true;
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
    url: NAVER_WRITE,
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
  // Naver login redirect can happen just after the first complete event.
  await new Promise((r) => setTimeout(r, 3000));
  // tab.url 검증 — cookies 만료 시 naver 로그인 페이지로 redirect (C-2 fix).
  // blog.naver.com 외 페이지면 cookies 만료. content.js inject 의미 X.
  const finalTab = await chrome.tabs.get(tab.id);
  if (
    !finalTab.url ||
    finalTab.url.includes("nid.naver.com/nidlogin") ||
    !finalTab.url.includes("blog.naver.com")
  ) {
    if (!allowLoginWait) {
      await chrome.windows.remove(win.id).catch(() => undefined);
      // fail audit 보고 (W-1 fix)
      await reportFail(secret, next, `cookies 만료 의심: redirect to ${finalTab.url?.slice(0, 100)}`);
      throw new Error(`cookies 만료 — naver 로그인 redirect (${finalTab.url?.slice(0, 60)})`);
    }

    console.log("[keepioo-naver] login required; waiting for manual login in same window");
    await chrome.windows.update(win.id, { focused: true, state: "normal" }).catch(() => undefined);
    const loginOk = await waitForNaverLoginThenReopenWriter(tab.id, 10 * 60_000);
    if (!loginOk) {
      await chrome.windows.remove(win.id).catch(() => undefined);
      await reportFail(secret, next, `login wait timeout: ${finalTab.url?.slice(0, 100)}`);
      throw new Error("네이버 로그인 대기 timeout — 같은 창에서 로그인 후 다시 시도");
    }
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

  // 5. activate — paste fail 가설 검증 (minimized 의 hasFocus=false 가
  //    SE3 paste fail 원인 의심). 안정 후 minimized 복귀 예정.
  await chrome.windows.update(win.id, { focused: true, state: "normal" }).catch(() => undefined);

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
    const failDetails = result?.debug && typeof result.debug === "object"
      ? { stage: "content_fail", ...result.debug }
      : { stage: "content_fail" };
    await fetch(`${KEEPIOO_BASE}/api/naver-extension/published`, {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        queueId: next.queueId,
        blogPostId: next.blogPostId,
        result: "fail",
        errorMessage: result?.error ?? "unknown",
        details: failDetails,
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

async function waitForNaverLoginThenReopenWriter(tabId, timeoutMs) {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const tab = await chrome.tabs.get(tabId).catch(() => null);
    const url = tab?.url ?? "";

    // 로그인 성공 직후 네이버가 블로그 홈/Redirect=Write 로 보낼 수 있어
    // 글쓰기 URL을 다시 열어 SmartEditor iframe 이 뜨는 상태로 수렴시킨다.
    if (url.includes("blog.naver.com") && !url.includes("nid.naver.com")) {
      await chrome.tabs.update(tabId, { url: NAVER_WRITE }).catch(() => undefined);
      const ready = await waitForTabReady(tabId, 30_000);
      if (!ready) return false;
      await new Promise((r) => setTimeout(r, 3_000));

      const finalTab = await chrome.tabs.get(tabId).catch(() => null);
      const finalUrl = finalTab?.url ?? "";
      return finalUrl.includes("blog.naver.com") && !finalUrl.includes("nid.naver.com");
    }

    await new Promise((r) => setTimeout(r, 1_000));
  }

  return false;
}
