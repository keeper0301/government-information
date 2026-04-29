// ============================================================
// /loan/region/[code] — 광역별 대출·지원금 SEO long-tail 페이지
// ============================================================
// 배경:
//   /loan?region=전남 (query string) 은 검색엔진이 같은 페이지의 변형으로
//   인식해 색인 점수가 분산. /loan/region/jeonnam (path) 으로 분리하면
//   고유 URL = 고유 SEO 페이지로 인식 → "전남 소상공인 대출", "경기 신용보증"
//   같은 long-tail 키워드 검색 결과 매칭 가속.
//
//   /welfare/region/[code] 와 동일 패턴. 17 광역 모두 활성 정책 ≥3건 보유.
//
// 차이점 vs welfare:
//   - loan_programs 에 region 컬럼 없음 → region_tags array + title prefix
//     매칭 두 갈래로 OR (본 /loan 페이지의 applyFilters 와 동일 전략).
// ============================================================

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ProgramRow } from "@/components/program-row";
import { loanToDisplay } from "@/lib/programs";
import {
  PROVINCES,
  PROVINCE_CODE_TO_SHORT,
  getProvinceByCode,
  getRegionMatchPatterns,
  type ProvinceCode,
} from "@/lib/regions";
import { LOAN_EXCLUDED_FILTER } from "@/lib/listing-sources";

// 17 광역 SSG 빌드 (Next.js 16 패턴)
export async function generateStaticParams() {
  return PROVINCES.map((p) => ({ code: p.code }));
}

export const dynamic = "force-static";
export const dynamicParams = false; // 17 광역 외 code 는 자동 404 (SEO 위 빈 페이지 색인 차단)
export const revalidate = 3600; // 1시간 ISR

interface PageProps {
  params: Promise<{ code: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { code } = await params;
  const province = getProvinceByCode(code);

  if (!province) {
    return { title: "광역을 찾을 수 없어요 | 정책알리미" };
  }

  const shortName = PROVINCE_CODE_TO_SHORT[code as ProvinceCode] ?? province.name;
  const title = `${province.name} 소상공인 대출·지원금 가이드`;
  const description = `${province.name} 소상공인·자영업자가 받을 수 있는 정부 대출과 지원금을 한곳에서 확인하세요. 자격·금리·한도 정리.`;

  return {
    title: `${title} | 정책알리미`,
    description,
    keywords: `${province.name}, ${shortName}, 대출, 소상공인, 자영업, ${shortName} 대출, ${shortName} 정책자금, ${shortName} 신용보증`,
    alternates: { canonical: `/loan/region/${code}` },
    authors: [{ name: "정책알리미", url: "https://www.keepioo.com" }],
    openGraph: {
      title,
      description,
      type: "website",
      siteName: "정책알리미",
      locale: "ko_KR",
      url: `/loan/region/${code}`,
    },
  };
}

const DISPLAY_LIMIT = 50;

export default async function LoanRegionPage({ params }: PageProps) {
  const { code } = await params;
  const province = getProvinceByCode(code);
  if (!province) notFound();

  const shortName = PROVINCE_CODE_TO_SHORT[code as ProvinceCode] ?? province.name;
  const supabase = await createClient();
  const today = new Date().toISOString().split("T")[0];

  // loan region 매칭 — 본 /loan 의 applyFilters 와 동일 전략:
  //   1) region_tags 배열에 짧은 이름 포함 (예: ['전남']) — cs:'{전남}'
  //   2) title prefix [전남] 또는 (전남 형식 — title.ilike
  // 두 갈래 OR 로 표기 변형 모두 흡수.
  const patterns = getRegionMatchPatterns(shortName); // 예: ["전라남도", "전남"]
  const orParts: string[] = [];
  for (const p of patterns) {
    // region_tags array contains 매칭 — PostgREST cs (contains) 연산자
    orParts.push(`region_tags.cs.{${p}}`);
    // title prefix 매칭 — 대괄호·괄호 두 변형
    orParts.push(`title.ilike.%[${p}%`);
    orParts.push(`title.ilike.%(${p}%`);
  }
  const orClause = orParts.join(",");

  const { data, count } = await supabase
    .from("loan_programs")
    .select("*", { count: "exact" })
    .not("source_code", "in", LOAN_EXCLUDED_FILTER)
    .is("duplicate_of_id", null) // 중복 정책 (Phase 3 B3) 사용자 노출 차단
    .or(orClause)
    .or(`apply_end.gte.${today},apply_end.is.null`)
    .order("apply_end", { ascending: true, nullsFirst: false })
    .limit(DISPLAY_LIMIT);

  const programs = (data || []).map(loanToDisplay);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: `${province.name} 소상공인 대출·지원금 가이드`,
    description: `${province.name} 소상공인·자영업자 대상 정부 대출·지원금 모음.`,
    inLanguage: "ko-KR",
    url: `https://www.keepioo.com/loan/region/${code}`,
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
        url: `https://www.keepioo.com/loan/${p.id}`,
        name: p.title,
      })),
    },
  };

  return (
    <main className="min-h-screen bg-grey-50 pt-[80px] pb-20">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
        }}
      />

      <div className="max-w-[1200px] mx-auto px-5">
        {/* 브레드크럼 */}
        <nav className="text-[13px] text-grey-600 mb-4" aria-label="breadcrumb">
          <Link href="/" className="hover:underline">홈</Link>
          <span className="mx-1.5">/</span>
          <Link href="/loan" className="hover:underline">소상공인 대출</Link>
          <span className="mx-1.5">/</span>
          <span className="text-grey-900">{province.name}</span>
        </nav>

        <header className="mb-8">
          <h1 className="text-[32px] font-bold tracking-[-0.5px] text-grey-900 max-md:text-[24px]">
            {province.name} 소상공인 대출·지원금 가이드
          </h1>
          <p className="mt-2 text-[15px] text-grey-700 leading-[1.6]">
            {province.name} 소상공인·자영업자가 받을 수 있는 정부 대출과
            지원금을 한곳에 모았어요. 자격·금리·한도를 빠르게 확인하세요.
          </p>
          <p className="mt-3 text-[13px] text-grey-600">
            현재 활성 {count ?? 0}건 · 마감 임박 순
          </p>
        </header>

        {programs.length === 0 ? (
          <div className="rounded-2xl bg-white border border-grey-200 p-8 text-center">
            <p className="text-grey-700">
              현재 {province.name} 지역에 활성 대출·지원금이 없습니다.
            </p>
            <Link
              href="/loan"
              className="mt-4 inline-block text-blue-600 hover:underline text-[14px]"
            >
              전체 대출·지원금 보기 →
            </Link>
          </div>
        ) : (
          <div className="flex flex-col bg-white border border-grey-200 rounded-2xl px-6 md:px-8 py-2">
            {programs.map((p) => (
              <ProgramRow key={p.id} program={p} />
            ))}
          </div>
        )}

        {programs.length >= DISPLAY_LIMIT && (
          <div className="mt-6 text-center">
            <Link
              href={`/loan?region=${encodeURIComponent(shortName)}`}
              className="inline-block px-5 py-3 rounded-full bg-blue-600 text-white text-[14px] font-medium hover:bg-blue-700"
            >
              {province.name} 대출·지원금 전체 보기
            </Link>
          </div>
        )}

        <section className="mt-12 pt-8 border-t border-grey-200">
          <h2 className="text-[18px] font-bold text-grey-900 mb-4">
            다른 광역의 대출·지원금
          </h2>
          <div className="flex flex-wrap gap-2">
            {PROVINCES.filter((p) => p.code !== code).map((p) => (
              <Link
                key={p.code}
                href={`/loan/region/${p.code}`}
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
