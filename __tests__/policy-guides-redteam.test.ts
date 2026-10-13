import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { EDITORIAL_GUIDES } from "@/lib/editorial-guides";
import { getGuideEvidence } from "@/lib/guide-evidence";
import { getGuides, getGuideBySlug, getRelatedGuides, getGuideDisplayDates, rowToGuide } from "@/lib/policy-guides";

const mock = vi.hoisted(() => ({ enabled: true, rows: [] as Record<string, unknown>[], ranges: [] as number[][], orders: [] as string[], signals: [] as AbortSignal[], failAt: -1, repeat: false, detailFails: false }));
vi.mock("@/lib/supabase/env", () => ({ hasSupabaseAnonEnv: () => mock.enabled }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ from: () => {
  let slug = "";
  let candidates: string[] | undefined;
  const query = {
    select: () => query,
    abortSignal: (signal: AbortSignal) => { mock.signals.push(signal); return query; },
    in: (_: string, slugs: string[]) => { candidates = slugs; return query; },
    order: (column: string) => { mock.orders.push(column); return query; },
    eq: (_: string, value: string) => { slug = value; return query; },
    maybeSingle: async () => ({ data: mock.rows.find(row => row.slug === slug) ?? null, error: mock.detailFails ? new Error("조회 실패") : null }),
    range: async (from: number, to: number) => {
      mock.ranges.push([from, to]);
      return { data: mock.repeat ? mock.rows : mock.rows.filter(row => !candidates || candidates.includes(String(row.slug))).slice(from, to + 1), error: from === mock.failAt ? new Error("synthetic failure") : null };
    },
  };
  return query;
} }) }));

function row(index: number) {
  return { id: `synthetic-${index}`, slug: `unrelated-${index}`, title: "Synthetic unrelated", program_id: "synthetic", program_type: "welfare", post_1: "body 1", post_2: "body 2", post_3: "body 3", post_4: "body 4", post_5: "body 5", rotation_idx: null, threads_url: null, og_image_url: null, published_at: "2025-01-01", updated_at: "2025-01-02" };
}
const now = new Date("2026-10-04T12:00:00Z");
beforeEach(() => { mock.enabled = true; mock.rows = []; mock.ranges = []; mock.orders = []; mock.signals = []; mock.failAt = -1; mock.repeat = false; mock.detailFails = false; });

describe("complete candidate curation", () => {
  it("조회 제한 신호를 실제 저장소 요청에 전달한다", async () => {
    const signal = AbortSignal.timeout(10000);
    await getGuides(50, { publicationOnly: true, signal });
    expect(mock.signals).toEqual([signal]);
  });
  it("공개 목록은 검수 후보만 조회하되 변경된 최신 본문을 숨긴다", async () => {
    const slug = "documents-before-government-benefit";
    mock.rows = Array.from({ length: 450 }, (_, index) => row(index));
    mock.rows.push({ ...row(451), slug, title: "승인 후 바뀐 본문" });
    const guides = await getGuides(50, { publicationOnly: true });
    expect(guides.some(guide => guide.slug === slug)).toBe(false);
    expect(mock.ranges).toHaveLength(2);
  });
  it.each([50, 200, 450])("retains evidence-bound pilots with %i unrelated DB rows", async count => {
    mock.rows = Array.from({ length: count }, (_, i) => row(i));
    const guides = await getGuides(50);
    expect(guides).toHaveLength(50);
    expect(guides.slice(0, 3).every(guide => !!getGuideEvidence(guide))).toBe(true);
    expect(mock.orders.slice(0, 2)).toEqual(["published_at", "id"]);
  });
  it("finds older category candidates beyond the initial page before limiting", async () => {
    mock.rows = Array.from({ length: 450 }, (_, i) => row(i));
    mock.rows.push({ ...row(450), title: "소상공인 오래된 글", slug: "old-business" });
    const guides = await getGuides(50, { categorySlugs: ["business"] });
    expect(guides.some(g => g.slug === "old-business")).toBe(true);
    expect(mock.ranges).toEqual([[0, 199], [200, 399], [400, 599], [451, 650]]);
  });
  it("keeps DB priority for a changed same-slug version without borrowing evidence", async () => {
    const pilot = EDITORIAL_GUIDES.find(g => getGuideEvidence(g))!;
    mock.rows = [{ ...row(1), slug: pilot.slug, title: pilot.title }];
    const guides = await getGuides(200);
    const matches = guides.filter(g => g.slug === pilot.slug);
    expect(matches).toHaveLength(1);
    expect(matches[0].id).toBe("synthetic-1");
    expect(getGuideEvidence(matches[0])).toBeUndefined();
  });
  it("curates/filter builtins with no environment and excludes related ID before limit", async () => {
    mock.enabled = false;
    const guides = await getGuides(3);
    expect(guides.every(g => !!getGuideEvidence(g))).toBe(true);
    expect((await getRelatedGuides(guides[0].id, 3)).some(g => g.id === guides[0].id)).toBe(false);
    expect(await getGuides(3, { categorySlugs: ["unknown"] })).toEqual([]);
  });
  it("throws on a failed later page rather than claiming partial completeness", async () => {
    mock.rows = Array.from({ length: 250 }, (_, i) => row(i)); mock.failAt = 200;
    await expect(getGuides()).rejects.toThrow("temporarily unavailable");
  });
  it("throws explicitly at the pagination safety cap", async () => {
    mock.rows = Array.from({ length: 200 }, (_, i) => row(i)); mock.repeat = true;
    await expect(getGuides()).rejects.toThrow("safety cap");
    expect(mock.ranges).toHaveLength(300);
  });
});

describe("validated content and shared date provenance", () => {
  it("조회 실패 시 승인 가능한 내장 본문으로 돌아가지 않는다", async () => {
    mock.detailFails = true;
    await expect(getGuideBySlug("documents-before-government-benefit")).rejects.toThrow("temporarily unavailable");
  });
  it.each([null, 123, "", "   "])("rejects invalid DB title/body %j", bad => {
    for (const field of ["title", "post_1", "post_2", "post_3", "post_4", "post_5"]) {
      expect(() => rowToGuide({ ...row(0), [field]: bad } as unknown as Parameters<typeof rowToGuide>[0])).toThrow("Invalid policy guide content");
    }
  });
  it("rejects invalid detail content rather than returning a blank successful guide", async () => {
    mock.rows = [{ ...row(0), post_1: null }];
    await expect(getGuideBySlug("unrelated-0")).rejects.toThrow("Invalid policy guide content");
  });
  it.each(["", "garbage", "2099-01-01", "2026-02-30", "2025-02-29", "2026-13-01", "2026-01-01T25:00:00Z", "2026-01-01T12:00:00", "2026-10-04T13:00:00Z"])("omits invalid/unknown/future %s", date => {
    const guide = rowToGuide(row(0));
    expect(getGuideDisplayDates({ ...guide, publishedAt: date, updatedAt: date }, now)).toEqual({ publishedAt: undefined, updatedAt: undefined });
  });
  it("uses bound actualUpdatedAt ahead of DB timestamps and omits future publication", () => {
    const pilot = EDITORIAL_GUIDES.find(g => getGuideEvidence(g))!;
    expect(getGuideDisplayDates({ ...pilot, publishedAt: "2099-01-01", updatedAt: "2099-01-01" }, new Date("2026-10-05T12:00:00Z"))).toEqual({ publishedAt: undefined, updatedAt: getGuideEvidence(pilot)!.actualUpdatedAt });
  });
  it("accepts leap days and canonicalizes timestamp zones", () => {
    const guide = rowToGuide(row(0));
    expect(getGuideDisplayDates({ ...guide, publishedAt: "2024-02-29", updatedAt: "2026-10-03T09:00:00+09:00" }, now)).toEqual({ publishedAt: "2024-02-29", updatedAt: "2026-10-03T00:00:00.000Z" });
  });
  it("wires the shared dates into OG, JSON-LD, body and sitemap and category options into both hub branches", () => {
    const detail = readFileSync("app/guides/[slug]/page.tsx", "utf8");
    for (const text of ["publishedTime: publication.published ? dates.publishedAt", "modifiedTime: publication.published ? dates.updatedAt", "datePublished: dates.publishedAt", "dateModified: dates.updatedAt", "dates.updatedAt.slice(0, 10)"]) expect(detail).toContain(text);
    expect(readFileSync("app/sitemap.ts", "utf8")).toContain("lastModified: getGuideDisplayDates(g).updatedAt");
    expect(readFileSync("app/c/[category]/page.tsx", "utf8").match(/loadCategoryGuides\(category\)/g)).toHaveLength(2);
  });
});
