// ============================================================
// 어드민 사이드바 메뉴 단일 source of truth (5 그룹 / 페이지 18)
// ============================================================
// 그룹 순서 = 사장님 운영 우선순위 (운영점검 → 컨텐츠 → 알림 → 지표 → 사용자).
// 새 admin 페이지 추가 시 여기에만 추가하면 사이드바·활성 매칭 자동 반영.
// ============================================================

// 사이드바에 표시되는 개별 메뉴 항목 타입
export type AdminMenuItem = {
  href: string;   // 클릭 시 이동할 경로 (anchor 포함 가능: /admin#user-search)
  label: string;  // 화면에 보일 한국어 라벨
  icon: string;   // 이모지 아이콘 (시각 anchor 용)
};

// 메뉴 그룹 (관련 항목 묶음) 타입
export type AdminMenuGroup = {
  number: number;          // 그룹 번호 (1~5, 사장님 운영 우선순위 순)
  title: string;           // 그룹 제목
  items: AdminMenuItem[];  // 그룹에 속한 메뉴 항목
};

export const ADMIN_MENU: AdminMenuGroup[] = [
  {
    number: 1,
    title: "운영 상태",
    items: [
      { href: "/admin/health", label: "헬스 대시보드", icon: "📊" },
      { href: "/admin/cron-trigger", label: "cron 수동 실행", icon: "⚙️" },
      { href: "/admin/cron-failures", label: "cron 실패 알림", icon: "🚨" },
      { href: "/admin/my-actions", label: "내 감사 로그", icon: "📋" },
      { href: "/admin/enrich-detail", label: "공고 detail 보강", icon: "🔧" },
    ],
  },
  {
    number: 2,
    title: "컨텐츠 발행",
    items: [
      { href: "/admin/press-ingest", label: "광역 보도자료 후보", icon: "🤖" },
      { href: "/admin/welfare/new", label: "복지 정책 신규", icon: "➕" },
      { href: "/admin/loan/new", label: "대출 정책 신규", icon: "➕" },
      { href: "/admin/news", label: "뉴스 모더레이션", icon: "📰" },
      { href: "/admin/news/backfill-dedupe-runner", label: "뉴스 dedupe 백필", icon: "🔄" },
      { href: "/admin/blog", label: "블로그 목록", icon: "✍️" },
    ],
  },
  {
    number: 3,
    title: "알림 발송",
    items: [
      { href: "/admin/alimtalk", label: "카카오톡 발송", icon: "📤" },
      { href: "/admin/alert-simulator", label: "알림 시뮬레이터", icon: "🧪" },
    ],
  },
  {
    number: 4,
    title: "지표·분석",
    items: [
      { href: "/admin/insights", label: "사용자 funnel", icon: "📈" },
      { href: "/admin/targeting", label: "본문 targeting 분석", icon: "🎯" },
      { href: "/admin/business", label: "자영업자 자격 진단", icon: "🏪" },
    ],
  },
  {
    number: 5,
    title: "사용자",
    items: [
      // /admin/users 정적 페이지 없음 — 사용자 검색 form 은 /admin (대시보드) 안에 있음.
      // 메뉴 클릭 시 /admin#user-search anchor 로 스크롤. 메인 page.tsx 가 id="user-search" 부여.
      { href: "/admin#user-search", label: "사용자 조회", icon: "👤" },
      { href: "/admin/wishes", label: "위시리스트", icon: "❤️" },
    ],
  },
];

// ─── 활성 메뉴 매칭 ───
// 정확 일치 우선, 그렇지 않으면 가장 긴 prefix 매칭.
// 예: /admin/news/backfill-dedupe-runner 는 /admin/news 보다 긴 prefix 라
// 정확히 backfill 메뉴가 활성으로 잡힘.
// anchor (#user-search) 가 있는 항목은 path 매칭에서 제외.
export function findActiveMenuItem(currentPath: string): AdminMenuItem | null {
  // 1) 정확 일치 (anchor 포함 항목도 동일 문자열이면 잡힘)
  for (const group of ADMIN_MENU) {
    for (const item of group.items) {
      if (item.href === currentPath) return item;
    }
  }
  // 2) 가장 긴 prefix 매칭 (동적 라우트 대응)
  let best: AdminMenuItem | null = null;
  let bestLen = -1;
  for (const group of ADMIN_MENU) {
    for (const item of group.items) {
      // anchor 가 있는 항목은 path prefix 매칭 대상에서 제외
      if (item.href.includes("#")) continue;
      if (currentPath.startsWith(`${item.href}/`) && item.href.length > bestLen) {
        best = item;
        bestLen = item.href.length;
      }
    }
  }
  return best;
}
