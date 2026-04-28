// ============================================================
// /api/admin/classify-press — 보도자료 LLM 분류 (사장님 trigger)
// ============================================================
// POST { news_id } → news_posts row fetch → Anthropic Haiku 분류 → 결과 반환
// 자동 INSERT X — 결과를 받아 사장님이 수동 등록 폼으로 넘기는 흐름.
//
// 비용 통제:
//   - 어드민 권한 체크 (사장님만)
//   - 본문 길이 cap (classify.ts 내부에서 4000자)
//   - 호출 결과 admin_actions 기록 (audit + 비용 추적)
// ============================================================

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminUser } from "@/lib/admin-auth";
import { logAdminAction } from "@/lib/admin-actions";
import { classifyPressNews } from "@/lib/press-ingest/classify";

export async function POST(req: Request) {
  // 권한 체크
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !isAdminUser(user.email)) {
    return NextResponse.json({ error: "권한 없음" }, { status: 403 });
  }

  // 입력 파싱
  let body: { news_id?: string };
  try {
    body = (await req.json()) as { news_id?: string };
  } catch {
    return NextResponse.json({ error: "JSON 파싱 실패" }, { status: 400 });
  }
  const newsId = body.news_id;
  if (!newsId || typeof newsId !== "string") {
    return NextResponse.json({ error: "news_id 누락" }, { status: 400 });
  }
  // UUID 형식 가드
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      newsId,
    )
  ) {
    return NextResponse.json({ error: "news_id 형식 오류" }, { status: 400 });
  }

  // news_post 조회
  const admin = createAdminClient();
  const { data: news, error: newsErr } = await admin
    .from("news_posts")
    .select("id, title, summary, body, ministry")
    .eq("id", newsId)
    .maybeSingle();
  if (newsErr || !news) {
    return NextResponse.json({ error: "보도자료 not found" }, { status: 404 });
  }

  // LLM 호출 — ANTHROPIC_API_KEY 미설정 시 throw 캐치
  let result;
  try {
    result = await classifyPressNews({
      title: news.title,
      summary: news.summary,
      body: news.body,
    });
  } catch (e) {
    const msg = (e as Error).message;
    // ANTHROPIC_API_KEY 미설정은 503 (서비스 미준비), 그 외는 502 (외부 API 실패)
    const status = msg.includes("ANTHROPIC_API_KEY") ? 503 : 502;
    return NextResponse.json({ error: msg }, { status });
  }

  // 감사 로그 — LLM 호출 자체 기록 (비용 추적 + 호출 빈도)
  try {
    await logAdminAction({
      actorId: user.id,
      action: "manual_program_create", // 등록 단계 전이지만 같은 액션 그룹
      details: {
        kind: "press_classify",
        news_id: newsId,
        ministry: news.ministry,
        is_policy: result.is_policy,
        program_type: result.program_type,
      },
    });
  } catch (e) {
    console.warn("[classify-press] 감사 로그 실패:", e);
  }

  return NextResponse.json(result);
}
