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

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type !== "naver-publish") return false;
  publishToSe3(msg.payload, msg.dryRun === true)
    .then((result) => sendResponse({ ok: true, result }))
    .catch((e) => sendResponse({ ok: false, error: e?.message ?? String(e) }));
  return true;
});

async function publishToSe3(payload, dryRun) {
  const debug = { stage: "init" };

  // mainFrame iframe (SE3)
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

  // 2. 제목 입력 (clear + type) — 본문 영역 활성화 전에 안전
  debug.stage = "title";
  const titleEl = await waitFor(mfDoc, SE3_TITLE, 30000);
  if (!titleEl) throw new Error("제목 영역 못 찾음");
  titleEl.click();
  await sleep(500);
  await selectAllDelete(mfDoc, mainFrame);
  await typeText(mfDoc, payload.title);
  debug.title = "ok";
  await sleep(500);

  // 3. cover_image — 본문 HTML paste **이전** 에 처리 (C2 race fix).
  //    base64 fetch → clipboard image → SE3 paste → 자동 upload.
  if (payload.coverImageUrl) {
    debug.stage = "cover";
    const bodyEl = await waitFor(mfDoc, SE3_BODY, 10000);
    if (bodyEl) {
      try {
        bodyEl.click();
        await sleep(500);
        const r = await fetch(payload.coverImageUrl);
        if (r.ok) {
          const blob = await r.blob();
          if (blob.type.startsWith("image/")) {
            await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
            await dispatchPasteEvent(bodyEl, { imageBlob: blob });
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
  }

  // 4. 본문 입력 — clear + HTML clipboard paste.
  //    cover image 가 본문 앞에 삽입된 상태라서 본문은 그 뒤에 추가.
  //    cursor 가 cover image 다음 위치 (또는 본문 영역 click) 로 이동.
  debug.stage = "body";
  const bodyEl = await waitFor(mfDoc, SE3_BODY, 10000);
  if (!bodyEl) throw new Error("본문 영역 못 찾음");
  bodyEl.click();
  await sleep(500);
  // selectAll + Delete 가 본문만 지우는지 cover 도 지우는지 — SE3 동작 확인 필요.
  // cover 있으면 selectAll skip (보존). 없으면 selectAll Delete.
  if (!payload.coverImageUrl) {
    await selectAllDelete(mfDoc, mainFrame);
  }
  await pasteHtml(bodyEl, payload.bodyHtml);
  await sleep(2500);
  debug.body = "ok";

  // dry-run: 본문 길이 + confirm 버튼 visible 검증 (W1)
  if (dryRun) {
    debug.stage = "dry_run_verify";
    // 본문 길이 검증 — paste 가 silent fail 했으면 짧음
    const pastedText = bodyEl.parentElement?.textContent?.trim() ?? "";
    debug.bodyLength = pastedText.length;
    if (pastedText.length < 50) {
      throw new Error(`dry-run fail: 본문 paste 실패 의심 (length=${pastedText.length})`);
    }
    const mainPub = mfDoc.querySelector('button[data-click-area="tpb.publish"]');
    if (!mainPub || !isVisible(mainPub)) throw new Error("publish 메인 버튼 visible X");
    mainPub.click();
    await sleep(2500);
    const confirmBtn = mfDoc.querySelector('[class*="layer_publish"] button[data-click-area="tpb*i.publish"]');
    debug.dry_run_confirm_visible = !!confirmBtn && isVisible(confirmBtn);
    if (!debug.dry_run_confirm_visible) {
      throw new Error("dry-run fail: confirm 버튼 (tpb*i.publish) 보이지 않음");
    }
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
  await sleep(8000);

  // 8. URL 캡처
  debug.stage = "url_capture";
  let naverUrl = null;
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
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

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

async function selectAllDelete(mfDoc, mainFrame) {
  mainFrame.contentWindow.focus();
  // execCommand 가 user activation 없으면 일부 환경 fail.
  // selectAll 은 user activation 요구 안 하지만 delete 는 요구. KeyboardEvent fallback.
  try { mfDoc.execCommand("selectAll", false); } catch {}
  await sleep(150);
  try { mfDoc.execCommand("delete", false); } catch {}
  await sleep(200);
}

async function typeText(mfDoc, text) {
  // execCommand("insertText") — Chrome 117+ 에서 user activation 요구 가능
  try {
    mfDoc.execCommand("insertText", false, text);
  } catch {}
  await sleep(300);
}

/**
 * pasteHtml — ClipboardEvent dispatch 패턴 (W1 fix).
 * execCommand("paste") 가 chrome.alarms 발화 invisible context 에서 silent fail
 * → 직접 ClipboardEvent 만들어 dispatch. DataTransfer 에 text/html + text/plain 둘 다.
 */
async function pasteHtml(targetEl, html) {
  // clipboard 에도 set (네이버 SE3 가 ClipboardEvent 외에 navigator.clipboard 도 읽음)
  try {
    const htmlBlob = new Blob([html], { type: "text/html" });
    const plainBlob = new Blob([html.replace(/<[^>]+>/g, "")], { type: "text/plain" });
    await navigator.clipboard.write([
      new ClipboardItem({ "text/html": htmlBlob, "text/plain": plainBlob }),
    ]);
  } catch {}

  // ClipboardEvent 직접 dispatch — paste handler 발화
  await dispatchPasteEvent(targetEl, { html, text: html.replace(/<[^>]+>/g, "") });
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
  targetEl.focus?.();
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
