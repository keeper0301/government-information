// ============================================================
// 뉴스 ↔ 공고 관련성 매칭 — keepioo 만의 USP
// ============================================================
// 뉴스 상세 페이지에서 "이 뉴스와 관련된 공고 3~5건" 자동 표시.
// ia.finez.co.kr 같은 복지 뉴스 사이트는 없는 기능. keepioo 의 차별점.
//
// 매칭 전략:
//   1) 뉴스의 keywords (청년·소상공인·지원금 등 24개 사전) 와
//      welfare/loan 프로그램의 target·description·title 키워드 매칭
//   2) 뉴스의 benefit_tags 와 welfare/loan 의 benefit_tags 교집합
//   3) 최신순 + D-day 미지남 우선
//
// 데이터 상황:
//   - 뉴스 keywords 는 정교함 (news-keywords.ts 24개 토픽)
//   - welfare/loan 의 benefit_tags 도 채워져 있음 (taxonomy.ts 12종)
//   - 둘이 맞지 않는 축이라 2번 (benefit_tags 교집합) 은 약함.
//   - 1번 (키워드 → target/description ILIKE) 이 더 정확.
// ============================================================

import { createClient } from "@/lib/supabase/server";
import type { DisplayProgram } from "@/lib/programs";
import { welfareToDisplay, loanToDisplay } from "@/lib/programs";
import {
  WELFARE_EXCLUDED_FILTER,
  LOAN_EXCLUDED_FILTER,
} from "@/lib/listing-sources";

// 뉴스 keywords → 공고 target·description 검색 키워드 매핑
// 뉴스 키워드가 공고 DB 에서 어떤 표현으로 나타나는지 정리
const KEYWORD_TO_SEARCH: Record<string, string[]> = {
  청년: ["청년"],
  소상공인: ["소상공인"],
  자영업자: ["자영업"],
  노인: ["노인", "어르신", "고령"],
  장애인: ["장애인"],
  다문화: ["다문화", "결혼이민"],
  한부모: ["한부모"],
  신혼부부: ["신혼부부", "신혼"],
  농어민: ["농민", "어민", "농업인", "어업인"],
  지원금: ["지원금", "수당"],
  연금: ["연금"],
  기초생활: ["기초생활", "기초수급", "차상위"],
  장학금: ["장학금", "학자금"],
  출산: ["출산", "임신"],
  육아: ["육아", "양육", "보육"],
  월세: ["월세"],
  전세: ["전세"],
  의료비: ["의료비", "진료비"],
  대출: ["대출"],
  금리: ["금리"],
  세금: ["세금", "세액공제"],
  부동산: ["주택"],
  창업: ["창업", "스타트업"],
  일자리: ["일자리", "고용", "취업"],
  // 민생·추경 같은 macro 키워드는 특정 공고와 매칭 어려워서 제외

  // 2026-04-25 추가: emergency·임시 정책 공고 매칭
  // 공고 DB target/title 에 자주 나오는 표현으로 확장.
  고유가: ["유가", "유류", "주유"],
  에너지: ["에너지", "전기", "가스", "난방", "연료"],
  긴급지원: ["긴급", "재난", "위기", "특별"],
};

// 뉴스 keywords 를 공고 검색용 ILIKE 토큰으로 변환
function expandKeywords(newsKeywords: string[]): string[] {
  const out = new Set<string>();
  for (const k of newsKeywords) {
    const expanded = KEYWORD_TO_SEARCH[k];
    if (expanded) expanded.forEach((e) => out.add(e));
  }
  return Array.from(out);
}

// 관련 공고 검색 — 뉴스의 keywords 로 welfare/loan 에서 매칭
// SQL injection 방지: Supabase client 의 ilike/or 가 파라미터 바인딩 처리.
// 단, .or() 체인에는 user input 문자열이 들어가므로 %·,·: 같은 특수문자 sanitize.
export async function findRelatedPrograms(params: {
  keywords: string[];
  benefitTags?: string[];
  limit?: number;
}): Promise<DisplayProgram[]> {
  const { keywords, limit = 4 } = params;
  const searchTerms = expandKeywords(keywords);
  if (searchTerms.length === 0) return [];

  // ILIKE 에서 위험한 문자 (%·_·\·,·()) 제거 — 외부 입력 안전화
  const sanitized = searchTerms
    .map((t) => t.replace(/[%_\\,()]/g, ""))
    .filter((t) => t.length > 0 && t.length <= 20);
  if (sanitized.length === 0) return [];

  const supabase = await createClient();

  // target + description + title 각각에 OR ilike
  // or() 구문: "field.op.value,field.op.value"
  const orClauses = sanitized
    .flatMap((t) => [`target.ilike.%${t}%`, `title.ilike.%${t}%`])
    .join(",");

  // 마감 지난 공고 제외 (apply_end null 이면 상시로 간주하고 포함)
  const today = new Date().toISOString().split("T")[0];

  const [w, l] = await Promise.all([
    supabase
      .from("welfare_programs")
      .select("*")
      .not("source_code", "in", WELFARE_EXCLUDED_FILTER)
      .or(orClauses)
      .or(`apply_end.is.null,apply_end.gte.${today}`)
      .order("created_at", { ascending: false })
      .limit(limit),
    supabase
      .from("loan_programs")
      .select("*")
      .not("source_code", "in", LOAN_EXCLUDED_FILTER)
      .or(orClauses)
      .or(`apply_end.is.null,apply_end.gte.${today}`)
      .order("created_at", { ascending: false })
      .limit(limit),
  ]);

  const welfareItems = (w.data || []).map(welfareToDisplay);
  const loanItems = (l.data || []).map(loanToDisplay);

  // welfare 와 loan 을 번갈아 섞어 다양성 확보 후 limit 만큼 반환
  const mixed: DisplayProgram[] = [];
  const maxLen = Math.max(welfareItems.length, loanItems.length);
  for (let i = 0; i < maxLen; i++) {
    if (welfareItems[i]) mixed.push(welfareItems[i]);
    if (loanItems[i]) mixed.push(loanItems[i]);
  }
  return mixed.slice(0, limit);
}
