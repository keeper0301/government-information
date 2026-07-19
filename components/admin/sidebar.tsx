"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ADMIN_MENU, ADMIN_QUICK_ACTIONS, findActiveMenuItem } from "@/lib/admin/menu";

type Props = {
  onItemClick?: () => void;
};

export function Sidebar({ onItemClick }: Props) {
  const pathname = usePathname() ?? "/admin";
  const activeItem = findActiveMenuItem(pathname);
  const activeHref = activeItem?.href ?? null;
  const isDashboardActive = pathname === "/admin";
  const isUserDetailActive = pathname.startsWith("/admin/users/");

  return (
    <nav
      aria-label="관리자 메뉴"
      className="h-full overflow-y-auto border-r border-grey-200 bg-grey-50 py-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      <div className="border-b border-grey-200 px-5 pb-4">
        <Link href="/admin" className="block no-underline" onClick={onItemClick}>
          <div className="text-xl font-extrabold tracking-[-0.03em] text-grey-900">
            keepioo
          </div>
          <div className="mt-1 text-xs font-bold tracking-[0.14em] text-grey-500">
            ADMIN
          </div>
        </Link>
      </div>

      <div className="px-4 py-4">
        <button
          type="button"
          onClick={() => {
            window.dispatchEvent(new Event("cmdk:open"));
            onItemClick?.();
          }}
          className="flex w-full items-center gap-2 rounded-lg border border-grey-200 bg-white px-3 py-2.5 text-sm text-grey-600 transition-colors hover:border-blue-300 hover:text-grey-900"
        >
          <span aria-hidden>🔍</span>
          <span className="flex-1 text-left">페이지 검색</span>
          <kbd className="rounded border border-grey-200 bg-grey-50 px-1.5 py-0.5 text-xs text-grey-500">
            Ctrl K
          </kbd>
        </button>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {ADMIN_QUICK_ACTIONS.map((item) => {
            const isActive = item.href === activeHref;
            return (
              <Link
                key={`quick-${item.href}`}
                href={item.href}
                onClick={onItemClick}
                title={item.description}
                className={
                  "rounded-lg border px-2.5 py-2 text-xs font-bold no-underline transition-colors " +
                  (isActive
                    ? "border-blue-200 bg-blue-50 text-blue-700"
                    : "border-grey-200 bg-white text-grey-700 hover:border-blue-200 hover:text-blue-700")
                }
              >
                <span className="mr-1" aria-hidden>
                  {item.icon}
                </span>
                {item.label}
              </Link>
            );
          })}
        </div>
      </div>

      <Link
        href="/admin"
        onClick={onItemClick}
        className={
          isDashboardActive
            ? "flex items-center gap-2.5 border-l-[3px] border-blue-500 bg-blue-50 py-3 pl-[21px] pr-5 text-sm font-bold text-blue-600 no-underline"
            : "flex items-center gap-2.5 py-3 pl-6 pr-5 text-sm font-bold text-grey-800 no-underline hover:bg-grey-100"
        }
      >
        <span aria-hidden>🏠</span>
        대시보드
      </Link>

      {ADMIN_MENU.map((group) => (
        <section key={group.number} className="pt-4">
          <div className="px-6 pb-1">
            <div className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-grey-500">
              {group.number}. {group.title}
            </div>
            <div className="mt-0.5 text-[11px] leading-[1.4] text-grey-500">
              {group.summary}
            </div>
          </div>
          {group.items.map((item) => {
            const isActive =
              item.href === activeHref ||
              (item.href === "/admin#user-search" && isUserDetailActive);

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onItemClick}
                title={item.description}
                className={
                  isActive
                    ? "flex items-center gap-2.5 border-l-[3px] border-blue-500 bg-blue-50 py-2.5 pl-[33px] pr-5 text-sm font-bold text-blue-600 no-underline"
                    : "flex items-center gap-2.5 py-2.5 pl-9 pr-5 text-sm text-grey-700 no-underline hover:bg-grey-100 hover:text-grey-900"
                }
              >
                <span className="w-5 shrink-0 text-center text-sm" aria-hidden>
                  {item.icon}
                </span>
                <span className="min-w-0 truncate">{item.label}</span>
              </Link>
            );
          })}
        </section>
      ))}
    </nav>
  );
}
