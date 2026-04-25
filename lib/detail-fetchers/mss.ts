// ============================================================
// MSS Detail Fetcher — raw_payload 활용 (외부 호출 없음)
// ============================================================
// 중소벤처기업부 (MSS) 의 data.go.kr `mssBizService_v2/getbizList_v2` API 는
// 별도 Detail 엔드포인트가 없음 (2026-04-24 검증, smes.go.kr 별도 키 도입은
// ROI 낮아 제외). 그러나 List 응답 자체가 담당부서·담당자·연락처·첨부파일·
// 공고본문 등을 포함하고, collector (`lib/collectors/loans-mss.ts`) 가 Phase 1
// (커밋 66b97aa) 부터 응답 XML 의 모든 태그를 dict 로 `raw_payload` JSONB
// 컬럼에 보존한다.
//
// 따라서 이 fetcher 는 외부 HTTP 호출 0 으로 raw_payload 만 보고
// contact_info / detailed_content 두 컬럼을 채운다 (eligibility 직접 매핑
// 필드 없어 null).
//   - API 쿼터·rate limit 무관
//   - data.go.kr 쿨다운 무관 — DB 쿼리만
//
// 매핑 (2026-04-25 prod raw_payload 12종 distinct key 검증 기준):
//   writerPosition  → 담당부서       (400/400)
//   writerName      → 담당자명       (399/400)
//   writerPhone     → 전화           (390/400)
//   writerEmail     → 이메일         (394/400)
//   dataContents    → 공고 본문      (395/400, description 컬럼에도 들어가지만
//                     detailed_content 는 본문+첨부 함께 노출되도록 재구성)
//   fileName        → 첨부파일명     (399/400)
//   fileUrl         → 첨부파일 URL   (399/400)
//
// 자세한 spec: docs/superpowers/specs/2026-04-25-mss-loan-detail-fetcher-design.md
// ============================================================

import type { DetailFetcher, DetailResult, RowIdentity } from "./index";
import { cleanDescription } from "@/lib/utils";

// mss List API 응답의 한 항목. raw_payload 가 unknown shape JSONB 라 모든
// 필드는 optional + unknown — str() 가 isMeaningful 로 정제 후 string 보장.
type MssItem = {
  itemId?: unknown;
  title?: unknown;
  viewUrl?: unknown;
  writerPosition?: unknown;
  writerName?: unknown;
  writerPhone?: unknown;
  writerEmail?: unknown;
  dataContents?: unknown;
  fileName?: unknown;
  fileUrl?: unknown;
  applicationStartDate?: unknown;
  applicationEndDate?: unknown;
};

// 무의미한 값 (사용자 화면에 노출하면 노이즈) 필터.
// youthcenter SKIP set + mss 공공기관 공고 보편적 placeholder 추가.
function isMeaningful(raw: unknown): raw is string {
  if (typeof raw !== "string") return false;
  const t = raw.trim();
  if (t.length === 0) return false;
  const SKIP = new Set([
    "-",
    "해당없음",
    "해당 없음",
    "해당사항 없음",
    "제한없음",
    "제한 없음",
    "N",
    "없음",
    "미정",
    "추후공지",
    "추후 공지",
    "별도 공지",
  ]);
  return !SKIP.has(t);
}

function str(raw: unknown): string | null {
  return isMeaningful(raw) ? raw.trim() : null;
}

// ============================================================
// dataContents 본문 정규식 섹션 추출 (Phase 3)
// ============================================================
// mss raw_payload 는 구조화된 eligibility/apply_method 필드를 안 내려줌.
// 하지만 dataContents 본문은 정부 공고 정형 양식이라 "신청대상: ..." /
// "▶ (지원대상) ..." 같은 섹션 헤더가 96%+ row 에서 일관되게 나타남.
// prod row 3건 육안 검증: "신청대상 : " · "지원 대상:" · "▶ (지원대상)"
// 3가지 변형이 섞여 있어 두 패턴 모두 커버.
//
// 경계 규칙: 섹션 본문은 다음 섹션 헤더 직전까지 잘라냄.
// 다음 섹션 헤더 = (▶ · \n- · \n※) OR 다음 알려진 섹션명 (신청/지원/접수/
// 문의/지원내용/지원대상 등) OR 문자열 끝.
//
// 오추출 방어:
//  - 추출값 maxLen 넘으면 파싱 실패로 간주 → null (운영 상 이상치 차단)
//  - trim + 연속 공백 1개로 정리 → UI 에서 엉킴 방지
// ============================================================

// 섹션 경계로 취급할 다음 섹션 헤더 토큰. ▶·- (하이픈)·※ 같은 장식 구분자와
// 정부 공고에 자주 쓰이는 섹션명 단어 리스트. 둘 중 하나라도 매치되면
// 이전 섹션 본문 종료.
const SECTION_BOUNDARY =
  "(?=\\n\\s*(?:[▶※]|-\\s|문의|접수|신청|지원|관련|자세한|공고|첨부))";

// maxLen 은 공고 자격/방법 설명의 상식적 상한. 이보다 길면 잘못 뽑힌 것으로 간주.
function extractSection(
  body: string,
  headers: string[],
  maxLen: number,
): string | null {
  // 섹션 헤더 후보들을 OR 로 묶음. 공백 허용, 괄호 선택적 (▶ (지원대상) 케이스).
  const headerAlt = headers.map((h) => h.replace(/\s/g, "\\s*")).join("|");
  // ▶ \(? 접두가 있을 수도 없을 수도. 접미 \)? 도 동일.
  // 헤더 뒤 구분자: : 또는 공백. 이후 내용을 lazy 매치로 경계까지.
  const re = new RegExp(
    `(?:▶\\s*)?\\(?\\s*(?:${headerAlt})\\s*\\)?\\s*[:：]\\s*([\\s\\S]*?)${SECTION_BOUNDARY}|` +
      `▶\\s*\\(\\s*(?:${headerAlt})\\s*\\)\\s*([\\s\\S]*?)${SECTION_BOUNDARY}`,
    "m",
  );
  const m = body.match(re);
  if (!m) return null;
  const raw = (m[1] ?? m[2] ?? "").replace(/\s+/g, " ").trim();
  if (raw.length === 0) return null;
  if (raw.length > maxLen) return null;
  return raw;
}

// 자격 요건 — "신청대상" / "지원대상" / "신청 대상" / "지원 대상" 헤더 추출.
// maxLen 500: 정부 공고 대상 설명은 통상 1~3줄. 이상 길면 다른 섹션 침범 의심.
function buildEligibility(payload: MssItem): string | null {
  const body = str(payload.dataContents);
  if (!body) return null;
  return extractSection(body, ["신청대상", "지원대상"], 500);
}

// 신청 방법 — "신청방법" / "신청 방법" 헤더 추출.
// maxLen 300: URL 한 줄 + 간단한 안내 정도. 길면 지원내용·문의처 침범.
function buildApplyMethod(payload: MssItem): string | null {
  const body = str(payload.dataContents);
  if (!body) return null;
  return extractSection(body, ["신청방법"], 300);
}

// 담당부서 + 담당자명 + 전화 + 이메일 — 공공기관 공고 통일 양식.
// prod 검증: 4개 모두 약 97~100% 채움률 → contact_info 가 mss row 거의
// 전체에서 의미 있게 채워짐.
function buildContactInfo(p: MssItem): string | null {
  const lines: string[] = [];
  const dept = str(p.writerPosition);
  const name = str(p.writerName);
  const phone = str(p.writerPhone);
  const email = str(p.writerEmail);
  if (dept) lines.push(`담당부서: ${dept}`);
  if (name) lines.push(`담당자: ${name}`);
  if (phone) lines.push(`전화: ${phone}`);
  if (email) lines.push(`이메일: ${email}`);
  return lines.length > 0 ? lines.join("\n") : null;
}

// 공고 본문 + 첨부 자료 안내. dataContents 는 description 컬럼에도 저장
// 되지만 detailed_content 는 사용자 상세 페이지의 풍부한 본문 박스라 첨부
// 링크까지 같이 노출되도록 한 덩어리로 재구성. fileName 과 fileUrl 둘 다
// 있으면 두 줄, 하나만 있으면 한 줄.
function buildDetailedContent(p: MssItem): string | null {
  const sections: string[] = [];
  // dataContents 는 collector 의 parseAllTags 가 amp 정도만 풀고 그대로 보존해서
  // &nbsp; 같은 HTML 엔티티가 남아 있음. cleanDescription 으로 엔티티·여분 공백 정리.
  const body = (() => {
    const raw = str(p.dataContents);
    if (!raw) return null;
    const cleaned = cleanDescription(raw);
    return cleaned.length > 0 ? cleaned : null;
  })();
  const fileName = str(p.fileName);
  const fileUrl = str(p.fileUrl);
  if (body) sections.push(`▸ 공고 내용\n${body}`);
  if (fileName || fileUrl) {
    const fileLine =
      fileName && fileUrl
        ? `${fileName}\n${fileUrl}`
        : (fileName ?? fileUrl ?? "");
    sections.push(`▸ 첨부 자료\n${fileLine}`);
  }
  return sections.length > 0 ? sections.join("\n\n") : null;
}

const fetcher: DetailFetcher = {
  sourceCode: "mss",
  label: "MSS raw_payload 추출",
  // 외부 호출이 없으므로 env 체크 불필요 — 언제나 활성.
  enabled: () => true,

  // mss collector 가 저장한 row + raw_payload 가 object 일 때만 적용.
  // raw_payload NULL row (Phase 1 적용 전 수집 분 또는 PAGE_CAP 4 페이지
  // 밖의 오래된 row) 는 다음 cron 라운드에 upsert 로 자동 채워질 때까지
  // skipped.
  applies: (row: RowIdentity) => {
    if (row.source_code !== "mss") return false;
    if (!row.source_id) return false;
    if (!row.raw_payload || typeof row.raw_payload !== "object") return false;
    return true;
  },

  async fetchDetail(row: RowIdentity): Promise<DetailResult | null> {
    const payload = row.raw_payload as MssItem | null;
    if (!payload) return null;

    const eligibility = buildEligibility(payload);
    const applyMethod = buildApplyMethod(payload);
    const contact = buildContactInfo(payload);
    const detailed = buildDetailedContent(payload);

    // 추출 가능한 값이 하나도 없으면 null — enrich route 가 skipped 로 기록
    if (!eligibility && !applyMethod && !contact && !detailed) return null;

    return {
      eligibility,
      apply_method: applyMethod,
      contact_info: contact,
      detailed_content: detailed,
    };
  },
};

export default fetcher;
