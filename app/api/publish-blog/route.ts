// ============================================================
// /api/publish-blog — 블로그 글 자동 발행 (cron)
// ============================================================
// 매일 1번 Vercel Cron 에서 호출.
//
// 인증:
//   Vercel Cron 은 자동으로 Authorization: Bearer ${CRON_SECRET} 헤더 추가.
//   외부 호출 차단 위해 동일 시크릿 검증.
//
// 동작:
//   1) 오늘 요일 → 카테고리 결정 (월=청년, 화=소상공인, ...)
//   2) 미발행 정책 1개 선택 (마감 임박 우선)
//   3) Gemini API 로 글 생성 (title·content·faqs·tags)
//   4) blog_posts 에 저장 (published_at = now)
//
// 수동 테스트:
//   POST { dryRun: true, category: "청년" } — DB 저장 안 하고 결과만
//   POST { category: "청년" } — 특정 카테고리로 발행
//   POST {} — 오늘 요일 카테고리로 발행
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { publishOnePost, getTodayCategory } from "@/lib/blog-publish";

// AI 호출이 30초 이상 걸릴 수 있어 Vercel 함수 timeout 늘림
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  // 1) 인증
  const authHeader = request.headers.get("authorization") || "";
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  if (!process.env.CRON_SECRET || authHeader !== expected) {
    return NextResponse.json({ error: "권한이 없습니다." }, { status: 401 });
  }

  // 2) body 파싱
  let opts: { category?: string; dryRun?: boolean } = {};
  try {
    opts = await request.json().catch(() => ({}));
  } catch {
    // body 없음 OK
  }

  try {
    const result = await publishOnePost(opts);

    return NextResponse.json({
      message: result.dryRun ? "Dry run 성공 (DB 저장 안 함)" : "글 발행 완료",
      slug: result.slug,
      title: result.generated.title,
      category: result.generated.category,
      tags: result.generated.tags,
      readingTime: result.reading,
      sourceProgramId: result.sourceProgramId,
      sourceProgramType: result.sourceProgramType,
      url: result.dryRun ? null : `/blog/${result.slug}`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "알 수 없는 오류";
    return NextResponse.json(
      {
        error: "발행 실패",
        detail: message,
        category: opts.category || getTodayCategory(),
      },
      { status: 500 },
    );
  }
}

// GET 은 Vercel Cron 호출용. 인증된 GET 은 자동 발행 (오늘 카테고리).
// 인증 없으면 디버깅용 상태 응답.
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization") || "";
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  const authed = process.env.CRON_SECRET && authHeader === expected;

  if (!authed) {
    return NextResponse.json({
      message: "인증된 GET 또는 POST 로 호출하세요. 인증: Authorization: Bearer ${CRON_SECRET}",
      todayCategory: getTodayCategory(),
    });
  }

  // Vercel Cron 또는 인증된 GET → 자동 발행
  try {
    const result = await publishOnePost();
    return NextResponse.json({
      message: "글 발행 완료 (cron)",
      slug: result.slug,
      title: result.generated.title,
      category: result.generated.category,
      url: `/blog/${result.slug}`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "알 수 없는 오류";
    return NextResponse.json(
      { error: "발행 실패", detail: message, category: getTodayCategory() },
      { status: 500 },
    );
  }
}
