// ============================================================
// 군포시 보도자료 collector parseListPage 단위 테스트
// ============================================================
// 2026-06-04 끝 "새글" 배지 제거를 `새글$` → `\s*새글\s*$` 로 강화.
//   yeosu(fa7e408) 교훈: 태그제거+\s+정규화 후 끝 공백이 남으면 `새글$` 가 미매칭.

import { describe, it, expect } from "vitest";
import { parseListPage } from "@/lib/scraping/local-press/gunpo";

describe("gunpo parseListPage — 끝 새글 배지 제거 (끝 공백 허용)", () => {
  it('제목 끝 "새글" 배지 제거', () => {
    const html = `<a href="./selectBbsNttView.do?key=3893&bbsNo=685&nttNo=200&pageIndex=1">치매안심마을 치매예방 안내판 설치 <span>새글</span></a>`;
    const items = parseListPage(html);
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe("치매안심마을 치매예방 안내판 설치");
  });

  it('끝 공백이 남아도 "새글" 제거 (강화 핵심 — 기존 `새글$` 는 실패)', () => {
    const html = `<a href="./selectBbsNttView.do?key=3893&bbsNo=685&nttNo=201&pageIndex=1">철쭉공원 정비 사업 완료 <span class="new">새글</span> </a>`;
    const items = parseListPage(html);
    expect(items[0].title).toBe("철쭉공원 정비 사업 완료");
  });

  it('제목 본문의 "새글"은 보존 (끝만 제거)', () => {
    const html = `<a href="./selectBbsNttView.do?key=3893&bbsNo=685&nttNo=202&pageIndex=1">새글 작성 안내 게시판 운영 시작</a>`;
    const items = parseListPage(html);
    expect(items[0].title).toBe("새글 작성 안내 게시판 운영 시작");
  });
});
