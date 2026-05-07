// ============================================================
// 워드프레스 카테고리·태그 ID 자동 매핑
// ============================================================
// 워드프레스 REST API 의 categories/tags 필드는 정수 ID 배열만 받음 (slug X).
// publisher 가 발행 전에 keepioo 카테고리 slug + 태그 이름을 ID 로 매핑.
//
// 흐름:
//   1) GET /wp/v2/categories?slug=청년 → 있으면 ID 반환
//   2) 없으면 POST /wp/v2/categories { name, slug } → 새로 생성 후 ID 반환
//   3) tags 도 동일 (단, slug 대신 name 으로 검색·생성)
//
// 캐시:
//   - module-level Map (Vercel serverless 함수 1회 invoke 안에서 재사용)
//   - cold start 시 캐시 비워짐 → 다음 발행에서 다시 lookup
//   - 매일 1건 발행이라 캐시 효과는 작지만 향후 다건 발행 시 유효
//
// 안정성:
//   - lookup·생성 실패 시 그 slug 만 skip (빈 배열 반환). 발행 자체는 진행.
//   - timeout 5초 (카테고리·태그 8건 미만이라 충분).
// ============================================================

const TERMS_TIMEOUT_MS = 5_000;

// 캐시 — module 수준. cold start 동안 재사용, restart 시 비워짐.
const categoryIdCache = new Map<string, number>();
const tagIdCache = new Map<string, number>();

/**
 * keepioo 카테고리 slug 배열 → 워드프레스 category ID 배열.
 * 없는 카테고리는 자동 생성. 실패 시 그 slug 만 skip.
 *
 * @param slugs        ["청년"] 같은 slug 배열
 * @param apiBaseUrl   "https://keepioopolicy.wordpress.com/wp-json/wp/v2"
 * @param authHeader   "Basic xxx" Application Password Basic Auth
 */
export async function fetchOrCreateCategoryIds(
  slugs: string[],
  apiBaseUrl: string,
  authHeader: string,
): Promise<number[]> {
  if (slugs.length === 0) return [];
  // 중복 제거 — 같은 slug 가 두 번 들어오면 캐시 미스 시 동시 POST 로 워드프레스 409 충돌 위험.
  const uniqueSlugs = [...new Set(slugs)];

  const ids: number[] = [];
  for (const slug of uniqueSlugs) {
    // 1) 캐시 hit
    if (categoryIdCache.has(slug)) {
      ids.push(categoryIdCache.get(slug)!);
      continue;
    }

    // 2) GET 으로 조회 → 있으면 ID 사용
    const found = await getTermBySlug("categories", slug, apiBaseUrl, authHeader);
    if (found !== null) {
      categoryIdCache.set(slug, found);
      ids.push(found);
      continue;
    }

    // 3) 없으면 POST 로 생성
    const created = await createTerm("categories", { name: slug, slug }, apiBaseUrl, authHeader);
    if (created !== null) {
      categoryIdCache.set(slug, created);
      ids.push(created);
    }
    // 생성 실패 시 그 slug 만 skip (발행은 진행)
  }
  return ids;
}

/**
 * keepioo 태그 이름 배열 → 워드프레스 tag ID 배열.
 * 태그는 slug 가 아니라 name 기준 (한글 자유 텍스트).
 * 없는 태그는 자동 생성. 워드프레스가 name 으로 slug 자동 생성.
 *
 * @param names    ["월 50만 원", "청년"] 같은 한글 태그 이름 배열
 */
export async function fetchOrCreateTagIds(
  names: string[],
  apiBaseUrl: string,
  authHeader: string,
): Promise<number[]> {
  if (names.length === 0) return [];
  // 중복 제거 — 같은 name 이 두 번 들어오면 캐시 미스 시 동시 POST 로 워드프레스 409 충돌 위험.
  const uniqueNames = [...new Set(names.map((n) => n.trim()).filter(Boolean))];

  const ids: number[] = [];
  for (const name of uniqueNames) {
    // 1) 캐시 hit
    if (tagIdCache.has(name)) {
      ids.push(tagIdCache.get(name)!);
      continue;
    }

    // 2) GET 으로 조회 — search 파라미터로 name 부분일치 검색 후 정확 일치 필터
    const found = await searchTermByName("tags", name, apiBaseUrl, authHeader);
    if (found !== null) {
      tagIdCache.set(name, found);
      ids.push(found);
      continue;
    }

    // 3) 없으면 POST 로 생성 (name 만 — slug 는 워드프레스 자동 생성)
    const created = await createTerm("tags", { name }, apiBaseUrl, authHeader);
    if (created !== null) {
      tagIdCache.set(name, created);
      ids.push(created);
    }
  }
  return ids;
}

// 슬러그 정확 매칭으로 term 조회 — categories 용
async function getTermBySlug(
  resource: "categories" | "tags",
  slug: string,
  apiBaseUrl: string,
  authHeader: string,
): Promise<number | null> {
  const url = `${apiBaseUrl}/${resource}?slug=${encodeURIComponent(slug)}`;
  const json = await safeFetchJson(url, "GET", null, authHeader);
  if (Array.isArray(json) && json.length > 0) {
    const id = (json[0] as { id?: unknown }).id;
    return typeof id === "number" ? id : null;
  }
  return null;
}

// 이름 검색 (부분 일치) 후 정확 일치 필터 — tags 용
async function searchTermByName(
  resource: "tags",
  name: string,
  apiBaseUrl: string,
  authHeader: string,
): Promise<number | null> {
  const url = `${apiBaseUrl}/${resource}?search=${encodeURIComponent(name)}&per_page=20`;
  const json = await safeFetchJson(url, "GET", null, authHeader);
  if (!Array.isArray(json)) return null;
  for (const item of json) {
    const term = item as { id?: unknown; name?: unknown };
    if (typeof term.name === "string" && term.name.trim() === name && typeof term.id === "number") {
      return term.id;
    }
  }
  return null;
}

// term 생성 — POST /categories or POST /tags
async function createTerm(
  resource: "categories" | "tags",
  body: { name: string; slug?: string },
  apiBaseUrl: string,
  authHeader: string,
): Promise<number | null> {
  const url = `${apiBaseUrl}/${resource}`;
  const json = await safeFetchJson(url, "POST", body, authHeader);
  if (!json || typeof json !== "object") return null;
  const id = (json as { id?: unknown }).id;
  return typeof id === "number" ? id : null;
}

// 공통 fetch — timeout · 에러 graceful 처리. 실패 시 null 반환 (호출자가 skip).
async function safeFetchJson(
  url: string,
  method: "GET" | "POST",
  body: object | null,
  authHeader: string,
): Promise<unknown> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TERMS_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    });
    if (!res.ok) {
      // 400 series 는 권한 부족·이미 존재 등 — 무시 (호출자 skip)
      console.warn(`[wordpress-terms] ${method} ${url} → HTTP ${res.status}`);
      return null;
    }
    return await res.json();
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.warn(`[wordpress-terms] ${method} ${url} 실패: ${message}`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// 테스트·재시작 시 캐시 초기화 (프로덕션에서는 사용 안 함)
export function _clearTermCacheForTests(): void {
  categoryIdCache.clear();
  tagIdCache.clear();
}
