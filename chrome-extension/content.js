// ============================================================
// Keepioo Naver Publisher - Content Script
// ============================================================
// SE3 글쓰기 페이지 자동화. background.js 가 chrome.tabs.create 로 글쓰기
// 페이지 띄우고, 이 content.js 가 자동 inject 됨.
//
// 흐름: chrome.runtime.onMessage 로 background 가 publish payload 전달
//      → SE3 자동 입력 + 발행 → 결과 회신
//
// runner.mjs 의 selector + flow 그대로 사용 (검증 완료).
// ============================================================

const SE3_TITLE = ".se-section-documentTitle p.se-text-paragraph";
const SE3_BODY = ".se-section-text p.se-text-paragraph";

// background.js 가 보낸 publish 요청 처리
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type !== "naver-publish") return false;
  // async 처리 — sendResponse 호출까지 listener 유지
  publishToSe3(msg.payload, msg.dryRun === true)
    .then((result) => sendResponse({ ok: true, result }))
    .catch((e) => sendResponse({ ok: false, error: e?.message ?? String(e) }));
  return true; // async response 보장
});

async function publishToSe3(payload, dryRun) {
  const debug = { stage: "init" };

  // mainFrame iframe 검색 (SE3 가 mainFrame 안)
  debug.stage = "mainFrame";
  const mainFrame = await waitForMainFrame();
  if (!mainFrame) throw new Error("mainFrame iframe 못 찾음");
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

  // 2. 제목 입력
  debug.stage = "title";
  const titleEl = await waitFor(mfDoc, SE3_TITLE, 30000);
  if (!titleEl) throw new Error("제목 영역 못 찾음");
  titleEl.click();
  await sleep(500);
  // clear + type
  await selectAllDelete(mainFrame);
  await typeText(mainFrame, payload.title);
  debug.title = "ok";
  await sleep(500);

  // 3. 본문 입력 — clipboard text/html paste
  debug.stage = "body";
  const bodyEl = await waitFor(mfDoc, SE3_BODY, 10000);
  if (!bodyEl) throw new Error("본문 영역 못 찾음");
  bodyEl.click();
  await sleep(500);
  await selectAllDelete(mainFrame);
  await pasteHtml(mainFrame, payload.bodyHtml);
  await sleep(2500);
  debug.body = "ok";

  // 4. cover_image — base64 fetch + clipboard image paste
  if (payload.coverImageUrl) {
    try {
      bodyEl.click();
      await sleep(300);
      // cursor 본문 맨 앞으로
      mainFrame.contentWindow.getSelection?.()?.removeAllRanges?.();
      const range = mfDoc.createRange();
      range.setStart(bodyEl, 0);
      range.collapse(true);
      mainFrame.contentWindow.getSelection().addRange(range);
      await sleep(300);
      // base64 fetch → clipboard image
      const r = await fetch(payload.coverImageUrl);
      if (r.ok) {
        const blob = await r.blob();
        if (blob.type.startsWith("image/")) {
          await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
          await pasteClipboard(mainFrame);
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
  }

  // 5. dry-run — 발행 click 안 함
  if (dryRun) {
    // confirm 버튼 visible 검증만
    debug.stage = "dry_run_verify";
    const mainPub = mfDoc.querySelector('button[data-click-area="tpb.publish"]');
    if (!mainPub || !isVisible(mainPub)) throw new Error("publish 메인 버튼 visible X");
    mainPub.click();
    await sleep(2500);
    const confirmBtn = mfDoc.querySelector('[class*="layer_publish"] button[data-click-area="tpb*i.publish"]');
    debug.dry_run_confirm_visible = confirmBtn && isVisible(confirmBtn);
    return { dryRun: true, debug };
  }

  // 6. 발행 1단계 — tpb.publish
  debug.stage = "main_publish";
  const mainPublish = mfDoc.querySelector('button[data-click-area="tpb.publish"]');
  if (!mainPublish) throw new Error("발행 메인 버튼 (tpb.publish) 못 찾음");
  mainPublish.click();
  debug.main_publish = "clicked";
  await sleep(3000);

  // 7. 발행 2단계 — confirm 모달
  debug.stage = "confirm_publish";
  const confirmBtn = await waitFor(
    mfDoc,
    '[class*="layer_publish"] button[data-click-area="tpb*i.publish"]',
    8000,
  );
  if (!confirmBtn) throw new Error("발행 모달 confirm 버튼 못 찾음");
  confirmBtn.click();
  debug.confirm_publish = "clicked";
  await sleep(8000); // 발행 완료 대기

  // 8. URL 캡처 — 발행 후 페이지 URL 변경
  debug.stage = "url_capture";
  let naverUrl = null;
  // outer page URL 우선 (mainFrame 안 redirect)
  if (/blog\.naver\.com\/[^/]+\/\d{9,}/.test(location.href)) {
    naverUrl = location.href;
  } else {
    const link = mfDoc.querySelector('a[href*="blog.naver.com/cgc0904/"], a[href*="m.site.naver.com"]');
    naverUrl = link?.href ?? null;
  }
  debug.url_captured = naverUrl ?? "none";
  debug.stage = "done";

  return { dryRun: false, naverUrl, debug };
}

// ────────────────────────────────────────────────────────────
// helpers
// ────────────────────────────────────────────────────────────
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function isVisible(el) {
  if (!el) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}

async function waitForMainFrame() {
  const start = Date.now();
  while (Date.now() - start < 15000) {
    const f = document.querySelector("#mainFrame");
    if (f && f.contentDocument) return f;
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

async function selectAllDelete(iframe) {
  iframe.contentWindow.focus();
  iframe.contentDocument.execCommand("selectAll", false);
  await sleep(100);
  iframe.contentDocument.execCommand("delete", false);
  await sleep(200);
}

async function typeText(iframe, text) {
  // iframe 의 document 안에 입력 — execCommand 또는 키보드 시뮬레이션
  iframe.contentWindow.focus();
  iframe.contentDocument.execCommand("insertText", false, text);
  await sleep(300);
}

async function pasteHtml(iframe, html) {
  // text/html + text/plain 둘 다 clipboard 에 set
  const htmlBlob = new Blob([html], { type: "text/html" });
  const plainBlob = new Blob([html.replace(/<[^>]+>/g, "")], { type: "text/plain" });
  await navigator.clipboard.write([
    new ClipboardItem({ "text/html": htmlBlob, "text/plain": plainBlob }),
  ]);
  await pasteClipboard(iframe);
}

async function pasteClipboard(iframe) {
  iframe.contentWindow.focus();
  // execCommand paste 가 가장 호환 (또는 ClipboardEvent dispatch)
  iframe.contentDocument.execCommand("paste", false);
  await sleep(500);
}
