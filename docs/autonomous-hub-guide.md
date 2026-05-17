# autonomous hub 구조 + 카드 추가 가이드 (5/17)

`/admin/autonomous` 페이지의 6 카테고리 + 카드 매핑 + 신규 카드 추가 패턴.
사장님 매일 1번 hub 확인 = 평시 0분 운영 모드 visibility 보장.

## 6 카테고리 (5/17 grouping)

| 순서 | 카테고리 | 포함 카드 | 사장님 액션 |
|---|---|---|---|
| 1 | 🎯 오늘 반영할 개선 과제 | ImprovementPanel | 권장 fix 1줄 확인 |
| 2 | 💰 수익 · 비용 | RevenueChart, GeminiSpending | 매출 추세 + 비용 monitoring |
| 3 | 📈 사용자 가치 | ClickStats, PopularityTrend | 클릭·인기 추세 |
| 4 | 📝 콘텐츠 발행 | BlogPublish, SnsPublish | 발행 가동 상태 |
| 5 | 🗞️ 데이터 수집 | LocalPress, PressIngestTier | 20 시·군 + tier 튜닝 |
| 6 | ⚙️ Phase 가동 + 외부 액션 | PendingActions, 5 PhaseCard | 외부 액션 대기 사항 |

순서 = 사장님 행동 우선순위 (개선 → 수익 → 사용자 → 콘텐츠 → 데이터 → Phase).

## 카드 추가 패턴 (10분)

### 1단계 — 데이터 helper 작성 (5분)

`lib/analytics/{topic}-stats.ts` 신규. 기존 helper 참조:
- `local-press-stats.ts` (admin_actions audit 집계)
- `gemini-spending.ts` (admin_actions 비용 누적)
- `blog-publish-stats.ts` (DB 직접 + status 분류)
- `press-ingest-tier-stats.ts` (다수 쿼리 + recommendation)

타입 정의 + getXxxStats() server function. SSR server component 에서 호출.

### 2단계 — 카드 컴포넌트 (5분)

`app/admin/autonomous/_components/{topic}-card.tsx` 신규. 200줄 룰.

표준 구조:
```tsx
import Link from "next/link";
import type { TopicStats } from "@/lib/analytics/{topic}-stats";

export function TopicCard({ stats }: { stats: TopicStats }) {
  return (
    <section className="mb-4 rounded-xl border border-slate-200 bg-white p-5">
      <header className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            {emoji} 카드 제목
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">짧은 설명</p>
        </div>
        <Link href="/admin/관련-페이지" className="text-xs text-blue-600 hover:text-blue-800 underline">
          deep dive ↗
        </Link>
      </header>
      {/* 3~4 metric grid */}
      {/* status 색깔 카드 + recommendation */}
    </section>
  );
}
```

색깔 컨벤션 (tailwind):
- emerald (정상): `bg-emerald-50 border-emerald-200 text-emerald-900`
- amber (관찰): `bg-amber-50 border-amber-200 text-amber-900`
- red (사고): `bg-red-50 border-red-200 text-red-900`
- slate (유휴/일반): `bg-slate-50 border-slate-200 text-slate-700`
- blue (정보): `bg-blue-50 border-blue-200 text-blue-800`

### 3단계 — page.tsx mount

`app/admin/autonomous/page.tsx`:

1. import 추가
2. Promise.all 에 `getXxxStats()` 추가
3. 적절한 카테고리 SectionHeader 다음 mount

```tsx
import { getXxxStats } from "@/lib/analytics/xxx-stats";
import { XxxCard } from "./_components/xxx-card";

// Promise.all 추가
const [..., xxxStats] = await Promise.all([..., getXxxStats()]);

// 카테고리 안에 mount
<SectionHeader title="📝 콘텐츠 발행" />
<BlogPublishCard stats={blogPublishStats} />
<XxxCard stats={xxxStats} />  ← 추가
```

## 능동 알림 격상 (선택)

카드의 status=stalled/warn 같은 사고 시그널을 능동 SMS+텔레그램 발화로 격상.
패턴:

1. `lib/health-check.ts` 의 `HealthSignals` 에 신규 field 추가
2. `getHealthSignals()` 에서 `getXxxStats()` 호출 후 핵심 metric 추출
3. `ThresholdAlert key` union 에 신규 key 추가
4. ENV `XXX_FLOOR` (1분 toggle)
5. `checkThresholds()` 에 alert push + recommendation
6. `__tests__/lib/health-check.test.ts` baseline + 3 case 추가

예: BlogPublishCard 의 `status='stalled'` → `blog_publish_stalled` health-alert (commit b3439ed).

## 신규 카드 mount 후 자동 적용

신규 카드도 hub 의 일반 패턴 자동 적용:
- SSR + force-dynamic (매 요청 신선 데이터)
- 사장님 매일 1번 hub 확인 시 자동 노출
- mobile 폴드7 / tablet / desktop 반응형 (PageContainer wrapper)

## 카테고리 추가는 신중

6 카테고리가 사장님 1 페이지에서 인지 가능한 최대. 7+ 가 되면 사장님이
스크롤 부담 ↑. 새 카드는 기존 카테고리 안에 mount 우선. 카테고리 추가 시
의미 grouping 명확해야.

## 관련 docs

- `docs/local-press-add-city-guide.md` — 시·군 collector 자체 추가 self-service
- `docs/superpowers/specs/2026-05-08-autonomous-ops-master-design.md` — 5 Phase spec
- `memory/project_keepioo_autonomous_ops_master_2026_05_08.md` — Phase 1~5 진행 이력
