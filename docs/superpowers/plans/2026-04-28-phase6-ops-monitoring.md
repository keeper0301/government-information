# Phase 6 — 운영 모니터링 종합 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** keepioo.com 운영 모니터링 4 영역 한 묶음 — A 사고 조기 감지 cron + B 30일 추세 차트 + C cron 정밀화 + D /admin/health 종합 대시보드.

**Architecture:** lib/health-check.ts 가 헬스 신호·임계치 점검 통합 → cron `/api/cron/health-alert` 가 임계치 초과 시 Resend 이메일. lib/admin-trends.ts 가 30일 일별 count 쿼리 → SVG 자체 차트. /admin/health 가 모든 카드 통합 (기존 컴포넌트 재사용 + 신규 차트).

**Tech Stack:** Next.js 16, Vercel cron + CRON_SECRET, Resend (lib/email.ts), Supabase admin client, SVG (라이브러리 신규 X)

**Spec:** `docs/superpowers/specs/2026-04-28-phase6-ops-monitoring-design.md`

---

## File Structure

| 파일 | 변경 종류 | 책임 |
|---|---|---|
| `lib/health-check.ts` | create | 헬스 신호 4 카드 + 임계치 점검 (Section 1·4 공유) |
| `lib/email.ts` | modify | sendHealthAlertEmail 함수 추가 |
| `app/api/cron/health-alert/route.ts` | create | 매일 09:00 KST cron (Section 1) |
| `vercel.json` | modify | health-alert cron 1개 추가 |
| `lib/admin-trends.ts` | create | 30일 일별 count 쿼리 3종 (Section 2) |
| `components/admin/trend-charts.tsx` | create | SVG bar/line 차트 컴포넌트 (Section 2) |
| `lib/cron-alert-threshold.ts` | create | 환경변수 기반 임계치 helper (Section 3) — 기존 hard-coded 위치 적용 |
| `app/api/admin/cron-retry/route.ts` | create | 수동 cron 재실행 API (Section 3) |
| `app/admin/cron-failures/page.tsx` | modify | retry 버튼 추가 (Section 3) |
| `app/admin/health/page.tsx` | create | 통합 대시보드 (Section 4) |
| `app/admin/page.tsx` | modify | "/admin/health 보기" CTA 카드 추가 (Section 4) |

총 ~11 파일.

---

## Task 1: lib/health-check.ts (헬스 신호 + 임계치 점검)

**Files:** `lib/health-check.ts` (신규)

- [ ] **Step 1.1: 파일 생성**

```ts
// lib/health-check.ts
// Phase 6 — 운영 모니터링 헬스 신호 + 임계치 점검 helper.
// 사용처:
//   - app/api/cron/health-alert/route.ts (매일 09:00 KST 임계치 점검 → 이메일)
//   - app/admin/health/page.tsx (실시간 헬스 신호 4 카드 표시)

import { createAdminClient } from "@/lib/supabase/admin";

export type HealthSignals = {
  // 24h 신규 가입 수
  signups24h: number;
  // 7d 활성 사용자 수 (last_sign_in_at >= 7d ago)
  active7d: number;
  // 24h 결제 실패 (subscriptions.status = 'past_due' 24h 신규 또는 cancelled_at 있음)
  failed24h: number;
  // 24h cron 실패 알림 건수 (cron_failure_log notified_at)
  cronFailures24h: number;
  // 24h 알림 발송 실패 (alert_deliveries status = 'failed')
  deliveryFailures24h: number;
};

export type ThresholdAlert = {
  key: "low_activity" | "payment_fail" | "cron_fail";
  message: string;
};

const CRON_FAIL_ALERT_THRESHOLD = Number(
  process.env.CRON_FAIL_ALERT_THRESHOLD ?? "3",
);
const ACTIVE_7D_FLOOR = 5;

export async function getHealthSignals(): Promise<HealthSignals> {
  const sb = createAdminClient();
  const since24Iso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const since7dIso = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // auth.users 신규 가입 (24h) — admin api 사용
  const { data: usersResp } = await sb.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  const allUsers = usersResp?.users ?? [];
  const signups24h = allUsers.filter(
    (u) => u.created_at && u.created_at >= since24Iso,
  ).length;
  const active7d = allUsers.filter(
    (u) => u.last_sign_in_at && u.last_sign_in_at >= since7dIso,
  ).length;

  // 결제 실패 — subscriptions cancelled_at 24h
  const { count: cancelled } = await sb
    .from("subscriptions")
    .select("*", { count: "exact", head: true })
    .gte("cancelled_at", since24Iso);
  const failed24h = cancelled ?? 0;

  // cron 실패 알림 24h (notified_at — 신규 알림 발송된 것)
  const { count: cronCount } = await sb
    .from("cron_failure_log")
    .select("*", { count: "exact", head: true })
    .gte("notified_at", since24Iso);
  const cronFailures24h = cronCount ?? 0;

  // alert_deliveries 실패 24h
  const { count: delCount } = await sb
    .from("alert_deliveries")
    .select("*", { count: "exact", head: true })
    .eq("status", "failed")
    .gte("created_at", since24Iso);
  const deliveryFailures24h = delCount ?? 0;

  return {
    signups24h,
    active7d,
    failed24h,
    cronFailures24h,
    deliveryFailures24h,
  };
}

// 임계치 점검 — health-alert cron 이 호출, 위반 항목만 반환
export function checkThresholds(s: HealthSignals): ThresholdAlert[] {
  const alerts: ThresholdAlert[] = [];

  // 가입 활성도 — 둘 다 충족만 알림 (false positive 방지)
  if (s.signups24h === 0 && s.active7d < ACTIVE_7D_FLOOR) {
    alerts.push({
      key: "low_activity",
      message: `24h 신규 가입 0 + 7d 활성 ${s.active7d}명 (< ${ACTIVE_7D_FLOOR}). 가입 funnel 점검 필요.`,
    });
  }

  // 결제 실패
  if (s.failed24h >= 1) {
    alerts.push({
      key: "payment_fail",
      message: `24h 사용자 해지 ${s.failed24h}건. /admin/insights 확인.`,
    });
  }

  // cron 실패 (환경변수 임계치)
  if (s.cronFailures24h >= CRON_FAIL_ALERT_THRESHOLD) {
    alerts.push({
      key: "cron_fail",
      message: `24h cron 실패 알림 ${s.cronFailures24h}건 (임계치 ${CRON_FAIL_ALERT_THRESHOLD}). /admin/cron-failures 확인.`,
    });
  }

  return alerts;
}
```

- [ ] **Step 1.2: 타입 체크 + 커밋**

```bash
bunx tsc --noEmit 2>&1 | tail -5
git add lib/health-check.ts
git commit -m "feat(health-check): 헬스 신호 + 임계치 점검 helper (Phase 6)"
```

---

## Task 2: lib/email.ts 에 sendHealthAlertEmail + cron + vercel.json

**Files:** `lib/email.ts`, `app/api/cron/health-alert/route.ts`, `vercel.json`

- [ ] **Step 2.1: lib/email.ts 끝에 sendHealthAlertEmail 추가**

```ts
// lib/email.ts 끝에 추가
import type { ThresholdAlert } from "@/lib/health-check";

const HEALTH_ALERT_TO = "keeper0301@gmail.com"; // 사장님 이메일

export async function sendHealthAlertEmail(
  alerts: ThresholdAlert[],
  totalSignals: { signups24h: number; active7d: number; cronFailures24h: number },
): Promise<{ ok: boolean; error?: string }> {
  if (alerts.length === 0) return { ok: true };

  const resend = getResend();
  const subject = `[keepioo 운영] ${alerts.length}건 임계치 초과`;
  const bodyLines = alerts.map((a) => `- ${a.message}`).join("\n");
  const html = `
    <h2>운영 임계치 ${alerts.length}건 초과</h2>
    <ul>${alerts.map((a) => `<li>${escapeHtml(a.message)}</li>`).join("")}</ul>
    <p style="margin-top:16px;">현재 신호: 24h 가입 ${totalSignals.signups24h} / 7d 활성 ${totalSignals.active7d} / 24h cron 실패 ${totalSignals.cronFailures24h}</p>
    <p><a href="https://www.keepioo.com/admin/health">/admin/health 종합 대시보드 →</a></p>
  `;

  const { error } = await resend.emails.send({
    from: FROM_ADDRESS,
    to: HEALTH_ALERT_TO,
    subject,
    html,
    text: `${subject}\n\n${bodyLines}\n\n/admin/health 확인 → https://www.keepioo.com/admin/health`,
  });

  return error
    ? { ok: false, error: error.message }
    : { ok: true };
}
```

(`escapeHtml` 은 lib/email.ts 안에 이미 있는 helper 재사용. 없으면 inline 추가)

- [ ] **Step 2.2: app/api/cron/health-alert/route.ts 작성**

```ts
// app/api/cron/health-alert/route.ts
// Phase 6 — 매일 09:00 KST 임계치 점검 cron.
// 위반 항목 ≥ 1 면 사장님 이메일 발송 (사고 조기 감지).

import { NextResponse } from "next/server";
import { getHealthSignals, checkThresholds } from "@/lib/health-check";
import { sendHealthAlertEmail } from "@/lib/email";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

async function authorize(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json(
      { error: "CRON_SECRET not configured" },
      { status: 500 },
    );
  }
  if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return null;
}

export async function GET(request: Request) {
  const denied = await authorize(request);
  if (denied) return denied;

  const signals = await getHealthSignals();
  const alerts = checkThresholds(signals);

  if (alerts.length === 0) {
    return NextResponse.json({
      ok: true,
      sent: false,
      signals,
      message: "임계치 정상",
    });
  }

  const result = await sendHealthAlertEmail(alerts, {
    signups24h: signals.signups24h,
    active7d: signals.active7d,
    cronFailures24h: signals.cronFailures24h,
  });

  return NextResponse.json({
    ok: result.ok,
    sent: result.ok,
    alerts,
    signals,
    error: result.error,
  });
}

// POST 도 같은 동작 (수동 trigger 편의)
export async function POST(request: Request) {
  return GET(request);
}
```

- [ ] **Step 2.3: vercel.json 에 cron 등록**

기존 `crons` 배열 끝에 추가:

```json
{ "path": "/api/cron/health-alert", "schedule": "0 0 * * *" }
```

(0 0 UTC = 09:00 KST)

- [ ] **Step 2.4: 빌드 + 커밋**

```bash
bunx tsc --noEmit 2>&1 | tail -5
bun run build 2>&1 | tail -5
git add lib/email.ts app/api/cron/health-alert/route.ts vercel.json
git commit -m "feat(cron): /api/cron/health-alert — 매일 09:00 KST 임계치 점검 + 사장님 이메일"
```

---

## Task 3: lib/admin-trends.ts (30일 일별 count)

**Files:** `lib/admin-trends.ts` (신규)

- [ ] **Step 3.1: 파일 생성**

```ts
// lib/admin-trends.ts
// Phase 6 — /admin/health 의 30일 추세 차트 데이터 쿼리.
// 모든 결과는 30일 fill-zero 처리 (값 없는 날도 0 표시 → 차트 빈 칸 X)

import { createAdminClient } from "@/lib/supabase/admin";

export type DailyPoint = {
  date: string; // YYYY-MM-DD (KST 기준)
  value: number;
};

export type AdminTrends = {
  dau: DailyPoint[];
  subscriptionsNew: DailyPoint[];
  subscriptionsCancelled: DailyPoint[];
  blogPublished: DailyPoint[];
  newsCollected: DailyPoint[];
};

const DAYS = 30;

// 30일 KST 일자 array (오늘 → 30일 전, 오름차순)
function buildDateAxis(): string[] {
  const arr: string[] = [];
  const now = new Date();
  // KST 기준 일자 계산 (UTC+9)
  for (let i = DAYS - 1; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
    arr.push(kst.toISOString().slice(0, 10));
  }
  return arr;
}

// 일자별 row count 를 DailyPoint[] 로 변환 (fill-zero)
function fillZero(rows: { date: string; cnt: number }[]): DailyPoint[] {
  const axis = buildDateAxis();
  const map = new Map(rows.map((r) => [r.date, r.cnt]));
  return axis.map((date) => ({ date, value: map.get(date) ?? 0 }));
}

export async function getAdminTrends(): Promise<AdminTrends> {
  const sb = createAdminClient();
  const since30Iso = new Date(
    Date.now() - DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  // DAU — auth.users.last_sign_in_at 일별 distinct
  const { data: usersResp } = await sb.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  const dauRows = (usersResp?.users ?? [])
    .filter((u) => u.last_sign_in_at && u.last_sign_in_at >= since30Iso)
    .reduce<Map<string, Set<string>>>((acc, u) => {
      const d = new Date(u.last_sign_in_at!);
      const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
      const date = kst.toISOString().slice(0, 10);
      const set = acc.get(date) ?? new Set();
      set.add(u.id);
      acc.set(date, set);
      return acc;
    }, new Map());
  const dau = fillZero(
    Array.from(dauRows.entries()).map(([date, set]) => ({
      date,
      cnt: set.size,
    })),
  );

  // 병렬 쿼리 — subscriptions·blog·news
  const [subsNew, subsCancelled, blog, news] = await Promise.all([
    sb
      .from("subscriptions")
      .select("created_at")
      .gte("created_at", since30Iso),
    sb
      .from("subscriptions")
      .select("cancelled_at")
      .gte("cancelled_at", since30Iso)
      .not("cancelled_at", "is", null),
    sb
      .from("blog_posts")
      .select("published_at")
      .gte("published_at", since30Iso)
      .not("published_at", "is", null),
    sb
      .from("news_posts")
      .select("created_at")
      .gte("created_at", since30Iso),
  ]);

  function bucketByDate(
    rows: { [key: string]: string | null }[] | null,
    field: string,
  ): { date: string; cnt: number }[] {
    if (!rows) return [];
    const m = new Map<string, number>();
    for (const r of rows) {
      const v = r[field];
      if (!v) continue;
      const d = new Date(v);
      const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
      const date = kst.toISOString().slice(0, 10);
      m.set(date, (m.get(date) ?? 0) + 1);
    }
    return Array.from(m.entries()).map(([date, cnt]) => ({ date, cnt }));
  }

  return {
    dau,
    subscriptionsNew: fillZero(bucketByDate(subsNew.data, "created_at")),
    subscriptionsCancelled: fillZero(bucketByDate(subsCancelled.data, "cancelled_at")),
    blogPublished: fillZero(bucketByDate(blog.data, "published_at")),
    newsCollected: fillZero(bucketByDate(news.data, "created_at")),
  };
}
```

- [ ] **Step 3.2: 타입 체크 + 커밋 (Task 4 와 함께)**

```bash
bunx tsc --noEmit 2>&1 | tail -5
```

---

## Task 4: components/admin/trend-charts.tsx (SVG 차트)

**Files:** `components/admin/trend-charts.tsx` (신규)

- [ ] **Step 4.1: 파일 생성**

```tsx
// components/admin/trend-charts.tsx
// Phase 6 — /admin/health 의 30일 추세 SVG 차트.
// 라이브러리 신규 X, 단순 SVG bar/line — 가벼움 (Phase 1 성능 보존).

import type { DailyPoint } from "@/lib/admin-trends";

// ============================================================
// SimpleBarChart — 단일 또는 다중 시리즈 bar
// ============================================================
type BarSeries = {
  label: string;
  color: string; // tailwind class (fill-blue-400 등) 또는 hex
  data: DailyPoint[];
};

export function SimpleBarChart({
  title,
  series,
}: {
  title: string;
  series: BarSeries[];
}) {
  if (series.length === 0 || series[0].data.length === 0) {
    return (
      <div className="text-[12px] text-grey-500">
        데이터 없음 (30일 모두 0)
      </div>
    );
  }
  const days = series[0].data.length;
  const max = Math.max(
    1,
    ...series.flatMap((s) => s.data.map((d) => d.value)),
  );
  const barWidth = 100 / days;
  const chartHeight = 80;

  return (
    <section>
      <div className="flex items-baseline justify-between mb-2">
        <h3 className="text-[14px] font-semibold text-grey-800">{title}</h3>
        <div className="flex gap-3 text-[11px] text-grey-600">
          {series.map((s) => (
            <span key={s.label} className="inline-flex items-center gap-1">
              <span
                className="w-2 h-2 rounded-sm"
                style={{
                  background: s.color.startsWith("#") ? s.color : undefined,
                }}
              />
              {s.label}
            </span>
          ))}
        </div>
      </div>
      <svg
        viewBox={`0 0 100 ${chartHeight}`}
        className="w-full h-20 bg-grey-50 rounded"
        preserveAspectRatio="none"
      >
        {series.map((s, sIdx) =>
          s.data.map((d, i) => (
            <rect
              key={`${sIdx}-${d.date}`}
              x={i * barWidth + sIdx * (barWidth / series.length)}
              y={chartHeight - (d.value / max) * chartHeight}
              width={barWidth / series.length - 0.2}
              height={(d.value / max) * chartHeight}
              fill={s.color}
            />
          )),
        )}
      </svg>
      <div className="flex justify-between text-[10px] text-grey-500 mt-1">
        <span>{series[0].data[0]?.date.slice(5)}</span>
        <span>최대 {max.toLocaleString()}</span>
        <span>{series[0].data[series[0].data.length - 1]?.date.slice(5)}</span>
      </div>
    </section>
  );
}

// ============================================================
// SimpleLineChart — 단일 series line (DAU 용)
// ============================================================
export function SimpleLineChart({
  title,
  data,
  color = "#3182F6",
}: {
  title: string;
  data: DailyPoint[];
  color?: string;
}) {
  if (data.length === 0) {
    return <div className="text-[12px] text-grey-500">데이터 없음</div>;
  }
  const max = Math.max(1, ...data.map((d) => d.value));
  const chartHeight = 80;
  const points = data
    .map((d, i) => {
      const x = (i / (data.length - 1)) * 100;
      const y = chartHeight - (d.value / max) * chartHeight;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <section>
      <div className="flex items-baseline justify-between mb-2">
        <h3 className="text-[14px] font-semibold text-grey-800">{title}</h3>
        <span className="text-[11px] text-grey-600">최대 {max}</span>
      </div>
      <svg
        viewBox={`0 0 100 ${chartHeight}`}
        className="w-full h-20 bg-grey-50 rounded"
        preserveAspectRatio="none"
      >
        <polyline
          points={points}
          fill="none"
          stroke={color}
          strokeWidth="1.5"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <div className="flex justify-between text-[10px] text-grey-500 mt-1">
        <span>{data[0]?.date.slice(5)}</span>
        <span>{data[data.length - 1]?.date.slice(5)}</span>
      </div>
    </section>
  );
}
```

- [ ] **Step 4.2: Task 3+4 한 commit**

```bash
bunx tsc --noEmit 2>&1 | tail -5
git add lib/admin-trends.ts components/admin/trend-charts.tsx
git commit -m "feat(admin): 30일 추세 데이터 + SVG 차트 컴포넌트 (Phase 6)"
```

---

## Task 5: cron retry endpoint + 버튼

**Files:**
- `app/api/admin/cron-retry/route.ts` (신규)
- `app/admin/cron-failures/page.tsx` (수정 — retry 버튼 추가)

### 5.1 — retry endpoint

- [ ] **Step 5.1.1: 신규 파일**

```ts
// app/api/admin/cron-retry/route.ts
// Phase 6 — admin 본인이 실패한 cron 을 즉시 재실행하는 server-side endpoint.
// /admin/cron-failures 의 retry 버튼이 호출.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isAdminUser } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

// 실행 가능한 cron path 화이트리스트 — 임의 path 호출 차단.
const ALLOWED_PATHS = new Set<string>([
  "/api/collect-news",
  "/api/cron/health-alert",
  "/api/alert-dispatch",
  "/api/cleanup",
  "/api/finalize-deletions",
  "/api/enrich",
  "/api/billing/charge",
]);

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !isAdminUser(user.email)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as {
    cronPath?: string;
  } | null;
  const cronPath = body?.cronPath;
  if (!cronPath || !ALLOWED_PATHS.has(cronPath)) {
    return NextResponse.json(
      { error: `invalid cronPath: ${cronPath}` },
      { status: 400 },
    );
  }

  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json(
      { error: "CRON_SECRET not configured" },
      { status: 500 },
    );
  }

  // internal fetch — same-origin, server side
  const url = new URL(cronPath, request.url);
  const start = Date.now();
  let res: Response;
  try {
    res = await fetch(url.toString(), {
      method: "GET",
      headers: { Authorization: `Bearer ${cronSecret}` },
    });
  } catch (err) {
    return NextResponse.json(
      { error: `fetch error: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 },
    );
  }
  const elapsedMs = Date.now() - start;
  const data = await res.json().catch(() => null);

  return NextResponse.json({
    ok: res.ok,
    status: res.status,
    elapsedMs,
    cronPath,
    data,
  });
}
```

### 5.2 — /admin/cron-failures retry 버튼

- [ ] **Step 5.2.1: page.tsx 의 prefix 카드에 retry 버튼 추가**

```bash
grep -n 'prefix\|jobName\|/api/' app/admin/cron-failures/page.tsx | head -10
```

(파일 read 후 prefix 그룹 카드 위치에 client component import + 버튼 추가)

신규 client component `app/admin/cron-failures/retry-button.tsx`:

```tsx
"use client";

import { useState } from "react";

const PREFIX_TO_PATH: Record<string, string> = {
  collect: "/api/collect-news",
  enrich: "/api/enrich",
  alert: "/api/alert-dispatch",
  finalize: "/api/finalize-deletions",
  cleanup: "/api/cleanup",
  billing: "/api/billing/charge",
  health: "/api/cron/health-alert",
};

export function CronRetryButton({ prefix }: { prefix: string }) {
  const [state, setState] = useState<"idle" | "running" | "ok" | "fail">("idle");
  const [msg, setMsg] = useState<string>("");

  const cronPath = PREFIX_TO_PATH[prefix];
  if (!cronPath) return null; // 알려진 prefix 만 버튼 노출

  async function retry() {
    setState("running");
    try {
      const res = await fetch("/api/admin/cron-retry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cronPath }),
      });
      const data = await res.json();
      if (data.ok) {
        setState("ok");
        setMsg(`재실행 완료 (${data.elapsedMs}ms)`);
      } else {
        setState("fail");
        setMsg(data.error || `실패 ${data.status}`);
      }
    } catch (err) {
      setState("fail");
      setMsg(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={retry}
        disabled={state === "running"}
        className="px-3 py-1.5 text-[12px] font-semibold rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 cursor-pointer border-none disabled:opacity-50"
      >
        {state === "running" ? "실행 중..." : "재실행"}
      </button>
      {msg && (
        <span
          className={`text-[11px] ${state === "ok" ? "text-green-700" : "text-red-700"}`}
        >
          {msg}
        </span>
      )}
    </div>
  );
}
```

- [ ] **Step 5.2.2: cron-failures page.tsx 수정**

각 prefix 카드 헤더에 `<CronRetryButton prefix={prefix} />` 추가.

(실제 페이지 구조 read 후 정확한 JSX 위치에 삽입)

- [ ] **Step 5.2.3: 빌드 + 커밋**

```bash
bunx tsc --noEmit 2>&1 | tail -5
git add app/api/admin/cron-retry/route.ts app/admin/cron-failures/retry-button.tsx app/admin/cron-failures/page.tsx
git commit -m "feat(admin): cron 수동 재실행 버튼 + endpoint (whitelist 7 path)"
```

---

## Task 6: /admin/health 종합 대시보드

**Files:**
- `app/admin/health/page.tsx` (신규)
- `app/admin/page.tsx` (수정 — CTA 카드)

### 6.1 — /admin/health 페이지

- [ ] **Step 6.1.1: 파일 생성**

```tsx
// app/admin/health/page.tsx
// Phase 6 — 운영 한 페이지. 헬스 신호·24h 지표·추세·funnel·cron·로그 통합.

import { redirect } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { isAdminUser } from "@/lib/admin-auth";
import { getHealthSignals, checkThresholds } from "@/lib/health-check";
import { getAdminTrends } from "@/lib/admin-trends";
import { SimpleBarChart, SimpleLineChart } from "@/components/admin/trend-charts";

export const metadata: Metadata = {
  title: "운영 health | 어드민",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/admin/health");
  if (!isAdminUser(user.email)) redirect("/");
  return user;
}

export default async function AdminHealthPage() {
  await requireAdmin();
  const [signals, trends] = await Promise.all([
    getHealthSignals(),
    getAdminTrends(),
  ]);
  const alerts = checkThresholds(signals);

  return (
    <main className="min-h-screen bg-grey-50 pt-[80px] pb-20">
      <div className="max-w-[980px] mx-auto px-5">
        <div className="mb-8">
          <p className="text-[12px] text-blue-500 font-semibold tracking-[0.2em] mb-3">
            ADMIN · HEALTH
          </p>
          <h1 className="text-[26px] font-extrabold tracking-[-0.6px] text-grey-900 mb-2">
            운영 종합 대시보드
          </h1>
          <p className="text-[14px] text-grey-700 leading-[1.6]">
            매일 1회 점검 — 헬스 신호·24h 지표·30일 추세·funnel·cron·본인 로그.
          </p>
        </div>

        {/* 임계치 알림 — 위반 시 빨간 배너 */}
        {alerts.length > 0 && (
          <section className="mb-6 bg-red-50 border border-red-200 rounded-2xl p-5">
            <h2 className="text-[15px] font-bold text-red-900 mb-3">
              ⚠️ 임계치 {alerts.length}건 초과
            </h2>
            <ul className="text-[13px] text-red-800 space-y-1">
              {alerts.map((a) => (
                <li key={a.key}>• {a.message}</li>
              ))}
            </ul>
          </section>
        )}

        {/* 헬스 신호 4 카드 */}
        <h2 className="text-[16px] font-bold text-grey-900 mb-3">
          🩺 헬스 신호 (실시간)
        </h2>
        <section className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
          <Card label="24h 신규 가입" value={signals.signups24h} />
          <Card label="7d 활성 사용자" value={signals.active7d} />
          <Card
            label="24h cron 실패 알림"
            value={signals.cronFailures24h}
            tone={signals.cronFailures24h >= 3 ? "warn" : "default"}
          />
          <Card
            label="24h 알림 발송 실패"
            value={signals.deliveryFailures24h}
            tone={signals.deliveryFailures24h >= 1 ? "warn" : "default"}
          />
        </section>

        {/* 30일 추세 차트 */}
        <h2 className="text-[16px] font-bold text-grey-900 mb-3">
          📈 30일 추세
        </h2>
        <section className="grid gap-5 md:grid-cols-2 mb-8">
          <div className="bg-white rounded-2xl border border-grey-100 p-4">
            <SimpleLineChart title="DAU (일별 로그인)" data={trends.dau} />
          </div>
          <div className="bg-white rounded-2xl border border-grey-100 p-4">
            <SimpleBarChart
              title="구독 신규 / 취소"
              series={[
                { label: "신규", color: "#3182F6", data: trends.subscriptionsNew },
                { label: "취소", color: "#F04452", data: trends.subscriptionsCancelled },
              ]}
            />
          </div>
          <div className="bg-white rounded-2xl border border-grey-100 p-4">
            <SimpleBarChart
              title="블로그 발행"
              series={[
                { label: "blog", color: "#03B26C", data: trends.blogPublished },
              ]}
            />
          </div>
          <div className="bg-white rounded-2xl border border-grey-100 p-4">
            <SimpleBarChart
              title="뉴스 수집"
              series={[
                { label: "news", color: "#A234C7", data: trends.newsCollected },
              ]}
            />
          </div>
        </section>

        {/* 빠른 링크 */}
        <h2 className="text-[16px] font-bold text-grey-900 mb-3">🔗 빠른 링크</h2>
        <section className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-8">
          <QuickLink href="/admin" label="24h 지표 (admin 메인)" />
          <QuickLink href="/admin/insights" label="cohort funnel + 결제 신호" />
          <QuickLink href="/admin/cron-failures" label="cron 실패 + 재실행" />
          <QuickLink href="/admin/alimtalk" label="알림톡 로그" />
          <QuickLink href="/admin/my-actions" label="본인 행동 로그" />
          <QuickLink href="/admin/cron-trigger" label="cron 수동 trigger" />
        </section>

        <p className="mt-10 text-[13px]">
          <Link href="/admin" className="text-blue-500 font-medium underline">
            ← 어드민 홈
          </Link>
        </p>
      </div>
    </main>
  );
}

function Card({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: "default" | "warn";
}) {
  const valueColor = tone === "warn" ? "text-orange" : "text-grey-900";
  return (
    <div className="bg-white rounded-2xl border border-grey-100 p-4">
      <dt className="text-[12px] text-grey-500">{label}</dt>
      <dd className={`text-[24px] font-extrabold tabular-nums mt-1 ${valueColor}`}>
        {value.toLocaleString()}
      </dd>
    </div>
  );
}

function QuickLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="block bg-white rounded-xl border border-grey-100 px-4 py-3 text-[13px] text-grey-800 hover:border-blue-300 hover:bg-blue-50 no-underline transition-colors"
    >
      {label} →
    </Link>
  );
}
```

### 6.2 — /admin 메인 CTA 카드

- [ ] **Step 6.2.1: app/admin/page.tsx 의 첫 섹션에 CTA 카드 추가**

```bash
grep -n 'KPI 지표 카드\|24h\|<section' app/admin/page.tsx | head -5
```

(파일 read 후 적정 위치에 다음 카드 추가)

```tsx
{/* Phase 6 — 운영 종합 대시보드 CTA */}
<Link
  href="/admin/health"
  className="block bg-blue-50 border border-blue-200 rounded-2xl p-5 mb-6 hover:bg-blue-100 no-underline transition-colors"
>
  <p className="text-[12px] text-blue-700 font-semibold mb-1">PHASE 6 NEW</p>
  <h2 className="text-[18px] font-bold text-blue-900 mb-1">
    🩺 운영 health 종합 대시보드 →
  </h2>
  <p className="text-[13px] text-blue-800">
    헬스 신호·30일 추세·funnel·cron·로그 한 페이지에서.
  </p>
</Link>
```

- [ ] **Step 6.2.2: 빌드 + 커밋**

```bash
bunx tsc --noEmit 2>&1 | tail -5
bun run build 2>&1 | tail -5
git add app/admin/health/page.tsx app/admin/page.tsx
git commit -m "feat(admin): /admin/health 종합 대시보드 + 메인 CTA (Phase 6)"
```

---

## Task 7: 종합 검증 + push

- [ ] **Step 7.1: chrome 검증 (사장님 또는 playwright)**

- /admin/health → 페이지 정상 노출 (헬스 카드·차트·빠른 링크)
- /admin → CTA 카드 보임
- /admin/cron-failures → "재실행" 버튼 클릭 → 응답 토스트
- 콘솔 에러 0

- [ ] **Step 7.2: cron health-alert 수동 trigger 검증 (선택)**

```bash
curl -X POST https://www.keepioo.com/api/cron/health-alert \
  -H "Authorization: Bearer $CRON_SECRET"
```

응답:
- `{ ok: true, sent: false, signals, message: "임계치 정상" }` (정상 시)
- `{ ok: true, sent: true, alerts: [...], signals }` (임계치 초과 시 — 사장님 이메일 발송)

- [ ] **Step 7.3: push (사장님 명시 후)**

```bash
git push origin master
```

- [ ] **Step 7.4: 메모리 갱신**

`project_keepioo_phase6_ops_monitoring_2026_04_28.md` 신설 + MEMORY.md 인덱스 추가:
- 변경 영역 (~11 파일)
- vercel.json health-alert cron 등록 확인
- 사장님 외부 액션 (필요 시 CRON_FAIL_ALERT_THRESHOLD 환경변수)
- **6 phase 모두 완료** 표시

---

## Self-Review

### 1. Spec 커버리지

| Spec section | Plan task | 커버 |
|---|---|---|
| Section 1 사고 조기 감지 | Task 1·2 | ✅ |
| Section 2 30일 추세 차트 | Task 3·4 | ✅ |
| Section 3 cron 정밀화 (임계치 환경변수 + retry) | Task 1 (CRON_FAIL_ALERT_THRESHOLD) + Task 5 (retry) | ✅ |
| Section 4 /admin/health | Task 6 | ✅ |
| 검증 | Task 7 | ✅ |

### 2. 회귀 가드
- 각 task 후 typecheck (Step 1.2·2.4·3.2·4.2·5.2.3·6.2.2)
- 빌드 체크 (Step 2.4·6.2.2)
- chrome 검증 (Step 7.1)

### 3. Type 일관성
- `HealthSignals`·`ThresholdAlert` — Task 1 정의, Task 2·6 사용
- `DailyPoint`·`AdminTrends` — Task 3 정의, Task 4·6 사용
- cron path 화이트리스트 7개 — Task 5 정의 일관

### 4. 위험 요소

- **CRON_FAIL_ALERT_THRESHOLD 환경변수 미설정** — default 3 으로 fallback 안전
- **listUsers 1000 over** — 사장님 사이트 누적 사용자 적어 안전 (메모리 기준 활성 7d 3명)
- **retry endpoint 화이트리스트 누락 cron** — ALLOWED_PATHS 에 추가
- **차트 데이터 0 모두** — `<div>데이터 없음</div>` fallback

---

## 진행 후 보고

각 task 완료 후 짧게:
```
✅ Task N 완료
- 변경: <파일>, 커밋: <hash>
- typecheck/build 통과
```

전체 완료 시:
```
✅ Phase 6 완료 = 6 phase 마무리
- N commits push
- /admin/health 정상 노출
- health-alert cron 등록 (매일 09:00 KST)
- 다음: 사장님 운영 routine + 다음 큰 phase 결정
```
