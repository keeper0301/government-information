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
  | { ok: true; messageId: number | null }
  | { ok: false; reason: "skipped_no_credentials"; error?: undefined }
  | { ok: false; reason: "api_error"; error: string }
  | { ok: false; reason: "network_error"; error: string };

function pickOwnerChatId(): string | null {
  // 신 표기 우선 (CSV 첫 값)
  const owners = process.env.TELEGRAM_OWNER_CHAT_IDS;
  if (owners) {
    const first = owners.split(",").map((s) => s.trim()).find(Boolean);
    if (first) return first;
  }
  // backward compat
  const legacy = process.env.TELEGRAM_CHAT_ID;
  if (legacy && legacy.trim()) return legacy.trim();
  return null;
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
  const chatId = pickOwnerChatId();

  if (!token || !chatId) {
    return { ok: false, reason: "skipped_no_credentials" };
  }

  // 텔레그램 4096자 한도. subject + message 합쳐 4000자 안에서 truncate (마진 96자).
  const subjectLine = subject ? `${subject}\n\n` : "";
  const text = `${subjectLine}${message}`.slice(0, 4000);

  let res: Response;
  try {
    res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        // disable_web_page_preview 로 텔레그램 자동 preview 차단 (alert 본문 가독성)
        disable_web_page_preview: true,
      }),
    });
  } catch (e) {
    return { ok: false, reason: "network_error", error: (e as Error).message };
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    return {
      ok: false,
      reason: "api_error",
      error: `http_${res.status}: ${body}`.slice(0, 300),
    };
  }

  // 텔레그램 응답 — { ok: true, result: { message_id: N, ... } }
  const json: unknown = await res.json().catch(() => ({}));
  const messageId = extractMessageId(json);
  return { ok: true, messageId };
}

function extractMessageId(json: unknown): number | null {
  if (!json || typeof json !== "object") return null;
  const result = (json as Record<string, unknown>).result;
  if (!result || typeof result !== "object") return null;
  const id = (result as Record<string, unknown>).message_id;
  return typeof id === "number" ? id : null;
}
