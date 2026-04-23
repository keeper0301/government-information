import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // OG 이미지 라우트가 process.cwd() 로 폰트를 읽어 — 자동 추적 누락 대비
  outputFileTracingIncludes: {
    "/blog/[slug]/opengraph-image": ["./assets/Pretendard-Bold.woff"],
  },
};

export default nextConfig;
