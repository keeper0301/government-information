import { describe, expect, it } from "vitest";
import {
  extractUrlsFromBody,
  isPublicDomain,
  resolveApplyUrl,
  resolveProvinceFallback,
} from "@/lib/press-ingest/url-fallback";

const SOURCE_URL = "https://www.keepioo.com/news/test-slug";

describe("isPublicDomain — 정부 화이트리스트", () => {
  it("*.go.kr 통과 — 광역 도청 도메인", () => {
    expect(isPublicDomain("https://www.seoul.go.kr/welfare")).toBe(true);
    expect(isPublicDomain("https://news.gg.go.kr/notice/123")).toBe(true);
  });

  it("*.gov.kr / *.or.kr / *.re.kr 통과 — 정통·공공·연구", () => {
    expect(isPublicDomain("https://example.gov.kr")).toBe(true);
    expect(isPublicDomain("https://kosaf.or.kr")).toBe(true);
    expect(isPublicDomain("https://kistep.re.kr")).toBe(true);
  });

  it("외부 도메인 차단 — 광고·일반 사이트", () => {
    expect(isPublicDomain("https://example.com")).toBe(false);
    expect(isPublicDomain("https://naver.com")).toBe(false);
    expect(isPublicDomain("https://ad.tracker.io")).toBe(false);
  });

  it("잘못된 url — false (throw 안 함)", () => {
    expect(isPublicDomain("not-a-url")).toBe(false);
    expect(isPublicDomain("")).toBe(false);
  });
});

describe("extractUrlsFromBody — 본문 url 정규식", () => {
  it("http/https url 추출", () => {
    const body =
      "자세한 내용은 https://www.seoul.go.kr/welfare 또는 http://news.example.gov.kr 에서 확인하세요.";
    const urls = extractUrlsFromBody(body);
    expect(urls).toContain("https://www.seoul.go.kr/welfare");
    expect(urls).toContain("http://news.example.gov.kr");
  });

  it("trailing 마침표·괄호 제거", () => {
    const body = "참고: https://www.seoul.go.kr.";
    expect(extractUrlsFromBody(body)).toEqual(["https://www.seoul.go.kr"]);
  });

  it("중복 제거", () => {
    const body =
      "https://www.gg.go.kr 를 방문하세요. https://www.gg.go.kr 에서 신청.";
    expect(extractUrlsFromBody(body)).toEqual(["https://www.gg.go.kr"]);
  });

  it("null/빈 입력 — 빈 배열", () => {
    expect(extractUrlsFromBody(null)).toEqual([]);
    expect(extractUrlsFromBody("")).toEqual([]);
  });
});

describe("resolveProvinceFallback — 광역 도청 매핑", () => {
  it("광역 17개 prefix 매칭", () => {
    expect(resolveProvinceFallback("서울특별시")).toBe("https://www.seoul.go.kr");
    expect(resolveProvinceFallback("경기도")).toBe("https://www.gg.go.kr");
    expect(resolveProvinceFallback("제주특별자치도")).toBe(
      "https://www.jeju.go.kr",
    );
  });

  it("시군 (광역 prefix) 도 매칭", () => {
    expect(resolveProvinceFallback("전라남도 순천시")).toBe(
      "https://www.jeonnam.go.kr",
    );
    expect(resolveProvinceFallback("경기도 수원시")).toBe(
      "https://www.gg.go.kr",
    );
  });

  it("광역 변형 (강원특별자치도/전북특별자치도) 도 동일 url", () => {
    expect(resolveProvinceFallback("강원특별자치도")).toBe(
      "https://www.gangwon.go.kr",
    );
    expect(resolveProvinceFallback("전북특별자치도")).toBe(
      "https://www.jeonbuk.go.kr",
    );
  });

  it("매핑 없는 ministry — null", () => {
    expect(resolveProvinceFallback("외국 정부")).toBeNull();
    expect(resolveProvinceFallback(null)).toBeNull();
    expect(resolveProvinceFallback("")).toBeNull();
  });
});

describe("resolveApplyUrl — 4 layer fallback chain", () => {
  it("Layer 1 — LLM apply_url 그대로 사용 (화이트리스트 미적용)", () => {
    // LLM 이 직접 응답한 url 은 외부 사이트라도 신뢰 (LLM 이 신중하게 선택)
    const r = resolveApplyUrl({
      llmApplyUrl: "https://special.example.com/apply",
      bodyUrls: [],
      body: null,
      ministry: "서울특별시",
      sourceUrl: SOURCE_URL,
    });
    expect(r).toEqual({
      url: "https://special.example.com/apply",
      source: "llm",
    });
  });

  it("Layer 2 — body_urls 중 정부 도메인 첫 매치", () => {
    const r = resolveApplyUrl({
      llmApplyUrl: null,
      bodyUrls: [
        "https://example.com/ad", // 외부 — skip
        "https://www.seoul.go.kr/welfare/123", // 정부 — pick
        "https://news.seoul.go.kr/notice", // 정부 (이미 위에서 결정)
      ],
      body: null,
      ministry: null,
      sourceUrl: SOURCE_URL,
    });
    expect(r).toEqual({
      url: "https://www.seoul.go.kr/welfare/123",
      source: "body_urls",
    });
  });

  it("Layer 3 — 본문 정규식 추출 화이트리스트 매치", () => {
    const r = resolveApplyUrl({
      llmApplyUrl: null,
      bodyUrls: [], // LLM 이 추출 안 했어도
      body:
        "광고 문의 https://ad.com 그리고 자세한 내용 https://www.gg.go.kr/welfare 참조",
      ministry: null,
      sourceUrl: SOURCE_URL,
    });
    expect(r).toEqual({
      url: "https://www.gg.go.kr/welfare",
      source: "body_regex",
    });
  });

  it("Layer 4 — 광역 도청 매핑", () => {
    const r = resolveApplyUrl({
      llmApplyUrl: null,
      bodyUrls: [],
      body: "특별한 url 없는 보도자료",
      ministry: "전라남도 순천시",
      sourceUrl: SOURCE_URL,
    });
    expect(r).toEqual({
      url: "https://www.jeonnam.go.kr",
      source: "province",
    });
  });

  it("Layer 5 — source_url 최후 fallback (모두 실패)", () => {
    const r = resolveApplyUrl({
      llmApplyUrl: null,
      bodyUrls: ["https://ad.com"], // 화이트리스트 외
      body: "url 없음",
      ministry: "외국 도시", // 매핑 없음
      sourceUrl: SOURCE_URL,
    });
    expect(r).toEqual({
      url: SOURCE_URL,
      source: "source_url",
    });
  });

  it("Layer 1 우선 — body_urls 에 정부 도메인 있어도 LLM 직접 응답 사용", () => {
    const r = resolveApplyUrl({
      llmApplyUrl: "https://www.seoul.go.kr/exact-program",
      bodyUrls: ["https://news.seoul.go.kr/other"],
      body: null,
      ministry: "서울특별시",
      sourceUrl: SOURCE_URL,
    });
    expect(r.url).toBe("https://www.seoul.go.kr/exact-program");
    expect(r.source).toBe("llm");
  });

  it("LLM apply_url 이 빈 문자열·null 둘 다 같이 처리 (Layer 1 skip)", () => {
    const r = resolveApplyUrl({
      llmApplyUrl: "",
      bodyUrls: [],
      body: null,
      ministry: "경기도",
      sourceUrl: SOURCE_URL,
    });
    expect(r.source).toBe("province");
    expect(r.url).toBe("https://www.gg.go.kr");
  });
});
