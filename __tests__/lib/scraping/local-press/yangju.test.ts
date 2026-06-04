// ============================================================
// 양주시 보도자료 collector parseListPage 단위 테스트
// ============================================================
// 2026-06-04 제목 끝 "새글" 배지 junk 수리 회귀 방지.
//   라이브 확인: "2026년 양주시 … 참여자 모집 새글" 처럼 신규 글 끝에 배지 텍스트 잔존.

import { describe, it, expect } from "vitest";
import { parseListPage } from "@/lib/scraping/local-press/yangju";

describe("yangju parseListPage — 끝 새글 배지 제거", () => {
  it('제목 끝 "새글" 배지 제거 (라이브 구조)', () => {
    const html = `<a href="./selectBbsNttView.do?key=202&bbsNo=13&nttNo=100&pageIndex=1">2026년 양주시 취업 멘토링 콘서트 참여자 모집 <span class="new">새글</span></a>`;
    const items = parseListPage(html);
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe(
      "2026년 양주시 취업 멘토링 콘서트 참여자 모집",
    );
  });

  it('제목 본문이 "새글"로 시작해도 끝이 아니면 보존 (오제거 방지)', () => {
    const html = `<a href="./selectBbsNttView.do?key=202&bbsNo=13&nttNo=101&pageIndex=1">새글 발견 캠페인 행사 안내</a>`;
    const items = parseListPage(html);
    expect(items[0].title).toBe("새글 발견 캠페인 행사 안내");
  });
});
