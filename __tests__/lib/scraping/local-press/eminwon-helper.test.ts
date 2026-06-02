// ============================================================
// eminwon 공용 helper parseEminwonDetailBody 단위 테스트
// ============================================================
// 2026-06-02 — 부산 북구 본문이 td 아닌 div 에 존재(기장은 td). td 우선 → td 부족 시
// div/textarea fallback. 기장(td)·부산북구(div) 양쪽 회귀 방어.

import { describe, it, expect } from "vitest";
import {
  parseEminwonListItems,
  parseEminwonDetailBody,
} from "@/lib/scraping/local-press/_eminwon_helper";

const BODY =
  "부산 북구 만덕2동 행정복지센터는 지난 22일 만덕2동 자율방재단과 함께 관내 재해 취약지역을 " +
  "점검하고 여름철 집중호우에 대비한 안전 활동을 펼쳤다고 밝혔다. 이번 점검은 침수 우려 지역과 " +
  "노후 축대를 중심으로 진행됐으며 주민 대피 경로와 배수 시설 상태를 꼼꼼히 살폈다. 동 관계자는 " +
  "앞으로도 재해로부터 안전한 마을을 만들기 위해 지속적으로 노력하겠다고 전했다. 주민들은 이번 " +
  "점검으로 안전에 대한 신뢰가 한층 높아졌다고 입을 모았으며 행정복지센터는 앞으로도 정기 점검과 " +
  "주민 대상 안전 교육을 꾸준히 이어가 재해 없는 안전한 마을을 만들겠다고 강조했다.";

describe("parseEminwonDetailBody", () => {
  it("td 본문 추출 (기장 패턴)", () => {
    expect(parseEminwonDetailBody(`<td>${BODY}</td>`)).toContain("만덕2동");
  });

  it("td 가 공공누리 문구뿐이면 div 본문으로 fallback (부산북구 패턴)", () => {
    const html = `
      <td>본 저작물은 "공공누리" 제4유형:출처표시 상업적 이용금지 변경금지 조건에 따라 이용할 수 있습니다.</td>
      <div>${BODY}</div>`;
    const body = parseEminwonDetailBody(html);
    expect(body).toContain("만덕2동");
    expect(body).not.toContain("공공누리");
  });

  it("td 본문이 충분하면 div wrapper(라벨 포함) 무시 — td 우선 (기장 깨끗)", () => {
    const html = `
      <div>게시물 상세내용 보기 ${BODY} 목록 이전글 다음글</div>
      <td>${BODY}</td>`;
    const body = parseEminwonDetailBody(html);
    expect(body).toContain("만덕2동");
    expect(body).not.toContain("게시물 상세내용 보기"); // td 우선이라 wrapper 라벨 미포함
  });

  it("본문 250자 미만 — null", () => {
    expect(parseEminwonDetailBody(`<td>짧은 글입니다.</td>`)).toBeNull();
  });
});

describe("parseEminwonListItems", () => {
  it("searchDetail onclick + 제목·부서·날짜 매핑", () => {
    const html = `
      <tr>
        <td>1</td>
        <td><a href="javascript:searchDetail('11809')">부산 북구, 여름철 안전점검 실시</a></td>
        <td>미래전략과</td>
        <td>2026-05-22</td>
      </tr>`;
    const items = parseEminwonListItems(html);
    expect(items).toHaveLength(1);
    expect(items[0].newsEpctNo).toBe("11809");
    expect(items[0].title).toContain("여름철 안전점검");
    expect(items[0].publishedDate).toBe("2026-05-22");
  });
});
