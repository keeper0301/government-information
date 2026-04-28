import type { NextConfig } from "next";

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
  // CSP 는 AdSense·GA·Toss 등 외부 스크립트가 많아 너무 엄격하게 잡으면 사이트
  // 깨짐 위험 → 별도 검토 후 도입. 우선 4종부터.
  async headers() {
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
        ],
      },
    ];
  },
};

export default nextConfig;
