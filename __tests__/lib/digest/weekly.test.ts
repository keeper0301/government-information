// ============================================================
// 주간 다이제스트 — loadHotPrograms / loadRecipients 단위 테스트
// ============================================================
// supabase chain 을 직접 stub. cron 발송 로직은 라우트에서 별도 검증.
// ============================================================

import { describe, it, expect } from "vitest";
import {
  HOT_PROGRAMS_LIMIT,
  loadHotPrograms,
  loadRecipients,
} from "@/lib/digest/weekly";

// ──────────────────────────────────────────────────────────
// Helper — supabase chain mock 빌더
// ──────────────────────────────────────────────────────────
// loadHotPrograms 가 호출하는 chain:
//   supabase.from(table).select(...).gte(...).is(...).or(...).order(...).limit(...) → { data, error }
// loadRecipients 가 호출하는 chain:
//   supabase.from('user_alert_rules').select('user_id').eq('is_active', true) → { data }
//   supabase.from('user_latest_consent').select(...).eq().eq() → { data }
// ──────────────────────────────────────────────────────────
type TableData = Record<string, Array<Record<string, unknown>>>;

function makeSupabaseStub(tableData: TableData) {
  // 각 from() 호출마다 체이닝 가능한 thenable builder 반환.
  // 모든 chain method 는 self 반환. 마지막에 await 시점에 data 를 resolve.
  // 타입 시그니처는 일부러 느슨하게 (any) — 단위 테스트 stub 이라 supabase-js 의
  // 정확한 PromiseLike 시그니처를 흉내 낼 필요가 없음.
  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    from(table: string): any {
      const data = tableData[table] ?? [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const builder: any = {
        select() { return builder; },
        gte() { return builder; },
        lte() { return builder; },
        eq() { return builder; },
        is() { return builder; },
        or() { return builder; },
        in() { return builder; },
        order() { return builder; },
        limit() { return builder; },
        // thenable — `await builder` 시 { data, error: null } resolve.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        then(onFulfilled: any, onRejected?: any) {
          return Promise.resolve({ data, error: null }).then(onFulfilled, onRejected);
        },
      };
      return builder;
    },
  };
}

// auth admin listUsers stub
function makeAuthAdmin(
  users: Array<{ id: string; email?: string | null; deleted_at?: string | null }>,
) {
  return {
    auth: {
      admin: {
        listUsers: async () => ({ data: { users } }),
      },
    },
  };
}

// ──────────────────────────────────────────────────────────
// 1) loadHotPrograms — limit 5 정상 반환
// ──────────────────────────────────────────────────────────
describe("loadHotPrograms", () => {
  it("welfare 3건 + loan 2건 → 통합 5건 (limit 5)", async () => {
    const supabase = makeSupabaseStub({
      welfare_programs: [
        { id: "w1", title: "복지1", source: "복지로", apply_end: null, created_at: "2026-04-28" },
        { id: "w2", title: "복지2", source: "정부24", apply_end: "2026-05-30", created_at: "2026-04-27" },
        { id: "w3", title: "복지3", source: "보건복지부", apply_end: null, created_at: "2026-04-26" },
      ],
      loan_programs: [
        { id: "l1", title: "대출1", source: "기업은행", apply_end: null, created_at: "2026-04-28" },
        { id: "l2", title: "대출2", source: "신보", apply_end: "2026-06-01", created_at: "2026-04-27" },
      ],
    });

    const result = await loadHotPrograms(supabase as never);
    expect(result).toHaveLength(5);
    expect(result.filter((p) => p.type === "welfare")).toHaveLength(3);
    expect(result.filter((p) => p.type === "loan")).toHaveLength(2);
  });

  it("limit 보다 많아도 limit 만큼만 반환 (5건 cap)", async () => {
    // welfare 5 + loan 5 = 10건이 stub 에 있어도 결과는 5건.
    const buildPrograms = (prefix: string, count: number) =>
      Array.from({ length: count }, (_, i) => ({
        id: `${prefix}${i}`,
        title: `${prefix} 정책 ${i}`,
        source: "test",
        apply_end: null,
        created_at: `2026-04-${28 - i}`,
      }));
    const supabase = makeSupabaseStub({
      welfare_programs: buildPrograms("w", 5),
      loan_programs: buildPrograms("l", 5),
    });

    const result = await loadHotPrograms(supabase as never);
    expect(result).toHaveLength(HOT_PROGRAMS_LIMIT);
  });

  it("빈 결과 → 빈 배열 (graceful)", async () => {
    const supabase = makeSupabaseStub({
      welfare_programs: [],
      loan_programs: [],
    });

    const result = await loadHotPrograms(supabase as never);
    expect(result).toEqual([]);
  });

  it("type 필드 — welfare_programs → 'welfare', loan_programs → 'loan'", async () => {
    const supabase = makeSupabaseStub({
      welfare_programs: [
        { id: "w1", title: "복지", source: null, apply_end: null, created_at: "2026-04-28" },
      ],
      loan_programs: [
        { id: "l1", title: "대출", source: null, apply_end: null, created_at: "2026-04-28" },
      ],
    });

    const result = await loadHotPrograms(supabase as never);
    const welfare = result.find((p) => p.id === "w1");
    const loan = result.find((p) => p.id === "l1");
    expect(welfare?.type).toBe("welfare");
    expect(loan?.type).toBe("loan");
  });
});

// ──────────────────────────────────────────────────────────
// 2) loadRecipients — 알림 규칙·마케팅 동의 게이트
// ──────────────────────────────────────────────────────────
describe("loadRecipients", () => {
  it("알림 규칙 있는 사용자는 제외 (alert-dispatch 와 중복 0)", async () => {
    const supabase = makeSupabaseStub({
      user_alert_rules: [{ user_id: "u_with_rule" }],
      user_latest_consent: [
        { user_id: "u_with_rule", consented_at: new Date().toISOString(), is_active: true },
        { user_id: "u_no_rule", consented_at: new Date().toISOString(), is_active: true },
      ],
    });
    const authAdmin = makeAuthAdmin([
      { id: "u_with_rule", email: "rule@test.com" },
      { id: "u_no_rule", email: "norule@test.com" },
    ]);

    const result = await loadRecipients(supabase as never, authAdmin as never);
    expect(result).toHaveLength(1);
    expect(result[0]!.user_id).toBe("u_no_rule");
  });

  it("마케팅 동의 안 한 사용자는 제외", async () => {
    const supabase = makeSupabaseStub({
      user_alert_rules: [],
      user_latest_consent: [
        // u1 만 마케팅 동의. u2 는 동의 row 없음.
        { user_id: "u1", consented_at: new Date().toISOString(), is_active: true },
      ],
    });
    const authAdmin = makeAuthAdmin([
      { id: "u1", email: "u1@test.com" },
      { id: "u2", email: "u2@test.com" },
    ]);

    const result = await loadRecipients(supabase as never, authAdmin as never);
    expect(result).toHaveLength(1);
    expect(result[0]!.user_id).toBe("u1");
  });

  it("탈퇴(deleted_at) 사용자는 제외", async () => {
    const supabase = makeSupabaseStub({
      user_alert_rules: [],
      user_latest_consent: [
        { user_id: "u_active", consented_at: new Date().toISOString(), is_active: true },
        { user_id: "u_deleted", consented_at: new Date().toISOString(), is_active: true },
      ],
    });
    const authAdmin = makeAuthAdmin([
      { id: "u_active", email: "a@test.com" },
      { id: "u_deleted", email: "d@test.com", deleted_at: "2026-04-01T00:00:00Z" },
    ]);

    const result = await loadRecipients(supabase as never, authAdmin as never);
    expect(result.map((r) => r.user_id)).toEqual(["u_active"]);
  });

  it("2년 만료된 마케팅 동의는 제외 (정보통신망법 제50조의8)", async () => {
    // 3년 전 동의 — is_active=true 라도 만료 처리.
    const threeYearsAgo = new Date(
      Date.now() - 3 * 365 * 24 * 60 * 60 * 1000,
    ).toISOString();
    const supabase = makeSupabaseStub({
      user_alert_rules: [],
      user_latest_consent: [
        { user_id: "u_expired", consented_at: threeYearsAgo, is_active: true },
        { user_id: "u_fresh", consented_at: new Date().toISOString(), is_active: true },
      ],
    });
    const authAdmin = makeAuthAdmin([
      { id: "u_expired", email: "e@test.com" },
      { id: "u_fresh", email: "f@test.com" },
    ]);

    const result = await loadRecipients(supabase as never, authAdmin as never);
    expect(result).toHaveLength(1);
    expect(result[0]!.user_id).toBe("u_fresh");
  });

  it("빈 결과 → 빈 배열 (graceful)", async () => {
    const supabase = makeSupabaseStub({
      user_alert_rules: [],
      user_latest_consent: [],
    });
    const authAdmin = makeAuthAdmin([]);

    const result = await loadRecipients(supabase as never, authAdmin as never);
    expect(result).toEqual([]);
  });
});
