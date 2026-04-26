// ============================================================
// /about — 정책알리미(keepioo.com) 소개
// ============================================================
// 서비스 미션·운영 방식·데이터 출처·연락처를 한 페이지에 정리.
// AdSense 검수자에게 "사이트가 누구이고 왜 만들어졌는지" 명확히 전달.
// E-E-A-T(전문성·경험·권위·신뢰) 시그널 보강 페이지.
// ============================================================
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "정책알리미 소개 | keepioo.com",
  description:
    "정책알리미는 정부의 복지·대출·지원금 정책을 한곳에 모아 누구나 쉽게 찾고 받을 수 있도록 돕는 서비스입니다. 데이터 출처·운영 방식·연락처를 안내합니다.",
  alternates: { canonical: "/about" },
  openGraph: {
    title: "정책알리미 소개 | keepioo.com",
    description:
      "정부 복지·대출·지원금 정책을 쉽게 찾고 받을 수 있도록 돕는 서비스",
    type: "website",
  },
};

// ISR — 소개 페이지는 갱신 드물어 1일 캐시
export const revalidate = 86400;

export default function AboutPage() {
  return (
    <main className="min-h-screen bg-grey-50 pt-[80px] pb-20">
      <div className="max-w-[720px] mx-auto px-5">
        {/* 헤더 */}
        <header className="mb-10">
          <h1 className="text-[28px] md:text-[36px] font-extrabold text-grey-900 tracking-[-0.6px] mb-3">
            정책알리미 소개
          </h1>
          <p className="text-[15px] md:text-[17px] text-grey-700 leading-[1.7]">
            누구나 받을 수 있는 정부 정책을 놓치지 않도록 도와드려요.
          </p>
        </header>

        {/* 미션 */}
        <Section title="우리가 만들고 싶은 것">
          <p>
            매년 정부와 지자체에서 수천 개의 복지·대출·지원금 정책이 발표됩니다.
            하지만 정보가 부처별·홈페이지별로 흩어져 있어 정작 도움이 필요한
            국민이 자기에게 맞는 정책을 찾기는 어렵습니다.
          </p>
          <p className="mt-3">
            정책알리미는 흩어진 정책을 한곳에 모으고, 사용자의 나이·지역·직업·
            가구 상태를 바탕으로 적합한 정책을 추천합니다. 신청 마감일이 가까운
            정책은 알림으로 알려드려 신청 기회를 놓치지 않게 합니다.
          </p>
        </Section>

        {/* 데이터 출처 */}
        <Section title="데이터는 어디서 가져오나요">
          <p className="mb-3">
            정부 공공 데이터 포털과 공식 부처 사이트에서 공개된 데이터만
            사용합니다. 모든 정책은 원문 출처를 함께 표기하며, 사용자는 정책
            상세 페이지에서 원본 사이트로 이동해 직접 확인할 수 있습니다.
          </p>
          <ul className="list-disc pl-5 space-y-1.5 text-grey-700">
            <li>공공데이터포털 (data.go.kr) — 복지·대출·창업 정책</li>
            <li>복지로 (bokjiro.go.kr) — 중앙·지자체 복지 사업</li>
            <li>온라인청년센터 (youthcenter.go.kr) — 청년 정책</li>
            <li>중소벤처기업부 (mss.go.kr) — 소상공인·중소기업 지원</li>
            <li>각 지자체 보도자료 RSS — 광역·기초 자치단체 정책 뉴스</li>
            <li>대한민국 정책브리핑 (korea.kr) — 부처별 발표</li>
          </ul>
        </Section>

        {/* 운영 방식 */}
        <Section title="운영 방식">
          <p>
            정책 데이터는 매일 자동 수집됩니다. 마감일이 지난 정책은 자동으로
            정리되고, 새 정책이 등록되면 사용자 프로필에 맞춰 알림이
            발송됩니다.
          </p>
          <p className="mt-3">
            블로그의 정책 가이드 글은 발행 전 출처 데이터를 기반으로 작성되며,
            중복·표절·낮은 품질을 차단하는 검수 단계를 거칩니다. 정확한 신청
            절차를 안내하기 위해 모든 글에는 원문 사이트 링크를 첨부합니다.
          </p>
        </Section>

        {/* 광고·수익 모델 */}
        <Section title="서비스 운영 비용">
          <p>
            정책알리미의 정보 검색·맞춤 추천·기본 알림은 모두 무료입니다.
            서비스 운영을 위해 일부 페이지에 Google AdSense 광고와 선택형 유료
            구독(베이직·프로)을 함께 운영합니다. 광고는 정부 정책 정보의
            신뢰성과 충돌하지 않도록 가독성을 우선해 배치합니다.
          </p>
        </Section>

        {/* 정확성과 면책 */}
        <Section title="정확성과 책임">
          <p>
            정책알리미는 공공 데이터를 가공해 안내하는 서비스이며, 신청 자격·
            지원 금액·마감일 등 최종 확정 정보는 반드시 각 정책의 원문 사이트
            또는 담당 기관에 문의해 확인하시기 바랍니다.
          </p>
          <p className="mt-3">
            데이터 수집·가공 과정에서 오류가 발견되면 즉시 정정합니다.
            잘못된 정보를 발견하셨다면 아래 연락처로 알려 주세요.
          </p>
        </Section>

        {/* 연락처 */}
        <Section title="연락처">
          <ul className="space-y-2 text-grey-700">
            <li>
              운영자: <b className="text-grey-900">키피오 (keepioo)</b>
            </li>
            <li>
              이메일:{" "}
              <a
                href="mailto:keeper0301@gmail.com"
                className="text-blue-600 hover:underline"
              >
                keeper0301@gmail.com
              </a>
            </li>
            <li>
              사업자 정보·도움말은 페이지 하단 푸터와{" "}
              <Link href="/help" className="text-blue-600 hover:underline">
                /help
              </Link>{" "}
              에서 확인할 수 있어요.
            </li>
          </ul>
        </Section>

        {/* 빠른 링크 */}
        <nav
          aria-label="빠른 링크"
          className="mt-10 pt-6 border-t border-grey-100 text-[14px] text-grey-700"
        >
          <p className="mb-3 font-semibold text-grey-900">바로 가기</p>
          <ul className="grid grid-cols-2 gap-2">
            <QuickLink href="/welfare" label="복지정보" />
            <QuickLink href="/loan" label="대출·지원금" />
            <QuickLink href="/news" label="정책 소식" />
            <QuickLink href="/blog" label="정책 블로그" />
            <QuickLink href="/recommend" label="맞춤 추천" />
            <QuickLink href="/help" label="도움말" />
          </ul>
        </nav>
      </div>
    </main>
  );
}

// 페이지 내 섹션 — h2 + 본문 묶음
function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-white rounded-2xl border border-grey-100 p-6 md:p-7 mb-4">
      <h2 className="text-[18px] md:text-[20px] font-bold text-grey-900 mb-3 tracking-[-0.3px]">
        {title}
      </h2>
      <div className="text-[14px] md:text-[15px] text-grey-700 leading-[1.8]">
        {children}
      </div>
    </section>
  );
}

// 푸터 빠른 링크 1개
function QuickLink({ href, label }: { href: string; label: string }) {
  return (
    <li>
      <Link
        href={href}
        className="flex items-center min-h-[44px] px-3 rounded-xl bg-white border border-grey-200 text-grey-700 hover:bg-grey-50 hover:border-grey-300 no-underline transition-colors"
      >
        {label} →
      </Link>
    </li>
  );
}
