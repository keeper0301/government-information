// ============================================================
// /api/indexnow-key — IndexNow 사이트 소유자 검증 endpoint
// ============================================================
// IndexNow 표준 (https://www.indexnow.org/) 은 검색엔진이 사이트 소유자
// 검증을 위해 keyLocation URL 을 GET 해 key 응답 확인.
//
// 흐름:
//   1) lib/indexnow.ts 가 ping 시 keyLocation = "{site}/api/indexnow-key" 명시
//   2) 네이버·Bing·Yandex 봇이 GET /api/indexnow-key
//   3) 응답 본문 = INDEXNOW_KEY (text/plain)
//   4) 응답 = 요청 페이로드의 key 값과 일치하면 검증 통과
//
// 보안 주의:
//   - 이 endpoint 는 누구나 접근 가능 (검색엔진 봇이 익명 접근)
//   - INDEXNOW_KEY 자체는 secret 아님 (URL 검증용 토큰, 노출 OK)
//   - 그러나 다른 사람이 우리 key 알면 다른 도메인 색인 갱신 시도 가능
//     → 검색엔진은 keyLocation 도메인이 ping 도메인과 일치 검사라 무해
// ============================================================

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "edge";

export async function GET() {
  const key = process.env.INDEXNOW_KEY;
  if (!key) {
    // 환경변수 미설정 — 404 (검색엔진 봇이 검증 실패 처리)
    return new NextResponse("INDEXNOW_KEY not configured", { status: 404 });
  }

  // 표준 형식: text/plain 본문에 key 만
  return new NextResponse(key, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=86400", // 1일 캐시 (key 자주 안 바뀜)
    },
  });
}
