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
};

export function OrganizationSchema({ name, url, description }: OrganizationSchemaProps) {
  const schema = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name,
    url,
    description,
    logo: `${url}/icon.png`,
    sameAs: [],
  };
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
