import { describe, it, expect } from "vitest";
import { nextDifferentIdIndex } from "@/lib/scraping/local-press/_date_window";

// 목록 날짜 윈도우 경계 헬퍼 회귀 방어 (AGENTS.md 의무 — parser silent 회귀 차단).
// 인접 글 날짜 침범을 막으려고 '현재 seq 와 다른 식별자' 등장 직전까지로 경계를 잡는다.

describe("nextDifferentIdIndex", () => {
  it("다음 글(다른 list_no) 위치를 반환해 인접 글 날짜 침범을 차단", () => {
    const html = `<a href="?list_no=10">글A</a> 2026-06-01 <a href="?list_no=11">글B</a> 2026-05-31`;
    const from = html.indexOf("2026-06-01"); // 현재 글 a 태그 이후
    const idx = nextDifferentIdIndex(html, from, "list_no", "10");
    expect(idx).toBeGreaterThan(-1);
    // 경계 앞(현재 글 영역)엔 글A·날짜가, 경계 뒤엔 다음 글(list_no=11)이 온다
    expect(html.slice(0, idx)).toContain("2026-06-01");
    expect(html.slice(idx)).toContain("list_no=11");
  });

  it("같은 글에 동일 식별자 링크가 2개(썸네일+제목)여도 다른 id 에서 경계", () => {
    const html =
      `<a href="?list_no=10"><img></a><a href="?list_no=10">글A</a> 2026-06-01 <a href="?list_no=11">글B</a>`;
    const from = html.indexOf("<img>"); // 첫(썸네일) 링크 직후
    const idx = nextDifferentIdIndex(html, from, "list_no", "10");
    // 같은 list_no=10(제목 링크)은 건너뛰고 list_no=11 을 경계로 잡아야 한다
    expect(html.slice(idx)).toContain("list_no=11");
    expect(html.slice(0, idx)).toContain("글A"); // 현재 글 제목·날짜는 경계 안에 보존
  });

  it("다음 다른 글이 없으면 -1 (마지막 글 → 고정 윈도우 fallback)", () => {
    const html = `<a href="?nttNo=5">글</a> 2026-06-01`;
    expect(nextDifferentIdIndex(html, 0, "nttNo", "5")).toBe(-1);
  });

  it("식별자 비교는 문자열 — 같은 숫자는 같은 글로 취급", () => {
    const html = `<a href="?msg_seq=100">A</a><a href="?msg_seq=100">B</a>`;
    expect(nextDifferentIdIndex(html, 0, "msg_seq", "100")).toBe(-1);
  });
});
