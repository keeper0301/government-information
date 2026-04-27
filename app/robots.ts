import type { MetadataRoute } from "next";

// robots.txt — 검색엔진 봇별 명시 Allow.
// 한국 검색 점유율 1위 네이버는 Yeti (모바일은 Yeti-Mobile) 사용.
// User-Agent 별 Allow 명시는 함정 회피 + 일부 봇이 wildcard `*` 외 명시 규칙
// 우선 적용하는 동작 회피용 안전망.
export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://keepioo.com";
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/auth/", "/login"],
      },
      // 한국 검색엔진 — 네이버 (Yeti) / 다음 (Daum) 명시 Allow
      { userAgent: "Yeti", allow: "/" },
      { userAgent: "Yeti-Mobile", allow: "/" },
      { userAgent: "NaverBot", allow: "/" },
      { userAgent: "Daum", allow: "/" },
      { userAgent: "Daumoa", allow: "/" },
      // AI Crawlers - explicitly allowed for GEO
      { userAgent: "GPTBot", allow: "/" },
      { userAgent: "ChatGPT-User", allow: "/" },
      { userAgent: "ClaudeBot", allow: "/" },
      { userAgent: "Claude-Web", allow: "/" },
      { userAgent: "PerplexityBot", allow: "/" },
      { userAgent: "Google-Extended", allow: "/" },
      { userAgent: "Bytespider", allow: "/" },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
