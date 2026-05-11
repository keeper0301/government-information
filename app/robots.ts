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
      // AdSense 봇 명시 Allow — AdSense 검수자가 봇으로 사이트 검증.
      // 2026-05-11 추가: AdSense 거절 대응 + 검수자 봇 차단 우려 차단.
      // Mediapartners-Google = AdSense 광고 게재 분석 봇
      // AdsBot-Google = 광고 품질 검수 봇 (PC)
      // AdsBot-Google-Mobile = 광고 품질 검수 봇 (모바일)
      { userAgent: "Mediapartners-Google", allow: "/" },
      { userAgent: "AdsBot-Google", allow: "/" },
      { userAgent: "AdsBot-Google-Mobile", allow: "/" },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
