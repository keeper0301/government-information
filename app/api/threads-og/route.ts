/**
 * Threads 미디어 검증용 OG PNG 서빙
 *
 * 왜 별도 route 인가?
 *   Vercel 의 정적 자산 응답에는 `Content-Disposition: inline; filename="..."` 가
 *   자동으로 붙는데, Threads 미디어 검증 봇이 이 헤더가 있으면 거부함
 *   (error_subcode 2207052 — 미디어 다운로드 실패).
 *
 *   이 route 는 PNG 를 직접 응답에 박아 헤더를 완전 제어 — Content-Disposition
 *   없이, Cache-Control 은 long-cache, Content-Type 은 image/png 만.
 *
 * URL: https://www.keepioo.com/api/threads-og
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const runtime = "nodejs";
// 빌드 시 한 번만 PNG 읽고 정적 응답 — 매 요청마다 fs 호출 안 함
export const dynamic = "force-static";

export async function GET() {
  const filePath = join(process.cwd(), "public", "threads-og.png");
  const buffer = await readFile(filePath);

  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=31536000, immutable",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
