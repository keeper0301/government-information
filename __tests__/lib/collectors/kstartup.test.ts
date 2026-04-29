// ============================================================
// 창업진흥원 K-Startup collector — 정규화 로직 단위 테스트
// ============================================================
// Phase 3 Task 2 — B1 K-Startup collector 검증.
//
// 컬렉터 함수 자체는 fetch + supabase upsert 가 묶여 있어 mock 부담이 큼.
// 그래서 순수 정규화 헬퍼 (parseXmlTag / fmtDate) 만 별도 export 하여 테스트.
//
// bizinfo (Task 1) 와 달리 K-Startup 은 XML 응답이라 헬퍼가 2개로 단순.
// 대신 parseXmlTag 가 CDATA·HTML 엔티티·잔존 태그 처리까지 책임지므로
// 그 정상 동작을 case 별로 꼼꼼히 검증한다.
//
// 검증 대상:
//   1) parseXmlTag — 평범한 텍스트·CDATA·엔티티·중첩 태그·미존재 태그
//   2) fmtDate    — 하이픈·점·연속·null·undefined·형식 깨짐
// ============================================================

import { describe, it, expect } from "vitest";
import { parseXmlTag, fmtDate } from "@/lib/collectors/kstartup";

// ──────────────────────────────────────────────────────────
// parseXmlTag
// ──────────────────────────────────────────────────────────
describe("kstartup parseXmlTag", () => {
  it("일반 태그 → 본문 그대로 추출", () => {
    const block = "<bizPbancNm>2026년 청년창업 지원사업</bizPbancNm>";
    expect(parseXmlTag(block, "bizPbancNm")).toBe("2026년 청년창업 지원사업");
  });

  it("CDATA 래핑된 본문 → CDATA 마커 제거", () => {
    const block = "<pbancCtnt><![CDATA[자금 5,000만원 지원]]></pbancCtnt>";
    expect(parseXmlTag(block, "pbancCtnt")).toBe("자금 5,000만원 지원");
  });

  it("HTML 엔티티 &amp; 는 & 로 복원 (단, &lt;/&gt; 는 잔존 태그 제거 단계가 뒤이어 실행)", () => {
    // 함수 동작 순서: 엔티티 복원 → 잔존 태그 정규식 제거.
    // 따라서 &amp; 는 그대로 & 가 살아남지만, &lt;K&gt; 는 <K> 로 복원된 뒤
    // 곧바로 잔존 태그로 인식되어 사라진다 — 이것이 의도된 동작.
    const block = "<title>R&amp;D 창업</title>";
    expect(parseXmlTag(block, "title")).toBe("R&D 창업");
  });

  it("&lt;tag&gt; 형태의 사용자 입력은 잔존 태그 제거 단계에서 같이 사라짐 (함수 의도 명시)", () => {
    const block = "<title>예시 &lt;K&gt; 창업</title>";
    // &lt;K&gt; → <K> 로 변환된 뒤 <[^>]*> 정규식이 빈 태그로 인식해 제거.
    expect(parseXmlTag(block, "title")).toBe("예시  창업");
  });

  it("본문 안에 잔존 HTML 태그가 있으면 모두 제거", () => {
    const block = "<summary>지원 <b>대상</b>: <span>청년</span> 창업자</summary>";
    expect(parseXmlTag(block, "summary")).toBe("지원 대상: 청년 창업자");
  });

  it("CDATA + 엔티티 + 잔존 태그 혼합 → 모두 정리", () => {
    const block =
      "<desc><![CDATA[<p>홈페이지 https://x.com&amp;y=1 참고</p>]]></desc>";
    expect(parseXmlTag(block, "desc")).toBe("홈페이지 https://x.com&y=1 참고");
  });

  it("앞뒤 공백·줄바꿈 → trim", () => {
    const block = "<region>\n   서울특별시   \n</region>";
    expect(parseXmlTag(block, "region")).toBe("서울특별시");
  });

  it("태그가 존재하지 않으면 null", () => {
    const block = "<title>창업지원</title>";
    expect(parseXmlTag(block, "missing")).toBeNull();
  });

  it("빈 블록 → null", () => {
    expect(parseXmlTag("", "title")).toBeNull();
  });

  it("자기 닫힘(<tag/>) 같은 비정상 입력 → null", () => {
    // <tag/> 는 정규식이 매칭 못하므로 null. 사망하지 않고 graceful 처리.
    expect(parseXmlTag("<title/>", "title")).toBeNull();
  });

  it("같은 태그가 여러 개면 첫번째만 매칭 (non-greedy)", () => {
    const block = "<region>서울</region>중간<region>부산</region>";
    expect(parseXmlTag(block, "region")).toBe("서울");
  });
});

// ──────────────────────────────────────────────────────────
// fmtDate
// ──────────────────────────────────────────────────────────
describe("kstartup fmtDate", () => {
  it("'YYYY-MM-DD' 표준 형식 → 그대로", () => {
    expect(fmtDate("2026-04-29")).toBe("2026-04-29");
  });

  it("'YYYY.MM.DD' 점 구분자 → ISO 변환", () => {
    expect(fmtDate("2026.04.29")).toBe("2026-04-29");
  });

  it("'YYYYMMDD' 연속 8자리 → ISO 변환", () => {
    expect(fmtDate("20260429")).toBe("2026-04-29");
  });

  it("문장 안에 날짜가 묻혀 있어도 추출", () => {
    expect(fmtDate("접수마감 2026-12-31 까지")).toBe("2026-12-31");
  });

  it("null → null (graceful)", () => {
    expect(fmtDate(null)).toBeNull();
  });

  it("빈 문자열 → null", () => {
    expect(fmtDate("")).toBeNull();
  });

  it("연도만 있으면 null (월/일 누락)", () => {
    expect(fmtDate("2026")).toBeNull();
  });

  it("월·일이 깨지면 (3자리 등) null", () => {
    // 정규식은 (\d{4})[-.]?(\d{2})[-.]?(\d{2}) 라 자릿수 정확히 8 필요.
    expect(fmtDate("2026-4-29")).toBeNull();
  });

  it("'미정' 같은 한글 → null", () => {
    expect(fmtDate("미정")).toBeNull();
  });

  it("여러 날짜 섞인 입력 → 첫번째만 사용", () => {
    // 안내문에 날짜 두 개가 있어도 첫번째 매칭만 반환.
    expect(fmtDate("2026-04-29 부터 2026-12-31 까지")).toBe("2026-04-29");
  });
});
