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
const NAVER_WRITE = "https://blog.naver.com/leclerc23?Redirect=Write";
const UPDATE_ALARM = "extension-update-check";
const UPDATE_CHECK_INTERVAL_MINUTES = 6 * 60;
let activeManualTrigger = null;
let activeManualTriggerStartedAt = 0;

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
  await chrome.alarms.create(UPDATE_ALARM, {
    delayInMinutes: 5,
    periodInMinutes: UPDATE_CHECK_INTERVAL_MINUTES,
  });
  console.log("[keepioo-naver] 5 publish alarms + update alarm registered");
}

async function safeRegisterAlarms(reason) {
  try {
    await registerAlarms();
  } catch (e) {
    console.warn(`[keepioo-naver] alarm registration failed (${reason}):`, e?.message);
    await chrome.storage.local.set({
      alarm_status: {
        ok: false,
        reason,
        checkedAt: new Date().toISOString(),
        error: e?.message ?? String(e),
      },
    }).catch(() => undefined);
  }
}

chrome.runtime.onInstalled.addListener((details) => {
  safeRegisterAlarms(`installed:${details.reason}`);
  if (details.reason === "update") {
    chrome.storage.local.set({
      update_status: {
        status: "updated",
        version: chrome.runtime.getManifest().version,
        previousVersion: details.previousVersion ?? null,
        checkedAt: new Date().toISOString(),
        message: `업데이트 완료: ${details.previousVersion ?? "unknown"} → ${chrome.runtime.getManifest().version}`,
      },
    }).catch(() => undefined);
  }
});
chrome.runtime.onStartup.addListener(() => {
  safeRegisterAlarms("startup");
  checkForExtensionUpdate({ reason: "startup" }).catch((e) => console.warn("[keepioo-naver] startup update check failed:", e?.message));
});

chrome.alarms.onAlarm.addListener((alarm) => {
  handleAlarm(alarm).catch((e) => console.warn(`[keepioo-naver] alarm handler failed (${alarm?.name ?? "unknown"}):`, e?.message));
});

async function handleAlarm(alarm) {
  if (alarm.name === UPDATE_ALARM) {
    await checkForExtensionUpdate({ reason: "alarm" });
    return;
  }
  if (!alarm.name.startsWith("naver-")) return;
  console.log(`[keepioo-naver] alarm fire: ${alarm.name}`);
  const liveGate = await chrome.storage.local.get("naver_live_alarm_enabled").catch(() => ({}));
  if (liveGate?.naver_live_alarm_enabled !== true) {
    const result = {
      batch: true,
      source: alarm.name,
      attempted: 0,
      published: 0,
      stoppedReason: "live_alarm_disabled",
      results: [{ skipped: "live_alarm_disabled" }],
    };
    await chrome.storage.local.set({
      last_publish_alarm_gate: {
        name: alarm.name,
        checkedAt: new Date().toISOString(),
        liveAlarmEnabled: false,
        safety: "fresh approval required before scheduled live publish",
      },
    }).catch(() => undefined);
    await chrome.storage.local.set({
      last_publish_alarm: {
        name: alarm.name,
        checkedAt: new Date().toISOString(),
        attempted: result.attempted,
        published: result.published,
        stoppedReason: result.stoppedReason,
      },
    }).catch(() => undefined);
    return;
  }
  const result = await runPublishBatch(false, {
    allowLoginWait: false,
    // Scheduled live alarms must not open a fresh Naver writer window when the
    // account session is stale. Naver often redirects fresh background windows to
    // nidlogin, which creates noisy fail audits and can leave login tabs behind.
    // Require an already logged-in SmartEditor writer tab; manual dry-run remains
    // the operator path for refreshing that session.
    reuseExistingWriter: true,
    requireExistingWriter: true,
    batchLimit: 3,
    stopOnFail: true,
    source: alarm.name,
  });
  await chrome.storage.local.set({
    last_publish_alarm: {
      name: alarm.name,
      checkedAt: new Date().toISOString(),
      attempted: result?.attempted ?? 0,
      published: result?.published ?? 0,
      stoppedReason: result?.stoppedReason ?? null,
    },
  }).catch(() => undefined);
}

// popup 에서 사장님 manual trigger
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "manual-trigger") {
    if (activeManualTrigger) {
      const activeAgeMs = Date.now() - activeManualTriggerStartedAt;
      if (msg.forceResetActive === true || activeAgeMs > 240_000) {
        setManualPublishStatusBestEffort("manual_trigger_stale_reset", { activeAgeMs, forceResetActive: msg.forceResetActive === true });
        activeManualTrigger = null;
        activeManualTriggerStartedAt = 0;
      } else {
        promiseWithTimeout(activeManualTrigger, 1_000, "기존 manual-trigger 실행 중")
          .then((r) => sendResponse({ ok: true, result: r }))
          .catch(() => sendResponse({ ok: false, error: "기존 manual-trigger 실행 중 — 이전 dry-run이 아직 종료되지 않았습니다", activeAgeMs }));
        return true;
      }
    }
    // Popup/manual runs keep the old behavior: wait for the owner to log in.
    // Headless cron triggers pass allowLoginWait:false so they fail fast and
    // report a clear blocker instead of exceeding Hermes cron's 120s limit.
    // If the owner already has a logged-in writer tab open, cron can reuse it
    // instead of opening a fresh window that Naver may challenge again.
    const run = promiseWithTimeout(runPublishOnceWithFreshWriterRetry(msg.dryRun === true, {
      allowLoginWait: msg.allowLoginWait !== false,
      reuseExistingWriter: msg.reuseExistingWriter === true,
      requireExistingWriter: msg.requireExistingWriter === true,
      forceNext: msg.forceNext === true,
    }), 210_000, "manual-trigger 전체 timeout");
    activeManualTrigger = run;
    activeManualTriggerStartedAt = Date.now();
    run
      .then((r) => sendResponse({ ok: true, result: r }))
      .catch((e) => sendResponse({ ok: false, error: e?.message ?? String(e) }))
      .finally(() => { activeManualTrigger = null; activeManualTriggerStartedAt = 0; });
    return true; // async
  }
  if (msg?.type === "manual-edit-post") {
    promiseWithTimeout(runEditPost(msg), 240_000, "manual-edit-post 전체 timeout")
      .then((r) => sendResponse({ ok: true, result: r }))
      .catch((e) => sendResponse({ ok: false, error: e?.message ?? String(e), debug: e?.debug ?? null }));
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
  if (msg?.type === "check-update") {
    checkForExtensionUpdate({ reason: msg.reason ?? "manual", force: msg.force === true })
      .then((r) => sendResponse({ ok: true, result: r }))
      .catch((e) => sendResponse({ ok: false, error: e?.message ?? String(e) }));
    return true; // async
  }
  if (msg?.type === "get-update-status") {
    getUpdateStatus()
      .then((r) => sendResponse({ ok: true, result: r }))
      .catch((e) => sendResponse({ ok: false, error: e?.message ?? String(e) }));
    return true; // async
  }
  if (msg?.type === "naver-progress") {
    setManualPublishStatus(msg.stage || "content_progress", msg.details || {})
      .then(() => sendResponse({ ok: true }))
      .catch((e) => sendResponse({ ok: false, error: e?.message ?? String(e) }));
    return true;
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
  if (msg?.type === "debugger-select-all-delete") {
    const tabId = _sender?.tab?.id;
    if (!tabId) {
      sendResponse({ ok: false, error: "sender tab id 없음" });
      return false;
    }
    const x = Number(msg.x);
    const y = Number(msg.y);
    (Number.isFinite(x) && Number.isFinite(y)
      ? clickAndSelectAllDelete(tabId, x, y)
      : dispatchSelectAllDelete(tabId))
      .then(() => sendResponse({ ok: true }))
      .catch((e) => sendResponse({ ok: false, error: e?.message ?? String(e) }));
    return true;
  }
  if (msg?.type === "debugger-click-paste") {
    const tabId = _sender?.tab?.id;
    if (!tabId) {
      sendResponse({ ok: false, error: "sender tab id 없음" });
      return false;
    }
    clickAndPasteViaDebugger(tabId, Number(msg.x), Number(msg.y))
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
  if (msg?.type === "debugger-click-insert-text") {
    const tabId = _sender?.tab?.id;
    if (!tabId) {
      sendResponse({ ok: false, error: "sender tab id 없음" });
      return false;
    }
    clickAndInsertTextViaDebugger(tabId, Number(msg.x), Number(msg.y), String(msg.text ?? ""))
      .then(() => sendResponse({ ok: true }))
      .catch((e) => sendResponse({ ok: false, error: e?.message ?? String(e) }));
    return true;
  }
  if (msg?.type === "debugger-click") {
    const tabId = _sender?.tab?.id;
    if (!tabId) {
      sendResponse({ ok: false, error: "sender tab id 없음" });
      return false;
    }
    clickViaDebugger(tabId, Number(msg.x), Number(msg.y))
      .then(() => sendResponse({ ok: true }))
      .catch((e) => sendResponse({ ok: false, error: e?.message ?? String(e) }));
    return true;
  }
  if (msg?.type === "debugger-key") {
    const tabId = _sender?.tab?.id;
    if (!tabId) {
      sendResponse({ ok: false, error: "sender tab id 없음" });
      return false;
    }
    pressKeyViaDebugger(tabId, String(msg.key || "Enter"))
      .then(() => sendResponse({ ok: true }))
      .catch((e) => sendResponse({ ok: false, error: e?.message ?? String(e) }));
    return true;
  }
  return false;
});

async function clickViaDebugger(tabId, x, y) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error("invalid click coordinates");
  const target = { tabId };
  let attached = false;
  try {
    await debuggerAttach(target);
    attached = true;
    await debuggerSendCommand(target, "Input.dispatchMouseEvent", { type: "mouseMoved", x, y, button: "none", buttons: 0 });
    await debuggerSendCommand(target, "Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", buttons: 1, clickCount: 1 });
    await debuggerSendCommand(target, "Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", buttons: 0, clickCount: 1 });
  } finally {
    if (attached) await debuggerDetach(target).catch(() => undefined);
  }
}

async function pressKeyViaDebugger(tabId, key) {
  const normalized = key === " " || /^space$/i.test(key) ? "Space" : key;
  const keyMap = {
    Enter: { key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 },
    Space: { key: " ", code: "Space", windowsVirtualKeyCode: 32, nativeVirtualKeyCode: 32 },
  };
  const spec = keyMap[normalized];
  if (!spec) throw new Error(`unsupported debugger key: ${key}`);
  const target = { tabId };
  let attached = false;
  try {
    await debuggerAttach(target);
    attached = true;
    await debuggerSendCommand(target, "Input.dispatchKeyEvent", { type: "keyDown", ...spec });
    await debuggerSendCommand(target, "Input.dispatchKeyEvent", { type: "keyUp", ...spec });
  } finally {
    if (attached) await debuggerDetach(target).catch(() => undefined);
  }
}

/**
 * fail audit 보고 (W-1 fix) — 사고 시 keepioo published API 에 result='fail' 기록.
 * 매번 catch 분기에서 호출. 실패해도 throw 안 함 (cleanup 우선).
 */
async function reportFail(secret, next, errorMessage) {
  try {
    await postPublishedAudit(secret, {
      queueId: next?.queueId,
      blogPostId: next?.blogPostId,
      result: "fail",
      errorMessage: String(errorMessage ?? "unknown").slice(0, 500),
      details: { stage: "background_fail" },
    }, "background_fail");
  } catch (e) {
    console.warn("[keepioo-naver] reportFail error:", e?.message);
  }
}

async function postPublishedAudit(secret, payload, stage) {
  try {
    const res = await fetchWithTimeout(`${KEEPIOO_BASE}/api/naver-extension/published`, {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }, 12_000);
    if (!res.ok) {
      console.warn(`[keepioo-naver] published audit ${stage} HTTP ${res.status}`);
      return false;
    }
    return true;
  } catch (e) {
    console.warn(`[keepioo-naver] published audit ${stage} timeout/error:`, e?.message);
    await setManualPublishStatus("published_audit_error", { stage, error: e?.message ?? String(e) });
    return false;
  }
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 15_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function clickAndSelectAllDelete(tabId, x, y) {
  const target = { tabId };
  let attached = false;
  try {
    await debuggerAttach(target);
    attached = true;
    await debuggerSendCommand(target, "Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
    await debuggerSendCommand(target, "Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
    await new Promise((r) => setTimeout(r, 150));
    await dispatchSelectAllDeleteWithAttached(target);
  } finally {
    if (attached) await debuggerDetach(target).catch(() => undefined);
  }
}

async function dispatchSelectAllDelete(tabId) {
  const target = { tabId };
  let attached = false;
  try {
    await debuggerAttach(target);
    attached = true;
    await dispatchSelectAllDeleteWithAttached(target);
  } finally {
    if (attached) await debuggerDetach(target).catch(() => undefined);
  }
}

async function dispatchSelectAllDeleteWithAttached(target) {
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
    key: "a",
    code: "KeyA",
    windowsVirtualKeyCode: 65,
    nativeVirtualKeyCode: 65,
    modifiers: 2,
    commands: ["selectAll"],
  });
  await debuggerSendCommand(target, "Input.dispatchKeyEvent", {
    type: "keyUp",
    key: "a",
    code: "KeyA",
    windowsVirtualKeyCode: 65,
    nativeVirtualKeyCode: 65,
    modifiers: 2,
  });
  await debuggerSendCommand(target, "Input.dispatchKeyEvent", {
    type: "keyUp",
    key: "Control",
    code: "ControlLeft",
    windowsVirtualKeyCode: 17,
    nativeVirtualKeyCode: 17,
  });
  await new Promise((r) => setTimeout(r, 150));
  await debuggerSendCommand(target, "Input.dispatchKeyEvent", {
    type: "keyDown",
    key: "Backspace",
    code: "Backspace",
    windowsVirtualKeyCode: 8,
    nativeVirtualKeyCode: 8,
  });
  await debuggerSendCommand(target, "Input.dispatchKeyEvent", {
    type: "keyUp",
    key: "Backspace",
    code: "Backspace",
    windowsVirtualKeyCode: 8,
  });
}

async function clickAndPasteViaDebugger(tabId, x, y) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error("invalid click coordinates");
  const target = { tabId };
  let attached = false;
  try {
    await debuggerAttach(target);
    attached = true;
    await debuggerSendCommand(target, "Input.dispatchMouseEvent", { type: "mouseMoved", x, y, button: "none", buttons: 0 });
    await debuggerSendCommand(target, "Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", buttons: 1, clickCount: 1 });
    await debuggerSendCommand(target, "Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", buttons: 0, clickCount: 1 });
    await new Promise((r) => setTimeout(r, 250));
    await dispatchCtrlVWithAttached(target);
  } finally {
    if (attached) await debuggerDetach(target).catch(() => undefined);
  }
}

async function dispatchCtrlV(tabId) {
  const target = { tabId };
  let attached = false;
  try {
    await debuggerAttach(target);
    attached = true;
    await dispatchCtrlVWithAttached(target);
  } finally {
    if (attached) await debuggerDetach(target).catch(() => undefined);
  }
}

async function dispatchCtrlVWithAttached(target) {
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
}

async function insertTextViaDebugger(tabId, text) {
  const target = { tabId };
  let attached = false;
  try {
    await debuggerAttach(target);
    attached = true;
    await insertTextViaDebuggerChunks(target, text);
  } finally {
    if (attached) await debuggerDetach(target).catch(() => undefined);
  }
}

async function clickAndInsertTextViaDebugger(tabId, x, y, text) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error("invalid click coordinates");
  const target = { tabId };
  let attached = false;
  try {
    await debuggerAttach(target);
    attached = true;
    await debuggerSendCommand(target, "Input.dispatchMouseEvent", { type: "mouseMoved", x, y, button: "none", buttons: 0 });
    await debuggerSendCommand(target, "Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", buttons: 1, clickCount: 1 });
    await debuggerSendCommand(target, "Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", buttons: 0, clickCount: 1 });
    await new Promise((r) => setTimeout(r, 250));
    await insertTextViaDebuggerChunks(target, text);
  } finally {
    if (attached) await debuggerDetach(target).catch(() => undefined);
  }
}

async function insertTextViaDebuggerChunks(target, text) {
  const value = String(text ?? "").replace(/\r\n?/g, "\n");
  // Large Input.insertText payloads can silently truncate in Naver SmartEditor
  // if sent as one CDP call. Chunking keeps the trusted-input path and avoids
  // falling back to direct DOM injection for real publish.
  //
  // SE3 also tends to flatten literal \n characters into one paragraph. Split
  // by lines and send trusted Enter key events between lines so headings,
  // bullets, FAQ, and CTA stay as separate editor paragraphs on mobile Naver.
  const lines = value.split("\n");
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    await insertTextLineChunks(target, lines[lineIndex]);
    if (lineIndex < lines.length - 1) {
      await dispatchEnterViaDebugger(target);
    }
  }
}

async function insertTextLineChunks(target, line) {
  const chunkSize = 180;
  for (let i = 0; i < line.length; i += chunkSize) {
    await debuggerSendCommand(target, "Input.insertText", { text: line.slice(i, i + chunkSize) });
    // SmartEditor can drop back-to-back CDP insertText calls while it reconciles
    // its internal document model. A short pause between smaller chunks keeps
    // the cursor alive and prevents first-chunk-only truncation.
    await new Promise((r) => setTimeout(r, 220));
  }
}

async function dispatchEnterViaDebugger(target) {
  await debuggerSendCommand(target, "Input.dispatchKeyEvent", {
    type: "keyDown",
    key: "Enter",
    code: "Enter",
    windowsVirtualKeyCode: 13,
    nativeVirtualKeyCode: 13,
  });
  await debuggerSendCommand(target, "Input.dispatchKeyEvent", {
    type: "keyUp",
    key: "Enter",
    code: "Enter",
    windowsVirtualKeyCode: 13,
    nativeVirtualKeyCode: 13,
  });
  await new Promise((r) => setTimeout(r, 120));
}

function debuggerAttach(target) {
  return promiseWithTimeout(new Promise((resolve, reject) => {
    chrome.debugger.attach(target, "1.3", () => {
      const err = chrome.runtime.lastError;
      if (err) reject(new Error(err.message));
      else resolve();
    });
  }), 5_000, "chrome.debugger.attach timeout");
}

function debuggerSendCommand(target, method, params) {
  return promiseWithTimeout(new Promise((resolve, reject) => {
    chrome.debugger.sendCommand(target, method, params, (result) => {
      const err = chrome.runtime.lastError;
      if (err) reject(new Error(err.message));
      else resolve(result);
    });
  }), 8_000, `${method} timeout`);
}

function debuggerDetach(target) {
  return promiseWithTimeout(new Promise((resolve, reject) => {
    chrome.debugger.detach(target, () => {
      const err = chrome.runtime.lastError;
      if (err) reject(new Error(err.message));
      else resolve();
    });
  }), 3_000, "chrome.debugger.detach timeout");
}

async function getSecret() {
  const { keepioo_secret } = await chrome.storage.local.get(["keepioo_secret"]);
  if (!keepioo_secret) throw new Error("KEEPIOO_SECRET 미설정 — popup 에서 입력 필요");
  return keepioo_secret;
}

function requestUpdateCheck() {
  return new Promise((resolve, reject) => {
    if (!chrome.runtime.requestUpdateCheck) {
      reject(new Error("chrome.runtime.requestUpdateCheck 미지원"));
      return;
    }
    chrome.runtime.requestUpdateCheck((status, details) => {
      const err = chrome.runtime.lastError;
      if (err) reject(new Error(err.message));
      else resolve({ status, details: details ?? null });
    });
  });
}

async function getUpdateStatus() {
  const { update_status, last_manual_publish_status } = await chrome.storage.local.get(["update_status", "last_manual_publish_status"]);
  return { ...(update_status ?? {
    status: "unknown",
    version: chrome.runtime.getManifest().version,
    checkedAt: null,
    message: "아직 업데이트 확인 전",
  }), lastManualPublishStatus: last_manual_publish_status ?? null };
}

async function checkForExtensionUpdate(options = {}) {
  const checkedAt = new Date().toISOString();
  const currentVersion = chrome.runtime.getManifest().version;
  const updateUrl = chrome.runtime.getManifest().update_url ?? null;
  let status;
  try {
    const result = await requestUpdateCheck();
    status = {
      status: result.status,
      version: currentVersion,
      checkedAt,
      reason: options.reason ?? "manual",
      updateUrl,
      details: result.details,
      message: formatUpdateMessage(result.status, result.details, updateUrl),
    };
  } catch (e) {
    status = {
      status: "error",
      version: currentVersion,
      checkedAt,
      reason: options.reason ?? "manual",
      updateUrl,
      error: e?.message ?? String(e),
      message: updateUrl
        ? `업데이트 확인 실패: ${e?.message ?? e}`
        : "압축해제/개발용 설치는 Chrome 자동 업데이트 대상이 아닙니다. self-hosted CRX 또는 Web Store 설치본에서 동작합니다.",
    };
  }
  await chrome.storage.local.set({ update_status: status });
  console.log("[keepioo-naver] update check:", status.status, status.message);
  return status;
}

function formatUpdateMessage(status, details, updateUrl) {
  if (status === "update_available") {
    return `새 버전 발견: ${details?.version ?? "unknown"}. Chrome이 자동으로 내려받고 재시작/재로드 시 적용합니다.`;
  }
  if (status === "no_update") {
    return `최신 상태입니다${updateUrl ? ` (${updateUrl})` : ""}.`;
  }
  if (status === "throttled") {
    return "Chrome 업데이트 확인이 일시 제한(throttled)되었습니다. 다음 자동 확인을 기다립니다.";
  }
  return `업데이트 확인 상태: ${status}`;
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
      return r?.ok !== false && !r?.skipped && !inner?.dryRun && Boolean(inner?.naverUrl);
    }).length,
    stoppedReason: results.at(-1)?.skipped ?? (results.at(-1)?.ok === false ? "fail" : "limit"),
    results,
  };
}

function isTransientWriterTabError(error) {
  const message = String(error?.message ?? error ?? "");
  return message.includes("No tab with id")
    || message.includes("Receiving end does not exist")
    || message.includes("Extension context invalidated")
    || message.includes("Cannot access contents of url")
    || message.includes("content.js 메시지 fail");
}

async function runPublishOnceWithFreshWriterRetry(dryRun = false, options = {}) {
  try {
    return await runPublishOnce(dryRun, options);
  } catch (error) {
    // Dry-run cron/manual triggers can occasionally lose the writer tab after
    // SmartEditor opens/closes helper windows. Recover once with a fresh writer
    // instead of reporting a flaky transport failure as a content failure. Live
    // publishing and requireExistingWriter paths stay fail-closed.
    if (!dryRun || options.requireExistingWriter === true || !isTransientWriterTabError(error)) {
      throw error;
    }
    await setManualPublishStatus("fresh_writer_retry_start", { reason: error?.message ?? String(error) });
    const closedWriterTabs = await closeStaleWriterTabs();
    await setManualPublishStatus("fresh_writer_retry_cleanup_done", { closedWriterTabs });
    await new Promise((r) => setTimeout(r, 1200));
    return await runPublishOnce(dryRun, {
      ...options,
      reuseExistingWriter: false,
      requireExistingWriter: false,
    });
  }
}

async function runPublishOnce(dryRun = false, options = {}) {
  await setManualPublishStatus("start", { dryRun, options: { allowLoginWait: options.allowLoginWait === true, reuseExistingWriter: options.reuseExistingWriter === true, requireExistingWriter: options.requireExistingWriter === true, forceNext: options.forceNext === true } });
  const allowLoginWait = options.allowLoginWait === true;
  const reuseExistingWriter = options.reuseExistingWriter === true;
  const requireExistingWriter = options.requireExistingWriter === true;
  const forceNext = options.forceNext === true;
  const secret = await getSecret();
  const force = (dryRun || forceNext) ? "?force=1" : "";

  // 1. 큐 조회
  const nextRes = await fetch(`${KEEPIOO_BASE}/api/naver-extension/next${force}`, {
    headers: { Authorization: `Bearer ${secret}` },
  });
  if (!nextRes.ok) throw new Error(`/next ${nextRes.status}`);
  const next = await nextRes.json();
  await setManualPublishStatus("next", { status: next.status, queueId: next.queueId ?? null, blogPostId: next.blogPostId ?? null });
  console.log("[keepioo-naver] next:", next.status);

  if (next.status !== "ready") {
    // outside_hours / daily_cap_reached / no_pending — 정상 skip
    return { skipped: next.status };
  }

  // 2. 글쓰기 페이지 준비.
  //    네이버가 새 창/새 세션에는 재인증을 요구하는 경우가 있어,
  //    cron/headless 실행은 관철이 직접 열어둔 로그인된 글쓰기 탭을 우선 재사용한다.
  let win = null;
  let tab = null;
  let closeWhenDone = true;
  if (reuseExistingWriter) {
    tab = await findReusableWriterTab();
    if (tab) {
      closeWhenDone = false;
      console.log("[keepioo-naver] reusing existing writer tab", tab.id, tab.url);
      await setManualPublishStatus("reuse_writer_tab", { tabId: tab.id, url: tab.url ?? null });
      await chrome.windows.update(tab.windowId, { focused: true, state: "normal" }).catch(() => undefined);
      await chrome.tabs.update(tab.id, { active: true }).catch(() => undefined);
      // 중요: 기존 글쓰기 탭을 재사용할 때는 URL 재수렴/새로고침을 하지 않는다.
      // SmartEditor에 작성 중인 내용이 있으면 Chrome/Naver가
      // "사이트에서 나가시겠습니까?" beforeunload 확인창을 띄우고,
      // 그 상태에서 자동화가 멈춰 실제 발행 버튼까지 가지 못한다.
      await setManualPublishStatus("reuse_writer_tab_no_navigation", { tabId: tab.id, url: tab.url ?? null });
    }
  }

  if (!tab) {
    if (requireExistingWriter) {
      throw new Error("재사용 가능한 로그인된 네이버 글쓰기 탭 없음 — Default 프로필에서 블로그 글쓰기 화면을 먼저 열어야 합니다");
    }
    await setManualPublishStatus("stale_writer_cleanup_start", {});
    const closedWriterTabs = await closeStaleWriterTabs();
    if (closedWriterTabs > 0) {
      await setManualPublishStatus("stale_writer_tabs_closed", { count: closedWriterTabs });
      await new Promise((r) => setTimeout(r, 700));
    }
    // background window 로 글쓰기 페이지 열기 (focused:false).
    // visibility='visible' 유지 (naver 봇 탐지 회피).
    // minimize 는 inject 후로 미룸 — 즉시 minimize 하면 content.js inject 가
    // abort 될 가능성 (Could not establish connection 사고).
    win = await chrome.windows.create({
      url: NAVER_WRITE,
      focused: false,
    });
    tab = win.tabs?.[0];
    if (!tab) throw new Error("window.tabs[0] 없음");
  }

  // 3. tab 로드 대기 (max 90s)
  const ready = await waitForTabReady(tab.id, 90_000);
  await setManualPublishStatus("tab_ready_checked", { ready, tabId: tab.id });
  if (!ready) {
    const stuckTab = await chrome.tabs.get(tab.id).catch(() => null);
    await closeWindowIfNeeded(closeWhenDone, win?.id, "tab_ready_timeout");
    throw new Error(`글쓰기 페이지 로드 timeout (status=${stuckTab?.status ?? "unknown"}, url=${String(stuckTab?.url ?? "").slice(0, 120)})`);
  }
  // Naver login redirect can happen just after the first complete event.
  await new Promise((r) => setTimeout(r, 3000));
  // tab.url 검증 — cookies 만료 시 naver 로그인 페이지로 redirect (C-2 fix).
  // blog.naver.com 외 페이지면 cookies 만료. content.js inject 의미 X.
  // Chrome can occasionally leave a just-opened SmartEditor tab in a transient
  // closed/stale state where chrome.tabs.get never settles; bound it so the
  // dry-run fresh-writer retry can recover instead of timing out the callback.
  const finalTab = await promiseWithTimeout(chrome.tabs.get(tab.id), 5_000, `tab get timeout:${tab.id}`)
    .catch((e) => {
      throw new Error(`No tab with id ${tab.id} after ready check: ${e?.message ?? e}`);
    });
  if (
    !finalTab.url ||
    finalTab.url.includes("nid.naver.com/nidlogin") ||
    !finalTab.url.includes("blog.naver.com")
  ) {
    if (!allowLoginWait) {
      await closeWindowIfNeeded(closeWhenDone, win?.id, "tab_ready_timeout");
      // fail audit 보고 (W-1 fix)
      await reportFail(secret, next, `cookies 만료 의심: redirect to ${finalTab.url?.slice(0, 100)}`);
      throw new Error(`cookies 만료 — naver 로그인 redirect (${finalTab.url?.slice(0, 60)})`);
    }

    console.log("[keepioo-naver] login required; waiting for manual login in same window");
    const focusWindowId = win?.id ?? tab.windowId;
    await chrome.windows.update(focusWindowId, { focused: true, state: "normal" }).catch(() => undefined);
    const loginOk = await waitForNaverLoginThenReopenWriter(tab.id, 10 * 60_000);
    if (!loginOk) {
      await closeWindowIfNeeded(closeWhenDone, win?.id, "tab_ready_timeout");
      await reportFail(secret, next, `login wait timeout: ${finalTab.url?.slice(0, 100)}`);
      throw new Error("네이버 로그인 대기 timeout — 같은 창에서 로그인 후 다시 시도");
    }
  }

  // 4. content.js 강제 inject — manifest content_scripts 가 background window 에서
  //    안정적이지 못한 사고 (Receiving end does not exist) → executeScript 로 직접 inject.
  try {
    await setManualPublishStatus("inject_start", { tabId: tab.id });
    await promiseWithTimeout(chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["content.js"],
    }), 10_000, "content.js executeScript timeout");
    console.log("[keepioo-naver] content.js executeScript injected");
    await setManualPublishStatus("inject_done", { tabId: tab.id });
  } catch (e) {
    console.warn("[keepioo-naver] executeScript fail:", e?.message);
  }
  // listener 등록 대기
  await new Promise((r) => setTimeout(r, 2000));

  // 5. activate — paste fail 가설 검증 (minimized 의 hasFocus=false 가
  //    SE3 paste fail 원인 의심). 안정 후 minimized 복귀 예정.
  const activeWindowId = win?.id ?? tab.windowId;
  await chrome.windows.update(activeWindowId, { focused: true, state: "normal" }).catch(() => undefined);

  // 6. content.js 에 publish 명령 — retry 패턴
  let result;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await setManualPublishStatus("send_message_start", { tabId: tab.id, attempt });
      result = await promiseWithTimeout(chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: async (payload, isDryRun) => {
          if (typeof globalThis.__keepiooPublishToSe3 !== "function") {
            return { ok: false, error: "content.js publish 함수 미등록" };
          }
          try {
            const result = await globalThis.__keepiooPublishToSe3(payload, isDryRun);
            return { ok: true, result };
          } catch (e) {
            return { ok: false, error: e?.message ?? String(e), debug: e?.debug ?? null };
          }
        },
        args: [next, dryRun],
      }).then((rows) => rows?.[0]?.result ?? { ok: false, error: "executeScript result 없음" }), 180_000, "content.js 처리 timeout");
      if (result?.ok === false && /executeScript result 없음|content\.js publish 함수 미등록/.test(String(result.error || "")) && attempt < 3) {
        await setManualPublishStatus("send_message_retry_after_empty_result", { tabId: tab.id, attempt, error: result.error });
        await promiseWithTimeout(chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ["content.js"],
        }), 10_000, "content.js reinject timeout").catch(() => undefined);
        await new Promise((r) => setTimeout(r, 1500));
        continue;
      }
      break;
    } catch (e) {
      const isContentTimeout = String(e?.message ?? e).includes("content.js 처리 timeout");
      if (isContentTimeout || attempt === 3) {
        await closeWindowIfNeeded(closeWhenDone, win?.id, "tab_ready_timeout");
        // fail audit 보고 (W-1 fix) — throw 전 audit 남김
        await reportFail(secret, next, `sendMessage fail${isContentTimeout ? " timeout" : " x3"}: ${e?.message ?? e}`);
        throw new Error(`content.js 메시지 fail (${isContentTimeout ? "timeout" : "3 attempts"}): ${e?.message ?? e}`);
      }
      console.warn(`[keepioo-naver] sendMessage attempt ${attempt} fail, retry...`);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  // 7. 결과 keepioo 보고
  if (result?.ok) {
    const r = result.result;
    const verifiedSuccess = dryRun || Boolean(r?.naverUrl);
    const auditPayload = {
      queueId: next.queueId,
      blogPostId: next.blogPostId,
      result: dryRun ? "skipped" : (verifiedSuccess ? "success" : "fail"),
      naverUrl: r.naverUrl ?? null,
      skipReason: dryRun ? "dry_run" : null,
      errorMessage: verifiedSuccess ? null : "발행 URL 미검증 — success 처리 차단",
      details: r.debug,
    };
    const auditOk = await postPublishedAudit(secret, auditPayload, "success_or_dry_run");
    await setManualPublishStatus("published_audit_done", { auditOk, dryRun, verifiedSuccess });
    if (!verifiedSuccess) {
      result = { ok: false, error: "발행 URL 미검증 — success 처리 차단", debug: r.debug, result: r };
    }
  } else {
    const failDetails = result?.debug && typeof result.debug === "object"
      ? { stage: "content_fail", ...result.debug }
      : { stage: "content_fail" };
    await postPublishedAudit(secret, {
      queueId: next.queueId,
      blogPostId: next.blogPostId,
      result: "fail",
      errorMessage: result?.error ?? "unknown",
      details: failDetails,
    }, "content_fail");
  }

  // 8. window close (사장님 작업 방해 X)
  await closeWindowIfNeeded(closeWhenDone, win?.id, "runPublishOnce_done");
  await setManualPublishStatus("done", { dryRun, resultOk: result?.ok !== false });
  return result;
}

async function closeWindowIfNeeded(shouldClose, windowId, stage) {
  // Never close a Naver writer window automatically. If SmartEditor contains
  // unsaved text, chrome.windows.remove triggers the browser/Naver beforeunload
  // prompt: "사이트에서 나가시겠습니까?". That prompt blocks the real publish
  // path right after the article is written. Preserve the window instead and
  // let the operator close it manually after success/failure is known.
  if (!shouldClose || !windowId) return false;
  await setManualPublishStatus("window_close_preserved", { stage, windowId, reason: "avoid_beforeunload_prompt" });
  return false;
}

async function runEditPost(msg) {
  const editUrl = String(msg?.editUrl || "");
  const payload = msg?.payload;
  const dryRun = msg?.dryRun === true;
  if (!editUrl.includes("blog.naver.com") || !editUrl.includes("logNo=")) {
    throw new Error("manual-edit-post editUrl 누락 또는 형식 오류");
  }
  if (!payload?.title || !payload?.bodyHtml) {
    throw new Error("manual-edit-post payload.title/bodyHtml 누락");
  }

  await setManualPublishStatus("edit_start", { dryRun, editUrl: editUrl.slice(0, 160) });
  const win = await chrome.windows.create({ url: editUrl, focused: true });
  const tab = win.tabs?.[0];
  if (!tab) throw new Error("edit window.tabs[0] 없음");

  const ready = await waitForTabReady(tab.id, 90_000);
  await setManualPublishStatus("edit_tab_ready_checked", { ready, tabId: tab.id });
  if (!ready) {
    await setManualPublishStatus("edit_window_preserved", { stage: "edit_tab_ready_timeout", windowId: win.id, reason: "avoid_beforeunload_prompt" });
    throw new Error("수정 페이지 로드 timeout");
  }
  await new Promise((r) => setTimeout(r, 3000));
  const finalTab = await chrome.tabs.get(tab.id);
  if (!finalTab.url || finalTab.url.includes("nid.naver.com/nidlogin") || !finalTab.url.includes("blog.naver.com")) {
    await setManualPublishStatus("edit_window_preserved", { stage: "edit_login_or_url_fail", windowId: win.id, reason: "avoid_beforeunload_prompt" });
    throw new Error(`네이버 로그인/수정 페이지 접근 실패 (${finalTab.url?.slice(0, 100)})`);
  }

  try {
    await setManualPublishStatus("edit_inject_start", { tabId: tab.id });
    await promiseWithTimeout(chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["content.js"],
    }), 10_000, "content.js executeScript timeout");
    await setManualPublishStatus("edit_inject_done", { tabId: tab.id });
  } catch (e) {
    console.warn("[keepioo-naver] edit executeScript fail:", e?.message);
  }
  await new Promise((r) => setTimeout(r, 2000));
  await chrome.windows.update(win.id, { focused: true, state: "normal" }).catch(() => undefined);

  const result = await promiseWithTimeout(chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: async (editPayload, isDryRun) => {
      if (typeof globalThis.__keepiooPublishToSe3 !== "function") {
        return { ok: false, error: "content.js publish 함수 미등록" };
      }
      try {
        const result = await globalThis.__keepiooPublishToSe3(editPayload, isDryRun);
        return { ok: true, result };
      } catch (e) {
        return { ok: false, error: e?.message ?? String(e), debug: e?.debug ?? null };
      }
    },
    args: [payload, dryRun],
  }).then((rows) => rows?.[0]?.result ?? { ok: false, error: "executeScript result 없음" }), 190_000, "edit content.js 처리 timeout");

  if (result?.ok) {
    await setManualPublishStatus("edit_done", { dryRun, result: result.result?.dryRun ? "dry_run" : "submitted", naverUrl: result.result?.naverUrl ?? null });
  } else {
    await setManualPublishStatus("edit_fail", { error: result?.error ?? "unknown", debug: result?.debug ?? null });
  }
  if (dryRun) {
    // dry-run may leave a publish modal open. Do not close the editor window:
    // Chrome/Naver can show "사이트에서 나가시겠습니까?" and block the session.
    await setManualPublishStatus("edit_dry_run_window_preserved", { reason: "avoid_beforeunload_prompt" });
  }
  return result;
}

function promiseWithTimeout(promise, timeoutMs, message) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function setManualPublishStatusBestEffort(stage, extra = {}) {
  setManualPublishStatus(stage, extra).catch(() => undefined);
}

async function setManualPublishStatus(stage, extra = {}) {
  await chrome.storage.local.set({
    last_manual_publish_status: {
      stage,
      at: new Date().toISOString(),
      ...extra,
    },
  }).catch(() => undefined);
}

async function closeStaleWriterTabs() {
  // Do not remove writer tabs automatically. Closing or replacing a SmartEditor
  // tab with unsaved content triggers Chrome/Naver's "사이트에서 나가시겠습니까?"
  // dialog, which blocks the publish flow and looks like Chrome is repeatedly
  // opening/closing without posting. Keep this as a no-op; operators can close
  // stale tabs manually when they are present.
  const tabs = await promiseWithTimeout(
    chrome.tabs.query({ url: ["https://blog.naver.com/*", "https://*.blog.naver.com/*"] }),
    5_000,
    "closeStaleWriterTabs query timeout",
  ).catch(() => []);
  const writerTabs = tabs.filter((tab) => {
    const url = String(tab.url || "");
    return !url.includes("nid.naver.com")
      && (url.includes("Redirect=Write") || url.includes("GoBlogWrite.naver") || url.includes("categoryNo="));
  }).length;
  if (writerTabs > 0) {
    await setManualPublishStatus("stale_writer_tabs_preserved", { count: writerTabs });
  }
  return 0;
}

async function findReusableWriterTab() {
  const tabs = await chrome.tabs.query({ url: ["https://blog.naver.com/*", "https://*.blog.naver.com/*"] });
  const score = (tab) => {
    const url = String(tab.url || "");
    let s = 0;
    if (url.includes("GoBlogWrite.naver")) s += 1000;
    if (url.includes("Redirect=Write")) s += 700;
    if (tab.active) s += 100;
    s += Math.min(Number(tab.lastAccessed || 0) / 1_000_000_000, 50);
    return s;
  };
  const candidates = tabs
    .filter((tab) => {
      const url = String(tab.url || "");
      if (!tab.id || !url.includes("blog.naver.com") || url.includes("nid.naver.com") || tab.status !== "complete") return false;
      // URL alone is not enough. Redirect=Write can still render the blog home
      // title and contain no SmartEditor, so we verify DOM below before reuse.
      return url.includes("GoBlogWrite.naver") || url.includes("Redirect=Write");
    })
    .sort((a, b) => score(b) - score(a));
  for (const tab of candidates) {
    if (await tabHasSmartEditor(tab.id)) return tab;
  }
  return null;
}

async function tabHasSmartEditor(tabId) {
  const result = await promiseWithTimeout(chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      const f = document.querySelector("#mainFrame");
      let root = document;
      try { if (f?.contentDocument) root = f.contentDocument; } catch {}
      return Boolean(
        root.querySelector('.se-section-documentTitle p.se-text-paragraph')
        || root.querySelector('button[data-click-area="tpb.publish"]')
        || root.querySelector('.se-main-container')
      );
    },
  }), 4_000, `tabHasSmartEditor timeout:${tabId}`)
    .then((rows) => rows?.[0]?.result === true)
    .catch(() => false);
  return result;
}

async function waitForTabReady(tabId, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start <= timeoutMs) {
    const tab = await chrome.tabs.get(tabId).catch(() => null);
    if (!tab) return false;
    const url = String(tab.url || "");
    if (tab.status === "complete") return true;

    // Naver Blog writer can stay at Chrome tab.status='loading' for a long time
    // even after the SmartEditor document/iframe is already usable. Do not fail
    // the automation just because ads/long-poll resources keep the load spinner.
    if (url.includes("blog.naver.com") && !url.includes("nid.naver.com")) {
      if (Date.now() - start > 12_000 && (url.includes("Redirect=Write") || url.includes("GoBlogWrite.naver") || url.includes("categoryNo="))) {
        return true;
      }
      const usable = await promiseWithTimeout(chrome.scripting.executeScript({
        target: { tabId },
        func: () => ({
          readyState: document.readyState,
          hasMainFrame: Boolean(document.querySelector("#mainFrame")),
          title: document.title,
        }),
      }), 3_000, "waitForTabReady executeScript timeout").then((rows) => rows?.[0]?.result).catch(() => null);
      if (usable?.hasMainFrame || usable?.readyState === "interactive" || usable?.readyState === "complete") {
        return true;
      }
    }

    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
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
