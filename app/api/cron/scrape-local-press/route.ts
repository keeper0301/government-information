// ============================================================
// /api/cron/scrape-local-press — 시·군 보도자료 매일 자동 수집
// ============================================================
// Phase B B1-b. Vercel cron 매일 KST 09:00 (UTC 00:00) 호출.
//
// 시·군 등록: lib/scraping/local-press/_registry.ts (single source of truth).
// 추가 시 그 파일에만 1줄 추가.
//
// auth: CRON_SECRET Bearer (vercel cron 자동 호출).
// ============================================================

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { CITY_REGISTRY } from "@/lib/scraping/local-press/_registry";
import { logAdminAction } from "@/lib/admin-actions";
import { auditCronRun } from "@/lib/ops/audit-cron-run";
import { authorizeCronRequest } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";
// 2026-05-25 region: vercel.json 의 functions.regions=["icn1"] 으로 설정 (project 레벨).
// Node runtime 의 preferredRegion export 는 Edge runtime 만 지원 → vercel.json 으로 우회.
// 미국 default region 의 한국 정부 site IP geo 차단 (광역 9건 fetch failed) 해소.
// 시·군 1개 = list 1 + detail 10 fetch × 25s = 최대 275s. 5/26 review fix:
// 시·군 1개 = list 1 + detail 10 fetch × 25s = 최대 275s.
// chunk 소요시간 = chunk 내 "가장 느린 도시 1개"(Promise.all 병렬). 따라서 batch 수(chunk 개수)가
// 총시간을 좌우 — chunk 수↓ = 느린도시 가산 횟수↓ = 총시간 단축.
// 2026-06-02 — registry 79 도시(서울 자치구 13곳 6/1 추가)로 늘며 BATCH 4(=20 chunk)면
//   registry 끝쪽 서울 자치구가 timeout 으로 실행조차 못 될 위험. audit: 매일 완주 55~64에 그침
//   (registry 79인데). 서울 13곳 DB 7일=0 = 끝쪽 미도달 정황.
//   대응: ① BATCH 6(=14 chunk)으로 가산 횟수↓ ② maxDuration 360→800(Vercel Pro fluid 한도) 안전망.
//   서울 13곳이 끝 chunk 에 몰린 구조라 효과는 다음 09시 audit(cities 79 도달)으로 실측 확정 필요.
//   (도시별 다른 사이트라 동시 6 fetch 부하 분산 OK. icn1-fetch proxy 미경유.)
export const maxDuration = 800;
const BATCH_SIZE = 6;
// 2026-06-07 코드리뷰 P1 — 도시당 wall-clock 상한. 느린 도시 1개(detail 순차 25s×10 +
// 백오프 재시도로 최악 275s+)가 chunk 를 끝까지 끌어 registry 끝쪽(서울 자치구 등)이
// 실행조차 못 되던 위험 차단. 상한 도달 시 그 도시는 0건 처리하고 다음 chunk 진행
// (entry.fn 의 이미 insert 된 row 는 유지 — 부분 수집은 보존).
const CITY_TIMEOUT_MS = 90_000;

type CityResult = {
  city: string;
  fetched: number;
  inserted: number;
  skipped: number;
  errors: string[];
  error?: string;
  // 사이트 최신 발행일(YYYY-MM-DD) — collector(_factory/eminwon/suncheon)가 채워 전달.
  // audit details.latest_fetched(snake) 로 기록해 insert-stop auto-triage 가 정적 cron 도
  // proxy 처럼 "사이트 최신 vs DB 최신" 으로 헛경보를 거를 수 있게 한다.
  latestFetched?: string | null;
  // collector 가 news_posts 에 실제 쓰는 source_code(cfg.sourceCode). audit 기록용 —
  // ⚠️ key 에서 추정 금지(underscore/hyphen·축약 불일치). collector 실제 값을 그대로 전달.
  sourceCode?: string;
};

async function scrapeCity(
  admin: ReturnType<typeof createAdminClient>,
  entry: (typeof CITY_REGISTRY)[number],
): Promise<CityResult> {
  try {
    // 도시당 wall-clock 상한 — 초과 시 0건 CityResult 로 resolve 하고 다음 도시 진행.
    // entry.fn 의 fetch 는 백그라운드로 계속될 수 있으나(이미 insert 된 row 보존),
    // chunk 가 이 도시로 인해 90s 이상 늘어나지 않도록 보장한다.
    const r = await Promise.race<CityResult>([
      entry.fn(admin, 10),
      new Promise<CityResult>((resolve) =>
        setTimeout(
          () =>
            resolve({
              city: entry.city,
              fetched: 0,
              inserted: 0,
              skipped: 0,
              errors: [`city wall-clock timeout ${CITY_TIMEOUT_MS}ms`],
            }),
          CITY_TIMEOUT_MS,
        ),
      ),
    ]);
    await logAdminAction({
      actorId: null,
      action: "local_press_scrape",
      // latest_fetched(snake): 모니터(collector-health-diagnosis)가 읽는 이름으로 명시 기록.
      // source_code: collector 실제값(r.sourceCode=cfg.sourceCode)을 그대로 — auto-triage 가
      // city→source_code 매핑(이전엔 playwright registry 만 봐 정적 누락) 없이 DB 최신을 조회.
      details: {
        trigger: "cron",
        ...r,
        latest_fetched: r.latestFetched ?? null,
        source_code: r.sourceCode ?? null,
      },
    });
    return r;
  } catch (e) {
    // 2026-05-22 fix — throw 시 invisible silent fail (audit 미기록) 사고 해소.
    // catch 안에서도 logAdminAction 호출 → /admin/scrape-local 페이지 + silent-fail-detect 가시화.
    const errorMessage = (e as Error).message;
    const errResult: CityResult = {
      city: entry.city,
      fetched: 0,
      inserted: 0,
      skipped: 0,
      errors: [errorMessage.slice(0, 200)],
      error: errorMessage,
    };
    try {
      await logAdminAction({
        actorId: null,
        action: "local_press_scrape",
        details: { trigger: "cron", ...errResult },
      });
    } catch {
      // audit insert 도 fail 하면 silent — 무한 throw 회피
    }
    return errResult;
  }
}

// 2026-06-07 코드리뷰 P1 — 전체 wall-clock 예산. 도시당 90s cap 만으론 최악
// 14 chunk × 90s = 1260s 가 maxDuration 800 을 넘어 Vercel 이 함수를 강제 종료 →
// registry 끝쪽(서울 자치구 등)이 silent 미실행되던 원래 위험이 부분 재현될 수 있다.
// 예산 초과 시 잔여 도시를 skip CityResult(가시화) 로 남기고 break — 정상 종료 + 다음 cron 처리.
const TOTAL_BUDGET_MS = 700_000;

function selectCityEntries(request: Request): (typeof CITY_REGISTRY)[number][] {
  const url = new URL(request.url);
  const raw = url.searchParams.get("cities") ?? url.searchParams.get("city");
  if (!raw) return CITY_REGISTRY;

  const wanted = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (wanted.length === 0) return CITY_REGISTRY;

  const byKeyOrCity = new Map<string, (typeof CITY_REGISTRY)[number]>();
  for (const entry of CITY_REGISTRY) {
    byKeyOrCity.set(entry.key, entry);
    byKeyOrCity.set(entry.city, entry);
  }

  const selected: (typeof CITY_REGISTRY)[number][] = [];
  const seen = new Set<string>();
  const unknown: string[] = [];
  for (const token of wanted) {
    const entry = byKeyOrCity.get(token);
    if (!entry) {
      unknown.push(token);
      continue;
    }
    if (!seen.has(entry.key)) {
      selected.push(entry);
      seen.add(entry.key);
    }
  }
  if (unknown.length > 0) {
    throw new Error(`unknown local press city: ${unknown.join(",")}`);
  }
  return selected.length > 0 ? selected : CITY_REGISTRY;
}

async function runScrape(entries = CITY_REGISTRY) {
  const admin = createAdminClient();
  const results: CityResult[] = [];
  const startedAt = Date.now();

  // BATCH_SIZE 단위 병렬 처리 — chunk 간 sequential 로 외부 부하 분산.
  // 각 scrapeCity 가 try/catch 내장이라 Promise.all reject X (allSettled 불필요).
  for (let i = 0; i < entries.length; i += BATCH_SIZE) {
    if (Date.now() - startedAt > TOTAL_BUDGET_MS) {
      // 예산 초과 — 잔여 도시는 강제종료 대신 skip 기록으로 가시화(silent 미실행 방지).
      for (const entry of entries.slice(i)) {
        results.push({
          city: entry.city,
          fetched: 0,
          inserted: 0,
          skipped: 0,
          errors: ["wall-clock budget 초과 — 이번 cron skip(다음 cron 처리)"],
        });
      }
      break;
    }
    const chunk = entries.slice(i, i + BATCH_SIZE);
    const chunkResults = await Promise.all(
      chunk.map((entry) => scrapeCity(admin, entry)),
    );
    results.push(...chunkResults);
  }
  return results;
}

export async function GET(request: Request) {
  const authErr = authorizeCronRequest(request);
  if (authErr) return authErr;

  try {
    const entries = selectCityEntries(request);
    const results = await runScrape(entries);
    const totalInserted = results.reduce((s, r) => s + r.inserted, 0);
    await auditCronRun("local_press_scrape_run", {
      cities: results.length,
      total_inserted: totalInserted,
    });
    return NextResponse.json({ ok: true, results });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 },
    );
  }
}

// POST alias — /admin/cron-trigger 가 self-POST 로 호출 가능
export const POST = GET;
