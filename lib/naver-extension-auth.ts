import { NextResponse } from "next/server";
import { safeKeyEqual } from "@/lib/safe-key-equal";

// safeKeyEqual 은 node:crypto 기반(Edge 미지원) — 이 헬퍼를 쓰는 라우트
// (api/naver-extension/next·published) 는 모두 nodejs runtime 이어야 한다.
export function authorizeNaverExtensionRequest(request: Request): NextResponse | null {
  const secret = process.env.NAVER_EXTENSION_SECRET;

  if (!secret) {
    return NextResponse.json(
      { error: "NAVER_EXTENSION_SECRET 비밀값이 설정되지 않았습니다." },
      { status: 500 },
    );
  }

  // 상수시간 비교 (타이밍 공격 방어, 코드리뷰 P2 2026-06-08).
  const got = request.headers.get("authorization") ?? "";
  if (!safeKeyEqual(got, `Bearer ${secret}`)) {
    return NextResponse.json({ error: "인증에 실패했습니다." }, { status: 401 });
  }

  return null;
}
