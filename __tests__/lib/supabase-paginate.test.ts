import { describe, expect, it } from "vitest";
import { fetchAllRows, fetchAllAuthUsers } from "@/lib/supabase/paginate";

// 2026-06-05 코드리뷰 — PostgREST 1000행 한계 회피 페이지네이션 헬퍼.
// 여러 cron·집계가 의존하므로 페이지 경계·종료조건·에러 처리를 고정한다.

// from~to 범위로 slice 해 반환하는 fake 쿼리 (PostgREST .range 모사)
const makePager =
  <T>(all: T[]) =>
  (from: number, to: number) =>
    Promise.resolve({ data: all.slice(from, to + 1), error: null as null });

describe("fetchAllRows — PostgREST 페이지네이션", () => {
  it("단일 페이지(pageSize 미만)는 그대로 반환한다", async () => {
    const all = [1, 2, 3, 4, 5];
    const { rows, truncated, error } = await fetchAllRows(makePager(all), {
      pageSize: 1000,
    });
    expect(rows).toEqual(all);
    expect(truncated).toBe(false);
    expect(error).toBeNull();
  });

  it("여러 페이지에 걸친 결과를 모두 이어붙인다", async () => {
    const all = Array.from({ length: 2500 }, (_, i) => i);
    const { rows } = await fetchAllRows(makePager(all), { pageSize: 1000 });
    expect(rows).toHaveLength(2500);
    expect(rows[0]).toBe(0);
    expect(rows[2499]).toBe(2499);
  });

  it("정확히 pageSize 배수여도 빈 다음 페이지에서 안전하게 멈춘다", async () => {
    const all = Array.from({ length: 2000 }, (_, i) => i);
    const { rows } = await fetchAllRows(makePager(all), { pageSize: 1000 });
    expect(rows).toHaveLength(2000);
  });

  it("빈 결과는 빈 배열을 반환한다", async () => {
    const { rows, truncated } = await fetchAllRows(makePager<number>([]), {
      pageSize: 1000,
    });
    expect(rows).toEqual([]);
    expect(truncated).toBe(false);
  });

  it("error 가 나면 그때까지 모은 rows 와 error 메시지를 반환한다", async () => {
    let call = 0;
    const buildPage = (from: number, to: number) => {
      call += 1;
      if (call === 2) {
        return Promise.resolve({
          data: null,
          error: { message: "boom" },
        });
      }
      const all = Array.from({ length: 2500 }, (_, i) => i);
      return Promise.resolve({ data: all.slice(from, to + 1), error: null });
    };
    const { rows, error } = await fetchAllRows(buildPage, { pageSize: 1000 });
    expect(error).toBe("boom");
    expect(rows).toHaveLength(1000); // 1페이지만 모은 뒤 중단
  });

  it("maxRows 상한에 도달하면 truncated=true 로 멈춘다", async () => {
    const all = Array.from({ length: 100 }, (_, i) => i);
    const { rows, truncated } = await fetchAllRows(makePager(all), {
      pageSize: 1,
      maxRows: 3,
    });
    expect(rows).toHaveLength(3);
    expect(truncated).toBe(true);
  });
});

// page/perPage 기반으로 users 를 반환하는 fake listUsers (auth.admin.listUsers 모사)
const makeUserPager =
  <U>(all: U[]) =>
  (page: number, perPage: number) =>
    Promise.resolve({
      data: { users: all.slice((page - 1) * perPage, (page - 1) * perPage + perPage) },
      error: null as null,
    });

describe("fetchAllAuthUsers — listUsers page 페이지네이션", () => {
  it("단일 페이지(perPage 미만)는 그대로 반환한다", async () => {
    const all = [{ id: "u1" }, { id: "u2" }];
    const { users, error } = await fetchAllAuthUsers(makeUserPager(all), {
      perPage: 1000,
    });
    expect(users).toEqual(all);
    expect(error).toBeNull();
  });

  it("여러 페이지에 걸친 사용자를 모두 이어붙인다", async () => {
    const all = Array.from({ length: 2300 }, (_, i) => ({ id: `u${i}` }));
    const { users } = await fetchAllAuthUsers(makeUserPager(all), { perPage: 1000 });
    expect(users).toHaveLength(2300);
    expect(users[2299].id).toBe("u2299");
  });

  it("빈 결과는 빈 배열을 반환한다", async () => {
    const { users } = await fetchAllAuthUsers(makeUserPager<{ id: string }>([]), {
      perPage: 1000,
    });
    expect(users).toEqual([]);
  });

  it("error 시 그때까지 모은 users 와 error 를 반환한다", async () => {
    let call = 0;
    const listPage = (page: number, perPage: number) => {
      call += 1;
      if (call === 2) {
        return Promise.resolve({ data: null, error: { message: "auth down" } });
      }
      const all = Array.from({ length: 2300 }, (_, i) => ({ id: `u${i}` }));
      return Promise.resolve({
        data: { users: all.slice((page - 1) * perPage, (page - 1) * perPage + perPage) },
        error: null,
      });
    };
    const { users, error } = await fetchAllAuthUsers(listPage, { perPage: 1000 });
    expect(error).toBe("auth down");
    expect(users).toHaveLength(1000);
  });

  it("maxPages 상한에서 멈춘다", async () => {
    const all = Array.from({ length: 10000 }, (_, i) => ({ id: `u${i}` }));
    const { users } = await fetchAllAuthUsers(makeUserPager(all), {
      perPage: 1,
      maxPages: 3,
    });
    expect(users).toHaveLength(3);
  });
});
