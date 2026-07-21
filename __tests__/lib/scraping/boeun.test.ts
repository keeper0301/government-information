// boeun parser 회귀 방어. 공식 보도자료 게시판의
// p-media gallery 목록과 p-table__content 상세 본문을 검증한다.

import { describe, expect, it } from "vitest";
import {
  parseDetailBody,
  parseListPage,
} from "@/lib/scraping/local-press/boeun";

const MOCK_LIST_HTML = `
<ul class="p-media-list p-media--cell3">
  <li class="p-media">
    <a class="p-media__link" href="./selectBbsNttView.do?key=138&amp;bbsNo=209&amp;nttNo=220355&amp;pageIndex=1">
      <div class="p-media__body">
        <div class="p-media__heading">
          <em class="p-media__heading-text">
            (7.21.)보은군 속리산라이온스클럽, 이·취임식 축하 마음 경로당 나눔으로 이어져
          </em>
        </div>
        <div class="p-author__info">
          <time class="p-split">2026-07-21</time>
        </div>
      </div>
    </a>
  </li>
</ul>
`;

const MOCK_DETAIL_HTML = `
<table class="p-table block">
  <tbody class="p-table--th-left">
    <tr>
      <th scope="row">제목</th>
      <td><span class="p-table__subject_text">(7.21.)보은군 속리산라이온스클럽, 이·취임식 축하 마음 경로당 나눔으로 이어져</span></td>
    </tr>
    <tr>
      <th scope="row">내용</th>
      <td colspan="2" title="내용" class="p-table__content">
        충북 보은군 속리산라이온스클럽은 지난 20일 회장 이·취임식에서 받은 찬조로 마련한 백미 30포를 속리산면 행정복지센터에 기탁하며 지역사회 나눔을 실천했다.<br/>
        이번 기탁은 이·취임식을 축하해 준 지역사회의 따뜻한 마음을 지역 어르신들과 함께 나누기 위해 회원들의 뜻을 모아 마련한 것으로, 기탁된 백미는 관내 경로당에 전달돼 어르신들의 식생활 지원에 활용될 예정이다.<br/>
        강영철 회장은 앞으로도 어려운 이웃과 함께하는 다양한 봉사활동을 통해 지역사회에 희망과 온정을 전하는 속리산라이온스클럽이 되도록 최선을 다하겠다고 말했다.<br/>
        박영미 속리산면장은 기탁해 주신 백미는 관내 경로당에 소중히 전달해 어르신들께 따뜻한 마음이 잘 전해질 수 있도록 하겠다고 말했다.
      </td>
    </tr>
  </tbody>
</table>
`;

describe("boeun parseListPage", () => {
  it("gallery 목록에서 nttNo, 제목, 등록일을 추출한다", () => {
    const items = parseListPage(MOCK_LIST_HTML);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      seq: "220355",
      title:
        "(7.21.)보은군 속리산라이온스클럽, 이·취임식 축하 마음 경로당 나눔으로 이어져",
      publishedDate: "2026-07-21",
      sourceUrl:
        "https://www.boeun.go.kr/www/selectBbsNttView.do?key=138&bbsNo=209&nttNo=220355",
    });
  });
});

describe("boeun parseDetailBody", () => {
  it("p-table__content 본문을 추출한다", () => {
    const body = parseDetailBody(MOCK_DETAIL_HTML);

    expect(body).not.toBeNull();
    expect(body!.length).toBeGreaterThanOrEqual(250);
    expect(body).toContain("충북 보은군");
    expect(body).toContain("지역사회 나눔");
  });
});
