import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";
import {
  buildContentSecurityPolicy,
  buildReportOnlyContentSecurityPolicy,
} from "./lib/security/csp";

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
  // @ohah/hwpjs 는 네이티브 모듈(.node napi, hwp5 파싱). 번들 제외 → node_modules
  // 플랫폼 prebuilt(@ohah/hwpjs-linux-x64-gnu 등)를 런타임 require (강원 hwp 본문).
  // unpdf 는 내부 import.meta 직접 접근 때문에 webpack 번들 시 Critical dependency warning 발생.
  // cron/collector 서버 런타임에서만 필요하므로 외부화해 node_modules ESM 으로 로드한다.
  serverExternalPackages: ["jsdom", "isomorphic-dompurify", "@ohah/hwpjs", "unpdf"],

  // IndexNow 표준 — 검색엔진 봇이 root path 의 {key}.txt 를 GET 해 키 검증.
  // /api/indexnow-key 로 rewrite 해 동일 키 응답 (api 라우트가 INDEXNOW_KEY env 반환).
  // 정규식: 32~128자 hex 만 — robots.txt·sitemap.xml 등 다른 root 파일과 안전 분리.
  async rewrites() {
    return [
      {
        source: "/:key([a-f0-9]{32,128}).txt",
        destination: "/api/indexnow-key",
      },
    ];
  },

  // 보안 헤더 — 외부 LLM 평가에서 HSTS 만 있고 나머지 부재 지적.
  async headers() {
    // Content-Security-Policy — 외부 스크립트(AdSense·GA·Toss) 도메인 명시.
    // 가장 관대한 정책으로 enforce — 사이트 깨짐 위험 최소화.
    // unsafe-inline 허용: Next.js 의 inline script/style + _next/ chunks 호환.
    // unsafe-eval 은 report-only 관찰에서 의존성이 없어 enforce 에서 제거.
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
    const csp = buildContentSecurityPolicy();
    const cspReportOnly = buildReportOnlyContentSecurityPolicy();

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
          // CSP report-only — enforce 와 동일한 정책을 관찰용으로도 수집. 강제 차단 없이 /api/csp-report 로 수집.
          { key: "Content-Security-Policy-Report-Only", value: cspReportOnly },
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
