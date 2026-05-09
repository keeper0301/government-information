// ============================================================
// telegram-permissions RBAC 단위 테스트
// ============================================================
// PERMISSION_MATRIX × Role 조합 + getRole 우선순위 + backward compat
// + canExecute fallback (matrix 미등록 명령 = owner 만)
// + denyMessage 한국어 형식
// ============================================================

import { describe, it, expect, beforeEach } from "vitest";
import {
  PERMISSION_MATRIX,
  canExecute,
  denyMessage,
  getRole,
  loadRoleSets,
  type Role,
} from "@/lib/telegram/permissions";

describe("PERMISSION_MATRIX 무결성", () => {
  it("모든 정책에 owner 가 포함된다 (owner 는 모든 명령 가능)", () => {
    for (const [cmd, policy] of Object.entries(PERMISSION_MATRIX)) {
      expect(policy).toContain("owner");
    }
  });

  it("위험 명령 (env / redeploy / user) 은 owner 단독", () => {
    expect(PERMISSION_MATRIX.env).toEqual(["owner"]);
    expect(PERMISSION_MATRIX.redeploy).toEqual(["owner"]);
    expect(PERMISSION_MATRIX.user).toEqual(["owner"]);
  });

  it("정보 조회 (help/test/health/today/stats/admin/queue/status) 는 3 role 모두", () => {
    const allRoles: Role[] = ["owner", "staff", "dev"];
    for (const cmd of ["help", "test", "health", "today", "stats", "admin", "queue", "status"]) {
      expect(PERMISSION_MATRIX[cmd]).toEqual(allRoles);
    }
  });
});

describe("canExecute", () => {
  it("matrix 등록 명령 — 정책 따라 통과/차단", () => {
    expect(canExecute("owner", "env")).toBe(true);
    expect(canExecute("staff", "env")).toBe(false);
    expect(canExecute("dev", "env")).toBe(false);

    expect(canExecute("owner", "press")).toBe(true);
    expect(canExecute("staff", "press")).toBe(true);
    expect(canExecute("dev", "press")).toBe(false);

    expect(canExecute("owner", "trigger")).toBe(true);
    expect(canExecute("staff", "trigger")).toBe(false);
    expect(canExecute("dev", "trigger")).toBe(true);
  });

  it("대소문자 무관 (toLowerCase)", () => {
    expect(canExecute("staff", "PRESS")).toBe(true);
    expect(canExecute("staff", "Env")).toBe(false);
  });

  it("matrix 미등록 명령 = owner 만 (보수적 default)", () => {
    expect(canExecute("owner", "future_command")).toBe(true);
    expect(canExecute("staff", "future_command")).toBe(false);
    expect(canExecute("dev", "future_command")).toBe(false);
  });
});

describe("getRole", () => {
  const sets = {
    owner: ["100", "200"],
    staff: ["300"],
    dev: ["400"],
  };

  it("3 role 모두 매칭", () => {
    expect(getRole(100, sets)).toBe("owner");
    expect(getRole(200, sets)).toBe("owner");
    expect(getRole(300, sets)).toBe("staff");
    expect(getRole(400, sets)).toBe("dev");
  });

  it("미등록 chatId → null", () => {
    expect(getRole(999, sets)).toBeNull();
  });

  it("chatId number/string 모두 — 내부 String() 변환", () => {
    expect(getRole("100", sets)).toBe("owner");
    expect(getRole(100, sets)).toBe("owner");
  });

  it("우선순위 owner > staff > dev (한 chatId 가 여러 role 등록 시)", () => {
    const dup = {
      owner: ["500"],
      staff: ["500"],
      dev: ["500"],
    };
    expect(getRole(500, dup)).toBe("owner");
  });
});

describe("loadRoleSets — env 로딩", () => {
  beforeEach(() => {
    delete process.env.TELEGRAM_OWNER_CHAT_IDS;
    delete process.env.TELEGRAM_STAFF_CHAT_IDS;
    delete process.env.TELEGRAM_DEV_CHAT_IDS;
    delete process.env.TELEGRAM_CHAT_ID;
  });

  it("env 미설정 시 모두 빈 배열", () => {
    const r = loadRoleSets();
    expect(r).toEqual({ owner: [], staff: [], dev: [] });
  });

  it("backward compat — TELEGRAM_CHAT_ID 가 owner 로", () => {
    process.env.TELEGRAM_CHAT_ID = "123";
    const r = loadRoleSets();
    expect(r.owner).toContain("123");
  });

  it("OWNER + LEGACY 동시 — 합집합 + 중복 제거", () => {
    process.env.TELEGRAM_OWNER_CHAT_IDS = "100,200";
    process.env.TELEGRAM_CHAT_ID = "200,300";
    const r = loadRoleSets();
    expect(r.owner.sort()).toEqual(["100", "200", "300"]);
  });

  it("콤마 구분 + 공백 trim", () => {
    process.env.TELEGRAM_STAFF_CHAT_IDS = " 100 , 200 ";
    const r = loadRoleSets();
    expect(r.staff).toEqual(["100", "200"]);
  });
});

describe("denyMessage 한국어 형식", () => {
  it("정책 명시", () => {
    const msg = denyMessage("staff", "env");
    expect(msg).toContain("/env");
    expect(msg).toContain("owner");
    expect(msg).toContain("staff");
  });

  it("matrix 미등록 명령 — owner default 표시", () => {
    const msg = denyMessage("staff", "unknown_command");
    expect(msg).toContain("owner");
  });
});
