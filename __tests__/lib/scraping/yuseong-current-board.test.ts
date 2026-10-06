// 현재 공식 게시판에서 최신 날짜와 본문을 읽는지 확인합니다.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseListItems, parseDetailBody } from "@/lib/scraping/local-press/yuseong-eminwon";

describe("유성구 현재 보도자료", () => {
  it("문자와 숫자가 섞인 글 번호와 해당 행의 게시일을 읽는다", () => {
    const html = readFileSync("__tests__/fixtures/local-press/yuseong/list.html", "utf8");
    const items = parseListItems(html);
    expect(items).toHaveLength(10);
    expect(items[0]).toMatchObject({ seq: "B000000144625Sr3aF5", publishedDate: "2026-10-06" });
    expect(items[0].title).toContain("리윤바이오");
  });
  it("본문만 읽고 파일 목록이나 담당자 안내는 제외한다", () => {
    const html = readFileSync("__tests__/fixtures/local-press/yuseong/detail.html", "utf8");
    const body = parseDetailBody(html);
    expect(body?.length).toBeGreaterThanOrEqual(250);
    expect(body).toContain("리윤바이오");
    expect(body).not.toContain("FileDown");
  });
});
