import { NextResponse } from "next/server";

export function authorizeNaverExtensionRequest(request: Request): NextResponse | null {
  const secret = process.env.NAVER_EXTENSION_SECRET;

  if (!secret) {
    return NextResponse.json(
      { error: "NAVER_EXTENSION_SECRET 비밀값이 설정되지 않았습니다." },
      { status: 500 },
    );
  }

  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "인증에 실패했습니다." }, { status: 401 });
  }

  return null;
}
