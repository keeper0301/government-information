// ============================================================
// 기업마당 지원사업정보 (중소벤처기업부)
// ============================================================
// 엔드포인트: https://www.bizinfo.go.kr/uss/rss/bizinfoApi.do
// 특성:
//   - JSON/XML(RSS) 택일 가능 — JSON 사용
//   - hashTags 필드가 이미 "2022,금융,충북,대전,중소벤처기업부" 형태로 제공
//   - pubDate 최신순으로 정렬되어 내려옴
//   - searchCnt=0 → 전체 데이터 (1,400건+)
// ============================================================

import type { Collector, CollectedItem } from "./index";
import { fetchWithTimeout } from "./index";
import {
  extractAgeTags,
  extractBenefitTags,
  extractHouseholdTags,
  extractOccupationTags,
  extractRegionTags,
  REGION_TAGS,
  BENEFIT_TAGS,
  type RegionTag,
  type BenefitTag,
} from "@/lib/tags/taxonomy";
import { isOutdatedByTitle, currentMinAllowedYear } from "@/lib/utils";

const API_URL = "https://www.bizinfo.go.kr/uss/rss/bizinfoApi.do";
const KEY = process.env.BIZINFO_API_KEY || "";

type BizinfoItem = {
  title?: string;
  link?: string;
  pblancId?: string;       // 공고 ID (우리 sourceId 로 사용)
  seq?: string;            // 동일하게 공고 ID
  pblancNm?: string;       // 공고명
  jrsdInsttNm?: string;    // 소관기관명
  excInsttNm?: string;     // 수행기관명
  description?: string;
  bsnsSumryCn?: string;    // 사업개요내용
  lcategory?: string;      // 지원분야 대분류
  pldirSportRealmLclasCodeNm?: string;  // 지원분야
  pubDate?: string;        // 등록일
  creatPnttm?: string;
  reqstDt?: string;        // 신청기간
  reqstBeginEndDe?: string;
  trgetNm?: string;        // 지원대상
  hashTags?: string;       // "2022,금융,충북,대전,중소벤처기업부"
  inqireCo?: string | number;
  pblancUrl?: string;      // 공고 URL
};

// pubDate "2022-09-02 15:38:29" → ISO 형식
function parsePubDate(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const m = raw.match(/(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

// 신청기간 "20220727 ~ 20220930" → {start, end}
function parsePeriod(raw: string | undefined | null): { start: string | null; end: string | null } {
  if (!raw) return { start: null, end: null };
  const matches = raw.match(/(\d{8})/g);
  if (!matches || matches.length === 0) return { start: null, end: null };
  const fmt = (s: string) => `${s.substring(0, 4)}-${s.substring(4, 6)}-${s.substring(6, 8)}`;
  if (matches.length === 1) return { start: fmt(matches[0]), end: null };
  return { start: fmt(matches[0]), end: fmt(matches[matches.length - 1]) };
}

// hashTags 파싱 + 표준 태그 매핑
function parseHashTags(hashStr: string | undefined | null) {
  const regionTags: RegionTag[] = [];
  const benefitTags: BenefitTag[] = [];
  if (!hashStr) return { regionTags, benefitTags };

  const tags = hashStr.split(/[,\s]+/).map((t) => t.trim()).filter(Boolean);
  for (const t of tags) {
    if ((REGION_TAGS as readonly string[]).includes(t)) {
      regionTags.push(t as RegionTag);
    }
    // 기업마당 분야: 금융·기술·인력·수출·내수·창업·경영·기타
    if (t === "금융") benefitTags.push("금융");
    if (t === "창업") benefitTags.push("창업");
    if (t === "인력") benefitTags.push("취업");
    // 나머지 분야는 benefit 태그로 매핑 안 함 (설명에서 재추출)
  }
  return { regionTags, benefitTags };
}

// 분야(lcategory) → welfare/loan 분류
function classifyTable(item: BizinfoItem): "welfare" | "loan" {
  const cat = item.lcategory || item.pldirSportRealmLclasCodeNm || "";
  if (/금융/.test(cat)) return "loan";
  const text = `${item.title} ${item.bsnsSumryCn}`;
  if (/대출|융자|보증/.test(text)) return "loan";
  return "welfare";
}

async function fetchAll(): Promise<BizinfoItem[]> {
  const url = new URL(API_URL);
  url.searchParams.set("crtfcKey", KEY);
  url.searchParams.set("dataType", "json");
  url.searchParams.set("searchCnt", "0"); // 0 = 전체
  url.searchParams.set("pageUnit", "1500"); // 약 1400+건 한 번에
  // 2026-04-25 spec 변경: pageIndex 필수.
  // 미지정 시 {"reqErr":"페이지 번호를 입력해주세요."} 반환 → items 0건.
  url.searchParams.set("pageIndex", "1");

  const res = await fetchWithTimeout(url.toString());
  if (!res.ok) throw new Error(`bizinfo HTTP ${res.status}`);

  const text = await res.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`bizinfo JSON 아님 (키 확인): ${text.substring(0, 200)}`);
  }

  // bizinfo 가 spec 위반 시 {"reqErr":"..."} 형태 200 OK 로 반환 → 명시 throw
  const reqErr = (parsed as { reqErr?: string })?.reqErr;
  if (reqErr) throw new Error(`bizinfo reqErr: ${reqErr}`);

  // 응답 구조: { jsonArray: { item: [...] } } 또는 { item: [...] }
  const p = parsed as { jsonArray?: { item?: BizinfoItem[] }; item?: BizinfoItem[] };
  const items = p.jsonArray?.item || p.item || [];
  return items;
}

const collector: Collector = {
  sourceCode: "bizinfo",
  label: "기업마당 지원사업정보",
  enabled: () => !!KEY,

  async *fetch({ lastFetchedAt }) {
    const minYear = currentMinAllowedYear();
    const items = await fetchAll();

    // 최신순 정렬 (pubDate DESC)
    items.sort((a, b) => {
      const pa = a.pubDate || a.creatPnttm || "";
      const pb = b.pubDate || b.creatPnttm || "";
      return pb.localeCompare(pa);
    });

    for (const it of items) {
      const sourceId = it.pblancId || it.seq;
      const title = it.pblancNm || it.title;
      if (!sourceId || !title) continue;

      if (isOutdatedByTitle(title, minYear)) continue;

      const publishedAt = parsePubDate(it.pubDate || it.creatPnttm);

      // 증분 수집 — 이미 아는 날짜보다 오래되면 skip
      if (lastFetchedAt && publishedAt && new Date(publishedAt) < lastFetchedAt) {
        continue;
      }

      const { start, end } = parsePeriod(it.reqstDt || it.reqstBeginEndDe);
      const table = classifyTable(it);

      // 해시태그 기반 태그
      const { regionTags: hashRegions, benefitTags: hashBenefits } = parseHashTags(it.hashTags);

      // 본문 기반 태그 추출 + hashtag 병합
      const textBlob = [title, it.bsnsSumryCn, it.trgetNm, it.lcategory, it.hashTags]
        .filter(Boolean)
        .join(" ");

      const regionTags = Array.from(new Set([...hashRegions, ...extractRegionTags(textBlob)]));
      if (regionTags.length === 0) regionTags.push("전국");

      const benefitTags = Array.from(new Set([...hashBenefits, ...extractBenefitTags(textBlob)]));
      // 중소기업·소상공인 대상이 대부분 — occupation 기본값 추가
      const occupationTags = extractOccupationTags(textBlob);
      if (occupationTags.length === 0 && (it.trgetNm || "").includes("중소기업")) {
        occupationTags.push("자영업자");
      }

      const citem: CollectedItem = {
        sourceCode: "bizinfo",
        sourceId,
        table,
        title,
        category: it.lcategory || it.pldirSportRealmLclasCodeNm || "기타",
        target: it.trgetNm || null,
        description: it.bsnsSumryCn || it.description || null,
        applyUrl: it.pblancUrl || it.link || null,
        applyStart: start,
        applyEnd: end,
        source: it.jrsdInsttNm || it.excInsttNm || "기업마당",
        sourceUrl: it.pblancUrl || it.link || null,
        region: regionTags[0] || "전국",
        publishedAt,
        regionTags,
        ageTags: extractAgeTags(textBlob),
        occupationTags,
        benefitTags,
        householdTags: extractHouseholdTags(textBlob),
        rawPayload: it,
      };

      yield citem;
    }
  },
};

export default collector;
