export type AdminMenuItem = {
  href: string;
  label: string;
  icon: string;
  description?: string;
};

export type AdminMenuGroup = {
  number: number;
  title: string;
  summary: string;
  items: AdminMenuItem[];
};

export const ADMIN_MENU: AdminMenuGroup[] = [
  {
    number: 1,
    title: "오늘 처리",
    summary: "매일 먼저 확인할 운영 큐",
    items: [
      {
        href: "/admin/autonomous",
        label: "운영 홈",
        icon: "🤖",
        description: "자동화 준비도, 개선 과제, 상주 에이전트",
      },
      {
        href: "/admin/external-actions",
        label: "외부 조치",
        icon: "📌",
        description: "콘솔에서 직접 확인해야 하는 승인과 설정",
      },
      {
        href: "/admin/decisions",
        label: "결정 대기",
        icon: "🤔",
        description: "관리자 판단이 필요한 작업",
      },
      {
        href: "/admin#user-search",
        label: "사용자 조회",
        icon: "👤",
        description: "이메일 또는 UUID로 회원 확인",
      },
    ],
  },
  {
    number: 2,
    title: "자동화와 시스템",
    summary: "오류 확인, cron 실행, 시스템 도구",
    items: [
      {
        href: "/admin/system-ops",
        label: "시스템 운영 콘솔",
        icon: "🛠️",
        description: "실행, 점검, 오류 해결을 한 곳에서 처리",
      },
      {
        href: "/admin/health",
        label: "헬스 대시보드",
        icon: "📊",
        description: "서비스와 데이터 상태 추세",
      },
      {
        href: "/admin/ops-monitor",
        label: "운영 모니터링",
        icon: "📡",
        description: "운영 이벤트와 상태 감시",
      },
      {
        href: "/admin/cron-failures",
        label: "cron 실패",
        icon: "🚨",
        description: "실패 알림 확인과 재시도",
      },
      {
        href: "/admin/cron-trigger",
        label: "cron 수동 실행",
        icon: "⚙️",
        description: "예약 작업을 직접 실행",
      },
      {
        href: "/admin/dedupe",
        label: "중복 정책 정리",
        icon: "🔁",
        description: "복지와 대출 정책 중복 후보 처리",
      },
      {
        href: "/admin/enrich-detail",
        label: "공고 상세 보강",
        icon: "🔧",
        description: "부족한 상세 정보를 수동 보강",
      },
    ],
  },
  {
    number: 3,
    title: "콘텐츠 발행",
    summary: "정책 등록, 보도자료, 블로그와 SNS 발행",
    items: [
      {
        href: "/admin/press-ingest",
        label: "보도자료 후보",
        icon: "📰",
        description: "광역 보도자료 후보 검수",
      },
      {
        href: "/admin/auto-confirmed",
        label: "AI 자동 등록 검수",
        icon: "✅",
        description: "자동 등록된 정책 회수와 복원",
      },
      {
        href: "/admin/welfare/new",
        label: "복지 정책 등록",
        icon: "➕",
        description: "복지 정책 직접 추가",
      },
      {
        href: "/admin/loan/new",
        label: "대출 정책 등록",
        icon: "🏦",
        description: "대출 정책 직접 추가",
      },
      {
        href: "/admin/news",
        label: "뉴스 모더레이션",
        icon: "🗞️",
        description: "정책 뉴스 숨김과 복원",
      },
      {
        href: "/admin/blog",
        label: "블로그 글 관리",
        icon: "✍️",
        description: "글 목록, 편집, 공개 전환",
      },
      {
        href: "/admin/long-tail",
        label: "SEO 글 생성",
        icon: "🌱",
        description: "롱테일 검색용 글 생성",
      },
      {
        href: "/admin/naver-blog",
        label: "네이버 블로그",
        icon: "🟢",
        description: "네이버 발행 큐와 수동 테스트",
      },
      {
        href: "/admin/wordpress",
        label: "워드프레스",
        icon: "🌐",
        description: "워드프레스 재발행과 자동 발행",
      },
      {
        href: "/admin/instagram",
        label: "인스타그램 카드",
        icon: "📸",
        description: "카드뉴스 발행 준비",
      },
      {
        href: "/admin/instagram-comments",
        label: "인스타 댓글 답글",
        icon: "💬",
        description: "댓글 답글 초안과 검수",
      },
      {
        href: "/admin/scrape-local",
        label: "지역 보도자료 수집",
        icon: "🏛️",
        description: "지역 사이트 수집 상태",
      },
    ],
  },
  {
    number: 4,
    title: "고객과 알림",
    summary: "발송, 문의, 개인화",
    items: [
      {
        href: "/admin/alimtalk",
        label: "알림톡 발송",
        icon: "📤",
        description: "카카오 알림톡 운영",
      },
      {
        href: "/admin/alert-simulator",
        label: "알림 시뮬레이터",
        icon: "🧪",
        description: "정책별 발송 대상 미리보기",
      },
      {
        href: "/admin/support",
        label: "고객 문의",
        icon: "🙋",
        description: "문의 답변과 상태 관리",
      },
      {
        href: "/admin/recommendation-trace",
        label: "추천 진단",
        icon: "🔍",
        description: "개인화 추천 흐름 확인",
      },
    ],
  },
  {
    number: 5,
    title: "분석과 기록",
    summary: "성과, 사용자 흐름, 감사 로그",
    items: [
      {
        href: "/admin/insights",
        label: "사용자 퍼널",
        icon: "📈",
        description: "가입, 활성, 전환 흐름",
      },
      {
        href: "/admin/targeting",
        label: "본문 타겟팅",
        icon: "🎯",
        description: "콘텐츠 타겟팅 분석",
      },
      {
        href: "/admin/business",
        label: "자영업자 진단",
        icon: "🏪",
        description: "자영업자 프로필과 진단 통계",
      },
      {
        href: "/admin/my-actions",
        label: "내 감사 로그",
        icon: "📋",
        description: "내가 실행한 관리자 작업",
      },
      {
        href: "/admin/wishes",
        label: "위시리스트",
        icon: "❤️",
        description: "사용자 관심 정책 기록",
      },
    ],
  },
];

export function findActiveMenuItem(currentPath: string): AdminMenuItem | null {
  for (const group of ADMIN_MENU) {
    for (const item of group.items) {
      if (item.href === currentPath) return item;
    }
  }

  let best: AdminMenuItem | null = null;
  let bestLen = -1;
  for (const group of ADMIN_MENU) {
    for (const item of group.items) {
      if (item.href.includes("#")) continue;
      if (currentPath === item.href || currentPath.startsWith(`${item.href}/`)) {
        if (item.href.length > bestLen) {
          best = item;
          bestLen = item.href.length;
        }
      }
    }
  }
  return best;
}
