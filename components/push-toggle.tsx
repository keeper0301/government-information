"use client";

// ============================================================
// PushToggle — PWA 푸시 구독 토글 (2026-05-21 spec)
// ============================================================
// 1. service worker 등록 (/sw.js)
// 2. Notification.requestPermission()
// 3. PushManager.subscribe (VAPID public key)
// 4. POST /api/push/subscribe
//
// 사용처: /mypage 계정 탭. 200줄 제한 단일 컴포넌트.
// VAPID env: NEXT_PUBLIC_VAPID_PUBLIC_KEY (없으면 비활성 안내).
// ============================================================

import { useEffect, useState } from "react";

const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

// base64 (URL-safe) → ArrayBuffer. PushManager applicationServerKey 가 ArrayBuffer 요구.
function urlBase64ToBuffer(base64: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const buf = new ArrayBuffer(raw.length);
  const view = new Uint8Array(buf);
  for (let i = 0; i < raw.length; i += 1) view[i] = raw.charCodeAt(i);
  return buf;
}

type Status = "idle" | "subscribing" | "subscribed" | "denied" | "unsupported";

export function PushToggle() {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  // 마운트 시 현재 구독 여부 확인 — 이미 구독했으면 토글 상태 반영
  useEffect(() => {
    let cancelled = false;

    async function syncSubscriptionStatus() {
      await Promise.resolve();
      if (cancelled || typeof window === "undefined") return;
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        setStatus("unsupported");
        return;
      }
      if (Notification.permission === "denied") {
        setStatus("denied");
        return;
      }

      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (cancelled) return;
        if (sub) setStatus("subscribed");
      } catch {
        // service worker 미등록 — idle 유지
      }
    }

    void syncSubscriptionStatus();

    return () => {
      cancelled = true;
    };
  }, []);

  async function subscribe() {
    if (!VAPID_PUBLIC) {
      setError("VAPID 키 미설정 — 관리자에게 문의해주세요");
      return;
    }
    setStatus("subscribing");
    setError(null);
    try {
      // 1. service worker 등록 (이미 등록된 경우 같은 promise 반환)
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;

      // 2. 권한 요청
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setStatus("denied");
        return;
      }

      // 3. push 구독
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToBuffer(VAPID_PUBLIC),
      });

      // 4. 서버에 등록 — endpoint + p256dh + auth
      const subJson = sub.toJSON();
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: subJson.endpoint,
          keys: {
            p256dh: subJson.keys?.p256dh,
            auth: subJson.keys?.auth,
          },
          user_agent: navigator.userAgent,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        // 401 (로그인 필요) 은 별도 안내 — 비로그인 사용자가 마이페이지 접근 못하지만 방어
        if (res.status === 401) {
          setError("로그인 후 다시 시도해주세요");
        } else {
          setError(data.error ?? "구독 등록 실패");
        }
        setStatus("idle");
        return;
      }
      setStatus("subscribed");
    } catch (e) {
      setError((e as Error).message);
      setStatus("idle");
    }
  }

  async function unsubscribe() {
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        const endpoint = sub.endpoint;
        await sub.unsubscribe();
        // 서버 row 도 즉시 삭제 — 발송 cron 가동 후 410 폭주 방지.
        // 네트워크 실패는 사용자에게 보이지 않게 swallow (재구독 시 upsert 로 자가복구).
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint }),
        }).catch(() => {});
      }
      setStatus("idle");
    } catch (e) {
      setError((e as Error).message);
    }
  }

  if (status === "unsupported") {
    return (
      <div className="rounded-xl border border-grey-200 bg-grey-50 px-4 py-3 text-[13px] text-grey-600">
        🔕 이 브라우저는 푸시 알림을 지원하지 않아요.
      </div>
    );
  }

  if (status === "denied") {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-900">
        🚫 알림 권한이 차단됐어요. 브라우저 주소창 왼쪽 자물쇠 → 알림 → 허용으로 바꿔주세요.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-grey-200 bg-white px-4 py-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-[14px] font-semibold text-grey-900 mb-0.5">
            🔔 PWA 푸시 알림
            <span className="ml-1.5 text-[11px] font-normal text-emerald-700">
              가동 중
            </span>
          </p>
          <p className="text-[12px] text-grey-600 leading-[1.5]">
            새 정책 매칭 / 마감 임박 알림을 브라우저로 받아요. 클릭률에 따라
            발송 시간대가 자동으로 학습됩니다 (Spec 3).
          </p>
        </div>
        {status === "subscribed" ? (
          <button
            type="button"
            onClick={unsubscribe}
            className="shrink-0 min-h-[40px] px-3 text-[13px] font-semibold text-grey-700 bg-grey-100 rounded-lg hover:bg-grey-200"
          >
            해제
          </button>
        ) : (
          <button
            type="button"
            onClick={subscribe}
            disabled={status === "subscribing"}
            className="shrink-0 min-h-[40px] px-4 text-[13px] font-semibold text-white bg-blue-500 rounded-lg hover:bg-blue-600 disabled:opacity-50"
          >
            {status === "subscribing" ? "등록 중..." : "받기"}
          </button>
        )}
      </div>
      {error && (
        <p className="mt-2 text-[12px] text-red-600">⚠️ {error}</p>
      )}
    </div>
  );
}
