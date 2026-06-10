// ============================================================
// 인천 서구청 보도자료 수집 (2026-06-11 HWP 첨부 본문 전환)
// ============================================================
// 인천 서구 인구 56만. bbsMsgDetail CMS (open_content base path).
//
// ⚠️ 본문 구조: board_view 인라인 본문이 없고 **HWP 첨부 전용**(제목·메타·첨부·
// 미리보기만 정적). 6/2 이후 insert 0 의 원인 — 정규식으로는 본문 추출 불가.
// (금정구 d353d9e·동작구 패턴과 동일.) list 파싱은 bbsMsgDetail 공용 헬퍼 재사용,
// 본문만 SI 첨부 공용 헬퍼(fetchSiAttachBody)로 HWP 전문 추출.
// 첨부 download href = /open_content/main/bbs/bbsMsgFileDown.do (fileDown.do 매칭).
// ============================================================

import { createPressCollector } from "./_factory";
import { createBbsMsgDetailCollector } from "./_bbs_msg_detail_helper";
import { fetchSiAttachBody } from "./_si_attach_helper";

const BASE_URL = "https://www.seo.incheon.kr";
const LIST_URL = `${BASE_URL}/open_content/main/community/news/report.jsp`;

// list 파싱은 bbsMsgDetail 공용 헬퍼 재사용 (bcd·msg_seq 순서 무관 매칭·날짜 window 동일).
// detail 본문 파서는 아래 HWP 첨부 버전으로 교체하므로 helper 의 list 파서만 가져온다.
const listHelper = createBbsMsgDetailCollector({
  baseUrl: BASE_URL,
  listPath: "/open_content/main/community/news/report.jsp",
  detailBasePath: "/open_content/main/bbs",
  cityName: "인천 서구",
  region: "인천",
  ministry: "인천 서구청",
  sourceCode: "local-press-seo-incheon",
});

// 본문: HWP 첨부 전문 우선(서구는 인라인 본문 없음), 부재 시 board_view 인라인 fallback
// (혹시 인라인 본문이 있는 글 대비 — 250 미만이면 factory 가 skip).
export async function parseDetailBody(html: string): Promise<string | null> {
  const attach = await fetchSiAttachBody(html, `${BASE_URL}/`);
  if (attach) return attach;
  return listHelper.parseDetailBody(html);
}

export const { scrapeAndInsert: scrapeSeoIncheonAndInsert } = createPressCollector({
  cityName: "인천 서구",
  region: "인천",
  ministry: "인천 서구청",
  sourceOutlet: "인천 서구청",
  sourceCode: "local-press-seo-incheon",
  listUrl: LIST_URL,
  parseListItems: listHelper.parseListItems,
  parseDetailBody,
});
