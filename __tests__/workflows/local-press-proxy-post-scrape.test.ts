import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const workflowSource = readFileSync(
  join(process.cwd(), ".github/workflows/local-press-proxy.yml"),
  "utf8",
);

describe("local-press-proxy post-scrape queue drain", () => {
  it("builds the cron Authorization header from CRON_SECRET without a literal placeholder", () => {
    expect(workflowSource).toContain('CRON_SECRET: ${{ secrets.CRON_SECRET }}');
    expect(workflowSource).toContain('if [ -z "${CRON_SECRET:-}" ]; then');
    expect(workflowSource).toContain('auth_scheme="Bearer"');
    expect(workflowSource).toContain('auth_header="Authorization: ${auth_scheme} "');
    expect(workflowSource).toContain('auth_header+="${CRON_SECRET}"');
    expect(workflowSource).toContain('-H "${auth_header}"');
    expect(workflowSource).not.toContain("Authorization: Bearer ***");
    expect(workflowSource).not.toContain('auth_header="Authorization: *** "');
  });

  it("fails loudly after scraping if either post-scrape cron drain returns non-2xx", () => {
    expect(workflowSource).toContain(
      'call_cron "news-classify post-scrape drain" "/api/cron/news-classify"',
    );
    expect(workflowSource).toContain(
      'call_cron "news-ai-commentary post-scrape drain" "/api/cron/news-ai-commentary-backfill"',
    );
    expect(workflowSource).toContain('echo "::error::${label} failed with HTTP ${http}"');
    expect(workflowSource).toContain('exit 1');
  });
});

import { spawnSync } from "node:child_process";

it.each([
  [500, 200, 1],
  [200, 500, 1],
  [200, 200, 0],
  [0, 200, 1],
  [200, 0, 1],
])("attempts both independent drains (%i/%i) before exiting %i", (classifier, commentary, expected) => {
  const script = workflowSource.split("        run: |\n").at(-1)!
    .split("\n").map(line => line.replace(/^          /, "")).join("\n");
  const fakeCurl = `
curl() {
  local out=""
  while [ "$#" -gt 1 ]; do
    if [ "$1" = "-o" ]; then out="$2"; shift; fi
    shift
  done
  echo "called:$1" >&2
  echo '{}' > "$out"
  case "$1" in
    */news-classify) printf '${classifier}'; [ '${classifier}' -ne 0 ] ;;
    */news-ai-commentary-backfill) printf '${commentary}'; [ '${commentary}' -ne 0 ] ;;
    *) return 99 ;;
  esac
}
`;
  const result = spawnSync("bash", ["-c", fakeCurl + script], {
    encoding: "utf8",
    env: { ...process.env, CRON_SECRET: "test-only", SITE_BASE_URL: "https://example.invalid" },
  });
  expect(result.stderr).toContain("called:https://example.invalid/api/cron/news-classify");
  expect(result.stderr).toContain("called:https://example.invalid/api/cron/news-ai-commentary-backfill");
  expect(result.status).toBe(expected);
});
