// ============================================================
// 로컬 insight 백필 — enrich 된 welfare 행에 해설 생성 (route 미러)
// ============================================================
// app/api/cron/policy-insight-backfill 의 buildSourceText + 프롬프트를 그대로 사용.
// prod cron 코드(합산입력)가 아직 push 전이라, enrich 직후 이번 세션에 색인 가속용으로
// 로컬에서 직접 돌린다. OPENAI_API_KEY(.env.local) 사용.
//
// 대상: unique_insight NULL + detailed_content NOT NULL(=enrich됨) + 합산≥50.
// 실행: node --env-file=.env.local playwright/backfill-insight.mjs
//   BACKFILL_LIMIT=2000  ENRICH_SOURCE=youth-v1 (특정 출처만) 옵션.
// ============================================================

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OPENAI = process.env.OPENAI_API_KEY;
const LIMIT = parseInt(process.env.BACKFILL_LIMIT || "5000", 10);
const SOURCE = process.env.ENRICH_SOURCE || ""; // 비우면 전체
const CONCURRENCY = 5;
const MODEL = "gpt-4o-mini";
const MIN_DESC_LEN = 50, MIN_INSIGHT_LEN = 80, MAX_DESC_PROMPT_LEN = 1500;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };

if (!URL || !KEY || !OPENAI) { console.error("env 누락(SUPABASE/OPENAI)"); process.exit(1); }

const PROMPT_TEMPLATE = `다음 정부 정책에 대해 keepioo 사용자가 빠르게 핵심을 잡을 수 있도록 5~7줄 해설을 작성해 주세요.

[정책 데이터]
제목: {{TITLE}}
출처: {{SOURCE}}
본문: {{DESCRIPTION}}

[요청]
다음 4 관점을 각 1~2줄씩 자연스럽게 풀어 주세요. 마크다운·번호·이모지 사용 금지, 줄바꿈으로만 구분, 전체 200~400자 한국어.

1. 핵심 한 줄 정의 ("이 정책은 ~~한 사람에게 ~~을 지원하는 제도입니다" 형식)
2. 받기 좋은 사람 (구체 대상층 1~2가지 — 나이·소득·상황)
3. 신청 시 놓치기 쉬운 점 (서류·기간·중복 수령·자격 함정 중 1가지)
4. 더 알아두면 좋은 점 (관련 정책·실무 팁·주의사항 중 1가지)

원문 본문을 그대로 옮기지 말고 keepioo 자체 정리·해설로 작성해 주세요.`;

// route 의 buildSourceText 와 동일 — description + 상세 컬럼 합산(중복 제거).
function buildSourceText(row) {
  const parts = [row.description, row.detailed_content, row.eligibility, row.benefits, row.target]
    .map((s) => s?.trim()).filter((s) => !!s && s.length > 0);
  const seen = new Set();
  return parts.filter((p) => (seen.has(p) ? false : (seen.add(p), true))).join("\n").trim();
}

async function pickRows(chunk) {
  const qs = [
    "unique_insight=is.null",
    "detailed_content=not.is.null",
    SOURCE ? `source_code=eq.${SOURCE}` : "",
    "select=id,title,source,description,detailed_content,eligibility,benefits,target",
    "order=view_count.desc.nullslast",
    `limit=${Math.min(chunk, 1000)}`,
  ].filter(Boolean).join("&");
  return fetch(`${URL}/rest/v1/welfare_programs?${qs}`, { headers: H }).then((r) => r.json());
}

async function callLLM(prompt) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${OPENAI}`, "content-type": "application/json" },
    body: JSON.stringify({ model: MODEL, max_tokens: 600, messages: [{ role: "user", content: prompt }] }),
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}`);
  const j = await res.json();
  return j.choices?.[0]?.message?.content?.trim() || "";
}

async function processOne(row, counts) {
  const sourceText = buildSourceText(row);
  if (sourceText.length < MIN_DESC_LEN) { counts.skip_short++; return; }
  const prompt = PROMPT_TEMPLATE
    .replace("{{TITLE}}", row.title)
    .replace("{{SOURCE}}", row.source ?? "정부 공식")
    .replace("{{DESCRIPTION}}", sourceText.slice(0, MAX_DESC_PROMPT_LEN));
  let insight;
  try { insight = await callLLM(prompt); } catch { counts.llm_fail++; return; }
  if (insight.length < MIN_INSIGHT_LEN) { counts.skip_llm_short++; return; }
  const res = await fetch(`${URL}/rest/v1/welfare_programs?id=eq.${row.id}`, {
    method: "PATCH", headers: { ...H, Prefer: "return=minimal" },
    body: JSON.stringify({ unique_insight: insight, unique_insight_at: new Date().toISOString(), unique_insight_model: MODEL }),
  });
  if (res.ok) counts.updated++; else counts.llm_fail++;
}

async function main() {
  const counts = { updated: 0, skip_short: 0, skip_llm_short: 0, llm_fail: 0 };
  let processed = 0;
  const t0 = Date.now();
  // 생성 성공한 행은 insight 차서 pickRows 에서 빠지지만, skip/실패 행은 NULL 로 남아
  // 재선택된다 → seen 으로 이미 시도한 id 제외, 새 행 0이면 종료(무한루프 방지).
  const seen = new Set();
  console.log(`백필 시작 (출처: ${SOURCE || "전체"}, 동시 ${CONCURRENCY})`);

  while (processed < LIMIT) {
    const fetched = await pickRows(1000);
    if (!Array.isArray(fetched) || fetched.length === 0) { console.log("\n남은 대상 0건 — 완료."); break; }
    const rows = fetched.filter((r) => !seen.has(r.id));
    if (rows.length === 0) { console.log("\n새 대상 0건(나머지는 skip/실패 누적) — 완료."); break; }
    rows.forEach((r) => seen.add(r.id));
    // CONCURRENCY 씩 묶어 병렬
    for (let i = 0; i < rows.length && processed < LIMIT; i += CONCURRENCY) {
      const batch = rows.slice(i, i + CONCURRENCY);
      await Promise.all(batch.map((r) => processOne(r, counts)));
      processed += batch.length;
      if (processed % 100 < CONCURRENCY) {
        const min = ((Date.now() - t0) / 60000).toFixed(1);
        console.log(`  …${processed}건 (생성 ${counts.updated}/짧음 ${counts.skip_short}/LLM짧음 ${counts.skip_llm_short}/실패 ${counts.llm_fail}, ${min}분)`);
      }
    }
  }

  const min = ((Date.now() - t0) / 60000).toFixed(1);
  console.log(`\n=== 완료: 생성 ${counts.updated} / 짧음 ${counts.skip_short} / LLM짧음 ${counts.skip_llm_short} / 실패 ${counts.llm_fail} (${min}분) ===`);
}

main().catch((e) => { console.error("백필 중단:", e); process.exit(1); });
