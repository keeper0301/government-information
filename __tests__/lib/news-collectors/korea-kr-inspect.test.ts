import { afterEach, describe, expect, it, vi } from "vitest";
import { inspectKoreaKrRecent } from "@/lib/news-collectors/korea-kr";

function rss(items: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?><rss><channel>${items}</channel></rss>`;
}

function item({
  title,
  link,
  pubDate,
  description = "",
}: {
  title: string;
  link: string;
  pubDate: string;
  description?: string;
}): string {
  return `<item>
    <title><![CDATA[${title}]]></title>
    <link>${link}</link>
    <description><![CDATA[${description}]]></description>
    <pubDate>${pubDate}</pubDate>
    <guid>${link}</guid>
  </item>`;
}

describe("inspectKoreaKrRecent", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("DB write 없이 원본 RSS의 keepioo 관련 최근 후보를 센다", async () => {
    const recent = "Sun, 28 Jun 2026 02:00:00 GMT";
    const old = "Fri, 26 Jun 2026 02:00:00 GMT";

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      const body = url.includes("dept_molit")
        ? rss(
            item({
              title: "하반기 국토교통 청년인턴 모집",
              link: "https://www.korea.kr/briefing/pressReleaseView.do?newsId=1",
              pubDate: recent,
              description: "청년 채용 안내",
            }) +
              item({
                title: "도시 경관 회의",
                link: "https://www.korea.kr/briefing/pressReleaseView.do?newsId=2",
                pubDate: recent,
                description: "관련 없는 일반 뉴스",
              }),
          )
        : url.includes("dept_mafra")
          ? rss(
              item({
                title: "농업인 지원 사업 안내",
                link: "https://www.korea.kr/briefing/pressReleaseView.do?newsId=3",
                pubDate: old,
                description: "농업인 대상 지원금",
              }),
            )
          : rss("");

      return new Response(body, { status: 200 });
    });

    const result = await inspectKoreaKrRecent(new Date("2026-06-27T02:00:00Z"));

    expect(result.errors).toBe(0);
    expect(result.total).toBe(2);
    expect(result.recent).toBe(1);
    expect(result.latestPublishedAt).toBe("2026-06-28T02:00:00.000Z");
    expect(result.breakdown["korea-kr-dept-molit"]).toEqual({ total: 1, recent: 1 });
    expect(result.breakdown["korea-kr-dept-mafra"]).toEqual({ total: 1, recent: 0 });
  });
});
