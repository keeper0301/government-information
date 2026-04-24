const footerLinks = [
  { label: "정책가이드", href: "/blog" },
  { label: "이용약관", href: "/terms" },
  { label: "개인정보처리방침", href: "/privacy" },
  { label: "문의", href: "mailto:keeper0301@gmail.com" },
];

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
        <div className="flex gap-5">
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
      <div
        className="text-xs text-grey-500 leading-[1.7]"
        style={{ fontFamily: "'EB Garamond', Georgia, serif", fontStyle: "italic" }}
      >
        <span style={{ color: "#3D2F22" }}>
          Curating Korea&apos;s public benefits since 2026.
        </span>
        <br />
        데이터 출처: 보조금24(행정안전부) · 복지로 · 기업마당 · 소상공인진흥공단
        · 온통청년 · 공공데이터포털
        <br />본 서비스는 정보 안내 목적이며, 실제 신청은 각 기관 공식 사이트에서
        진행됩니다.
      </div>
    </footer>
  );
}
