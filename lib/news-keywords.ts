// ============================================================
// 정책 주요 키워드 사전 — keepioo 도메인 (복지·지원·정책) 실용 토픽
// ============================================================
// korea.kr 메인의 "키워드로 찾아보는 정책뉴스" 처럼 뉴스를 주요 토픽별로
// 묶어 보여주기 위한 표준 태그 목록.
//
// 설계 원칙:
//   - benefit_tags (주거·의료·양육·교육·금융 등 12종 혜택 카테고리) 와 별개
//     → 더 구체적인 정책 토픽 (청년·소상공인·추경·AI·에너지 등)
//   - 정규식 alias 로 표기 변형 흡수 ("청년" · "청년층" · "만 19~39세")
//   - 제목·본문(summary·body) 전체에서 매칭. 중복 제거.
//   - Phase 2 에서 `/news/keyword/[keyword]` URL 로 노출 → SEO long-tail
// ============================================================

// 설계 원칙 (2026-04-24 사용자 결정):
//   - keepioo = 공고·알림 서비스. 뉴스는 공고 전환으로 이어져야 함.
//   - 타겟층 + 혜택 유형 중심. 시사 뉴스성 키워드 (AI·에너지·기후·재난 등) 제외.
//   - 민생·일자리·추경·창업·대출 등은 공고와 직접 연결되므로 유지.
//
// 키워드: [표준 라벨, 매칭 정규식]
// 표준 라벨이 URL · UI · SEO 의 canonical 이름.
const KEYWORD_PATTERNS: Array<{ label: string; re: RegExp }> = [
  // ━━━ 대상층 (9) — keepioo 사용자 프로필과 1:1 매칭 ━━━
  { label: "청년", re: /청년/ },
  { label: "소상공인", re: /소상공인/ },
  { label: "자영업자", re: /자영업/ },
  { label: "노인", re: /노인|어르신|고령|65세 이상/ },
  { label: "장애인", re: /장애인/ },
  { label: "다문화", re: /다문화|결혼이민/ },
  { label: "한부모", re: /한부모|미혼모|미혼부/ },
  { label: "신혼부부", re: /신혼부부|신혼/ },
  { label: "농어민", re: /농민|어민|농업인|어업인|농어민/ },

  // ━━━ 혜택 유형 (9) — 공고 검색어와 직결 ━━━
  { label: "지원금", re: /지원금|수당|보조금|현금지원/ },
  { label: "연금", re: /연금(?!대출)/ },
  { label: "기초생활", re: /기초생활|기초수급|차상위/ },
  { label: "장학금", re: /장학금|학자금/ },
  { label: "출산", re: /출산|임신|임산부/ },
  { label: "육아", re: /육아|양육|보육|어린이집/ },
  { label: "월세", re: /월세/ },
  { label: "전세", re: /전세/ },
  { label: "의료비", re: /의료비|진료비|치료비/ },

  // ━━━ 금융·경제 (6) — 대출·지원 공고 트리거 ━━━
  { label: "추경", re: /추경|추가경정/ },
  { label: "대출", re: /대출/ },
  { label: "금리", re: /금리(?!별)/ },
  { label: "세금", re: /세금|세제|감세|세액공제/ },
  { label: "부동산", re: /부동산|주택시장/ },
  { label: "창업", re: /창업|스타트업|벤처/ },

  // ━━━ 공고 트리거 시사 (2) — 민생·일자리만 유지 ━━━
  { label: "민생", re: /민생회복|민생안정|소비쿠폰/ },
  { label: "일자리", re: /일자리|고용(?!노동부)|채용|취업/ },
];

// 제목 + 본문에서 키워드 추출. 중복 제거 + 표준 라벨.
export function extractNewsKeywords(texts: Array<string | null | undefined>): string[] {
  const blob = texts.filter(Boolean).join(" ");
  if (!blob) return [];
  const found = new Set<string>();
  for (const { label, re } of KEYWORD_PATTERNS) {
    if (re.test(blob)) found.add(label);
  }
  return Array.from(found);
}

// 전체 키워드 목록 (Phase 2 UI 에서 키워드 네비게이션 메뉴용)
export function getAllKeywords(): string[] {
  return KEYWORD_PATTERNS.map((k) => k.label);
}
