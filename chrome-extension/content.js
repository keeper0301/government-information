// ============================================================
// Keepioo Naver Publisher - Content Script (SE3 자동화)
// ============================================================
// runner.mjs 의 selector + flow 그대로. invisible/minimized window 환경에서도
// 작동하도록 ClipboardEvent dispatch 패턴 사용 (execCommand("paste") 의
// user activation 요구 회피).
//
// 흐름:
//   1. 임시 글 모달 dismiss
//   2. cover_image 본문 paste (본문 HTML 보다 먼저 — clipboard race 회피, C2 fix)
//   3. 제목 입력 (clear + type)
//   4. 본문 입력 (clear + HTML clipboard paste)
//   5. dry-run 시: 본문 길이 + confirm 버튼 visible 검증, 발행 skip
//   6. 실 발행: tpb.publish → 모달 → tpb*i.publish
//   7. URL 캡처
// ============================================================

const SE3_TITLE = ".se-section-documentTitle p.se-text-paragraph";
const SE3_BODY = ".se-section-text p.se-text-paragraph";
// SmartEditor currently renders the final publish button in the same document,
// not under a stable `layer_publish` class. Keep the selector tied to Naver's
// data-click-area, which stayed stable in the live 2026-07-03 publish run.
const NAVER_CONFIRM_PUBLISH_SELECTOR = 'button[data-click-area="tpb*i.publish"]';

if (!globalThis.__keepiooNaverPublisherListenerRegisteredV3) {
  globalThis.__keepiooNaverPublisherListenerRegisteredV3 = true;
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type !== "naver-publish-v2") return false;
    publishToSe3(msg.payload, msg.dryRun === true)
      .then((result) => sendResponse({ ok: true, result }))
      .catch((e) => sendResponse({ ok: false, error: e?.message ?? String(e), debug: e?.debug ?? null }));
    return true;
  });
}

globalThis.__keepiooPublishToSe3 = publishToSe3;

async function publishToSe3(payload, dryRun) {
  const debug = { stage: "init", code_version: "leftbar-v3-cdp-primary-v3" };
  await reportProgress("content_init", { dryRun, url: location.href.slice(0, 120) });

  if (isNaverLoginPage()) {
    throw new Error(`cookies 만료 — naver 로그인 redirect (${location.href.slice(0, 80)})`);
  }

  // mainFrame iframe (SE3)
  debug.stage = "mainFrame";
  await reportProgress("content_mainFrame_wait");
  const mainFrame = await waitForMainFrame();
  if (!mainFrame) {
    if (isNaverLoginPage()) {
      throw new Error(`cookies 만료 — naver 로그인 redirect (${location.href.slice(0, 80)})`);
    }
    throw new Error(`mainFrame iframe 못 찾음 (url=${location.href.slice(0, 80)})`);
  }
  const mfDoc = mainFrame.contentDocument;
  if (!mfDoc) throw new Error("mainFrame contentDocument 접근 불가");

  // 1. 임시 글 모달 dismiss
  debug.stage = "restore_modal";
  await sleep(2000);
  const cancelBtn = mfDoc.querySelector(".se-popup-alert .se-popup-button-cancel");
  if (cancelBtn && isVisible(cancelBtn)) {
    cancelBtn.click();
    debug.restore_modal_dismissed = true;
    await sleep(1500);
  } else {
    debug.restore_modal_dismissed = false;
  }

  // 2. 제목 입력 (clear + type) — 본문 영역 활성화 전에 안전
  debug.stage = "title";
  await reportProgress("content_title_wait");
  const titleEl = await waitFor(mfDoc, SE3_TITLE, 45000);
  if (!titleEl) throw new Error("제목 영역 못 찾음");
  titleEl.click();
  await sleep(500);
  if (payload.forceDirectReplace === true) {
    directSetPlainText(titleEl, payload.title);
    debug.title_method = "forced_direct_dom_edit";
    debug.input_verification = "forced_direct_dom_edit";
    await sleep(500);
  } else {
    await selectAllDelete(mfDoc, mainFrame, titleEl);
    await typeText(mfDoc, payload.title);
    await sleep(300);
  }
  if (!titleContains(titleEl, payload.title)) {
    let titleInserted = false;
    try {
      titleInserted = await debuggerInsertTextAt(titleEl, payload.title, debug, "title");
    } catch (e) {
      debug.title_debugger_click_insert_error = String(e?.message ?? e).slice(0, 120);
    }
    await sleep(500);
    if (!titleInserted || !titleContains(titleEl, payload.title)) {
      directSetPlainText(titleEl, payload.title);
      debug.title_method = "direct_dom_fallback";
      debug.input_verification = "unsafe_direct_dom_title";
      await sleep(300);
    } else {
      debug.title_method = "debugger_click_insert_text";
    }
  } else {
    debug.title_method = "insertText";
  }
  debug.titleText = (titleEl.textContent || "").trim().slice(0, 120);
  if (!titleContains(titleEl, payload.title)) {
    throwWithDebug(`제목 입력 실패 의심 (titleText=${debug.titleText})`, debug);
  }
  debug.title = "ok";
  await reportProgress("content_title_done", { titleMethod: debug.title_method });
  await sleep(500);

  // 3. cover_image — 본문 HTML paste **이전** 에 처리 (C2 race fix).
  //    base64 fetch → clipboard image → SE3 paste → 자동 upload.
  //    cover fetch/upload가 실패하면 cover가 없는 것과 같으므로 다음 본문 단계에서
  //    기존 임시글을 clear한다. payload.coverImageUrl 존재만 보고 clear를 건너뛰면
  //    실패한 cover 뒤에 stale body가 남아 trusted input 검증이 계속 실패한다.
  debug.cover_pasted = false;
  if (payload.coverImageUrl) {
    debug.stage = "cover";
    const coverBodyEl = await waitForBodyParagraph(mfDoc, 8000);
    if (coverBodyEl) {
      try {
        coverBodyEl.click();
        await sleep(500);
        const r = await fetchWithTimeout(payload.coverImageUrl, {}, 10_000);
        if (r.ok) {
          const blob = await r.blob();
          if (blob.type.startsWith("image/")) {
            await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
            await dispatchPasteEvent(coverBodyEl, { imageBlob: blob });
            await sleep(5000); // SE3 image upload 대기
            debug.cover_pasted = true;
          } else {
            debug.cover_failed = `not_image:${blob.type}`;
          }
        } else {
          debug.cover_failed = `fetch_${r.status}`;
        }
      } catch (e) {
        debug.cover_failed = String(e?.message ?? e).slice(0, 100);
      }
    } else {
      debug.cover_failed = "body_paragraph_not_found";
    }
  }

  // 4. 본문 입력 — pasteHtml 3중 fallback (C-NEW-1)
  debug.stage = "body";
  await reportProgress("content_body_wait");
  let bodyEl = await waitForBodyParagraph(mfDoc, 30000);
  if (!bodyEl) throwWithDebug("본문 영역 못 찾음", debug);
  debug.body_candidate_snapshot = bodyCandidateSnapshot(mfDoc, bodyEl);
  debug.body_preferred_point = computeTopPagePoint(bodyEl);
  // focus 명시 — minimized window 의 hasFocus=false 우회 (C-NEW-2)
  mainFrame.contentWindow?.focus?.();
  focusEditor(bodyEl);
  await sleep(500);
  debug.has_focus = mfDoc.hasFocus();
  // cover 없거나 cover fetch/upload가 실패했을 때만 selectAll (cover 있으면 cover 까지 지워질 위험)
  if (debug.cover_pasted !== true) {
    await selectAllDelete(mfDoc, mainFrame, bodyEl);
    // Ctrl+A/Backspace 뒤 SmartEditor가 paragraph node를 새로 만들거나 selection anchor를
    // 바꾸는 경우가 있다. 기존 bodyEl reference를 계속 쓰면 CDP 입력은 ok여도
    // detached/stale paragraph만 측정되어 trusted_input_failed_no_direct_dom으로 빠진다.
    // 삭제 직후 현재 보이는 본문 paragraph를 다시 잡고 그 좌표로 trusted input을 넣는다.
    await sleep(700);
    const refreshedBodyEl = await waitForBodyParagraph(mfDoc, 8000);
    if (refreshedBodyEl) {
      bodyEl = refreshedBodyEl;
      debug.body_after_clear_snapshot = bodyCandidateSnapshot(mfDoc, bodyEl);
      debug.body_preferred_point_after_clear = computeTopPagePoint(bodyEl);
      debug.body_preferred_point = debug.body_preferred_point_after_clear;
      focusEditor(bodyEl);
      await sleep(250);
    } else {
      debug.body_after_clear_reacquire_failed = true;
    }
  } else {
    // cover 뒤에 본문 추가 — cursor 를 본문 영역 끝으로
    focusEditor(bodyEl);
  }
  if (payload.forceDirectReplace === true) {
    directInsertHtml(bodyEl, payload.bodyHtml, htmlToPlainText(payload.bodyHtml));
    debug.body_paste_method = "forced_direct_dom_edit";
    debug.body_after_direct_dom = measureEditorTextLength(bodyEl);
  } else {
    await pasteHtml(bodyEl, payload.bodyHtml, debug);
  }
  await reportProgress("content_paste_done", { method: debug.body_paste_method, afterClick: debug.body_after_debugger_click_insert_text, afterInsert: debug.body_after_debugger_insert_text, afterDom: debug.body_after_direct_dom });
  await sleep(2000);
  debug.body = "ok";

  // 본문 길이 정확 측정 — 본문 전체 section text 합산 (W-NEW-1 fix)
  // SmartEditor가 외부 HTML을 하나의 paragraph 내부 fragment로 보관하는 경우
  // `.se-section-text .se-text-paragraph` 집계가 placeholder만 잡아 짧게 나올 수 있다.
  // 이때는 실제 bodyEl/section text를 fallback으로 사용해 false negative를 줄인다.
  const paragraphText = Array.from(mfDoc.querySelectorAll(".se-section-text .se-text-paragraph"))
    .map(el => el.textContent ?? "")
    .join("");
  const measuredBodyText = getEditorBodyText(bodyEl);
  const allBodyText = measuredBodyText.length > paragraphText.length ? measuredBodyText : paragraphText;
  debug.bodyLength = allBodyText.length;
  debug.bodyVerified = bodyContainsExpectedText(allBodyText, payload.bodyHtml);
  debug.bodyStyleProbe = probeSmartEditorStyles(mfDoc);
  if (!debug.bodyVerified && isTrustedStructuredNaverBody(allBodyText, debug.body_paste_method)) {
    debug.bodyVerified = true;
    debug.body_verification_relaxed = "trusted_structured_sections";
  }
  if (!debug.bodyVerified && isTrustedRichStyledNaverBody(allBodyText, debug.body_paste_method, debug.bodyStyleProbe)) {
    debug.bodyVerified = true;
    debug.body_verification_relaxed = "trusted_rich_style_probe";
  }
  await reportProgress("content_body_verified", { bodyLength: debug.bodyLength, bodyVerified: debug.bodyVerified, method: debug.body_paste_method, styleProbe: debug.bodyStyleProbe, relaxed: debug.body_verification_relaxed });
  if (debug.title_method === "direct_dom_fallback" || debug.body_paste_method === "direct_dom_fallback" || debug.body_paste_method === "forced_direct_dom_edit") {
    debug.unsafe_input_fallback = true;
    if (!dryRun && payload.allowUnsafeDomForEdit !== true) {
      throwWithDebug(
        `입력 검증 실패: direct DOM fallback 사용 (${debug.title_method}/${debug.body_paste_method}) — SmartEditor 내부 저장 상태 미검증`,
        debug,
      );
    }
  }
  if (!debug.bodyVerified && payload.allowUnsafeDomForEdit === true && debug.body_paste_method === "direct_dom_fallback" && debug.bodyLength >= 150) {
    debug.bodyVerified = true;
    debug.body_verification_relaxed = "allowed_direct_dom_edit_body_length";
  }
  if (!debug.bodyVerified) {
    throwWithDebug("본문 입력 검증 실패: payload 핵심 문구가 SmartEditor 본문에서 확인되지 않음", debug);
  }

  // dry-run: 본문 길이 + confirm 버튼 visible 검증 (W1·W-NEW-1)
  if (dryRun) {
    debug.stage = "dry_run_verify";
    await reportProgress("content_dry_run_verify", { bodyLength: debug.bodyLength, bodyVerified: debug.bodyVerified });
    // 정확한 본문 길이 — 위에서 이미 측정. 임계 200 (W-NEW-1 권고)
    if (debug.bodyLength < 200) {
      throwWithDebug(`dry-run fail: 본문 paste 실패 의심 (length=${debug.bodyLength}, expected≥200)`, debug);
    }
    const mainPub = mfDoc.querySelector('button[data-click-area="tpb.publish"]');
    if (!mainPub || !isVisible(mainPub)) throwWithDebug("publish 메인 버튼 visible X", debug);
    const pubRect = mainPub.getBoundingClientRect();
    debug.dry_run_publish_button_rect = {
      left: Math.round(pubRect.left),
      top: Math.round(pubRect.top),
      width: Math.round(pubRect.width),
      height: Math.round(pubRect.height),
    };
    // Main publish click is only a dry-run modal opener, not final publish.
    // Use a scheduled DOM click first: it avoids the previous manual-trigger callback
    // stall while still exercising Naver's own button handler. CDP click is kept as
    // secondary evidence only if the modal does not appear.
    setTimeout(() => {
      try { mainPub.click(); } catch {}
    }, 0);
    await reportProgress("content_dry_run_main_publish_clicked", { method: "scheduled_dom_click" });
    let confirmBtn = await waitForVisible(
      mfDoc,
      NAVER_CONFIRM_PUBLISH_SELECTOR,
      8000,
    );
    if (!confirmBtn) {
      const clickPoint = computeTopPagePoint(mainPub);
      debug.dry_run_publish_click_point = clickPoint;
      const clickRes = await sendRuntimeMessage({ type: "debugger-click", ...clickPoint }, 15_000);
      debug.dry_run_publish_click_ok = clickRes?.ok === true;
      if (!clickRes?.ok) debug.dry_run_publish_click_error = String(clickRes?.error ?? "unknown").slice(0, 120);
      await reportProgress("content_dry_run_main_publish_clicked", { method: "debugger_click", ok: debug.dry_run_publish_click_ok });
      confirmBtn = await waitForVisible(
        mfDoc,
        NAVER_CONFIRM_PUBLISH_SELECTOR,
        8000,
      );
    }
    debug.dry_run_confirm_visible = !!confirmBtn;
    await reportProgress("content_dry_run_confirm_checked", { visible: debug.dry_run_confirm_visible });
    if (!debug.dry_run_confirm_visible) {
      throwWithDebug("dry-run fail: confirm 버튼 (tpb*i.publish) 보이지 않음", debug);
    }
    return { dryRun: true, debug };
  }

  // 6. 발행 1단계 — tpb.publish
  debug.stage = "main_publish";
  const mainPublish = mfDoc.querySelector('button[data-click-area="tpb.publish"]');
  if (!mainPublish || !isVisible(mainPublish)) throw new Error("발행 메인 버튼 (tpb.publish) 못 찾음");
  await clickPublishButtonWithFallback(mainPublish, debug, "main_publish");
  await sleep(2500);

  // 7. 발행 2단계 — confirm 모달
  debug.stage = "confirm_publish";
  const confirmBtn = await waitForVisible(
    mfDoc,
    NAVER_CONFIRM_PUBLISH_SELECTOR,
    12000,
  );
  if (!confirmBtn) throw new Error("발행 모달 confirm 버튼 못 찾음");
  await clickPublishButtonWithFallback(confirmBtn, debug, "confirm_publish");
  await sleep(8000);

  // 8. URL 캡처
  debug.stage = "url_capture";
  const naverUrl = await capturePublishedUrl(mfDoc, debug);
  debug.url_captured = naverUrl ?? "none";
  if (!naverUrl) {
    throwWithDebug("발행 확인 실패: 공개 글 URL을 캡처하지 못해 성공 처리 차단", debug);
  }
  debug.stage = "done";

  return { dryRun: false, naverUrl, debug };
}

// ────────────────────────────────────────────────────────────
// helpers
// ────────────────────────────────────────────────────────────
async function capturePublishedUrl(mfDoc, debug) {
  const postUrlRe = /https?:\/\/blog\.naver\.com\/[^/?#]+\/\d{9,}/;
  const candidates = [];
  const addCandidate = (value, source) => {
    const s = String(value || "");
    const m = s.match(postUrlRe);
    if (m) candidates.push({ source, url: m[0] });
  };

  for (let i = 0; i < 30; i++) {
    addCandidate(location.href, "location.href");
    addCandidate(document.querySelector('link[rel="canonical"]')?.href, "top canonical");
    addCandidate(document.querySelector('meta[property="og:url"]')?.content, "top og:url");
    addCandidate(mfDoc.querySelector('link[rel="canonical"]')?.href, "frame canonical");
    addCandidate(mfDoc.querySelector('meta[property="og:url"]')?.content, "frame og:url");
    for (const a of Array.from(document.querySelectorAll('a[href*="blog.naver.com/"]')).slice(0, 50)) {
      addCandidate(a.href, "top anchor");
    }
    for (const a of Array.from(mfDoc.querySelectorAll('a[href*="blog.naver.com/"]')).slice(0, 50)) {
      addCandidate(a.href, "frame anchor");
    }
    if (candidates.length) {
      debug.url_capture_source = candidates[0].source;
      return candidates[0].url;
    }
    await sleep(1000);
  }

  debug.url_capture_location = location.href;
  debug.url_capture_title = document.title;
  return null;
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function fetchWithTimeout(url, options = {}, timeoutMs = 10_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function throwWithDebug(message, debug) {
  const error = new Error(message);
  error.debug = { ...(debug ?? {}) };
  throw error;
}

function isVisible(el) {
  if (!el) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}

async function clickPublishButtonWithFallback(button, debug, label) {
  try {
    button.scrollIntoView({ block: "center", inline: "center" });
  } catch {}
  await sleep(350);

  const rect = button.getBoundingClientRect();
  debug[`${label}_button_rect`] = {
    left: Math.round(rect.left),
    top: Math.round(rect.top),
    width: Math.round(rect.width),
    height: Math.round(rect.height),
  };
  debug[`${label}_button_text`] = String(button.innerText || button.textContent || "").replace(/\s+/g, " ").trim().slice(0, 80);

  // Naver's final publish button is a normal button, not an editor insertion
  // target. The editor click-point helper intentionally left-biases large text
  // containers, but that can miss small modal buttons. Use the true visual
  // center for publish buttons and fire a full pointer/mouse sequence before the
  // trusted CDP click.
  try {
    button.focus?.();
    button.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true, pointerType: "mouse", button: 0, buttons: 1 }));
    button.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0, buttons: 1 }));
    button.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, cancelable: true, pointerType: "mouse", button: 0, buttons: 0 }));
    button.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true, button: 0, buttons: 0 }));
    button.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
    button.click();
    debug[label] = "dom_pointer_mouse_click";
  } catch (e) {
    debug[`${label}_dom_click_error`] = String(e?.message ?? e).slice(0, 120);
  }
  await sleep(700);

  const clickPoint = computeButtonCenterPoint(button);
  debug[`${label}_click_point`] = clickPoint;
  const clickRes = await sendRuntimeMessage({ type: "debugger-click", ...clickPoint }, 15_000);
  debug[`${label}_debugger_click_ok`] = clickRes?.ok === true;
  if (!clickRes?.ok) debug[`${label}_debugger_click_error`] = String(clickRes?.error ?? "unknown").slice(0, 120);
  await sleep(700);

  // The last publish modal occasionally keeps focus but ignores the first CDP
  // click. A second center click is safer than falling through to URL capture and
  // reporting a false failure. This is only called from the already-approved live
  // path; dry-run stops before pressing this final modal button.
  if (label === "confirm_publish") {
    const stillVisible = isVisible(button);
    debug[`${label}_still_visible_after_click`] = stillVisible;
    if (stillVisible) {
      const retryPoint = computeButtonCenterPoint(button);
      debug[`${label}_retry_click_point`] = retryPoint;
      const retryRes = await sendRuntimeMessage({ type: "debugger-click", ...retryPoint }, 15_000);
      debug[`${label}_debugger_retry_click_ok`] = retryRes?.ok === true;
      if (!retryRes?.ok) debug[`${label}_debugger_retry_click_error`] = String(retryRes?.error ?? "unknown").slice(0, 120);
      await sleep(900);
    }
    const visibleAfterRetry = isVisible(button);
    debug[`${label}_still_visible_after_retry`] = visibleAfterRetry;
    if (visibleAfterRetry) {
      button.focus?.();
      const enterRes = await sendRuntimeMessage({ type: "debugger-key", key: "Enter" }, 10_000);
      debug[`${label}_debugger_enter_ok`] = enterRes?.ok === true;
      if (!enterRes?.ok) debug[`${label}_debugger_enter_error`] = String(enterRes?.error ?? "unknown").slice(0, 120);
      await sleep(900);
    }
    const visibleAfterEnter = isVisible(button);
    debug[`${label}_still_visible_after_enter`] = visibleAfterEnter;
    if (visibleAfterEnter) {
      const spaceRes = await sendRuntimeMessage({ type: "debugger-key", key: "Space" }, 10_000);
      debug[`${label}_debugger_space_ok`] = spaceRes?.ok === true;
      if (!spaceRes?.ok) debug[`${label}_debugger_space_error`] = String(spaceRes?.error ?? "unknown").slice(0, 120);
      await sleep(1200);
    }
  }
}

function computeButtonCenterPoint(button) {
  const rect = button.getBoundingClientRect();
  const frameEl = button.ownerDocument.defaultView?.frameElement;
  const frameRect = frameEl?.getBoundingClientRect?.() ?? { left: 0, top: 0 };
  const viewportWidth = window.innerWidth || 1280;
  const viewportHeight = window.innerHeight || 900;
  const rawX = (frameRect.left || 0) + rect.left + rect.width / 2;
  const rawY = (frameRect.top || 0) + rect.top + rect.height / 2;
  return {
    x: Math.round(Math.min(Math.max(rawX, 10), Math.max(viewportWidth - 10, 10))),
    y: Math.round(Math.min(Math.max(rawY, 10), Math.max(viewportHeight - 10, 10))),
    rawX: Math.round(rawX),
    rawY: Math.round(rawY),
  };
}

function isNaverLoginPage() {
  const href = location.href;
  if (href.includes("nid.naver.com/nidlogin")) return true;
  const bodyText = document.body?.innerText ?? "";
  return bodyText.includes("ID/전화번호") && bodyText.includes("비밀번호") && bodyText.includes("패스키 로그인");
}

async function waitForMainFrame() {
  const start = Date.now();
  while (Date.now() - start < 15000) {
    if (isNaverLoginPage()) return null;
    const f = document.querySelector("#mainFrame");
    if (f && f.contentDocument) return f;
    // 수정 화면/일부 SE3 라우트는 editor가 top document에 직접 뜬다.
    // 이 경우 iframe처럼 다룰 수 있는 얇은 adapter를 반환한다.
    if (document.querySelector(SE3_TITLE) || document.querySelector(SE3_BODY)) {
      return { contentDocument: document, contentWindow: window };
    }
    await sleep(500);
  }
  return null;
}

async function waitFor(root, selector, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const el = root.querySelector(selector);
    if (el && isVisible(el)) return el;
    await sleep(300);
  }
  return null;
}

async function waitForVisible(root, selector, timeoutMs) {
  return waitFor(root, selector, timeoutMs);
}

async function waitForBodyParagraph(root, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const candidates = Array.from(root.querySelectorAll(SE3_BODY));
    const visible = candidates
      .map((el) => {
        const rect = el.getBoundingClientRect();
        return { el, rect, area: Math.max(0, rect.width) * Math.max(0, rect.height) };
      })
      .filter(({ rect, area }) => area > 1000 && rect.width > 120 && rect.height > 8 && isVisibleRect(rect));
    if (visible.length > 0) {
      const local = visible
        .filter(({ rect }) => rect.top >= 80 && rect.height < 600)
        .sort((a, b) => (a.rect.top - b.rect.top) || (a.area - b.area));
      if (local.length > 0) return local[0].el;
      // Avoid choosing a giant off-screen paragraph/container first; that tends
      // to click the canvas instead of the active body insertion point.
      visible.sort((a, b) => Math.abs(a.rect.top - 180) - Math.abs(b.rect.top - 180));
      return visible[0].el;
    }
    const fallback = candidates.find((el) => isVisible(el));
    if (fallback) return fallback;
    await sleep(300);
  }
  return null;
}

function isVisibleRect(rect) {
  return rect && rect.bottom >= 0 && rect.right >= 0 && rect.top <= (innerHeight || 10_000) && rect.left <= (innerWidth || 10_000);
}

function bodyCandidateSnapshot(root, selectedEl) {
  try {
    return Array.from(root.querySelectorAll(SE3_BODY)).slice(0, 12).map((el, idx) => {
      const rect = el.getBoundingClientRect();
      const text = (el.textContent || "").replace(/\s+/g, " ").trim();
      return {
        idx,
        selected: el === selectedEl,
        tag: el.tagName,
        cls: String(el.className || "").slice(0, 80),
        text: text.slice(0, 80),
        textLength: text.length,
        rect: { left: Math.round(rect.left), top: Math.round(rect.top), width: Math.round(rect.width), height: Math.round(rect.height), bottom: Math.round(rect.bottom) },
        visible: isVisibleRect(rect),
      };
    });
  } catch (e) {
    return [{ error: String(e?.message ?? e).slice(0, 120) }];
  }
}

async function selectAllDelete(mfDoc, mainFrame, targetEl = null) {
  mainFrame.contentWindow.focus();
  // execCommand 가 user activation 없으면 일부 환경 fail.
  // selectAll 은 user activation 요구 안 하지만 delete 는 요구. KeyboardEvent fallback.
  try { mfDoc.execCommand("selectAll", false); } catch {}
  await sleep(150);
  try { mfDoc.execCommand("delete", false); } catch {}
  await sleep(200);
  // 수정 화면의 기존 본문은 execCommand 만으로 지워지지 않는 경우가 있다.
  // 대상 좌표를 실제 클릭한 뒤 Ctrl+A → Backspace 를 CDP trusted key로 보낸다.
  try {
    const point = targetEl ? computeTopPagePoint(targetEl) : null;
    await sendRuntimeMessage({ type: "debugger-select-all-delete", ...(point ?? {}) }, 15_000);
  } catch {}
  await sleep(350);
}

async function typeText(mfDoc, text) {
  // execCommand("insertText") — Chrome 117+ 에서 user activation 요구 가능
  try {
    mfDoc.execCommand("insertText", false, text);
  } catch {}
  await sleep(300);
}

/**
 * pasteHtml — 3중 fallback (C-NEW-1 fix).
 *   1. navigator.clipboard.write + ClipboardEvent dispatch (Chromium isTrusted=false 면 silent)
 *   2. execCommand("insertHTML", false, html) — user activation 없어도 일부 SE3 핸들러 받음
 *   3. textContent 검증 → 본문 안 들어가면 throw
 *
 * 호출 측이 catch 후 debug.body_paste_method 로 어느 path 통과했는지 추적.
 */
async function pasteHtml(targetEl, html, debug) {
  const beforeLen = measureEditorTextLength(targetEl);
  const plainText = htmlToPlainText(html);
  focusEditor(targetEl);

  // 0단계 — text/html 클립보드 paste를 먼저 시도한다.
  // H2/H3 글자 크기, 좌측바, 빨간 CTA 같은 네이버 전용 스타일은
  // HTML payload에 들어있다. plainText/CDP insertText를 먼저 쓰면 본문은
  // 안정적으로 들어가지만 모든 inline style이 사라져 관철이 요구한
  // 글자 크기·H2/H3 시각 계층이 반영되지 않는다.
  let afterLen = beforeLen;

  // 1단계 — navigator.clipboard.write + ClipboardEvent dispatch
  let clipboardWriteOk = false;
  try {
    const htmlBlob = new Blob([html], { type: "text/html" });
    const plainBlob = new Blob([plainText], { type: "text/plain" });
    await navigator.clipboard.write([
      new ClipboardItem({ "text/html": htmlBlob, "text/plain": plainBlob }),
    ]);
    clipboardWriteOk = true;
  } catch (e) {
    debug.clipboard_write_error = String(e?.message ?? e).slice(0, 100);
  }
  debug.clipboard_write_ok = clipboardWriteOk;

  await dispatchPasteEvent(targetEl, { html, text: plainText });
  await sleep(800);

  // 검증 — paste 후 본문 길이
  afterLen = measureEditorTextLength(targetEl);
  debug.body_after_dispatch = afterLen;

  // 1.5단계 — fallback: clipboard에 넣은 HTML을 실제 클릭+Ctrl+V로 붙여넣기.
  // synthetic paste는 무시하지만 trusted keyboard paste는 받는 SmartEditor 상태가 있다.
  if (afterLen - beforeLen < 100 && clipboardWriteOk) {
    try {
      const point = debug.body_preferred_point || computeTopPagePoint(targetEl);
      const pasteRes = await sendRuntimeMessage({ type: "debugger-click-paste", ...point }, 30_000);
      debug.debugger_click_paste_ok = pasteRes?.ok === true;
      if (!pasteRes?.ok) debug.debugger_click_paste_error = String(pasteRes?.error ?? "unknown").slice(0, 100);
      await sleep(1500);
      afterLen = measureEditorTextLength(targetEl);
      debug.body_paste_method = "debugger_click_ctrl_v_fallback";
      debug.body_after_debugger_click_paste = afterLen;
    } catch (e) {
      debug.debugger_click_paste_error = String(e?.message ?? e).slice(0, 100);
    }
  }

  // 2단계 — fallback: execCommand("insertHTML")
  if (afterLen - beforeLen < 100) {
    try {
      const mfDoc = targetEl.ownerDocument;
      const win = mfDoc.defaultView;
      win.focus?.();
      focusEditor(targetEl);
      mfDoc.execCommand("insertHTML", false, html);
      await sleep(800);
      afterLen = measureEditorTextLength(targetEl);
      debug.body_paste_method = "insertHTML_fallback";
      debug.body_after_insertHTML = afterLen;
    } catch (e) {
      debug.insertHTML_error = String(e?.message ?? e).slice(0, 100);
    }
  } else {
    debug.body_paste_method = "clipboard_dispatch";
  }

  // 3단계 — fallback: plain text insertion. SE3/Chromium 조합에 따라
  // untrusted paste + insertHTML 이 조용히 실패하는 경우가 있어 최종 안전망.
  if (afterLen - beforeLen < 100) {
    try {
      const mfDoc = targetEl.ownerDocument;
      const win = mfDoc.defaultView;
      win.focus?.();
      focusEditor(targetEl);
      mfDoc.execCommand("insertText", false, plainText);
      await sleep(800);
      afterLen = measureEditorTextLength(targetEl);
      debug.body_paste_method = "insertText_fallback";
      debug.body_after_insertText = afterLen;
    } catch (e) {
      debug.insertText_error = String(e?.message ?? e).slice(0, 100);
    }
  }

  // 4단계 — final fallback: Chrome DevTools Protocol 로 실제 Ctrl+V key event.
  // SE3 는 synthetic paste / execCommand 를 무시하지만 실제 키 입력 paste 는 받는다.
  if (afterLen - beforeLen < 100) {
    try {
      focusEditor(targetEl);
      const pasteRes = await sendRuntimeMessage({ type: "debugger-paste" });
      debug.debugger_paste_ok = pasteRes?.ok === true;
      if (!pasteRes?.ok) debug.debugger_paste_error = String(pasteRes?.error ?? "unknown").slice(0, 100);
      await sleep(1500);
      afterLen = measureEditorTextLength(targetEl);
      debug.body_paste_method = "debugger_ctrl_v_fallback";
      debug.body_after_debugger_paste = afterLen;
    } catch (e) {
      debug.debugger_paste_error = String(e?.message ?? e).slice(0, 100);
    }
  }

  // 5단계 — DevTools Protocol trusted click + text insertion.
  // iframe 내부 좌표를 top-page 좌표로 환산해 실제 클릭 후 insertText를 보낸다.
  if (afterLen - beforeLen < 100) {
    try {
      focusEditor(targetEl);
      const insertRes = await debuggerInsertTextAt(targetEl, plainText, debug, "body");
      debug.body_debugger_click_insert_ok = insertRes;
      await sleep(1500);
      afterLen = measureEditorTextLength(targetEl);
      debug.body_paste_method = "debugger_click_insert_text_fallback";
      debug.body_after_debugger_click_insert_text = afterLen;
    } catch (e) {
      debug.debugger_click_insert_text_error = String(e?.message ?? e).slice(0, 100);
    }
  }

  // 6단계 — DevTools Protocol text insertion without click. Formatting is downgraded, but
  // it avoids false login loops by getting the article body into the editor.
  if (afterLen - beforeLen < 100) {
    try {
      focusEditor(targetEl);
      const insertRes = await sendRuntimeMessage({
        type: "debugger-insert-text",
        text: plainText,
      }, 120_000);
      debug.debugger_insert_text_ok = insertRes?.ok === true;
      if (!insertRes?.ok) debug.debugger_insert_text_error = String(insertRes?.error ?? "unknown").slice(0, 100);
      await sleep(1500);
      afterLen = measureEditorTextLength(targetEl);
      debug.body_paste_method = "debugger_insert_text_fallback";
      debug.body_after_debugger_insert_text = afterLen;
    } catch (e) {
      debug.debugger_insert_text_error = String(e?.message ?? e).slice(0, 100);
    }
  }

  // 7단계 — direct DOM 자동 주입은 더 이상 일반 publish 경로에서 사용하지 않는다.
  // SmartEditor 내부 저장 상태를 검증할 수 없기 때문에 live는 물론 dry-run에서도
  // trusted-input 실패로 분리해 보고한다. 기존 directInsertHtml 함수는 명시적인
  // forceDirectReplace/수동 edit 진단 경로에만 남긴다.
  if (afterLen - beforeLen < 100) {
    debug.body_paste_method = "trusted_input_failed_no_direct_dom";
    debug.body_after_trusted_input_failed = afterLen;
  }
}

function titleContains(targetEl, expected) {
  const actual = (targetEl?.textContent || "").replace(/\s+/g, " ").trim();
  const want = String(expected || "").replace(/\s+/g, " ").trim();
  return Boolean(want) && actual.includes(want.slice(0, Math.min(30, want.length)));
}

function measureEditorTextLength(targetEl) {
  return getEditorBodyText(targetEl).length;
}

function getEditorBodyText(targetEl) {
  const doc = targetEl?.ownerDocument ?? document;
  const section = resolveBodyContainer(targetEl) ?? doc;
  const text = Array.from(section.querySelectorAll?.(".se-text-paragraph") ?? [])
    .map((el) => el.textContent ?? "")
    .join("");
  const sectionText = section.textContent || "";
  const targetText = targetEl?.textContent || "";
  // SmartEditor may replace the focused paragraph after Ctrl+A/Backspace or paste.
  // In that state a stale targetEl stays short while the real editor document already
  // contains the inserted body. Use the largest same-document SmartEditor text as
  // the measurement so the method label does not falsely downgrade HTML paste to
  // trusted_input_failed_no_direct_dom and then continue into plain-text fallbacks.
  const documentParagraphText = Array.from(doc.querySelectorAll?.(".se-main-container .se-text-paragraph, .se-section-text .se-text-paragraph") ?? [])
    .map((el) => el.textContent ?? "")
    .join("");
  const documentBodyText = doc.querySelector?.(".se-main-container")?.textContent || "";
  return [text, sectionText, targetText, documentParagraphText, documentBodyText]
    .sort((a, b) => b.length - a.length)[0] || "";
}

function resolveBodyContainer(targetEl) {
  if (!targetEl) return null;
  const direct = targetEl.closest?.(".se-section-text");
  if (direct) return direct;
  const componentSection = targetEl.closest?.(".se-component")?.querySelector?.(".se-section-text");
  if (componentSection) return componentSection;
  const semanticSection = targetEl.closest?.("[class*='se-section']");
  if (semanticSection && semanticSection.tagName !== "P") return semanticSection;
  const editable = targetEl.closest?.("[contenteditable='true'], [contenteditable='plaintext-only']");
  const mainContainer = editable?.querySelector?.(".se-main-container") ?? targetEl.closest?.(".se-main-container");
  if (mainContainer) return mainContainer;
  if (targetEl.tagName === "P" && targetEl.parentElement) return targetEl.parentElement;
  return targetEl;
}

function bodyContainsExpectedText(actualText, html) {
  const actual = String(actualText || "").replace(/\s+/g, " ").trim();
  const plain = htmlToPlainText(html).replace(/\s+/g, " ").trim();
  if (!plain) return false;
  if (plain.length < 80) return actual.includes(plain.slice(0, Math.min(30, plain.length)));
  const middle = Math.floor(plain.length / 2);
  const snippets = [
    plain.slice(0, 40),
    plain.slice(Math.max(0, middle - 20), middle + 20),
    plain.slice(Math.max(0, plain.length - 40)),
  ].filter((snippet) => snippet.trim().length >= 20);
  return snippets.filter((snippet) => actual.includes(snippet.trim())).length >= Math.min(2, snippets.length);
}

function isTrustedStructuredNaverBody(actualText, method) {
  const trustedMethod = String(method || "");
  const isTrustedRichOrKeyboardInput = trustedMethod.startsWith("debugger_") ||
    trustedMethod === "clipboard_dispatch" ||
    trustedMethod === "debugger_click_ctrl_v_fallback" ||
    trustedMethod === "debugger_ctrl_v_fallback" ||
    trustedMethod === "insertHTML_fallback";
  if (!isTrustedRichOrKeyboardInput) return false;
  const actual = String(actualText || "").replace(/\s+/g, " ").trim();
  if (actual.length < 900) return false;
  const hasSummary = actual.includes("요약 답변");
  const hasStructuredChecklist = [
    "신청 전 체크포인트",
    "신청 전 핵심 확인",
    "검색 핵심 정보",
  ].some((section) => actual.includes(section));
  const semanticSignals = [
    /대상[:：]|누가 신청할 수 있나요/,
    /혜택[:：]|지원받을 수 있나요|만원|원\b/,
    /기간[:：]|마감|언제까지/,
  ];
  return hasSummary && hasStructuredChecklist &&
    semanticSignals.filter((re) => re.test(actual)).length >= 2;
}

function isTrustedRichStyledNaverBody(actualText, method, styleProbe) {
  const trustedMethod = String(method || "");
  if (!["clipboard_dispatch", "debugger_click_ctrl_v_fallback", "debugger_ctrl_v_fallback", "insertHTML_fallback"].includes(trustedMethod)) {
    return false;
  }
  const actual = String(actualText || "").replace(/\s+/g, " ").trim();
  if (actual.length < 900) return false;
  const probe = styleProbe || {};
  const hasVisualHierarchy = Number(probe.largeTextBlocks || 0) >= 2 ||
    (Number(probe.leftBorderBlocks || 0) >= 2 && Number(probe.grayBlocks || 0) >= 2);
  const hasUsefulStructure = actual.includes("자주 묻는 질문") ||
    actual.includes("더 알아보기") ||
    actual.includes("공식 신청 페이지") ||
    actual.includes("놓치지 말아야 할 점");
  const hasLinkEvidence = Number(probe.links || 0) >= 1 || actual.includes("keepioo.com");
  return hasVisualHierarchy && hasUsefulStructure && hasLinkEvidence;
}

function probeSmartEditorStyles(doc) {
  const root = doc?.querySelector?.(".se-main-container") || doc;
  const probe = {
    leftBorderBlocks: 0,
    grayBlocks: 0,
    largeTextBlocks: 0,
    links: 0,
    underlinedLinks: 0,
    redTextBlocks: 0,
  };
  if (!root?.querySelectorAll) return probe;
  const nodes = Array.from(root.querySelectorAll("*"));
  for (const el of nodes) {
    const text = (el.textContent || "").trim();
    if (text.length < 2) continue;
    const style = doc.defaultView?.getComputedStyle?.(el);
    if (!style) continue;
    const fontSize = Number.parseFloat(style.fontSize || "0");
    const borderLeftWidth = Number.parseFloat(style.borderLeftWidth || "0");
    const bg = style.backgroundColor || "";
    const color = style.color || "";
    if (fontSize >= 19) probe.largeTextBlocks += 1;
    if (borderLeftWidth >= 2) probe.leftBorderBlocks += 1;
    if (bg && !/rgba?\(255, 255, 255|rgba?\(0, 0, 0, 0\)|transparent/i.test(bg)) probe.grayBlocks += 1;
    if (el.tagName === "A" || el.closest?.("a")) probe.links += 1;
    if ((el.tagName === "A" || el.closest?.("a")) && /underline/i.test(style.textDecorationLine || style.textDecoration || "")) probe.underlinedLinks += 1;
    if (/rgb\((1[5-9]\d|2[0-5]\d),\s*(0|[1-9]\d),\s*(0|[1-9]\d)\)/i.test(color)) probe.redTextBlocks += 1;
  }
  return probe;
}

function directSetPlainText(targetEl, text) {
  const doc = targetEl.ownerDocument;
  const win = doc.defaultView;
  targetEl.replaceChildren(doc.createTextNode(String(text || "")));
  const editable = targetEl.closest("[contenteditable='true'], [contenteditable='plaintext-only']") ?? targetEl;
  for (const ev of [
    new InputEvent("beforeinput", { bubbles: true, cancelable: true, inputType: "insertText", data: String(text || "") }),
    new InputEvent("input", { bubbles: true, inputType: "insertText", data: String(text || "") }),
    new Event("change", { bubbles: true }),
  ]) {
    editable.dispatchEvent(ev);
    targetEl.dispatchEvent(ev);
  }
  const selection = win?.getSelection?.();
  if (selection) {
    const range = doc.createRange();
    range.selectNodeContents(targetEl);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
  }
}

function directInsertHtml(targetEl, html, plainText) {
  const doc = targetEl.ownerDocument;
  const win = doc.defaultView;
  focusEditor(targetEl);

  const fragmentDoc = new DOMParser().parseFromString(html, "text/html");
  const nodes = Array.from(fragmentDoc.body.childNodes);
  // 기존 글 수정에서는 p 하나만 갈아끼우면 뒤쪽 기존 본문이 남는다.
  // SmartEditor body section 전체를 교체해 중복/잔여 문단을 제거한다.
  const container = resolveBodyContainer(targetEl) ?? targetEl;
  for (const section of Array.from(doc.querySelectorAll(".se-section-text"))) {
    if (section === container) continue;
    const component = section.closest?.(".se-component") ?? section;
    component.remove();
  }
  container.replaceChildren();
  if (nodes.length > 0) {
    for (const node of nodes) {
      container.appendChild(doc.importNode(node, true));
    }
  } else {
    container.textContent = plainText;
  }

  const editable = targetEl.closest("[contenteditable='true'], [contenteditable='plaintext-only']") ?? container.closest?.("[contenteditable='true'], [contenteditable='plaintext-only']") ?? container;
  for (const ev of [
    new InputEvent("beforeinput", { bubbles: true, cancelable: true, inputType: "insertFromPaste", data: plainText }),
    new InputEvent("input", { bubbles: true, inputType: "insertFromPaste", data: plainText }),
    new Event("change", { bubbles: true }),
  ]) {
    editable.dispatchEvent(ev);
    container.dispatchEvent(ev);
    targetEl.dispatchEvent(ev);
  }

  const selection = win?.getSelection?.();
  if (selection) {
    const range = doc.createRange();
    range.selectNodeContents(container);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
  }
}

async function reportProgress(stage, details = {}) {
  try {
    await sendRuntimeMessage({ type: "naver-progress", stage, details }, 2_000);
  } catch {
    // Progress is diagnostic only; never block publishing.
  }
}

function sendRuntimeMessage(message, timeoutMs = 5_000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`runtime message timeout: ${message?.type ?? "unknown"}`)), timeoutMs);
    chrome.runtime.sendMessage(message, (response) => {
      clearTimeout(timer);
      const err = chrome.runtime.lastError;
      if (err) reject(new Error(err.message));
      else resolve(response);
    });
  });
}

function computeTopPagePoint(targetEl) {
  const clickEl = resolveClickableEditorElement(targetEl);
  clickEl.scrollIntoView({ block: "center", inline: "nearest" });
  const rect = clickEl.getBoundingClientRect();
  const frameEl = clickEl.ownerDocument.defaultView?.frameElement;
  const frameRect = frameEl?.getBoundingClientRect?.() ?? { left: 0, top: 0 };
  const point = visibleClickPoint(rect, frameRect);
  return { x: point.x, y: point.y };
}

function visibleClickPoint(rect, frameRect = { left: 0, top: 0 }) {
  const viewportWidth = window.innerWidth || 1280;
  const viewportHeight = window.innerHeight || 900;
  if (!rect || rect.width <= 1 || rect.height <= 1) {
    return { x: Math.round(viewportWidth * 0.3), y: Math.round(viewportHeight * 0.45), rawX: Math.round(viewportWidth * 0.3), rawY: Math.round(viewportHeight * 0.45) };
  }
  const left = (frameRect.left || 0) + rect.left;
  const right = (frameRect.left || 0) + rect.right;
  const top = (frameRect.top || 0) + rect.top;
  const bottom = (frameRect.top || 0) + rect.bottom;
  const visibleLeft = Math.max(left + 24, 20);
  const visibleRight = Math.min(right - 24, viewportWidth - 20);
  const visibleTop = Math.max(top + 24, 80);
  const visibleBottom = Math.min(bottom - 24, viewportHeight - 80);
  const x = visibleLeft <= visibleRight
    ? Math.round(visibleLeft + Math.min(Math.max((visibleRight - visibleLeft) * 0.15, 24), 220))
    : Math.round(Math.min(Math.max(left + Math.min(Math.max(rect.width * 0.15, 24), 220), 20), Math.max(viewportWidth - 20, 20)));
  const y = visibleTop <= visibleBottom
    ? Math.round((visibleTop + visibleBottom) / 2)
    : Math.round(Math.min(Math.max(top + Math.min(Math.max(rect.height / 2, 16), 48), 80), Math.max(viewportHeight - 80, 80)));
  return { x, y, rawX: x, rawY: y };
}

function resolveClickableEditorElement(targetEl) {
  const doc = targetEl?.ownerDocument ?? document;
  const titleSection = targetEl?.closest?.(".se-section-documentTitle");
  if (titleSection) {
    // Title insertion must click the actual title paragraph/section. The generic
    // fallback below intentionally prefers large editor containers for body
    // input, but on the document-title path that can click the lower canvas and
    // make CDP insert text into the wrong area, forcing unsafe direct DOM title
    // replacement. Keep title as a trusted-input-only target.
    const titleCandidates = [
      targetEl,
      targetEl?.closest?.(".se-module-text"),
      titleSection.querySelector?.("p.se-text-paragraph"),
      titleSection,
    ].filter(Boolean);
    const visibleTitle = titleCandidates
      .map((el) => ({ el, rect: el.getBoundingClientRect?.() }))
      .filter(({ rect }) => rect && rect.width > 80 && rect.height > 12)
      .sort((a, b) => a.rect.top - b.rect.top);
    return visibleTitle[0]?.el ?? targetEl;
  }

  const section = targetEl?.closest?.(".se-section-text") ?? targetEl;
  const targetRect = targetEl?.getBoundingClientRect?.();
  if (targetRect && targetRect.width > 10 && targetRect.height > 8) return targetEl;
  const moduleEl = targetEl?.closest?.(".se-module-text");
  const moduleRect = moduleEl?.getBoundingClientRect?.();
  if (moduleRect && moduleRect.width > 30 && moduleRect.height > 8) return moduleEl;
  const candidates = [
    targetEl,
    targetEl?.closest?.(".se-module-text"),
    section,
    section?.querySelector?.(".se-module-text"),
    section?.querySelector?.(".se-component-content"),
    section?.querySelector?.("[contenteditable='true'], [contenteditable='plaintext-only']"),
    doc.querySelector(".se-main-container"),
    doc.querySelector(".se-editing-area"),
    doc.querySelector(".se-canvas"),
    doc.querySelector("[contenteditable='true'], [contenteditable='plaintext-only']"),
  ].filter(Boolean);
  const visible = candidates
    .map((el) => ({ el, rect: el.getBoundingClientRect?.() }))
    .filter(({ rect }) => rect && rect.width > 120 && rect.height > 12);
  const targetVisible = visible.find(({ el }) => el === targetEl);
  if (targetVisible) return targetEl;
  const moduleVisible = visible.find(({ el }) => el === targetEl?.closest?.(".se-module-text"));
  if (moduleVisible) return moduleVisible.el;
  // Prefer the local text section before broad canvas/main containers. Picking
  // the largest container can place CDP insertions far from the current cursor,
  // which makes SmartEditor accept only placeholder residue and then forces the
  // unsafe direct-DOM fallback.
  const localVisible = visible.find(({ el }) => el === section || el === section?.querySelector?.(".se-component-content"));
  if (localVisible) return localVisible.el;
  visible.sort((a, b) => (a.rect.top - b.rect.top) || ((a.rect.width * a.rect.height) - (b.rect.width * b.rect.height)));
  return visible[0]?.el ?? targetEl;
}

async function debuggerInsertTextAt(targetEl, text, debug, step) {
  const preferred = step === "body" ? debug.body_preferred_point : null;
  let x, y, rawX, rawY;
  if (preferred && Number.isFinite(preferred.x) && Number.isFinite(preferred.y)) {
    x = preferred.x;
    y = preferred.y;
    rawX = preferred.x;
    rawY = preferred.y;
    debug[`${step}_debugger_click_insert_point`] = { x, y, rawX, rawY, preferred: true };
  } else {
    const clickEl = resolveClickableEditorElement(targetEl);
    clickEl.scrollIntoView({ block: "center", inline: "nearest" });
    await sleep(120);
    const rect = clickEl.getBoundingClientRect();
    const frameEl = clickEl.ownerDocument.defaultView?.frameElement;
    const frameRect = frameEl?.getBoundingClientRect?.() ?? { left: 0, top: 0 };
    const point = visibleClickPoint(rect, frameRect);
    x = point.x;
    y = point.y;
    rawX = point.rawX;
    rawY = point.rawY;
    debug[`${step}_debugger_click_insert_point`] = { x, y, rawX: Math.round(rawX), rawY: Math.round(rawY), rect: { left: Math.round(rect.left), top: Math.round(rect.top), width: Math.round(rect.width), height: Math.round(rect.height) }, frameRect: { left: Math.round(frameRect.left || 0), top: Math.round(frameRect.top || 0) } };
  }
  const res = await sendRuntimeMessage({ type: "debugger-click-insert-text", x, y, text }, 120_000);
  debug[`${step}_debugger_click_insert_ok`] = res?.ok === true;
  if (!res?.ok) debug[`${step}_debugger_click_insert_error`] = String(res?.error ?? "unknown").slice(0, 120);
  return res?.ok === true;
}

async function dispatchPasteEvent(targetEl, { html, text, imageBlob }) {
  const dt = new DataTransfer();
  if (html) dt.setData("text/html", html);
  if (text) dt.setData("text/plain", text);
  // imageBlob 는 DataTransfer.items.add 로 File 추가
  if (imageBlob) {
    const file = new File([imageBlob], "cover.png", { type: imageBlob.type });
    dt.items.add(file);
  }

  // focus 보장
  focusEditor(targetEl);
  await sleep(100);
  // paste 이벤트 dispatch
  const ev = new ClipboardEvent("paste", {
    bubbles: true,
    cancelable: true,
    clipboardData: dt,
  });
  targetEl.dispatchEvent(ev);
  await sleep(500);
}

function focusEditor(targetEl) {
  const doc = targetEl.ownerDocument;
  const win = doc.defaultView;
  win?.focus?.();

  const editable = targetEl.closest("[contenteditable='true'], [contenteditable='plaintext-only']") ?? targetEl;
  editable.focus?.();

  const selection = win?.getSelection?.();
  if (!selection) return;
  const range = doc.createRange();
  range.selectNodeContents(targetEl);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}

function htmlToPlainText(html) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  for (const br of doc.querySelectorAll("br")) br.replaceWith("\n");
  for (const block of doc.querySelectorAll("p, h1, h2, h3, h4, h5, h6, li, div")) {
    block.appendChild(doc.createTextNode("\n\n"));
  }
  return (doc.body.textContent ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
