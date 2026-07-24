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
