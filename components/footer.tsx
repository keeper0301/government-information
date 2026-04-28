// ============================================================
// Footer — 사이트 공통 하단
// ============================================================
// 구성 (위→아래):
//   1. 마스트헤드 + 주요 링크 (도움말·이용약관·개인정보처리방침·문의)
//   2. 데이터 신선도 (마지막 갱신 시각) — 활성 운영 시그널
//   3. 데이터 출처 안내 (정부 공공데이터)
//   4. 공공누리 라이선스 (정책 뉴스 korea.kr 활용분 — KOGL-Type1 의무 표기)
//   5. 사업자 정보 (전자상거래법 제13조 기본 표시 의무)
//   6. 저작권
// ============================================================

import { getDataFreshness, formatFreshness } from "@/lib/data-freshness";

const footerLinks = [
  { label: "1분 진단", href: "/quiz" },
  { label: "서비스 소개", href: "/about" },
  { label: "도움말", href: "/help" },
  { label: "이용약관", href: "/terms" },
  { label: "개인정보처리방침", href: "/privacy" },
  { label: "문의", href: "mailto:keeper0301@gmail.com" },
];

// 사업자 정보 — 전자상거래 등에서의 소비자보호에 관한 법률 제13조 표시 의무.
// 연락처 전화번호는 공개 시 개인정보 유출 리스크 있어 이메일로 단일화.
// 주소는 1인 운영 + 자택 주소 노출 우려로 미공개 (필요 시 사업자등록상태조회 링크).
// host: 전상법 제13조 1항 — 호스팅서비스 제공자 표시 의무.
// dpo: 개인정보보호법 제31조 — 개인정보보호책임자 표시 의무.
const BUSINESS_INFO = {
  name: "키피오",
  ceo: "최관철",
  regNo: "657-24-02265",
  mailOrderNo: "2026-전남순천-7182",
  email: "keeper0301@gmail.com",
  service: "keepioo.com",
  host: "Vercel Inc.",
  dpo: "최관철",
};

export async function Footer() {
  const freshness = await getDataFreshness();
  return (
    <footer className="max-w-content mx-auto px-10 pt-12 pb-[60px] max-md:px-6 max-md:pt-10 max-md:pb-12">
      <div className="flex justify-between items-center mb-5 max-md:flex-col max-md:items-start max-md:gap-4">
        {/* 푸터 마스트헤드 — 헤더와 동일한 토스 풍 단어 강조 (compact) */}
        <div className="flex items-baseline gap-2.5">
          <span className="font-extrabold text-[22px] tracking-[-0.04em] leading-none text-grey-800">
            keepi<span className="text-blue-500">oo</span>
          </span>
          <span className="text-[12px] font-semibold text-grey-500 tracking-[-0.01em]">
            정책알리미
          </span>
        </div>
        <div className="flex gap-5 flex-wrap max-md:gap-x-5 max-md:gap-y-1 max-md:-mx-2">
          {footerLinks.map((link) => (
            <a
              key={link.label}
              href={link.href}
              className="text-[13px] text-grey-600 no-underline hover:text-grey-700 transition-colors max-md:inline-flex max-md:items-center max-md:min-h-[44px] max-md:px-2"
            >
              {link.label}
            </a>
          ))}
        </div>
      </div>

      {/* 데이터 신선도 — 활성 운영 시그널 (AdSense·검색 봇·사용자 신뢰 모두 ↑) */}
      <div className="inline-flex items-center gap-1.5 text-[12px] text-grey-600 mb-4 px-2.5 py-1 rounded-full bg-grey-50 border border-grey-100">
        <span aria-hidden="true" className="w-[6px] h-[6px] rounded-full bg-emerald-500 animate-pulse" />
        <span>📡 데이터 {formatFreshness(freshness.minutes_ago)}</span>
      </div>

      {/* 데이터 출처 + 공공누리 라이선스 — Pretendard 단일 톤
          (이전 EB Garamond italic catchline 폐기, 한국어 한 줄로 정체성 표현) */}
      <div className="text-[13px] text-grey-600 leading-[1.7] mb-6">
        <p className="text-grey-700 font-medium mb-2">
          매일 새 정부 정책을 큐레이션해서 알려드려요.
        </p>
        <p>
          데이터 출처: 보조금24(행정안전부) · 복지로 · 기업마당 · 소상공인진흥공단
          · 온통청년 · 공공데이터포털
        </p>
        <p>
          본 서비스는 정보 안내 목적이며, 실제 신청은 각 기관 공식 사이트에서 진행됩니다.
        </p>
        {/* 공공누리 KOGL-Type1 의무 표기 — news_posts 에 저장된 korea.kr 뉴스 활용분 */}
        <p className="text-grey-700 mt-1">
          정책 뉴스 섹션의 본문·썸네일은{" "}
          <a
            href="https://www.korea.kr"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-grey-900"
          >
            정책브리핑(korea.kr)
          </a>
          의 자료를 공공누리 제1유형(KOGL-Type1, 출처표시·상업이용·변형 허용) 으로 활용합니다.
        </p>
      </div>

      {/* 사업자 정보 — 전자상거래법 제13조 (신원정보) 표시 의무.
          12px 는 한국어로 너무 작아 노안·40·50대 가독성 떨어짐 → 13px 로 키움. */}
      <div className="pt-6 border-t border-grey-100 text-[13px] text-grey-600 leading-[1.8]">
        <div className="font-semibold text-grey-700 mb-1">사업자 정보</div>
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          <span>
            상호 <strong className="text-grey-700">{BUSINESS_INFO.name}</strong>
          </span>
          <span>
            대표 <strong className="text-grey-700">{BUSINESS_INFO.ceo}</strong>
          </span>
          <span>
            사업자등록번호{" "}
            <strong className="text-grey-700">{BUSINESS_INFO.regNo}</strong>
          </span>
          <span>
            통신판매번호{" "}
            <strong className="text-grey-700">{BUSINESS_INFO.mailOrderNo}</strong>
          </span>
          <span>
            이메일{" "}
            <a
              href={`mailto:${BUSINESS_INFO.email}`}
              className="text-grey-700 hover:text-grey-900 underline"
            >
              {BUSINESS_INFO.email}
            </a>
          </span>
          <span>
            호스팅서비스 제공자{" "}
            <strong className="text-grey-700">{BUSINESS_INFO.host}</strong>
          </span>
          <span>
            개인정보보호책임자{" "}
            <strong className="text-grey-700">{BUSINESS_INFO.dpo}</strong>{" "}
            (
            <a
              href={`mailto:${BUSINESS_INFO.email}`}
              className="text-grey-700 hover:text-grey-900 underline"
            >
              {BUSINESS_INFO.email}
            </a>
            )
          </span>
        </div>
        <div className="mt-3 text-grey-600">
          © 2026 {BUSINESS_INFO.name}. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
