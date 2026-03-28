import { BellIcon } from "./icons";

const navItems = [
  { label: "복지정보", href: "/welfare", active: true },
  { label: "대출정보", href: "/loan", active: false },
  { label: "달력", href: "/calendar", active: false },
  { label: "블로그", href: "/blog", active: false },
];

export function Nav() {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-[20px] backdrop-saturate-[180%] border-b border-grey-100">
      <div className="max-w-content mx-auto px-10 h-[58px] flex items-center justify-between">
        <a href="/" className="flex items-center gap-2 no-underline">
          <div className="w-[30px] h-[30px] rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 grid place-items-center">
            <BellIcon className="w-[18px] h-[18px] text-white" />
          </div>
          <span className="text-[18px] font-extrabold tracking-[-0.6px] text-grey-900">
            정책알리미
          </span>
        </a>
        <div className="hidden md:flex items-center gap-0.5">
          {navItems.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className={`px-3.5 py-2.5 text-[15px] min-h-[44px] flex items-center rounded-lg transition-colors ${
                item.active
                  ? "font-semibold text-grey-900"
                  : "font-medium text-grey-700 hover:bg-grey-50 hover:text-grey-900"
              }`}
            >
              {item.label}
            </a>
          ))}
          <a
            href="/login"
            className="ml-3 px-4 py-[7px] text-sm font-semibold text-blue-500 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors no-underline min-h-[44px] flex items-center"
          >
            로그인
          </a>
        </div>
      </div>
    </nav>
  );
}
