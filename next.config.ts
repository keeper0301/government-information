import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  // OG 이미지 라우트가 process.cwd() 로 폰트를 읽어 — 자동 추적 누락 대비
  outputFileTracingIncludes: {
    "/blog/[slug]/opengraph-image": ["./assets/Pretendard-Bold.woff"],
  },
  // jsdom 은 Node 동적 require 를 다수 사용 — Turbopack 의 외부 모듈 hash
  // mangling 이 'jsdom-<hash>' 별칭으로 변환해 require stack 에서 못 찾는
  // 빌드 에러 발생 (admin/blog/[id], blog/[slug] 페이지 빌드 깨짐).
  // serverExternalPackages 로 명시하면 번들에 포함하지 않고 node_modules 의
  // jsdom 을 그대로 require → 정상 작동.
  // isomorphic-dompurify 는 내부에서 jsdom 을 사용 (lib/html-sanitize.ts).
  serverExternalPackages: ["jsdom", "isomorphic-dompurify"],

  // 보안 헤더 — 외부 LLM 평가에서 HSTS 만 있고 나머지 부재 지적.
  async headers() {
    // Content-Security-Policy — 외부 스크립트(AdSense·GA·Toss) 도메인 명시.
    // 가장 관대한 정책으로 enforce — 사이트 깨짐 위험 최소화.
    // unsafe-inline·unsafe-eval 허용: Next.js 의 inline script/style + _next/ chunks
    // 가 필요. 점진적으로 nonce 또는 hash 도입해 강화 가능.
    //
    // 외부 도메인 화이트리스트:
    //   - AdSense: pagead2.googlesyndication.com·googleads.g.doubleclick.net·googleadservices.com
    //   - GA4: googletagmanager.com·google-analytics.com
    //   - Toss: js.tosspayments.com·api.tosspayments.com
    //   - Supabase: *.supabase.co (DB·Auth·Storage·realtime)
    //   - Pretendard CDN: cdn.jsdelivr.net (globals.css 의 woff)
    //   - 이미지·뉴스 썸네일: data:·https:·blob: 모두 허용 (외부 출처 다양)
    //   - 폰트: data:·cdn.jsdelivr.net
    //
    // 깨짐 시 즉시 롤백 가능 — Vercel Deployments 에서 이전 commit Promote.
    const csp = [
      "default-src 'self'",
      // script: self + AdSense + GA + Toss + unsafe-inline·eval (Next.js)
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://pagead2.googlesyndication.com https://googleads.g.doubleclick.net https://*.googleadservices.com https://*.googletagmanager.com https://www.googletagmanager.com https://www.google-analytics.com https://*.google-analytics.com https://js.tosspayments.com",
      // style: self + 인라인 스타일 (Tailwind JIT, animation inline)
      "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
      // 이미지: 모든 https + data: + blob: (뉴스 썸네일 출처 다양)
      "img-src 'self' data: blob: https:",
      // 폰트: self + data + Pretendard CDN
      "font-src 'self' data: https://cdn.jsdelivr.net",
      // XHR/fetch: Supabase + GA + Toss + AdSense beacon
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://www.google-analytics.com https://*.google-analytics.com https://*.analytics.google.com https://stats.g.doubleclick.net https://api.tosspayments.com https://pagead2.googlesyndication.com https://*.googlesyndication.com",
      // iframe: Toss 결제 + AdSense (광고는 iframe 으로 렌더)
      "frame-src 'self' https://*.tosspayments.com https://googleads.g.doubleclick.net https://*.googlesyndication.com",
      // 임베드 차단 — clickjacking 방어 (X-Frame-Options 와 중복이지만 모던 브라우저는 frame-ancestors 우선)
      "frame-ancestors 'none'",
      // 플러그인·base href·form action 잠금
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; ");

    return [
      {
        source: "/:path*",
        headers: [
          // 클릭재킹 차단 — 다른 사이트 iframe 안에 keepioo 임베드 금지
          { key: "X-Frame-Options", value: "DENY" },
          // MIME sniffing 차단 — Content-Type 무시한 실행 가능 차단
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Referrer 정책 — same-origin 은 풀 URL, 외부는 origin 만 (이메일 추적 차단)
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // 권한 정책 — 카메라·마이크·위치·결제 API 사용 차단 (필요 없음)
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=()",
          },
          // CSP — 외부 스크립트 화이트리스트 + 인라인 허용 (Next.js 호환)
          { key: "Content-Security-Policy", value: csp },
        ],
      },
    ];
  },
};

// Sentry build-time wrap — source map 업로드 + tunneling 등 활성화
// 환경변수(SENTRY_ORG·SENTRY_PROJECT·SENTRY_AUTH_TOKEN) 미등록 상태에서도
// 빌드 자체는 깨지지 않음 (Sentry CLI 단계가 noop 으로 동작).
// silent: CI 환경에서만 로그 출력, 로컬 dev 는 조용하게.
// tunnelRoute: /monitoring 으로 Sentry 요청을 우회 → adblocker 회피.
// sourcemaps.deleteSourcemapsAfterUpload: 업로드 후 prod 번들에서 .map 삭제 →
//   public 에 sourcemap 노출 차단 (v10 표준, 구 hideSourceMaps 대체).
export default withSentryConfig(nextConfig, {
  silent: !process.env.CI,
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  tunnelRoute: "/monitoring",
  sourcemaps: {
    deleteSourcemapsAfterUpload: true,
  },
});
