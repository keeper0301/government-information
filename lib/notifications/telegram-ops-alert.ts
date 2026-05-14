// ============================================================
// 운영 alert 텔레그램 push (사장님 봇 채널)
// ============================================================
// SMS (Solapi) 실패 시 fallback layer.
// 데이터 기반 사고 (2026-05-14): 5/9 11:11 부터 SMS api_error 5일 연속 →
// 사장님 alert 채널 단절. 텔레그램 봇은 이미 가동 중 (Phase 1~5 완료) 이라
// 같은 token 으로 health-alert push 가능 — 메타 안전책.
//
// 환경변수:
//   TELEGRAM_BOT_TOKEN — 봇 token (다른 cron 과 공유)
//   TELEGRAM_CHAT_ID   — 사장님 chat id (legacy backward compat)
//   또는 TELEGRAM_OWNER_CHAT_IDS — 신 표기 (lib/telegram/permissions.ts 참고)
//
// 사용처: app/api/cron/health-alert/route.ts
// ============================================================

export type OpsAlertTelegramResult =
  | { ok: true; messageId: number | null; sent: number; failed: number }
  | { ok: false; reason: "skipped_no_credentials"; error?: undefined }
  | { ok: false; reason: "api_error"; error: string; sent?: number; failed?: number }
  | { ok: false; reason: "network_error"; error: string };

// 2026-05-14 — multi-owner 발송 (subagent Critical-2 fix).
// TELEGRAM_OWNER_CHAT_IDS = "100,200,300" CSV 노트북·본체PC·Mac multi-device 의도.
// 첫 1명만 받으면 1차 device 다운 시 메타 안전책 무력 → 모든 owner 합집합에 발송.
// lib/telegram/permissions.ts 의 owner Set 시맨틱과 일관.
function pickAllOwnerChatIds(): string[] {
  const set = new Set<string>();
  // 신 표기 (CSV 다중)
  const owners = process.env.TELEGRAM_OWNER_CHAT_IDS;
  if (owners) {
    for (const id of owners.split(",")) {
      const trimmed = id.trim();
      if (trimmed) set.add(trimmed);
    }
  }
  // backward compat — 단일 chat id
  const legacy = process.env.TELEGRAM_CHAT_ID;
  if (legacy && legacy.trim()) set.add(legacy.trim());
  return Array.from(set);
}

/**
 * 사장님 텔레그램으로 운영 alert push.
 * SMS 실패 시 fallback — 메타 안전책 (alert 채널 다중화).
 *
 * - token / chat_id 누락 시 skipped (운영 미설정 단계 보호)
 * - 4096자 텔레그램 한도 안에서 자동 truncate
 * - 발송 실패 시 reason 별 분류 — 호출자가 audit 가능
 */
export async function sendOpsAlertTelegram({
  subject,
  message,
}: {
  subject: string;
  message: string;
}): Promise<OpsAlertTelegramResult> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatIds = pickAllOwnerChatIds();

  if (!token || chatIds.length === 0) {
    return { ok: false, reason: "skipped_no_credentials" };
  }

  // 텔레그램 4096자 한도. subject + message 합쳐 4000자 안에서 truncate (마진 96자).
  const subjectLine = subject ? `${subject}\n\n` : "";
  const text = `${subjectLine}${message}`.slice(0, 4000);

  // 모든 owner 에 병렬 발송 (Promise.allSettled — 한 owner 실패해도 다른 owner 진행).
  const results = await Promise.allSettled(
    chatIds.map((chatId) =>
      fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          disable_web_page_preview: true,
        }),
      }).then(async (res) => {
        if (!res.ok) {
          const body = await res.text().catch(() => "");
          throw new Error(`http_${res.status}: ${body}`.slice(0, 300));
        }
        const json: unknown = await res.json().catch(() => ({}));
        return extractMessageId(json);
      }),
    ),
  );

  let sent = 0;
  let failed = 0;
  let firstMessageId: number | null = null;
  let firstError = "";
  for (const r of results) {
    if (r.status === "fulfilled") {
      sent++;
      if (firstMessageId === null) firstMessageId = r.value;
    } else {
      failed++;
      if (!firstError) firstError = (r.reason as Error).message ?? "unknown";
    }
  }

  // 1명이라도 도달하면 ok=true (메타 안전책 — multi-device 합집합).
  if (sent > 0) {
    return { ok: true, messageId: firstMessageId, sent, failed };
  }
  // 전부 실패 시 first error 노출
  const isNetwork = firstError.toLowerCase().includes("fetch") || firstError.toLowerCase().includes("network");
  return {
    ok: false,
    reason: isNetwork ? "network_error" : "api_error",
    error: firstError.slice(0, 300),
    sent,
    failed,
  };
}

function extractMessageId(json: unknown): number | null {
  if (!json || typeof json !== "object") return null;
  const result = (json as Record<string, unknown>).result;
  if (!result || typeof result !== "object") return null;
  const id = (result as Record<string, unknown>).message_id;
  return typeof id === "number" ? id : null;
}
