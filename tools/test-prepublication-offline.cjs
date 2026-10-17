// Local-only regression runner. Never copy production .env files into the test checkout.
/* eslint-disable @typescript-eslint/no-require-imports -- Standalone CommonJS test runner. */
const { spawnSync } = require("node:child_process");
const path = require("node:path");
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
  /^(PATH|PATHEXT|SystemRoot|WINDIR|COMSPEC|TEMP|TMP|USERPROFILE|APPDATA|LOCALAPPDATA|ProgramFiles|ProgramFiles\(x86\)|NUMBER_OF_PROCESSORS)$/i.test(key)));
env.NODE_OPTIONS = `--require="${path.join(__dirname, "test-offline-network.cjs").replaceAll("\\", "/")}"`;
env.NEXT_TELEMETRY_DISABLED = "1";
const defaults = [
  "__tests__/lib/blog", "__tests__/lib/wordpress", "__tests__/lib/category-counts.test.ts",
  "__tests__/app/blog-quality-check-dry-run.test.ts", "__tests__/app/admin-blog-quality-queue.test.ts", "__tests__/app/admin-blog-publication.test.ts",
  "__tests__/lib/naver-blog-queue-order.test.ts", "__tests__/lib/naver-approval-candidate-contract.test.ts",
  "__tests__/app/publish-blog-route.test.ts", "__tests__/app/wordpress-retry-route.test.ts",
  "__tests__/app/admin-wordpress-retry.test.ts", "__tests__/lib/naver-blog-format.test.ts",
  "__tests__/app/cron-naver-approval-candidate-route.test.ts", "__tests__/lib/naver-publication-eligibility.test.ts",
];
const args = process.argv.slice(2);
const result = spawnSync(process.execPath, ["node_modules/vitest/vitest.mjs", "run", ...(args[0] === "--all" ? args.slice(1) : args.length ? args : defaults)], {
  cwd: path.resolve(__dirname, ".."), env, stdio: "inherit",
});
process.exit(result.status ?? 1);
