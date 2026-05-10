// ============================================================
// /c/[category] hub 페이지 4종의 카탈로그 + 매칭 로직
// ============================================================
// 사용자 그룹 wedge: 청년·노년·자영업·주거.
//
// 매칭 전략 (PostgREST 광범위 노출용 overlaps 권장):
//   - benefitTags  → welfare/loan 의 benefit_tags 컬럼 (string[]) 과 overlaps
//   - ageTags      → welfare/loan 의 age_tags 컬럼 (string[]) 과 overlaps
//   - occupationTags → welfare/loan 의 occupation_tags 컬럼 (string[]) 과 overlaps
//
//   세 축 중 하나라도 겹치면 노출 (관대한 매칭 — hub 의 의도는 광범위 노출).
//   값은 모두 lib/tags/taxonomy.ts 의 BENEFIT_TAGS · AGE_TAGS ·
//   OCCUPATION_TAGS 한국어 표준에 맞춤 (분류 통일 2026-04-25).
//
// label/shortLabel/hero/description 은 SEO·UI 용 한국어 (검색 키워드 포함).
// blogCategory 는 /blog/category/[category] 라우트의 한글 slug 와 일치.
// ============================================================

export type CategorySlug = "youth" | "senior" | "business" | "housing";

export interface FaqItem {
  q: string;
  a: string;
}

export interface CategoryHub {
  slug: CategorySlug;
  emoji: string;
  /** 헤더·OG 용 풀 라벨 — "청년 정책" */
  label: string;
  /** 짧은 라벨 — 칩·다른 hub 회유 링크용 */
  shortLabel: string;
  /** hero 영역 1~2 문장 설명 */
  hero: string;
  /** SEO meta description (160자 이내 권장) */
  description: string;
  /** welfare/loan benefit_tags 매칭값 (BENEFIT_TAGS 한국어 표준) */
  benefitTags: string[];
  /** welfare/loan age_tags 매칭값 (AGE_TAGS 한국어 표준). 없으면 빈 배열. */
  ageTags: string[];
  /** welfare/loan occupation_tags 매칭값 (OCCUPATION_TAGS 한국어 표준). 없으면 빈 배열. */
  occupationTags: string[];
  /** /blog/category/[category] 한글 slug (blog_posts.category) */
  blogCategory?: string;
  /** 자주 묻는 질문 4-5건. FAQPage JSON-LD + UI 노출.
   *  콘텐츠 깊이 (AdSense 검수 + SEO rich card) 신호. */
  faq?: FaqItem[];
  /** 운영자 큐레이션 노트 5~6줄. AdSense "재게시 X, 운영자 직접 정리" 시그널.
   *  Hero 다음에 파란 박스 노출 (welfare 상세 unique_insight 와 같은 디자인). */
  curatorNote?: string;
}

export const CATEGORY_HUBS: Record<CategorySlug, CategoryHub> = {
  youth: {
    slug: "youth",
    emoji: "🌱",
    label: "청년 정책",
    shortLabel: "청년",
    hero:
      "19~34세 청년을 위한 정부·지자체 지원을 한곳에. 청년수당·청년주거·청년창업·자격증 비용까지.",
    description:
      "청년 정책 종합 가이드. 청년수당·취업·주거·창업·교육비 지원 한곳에 정리.",
    benefitTags: ["교육", "취업", "창업", "주거"],
    ageTags: ["청년"],
    occupationTags: [],
    blogCategory: "청년",
    curatorNote:
      "청년 정책은 매년 30개 가까이 새로 나오지만 정작 본인이 받을 수 있는 게 뭔지 모르고 지나치는 경우가 많습니다. keepioo 를 운영하면서 청년수당·청년 월세 지원·청년 창업자금 세 종류만 알아도 월 50만 원 이상은 받을 수 있는 청년 분들이 의외로 많다는 걸 자주 봅니다. 자격이 까다로워 보여도 신청은 무료이니, 일단 1분 자격 진단부터 해보시고 마감 임박 정책은 따로 챙겨두세요.",
    faq: [
      {
        q: "청년 정책은 보통 몇 살까지 받을 수 있나요?",
        a: "정책에 따라 달라지지만 대부분 만 19세부터 만 34세까지를 대상으로 합니다. 일부 지자체 사업은 만 39세까지 확대 운영하기도 하니 정책마다 자격 요건을 꼭 확인하세요.",
      },
      {
        q: "청년수당과 청년 월세 지원을 동시에 받을 수 있나요?",
        a: "지원 부처와 사업이 다르면 동시 수령 가능합니다. 다만 같은 지자체의 동일 항목 중복 지급은 제한되는 경우가 많아 신청 전 각 정책의 중복 수령 가능 여부를 확인해야 합니다.",
      },
      {
        q: "청년 창업 지원금은 어떻게 신청하나요?",
        a: "K-스타트업·중소벤처기업부·지자체 창업지원 페이지에서 사업계획서를 제출합니다. 자격은 보통 만 39세 이하 예비창업자나 3년 이내 초기창업자입니다. 수상 시 사업자금·멘토링·교육이 함께 제공됩니다.",
      },
      {
        q: "청년 주거 지원은 어떤 종류가 있나요?",
        a: "월세 지원 (만 19~34세 무주택 청년 월 최대 20만원 1년), 청년 매입임대·전세임대 (LH 임대주택), 행복주택·신혼희망타운 등이 있습니다. 본인 소득과 자산 기준을 함께 확인하세요.",
      },
    ],
  },
  senior: {
    slug: "senior",
    emoji: "🌷",
    label: "노년·어르신 정책",
    shortLabel: "노년",
    hero:
      "65세 이상 어르신을 위한 연금·의료·돌봄·여가 정책 종합 가이드.",
    description:
      "노인 복지 종합 가이드. 기초연금·노인장기요양·의료비·여가·돌봄 한곳에.",
    benefitTags: ["의료", "생계", "문화"],
    ageTags: ["노년"],
    occupationTags: [],
    blogCategory: "노년",
    curatorNote:
      "65세 이상 어르신 정책은 기초연금·노인장기요양·치매치료비 같은 큰 항목 외에도 잘 알려지지 않은 작은 지원이 많습니다. 보청기 지원·임플란트 건강보험 적용·노인 인공관절 수술비 같은 건 부모님 세대가 모르고 자비로 해결하시는 경우가 흔합니다. 자녀 분이 keepioo 에서 한 번 정리해 부모님께 알려드리면 큰 도움이 됩니다. 신청 대부분이 거주지 주민센터 방문이라 어렵지 않으니 마감 전에 챙겨두세요.",
    faq: [
      {
        q: "기초연금은 누가 받을 수 있나요?",
        a: "만 65세 이상 + 한국 국적 + 국내 거주 + 소득인정액이 보건복지부가 정한 선정기준액 이하인 분이 받을 수 있습니다. 단독가구·부부가구별 기준이 다르며 매년 갱신됩니다. 신청은 거주지 행정복지센터 또는 복지로에서 가능합니다.",
      },
      {
        q: "노인장기요양보험은 어떻게 신청하나요?",
        a: "65세 이상 또는 65세 미만 노인성 질환자가 신청 가능합니다. 국민건강보험공단에 인정 신청 → 방문조사 → 등급 판정 (1~5등급) 후 재가·시설 급여를 이용할 수 있습니다. 신청은 공단 지사 또는 노인장기요양보험 홈페이지에서.",
      },
      {
        q: "노인 의료비 본인부담 경감은 어떤 게 있나요?",
        a: "65세 이상 외래·입원 본인부담 경감 (의원 1,500원 정액 등), 노인 임플란트·틀니 건강보험 적용, 보청기 지원 (등록 청각장애인), 노인 무릎 인공관절 수술 지원 등이 있습니다. 의료급여 수급권자는 추가 감면 가능합니다.",
      },
      {
        q: "노인 일자리는 어떻게 신청하나요?",
        a: "한국노인인력개발원의 노인일자리·사회활동 지원 사업이 대표적입니다. 공익활동·시장형·재능나눔 등 유형별로 60~65세 이상 신청 가능. 거주지 시군구 또는 노인복지관·시니어클럽에 직접 문의하면 빠릅니다.",
      },
    ],
  },
  business: {
    slug: "business",
    emoji: "🏪",
    label: "자영업·소상공인",
    shortLabel: "자영업",
    hero:
      "소상공인·자영업자를 위한 정책자금·세제·홍보·교육 지원 모음.",
    description:
      "자영업·소상공인 종합 가이드. 정책자금·창업·세제·교육·재기 지원 한곳에.",
    benefitTags: ["창업", "금융", "취업"],
    ageTags: [],
    occupationTags: ["소상공인", "자영업자", "창업자"],
    blogCategory: "소상공인",
    curatorNote:
      "자영업·소상공인 정책은 '정책자금 (대출)' 만 떠올리기 쉽지만, 사실 폐업 컨설팅·재기지원·디지털 전환 바우처 같은 비용 절감형 지원이 더 큰 도움이 되는 경우도 많습니다. 매출이 떨어진 시기에 신청 가능한 경영안정자금은 1~3% 저금리라 시중 대출에서 갈아타는 것만으로도 월 부담을 크게 줄일 수 있습니다. keepioo 에서는 자격 조건을 한눈에 보기 쉽게 정리해두었으니 본인 업종에 맞는 카테고리부터 살펴보세요.",
    faq: [
      {
        q: "소상공인 정책자금은 어떤 종류가 있나요?",
        a: "소상공인시장진흥공단의 일반자금 (운영자금·시설자금)·청년 창업자금·재기자금·재해 피해 회복 자금이 대표적입니다. 직원 수 5~10인 이하·매출 일정 기준 이하 사업자가 대상이며, 지원금리는 1~3%대로 시중 대출보다 낮습니다.",
      },
      {
        q: "자영업자 신용대출 자격 조건은?",
        a: "사업자 등록 후 일정 기간 (보통 6개월~1년) 정상 영업 + 신용등급 일정 이상이 필요합니다. 정책자금은 사업자 신용도뿐 아니라 매출 안정성·업종·소상공인 여부를 종합 평가합니다. 보증서 (지역신용보증재단) 발급 후 시중은행 대출 가능합니다.",
      },
      {
        q: "폐업·재기 지원은 어떤 게 있나요?",
        a: "소상공인 희망리턴패키지 (폐업 컨설팅 + 사업정리비 + 전직 장려금), 재기지원 자금 (재창업 시 정책자금), 재도전 성공 패키지 (창업 실패 후 재기) 등이 있습니다. 폐업 신고 후 일정 기간 안에 신청해야 하니 시점 확인이 중요합니다.",
      },
      {
        q: "소상공인과 중소기업 지원은 어떻게 다른가요?",
        a: "소상공인은 도소매업 5인 미만·제조업 10인 미만 (매출 기준 별도). 그 이상은 중소기업으로 분류되며 지원 부처와 사업이 다릅니다. 같은 사업자도 매출·직원 변동에 따라 분류가 바뀌므로 지원 사업 신청 전 확인이 필요합니다.",
      },
    ],
  },
  housing: {
    slug: "housing",
    emoji: "🏠",
    label: "주거·전월세 지원",
    shortLabel: "주거",
    hero:
      "전월세 보증금·임대주택·주거급여·청년주거 지원 종합 가이드.",
    description:
      "주거 지원 종합 가이드. 전월세 보증금·임대주택·주거급여·청년주거 한곳에.",
    benefitTags: ["주거"],
    ageTags: [],
    occupationTags: [],
    blogCategory: "주거",
    curatorNote:
      "주거 지원은 청년 월세 지원·주거급여·LH 임대주택·HF 보증 네 갈래로 나뉘는데, 본인 상황에 맞는 게 무엇인지 헷갈려서 신청을 미루는 분이 많습니다. 일반적으로 보증금 부담이 적은 1인 가구는 청년 월세 지원부터 시작하고, 가족 구성원이 늘어나면 매입임대·전세임대로 단계 이동하는 흐름이 자연스럽습니다. 모집 공고가 매년 정해진 시기에만 열리니 keepioo 알림으로 마감 임박 정책을 미리 챙겨두세요.",
    faq: [
      {
        q: "주거급여는 누가 받을 수 있나요?",
        a: "기준 중위소득 48% 이하 가구가 신청 대상입니다 (2026년 기준). 임차가구는 월세 임차료 일부, 자가가구는 주택 노후도 따라 수선비를 지원받습니다. 신청은 거주지 행정복지센터 또는 복지로에서, 소득·재산 조사 후 결정됩니다.",
      },
      {
        q: "청년 월세 지원과 전세 보증금 대출은 어떻게 다른가요?",
        a: "월세 지원 (만 19~34세 무주택 청년 월 최대 20만원 1년) 은 보증금 없이 받는 현금 지원입니다. 전세 보증금 대출 (LH 청년전세·중기청 100% 등) 은 저금리로 보증금을 빌려주는 대출 상품으로, 월세 지원과 동시 활용 가능 (단 같은 주택 동시 X).",
      },
      {
        q: "매입임대주택과 전세임대주택의 차이는?",
        a: "매입임대는 LH·SH 가 직접 매입한 주택을 시세 30~50%로 임대합니다. 전세임대는 신청자가 원하는 집을 골라 LH 가 집주인과 전세 계약을 대신 체결하고 본인이 매월 임대료를 납부합니다. 보증금 부담은 전세임대가 더 낮습니다.",
      },
      {
        q: "행복주택과 신혼희망타운의 차이는?",
        a: "행복주택은 청년·신혼부부·고령자 대상 임대주택 (시세 60~80%, 6~20년 거주). 신혼희망타운은 신혼부부·예비부부 대상 분양·임대 단지로 분양가가 시세보다 낮고 분양형은 매각 차익 일부 환수 조건이 있습니다.",
      },
    ],
  },
};

export const CATEGORY_SLUGS = Object.keys(CATEGORY_HUBS) as CategorySlug[];

/** 알려진 slug 면 hub, 아니면 null (404 라우팅용). */
export function getCategoryHub(slug: string): CategoryHub | null {
  return (CATEGORY_HUBS as Record<string, CategoryHub>)[slug] ?? null;
}

// ============================================================
// PostgREST or-clause 빌더 — 세 축 (benefit/age/occupation) 합집합
// ============================================================
// hub 의 정의된 축들에 대해 `column.ov.{값1,값2,...}` 조건을 콤마로 합쳐
// 한 번의 .or() 호출로 던지기 위한 string. 빈 배열 축은 조건에서 제외해
// over-recall (모든 row 매칭) 방지.
//
// 모든 축이 빈 배열이면 null 반환 → 호출부가 .or() 자체를 skip 해야
// PostgREST 신택스 에러 회피.
// ============================================================
export function buildHubOrClause(hub: CategoryHub): string | null {
  const conds: string[] = [];
  if (hub.benefitTags.length > 0) {
    conds.push(`benefit_tags.ov.{${hub.benefitTags.join(",")}}`);
  }
  if (hub.ageTags.length > 0) {
    conds.push(`age_tags.ov.{${hub.ageTags.join(",")}}`);
  }
  if (hub.occupationTags.length > 0) {
    conds.push(`occupation_tags.ov.{${hub.occupationTags.join(",")}}`);
  }
  return conds.length > 0 ? conds.join(",") : null;
}
