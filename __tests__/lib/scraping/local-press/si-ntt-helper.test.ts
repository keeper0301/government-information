// ============================================================
// SI selectBbsNttView 공용 본문 파서 parseSiNttBody 단위 테스트
// ============================================================
// 2026-05-29 군포·양주·구리·충주 본문 파싱 수리 회귀 방지:
//   - 본문 셀 2종: <td class="p-table__content"> / <td class="bbs_content">
//     (class 앞 colspan 등 속성 허용)
//   - 끝 경계: 셀 닫힘(</td></tr> + tbody/table 또는 파일행 <tr><th>) 또는 <script
//     → 본문 뒤 파일목록·자바스크립트가 본문에 섞이는 사고 방지
//   - 이미지 갤러리 "사진 확대보기" UI 라벨 제거

import { describe, it, expect } from "vitest";
import { parseSiNttBody } from "@/lib/scraping/local-press/_si_ntt_helper";

const LONG = "관내 소공인과 시민이 함께 참여하는 행사를 개최한다고 밝혔다. 이번 행사는 지역 소상공인의 판로 확대와 시민의 생활 편의를 동시에 높이기 위해 마련된 자리로, 다양한 체험형 프로그램과 전시 부스가 함께 운영될 예정이다. 시는 이번 행사를 통해 관내 소공인의 우수한 제품을 널리 알리고 지역 경제에 활력을 불어넣겠다는 계획이라고 전했다. 행사 기간 동안 현장에서는 상담 창구도 함께 운영되어 누구나 손쉽게 정보를 얻을 수 있도록 지원할 방침이다. 자세한 사항은 시청 누리집에서 확인할 수 있으며 많은 관심을 바란다고 당부했다.";

describe("parseSiNttBody — p-table__content 셀 (군포·구리)", () => {
  it("td.p-table__content (class 앞 colspan) → 셀 닫힘까지, 뒤 <script> 제외", () => {
    const html = `
      <table class="p-table block">
        <tr><td colspan="2" class="p-table__content">
          <p>${LONG}</p>
        </td></tr>
      </table>
      <script>var foo = function(){ for(var i=0;i<10;i++){} };</script>
    `;
    const body = parseSiNttBody(html);
    expect(body).toContain("소공인");
    expect(body).toContain("당부했다");
    expect(body).not.toContain("var foo"); // 스크립트 제외
    expect(body).not.toContain("for(var");
  });
});

describe("parseSiNttBody — bbs_content 셀 (양주·충주)", () => {
  it("td.bbs_content → 본문 뒤 파일 행(<tr><th>) 제외", () => {
    const html = `
      <td colspan="4" class="bbs_content">
        <p>${LONG}</p>
      </td></tr>
      <tr><th scope="row">첨부파일</th><td>보도자료.hwp 다운로드 미리보기</td></tr>
    `;
    const body = parseSiNttBody(html);
    expect(body).toContain("소공인");
    expect(body).not.toContain("보도자료.hwp"); // 파일 섹션 제외
    expect(body).not.toContain("다운로드");
  });

  it("이미지 갤러리 '사진 확대보기' UI 라벨 제거", () => {
    const html = `
      <td class="bbs_content">
        <p>${LONG}</p>
        <a href="?key=3180">사진 확대보기</a><a href="?key=3181">사진 확대보기</a>
      </td></tr><tr><th>첨부</th></tr>
    `;
    const body = parseSiNttBody(html);
    expect(body).toContain("소공인");
    expect(body).not.toContain("사진 확대보기");
  });
});

describe("parseSiNttBody — 중첩/스크립트 (code review 회귀)", () => {
  it("본문 내 중첩 <table> 이 있어도 표 앞뒤 문단 모두 캡처", () => {
    const html = `
      <td colspan="2" class="p-table__content">
        <p>${LONG}</p>
        <table><tbody><tr><td>구분</td><td>일시</td></tr><tr><td>설명회</td><td>6월 1일</td></tr></tbody></table>
        <p>행사 종료 후 우수 참여자에게 기념품을 증정할 예정이라고 시청 관계자가 덧붙였다.</p>
      </td></tr></tbody></table>
    `;
    const body = parseSiNttBody(html);
    expect(body).toContain("소공인"); // 표 앞 문단
    expect(body).toContain("기념품을 증정"); // 표 뒤 문단 (조기 잘림 X)
  });

  it("본문 중간 인라인 <script> 는 제거하되 앞뒤 문단 유지", () => {
    const html = `
      <td class="p-table__content">
        <p>${LONG}</p>
        <script>var slider = function(){ for (var i=0;i<5;i++) move(i); };</script>
        <p>현장에서는 다양한 체험 부스도 함께 운영된다고 안내했다.</p>
      </td></tr></table>
    `;
    const body = parseSiNttBody(html);
    expect(body).toContain("소공인");
    expect(body).toContain("체험 부스"); // 스크립트 뒤 문단 유지
    expect(body).not.toContain("var slider");
  });
});

describe("parseSiNttBody — 안전 분기", () => {
  it("본문 셀 없으면 — null", () => {
    expect(parseSiNttBody(`<div class="other">${LONG}</div>`)).toBeNull();
  });

  it("본문 50자 미만 — null", () => {
    const html = `<td class="bbs_content"><p>짧은 글</p></td></tr></tbody></table>`;
    expect(parseSiNttBody(html)).toBeNull();
  });
});
