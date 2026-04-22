const footerLinks = [
  { label: "정책가이드", href: "/blog" },
  { label: "이용약관", href: "/terms" },
  { label: "개인정보처리방침", href: "/privacy" },
  { label: "문의", href: "mailto:support@keepioo.com" },
];

export function Footer() {
  return (
    <footer className="max-w-content mx-auto px-10 pt-12 pb-[60px] max-md:px-6 max-md:pt-10 max-md:pb-12">
      <div className="flex justify-between mb-5 max-md:flex-col max-md:gap-4">
        <div className="text-[15px] font-bold text-grey-800">정책알리미</div>
        <div className="flex gap-5">
          {footerLinks.map((link) => (
            <a
              key={link.label}
              href={link.href}
              className="text-[13px] text-grey-500 no-underline hover:text-grey-700 transition-colors"
            >
              {link.label}
            </a>
          ))}
        </div>
      </div>
      <div className="text-xs text-grey-400 leading-[1.7]">
        공공기관 데이터 기반 복지·대출 정보 안내 서비스
        <br />
        데이터 출처: 복지로, 소상공인24, 소상공인시장진흥공단, 금융위원회,
        공공데이터포털
        <br />본 서비스는 정보 안내 목적이며, 실제 신청은 각 기관 공식
        사이트에서 진행됩니다.
      </div>
    </footer>
  );
}
