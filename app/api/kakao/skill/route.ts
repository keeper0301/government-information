// ============================================================
// 카카오 i 오픈빌더 webhook — keepioo 정책알리미 챗봇 스킬
// ============================================================
// 카카오톡 채널 (@keepioo) 사용자가 메시지 보내면 카카오 i 오픈빌더 →
// 이 엔드포인트(POST) 로 전달. SkillResponse JSON 반환하면 카톡에 노출.
//
// MVP 정책 (브레인스토밍 결정):
//   · 결정1=C: 익명 처리 (카카오 userKey 와 keepioo user_id 매핑 안 함)
//   · 결정2=A: 5개 핵심 의도만 (복지·대출·1분 진단·청년·사장님)
//   · 결정3=B: fallback 시 1분 진단 유도
//
// 응답 포맷: 카카오 i 오픈빌더 SkillResponse 2.0
//   simpleText (텍스트), listCard (카드 목록), quickReplies (빠른 답변)
//
// 노출 위치: chatbot.kakao.com → 봇 → 스킬 → URL 등록
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { welfareToDisplay, loanToDisplay, type DisplayProgram } from "@/lib/programs";
import {
  WELFARE_EXCLUDED_FILTER,
  LOAN_EXCLUDED_FILTER,
} from "@/lib/listing-sources";

// 카카오 챗봇 타임아웃 5초 — Vercel 콜드스타트 + Supabase 쿼리 합쳐서 가드
export const maxDuration = 5;

// BASE_URL — 운영 도메인. 프리뷰 배포·local 에서도 prod URL 보내야
// listCard 의 webLink 가 정상 작동 (사용자는 prod 도메인만 인지).
const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://www.keepioo.com";

// KST 오늘 날짜 (YYYY-MM-DD) — apply_end 비교용.
// new Date().toISOString() 은 UTC 기준이라, 한국 자정 직후 (KST 0~9시) 에는
// today 가 KST 기준 어제로 잡혀 마감된 정책이 "마감 임박" 으로 잘못 노출되는 버그.
// → UTC 에 +9h 더해 KST Date 생성 후 ISO 슬라이스.
function getKstToday(): string {
  const kstNow = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return kstNow.toISOString().slice(0, 10);
}

// 모든 응답에 quickReplies 로 5개 의도 빠른 진입 노출
const QUICK_REPLIES = [
  { label: "복지", action: "message", messageText: "복지" },
  { label: "대출", action: "message", messageText: "대출" },
  { label: "청년", action: "message", messageText: "청년" },
  { label: "사장님", action: "message", messageText: "사장님" },
  { label: "1분 진단", action: "message", messageText: "1분 진단" },
];

// 카카오 i 오픈빌더 응답 형식 — simpleText
function simpleTextResponse(text: string) {
  return NextResponse.json({
    version: "2.0",
    template: {
      outputs: [
        {
          // simpleText.text 1000자 제한 — 안전 마진 800
          simpleText: { text: text.slice(0, 800) },
        },
      ],
      quickReplies: QUICK_REPLIES,
    },
  });
}

// 카카오 i 오픈빌더 응답 형식 — listCard
// 정책 카드 5개 + 전체 보기 버튼
function listCardResponse(
  headerTitle: string,
  programs: DisplayProgram[],
  moreUrl: string,
) {
  // listCard 아이템 최대 5개. title 36자, description 40자 제한.
  const items = programs.slice(0, 5).map((p) => {
    const target = p.target || "전체";
    const ddayLabel =
      p.dday == null
        ? null
        : p.dday < 0
          ? "마감"
          : p.dday === 0
            ? "오늘 마감"
            : `D-${p.dday}`;
    const descParts = [target, ddayLabel].filter(Boolean);
    return {
      title: p.title.slice(0, 36),
      description: descParts.join(" · ").slice(0, 40),
      link: { web: `${BASE_URL}/${p.type}/${p.id}` },
    };
  });

  return NextResponse.json({
    version: "2.0",
    template: {
      outputs: [
        {
          listCard: {
            header: { title: headerTitle.slice(0, 36) },
            items,
            buttons: [
              {
                label: "전체 보기",
                action: "webLink",
                webLinkUrl: moreUrl,
              },
            ],
          },
        },
      ],
      quickReplies: QUICK_REPLIES,
    },
  });
}

// 사용자 발화 → 의도 분류
// 5개 키워드 + 변형 매칭. 단순 includes 기반 (정규식 부담 회피).
type Intent = "welfare" | "loan" | "quiz" | "youth" | "business" | null;
function matchIntent(utterance: string): Intent {
  const u = utterance.toLowerCase().replace(/\s+/g, "");

  // 1분 진단 — 의도 우선순위 가장 높음 (사용자 자신을 알려준다는 시그널)
  if (
    u.includes("진단") ||
    u.includes("추천") ||
    u.includes("내게") ||
    u.includes("나에게") ||
    u.includes("맞춤") ||
    u.includes("나한테")
  ) {
    return "quiz";
  }

  // 청년 — 대상 키워드 (loan/welfare 둘 다에서 검색)
  if (u.includes("청년")) return "youth";

  // 사장님·소상공인·자영업자
  if (u.includes("사장") || u.includes("소상공인") || u.includes("자영업")) {
    return "business";
  }

  // 대출·자금·지원금
  if (u.includes("대출") || u.includes("자금") || u.includes("지원금")) {
    return "loan";
  }

  // 복지·보조금·혜택
  if (u.includes("복지") || u.includes("보조금") || u.includes("혜택")) {
    return "welfare";
  }

  return null;
}

export async function POST(request: NextRequest) {
  let body: { userRequest?: { utterance?: string } };
  try {
    body = await request.json();
  } catch {
    return simpleTextResponse(
      "요청을 처리할 수 없어요. 다시 메시지를 보내주세요.",
    );
  }

  const utterance = (body?.userRequest?.utterance || "").trim();
  if (!utterance) {
    return simpleTextResponse(
      "안녕하세요! keepioo 정책알리미예요.\n\n어떤 정책을 찾으세요?\n아래 빠른 답변을 눌러보세요.",
    );
  }

  const intent = matchIntent(utterance);
  const supabase = createAdminClient();
  const today = getKstToday();

  // 운영 모니터링용 로그 — Vercel Functions 로그에서 의도별 호출 빈도·fallback
  // 비율 등을 확인. fallback 이 많으면 발화 추가 또는 의도 추가 필요.
  const log = (programsCount: number) => {
    console.log(JSON.stringify({
      kind: "kakao-skill",
      intent: intent ?? "fallback",
      utterance: utterance.slice(0, 60),
      programsCount,
      today,
    }));
  };

  // ━━━ 1분 진단 유도 ━━━
  if (intent === "quiz") {
    log(0);
    return simpleTextResponse(
      `🎯 1분 진단으로 맞춤 정책 받기\n\n나이·지역·가구 상태만 입력하면\n수천 개 정책 중 나에게 맞는\n정책을 골라드려요.\n\n👉 ${BASE_URL}/quiz`,
    );
  }

  // ━━━ 복지 정책 추천 ━━━
  if (intent === "welfare") {
    const { data } = await supabase
      .from("welfare_programs")
      .select("*")
      .not("source_code", "in", WELFARE_EXCLUDED_FILTER)
      .gte("apply_end", today)
      .order("apply_end", { ascending: true })
      .limit(5);
    const programs = (data || []).map(welfareToDisplay);
    log(programs.length);
    if (programs.length === 0) {
      return simpleTextResponse(
        "현재 마감 임박한 복지 정책이 없어요.\n잠시 후 다시 확인해주세요.",
      );
    }
    return listCardResponse(
      "복지 정책 (마감 임박)",
      programs,
      `${BASE_URL}/welfare`,
    );
  }

  // ━━━ 대출·지원금 추천 ━━━
  if (intent === "loan") {
    const { data } = await supabase
      .from("loan_programs")
      .select("*")
      .not("source_code", "in", LOAN_EXCLUDED_FILTER)
      .gte("apply_end", today)
      .order("apply_end", { ascending: true })
      .limit(5);
    const programs = (data || []).map(loanToDisplay);
    log(programs.length);
    if (programs.length === 0) {
      return simpleTextResponse(
        "현재 마감 임박한 대출·지원금이 없어요.\n잠시 후 다시 확인해주세요.",
      );
    }
    return listCardResponse(
      "대출·지원금 (마감 임박)",
      programs,
      `${BASE_URL}/loan`,
    );
  }

  // ━━━ 청년 대상 정책 (welfare + loan 혼합) ━━━
  if (intent === "youth") {
    const [welfareRes, loanRes] = await Promise.all([
      supabase
        .from("welfare_programs")
        .select("*")
        .not("source_code", "in", WELFARE_EXCLUDED_FILTER)
        .ilike("target", "%청년%")
        .gte("apply_end", today)
        .order("apply_end", { ascending: true })
        .limit(3),
      supabase
        .from("loan_programs")
        .select("*")
        .not("source_code", "in", LOAN_EXCLUDED_FILTER)
        .ilike("target", "%청년%")
        .gte("apply_end", today)
        .order("apply_end", { ascending: true })
        .limit(2),
    ]);
    const programs = [
      ...(welfareRes.data || []).map(welfareToDisplay),
      ...(loanRes.data || []).map(loanToDisplay),
    ];
    log(programs.length);
    if (programs.length === 0) {
      return simpleTextResponse(
        "청년 대상 정책을 찾지 못했어요.\n복지·대출 카테고리에서 직접 살펴보세요.",
      );
    }
    return listCardResponse(
      "청년 정책 추천",
      programs,
      `${BASE_URL}/welfare?target=청년`,
    );
  }

  // ━━━ 사장님·소상공인·자영업자 ━━━
  if (intent === "business") {
    const { data } = await supabase
      .from("loan_programs")
      .select("*")
      .not("source_code", "in", LOAN_EXCLUDED_FILTER)
      .ilike("target", "%소상공인%")
      .gte("apply_end", today)
      .order("apply_end", { ascending: true })
      .limit(5);
    const programs = (data || []).map(loanToDisplay);
    log(programs.length);
    if (programs.length === 0) {
      return simpleTextResponse(
        "사장님 대상 정책을 찾지 못했어요.\n잠시 후 다시 확인해주세요.",
      );
    }
    return listCardResponse(
      "사장님 정책 (소상공인)",
      programs,
      `${BASE_URL}/loan?target=소상공인`,
    );
  }

  // ━━━ Fallback — 1분 진단 유도 (결정3=B) ━━━
  // 키워드 매칭 실패 → 사용자 발화로 정확한 추천 어려움 안내 + quiz 링크.
  // utterance echo 시 URL 패턴은 제거해 phishing 위험 최소화.
  log(0);
  const safeUtterance = utterance.replace(/https?:\/\/\S+/gi, "").slice(0, 30).trim();
  return simpleTextResponse(
    `'${safeUtterance || "해당"}' 관련 정책을\n바로 찾기는 어려워요.\n\nkeepioo 1분 진단으로\n맞춤 정책을 받아보시겠어요?\n\n👉 ${BASE_URL}/quiz\n\n또는 아래 빠른 답변을 눌러보세요.`,
  );
}

// GET — 카카오 i 오픈빌더 스킬 등록 시 헬스체크용
export async function GET() {
  return NextResponse.json({
    status: "ok",
    service: "keepioo kakao chatbot skill",
    version: "1.0.0",
  });
}
