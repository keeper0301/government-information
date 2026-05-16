// ============================================================
// improvement action 텍스트 분할 단위 테스트
// ============================================================
// /admin/* 경로 추출 + segments 분할 동작. 실제 improvement-scan.ts 의 액션
// 텍스트 패턴 (8 권장 중 5건이 admin path 포함) 검증.
// ============================================================

import { describe, it, expect } from "vitest";
import {
  parseActionSegments,
  actionHasLinks,
} from "@/lib/autonomous-ops/improvement-actions";

// ── parseActionSegments ──────────────────────────────────────
describe("parseActionSegments — 경로 1개", () => {
  it("'/admin/instagram 에서 OAuth ...' → link + text", () => {
    const segs = parseActionSegments(
      "/admin/instagram 에서 OAuth 연결 상태와 시간대·일일 cap 조건을 확인하세요.",
    );
    expect(segs).toHaveLength(2);
    expect(segs[0]).toEqual({
      type: "link",
      href: "/admin/instagram",
      label: "/admin/instagram",
    });
    expect(segs[1]).toEqual({
      type: "text",
      value: " 에서 OAuth 연결 상태와 시간대·일일 cap 조건을 확인하세요.",
    });
  });

  it("'/admin/cron-failures 에서 ...' (하이픈 포함 경로)", () => {
    const segs = parseActionSegments(
      "/admin/cron-failures 에서 실패 job을 확인하세요.",
    );
    expect(segs[0]).toEqual({
      type: "link",
      href: "/admin/cron-failures",
      label: "/admin/cron-failures",
    });
  });

  it("'/admin' 단독 (대시보드) 도 추출", () => {
    const segs = parseActionSegments("/admin 에서 종합 확인");
    expect(segs[0].type).toBe("link");
    if (segs[0].type === "link") {
      expect(segs[0].href).toBe("/admin");
    }
  });
});

describe("parseActionSegments — 경로 없음 (plain text)", () => {
  it("admin path 없는 텍스트는 단일 text segment", () => {
    const action =
      "OAuth 토큰, 카드 이미지 URL 3장, Graph API 컨테이너 생성 로그를 확인하고 실패 글은 attempt 3회 전 재시도하세요.";
    const segs = parseActionSegments(action);
    expect(segs).toHaveLength(1);
    expect(segs[0]).toEqual({ type: "text", value: action });
  });

  it("빈 문자열도 단일 text segment", () => {
    expect(parseActionSegments("")).toEqual([{ type: "text", value: "" }]);
  });
});

describe("parseActionSegments — 경로 2개 이상", () => {
  it("텍스트 중간에 link 2개 포함", () => {
    const segs = parseActionSegments(
      "먼저 /admin/cron-failures 에서 확인 후 /admin/cron-trigger 에서 재실행하세요.",
    );
    expect(segs.filter((s) => s.type === "link")).toHaveLength(2);
  });
});

describe("parseActionSegments — 경로 끝 처리 (false positive 방지)", () => {
  it("'/admin/instagram-card' 경로 안 잘림 (긴 path)", () => {
    const segs = parseActionSegments("/admin/instagram-card 확인");
    expect(segs[0]).toEqual({
      type: "link",
      href: "/admin/instagram-card",
      label: "/admin/instagram-card",
    });
  });

  it("/admin/X. (문장 끝 마침표) — 마침표 제외", () => {
    const segs = parseActionSegments("/admin/health.");
    expect(segs[0]).toEqual({
      type: "link",
      href: "/admin/health",
      label: "/admin/health",
    });
    expect(segs[1]).toEqual({ type: "text", value: "." });
  });

  it("/admin/foo) (괄호 닫기) — 괄호 제외", () => {
    const segs = parseActionSegments("(/admin/foo)");
    expect(segs[0]).toEqual({ type: "text", value: "(" });
    expect(segs[1]).toEqual({
      type: "link",
      href: "/admin/foo",
      label: "/admin/foo",
    });
  });
});

// ── actionHasLinks ──────────────────────────────────────────
describe("actionHasLinks", () => {
  it("경로 포함 → true", () => {
    expect(actionHasLinks("/admin/instagram 확인")).toBe(true);
  });

  it("경로 없음 → false", () => {
    expect(actionHasLinks("OAuth 토큰 확인하세요")).toBe(false);
  });

  it("빈 문자열 → false", () => {
    expect(actionHasLinks("")).toBe(false);
  });
});
