// ============================================================
// 사장님 weekly-ops 이메일 다이제스트 — 7일 trend + auto-confirm 안전망
// ============================================================
// 매주 화요일 KST 09:00 cron (사용자용 weekly-digest 가 월요일이라 충돌 회피).
// 사장님 본인 ADMIN_EMAIL 한 통. SMS daily-digest 의 7일 누계 + trend 시각화.
//
// 어드민 자동화 마스터 #4 (통합 알림) + #6 (안전망) 통합 (2026-05-07).
// ============================================================

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * #6 안전망 — 자동 confirm 무작위 샘플 5건.
 * 매주 7일 자동 처리 (사장님 사후 검토 안 함) 중 무작위 5건을 이메일에 노출 →
 * 사장님이 임계 낮춤 (#3) 후 오판단 패턴을 조기 발견하는 안전망.
 *
 * DDL 없이 admin_actions 활용 — actor_id IS NULL 인 자동 처리만.
 */
export type AutoConfirmSample = {
  action: string;
  createdAt: string;
  details: Record<string, unknown>;
};

export type WeeklyOpsData = {
  // 7일 누계
  signups7d: number;
  newPolicies7d: number;
  active7d: number;
  pressAutoConfirmed7d: number;
  newsAutoHidden7d: number;
  dedupeAutoConfirmed7d: number;
  wordpressPublished7d: number;
  cronFailures7d: number;
  // 현재 시점 검토 큐 (지금 시점)
  dedupePending: number;
  naverBlogPending: number;
  // Task 10 (2026-05-08) — 주간 자동 등록·회수율·tier 분포 가시성.
  // mid 회수율 5% 초과 시 AUTO_CONFIRM_TIER_FLOOR=high 안전 모드 전환 신호.
  /** 7일 자동 등록 합계 (welfare + loan, high + mid) */
  weekAutoConfirm: number;
  /** 7일 자동 회수 (admin_actions.press_l2_auto_revoke) */
  weekAutoRevoke: number;
  /** 회수율 % (0~100, 정수). 자동 등록 0 이면 0 */
  weekRevokeRate: number;
  /** 7일 high tier 자동 등록 (welfare + loan) */
  weekHighCount: number;
  /** 7일 mid tier 자동 등록 (welfare + loan) */
  weekMidCount: number;
  /** mid 회수율 % — 5% 초과 시 경고 (사장님 hot-fix 신호) */
  weekMidRevokeRate: number;
};

/**
 * 7일 윈도우 운영 KPI 수집. daily-digest 의 24h 패턴 그대로 7d 윈도우.
 * 1 query 실패해도 다른 KPI 보존 (try/catch + 0 fallback).
 */
export async function collectWeeklyOpsDigest(): Promise<WeeklyOpsData> {
  const admin = createAdminClient();
  const since7d = new Date(
    Date.now() - 7 * 24 * 60 * 60 * 1000,
  ).toISOString();

  async function safe<T extends { count: number | null }>(
    builder: PromiseLike<T>,
  ): Promise<number> {
    try {
      const r = await builder;
      return r.count ?? 0;
    } catch (e) {
      console.warn(
        `[weekly-ops-digest] query 실패 (0 fallback):`,
        e instanceof Error ? e.message : String(e),
      );
      return 0;
    }
  }

  const [
    signups,
    welfareNew,
    loanNew,
    newsNew,
    active,
    pressAuto,
    newsAutoHide,
    dedupeAuto,
    wpPub,
    cronFail,
    welfareDedupe,
    loanDedupe,
    naverBlog,
    // Task 10 (2026-05-08) — 7d 자동 등록 (welfare/loan × high/mid) + 7d 회수.
    // DDL 077 미적용 prod 에선 auto_confirm_tier 컬럼 부재 → safe() 가 0 fallback.
    welfareHighWeek,
    welfareMidWeek,
    loanHighWeek,
    loanMidWeek,
    autoRevokeWeek,
  ] = await Promise.all([
    safe(
      admin
        .from("user_profiles")
        .select("user_id", { count: "exact", head: true })
        .gte("created_at", since7d),
    ),
    safe(
      admin
        .from("welfare_programs")
        .select("id", { count: "exact", head: true })
        .gte("created_at", since7d),
    ),
    safe(
      admin
        .from("loan_programs")
        .select("id", { count: "exact", head: true })
        .gte("created_at", since7d),
    ),
    safe(
      admin
        .from("news_posts")
        .select("id", { count: "exact", head: true })
        .gte("created_at", since7d),
    ),
    safe(
      admin
        .from("user_profiles")
        .select("user_id", { count: "exact", head: true })
        .gte("updated_at", since7d),
    ),
    safe(
      admin
        .from("admin_actions")
        .select("id", { count: "exact", head: true })
        .eq("action", "press_l2_confirm")
        .is("actor_id", null)
        .gte("created_at", since7d),
    ),
    safe(
      admin
        .from("admin_actions")
        .select("id", { count: "exact", head: true })
        .eq("action", "news_auto_hide")
        .is("actor_id", null)
        .gte("created_at", since7d),
    ),
    safe(
      admin
        .from("admin_actions")
        .select("id", { count: "exact", head: true })
        .eq("action", "dedupe_auto_confirm")
        .is("actor_id", null)
        .gte("created_at", since7d),
    ),
    safe(
      admin
        .from("wordpress_publish_log")
        .select("id", { count: "exact", head: true })
        .eq("status", "published")
        .gte("published_at", since7d),
    ),
    safe(
      admin
        .from("cron_failure_log")
        .select("id", { count: "exact", head: true })
        .gte("last_seen_at", since7d),
    ),
    safe(
      admin
        .from("welfare_programs")
        .select("id", { count: "exact", head: true })
        .not("duplicate_of_id", "is", null)
        .is("dedupe_auto_confirmed_at", null),
    ),
    safe(
      admin
        .from("loan_programs")
        .select("id", { count: "exact", head: true })
        .not("duplicate_of_id", "is", null)
        .is("dedupe_auto_confirmed_at", null),
    ),
    safe(
      admin
        .from("naver_blog_queue")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending"),
    ),
    // Task 10 — 7d high tier 자동 등록 (welfare).
    safe(
      admin
        .from("welfare_programs")
        .select("id", { count: "exact", head: true })
        .eq("auto_confirm_tier", "high")
        .gte("auto_confirmed_at", since7d),
    ),
    // Task 10 — 7d mid tier 자동 등록 (welfare).
    safe(
      admin
        .from("welfare_programs")
        .select("id", { count: "exact", head: true })
        .eq("auto_confirm_tier", "mid")
        .gte("auto_confirmed_at", since7d),
    ),
    // Task 10 — 7d high tier 자동 등록 (loan).
    safe(
      admin
        .from("loan_programs")
        .select("id", { count: "exact", head: true })
        .eq("auto_confirm_tier", "high")
        .gte("auto_confirmed_at", since7d),
    ),
    // Task 10 — 7d mid tier 자동 등록 (loan).
    safe(
      admin
        .from("loan_programs")
        .select("id", { count: "exact", head: true })
        .eq("auto_confirm_tier", "mid")
        .gte("auto_confirmed_at", since7d),
    ),
    // Task 10 — 7d 자동 회수 (action enum press_l2_auto_revoke 는 Task 3 에서 추가됨).
    safe(
      admin
        .from("admin_actions")
        .select("id", { count: "exact", head: true })
        .eq("action", "press_l2_auto_revoke")
        .gte("created_at", since7d),
    ),
  ]);

  // Task 10 — 7d mid 회수율 산출용 details JSONB 조회 (count 가 아니므로 별도 try/catch).
  // press_l2_auto_revoke audit details 안의 auto_confirm_tier='mid' 만 카운트.
  let midRevokeCount = 0;
  try {
    const { data: revokeMidRows } = await admin
      .from("admin_actions")
      .select("details")
      .eq("action", "press_l2_auto_revoke")
      .gte("created_at", since7d);
    midRevokeCount = (revokeMidRows ?? []).filter(
      (r) =>
        (r as { details?: { auto_confirm_tier?: string } | null }).details
          ?.auto_confirm_tier === "mid",
    ).length;
  } catch (e) {
    console.warn(
      `[weekly-ops-digest] mid 회수율 details fetch 실패 (0 fallback):`,
      e instanceof Error ? e.message : String(e),
    );
  }

  // Task 10 — high·mid·전체 자동 등록 합산 + 회수율 % 계산.
  const weekHighCount = welfareHighWeek + loanHighWeek;
  const weekMidCount = welfareMidWeek + loanMidWeek;
  const weekAutoConfirm = weekHighCount + weekMidCount;
  const weekAutoRevoke = autoRevokeWeek;
  const weekRevokeRate =
    weekAutoConfirm > 0
      ? Math.round((weekAutoRevoke / weekAutoConfirm) * 100)
      : 0;
  const weekMidRevokeRate =
    weekMidCount > 0 ? Math.round((midRevokeCount / weekMidCount) * 100) : 0;

  return {
    signups7d: signups,
    newPolicies7d: welfareNew + loanNew + newsNew,
    active7d: active,
    pressAutoConfirmed7d: pressAuto,
    newsAutoHidden7d: newsAutoHide,
    dedupeAutoConfirmed7d: dedupeAuto,
    wordpressPublished7d: wpPub,
    cronFailures7d: cronFail,
    dedupePending: welfareDedupe + loanDedupe,
    naverBlogPending: naverBlog,
    // Task 10 — 자동 등록·회수율·tier 분포
    weekAutoConfirm,
    weekAutoRevoke,
    weekRevokeRate,
    weekHighCount,
    weekMidCount,
    weekMidRevokeRate,
  };
}

/**
 * #6 안전망 — 7일 자동 처리 중 무작위 5건 샘플.
 *
 * 흐름:
 *   1) admin_actions 의 actor_id IS NULL (자동 처리) 7d 50건 fetch
 *   2) JS 단 무작위 셔플 후 5건 추출
 *   3) weekly-ops 이메일에 노출 → 사장님이 무작위 검증 (오판단 조기 발견)
 *
 * ORDER BY RANDOM() 은 큰 테이블에 비효율 → 50건 fetch 후 in-memory shuffle.
 * 50건 미만이면 fetch 한 만큼만 (자동 처리가 적은 주는 5건 안 될 수 있음).
 */
export async function fetchAutoConfirmSample(): Promise<AutoConfirmSample[]> {
  const admin = createAdminClient();
  const since7d = new Date(
    Date.now() - 7 * 24 * 60 * 60 * 1000,
  ).toISOString();

  try {
    const { data, error } = await admin
      .from("admin_actions")
      .select("action, created_at, details")
      .in("action", [
        "dedupe_auto_confirm",
        "press_l2_confirm",
        "news_auto_hide",
      ])
      .is("actor_id", null)
      .gte("created_at", since7d)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error || !data || data.length === 0) return [];

    // in-memory 셔플 — Fisher-Yates 변형
    const shuffled = [...data];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled.slice(0, 5).map((row) => ({
      action: String(row.action ?? ""),
      createdAt: String(row.created_at ?? ""),
      details: (row.details ?? {}) as Record<string, unknown>,
    }));
  } catch (e) {
    console.warn(
      `[weekly-ops-digest] auto-confirm sample 실패:`,
      e instanceof Error ? e.message : String(e),
    );
    return [];
  }
}

/**
 * 자동 처리 절감 시간 추정 — 사장님 가시화용.
 * 각 처리 1건당 평균 30초 가정 (보수적).
 */
export function estimateTimeSaved(data: WeeklyOpsData): number {
  const totalAuto =
    data.pressAutoConfirmed7d +
    data.newsAutoHidden7d +
    data.dedupeAutoConfirmed7d;
  return Math.round((totalAuto * 30) / 60); // 분 단위
}

/**
 * 사장님 weekly-ops 이메일 HTML 본문.
 * 토스 디자인 시스템 색상 (#3182F6 brand, #4E5968 secondary, #F9FAFB bg).
 *
 * #6 안전망: auditSample 인자로 받아 무작위 5건 노출. 빈 배열이면 audit 섹션 skip.
 */
export function buildWeeklyOpsHtml(
  data: WeeklyOpsData,
  auditSample: AutoConfirmSample[] = [],
): {
  subject: string;
  html: string;
  text: string;
} {
  const date = new Date();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const subject = `[keepioo 운영] ${mm}/${dd} 주간 다이제스트`;
  const timeSavedMin = estimateTimeSaved(data);

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, system-ui, sans-serif; max-width: 640px; margin: 0 auto; padding: 24px;">
      <h2 style="color: #191F28; font-size: 20px; margin-bottom: 16px;">📊 keepioo 주간 다이제스트</h2>
      <p style="font-size: 14px; color: #4E5968; line-height: 1.6;">
        지난 7일 운영 핵심 지표 + 사장님 검토 필요 항목.
      </p>

      <h3 style="color: #191F28; font-size: 15px; margin-top: 24px; margin-bottom: 12px;">📈 7일 누계</h3>
      <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
        <tr style="border-bottom: 1px solid #E5E8EB;">
          <td style="padding: 8px 0; color: #4E5968;">신규 가입</td>
          <td style="padding: 8px 0; text-align: right; font-weight: 600; color: #191F28;">${data.signups7d}명</td>
        </tr>
        <tr style="border-bottom: 1px solid #E5E8EB;">
          <td style="padding: 8px 0; color: #4E5968;">7일 활성 (signup+update)</td>
          <td style="padding: 8px 0; text-align: right; font-weight: 600; color: #191F28;">${data.active7d}명</td>
        </tr>
        <tr style="border-bottom: 1px solid #E5E8EB;">
          <td style="padding: 8px 0; color: #4E5968;">신규 정책 (welfare+loan+news)</td>
          <td style="padding: 8px 0; text-align: right; font-weight: 600; color: #191F28;">${data.newPolicies7d}건</td>
        </tr>
        <tr style="border-bottom: 1px solid #E5E8EB;">
          <td style="padding: 8px 0; color: #4E5968;">워드프레스 자동 발행</td>
          <td style="padding: 8px 0; text-align: right; font-weight: 600; color: #191F28;">${data.wordpressPublished7d}건</td>
        </tr>
      </table>

      <h3 style="color: #191F28; font-size: 15px; margin-top: 24px; margin-bottom: 12px;">🤖 자동 처리</h3>
      <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
        <tr style="border-bottom: 1px solid #E5E8EB;">
          <td style="padding: 8px 0; color: #4E5968;">광역 보도자료 자동 confirm</td>
          <td style="padding: 8px 0; text-align: right; font-weight: 600; color: #191F28;">${data.pressAutoConfirmed7d}건</td>
        </tr>
        <tr style="border-bottom: 1px solid #E5E8EB;">
          <td style="padding: 8px 0; color: #4E5968;">뉴스 자동 hide</td>
          <td style="padding: 8px 0; text-align: right; font-weight: 600; color: #191F28;">${data.newsAutoHidden7d}건</td>
        </tr>
        <tr style="border-bottom: 1px solid #E5E8EB;">
          <td style="padding: 8px 0; color: #4E5968;">중복 정책 자동 confirm</td>
          <td style="padding: 8px 0; text-align: right; font-weight: 600; color: #191F28;">${data.dedupeAutoConfirmed7d}건</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #2B8A3E; font-weight: 600;">≈ 사장님 절감 시간</td>
          <td style="padding: 8px 0; text-align: right; font-weight: 700; color: #2B8A3E;">${timeSavedMin}분</td>
        </tr>
      </table>

      <h3 style="color: #191F28; font-size: 15px; margin-top: 24px; margin-bottom: 12px;">🧠 AI 자동 등록 (주간)</h3>
      <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
        <tr style="border-bottom: 1px solid #E5E8EB;">
          <td style="padding: 8px 0; color: #4E5968;">자동 등록</td>
          <td style="padding: 8px 0; text-align: right; font-weight: 600; color: #191F28;">${data.weekAutoConfirm}건 <span style="color:#6B7684; font-weight:400;">(high ${data.weekHighCount} / mid ${data.weekMidCount})</span></td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #4E5968;">회수</td>
          <td style="padding: 8px 0; text-align: right; font-weight: 600; color: #191F28;">${data.weekAutoRevoke}건 — 회수율 ${data.weekRevokeRate}%</td>
        </tr>
      </table>
      ${
        data.weekMidRevokeRate > 5
          ? `
      <p style="margin-top: 12px; padding: 12px 16px; background: #FFF5F5; border-left: 3px solid #D93636; border-radius: 4px; font-size: 13px; color: #4E5968;">
        ⚠️ <strong style="color: #D93636;">mid 회수율 ${data.weekMidRevokeRate}% (>5%)</strong> — <code style="font-size: 12px; background: #F2F4F6; padding: 2px 6px; border-radius: 4px;">AUTO_CONFIRM_TIER_FLOOR=high</code> 안전 모드 전환 검토.
      </p>`
          : ""
      }

      ${
        data.dedupePending + data.naverBlogPending > 0
          ? `
      <h3 style="color: #D93636; font-size: 15px; margin-top: 24px; margin-bottom: 12px;">⏳ 사장님 검토 대기</h3>
      <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
        ${
          data.dedupePending > 0
            ? `
        <tr style="border-bottom: 1px solid #E5E8EB;">
          <td style="padding: 8px 0; color: #4E5968;">중복 정책 검토</td>
          <td style="padding: 8px 0; text-align: right; font-weight: 600; color: #D93636;">
            <a href="https://www.keepioo.com/admin/dedupe" style="color: #D93636; text-decoration: underline;">${data.dedupePending}건 →</a>
          </td>
        </tr>`
            : ""
        }
        ${
          data.naverBlogPending > 0
            ? `
        <tr>
          <td style="padding: 8px 0; color: #4E5968;">네이버 블로그 큐</td>
          <td style="padding: 8px 0; text-align: right; font-weight: 600; color: #D93636;">
            <a href="https://www.keepioo.com/admin/naver-blog" style="color: #D93636; text-decoration: underline;">${data.naverBlogPending}건 →</a>
          </td>
        </tr>`
            : ""
        }
      </table>`
          : `<p style="font-size: 14px; color: #2B8A3E; margin-top: 24px;">✅ 검토 대기 항목 없음 — 자동화 정상</p>`
      }

      ${
        data.cronFailures7d > 0
          ? `
      <p style="margin-top: 24px; padding: 12px 16px; background: #FFF5F5; border-left: 3px solid #D93636; border-radius: 4px; font-size: 13px; color: #4E5968;">
        ⚠️ 7일 cron 실패 ${data.cronFailures7d}건 발생.
        <a href="https://www.keepioo.com/admin/cron-failures" style="color: #D93636; font-weight: 600; text-decoration: underline;">확인 →</a>
      </p>`
          : ""
      }

      ${
        auditSample.length > 0
          ? `
      <h3 style="color: #191F28; font-size: 15px; margin-top: 24px; margin-bottom: 8px;">🔍 자동 처리 무작위 샘플 (안전망)</h3>
      <p style="font-size: 12px; color: #4E5968; margin: 0 0 12px;">
        지난 7일 자동 처리 중 무작위 ${auditSample.length}건. 오판단 조기 발견용 — 한 번 훑어보시고 이상하면 어드민에서 확인.
      </p>
      <ul style="font-size: 12px; color: #4E5968; line-height: 1.6; padding-left: 18px; margin: 0;">
        ${auditSample
          .map((s) => {
            const date = new Date(s.createdAt).toLocaleDateString("ko-KR", {
              timeZone: "Asia/Seoul",
              month: "2-digit",
              day: "2-digit",
            });
            const detailSnippet = JSON.stringify(s.details).slice(0, 80);
            return `<li><strong>${escapeHtml(s.action)}</strong> · ${date} · <code style="font-size: 11px; color: #6B7684;">${escapeHtml(detailSnippet)}</code></li>`;
          })
          .join("")}
      </ul>`
          : ""
      }

      <a href="https://www.keepioo.com/admin"
         style="display: inline-block; margin-top: 24px; padding: 12px 24px; background: #3182F6; color: #fff; text-decoration: none; border-radius: 12px; font-weight: 600;">
        /admin 종합 대시보드 →
      </a>
    </div>
  `;

  const text = [
    subject,
    "",
    "[7일 누계]",
    `신규 가입: ${data.signups7d}명`,
    `활성: ${data.active7d}명`,
    `신규 정책: ${data.newPolicies7d}건`,
    `워드프레스 발행: ${data.wordpressPublished7d}건`,
    "",
    "[자동 처리]",
    `보도자료 confirm: ${data.pressAutoConfirmed7d}건`,
    `뉴스 hide: ${data.newsAutoHidden7d}건`,
    `dedupe confirm: ${data.dedupeAutoConfirmed7d}건`,
    `≈ 절감 시간: ${timeSavedMin}분`,
    "",
    "[AI 자동 등록 (주간)]",
    `- 자동 등록 ${data.weekAutoConfirm}건 (high ${data.weekHighCount} / mid ${data.weekMidCount})`,
    `- 회수 ${data.weekAutoRevoke}건 — 회수율 ${data.weekRevokeRate}%`,
    ...(data.weekMidRevokeRate > 5
      ? [
          "",
          `[!] mid 회수율 ${data.weekMidRevokeRate}% (>5%) — AUTO_CONFIRM_TIER_FLOOR=high 검토`,
        ]
      : []),
    "",
    "[검토 대기]",
    `dedupe: ${data.dedupePending}건`,
    `네이버 블로그: ${data.naverBlogPending}건`,
    "",
    `cron 실패 7일: ${data.cronFailures7d}건`,
    "",
    "/admin → https://www.keepioo.com/admin",
  ].join("\n");

  return { subject, html, text };
}

// 이메일 본문 HTML 안에 admin_actions.details 삽입 — XSS 방어 (admin LLM 결과
// 가 들어올 수 있음).
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
