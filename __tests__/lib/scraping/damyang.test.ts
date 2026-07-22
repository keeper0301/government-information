// damyang parser 회귀 방어. 담양군청 공식 보도자료의
// JSON API 목록과 상세 본문을 검증한다.

import { describe, expect, it } from "vitest";
import {
  parseDetailBody,
  parseListPage,
} from "@/lib/scraping/local-press/damyang";

const MOCK_LIST_JSON = JSON.stringify({
  RSLT_CD: "0000",
  RSLT_DATA: {
    boardContentsList: [
      {
        dataSid: 818805,
        dataTitle: "담양군, ‘2027 남도정원 비엔날레’ 준비 본격화",
        registerDate: "2026-07-21",
      },
    ],
  },
});

const MOCK_DETAIL_JSON = JSON.stringify({
  RSLT_CD: "0000",
  RSLT_DATA: {
    boardDetail: {
      boardContentsDetail: {
        dataTitle: "담양군, ‘2027 남도정원 비엔날레’ 준비 본격화",
        regDate: "2026-07-21",
        dataContent: `
          <p><strong>담양군, ‘2027 남도정원 비엔날레’ 준비 본격화</strong></p>
          <p>담양군은 군청에서 ‘2027 남도정원 비엔날레 기본계획 수립 용역 중간보고회’를 열고 행사 추진 방향과 핵심 콘텐츠, 공간 구성 등을 점검했다.</p>
          <p>이날 보고회에는 관계 공무원과 자문위원, 관계 기관 관계자 등이 참석해 그동안의 연구 성과를 공유하고 비엔날레의 추진 방향과 콘텐츠 구성, 공간 활용 방안에 대한 의견을 나눴다.</p>
          <p>담양군은 이를 지역의 전통정원과 생태자원을 관광·문화·지역경제로 잇는 미래 성장 전략의 핵심 사업으로 추진하고 있다.</p>
        `,
      },
    },
  },
});

describe("damyang parseListPage", () => {
  it("JSON 목록에서 dataSid, 제목, 등록일을 추출한다", () => {
    const items = parseListPage(MOCK_LIST_JSON);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      seq: "818805",
      title: "담양군, ‘2027 남도정원 비엔날레’ 준비 본격화",
      publishedDate: "2026-07-21",
      sourceUrl:
        "https://www.damyang.go.kr/board/getBoardDetail?dataSid=818805&boardId=BBS_0000007&getOfficeNm=true",
    });
  });
});

describe("damyang parseDetailBody", () => {
  it("JSON 상세의 dataContent 본문을 추출한다", () => {
    const body = parseDetailBody(MOCK_DETAIL_JSON);

    expect(body).not.toBeNull();
    expect(body!.length).toBeGreaterThanOrEqual(250);
    expect(body).toContain("2026-07-21");
    expect(body).toContain("남도정원 비엔날레 기본계획");
  });
});
