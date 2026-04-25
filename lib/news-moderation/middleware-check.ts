// ============================================================
// 정책 뉴스 모더레이션 — middleware 사전 차단
// ============================================================
// 스펙: docs/superpowers/specs/2026-04-25-news-moderation-design.md (3.2)
//
// 역할:
//   /news/[slug] 요청에 대해 admin 우회 service_role 로 is_hidden 1회 조회.
//   hidden=true 이고 admin 이 아니면 ISR 캐시·page 도달 전에 즉시 410 Gone
//   응답으로 가로챈다. noindex 메타 포함 — Google·Naver 가 다음 크롤 때
//   인덱스에서 빠르게 빼도록 (404 보다 410 이 영구 삭제 신호로 더 강함).
//
//   admin 본인 (isAdminUser) 이면 통과 → page.tsx 가 admin 배너 + 복원 버튼
//   포함한 화면 렌더.
//
// 비용 고려:
//   - regex 매치 실패 시 즉시 return (대부분 요청에 영향 0).
//   - /news/[slug] 만 admin client 로 1행 select (slug 인덱스 → 빠름).
//   - 매 요청 createAdminClient 호출 — supabase-js 인스턴스 생성 비용 무시 가능.
// ============================================================

import { NextResponse, type NextRequest } from "next/server";
import type { User } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminUser } from "@/lib/admin-auth";

// /news/{slug} 또는 /news/{slug}/ 만 매치. /news, /news/keyword/... 등은 제외.
const NEWS_SLUG_PATTERN = /^\/news\/([^/]+)\/?$/;

// 410 Gone HTML 본문 — Tailwind 미사용, inline style 로 자체 완결.
// noindex 메타 + 한국어 안내 + /news 목록 CTA + KOGL 라이선스 표기.
function buildGoneHtml(): string {
  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>비공개된 정책 소식 | 정책알리미</title>
<style>
  html,body{margin:0;padding:0}
  body{font-family:-apple-system,BlinkMacSystemFont,"Pretendard","Segoe UI",sans-serif;background:#fafafa;color:#111;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px;-webkit-font-smoothing:antialiased}
  .card{background:#fff;border:1px solid #eaeaea;border-radius:16px;max-width:480px;width:100%;padding:40px 28px;text-align:center;box-shadow:0 1px 3px rgba(0,0,0,0.04)}
  h1{font-size:22px;font-weight:700;margin:0 0 12px;letter-spacing:-0.4px}
  p{font-size:14px;line-height:1.7;color:#555;margin:0 0 24px}
  a.cta{display:inline-block;min-height:44px;padding:12px 24px;background:#0050ff;color:#fff;text-decoration:none;font-size:14px;font-weight:600;border-radius:8px;line-height:20px}
  a.cta:hover{background:#003fcc}
  small{display:block;font-size:11px;color:#999;margin-top:28px}
  small a{color:#666;text-decoration:underline}
</style>
</head>
<body>
<main class="card">
  <h1>이 뉴스는 현재 비공개 상태입니다</h1>
  <p>운영 정책상 비공개된 정책 소식이에요.<br>다른 최신 정책 소식은 아래에서 확인해 주세요.</p>
  <a class="cta" href="/news">→ 정책 소식 목록 보기</a>
  <small>HTTP 410 Gone · <a href="/">정책알리미 홈으로</a></small>
</main>
</body>
</html>`;
}

// /news/[slug] 가 hidden 이고 사용자가 admin 이 아니면 410 응답 반환, 아니면 null.
// updateSession 내부에서 user 객체와 함께 호출.
export async function checkHiddenNews(
  request: NextRequest,
  user: User | null,
): Promise<NextResponse | null> {
  const match = request.nextUrl.pathname.match(NEWS_SLUG_PATTERN);
  if (!match) return null;

  // 한글 slug 대응 — page.tsx 의 safeDecodeSlug 와 동일 패턴.
  // 잘못된 인코딩이면 page 가 알아서 404 처리하도록 그대로 통과.
  let slug: string;
  try {
    slug = decodeURIComponent(match[1]);
  } catch {
    return null;
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("news_posts")
    .select("is_hidden")
    .eq("slug", slug)
    .maybeSingle();

  // row 없음 (잘못된 slug) → page.tsx 가 notFound() → 404
  if (error || !data) return null;
  // 공개 → 통과
  if (data.is_hidden !== true) return null;
  // hidden 인데 admin → 통과 (page 가 admin 복원 배너 렌더)
  if (user && isAdminUser(user.email)) return null;

  // 비admin → 410 응답
  return new NextResponse(buildGoneHtml(), {
    status: 410,
    headers: {
      "content-type": "text/html; charset=utf-8",
      // CDN 캐시 짧게 — 복원되면 빠르게 재크롤 시 정상 페이지로 회복
      "cache-control": "public, max-age=0, s-maxage=60",
      "x-robots-tag": "noindex, nofollow",
    },
  });
}
