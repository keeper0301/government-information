// ⚠️ 임시 진단 라우트 — blog 429 의 Gemini "원본" 사유를 확인하기 위한 1회성 코드.
// SDK(@google/genai)가 429 를 "Retryable HTTP Error: Too Many Requests" 로 가려서,
// raw fetch 로 generativelanguage API 를 직접 호출해 원본 status·body 를 받는다.
// ⚠️ 원인 확인 즉시 이 파일은 삭제(git rm)한다. (보안: 인증 필수 + 키 미노출)

import { NextRequest, NextResponse } from "next/server";
import { isPrivateCronRequestAuthorized } from "@/lib/cron-auth";

export const maxDuration = 30;

export async function GET(request: NextRequest) {
  // CRON_SECRET 인증 — 외부 노출 차단 (publish-blog 와 동일 인증)
  if (!isPrivateCronRequestAuthorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    return NextResponse.json({ error: "GEMINI_API_KEY 미설정" }, { status: 500 });
  }

  // blog 와 동일한 모델로 최소 호출 → 원본 응답 확인
  const url =
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" +
    key;

  let httpStatus = 0;
  let body = "";
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: "ping" }] }] }),
    });
    httpStatus = res.status;
    body = await res.text();
  } catch (e) {
    return NextResponse.json(
      { error: "fetch 실패", detail: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }

  // 키는 응답에 절대 포함하지 않음 — 길이만 노출(키 적용 여부 sanity check 용)
  return NextResponse.json({
    httpStatus,
    keyLength: key.length,
    body: body.slice(0, 3000),
  });
}
