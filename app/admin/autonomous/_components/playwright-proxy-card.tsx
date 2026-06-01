// ============================================================
// autonomous hub — Playwright proxy 13 도시 가동 카드 (2026-06-01)
// ============================================================
// GitHub Actions local-press-proxy.yml workflow 가 13 도시 (창원·성남·안산·천안·
// 노원·동래·부산진·금정·부산북구·사상·사상소식지·김포·영도) JS 렌더 site 를
// 풀 chromium 으로 수집. 사장님 GitHub secrets 미등록 시 workflow 미발화 →
// audit row 7d 0건 → 텔레그램·SMS alert 없음 (Vercel cron 아니라 별도).
//
// 7d audit fetch + 0건 시 amber + GitHub secrets 등록 안내 link.
// 데이터 fetch 1회 (createAdminClient). server component.
// ============================================================

import { createAdminClient } from "@/lib/supabase/admin";
import { PLAYWRIGHT_CITY_REGISTRY } from "@/lib/scraping/local-press/_playwright-city-registry";

async function fetchProxyHealth(): Promise<{
  totalSources: number;
  activeSources: number;
  inactiveSources: string[];
}> {
  const admin = createAdminClient();
  const since7dIso = new Date(
    Date.now() - 7 * 24 * 60 * 60 * 1000,
  ).toISOString();

  // sourceCode 는 registry 단일 출처에서 직접 가져옴 (이전 `local-press-${key}` 추정은
  // sasang_news → local-press-sasang_news(밑줄) 로 실DB(하이픈) 와 어긋나 항상 미가동
  // 오표시됐음). 7d 안 row 가 있으면 active.
  const sourceCodes = Object.values(PLAYWRIGHT_CITY_REGISTRY).map(
    (c) => c.sourceCode,
  );
  const { data } = await admin
    .from("news_posts")
    .select("source_code")
    .in("source_code", sourceCodes)
    .gte("created_at", since7dIso);

  const activeSet = new Set((data ?? []).map((r) => r.source_code));
  const inactiveSources = sourceCodes.filter((s) => !activeSet.has(s));

  return {
    totalSources: sourceCodes.length,
    activeSources: activeSet.size,
    inactiveSources,
  };
}

export async function PlaywrightProxyCard() {
  const { totalSources, activeSources, inactiveSources } =
    await fetchProxyHealth();

  const allInactive = activeSources === 0;
  const partial = activeSources > 0 && activeSources < totalSources;

  const borderClass = allInactive
    ? "border-red-300 bg-red-50"
    : partial
      ? "border-amber-300 bg-amber-50"
      : "border-slate-200 bg-white";

  return (
    <section className={`rounded-xl border p-5 ${borderClass}`}>
      <header className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            🎭 Playwright proxy {totalSources} 도시 (GitHub Actions)
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            JS 렌더 시·군 보도자료 수집 · KST 10/22 2회/일 · 7d 안 row 누적 기준
          </p>
        </div>
        <a
          href="https://github.com/keeper0301/government-information/actions/workflows/local-press-proxy.yml"
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          title="GitHub Actions workflow 페이지"
        >
          ▶ Actions ↗
        </a>
      </header>

      <div className="text-sm mb-3">
        <p className="text-slate-700">
          가동:{" "}
          <strong className="text-slate-900">{activeSources}/{totalSources}</strong>{" "}
          도시 (7d row 누적)
        </p>
      </div>

      {allInactive && (
        <div className="text-sm text-red-700">
          <p className="font-semibold">
            ⚠️ {totalSources} 도시 전체 미가동 — GitHub Actions workflow 실행 안 됨
          </p>
          <p className="mt-2 text-xs text-red-600">
            원인 가능성:
          </p>
          <ul className="mt-1 text-xs text-red-600 list-disc pl-4 space-y-0.5">
            <li>
              GitHub repo Secrets 미등록 (
              <a
                href="https://github.com/keeper0301/government-information/settings/secrets/actions"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-red-800"
              >
                Settings → Secrets ↗
              </a>
              )
            </li>
            <li>
              <code className="bg-red-100 px-1 rounded">KEEPIOO_API_URL</code> +{" "}
              <code className="bg-red-100 px-1 rounded">KEEPIOO_API_KEY</code> 2건
              필요. Vercel{" "}
              <code className="bg-red-100 px-1 rounded">IMPORT_PRESS_API_KEY</code>{" "}
              와 동일 값.
            </li>
            <li>workflow disabled 또는 cron schedule 정지 가능</li>
          </ul>
        </div>
      )}

      {partial && (
        <div className="text-sm text-amber-800">
          <p className="font-semibold">
            ⚠️ {inactiveSources.length}개 도시 7d 미가동:
          </p>
          <p className="mt-1 text-xs text-amber-700">
            {inactiveSources.map((s) => s.replace("local-press-", "")).join(", ")}
          </p>
          <p className="mt-2 text-xs text-amber-600">
            workflow 가동 중이나 일부 collector selector 사고 가능성. workflow
            run log 확인 권장.
          </p>
        </div>
      )}

      {!allInactive && !partial && (
        <p className="text-sm text-emerald-700">
          ✅ {totalSources} 도시 모두 7d 안 row 누적 — workflow 정상 가동
        </p>
      )}
    </section>
  );
}
