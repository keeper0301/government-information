import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { welfareToDisplay, loanToDisplay, type DisplayProgram } from "@/lib/programs";
import {
  WELFARE_EXCLUDED_FILTER,
  LOAN_EXCLUDED_FILTER,
} from "@/lib/listing-sources";
import { checkAndConsumeAiQuota } from "@/lib/quota";

// 챗봇 검색 결과에서 EXCLUDED 차단을 단일 helper 로 — 매 .from() 마다 분기 반복 회피
function applyExcludedFilter<Q extends { not: (col: string, op: string, val: string) => Q }>(
  query: Q,
  table: "welfare_programs" | "loan_programs",
): Q {
  return query.not(
    "source_code",
    "in",
    table === "welfare_programs" ? WELFARE_EXCLUDED_FILTER : LOAN_EXCLUDED_FILTER,
  );
}

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
  const body = await request.json();
  const { message, programId, programType } = body as {
    message?: string;
    programId?: string;
    programType?: "welfare" | "loan";
  };

  // 신청 가이드 모드 — 메시지보다 우선 처리
  // 사용자가 추천 카드의 "신청 가이드" 버튼을 누르면 클라이언트가 programId/programType 을 전송.
  // 이 경우 키워드 검색 대신 해당 정책의 자격·서류·기간·문의처를 단계별로 안내.
  if (programId && (programType === "welfare" || programType === "loan")) {
    return await handleApplyGuide(programId, programType);
  }

  if (!message || typeof message !== "string") {
    return NextResponse.json({ reply: "메시지를 입력해주세요.", programs: [] });
  }

  const supabase = await createClient();

  // ━━━ 로그인 필수 (서버 부하·남용 방어) ━━━
  // 비로그인자는 챗봇 호출 자체 차단. 악성 스크립트가 무한 호출 시 DB 과부하
  // 가능 → 로그인 유도가 가장 단순·안전. 챗봇은 키워드 매칭 + Supabase 검색만
  // 수행 (LLM 호출 없음). quota 는 사용 빈도 통계·향후 확장 대비.
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
          const baseQ = supabase.from(q.table).select("*");
          const { data } = await applyExcludedFilter(baseQ, q.table)
            .ilike(q.field, q.value)
            .limit(3);
          if (data) {
            const converted = q.table === "welfare_programs"
              ? data.map(welfareToDisplay)
              : data.map(loanToDisplay);
            programs.push(...converted);
          }
        } else {
          const baseQ = supabase.from(q.table).select("*");
          const { data } = await applyExcludedFilter(baseQ, q.table)
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
    const [{ data: w }, { data: l }] = await Promise.all([
      supabase
        .from("welfare_programs")
        .select("*")
        .not("source_code", "in", WELFARE_EXCLUDED_FILTER)
        .or(`title.ilike.%${sanitized}%,description.ilike.%${sanitized}%`)
        .limit(3),
      supabase
        .from("loan_programs")
        .select("*")
        .not("source_code", "in", LOAN_EXCLUDED_FILTER)
        .or(`title.ilike.%${sanitized}%,description.ilike.%${sanitized}%`)
        .limit(3),
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

// ━━━ 신청 가이드 응답 생성 ━━━
// 정책 한 건의 자격·혜택·기간·서류·신청·문의 정보를 단계별로 정리해 반환.
// 누락된 필드는 자동으로 건너뛰고, 출처 페이지 링크는 항상 제공.
async function handleApplyGuide(
  programId: string,
  programType: "welfare" | "loan",
): Promise<NextResponse> {
  const supabase = await createClient();
  // 가이드는 비로그인도 허용 — 추천 카드를 본 흐름이라 안내가 자연스러움.
  // quota 도 가이드는 차감 안 함 (LLM 호출 없는 단순 데이터 조회).

  const table = programType === "welfare" ? "welfare_programs" : "loan_programs";
  const { data: program } = await supabase
    .from(table)
    .select("*")
    .eq("id", programId)
    .maybeSingle();

  if (!program) {
    return NextResponse.json({
      reply: "해당 정책 정보를 찾지 못했어요. 정책이 종료됐거나 ID 가 잘못된 것 같아요.",
      programs: [],
    });
  }

  // 단계별 안내 — 누락된 필드는 빠짐
  const lines: string[] = [];
  lines.push(`📋 ${program.title} 신청 가이드\n`);

  // 1) 자격 요건
  if (program.eligibility) {
    lines.push("1️⃣ 자격 요건");
    lines.push(program.eligibility.trim());
    lines.push("");
  }

  // 2) 혜택 (welfare 만) / 한도·금리 (loan 만)
  if (programType === "welfare" && program.benefits) {
    lines.push("2️⃣ 혜택 내용");
    lines.push(program.benefits.trim());
    lines.push("");
  } else if (programType === "loan") {
    const loanDetails: string[] = [];
    if (program.loan_amount) loanDetails.push(`· 한도: ${program.loan_amount}`);
    if (program.interest_rate) loanDetails.push(`· 금리: ${program.interest_rate}`);
    if (program.repayment_period) loanDetails.push(`· 상환: ${program.repayment_period}`);
    if (loanDetails.length > 0) {
      lines.push("2️⃣ 대출 조건");
      lines.push(...loanDetails);
      lines.push("");
    }
  }

  // 3) 신청 기간 + D-day
  const periodParts: string[] = [];
  if (program.apply_start && program.apply_end) {
    periodParts.push(`${program.apply_start} ~ ${program.apply_end}`);
  } else if (program.apply_start) {
    periodParts.push(`${program.apply_start} ~`);
  } else if (program.apply_end) {
    periodParts.push(`~ ${program.apply_end}`);
  } else {
    periodParts.push("상시");
  }
  if (program.apply_end) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const end = new Date(program.apply_end);
    end.setHours(0, 0, 0, 0);
    const diff = Math.ceil((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    if (diff < 0) periodParts.push("(이미 마감)");
    else if (diff === 0) periodParts.push("(오늘 마감)");
    else if (diff <= 7) periodParts.push(`(D-${diff} 마감 임박)`);
    else periodParts.push(`(D-${diff})`);
  }
  lines.push("3️⃣ 신청 기간");
  lines.push(periodParts.join(" "));
  lines.push("");

  // 4) 필요 서류
  if (program.required_documents) {
    lines.push("4️⃣ 필요 서류");
    lines.push(program.required_documents.trim());
    lines.push("");
  }

  // 5) 신청 방법
  if (program.apply_method) {
    lines.push("5️⃣ 신청 방법");
    lines.push(program.apply_method.trim());
    lines.push("");
  }

  // 6) 문의처
  if (program.contact_info) {
    lines.push("6️⃣ 문의처");
    lines.push(program.contact_info.trim());
    lines.push("");
  }

  // 7) 신청 링크
  const applyUrl = program.apply_url || program.source_url;
  if (applyUrl) {
    lines.push(`🔗 신청·자세히 보기: ${applyUrl}`);
  }

  // 정확한 정보는 출처 사이트에서 다시 확인 — 면책 안내
  lines.push("");
  lines.push("※ 자세한 자격·서류 기준은 위 출처에서 다시 확인해 주세요.");

  return NextResponse.json({
    reply: lines.join("\n"),
    programs: [], // 가이드 모드는 카드 추가 안 함
  });
}
