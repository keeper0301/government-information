import { expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { parse } from "yaml";
const source = readFileSync(".github/workflows/local-press-proxy.yml", "utf8");
const workflow = parse(source);
const scriptPath = "tools/drain-news-queue.sh";

it("gives each drain a separate budget and preserves ordered scrape-success gating", () => {
  expect(workflow.jobs.scrape["timeout-minutes"]).toBe(45);
  expect(workflow.jobs.scrape.steps.some((s: {name?: string}) => s.name?.includes("Drain"))).toBe(false);
  const classify = workflow.jobs.classify;
  const commentary = workflow.jobs.commentary;
  expect(classify.needs).toEqual(["scrape"]);
  expect(commentary.needs).toEqual(["scrape", "classify"]);
  expect(classify.if).toBe("${{ !cancelled() && needs.scrape.result == 'success' }}");
  expect(commentary.if).toBe("${{ !cancelled() && needs.scrape.result == 'success' && (needs.classify.result == 'success' || needs.classify.result == 'failure') }}");
  for (const [job, endpoint] of [[classify, "news-classify"], [commentary, "news-ai-commentary-backfill"]] as const) {
    expect(job["timeout-minutes"]).toBe(15);
    expect(job.steps.at(-1).run).toBe(`bash ${scriptPath} /api/cron/${endpoint}`);
    expect(job.steps.at(-1).env.CRON_SECRET).toBe("${{ secrets.CRON_SECRET }}");
  }
});

function run({ http = "200", code = 0, payload = '{}', inject = "", secret = "test-only", endpoint = "news-classify" } = {}) {
  const mock = `
curl() {
  local out=""
  while [ "$#" -gt 1 ]; do
    if [ "$1" = "-o" ]; then out="$2"; shift; fi
    shift
  done
  echo "called:$1" >&2
  printf '%s' "$PAYLOAD" > "$out"
  printf '%s' "$HTTP"
  return "$CURL_EXIT"
}
export -f curl
${inject}
`;
  return spawnSync("bash", ["-c", mock + `bash ${scriptPath} /api/cron/${endpoint}`], {
    encoding: "utf8", env: { ...process.env, CRON_SECRET: secret, SITE_BASE_URL: "https://example.invalid", PAYLOAD: payload, HTTP: http, CURL_EXIT: String(code) },
  });
}
it.each([["200", 0, 0], ["500", 0, 1], ["000", 28, 1], ["000", 7, 1]])("handles HTTP %s / curl %i", (http, code, status) => {
  const result = run({ http, code });
  expect(result.stderr).toContain("called:https://example.invalid/api/cron/news-classify");
  expect(result.status).toBe(status);
});
it.each([
  "mktemp() { return 1; }; export -f mktemp",
  "node() { return 1; }; export -f node",
  "rm() { return 1; }; export -f rm",
])("fails explicitly on local diagnostic/temp failure: %s", inject => {
  expect(run({ inject }).status).toBe(1);
});
it("does not request without a secret", () => {
  const result = run({ secret: "" });
  expect(result.status).toBe(1);
  expect(result.stderr).not.toContain("called:");
});
it("logs a bounded stop reason but never raw response strings", () => {
  const known = run({ payload: JSON.stringify({ stop_reason: "insufficient_quota", errors: ["SECRET"] }) });
  expect(known.stdout).toContain('"stop_reason":"insufficient_quota"');
  expect(known.stdout).not.toContain("SECRET");
  const unknown = run({ payload: JSON.stringify({ stop_reason: "SECRET\n::error::".repeat(200) }) });
  expect(unknown.stdout).toContain('"stop_reason":"unknown"');
  expect(unknown.stdout).not.toContain("SECRET");
});
it("fails closed on malformed diagnostic JSON without echoing body", () => {
  const result = run({ payload: "SECRET non-JSON" });
  expect(result.status).toBe(1);
  expect(result.stdout + result.stderr).not.toContain("SECRET");
});
it.each([
  [{ ok: true, fetched: 10, updated: 0, sentinel_filled: 0, llm_failed: 10, update_failed: 0 }, 1],
  [{ ok: true, fetched: 10, updated: 0, sentinel_filled: 0, llm_failed: 0, update_failed: 10 }, 1],
  [{ ok: true, fetched: 10, updated: 1, sentinel_filled: 1, llm_failed: 9, update_failed: 0 }, 0],
  [{ ok: true, fetched: 0, updated: 0, sentinel_filled: 0, llm_failed: 0, update_failed: 0 }, 0],
  [{ ok: true, skipped: "OPENAI_API_KEY missing" }, 0],
  [{ ok: true, fetched: 10, updated: 0, sentinel_filled: 0, llm_failed: "10", update_failed: 0 }, 0],
])("only fails valid all-failed commentary counters: %j", (payload, status) => {
  expect(run({ endpoint: "news-ai-commentary-backfill", payload: JSON.stringify(payload) }).status).toBe(status);
});
function allows(job: string, scrape: string, classify: string, cancelled = false) {
  const condition = workflow.jobs[job].if.slice(3, -2).trim();
  return new Function("cancelled", "needs", "return (" + condition + ");")(
    () => cancelled, { scrape: { result: scrape }, classify: { result: classify } },
  );
}
it.each(["failure", "cancelled", "skipped"])("blocks both drains for scrape %s", state => {
  expect(allows("classify", state, "skipped")).toBe(false);
  expect(allows("commentary", state, "skipped")).toBe(false);
});
it.each(["success", "failure"])("allows commentary after classifier %s but not cancellation", state => {
  expect(allows("commentary", "success", state)).toBe(true);
  expect(allows("commentary", "success", state, true)).toBe(false);
});
it.each(["skipped", "cancelled"])("does not override classifier %s", state => {
  expect(allows("commentary", "success", state)).toBe(false);
});
it("still allows commentary when classifier request times out", () => {
  const classify = run({ code: 28, http: "000" });
  expect(classify.status).toBe(1);
  expect(allows("commentary", "success", "failure")).toBe(true);
  expect(run({ endpoint: "news-ai-commentary-backfill" }).status).toBe(0);
});
it("uses bounded single requests without retry flags", () => {
  const script = readFileSync(scriptPath, "utf8");
  expect(script).toContain("--max-time 780");
  expect(script).not.toContain("--retry");
});
it("preserves only validated three-digit HTTP diagnostics", () => {
  expect(run({ http: "401" }).stdout).toContain("HTTP 401");
  const result = run({ http: "SECRET\n::error::" });
  expect(result.stdout).not.toContain("SECRET");
  expect(result.status).toBe(1);
});
