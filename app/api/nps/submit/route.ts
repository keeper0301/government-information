// ============================================================
// C3 — NPS 메일 link 응답 endpoint (anonymous, token 인증).
// ============================================================
// GET /api/nps/submit?u=user_id&t=token&s=score
// token 검증 + nps_responses insert (중복 user_id 차단 — UNIQUE).
// 응답 후 thank-you HTML 반환 (사용자 친화).

import { createAdminClient } from "@/lib/supabase/admin";
import { verifyNpsToken } from "@/lib/nps/token";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

function htmlResponse(title: string, body: string, ok: boolean): Response {
  const color = ok ? "#03b26c" : "#f04452";
  const html = `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, system-ui, sans-serif; background: #f9fafb; padding: 40px 16px; margin: 0;">
  <div style="max-width: 480px; margin: 0 auto; background: white; padding: 32px; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.06);">
    <h1 style="color: ${color}; font-size: 20px; margin-top: 0;">${title}</h1>
    <p style="color: #4e5968; line-height: 1.6;">${body}</p>
    <a href="https://www.keepioo.com" style="display: inline-block; margin-top: 16px; padding: 10px 20px; background: #3182f6; color: white; text-decoration: none; border-radius: 8px; font-weight: 600;">홈으로 →</a>
  </div>
</body>
</html>`;
  return new Response(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const userId = url.searchParams.get("u") ?? "";
  const token = url.searchParams.get("t") ?? "";
  const scoreRaw = url.searchParams.get("s") ?? "";
  const score = Number(scoreRaw);

  if (!userId || !token || !Number.isInteger(score) || score < 1 || score > 5) {
    return htmlResponse(
      "잘못된 요청",
      "응답 link 가 올바르지 않습니다. 메일 본문의 link 를 다시 클릭해 주세요.",
      false,
    );
  }

  if (!verifyNpsToken(userId, token)) {
    return htmlResponse(
      "인증 실패",
      "응답 link 의 token 이 유효하지 않습니다. 메일을 다시 확인해 주세요.",
      false,
    );
  }

  const admin = createAdminClient();
  // UNIQUE (user_id) 라 중복 시 23505 — 사용자에게 친절하게 안내
  const { error } = await admin.from("nps_responses").insert({
    user_id: userId,
    score,
  });

  if (error) {
    if (error.code === "23505") {
      return htmlResponse(
        "이미 응답하셨어요",
        "고맙습니다 — 사용자당 1회만 응답 가능해 한 번 더 응답은 저장되지 않았어요. 자유 의견은 답장 메일로 환영합니다.",
        true,
      );
    }
    return htmlResponse(
      "응답 실패",
      "잠시 후 다시 시도해 주세요. 계속 안 되면 keeper0301@gmail.com 으로 답변 부탁드려요.",
      false,
    );
  }

  return htmlResponse(
    "응답 감사합니다 🙇",
    `${score}점으로 평가해 주셨어요. 사장님이 모든 응답을 직접 확인하고 다음 개선에 반영합니다.`,
    true,
  );
}
