// ============================================================
// PostgREST 1000행 한계 회피 — .range() 페이지네이션 공통 헬퍼
// ============================================================
// 이 프로젝트의 Supabase 는 PostgREST max-rows 가 1000 이라, 단일 select 는
// .limit(50000) 을 줘도 최대 1000행만 반환한다. 1000행을 넘는 결과를 전량
// 가져와야 하는 집계·매칭 로직에서 이 헬퍼로 다음 페이지를 이어서 수집한다.
//
// ⚠️ buildPage 가 반환하는 쿼리에는 반드시 안정 정렬(.order, 보통 created_at +
//    id tie-break)을 포함해야 페이지 경계에서 row 가 중복/누락되지 않는다.
// ============================================================

type PageResult<T> = {
  data: T[] | null;
  error: { message: string } | null;
};

export type FetchAllResult<T> = {
  rows: T[];
  // maxRows 상한에 도달해 더 있을 수 있는데 끊겼는지 (true 면 상한 상향 검토)
  truncated: boolean;
  error: string | null;
};

/**
 * from~to 범위로 select 하는 쿼리(buildPage)를 빈 페이지/마지막 페이지까지 반복
 * 호출해 전체 row 를 모은다.
 *
 * @example
 * const { rows } = await fetchAllRows((from, to) =>
 *   admin.from("user_events").select("program_id, event_type")
 *     .gte("created_at", since).order("created_at").order("id").range(from, to),
 * );
 */
export async function fetchAllRows<T>(
  buildPage: (from: number, to: number) => PromiseLike<PageResult<T>>,
  options: { pageSize?: number; maxRows?: number } = {},
): Promise<FetchAllResult<T>> {
  const pageSize = options.pageSize ?? 1000;
  const maxRows = options.maxRows ?? 200000;
  const rows: T[] = [];

  for (let from = 0; from < maxRows; from += pageSize) {
    const { data, error } = await buildPage(from, from + pageSize - 1);
    if (error) return { rows, truncated: false, error: error.message };
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < pageSize) break; // 마지막 페이지
  }

  return { rows, truncated: rows.length >= maxRows, error: null };
}

// ============================================================
// auth.admin.listUsers 전용 페이지네이션
// ============================================================
// Supabase Auth 의 listUsers 는 .range 가 아니라 page/perPage 기반이고 한 페이지
// 최대 1000명만 반환한다. 가입자가 1000명을 넘으면 첫 페이지만 받아 일부 사용자가
// 누락되므로(알림 미발송·CSV 누락 등) page 를 1부터 증가시키며 전량 수집한다.
export async function fetchAllAuthUsers<U>(
  listPage: (
    page: number,
    perPage: number,
  ) => PromiseLike<{
    data: { users: U[] } | null;
    error: { message: string } | null;
  }>,
  options: { perPage?: number; maxPages?: number } = {},
): Promise<{ users: U[]; error: string | null }> {
  const perPage = options.perPage ?? 1000;
  const maxPages = options.maxPages ?? 50;
  const users: U[] = [];

  for (let page = 1; page <= maxPages; page += 1) {
    const { data, error } = await listPage(page, perPage);
    if (error) return { users, error: error.message };
    const batch = data?.users ?? [];
    if (batch.length === 0) break;
    users.push(...batch);
    if (batch.length < perPage) break; // 마지막 페이지
  }

  return { users, error: null };
}
