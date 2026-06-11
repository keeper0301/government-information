// ============================================================
// 네이버 SEO 수집 데이터 → 대응책 리포트 생성 (순수 함수)
// ============================================================
// collect.mjs 결과(current) + 직전 스냅샷(prev, DB)으로 주간 텔레그램 리포트 텍스트를
// 만든다. 대응책 5종: 색인추세·SEO진단이슈·CTR낮은페이지·뜨는키워드·색인률.
// ============================================================

// IndexNow 로 제출한 색인 대상 수(2026-06-11 기준). 색인률 분모.
const INDEXNOW_SUBMITTED = 7453;
const SITE = "https://www.keepioo.com";

function delta(cur, prev) {
  if (prev == null || cur == null) return "";
  const d = cur - prev;
  return ` (지난주 ${d >= 0 ? "+" : ""}${d})`;
}

export function buildReport(current, prev, today = new Date().toISOString().slice(0, 10)) {
  const d = current.diagnosis ?? {};
  const e = current.expose ?? {};
  const lines = [`📊 keepioo 네이버 SEO 주간 (${today})`];

  // ① 색인 추세 + 노출/클릭
  lines.push(
    `색인 ${d.indexed_count ?? "?"}${delta(d.indexed_count, prev?.indexed_count)} · 색인제외 ${d.index_excluded ?? "?"}`,
  );
  lines.push(
    `노출 ${e.total_impressions ?? "?"}${delta(e.total_impressions, prev?.total_impressions)} · 클릭 ${e.total_clicks ?? "?"}${delta(e.total_clicks, prev?.total_clicks)} · CTR ${e.avg_ctr ?? "?"}%`,
  );

  // ⑤ 색인률 (IndexNow 제출 대비)
  if (d.indexed_count != null) {
    lines.push(
      `색인률 ${Math.round((d.indexed_count / INDEXNOW_SUBMITTED) * 100)}% (IndexNow 제출 ${INDEXNOW_SUBMITTED} 중 ${d.indexed_count})`,
    );
  }

  // ② SEO 진단 이슈 (주요 3종) — 지난주 대비 증감
  const iss = d.issues ?? {};
  const prevIss = prev?.seo_issues ?? {};
  const h1 = iss["<H1> 요소가 2개 이상 발견"];
  const titleDup = iss["<title> 요소에 동일한 제목인 웹문서 다수 발견"];
  const descDup = iss['<meta name="description"> 태그에 동일 설명문 발견'];
  if (h1 || titleDup || descDup) {
    lines.push(
      `⚠️ SEO 진단: H1중복 ${h1 ?? 0}${delta(h1, prevIss["<H1> 요소가 2개 이상 발견"])} · title중복 ${titleDup ?? 0} · 설명중복 ${descDup ?? 0}`,
    );
  }

  // ③ CTR 낮은 페이지 (노출 50+ 인데 CTR 5% 미만 = 순위/스니펫 개선 후보) TOP3
  const lowCtr = (e.top_pages ?? [])
    .filter((p) => (p.impression ?? 0) >= 50 && (p.ctr ?? 100) < 5)
    .slice(0, 3);
  if (lowCtr.length) {
    lines.push("💡 CTR 개선 후보 (노출 높음·클릭 낮음):");
    for (const p of lowCtr) {
      lines.push(`  ${String(p.label).replace(SITE, "")} (노출 ${p.impression}·CTR ${p.ctr}%)`);
    }
  }

  // ④ 새로 뜬 검색 키워드 (지난주 TOP 에 없던 것) TOP3
  if (prev) {
    const prevKw = new Set((prev.top_keywords ?? []).map((k) => k.label));
    const fresh = (e.top_keywords ?? []).filter((k) => !prevKw.has(k.label)).slice(0, 3);
    if (fresh.length) {
      lines.push(`🔍 새 노출 키워드: ${fresh.map((k) => k.label).join(", ")}`);
    }
  }

  return lines.join("\n");
}
