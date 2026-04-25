// Next.js 16 app manifest convention
// https://nextjs.org/docs/app/api-reference/file-conventions/metadata/manifest

import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "keepioo · 정책알리미",
    short_name: "keepioo",
    description:
      "한국의 정부·지자체 공공 지원제도를 큐레이션해 이메일·알림톡으로 전달합니다.",
    start_url: "/",
    display: "standalone",
    background_color: "#FFFFFF",
    theme_color: "#191F28",
    lang: "ko-KR",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
      },
      {
        src: "/apple-icon.svg",
        sizes: "180x180",
        type: "image/svg+xml",
      },
    ],
  };
}
