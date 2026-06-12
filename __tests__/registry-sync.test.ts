// 시·군 city key 동기화 회귀 안전망 — 운영·보안 리뷰 P3 권장.
// 세 source(workflow yml KEEPIOO_RUNNER_CITIES + route.ts PLAYWRIGHT_CITY_REGISTRY +
// runner.mjs ALL_COLLECTORS) 가 같은 키 집합을 가져야 cron silent fail 없음.
// 2026-06-02 — 수원시 추가(정적 JS 렌더 본문 → Playwright 이관)로 12 → 13 키.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PLAYWRIGHT_CITY_REGISTRY } from "@/lib/scraping/local-press/_playwright-city-registry";

const ROOT = process.cwd();

describe("Playwright proxy 도시 city key 3-source 동기화", () => {
  // 1) workflow yml 의 KEEPIOO_RUNNER_CITIES 기본값 추출
  const ymlPath = join(ROOT, ".github/workflows/local-press-proxy.yml");
  const yml = readFileSync(ymlPath, "utf8");
  const ymlMatch = yml.match(
    /KEEPIOO_RUNNER_CITIES:[^']*'([^']+)'/,
  );
  const workflowKeys = (ymlMatch?.[1] ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  // 2) PLAYWRIGHT_CITY_REGISTRY 키 추출 (단일 출처 = _playwright-city-registry.ts,
  //    route.ts·가동 카드가 공용 import).
  const routePath = join(
    ROOT,
    "lib/scraping/local-press/_playwright-city-registry.ts",
  );
  const routeSrc = readFileSync(routePath, "utf8");
  // registry 객체 시작 ~ } ; 까지 캡처
  const registryBlock = routeSrc.match(
    /PLAYWRIGHT_CITY_REGISTRY[^{]*\{([\s\S]*?)\};/,
  )?.[1] ?? "";
  // 키 후보: 줄 시작에 식별자: { (sourceCode 가 안에 있음) 형식
  const routeKeys = [
    ...registryBlock.matchAll(/^\s{2}([a-z_]+):\s*\{/gm),
  ].map((m) => m[1]);

  // 3) runner.mjs 의 ALL_COLLECTORS 키 추출
  const runnerPath = join(ROOT, "playwright/runner.mjs");
  const runnerSrc = readFileSync(runnerPath, "utf8");
  const collectorsBlock = runnerSrc.match(
    /ALL_COLLECTORS\s*=\s*\[([\s\S]*?)\];/,
  )?.[1] ?? "";
  const runnerKeys = [
    ...collectorsBlock.matchAll(/key:\s*"([a-z_]+)"/g),
  ].map((m) => m[1]);

  it("workflow yml 에 27 키 정확히 정의 (2026-06-12 +부천·시흥·광명·중랑)", () => {
    expect(workflowKeys.length).toBe(27);
    expect(new Set(workflowKeys).size).toBe(27); // 중복 0
  });

  it("route.ts 와 workflow yml 의 키 집합 일치", () => {
    expect(new Set(routeKeys)).toEqual(new Set(workflowKeys));
  });

  it("runner.mjs 와 workflow yml 의 키 집합 일치", () => {
    expect(new Set(runnerKeys)).toEqual(new Set(workflowKeys));
  });

  it("3 source 키 개수 모두 동일", () => {
    expect(routeKeys.length).toBe(workflowKeys.length);
    expect(runnerKeys.length).toBe(workflowKeys.length);
  });
});

// 코드리뷰 ⑥ — sourceCode 오타 회귀 방어. registry-sync 는 key 집합만 검증해
// sourceCode 값 오타(예: local-press-pyeongtaek → 오타)는 못 잡는다. sourceCode 가
// 틀리면 stats/stale 집계·news_posts 가 엉뚱한 도시로 silent 귀속(5/22 silent-fail 류).
// 규칙: sourceCode === `local-press-${key 의 _ → -}` (유일 예외 namdong_incheon).
describe("PLAYWRIGHT_CITY_REGISTRY sourceCode 컨벤션", () => {
  // key 와 sourceCode 가 어긋나는 의도된 특례(이관 당시 이미 존재하던 DB source_code 유지).
  const KEY_SOURCECODE_EXCEPTIONS: Record<string, string> = {
    namdong_incheon: "local-press-namdong",
  };

  it("모든 key 의 sourceCode 가 규칙 또는 명시 예외와 일치", () => {
    for (const [key, cfg] of Object.entries(PLAYWRIGHT_CITY_REGISTRY)) {
      const expected =
        KEY_SOURCECODE_EXCEPTIONS[key] ??
        `local-press-${key.replace(/_/g, "-")}`;
      expect(cfg.sourceCode, `key="${key}" sourceCode 불일치`).toBe(expected);
    }
  });

  it("sourceCode 중복 없음 (도시 간 집계 충돌 방지)", () => {
    const codes = Object.values(PLAYWRIGHT_CITY_REGISTRY).map(
      (c) => c.sourceCode,
    );
    expect(new Set(codes).size).toBe(codes.length);
  });
});
