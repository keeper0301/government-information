// ============================================================
// 경기도 parseListPage + parseDetailBody 단위 테스트
// ============================================================
// 2026-06-03 — postBody 안에 첨부 <ul class="fileset..">(파일명·"바로듣기"·"전체 다운로드")가
// 본문에 캡처되던 버그 fix. postBody div-depth + 첨부 ul·헤더 라벨 제거 회귀 방어.

import { describe, it, expect } from "vitest";
import {
  parseListPage,
  parseDetailBody,
} from "@/lib/scraping/local-press/gyeonggi";

const BODY =
  "경기도는 여름철 집중호우에 대비해 도내 31개 시군과 함께 재난 대응 체계를 점검했다고 밝혔다. " +
  "이번 점검은 침수 우려 지역과 산사태 위험 지역을 중심으로 진행됐으며 배수시설과 대피 경로를 " +
  "꼼꼼히 살폈다. 도는 재난 예측 시스템을 고도화해 선제적으로 대응하고 도민 안전을 최우선으로 " +
  "지키겠다고 강조했다. 도지사는 관계 부서에 빈틈없는 대비 태세를 갖춰 도민 생명과 안전을 " +
  "지키는 데 최선을 다해달라고 당부했다.";

describe("gyeonggi parseDetailBody", () => {
  it("postBody div-depth 추출 + 첨부 ul·헤더 라벨 제거", () => {
    const html = `
      <div class="postBody">
        <p>${BODY}</p>
        <ul class="fileset26-list">
          <li><a>재난대응 훈련.hwpx</a> 바로듣기</li>
          <li>재난대응 훈련 1.jpg</li>
          <li>재난대응 훈련 2.jpg</li>
        </ul>
        첨부파일 전체 다운로드
      </div>
      <ul class="related-list"><li>관련 글</li></ul>`;
    const body = parseDetailBody(html);
    expect(body).toContain("당부했다");
    expect(body).not.toContain("바로듣기");
    expect(body).not.toContain("전체 다운로드");
    expect(body).not.toContain(".hwpx");
    expect(body).not.toContain("첨부파일");
  });

  it("postBody 없으면 null", () => {
    expect(parseDetailBody(`<div class="other"><p>${BODY}</p></div>`)).toBeNull();
  });

  it("닫는 div 없으면 null", () => {
    expect(parseDetailBody(`<div class="postBody"><p>${BODY}</p>`)).toBeNull();
  });
});

describe("gyeonggi parseListPage", () => {
  it("brief_gongbo_view number + 제목 + 날짜 매핑", () => {
    const html = `
      <a href="/briefing/brief_gongbo_view.do;jsessionid=ABC?number=556677&x=1" class="txtLink">경기도, 재난 대응 체계 점검</a>
      <span>2026.06.02</span>`;
    const items = parseListPage(html);
    expect(items).toHaveLength(1);
    expect(items[0].seq).toBe("556677");
    expect(items[0].title).toContain("재난 대응 체계");
    expect(items[0].publishedDate).toBe("2026-06-02");
    expect(items[0].sourceUrl).toContain("number=556677");
  });
});
