// ============================================================
// 홈 JSON-LD — BreadcrumbList + FAQPage (검색 리치 카드)
// ============================================================
// SERP 리치 카드 표시 시그널:
//   - BreadcrumbList: 사이트 구조 안내 (홈)
//   - FAQPage: /help 의 핵심 5 질문을 홈 자체에 노출 → 검색 결과
//     "사이트에서 묻는 질문" 펼침 카드 가능 (Google rich result)
//
// 답변은 마케팅 카피 톤 유지하되 사실 위주. /help 와 충돌 없는 5개 핵심.
// 길이는 50~150자 권장 (Google FAQ 카드 내 표시 한도 약 200자).
// ============================================================

import { safeJsonLd } from "@/lib/json-ld-safe";

const BASE_URL = "https://www.keepioo.com";

const FAQS = [
  {
    q: "정책알리미 이용료가 있나요?",
    a: "주요 정책 가이드와 공공 지원제도 큐레이션은 무료로 볼 수 있습니다. keepioo는 신청 판단에 필요한 자격·서류·마감 정보를 정리합니다.",
  },
  {
    q: "어떤 정책이 매칭되나요?",
    a: "청년·소상공인·부모·신혼부부·저소득·1인가구 등 상황별로 확인할 정책을 정리합니다. 세부 자격은 각 공식 신청처에서 최종 확인해야 합니다.",
  },
  {
    q: "마감 알림은 어떻게 받나요?",
    a: "관심 조건을 등록하면 마감 전에 살펴볼 공고를 이메일로 안내받을 수 있습니다. 알림은 공식 공고 확인을 돕는 보조 수단입니다.",
  },
  {
    q: "어떤 데이터를 사용하나요?",
    a: "복지로(보건복지부)·소상공인24·기업마당·온통청년·금융위원회 공공데이터를 매일 수집합니다. 모든 정책에 원문 출처와 신청 링크가 표시됩니다.",
  },
  {
    q: "내 개인정보는 안전한가요?",
    a: "최소한의 정보(이메일·관심 분야)만 저장하며, 어떤 정보도 외부에 판매·공유하지 않습니다. 언제든 마이페이지에서 탈퇴(30일 유예)와 모든 데이터 삭제가 가능합니다.",
  },
  {
    q: "맞춤 매칭은 어떻게 작동하나요?",
    a: "지역·나이대·직업·소득·가구 상태 등 조건을 기준으로 관련 정책을 추려 보여줍니다. 결과는 신청 전 검토용이며 최종 자격 판단은 공고 원문을 기준으로 합니다.",
  },
  {
    q: "운영자는 누구인가요?",
    a: "전남 순천에서 1인 운영하는 키피오가 만든 서비스입니다. 자영업자 본인이 정부 정책 찾기 어려움을 겪으면서 만들었고, 사업자등록·통신판매번호·개인정보보호책임자 모두 등록된 정식 서비스입니다. 운영자 정보는 about 페이지에서 확인하실 수 있습니다.",
  },
];

export function HomeJsonLd() {
  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "홈",
        item: BASE_URL,
      },
    ],
  };

  const faq = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQS.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: {
        "@type": "Answer",
        text: f.a,
      },
    })),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(breadcrumb) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(faq) }}
      />
    </>
  );
}
