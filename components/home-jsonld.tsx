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
    a: "100% 무료로 사용할 수 있습니다. 광고 수익으로 운영되며, 정부·지자체 정책 정보 큐레이션·맞춤 매칭·알림까지 모두 무료입니다.",
  },
  {
    q: "어떤 정책이 매칭되나요?",
    a: "복지 10,000건·정책 자금 1,300건이 매일 갱신됩니다. 청년·소상공인·부모·신혼부부·저소득·1인가구 등 사용자가 등록한 조건에 맞는 정책만 자동 필터링해 보여드립니다.",
  },
  {
    q: "마감 알림은 어떻게 받나요?",
    a: "회원가입 후 관심 정책을 등록하면 신청 마감 7일 전 이메일로 자동 발송됩니다. 카카오톡 알림은 심사 통과 후 추가됩니다.",
  },
  {
    q: "어떤 데이터를 사용하나요?",
    a: "복지로(보건복지부)·소상공인24·기업마당·온통청년·금융위원회 공공데이터를 매일 수집합니다. 모든 정책에 원문 출처와 신청 링크가 표시됩니다.",
  },
  {
    q: "내 개인정보는 안전한가요?",
    a: "최소한의 정보(이메일·관심 분야)만 저장하며, 어떤 정보도 외부에 판매·공유하지 않습니다. 언제든 마이페이지에서 탈퇴(30일 유예)와 모든 데이터 삭제가 가능합니다.",
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
