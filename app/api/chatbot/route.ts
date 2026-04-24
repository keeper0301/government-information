import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { welfareToDisplay, loanToDisplay, type DisplayProgram } from "@/lib/programs";
import { checkAndConsumeAiQuota } from "@/lib/quota";

const KEYWORD_MAP: Record<string, { table: "welfare_programs" | "loan_programs"; field: string; value: string }[]> = {
  "청년": [{ table: "welfare_programs", field: "target", value: "%청년%" }, { table: "loan_programs", field: "target", value: "%청년%" }],
  "주거": [{ table: "welfare_programs", field: "category", value: "주거" }],
  "월세": [{ table: "welfare_programs", field: "category", value: "주거" }],
  "취업": [{ table: "welfare_programs", field: "category", value: "취업" }],
  "양육": [{ table: "welfare_programs", field: "category", value: "양육" }],
  "의료": [{ table: "welfare_programs", field: "category", value: "의료" }],
  "대출": [{ table: "loan_programs", field: "category", value: "%대출%" }],
  "소상공인": [{ table: "loan_programs", field: "target", value: "%소상공인%" }],
  "창업": [{ table: "loan_programs", field: "target", value: "%창업%" }],
  "지원금": [{ table: "loan_programs", field: "category", value: "지원금" }],
  "보증": [{ table: "loan_programs", field: "category", value: "보증" }],
  "노인": [{ table: "welfare_programs", field: "target", value: "%노인%" }],
  "기초연금": [{ table: "welfare_programs", field: "title", value: "%기초연금%" }],
};

export async function POST(request: NextRequest) {
  const { message } = await request.json();
  if (!message || typeof message !== "string") {
    return NextResponse.json({ reply: "메시지를 입력해주세요.", programs: [] });
  }

  const supabase = await createClient();

  // ━━━ 로그인 필수 (비용·남용 방어) ━━━
  // 비로그인자는 챗봇 호출 자체 차단. 기존엔 통과시켰으나 악성 스크립트가
  // 무한 호출해 Gemini 비용 유발 가능 → 로그인 유도가 가장 단순·안전.
  // 가입 후엔 getUserTier → 무료/베이직 5회/일 · 프로 무제한 제한 적용.
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      {
        reply:
          "AI 정책 상담은 로그인 후 이용하실 수 있어요. 무료 가입하시면 1일 5회 사용 가능합니다.",
        programs: [],
        requireLogin: true,
      },
      { status: 401 },
    );
  }

  // ━━━ AI 일일 사용량 가드 (가격표 약속 강제) ━━━
  // 무료/베이직: 5회/일. 프로: 무제한.
  // CEO 리뷰 Q4: DB 장애 시 fail-open (호출 허용 + 경고 로그).
  const quota = await checkAndConsumeAiQuota(user.id);
  if (!quota.ok && quota.reason === "over_limit") {
    return NextResponse.json(
      {
        reply: `오늘은 AI 정책 상담을 ${quota.limit}회 모두 사용하셨어요. 내일 다시 이용 가능합니다. 더 자주 쓰시려면 프로 플랜을 확인해보세요.`,
        programs: [],
        quota: { exceeded: true, limit: quota.limit, tier: quota.tier },
      },
      { status: 429 },
    );
  }
  // fail_open / ok 둘 다 통과 — 기존 검색 로직 진행.

  const programs: DisplayProgram[] = [];
  const matchedKeywords: string[] = [];

  // Find matching keywords
  for (const [keyword, queries] of Object.entries(KEYWORD_MAP)) {
    if (message.includes(keyword)) {
      matchedKeywords.push(keyword);
      for (const q of queries) {
        if (q.value.includes("%")) {
          const { data } = await supabase
            .from(q.table)
            .select("*")
            .ilike(q.field, q.value)
            .limit(3);
          if (data) {
            const converted = q.table === "welfare_programs"
              ? data.map(welfareToDisplay)
              : data.map(loanToDisplay);
            programs.push(...converted);
          }
        } else {
          const { data } = await supabase
            .from(q.table)
            .select("*")
            .eq(q.field, q.value)
            .limit(3);
          if (data) {
            const converted = q.table === "welfare_programs"
              ? data.map(welfareToDisplay)
              : data.map(loanToDisplay);
            programs.push(...converted);
          }
        }
      }
    }
  }

  // Deduplicate by id
  const unique = Array.from(new Map(programs.map((p) => [p.id, p])).values());

  // Generate reply
  let reply: string;
  if (unique.length > 0) {
    reply = `"${matchedKeywords.join(", ")}" 관련 프로그램 ${unique.length}건을 찾았습니다.`;
  } else if (message.length < 2) {
    reply = "검색어를 좀 더 구체적으로 입력해주세요. 예: '청년 주거', '소상공인 대출', '의료 지원'";
  } else {
    // Fallback: full-text search
    const sanitized = message.replace(/[%_\\]/g, '\\$&');
    const searchTerm = `%${sanitized}%`;
    const [{ data: w }, { data: l }] = await Promise.all([
      supabase.from("welfare_programs").select("*").or(`title.ilike.%${sanitized}%,description.ilike.%${sanitized}%`).limit(3),
      supabase.from("loan_programs").select("*").or(`title.ilike.%${sanitized}%,description.ilike.%${sanitized}%`).limit(3),
    ]);
    const fallback = [
      ...(w || []).map(welfareToDisplay),
      ...(l || []).map(loanToDisplay),
    ];
    if (fallback.length > 0) {
      reply = `"${message}" 관련 프로그램 ${fallback.length}건을 찾았습니다.`;
      unique.push(...fallback);
    } else {
      reply = "관련 프로그램을 찾지 못했습니다. 다른 키워드로 검색해보세요.\n\n추천 키워드: 청년, 주거, 대출, 소상공인, 의료, 양육";
    }
  }

  return NextResponse.json({ reply, programs: unique.slice(0, 5) });
}
