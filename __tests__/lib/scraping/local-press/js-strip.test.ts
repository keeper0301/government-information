// ============================================================
// anyang·songpa·yeonsu·wonju 본문 <script> 제거 회귀 테스트 (2026-06-03)
// ============================================================
// 4곳 본문 컨테이너 안 <script>(fn_update 등) 블록이 제거되지 않아 JS 코드가
// 본문에 섞이던 버그 fix. 각 collector 의 컨테이너 class·종결 마커가 달라 개별 fixture.

import { describe, it, expect } from "vitest";
import { parseDetailBody as anyang } from "@/lib/scraping/local-press/anyang";
import { parseDetailBody as songpa } from "@/lib/scraping/local-press/songpa";
import { parseDetailBody as yeonsu } from "@/lib/scraping/local-press/yeonsu";
import { parseDetailBody as wonju } from "@/lib/scraping/local-press/wonju";

const BODY =
  "관내 소상공인과 시민이 함께 참여하는 행사를 개최한다고 밝혔다. 이번 행사는 지역 경제 " +
  "활성화와 시민 편의 증진을 위해 마련됐으며 다양한 체험 프로그램과 전시 부스가 운영된다. " +
  "시는 이번 행사를 통해 우수한 제품을 널리 알리고 지역 상권에 활력을 불어넣겠다는 계획이다. " +
  "행사 기간 동안 현장 상담 창구도 함께 운영되어 누구나 손쉽게 정보를 얻을 수 있다. 자세한 " +
  "사항은 시청 누리집에서 확인할 수 있으며 시 관계자는 많은 시민의 관심과 참여를 당부했다. " +
  "시는 또한 온라인 신청 시스템을 도입해 시민들이 시간과 장소에 구애받지 않고 편리하게 " +
  "참여할 수 있도록 했으며 향후 더 많은 시민이 혜택을 누릴 수 있도록 사업을 단계적으로 " +
  "확대해 나갈 방침이라고 덧붙였다. 관계자는 실질적인 도움이 되는 정책을 지속 발굴하겠다고 말했다.";

const SCRIPT = `<script>function fn_update(url){ if(confirm("수정하시겠습니까?")){ location.href=url; } }</script>`;

const cases: Array<[string, (h: string) => string | null, string]> = [
  ["anyang", anyang, `<div class="view_cont"><p>${BODY}</p>${SCRIPT}</div><div class="btn"></div>`],
  ["songpa", songpa, `<div class="p-table__content"><p>${BODY}</p>${SCRIPT}</div><div class="p-table__bottom"></div>`],
  ["yeonsu", yeonsu, `<div class="con"><p>${BODY}</p>${SCRIPT}</div><ul class="other_con"></ul>`],
  ["wonju", wonju, `<td title="내용" class="p-table__content"><p>${BODY}</p>${SCRIPT}</td>`],
];

describe("본문 <script> 제거 (JS 코드 혼입 방어)", () => {
  for (const [name, fn, html] of cases) {
    it(`${name}: 본문 추출 + script(fn_update) 미혼입`, () => {
      const body = fn(html);
      expect(body).toContain("소상공인");
      expect(body).toContain("당부했다");
      expect(body).not.toContain("function");
      expect(body).not.toContain("fn_update");
      expect(body).not.toContain("confirm");
    });
  }
});

// ============================================================
// 본문 앞/끝 junk 제거 회귀 (2026-06-03) — 라이브 HTML 구조 재현
// ============================================================
describe("anyang 앞 이미지캡션 + 끝 첨부/만족도/담당자 junk 제거", () => {
  it("이미지 확대보기·대체텍스트·-->·첨부·[KBytes] 미혼입, 본문 보존", () => {
    const html =
      `<div class="view_cont"> 이미지 확대보기 대체텍스트 개발해주세요 이미지 확대보기 --> ` +
      `<pre>${BODY}</pre></div>` +
      `<div class="attached_file"><p class="title">첨부파일</p><ul><li>붙임.hwp[KBytes]</li></ul></div>` +
      `<form><span>만족도</span> 매우 만족</form><h3>담당자 정보</h3><div>담당부서 홍보기획관</div>`;
    const body = anyang(html);
    expect(body).toContain("소상공인");
    expect(body).toContain("당부했다");
    expect(body).not.toContain("이미지 확대보기");
    expect(body).not.toContain("대체텍스트");
    expect(body).not.toContain("-->");
    expect(body).not.toContain("첨부파일");
    expect(body).not.toContain("[KBytes]");
    expect(body).not.toContain("만족도");
    expect(body).not.toContain("담당부서");
  });
});

describe("songpa 앞 메타(작성일/자료제공) + 끝 목록/네비/공공누리 junk 제거", () => {
  it("앞 메타 + 끝 junk 미혼입, 본문 보존", () => {
    const html =
      `<div class="content-information"><table>` +
      `<caption>보도자료 상세보기 - 제목 자료제공 내용 조회수 작성일 의 정보를 제공합니다</caption>` +
      `<tr><td>송파구 행사 안내 조회수 -->22 작성일 : 2026년 06월 01일 10시 26분 02초 자료제공 자원활용과 ` +
      `${BODY}</td></tr></table></div>` +
      `<div class="p-table__bottom"><a>목록</a></div>` +
      `<ul class="p-post-move"><li>다음글 다른 기사</li></ul>` +
      `<script>var IS_ID_LOGIN='N';</script>` +
      `<p class="kogl_text">본 저작물은 "공공누리" 제4유형 조건에 따라 이용할 수 있습니다.</p>`;
    const body = songpa(html);
    expect(body).toContain("소상공인");
    expect(body).toContain("당부했다");
    expect(body).not.toContain("자료제공");
    expect(body).not.toContain("작성일");
    expect(body).not.toContain("조회수");
    expect(body).not.toContain("다음글");
    expect(body).not.toContain("IS_ID_LOGIN");
    expect(body).not.toContain("공공누리");
    expect(body).not.toContain("본 저작물");
  });

  it("yeonsu: con div 본문만 추출 — 앞 제목/메타·뒤 네비 제외", () => {
    // 라이브 구조: board_view[제목h4+부제목+datalist(작성자/담당부서/조회수/첨부)]
    //   + <div class="con">[add_img + 본문] + <ul class="other_con">[이전글/다음글] + 목록
    const html =
      `<div class="board_view"><h4 class="title">연수구, 행사 실시<span class="stitle">부제목</span></h4>` +
      `<ul class="datalist"><li><dl><dt>작성자</dt><dd>홍길동</dd></dl></li>` +
      `<li><dl><dt>담당부서</dt><dd>홍보소통실</dd></dl></li>` +
      `<li class="addfile"><dl><dt>첨부파일</dt><dd>붙임.hwp</dd></dl></li></ul>` +
      `<div class="con"><p class="add_img"><img alt="이미지 설명"></p><p>${BODY}</p></div>` +
      `<ul class="other_con"><li>이전글 다른 기사</li><li>다음글 또 다른 기사</li></ul> 목록`;
    const body = yeonsu(html);
    expect(body).toContain("소상공인");
    expect(body).toContain("당부했다");
    expect(body).not.toContain("작성자");
    expect(body).not.toContain("담당부서");
    expect(body).not.toContain("첨부파일");
    expect(body).not.toContain("이전글");
    expect(body).not.toContain("다음글");
    expect(body).not.toContain("목록");
  });

  it("wonju: td(title=내용) 본문만 — 제목/담당부서/문의전화/파일/네비 제외", () => {
    // 라이브 구조: table > [tr.p-table__subject 제목] + [th 담당부서/문의전화 td.file_show]
    //   + [td title="내용" 본문] + [th 파일 td.file_show > ul.p-attach 첨부]
    const html =
      `<table class="p-table"><tbody>` +
      `<tr class="p-table__subject"><td colspan="2"><span class="p-table__subject_text">원주시 안내 제하</span></td></tr>` +
      `<tr><th scope="row">담당부서</th><td class="file_show">자원순환과</td></tr>` +
      `<tr><th scope="row">문의전화</th><td class="file_show">033-737-3083</td></tr>` +
      `<tr><td title="내용" class="p-table__content"><div>${BODY}</div></td></tr>` +
      `<tr><th scope="row">파일</th><td class="file_show"><ul class="p-attach"><li><a>미리보기</a></li></ul></td></tr>` +
      `</tbody></table>`;
    const body = wonju(html);
    expect(body).toContain("소상공인");
    expect(body).toContain("당부했다");
    expect(body).not.toContain("담당부서");
    expect(body).not.toContain("자원순환과");
    expect(body).not.toContain("문의전화");
    expect(body).not.toContain("미리보기");
    expect(body).not.toContain("제하");
  });

  // 네거티브 회귀 — cut 정규식이 본문 자연어를 오제거하지 않는지 (리뷰 P1 방어).
  it("songpa: 본문에 '본 저작물은'(공공누리 미동반) 등장해도 손실 0", () => {
    const html =
      `<div class="content-information"><table><tr><td>` +
      `행사 안내 조회수 -->5 작성일 : 2026년 06월 01일 10시 26분 02초 자료제공 정책과 ` +
      `시는 본 저작물은 시민 공동의 자산이라는 인식 아래 행사를 연다. ${BODY}</td></tr></table></div>` +
      `<div class="p-table__bottom"></div>`;
    const body = songpa(html);
    // 메타는 잘리고
    expect(body).not.toContain("자료제공");
    expect(body).not.toContain("작성일");
    // 본문의 "본 저작물은 …"(공공누리 미동반)은 보존
    expect(body).toContain("본 저작물은 시민 공동의 자산");
    expect(body).toContain("소상공인");
  });
});
