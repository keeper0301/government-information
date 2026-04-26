type WebSiteSchemaProps = {
  name: string;
  url: string;
  description: string;
};

export function WebSiteSchema({ name, url, description }: WebSiteSchemaProps) {
  const schema = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name,
    url,
    description,
    inLanguage: "ko",
    potentialAction: {
      "@type": "SearchAction",
      target: `${url}/welfare?q={search_term_string}`,
      "query-input": "required name=search_term_string",
    },
  };
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}

type OrganizationSchemaProps = {
  name: string;
  url: string;
  description: string;
  // 신뢰도·E-E-A-T 시그널을 위한 선택 필드. 모두 옵셔널이라 기존 호출처 무영향.
  legalName?: string;          // 법인/사업자명 정식 표기
  ceoName?: string;            // 대표자명 (founder)
  taxId?: string;              // 사업자등록번호
  email?: string;              // 고객 문의 이메일
  foundingDate?: string;       // ISO 8601 (yyyy-mm-dd)
};

export function OrganizationSchema({
  name,
  url,
  description,
  legalName,
  ceoName,
  taxId,
  email,
  foundingDate,
}: OrganizationSchemaProps) {
  const schema: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name,
    url,
    description,
    logo: `${url}/icon.png`,
    inLanguage: "ko",
  };
  if (legalName) schema.legalName = legalName;
  if (ceoName) schema.founder = { "@type": "Person", name: ceoName };
  if (taxId) schema.taxID = taxId;
  if (email) {
    schema.contactPoint = {
      "@type": "ContactPoint",
      email,
      contactType: "customer support",
      availableLanguage: ["Korean"],
    };
  }
  if (foundingDate) schema.foundingDate = foundingDate;

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}

type FAQSchemaProps = {
  questions: { question: string; answer: string }[];
};

export function FAQSchema({ questions }: FAQSchemaProps) {
  const schema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: questions.map((q) => ({
      "@type": "Question",
      name: q.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: q.answer,
      },
    })),
  };
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}

type ArticleSchemaProps = {
  title: string;
  description: string;
  url: string;
  datePublished: string;
  dateModified?: string;
  tags?: string[];
};

export function ArticleSchema({ title, description, url, datePublished, dateModified, tags }: ArticleSchemaProps) {
  const schema = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: title,
    description,
    url,
    datePublished,
    dateModified: dateModified || datePublished,
    author: { "@type": "Organization", name: "정책알리미" },
    publisher: { "@type": "Organization", name: "정책알리미" },
    keywords: tags?.join(", "),
    inLanguage: "ko",
  };
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}

type GovernmentServiceSchemaProps = {
  name: string;
  description: string;
  url: string;
  provider: string;
  category: string;
};

// BreadcrumbList — Google 리치 결과의 빵부스러기 경로 표시 + AI 검색엔진이
// 페이지 위계를 이해. 모든 상세 페이지에 부착 권장.
type BreadcrumbItem = { name: string; url: string };

export function BreadcrumbSchema({ items }: { items: BreadcrumbItem[] }) {
  const schema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, idx) => ({
      "@type": "ListItem",
      position: idx + 1,
      name: it.name,
      item: it.url,
    })),
  };
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}

export function GovernmentServiceSchema({ name, description, url, provider, category }: GovernmentServiceSchemaProps) {
  const schema = {
    "@context": "https://schema.org",
    "@type": "GovernmentService",
    name,
    description,
    url,
    serviceType: category,
    provider: {
      "@type": "GovernmentOrganization",
      name: provider,
    },
    areaServed: {
      "@type": "Country",
      name: "대한민국",
    },
  };
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}
