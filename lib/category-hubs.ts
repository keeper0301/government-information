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
      "청년의 취업·주거·창업·교육 지원을 찾기 전 확인할 질문과 관련 가이드입니다. 연령 기준은 사업마다 다릅니다.",
    description:
      "청년 정책 종합 가이드. 청년수당·취업·주거·창업·교육비 지원 한곳에 정리.",
    benefitTags: ["교육", "취업", "창업", "주거"],
    ageTags: ["청년"],
    occupationTags: [],
    blogCategory: "청년",
    curatorNote:
      "청년이라는 분류만으로 지원 대상이 되는 것은 아닙니다. 공고에서 연령 산정일, 거주지, 취업·재학 상태와 가구 기준을 찾아 본인 상황과 대조하세요. 아래 가이드는 신청 전 준비 질문을 설명하며, 현재 접수 상태나 받을 금액을 보장하지 않습니다.",
    faq: [
      {
        q: "청년 정책은 보통 몇 살까지 받을 수 있나요?",
        a: "사업마다 연령 범위와 나이를 계산하는 기준일이 다릅니다. 공고에 적힌 생년월일 범위와 신청일·공고일 중 어떤 날을 기준으로 보는지 확인하세요. 이 허브에서 모든 사업의 공통 연령을 정하지 않습니다.",
      },
      {
        q: "청년수당과 청년 월세 지원을 동시에 받을 수 있나요?",
        a: "부처나 사업명이 다르다는 이유만으로 동시 수령이 가능한 것은 아닙니다. 두 공고의 기수혜자 제외, 유사 사업, 동일 비용 지원 제한을 각각 확인하고 기존 지원의 사업명과 지급 기간을 담당 기관에 알려 문의하세요.",
      },
      {
        q: "청년 창업 지원금은 어떻게 신청하나요?",
        a: "먼저 신청하려는 사업의 기관·지역·회차를 정하세요. 해당 공고에서 예비창업자와 기존 사업자 중 누구를 받는지, 업력 산정일, 제출 자료와 지원 방식을 확인한 뒤 공고에 적힌 신청처를 이용하세요.",
      },
      {
        q: "청년 주거 지원은 어떤 종류가 있나요?",
        a: "월세 지원, 임대주택, 보증금 대출을 구분해서 찾아보세요. 아래 청년 월세 가이드는 전국 2026년 신규 모집의 공식 조건을 설명하며 해당 접수는 마감됐습니다. 다음 회차와 지자체 자체 사업은 별도 공고를 확인하세요.",
      },
    ],
  },
  senior: {
    slug: "senior",
    emoji: "🌷",
    label: "노년·어르신 정책",
    shortLabel: "노년",
    hero:
      "어르신의 연금·의료·돌봄·일자리 지원을 찾기 전 확인할 질문을 모았습니다. 사업별 연령과 자격은 공식 안내를 확인하세요.",
    description:
      "노인 복지 종합 가이드. 기초연금·노인장기요양·의료비·여가·돌봄 한곳에.",
    benefitTags: ["의료", "생계", "문화"],
    ageTags: ["노년"],
    occupationTags: [],
    blogCategory: "노년",
    curatorNote:
      "연금, 돌봄, 의료비 지원은 신청처와 판단 기준이 같지 않습니다. 본인 또는 가족이 필요한 도움을 먼저 적고, 사업별 공식 안내에서 신청처와 대리 신청 요건을 확인하세요. 아래 설명은 상담을 준비하는 질문이며 급여 자격이나 치료비 지원을 확정하는 안내가 아닙니다.",
    faq: [
      {
        q: "기초연금은 누가 받을 수 있나요?",
        a: "공식 기초연금 안내에서 연령·국적·거주 기준, 가구 구분, 해당 연도 소득인정액 기준과 제외 조항을 확인하세요. 소득인정액을 통장 잔액이나 월급만으로 판단하지 말고 공식 상담 창구에 필요한 자료를 문의하세요.",
      },
      {
        q: "노인장기요양보험은 어떻게 신청하나요?",
        a: "국민건강보험공단의 공식 장기요양 안내에서 인정 신청 대상, 신청 방식, 조사·판정 절차와 필요한 자료를 확인하세요. 연령이나 진단명만으로 급여 이용 가능 여부를 단정하지 마세요.",
      },
      {
        q: "노인 의료비 본인부담 경감은 어떤 게 있나요?",
        a: "진료 항목과 건강보험·의료급여 적용 여부를 나눠 확인하세요. 치료 전에 신청해야 하는 지원인지, 이미 낸 비용도 인정하는지, 비급여가 포함되는지를 공식 안내와 의료기관 상담 창구에 문의하세요. 이 허브에서는 비용이나 감면액을 확정하지 않습니다.",
      },
      {
        q: "노인 일자리는 어떻게 신청하나요?",
        a: "참여하려는 일자리의 지역·유형·모집 회차를 정하고 해당 모집 공고에서 연령, 활동 조건, 접수처와 제외 대상을 확인하세요. 연금을 받고 있다면 그 사실을 상담 시 알리고 참여 제한 여부를 물어보세요.",
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
      "소상공인 지원은 대출, 보증, 비용 지원처럼 유형이 다릅니다. 이 허브는 사업자 준비 질문과 관련 가이드를 모은 곳입니다. 중앙 정책자금과 지자체 사업은 적용 지역·회차·예산이 다르며, 금리와 보증료·상환방식도 상품별로 확인해야 합니다. 낮은 표시 금리만으로 대환이 유리하다고 판단하지 마세요.",
    faq: [
      {
        q: "소상공인 정책자금은 어떤 종류가 있나요?",
        a: "소상공인시장진흥공단의 2026년 공식 개요는 직접대출과 대리대출을 나누고 자금별 요건·기간·한도·금리를 안내합니다. 공통 근로자 수 기준만으로 모든 자금에 신청할 수 있는 것은 아닙니다. 아래 소상공인 정책자금 가이드의 직접 출처에서 자금명과 세부 공지를 확인하세요.",
      },
      {
        q: "자영업자 신용대출 자격 조건은?",
        a: "금융기관·보증기관·자금 상품별로 심사 기준이 다릅니다. 업력, 업종, 영업 상태, 매출 자료, 기존 대출과 세금 체납 정보를 정리하고 해당 상품의 공지를 확인하세요. 보증 신청이나 확인서 발급을 대출 실행 확정으로 읽지 마세요.",
      },
      {
        q: "폐업·재기 지원은 어떤 게 있나요?",
        a: "사업 정리, 재취업, 재창업 지원은 신청 단계가 다를 수 있습니다. 폐업 신고나 비용 지출 전에 해당 공고에서 신청 시점, 인정 비용, 계약·영수증 요건과 중복 제한을 확인하세요. 사업명이 같아도 회차별 지원 내용이 동일하다고 가정하지 마세요.",
      },
      {
        q: "소상공인과 중소기업 지원은 어떻게 다른가요?",
        a: "소상공인에 해당하는지와 특정 지원사업에 신청할 수 있는지는 별도 판단입니다. 업종, 매출과 상시근로자 산정 기준을 해당 공고와 공식 확인 절차에서 확인하세요. 인원 기준을 넘었다고 모든 다른 중소기업 지원에 신청할 수 있는 것은 아닙니다.",
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
      "임차료 지원, 임대주택, 보증금 대출은 필요한 서류와 부담해야 할 비용이 다릅니다. 주소·계약 명의·가구 구성·기존 주거 지원을 메모한 뒤 해당 지역·회차의 공고를 비교하세요. 계약부터 하기보다는 지원 대상 주택과 대출 실행 조건을 먼저 확인하는 편이 안전합니다.",
    faq: [
      {
        q: "주거급여는 누가 받을 수 있나요?",
        a: "해당 연도의 공식 주거급여 안내에서 가구 범위와 소득인정액 기준을 확인하세요. 임차가구와 자가가구의 지원 방식도 구분해야 합니다. 이 허브의 준비 질문만으로 수급 자격이나 지원액을 확정할 수 없습니다.",
      },
      {
        q: "청년 월세 지원과 전세 보증금 대출은 어떻게 다른가요?",
        a: "월세 지원은 사업별 조건에 따라 임차료를 지원하고, 전세 보증금 대출은 상환해야 하는 대출입니다. 연령·금액·기간·중복 가능 여부는 사업·회차마다 다르므로 여기서 일괄 확정하지 않습니다. 계약 전 해당 공고와 금융기관의 실행 조건을 확인하세요.",
      },
      {
        q: "매입임대주택과 전세임대주택의 차이는?",
        a: "모집 공고에서 주택을 누가 정하는지, 계약 당사자가 누구인지, 본인 보증금과 임대료가 얼마인지 나눠 비교하세요. 유형 이름만으로 비용이 더 낮다고 판단하지 말고 지역·주택·공고별 실제 조건을 대조하세요.",
      },
      {
        q: "행복주택과 신혼희망타운의 차이는?",
        a: "임대인지 분양인지부터 구분하고 신청 대상, 계약기간, 보증금·임대료 또는 분양대금, 대출 조건을 해당 모집 공고에서 확인하세요. 거주 가능 기간이나 시세 대비 가격을 모든 단지에 공통으로 적용하지 마세요.",
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
