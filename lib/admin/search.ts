import { ADMIN_MENU } from "./menu";

export type AdminSearchItem = {
  href: string;
  label: string;
  icon: string;
  group: string;
  description?: string;
  keywords?: string[];
};

export function buildAdminSearchItems(): AdminSearchItem[] {
  return [
    {
      href: "/admin",
      label: "대시보드",
      icon: "🏠",
      group: "홈",
      description: "오늘 처리할 일과 운영 요약",
      keywords: ["홈", "메인", "운영", "요약"],
    },
    ...ADMIN_MENU.flatMap((group) =>
      group.items.map((item) => ({
        ...item,
        group: group.title,
      })),
    ),
  ];
}

export function filterAdminSearchItems(
  items: AdminSearchItem[],
  query: string,
): AdminSearchItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;

  return items.filter((item) => {
    const haystack = [
      item.label,
      item.group,
      item.description,
      ...(item.keywords ?? []),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(q);
  });
}
