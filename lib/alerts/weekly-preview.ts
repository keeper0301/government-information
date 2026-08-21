import type { Tier } from "@/lib/subscription";
import type { MatchedProgram } from "@/lib/alerts/matching";
import { buildBasicPricingHref } from "@/lib/pricing/cta-links";

export type WeeklyAlertPreviewItem = {
  id: string;
  title: string;
  href: string;
  source: string;
  applyEnd: string | null;
  dday: number | null;
};

export type WeeklyAlertPreview = {
  locked: boolean;
  headline: string;
  subheadline: string;
  metricLabel: string;
  metricValue: string;
  items: WeeklyAlertPreviewItem[];
  primaryAction: {
    label: string;
    href: string;
  };
};

function todayKst(): string {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function calcKstDday(applyEnd: string | null, today = todayKst()): number | null {
  if (!applyEnd) return null;
  const end = new Date(`${applyEnd.slice(0, 10)}T00:00:00+09:00`).getTime();
  const base = new Date(`${today}T00:00:00+09:00`).getTime();
  if (Number.isNaN(end) || Number.isNaN(base)) return null;
  return Math.ceil((end - base) / (24 * 60 * 60 * 1000));
}

export function programHref(program: Pick<MatchedProgram, "id" | "table">): string {
  return program.table === "loan_programs" ? `/loan/${program.id}` : `/welfare/${program.id}`;
}

export function buildWeeklyAlertPreview({
  tier,
  activeAlertRulesCount,
  savedDeadlineAlertsCount,
  matchedPrograms,
  today,
}: {
  tier: Tier;
  activeAlertRulesCount: number;
  savedDeadlineAlertsCount: number;
  matchedPrograms: MatchedProgram[];
  today?: string;
}): WeeklyAlertPreview {
  const isPaid = tier === "basic" || tier === "pro";
  if (!isPaid) {
    return {
      locked: true,
      headline: "이번 주 감시 리포트는 Basic부터 열려요",
      subheadline: "내 조건에 맞는 새 정책과 마감 임박 정책을 매주 한눈에 확인하려면 마감 감시를 켜세요.",
      metricLabel: "감시 상태",
      metricValue: "꺼짐",
      items: [],
      primaryAction: {
        label: "Basic으로 주간 감시 켜기",
        href: buildBasicPricingHref("alerts"),
      },
    };
  }

  if (activeAlertRulesCount <= 0) {
    return {
      locked: false,
      headline: "이번 주 감시 리포트를 만들 조건이 없어요",
      subheadline: "관심 지역·업종·키워드 조건을 1개만 저장해도 매주 새 정책을 요약해볼 수 있어요.",
      metricLabel: "활성 감시 조건",
      metricValue: "0개",
      items: [],
      primaryAction: {
        label: "감시 조건 만들기",
        href: "/mypage/notifications?from=weekly-preview",
      },
    };
  }

  const normalized = matchedPrograms
    .map((program) => ({
      id: program.id,
      title: program.title,
      href: programHref(program),
      source: program.source,
      applyEnd: program.apply_end,
      dday: calcKstDday(program.apply_end, today),
    }))
    .sort((a, b) => {
      if (a.dday === null && b.dday === null) return a.title.localeCompare(b.title, "ko");
      if (a.dday === null) return 1;
      if (b.dday === null) return -1;
      return a.dday - b.dday;
    });
  const urgentCount = normalized.filter((item) => item.dday !== null && item.dday >= 0 && item.dday <= 14).length;

  if (normalized.length === 0) {
    return {
      locked: false,
      headline: "이번 주 새로 잡힌 정책은 아직 없어요",
      subheadline: `${activeAlertRulesCount}개 조건을 계속 감시 중입니다. 새 공고가 잡히면 알림센터에서 바로 확인할 수 있어요.`,
      metricLabel: "감시 중",
      metricValue: `${activeAlertRulesCount}개 조건`,
      items: [],
      primaryAction: {
        label: "감시 조건 조정하기",
        href: "/mypage/notifications?from=weekly-preview",
      },
    };
  }

  return {
    locked: false,
    headline: `이번 주 새로 잡힌 정책 ${normalized.length}건`,
    subheadline: urgentCount > 0
      ? `이 중 ${urgentCount}건은 14일 안에 마감될 수 있어요. 먼저 자격과 서류를 확인하세요.`
      : `저장된 감시 조건 ${activeAlertRulesCount}개와 직접 등록한 마감 알림 ${savedDeadlineAlertsCount}개를 기준으로 봤어요.`,
    metricLabel: "마감 임박",
    metricValue: `${urgentCount}건`,
    items: normalized.slice(0, 3),
    primaryAction: {
      label: "감시 조건 관리하기",
      href: "/mypage/notifications?from=weekly-preview",
    },
  };
}
