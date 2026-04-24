// ============================================================
// Footer — 사이트 공통 하단
// ============================================================
// 구성 (위→아래):
//   1. 마스트헤드 + 주요 링크 (도움말·이용약관·개인정보처리방침·문의)
//   2. 데이터 출처 안내 (정부 공공데이터)
//   3. 공공누리 라이선스 (정책 뉴스 korea.kr 활용분 — KOGL-Type1 의무 표기)
//   4. 사업자 정보 (전자상거래법 제13조 기본 표시 의무)
//   5. 저작권
// ============================================================

const footerLinks = [
  { label: "정책가이드", href: "/blog" },
  { label: "도움말", href: "/help" },
  { label: "이용약관", href: "/terms" },
  { label: "개인정보처리방침", href: "/privacy" },
  { label: "문의", href: "mailto:keeper0301@gmail.com" },
];

// 사업자 정보 — 전자상거래 등에서의 소비자보호에 관한 법률 제13조 표시 의무.
// 연락처 전화번호는 공개 시 개인정보 유출 리스크 있어 이메일로 단일화.
// 주소는 라이브 결제 활성화 시 추가 검토 필요 (통신판매업 신고 기준).
const BUSINESS_INFO = {
  name: "키피오",
  ceo: "최관철",
  regNo: "657-24-02265",
  email: "keeper0301@gmail.com",
  service: "keepioo.com",
};

export function Footer() {
  return (
    <footer className="max-w-content mx-auto px-10 pt-12 pb-[60px] max-md:px-6 max-md:pt-10 max-md:pb-12">
      <div className="flex justify-between items-center mb-5 max-md:flex-col max-md:items-start max-md:gap-4">
        {/* Editorial Masthead 컴팩트 */}
        <div className="flex items-center gap-2.5">
          <span
            className="italic text-grey-800"
            style={{
              fontFamily: "'Bodoni Moda', 'Didot', 'Playfair Display', Georgia, serif",
              fontSize: "22px", fontWeight: 400, letterSpacing: "-0.7px",
            }}
          >
            keepioo
          </span>
          <span
            aria-hidden="true"
            style={{
              width: 5, height: 5, borderRadius: "50%",
              background: "#8A2A2A", display: "inline-block", marginTop: 4,
            }}
          />
          <span
            className="text-grey-800"
            style={{
              fontFamily: "'Nanum Myeongjo', 'Noto Serif KR', serif",
              fontSize: "12px", fontWeight: 700, letterSpacing: "1.5px",
            }}
          >
            정책알리미
          </span>
        </div>
        <div className="flex gap-5 flex-wrap">
          {footerLinks.map((link) => (
            <a
              key={link.label}
              href={link.href}
              className="text-[13px] text-grey-600 no-underline hover:text-grey-700 transition-colors"
            >
              {link.label}
            </a>
          ))}
        </div>
      </div>

      {/* 데이터 출처 + 공공누리 라이선스 */}
      <div
        className="text-[13px] text-grey-600 leading-[1.7] mb-6"
        style={{ fontFamily: "'EB Garamond', Georgia, serif", fontStyle: "italic" }}
      >
        <span style={{ color: "#3D2F22" }}>
          Curating Korea&apos;s public benefits since 2026.
        </span>
        <br />
        <span className="not-italic font-sans">
          데이터 출처: 보조금24(행정안전부) · 복지로 · 기업마당 · 소상공인진흥공단
          · 온통청년 · 공공데이터포털
          <br />
          본 서비스는 정보 안내 목적이며, 실제 신청은 각 기관 공식 사이트에서 진행됩니다.
          <br />
          {/* 공공누리 KOGL-Type1 의무 표기 — news_posts 에 저장된 korea.kr 뉴스 활용분 */}
          <span className="text-grey-700">
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
          </span>
        </span>
      </div>

      {/* 사업자 정보 — 전자상거래법 제13조 (신원정보) 표시 의무 */}
      <div className="pt-6 border-t border-grey-100 text-[12px] text-grey-600 leading-[1.8]">
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
            이메일{" "}
            <a
              href={`mailto:${BUSINESS_INFO.email}`}
              className="text-grey-700 hover:text-grey-900 underline"
            >
              {BUSINESS_INFO.email}
            </a>
          </span>
        </div>
        <div className="mt-3 text-grey-600">
          © 2026 {BUSINESS_INFO.name}. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
