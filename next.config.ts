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
};

export default nextConfig;
