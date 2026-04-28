// ============================================================
// /welfare/region/[code] — 광역별 복지 정책 SEO long-tail 페이지
// ============================================================
// 배경:
//   /welfare?region=전남 (query string) 은 검색엔진이 같은 페이지의 변형으로
//   인식해 색인 점수가 분산. /welfare/region/jeonnam (path) 으로 분리하면
//   고유 URL = 고유 SEO 페이지로 인식 → "전라남도 복지", "전남 지원금"
//   같은 long-tail 키워드 검색 결과 매칭 가속.
//
//   /blog/category/[category] 와 동일 패턴 (87efc65). 17 광역 모두 활성
//   정책 ≥100건 보유 — thin-content 위험 없음.
//
// 차이점 vs 본 /welfare:
//   - 개인화 분리 섹션 없음 → 비로그인 SEO 랜딩에 집중
//   - 검색·페이지네이션 없음 → 단순 카드 그리드 (최신 마감 임박 50건)
//   - force-static + ISR 1시간 (사용자 요청별 fetch 비용 절감)
// ============================================================

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ProgramRow } from "@/components/program-row";
import { welfareToDisplay } from "@/lib/programs";
import { PROVINCES, getProvinceByCode, getRegionMatchPatterns } from "@/lib/regions";
import { WELFARE_EXCLUDED_FILTER } from "@/lib/listing-sources";

// 17 광역 SSG 빌드 (Next.js 16 패턴)
export async function generateStaticParams() {
  return PROVINCES.map((p) => ({ code: p.code }));
}

export const dynamic = "force-static";
export const revalidate = 3600; // 1시간 ISR — region 페이지는 신규 정책 즉시성보다 SEO 안정성 우선

interface PageProps {
  params: Promise<{ code: string }>;
}

// 광역별 짧은 이름 (UI 드롭다운에 쓰는 형식) ↔ 광역 코드 매핑.
// "전남" 같은 짧은 이름은 region.ilike 매칭에 더 잘 잡힘.
const PROVINCE_SHORT_BY_CODE: Record<string, string> = {
  seoul: "서울", busan: "부산", daegu: "대구", incheon: "인천",
  gwangju: "광주", daejeon: "대전", ulsan: "울산", sejong: "세종",
  gyeonggi: "경기", gangwon: "강원", chungbuk: "충북", chungnam: "충남",
  jeonbuk: "전북", jeonnam: "전남", gyeongbuk: "경북", gyeongnam: "경남",
  jeju: "제주",
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { code } = await params;
  const province = getProvinceByCode(code);

  if (!province) {
    return { title: "광역을 찾을 수 없어요 | 정책알리미" };
  }

  const shortName = PROVINCE_SHORT_BY_CODE[code] ?? province.name;
  const title = `${province.name} 복지 정책 가이드`;
  const description = `${province.name} 거주자가 받을 수 있는 정부·지자체 복지 혜택을 한곳에서 확인하세요. 자격·신청 방법·마감일 정리.`;

  return {
    title: `${title} | 정책알리미`,
    description,
    keywords: `${province.name}, ${shortName}, 복지, 지원금, 정책, ${shortName} 복지, ${shortName} 지원금, 신청 방법`,
    alternates: { canonical: `/welfare/region/${code}` },
    authors: [{ name: "정책알리미", url: "https://www.keepioo.com" }],
    openGraph: {
      title,
      description,
      type: "website",
      siteName: "정책알리미",
      locale: "ko_KR",
      url: `/welfare/region/${code}`,
    },
  };
}

// 카드 표시 최대 수 — SEO 인덱싱과 LCP 사이 균형. /blog/category 도 50.
const DISPLAY_LIMIT = 50;

export default async function WelfareRegionPage({ params }: PageProps) {
  const { code } = await params;
  const province = getProvinceByCode(code);
  if (!province) notFound();

  const shortName = PROVINCE_SHORT_BY_CODE[code] ?? province.name;
  const supabase = await createClient();
  const today = new Date().toISOString().split("T")[0];

  // region 필터 — getRegionMatchPatterns 는 ["전라남도", "전남"] 형태로
  // 정식·짧은 이름 모두 반환. ilike OR 로 다양한 표기 형식 흡수.
  const patterns = getRegionMatchPatterns(shortName);
  const orClause = patterns.map((p) => `region.ilike.%${p}%`).join(",");

  const { data, count } = await supabase
    .from("welfare_programs")
    .select("*", { count: "exact" })
    .not("source_code", "in", WELFARE_EXCLUDED_FILTER)
    .or(orClause)
    .or(`apply_end.gte.${today},apply_end.is.null`)
    .order("apply_end", { ascending: true, nullsFirst: false })
    .limit(DISPLAY_LIMIT);

  const programs = (data || []).map(welfareToDisplay);

  // CollectionPage + ItemList JSON-LD — 네이버·Google 검색 리치 카드 시그널
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: `${province.name} 복지 정책 가이드`,
    description: `${province.name} 거주자가 받을 수 있는 정부·지자체 복지 혜택 모음.`,
    inLanguage: "ko-KR",
    url: `https://www.keepioo.com/welfare/region/${code}`,
    isPartOf: {
      "@type": "WebSite",
      name: "정책알리미",
      url: "https://www.keepioo.com",
    },
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: programs.length,
      itemListElement: programs.map((p, i) => ({
        "@type": "ListItem",
        position: i + 1,
        url: `https://www.keepioo.com/welfare/${p.id}`,
        name: p.title,
      })),
    },
  };

  return (
    <main className="min-h-screen bg-grey-50 pt-[80px] pb-20">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          // </script> 가 본문 끝과 충돌하지 않도록 escape (다른 페이지와 동일 가드)
          __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
        }}
      />

      <div className="max-w-[1200px] mx-auto px-5">
        {/* 브레드크럼 */}
        <nav className="text-[13px] text-grey-600 mb-4" aria-label="breadcrumb">
          <Link href="/" className="hover:underline">홈</Link>
          <span className="mx-1.5">/</span>
          <Link href="/welfare" className="hover:underline">복지 지원사업</Link>
          <span className="mx-1.5">/</span>
          <span className="text-grey-900">{province.name}</span>
        </nav>

        <header className="mb-8">
          <h1 className="text-[32px] font-bold tracking-[-0.5px] text-grey-900 max-md:text-[24px]">
            {province.name} 복지 정책 가이드
          </h1>
          <p className="mt-2 text-[15px] text-grey-700 leading-[1.6]">
            {province.name} 거주자가 받을 수 있는 정부·지자체 복지 혜택을
            한곳에 모았어요. 자격·신청 방법·마감일을 빠르게 확인하세요.
          </p>
          <p className="mt-3 text-[13px] text-grey-600">
            현재 활성 {count ?? 0}건 · 마감 임박 순
          </p>
        </header>

        {programs.length === 0 ? (
          <div className="rounded-2xl bg-white border border-grey-200 p-8 text-center">
            <p className="text-grey-700">
              현재 {province.name} 지역에 활성 복지 정책이 없습니다.
            </p>
            <Link
              href="/welfare"
              className="mt-4 inline-block text-blue-600 hover:underline text-[14px]"
            >
              전체 복지 정책 보기 →
            </Link>
          </div>
        ) : (
          <div className="flex flex-col bg-white border border-grey-200 rounded-2xl px-6 md:px-8 py-2">
            {programs.map((p) => (
              <ProgramRow key={p.id} program={p} />
            ))}
          </div>
        )}

        {/* 본 페이지로 회유 — 검색·필터·페이지네이션 안내 */}
        {programs.length >= DISPLAY_LIMIT && (
          <div className="mt-6 text-center">
            <Link
              href={`/welfare?region=${encodeURIComponent(shortName)}`}
              className="inline-block px-5 py-3 rounded-full bg-blue-600 text-white text-[14px] font-medium hover:bg-blue-700"
            >
              {province.name} 정책 전체 보기
            </Link>
          </div>
        )}

        {/* 다른 광역 링크 — 사용자 회유 + 내부 링크 SEO */}
        <section className="mt-12 pt-8 border-t border-grey-200">
          <h2 className="text-[18px] font-bold text-grey-900 mb-4">
            다른 광역의 복지 정책
          </h2>
          <div className="flex flex-wrap gap-2">
            {PROVINCES.filter((p) => p.code !== code).map((p) => (
              <Link
                key={p.code}
                href={`/welfare/region/${p.code}`}
                className="px-4 py-2 rounded-full bg-white border border-grey-200 text-[14px] text-grey-700 hover:border-blue-400 hover:text-blue-600 transition-colors"
              >
                {p.name}
              </Link>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
