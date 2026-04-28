// ============================================================
// /welfare/region/[code] 동적 OG 이미지 (1200 × 630)
// ============================================================
// 광역명 + 활성 정책 카운트를 동적으로 노출 → SNS 공유 시 카드에
// "전라남도 복지 정책 가이드 · 활성 889건" 식으로 매력적 미리보기.
//
// 디자인: root opengraph-image 패턴 일치 (Pretendard·블루 accent)
// ============================================================

import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createClient } from "@/lib/supabase/server";
import { getProvinceByCode, type ProvinceCode } from "@/lib/regions";
import { WELFARE_EXCLUDED_FILTER } from "@/lib/listing-sources";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "광역별 복지 정책 가이드 · keepioo 정책알리미";

let fontDataPromise: Promise<Buffer> | null = null;
function loadFontData(): Promise<Buffer> {
  if (!fontDataPromise) {
    fontDataPromise = readFile(join(process.cwd(), "assets/Pretendard-Bold.woff"));
  }
  return fontDataPromise;
}

export default async function OgImage({ params }: { params: { code: string } }) {
  const province = getProvinceByCode(params.code as ProvinceCode);
  const fontData = await loadFontData();

  // 카운트 조회 (실패 시 0 fallback — OG 이미지는 절대 throw 안 해야)
  let activeCount = 0;
  try {
    const supabase = await createClient();
    const { count } = await supabase
      .from("welfare_programs")
      .select("id", { count: "exact", head: true })
      .not("source_code", "in", WELFARE_EXCLUDED_FILTER)
      .like("region", `%${province?.name ?? params.code}%`);
    activeCount = count ?? 0;
  } catch {
    // OG 이미지 fetch 실패는 무시 (caching 안 되더라도 정상 응답)
  }

  const title = province ? `${province.name} 복지 정책` : "복지 정책 가이드";
  const subtitle = `활성 ${activeCount.toLocaleString()}건 · 마감 임박 우선`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "linear-gradient(135deg, #F0F7FF 0%, #FFFFFF 60%, #E8F3FF 100%)",
          display: "flex",
          flexDirection: "column",
          padding: "88px 96px",
          fontFamily: "Pretendard",
          color: "#191F28",
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", gap: 18 }}>
          <div style={{ fontSize: 44, fontWeight: 800, letterSpacing: -1.5, display: "flex" }}>
            <span style={{ color: "#191F28" }}>keepi</span>
            <span style={{ color: "#3182F6" }}>oo</span>
          </div>
          <div
            style={{
              fontSize: 20,
              fontWeight: 700,
              color: "#8B95A1",
              paddingLeft: 16,
              borderLeft: "2px solid #E5E8EB",
              alignSelf: "center",
            }}
          >
            정책알리미
          </div>
        </div>

        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", marginTop: 20 }}>
          <div
            style={{
              fontSize: 28,
              fontWeight: 700,
              color: "#3182F6",
              marginBottom: 16,
              letterSpacing: -0.5,
            }}
          >
            지역별 정책 가이드
          </div>
          <div
            style={{
              fontSize: 96,
              fontWeight: 800,
              lineHeight: 1.1,
              letterSpacing: -4,
              color: "#191F28",
              wordBreak: "keep-all",
            }}
          >
            {title}
          </div>
          <div
            style={{
              fontSize: 32,
              fontWeight: 600,
              color: "#4E5968",
              marginTop: 24,
              letterSpacing: -0.5,
            }}
          >
            {subtitle}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontSize: 22,
            color: "#8B95A1",
            fontWeight: 600,
            paddingTop: 28,
            borderTop: "1px solid #E5E8EB",
          }}
        >
          <span>자격·신청 방법·마감일 한눈에</span>
          <span style={{ color: "#3182F6" }}>keepioo.com</span>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [{ name: "Pretendard", data: fontData, style: "normal", weight: 700 }],
    },
  );
}
