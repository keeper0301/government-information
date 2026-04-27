// 클라이언트/서버 양쪽에서 사용할 수 있는 유틸리티 함수

// D-day 계산 (마감일까지 남은 일수)
export function calcDday(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const end = new Date(dateStr);
  const now = new Date();
  const diff = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  return diff >= 0 ? diff : null;
}

// 제목에 적힌 연도가 너무 오래됐는지 확인
// - 제목에서 20XX 형태 연도(2000~2099) 첫 매치 추출
//   ("2024년", "K-스타트업 2024 부처", "2024" 단독 등 모두 인식)
// - 앞뒤에 다른 숫자가 붙은 경우는 제외 (예: "20241번", "12024" 은 연도 아님)
// - 추출된 연도가 minYear 미만이면 "옛 공고" 로 판단 → true
// - 연도가 없으면 false (상시 프로그램일 가능성이 있으므로 차단하지 않음)
//
// 예) minYear=2025 일 때:
//     "2023년 지원계획" → true
//     "도전! K-스타트업 2024 공고" → true
//     "2025년 모집" / "상시 지원" → false
export function isOutdatedByTitle(
  title: string,
  minYear: number,
): boolean {
  // (?<!\d) = 앞에 숫자 없음, (?!\d) = 뒤에 숫자 없음
  // 20\d{2} = 2000~2099 범위 연도만 (전화번호·우편번호 오탐 최소화)
  const match = title.match(/(?<!\d)(20\d{2})(?!\d)/);
  if (!match) return false;
  const year = parseInt(match[1], 10);
  return year < minYear;
}

// 수집·청소에서 공통으로 쓰는 최소 허용 연도
// 올해 - 1 (올해 포함 작년까지 허용, 재작년 이전은 옛 공고)
export function currentMinAllowedYear(): number {
  return new Date().getFullYear() - 1;
}

// 달력 셀에 제목을 짧게 표시하기 위한 헬퍼.
// 좁은 셀에서도 사업명이 먼저 눈에 들어오게 앞쪽 연도·괄호를 제거.
// 예) "2026년 청년 월세 특별지원" → "청년 월세 특별지원"
//     "「2026년도」 창업"           → "창업"
//
// 사용처: app/calendar/page.tsx + components/calendar-preview.tsx
// (이전엔 두 파일에 동일 정의 중복 → 여기로 통일).
export function shortenCalendarTitle(title: string): string {
  return title
    .replace(/^\d{4}년도?\s*/g, "")
    .replace(/^「|」/g, "")
    .trim();
}

// ============================================================
// 공고 본문(description) 정제 — HTML 엔티티·태그 해제 + 구조화
// ============================================================
// 스크래퍼가 원문 HTML 을 텍스트로 그대로 저장해 &nbsp; · &middot; · &#39; 같은
// 엔티티가 화면에 노출되고 ▶ 섹션 구분자가 한 덩어리로 뭉쳐 보이는 문제 해결.
//
// 안전 원칙
//   - 입력이 null/undefined → "" 반환 (안전 기본값)
//   - 결과는 평문 (plaintext) — XSS 안전, React 가 기본적으로 escape
//   - idempotent (이미 정제된 텍스트를 다시 넣어도 같은 결과)
// ============================================================

// HTML 엔티티 디코드. 정부 공고에 자주 나오는 것만 커버 + 숫자 엔티티 범용 처리.
//
// 중요: 치환 순서
//   - 다른 엔티티를 먼저 처리한 뒤 &amp; 를 맨 마지막에 처리해야 함.
//   - 이유: 원문이 &amp;nbsp; 처럼 이중 인코딩된 경우 &amp; 를 먼저 &로 바꾸면
//     &nbsp; 가 되는데, 이 pass 에선 이미 &nbsp; 치환이 지나갔기에 그대로 남음.
//   - 순서를 뒤집거나 decodeOnce 를 반복(아래 cleanDescription 에서) 해서 해결.
function decodeHtmlEntitiesOnce(text: string): string {
  const named: Array<[string, string]> = [
    // &amp; 를 제외한 나머지 먼저
    ["&nbsp;", " "],
    ["&lt;", "<"],
    ["&gt;", ">"],
    ["&quot;", '"'],
    ["&apos;", "'"],
    ["&middot;", "·"],
    ["&hellip;", "…"],
    ["&ndash;", "–"],
    ["&mdash;", "—"],
    ["&lsquo;", "'"],
    ["&rsquo;", "'"],
    ["&ldquo;", "“"],
    ["&rdquo;", "”"],
    // 정부 보도자료에 자주 등장하는 추가 entity (2026-04-28 회귀 가드)
    ["&rarr;", "→"],
    ["&larr;", "←"],
    ["&uarr;", "↑"],
    ["&darr;", "↓"],
    ["&bull;", "•"],
    ["&sim;", "~"],
    ["&times;", "×"],
    ["&divide;", "÷"],
    ["&plusmn;", "±"],
    ["&trade;", "™"],
    ["&copy;", "©"],
    ["&reg;", "®"],
    ["&deg;", "°"],
    // &amp; 는 맨 마지막 (아래 루프가 다시 돌아 이중 인코딩을 재처리)
    ["&amp;", "&"],
  ];
  let out = text;
  for (const [entity, ch] of named) {
    if (out.includes(entity)) {
      out = out.split(entity).join(ch);
    }
  }
  // 숫자 엔티티 &#123; / 16진수 엔티티 &#x1F;
  out = out.replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
    const n = parseInt(hex, 16);
    if (!Number.isFinite(n) || n < 0 || n > 0x10ffff) return "";
    try {
      return String.fromCodePoint(n);
    } catch {
      return "";
    }
  });
  out = out.replace(/&#(\d+);/g, (_, dec) => {
    const n = parseInt(dec, 10);
    if (!Number.isFinite(n) || n < 0 || n > 0x10ffff) return "";
    try {
      return String.fromCodePoint(n);
    } catch {
      return "";
    }
  });
  return out;
}

// 이중(또는 그 이상) 인코딩된 엔티티까지 잡기 위해 변화가 없을 때까지 최대 3회 반복.
// 예: "&amp;nbsp;" → "&nbsp;" (1회) → " " (2회)
function decodeHtmlEntities(text: string): string {
  let current = text;
  for (let i = 0; i < 3; i++) {
    const next = decodeHtmlEntitiesOnce(current);
    if (next === current) break;
    current = next;
  }
  return current;
}

// ============================================================
// stripHtmlTags — 태그만 제거해 평문을 돌려주는 가벼운 유틸
// ============================================================
// cleanDescription 은 정부 공고 본문용이라 줄바꿈·섹션 구분·라벨 삽입 같은
// 구조화까지 해버려 blog meta_description 처럼 '한 줄 리드 문장' 에는 과함.
// 이 함수는 태그 제거 + 엔티티 디코드 + 공백 정리까지만.
// blog meta_description 에 <strong> 이 섞여 텍스트로 노출되는 사고 대응용.
export function stripHtmlTags(raw: string | null | undefined): string {
  if (!raw) return "";
  let text = decodeHtmlEntities(raw);
  text = text.replace(/<[^>]+>/g, "");
  return text.replace(/\s+/g, " ").trim();
}

export function cleanDescription(raw: string | null | undefined): string {
  if (!raw) return "";
  let text = raw;

  // 1) HTML 엔티티 디코드 먼저 (이후 구조 파악 정확도 ↑)
  text = decodeHtmlEntities(text);

  // 2) 블록 태그 → 줄바꿈. 그 외 태그는 공백으로 제거.
  //    <p> 는 문단 구분자라 \n\n 로 두 줄 띄움 — 정책브리핑 뉴스 본문에서
  //    "앞으로 … 예정이다. 이에 아이를 … 기대된다." 같은 문장이 <p></p><p></p>
  //    로 분리돼 오는데, 한 줄 \n 만 넣으면 filter·whitespace 정리 단계에서
  //    붙어버려 한 덩어리처럼 렌더됐음. \n\n 이어야 문단 간격 살아남.
  text = text.replace(/<br\s*\/?\s*>/gi, "\n");
  text = text.replace(/<\/p>/gi, "\n\n");
  text = text.replace(/<\/(div|li|h[1-6]|tr)>/gi, "\n");
  text = text.replace(/<li[^>]*>/gi, "• ");
  text = text.replace(/<[^>]+>/g, " ");

  // 3) 섹션 구분자 앞에 줄바꿈 — 정부 공고 관행상 다음 기호들이 새 섹션 시작 신호
  //    ▶/◆/■/◎/※ 외에도 지자체 공고에서 ☞/▷/▣/◇/□/○ 가 매우 빈번 (대출 1568건 중
  //    18% 가 ☞ 포함). 모두 동일하게 두 줄 띄움 처리.
  text = text.replace(/\s*▶\s*/g, "\n\n▶ ");
  text = text.replace(/\s*◆\s*/g, "\n\n◆ ");
  text = text.replace(/\s*■\s*/g, "\n\n■ ");
  text = text.replace(/\s*◎\s*/g, "\n\n◎ ");
  text = text.replace(/\s*☞\s*/g, "\n\n☞ ");
  text = text.replace(/\s*▷\s*/g, "\n\n▷ ");
  text = text.replace(/\s*▣\s*/g, "\n\n▣ ");
  text = text.replace(/\s*◇\s*/g, "\n\n◇ ");
  text = text.replace(/\s*□\s*/g, "\n\n□ ");
  // ○ 는 본문 가운데에서 일반 구두점으로 쓰일 때가 있으므로 줄 시작 또는 공백 뒤에서만
  text = text.replace(/(^|\s)○\s*/g, "$1\n\n○ ");
  text = text.replace(/\s*※\s*/g, "\n※ ");

  // 4) ①②③... 원문자 번호 앞에 줄바꿈 (목록 가독성)
  text = text.replace(/\s*([①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮])\s*/g, "\n$1 ");

  // 4-1) 정부 공고 표준 라벨 앞에 줄바꿈 삽입
  //      description 에 "지원대상: X 상세조건: Y 대출한도: Z 문의: ..." 처럼
  //      여러 key-value 가 한 줄로 붙어오는 경우 각 라벨 앞을 개행해서 가독성 확보.
  //      오탐 최소화 위해 콜론(: 또는 ：) 이 직접 붙은 것만 매칭.
  const LABELS = [
    "지원대상", "지원 대상",
    "자격요건", "자격 요건", "자격조건",
    "상세조건", "상세 조건", "신청자격", "신청 자격",
    "지원내용", "지원 내용", "혜택내용", "혜택 내용",
    "대출한도", "대출 한도", "보증한도", "보증 한도",
    "지원금액", "지원 금액", "지원규모", "지원 규모",
    "대출용도", "대출 용도",
    "이율", "금리",
    "상환조건", "상환 조건", "상환기간", "상환 기간",
    "신청방법", "신청 방법", "접수방법", "접수 방법",
    "접수처", "접수 처", "접수기간", "접수 기간",
    "신청기간", "신청 기간",
    "취급기관", "취급 기관", "운영기관", "운영 기관",
    "문의처", "문의 처", "문의",
    "필요서류", "필요 서류", "제출서류", "제출 서류",
    "유의사항", "유의 사항", "기타사항", "기타 사항",
  ];
  for (const label of LABELS) {
    // 앞에 공백(줄바꿈 포함)이 있고 뒤에 콜론 → 앞 공백을 \n 으로 치환.
    // 문장 맨 앞 라벨은 보존 (앞에 아무 것도 없으니 매치 안 됨).
    const escaped = label.replace(/ /g, "\\s*");
    const pattern = new RegExp(`(?<!^)\\s+(${escaped})\\s*[:：]`, "g");
    text = text.replace(pattern, `\n$1:`);
  }

  // 5) 공백 정리 — 줄 단위로 처리해 줄바꿈 보존
  //    NBSP 유니코드( ) · zero-width(​·‌·‍·﻿) 도
  //    일반 공백으로 통일해야 trim 단계에서 제대로 정리됨.
  text = text
    .split("\n")
    .map((line) =>
      line
        .replace(/[ ​‌‍﻿]/g, " ")
        .replace(/[ \t]+/g, " ")
        .trim(),
    )
    .join("\n");

  // 6) 3줄 이상 공백 줄은 2줄로 제한 (단락 간격 통일)
  text = text.replace(/\n{3,}/g, "\n\n");

  return text.trim();
}

// ============================================================
// paragraphizeNewsBody — 정책 뉴스 본문 자동 단락 분할
// ============================================================
// 배경:
//   korea.kr / 네이버 뉴스 RSS body 가 DB 에 저장될 때 cleanDescription
//   거치면서 단락 구분(\n\n) 이 거의 사라진 한 덩어리 평문으로 남음
//   (예: 1200자 한 덩어리 + 끝에 "문의:..." 한 줄). 사용자에게 그대로
//   whitespace-pre-wrap 렌더 하면 글자 벽처럼 보여 가독성이 매우 떨어짐.
//
// 동작:
//   1) 기존 \n 줄바꿈은 \n\n 으로 강화해 단락 break 로 사용 (예: "문의:..." 라인).
//   2) 각 단락이 200자 이상이면 한국어 종결 어미 패턴으로 문장 분할 후
//      120자 이상 누적되면 새 단락 시작.
//   3) 종결 어미 매치 실패 시 일반 마침표·물음표·느낌표 + 공백으로 fallback.
//
// 결과는 \n\n 으로 단락 구분된 평문. 호출처는 split("\n\n") 후 <p> 로 렌더.
// ============================================================
export function paragraphizeNewsBody(text: string | null | undefined): string {
  if (!text) return "";

  // 1) 기존 \n 보존 + 강화 — 단일 줄바꿈도 단락 break 로 승격
  const normalized = text.replace(/\n+/g, "\n\n");
  const paragraphs = normalized.split(/\n\n/).filter((p) => p.trim());

  // 한국어 뉴스에서 자주 나오는 종결 어미 — 이 뒤 공백 = 문장 종료
  // lookbehind 로 패턴 보존하며 분할. 모든 패턴은 마침표(.) 포함.
  const KOREAN_SENTENCE_END = /(?<=다\.|요\.|죠\.|니다\.|입니다\.|이다\.|것이다\.|예정이다\.|밝혔다\.|전했다\.|답했다\.|덧붙였다\.|설명했다\.|강조했다\.|당부했다\.|나타났다\.|있었다\.)\s+/;

  const result: string[] = [];
  const MIN_LEN = 120; // 한 단락 최소 길이 — 한국어 뉴스 단락 평균 200~300자

  for (const para of paragraphs) {
    if (para.length < 200) {
      result.push(para);
      continue;
    }
    // 종결 어미 분할 → 실패 시 일반 마침표 fallback
    let sentences = para.split(KOREAN_SENTENCE_END).filter((s) => s.trim());
    if (sentences.length <= 1) {
      sentences = para.split(/(?<=[.!?])\s+/).filter((s) => s.trim());
    }

    let current = "";
    for (const sent of sentences) {
      current = current ? `${current} ${sent}` : sent;
      if (current.length >= MIN_LEN) {
        result.push(current);
        current = "";
      }
    }
    if (current) result.push(current);
  }

  return result.join("\n\n");
}

// 핵심 정보 필드(eligibility · benefits 등)가 description 본문과 사실상 같은지 판정.
// 데이터 실측: 대출 1568건 중 eligibility 채워진 411건 100% 가 description 과 완전 동일.
// 핵심 정보 카드에 본문을 한 번 더 보여주는 건 가독성 저하 → 같으면 숨기는 게 맞음.
//
// 판정 기준 (둘 중 하나라도 참이면 중복):
//   1) cleanDescription 처리 후 공백 정규화한 두 문자열이 정확히 같음
//   2) 두 문자열 길이가 비슷하고(±10%) 한쪽이 다른 쪽의 앞 100자를 포함
//      → 스크래퍼가 끝부분만 살짝 다르게 자른 케이스 대응
export function isSubstantiallyDuplicate(
  value: string | null | undefined,
  description: string | null | undefined,
): boolean {
  if (!value || !description) return false;
  const norm = (s: string) => cleanDescription(s).replace(/\s+/g, " ").trim();
  const a = norm(value);
  const b = norm(description);
  if (!a || !b) return false;
  if (a === b) return true;
  // 짧은 값(<50자) 은 부분일치로 판정하지 않음 — 정상적인 짧은 요약일 가능성
  if (a.length < 50 || b.length < 50) return false;
  // 길이 비슷 + 앞 100자 포함 → 사실상 같은 내용
  const ratio = Math.min(a.length, b.length) / Math.max(a.length, b.length);
  if (ratio < 0.7) return false;
  const head = a.slice(0, 100);
  return b.includes(head);
}

// ============================================================
// 본문 description 에서 카드와 중복되는 "라벨: 값" 라인 제거
// ============================================================
// fsc/kinfa collector 는 API 응답을 "지원대상: X\n\n대출한도: Y\n\n금리: Z…" 식으로
// 조립해서 description 에 넣는다. 그런데 같은 필드가 "핵심 정보" 카드에도 표시되므로,
// 사용자 입장에선 한 페이지에 같은 내용이 두 번 반복되어 답답함 (이미지 #8 사례).
//
// 이 함수는 description 을 \n\n 또는 \n 단위로 쪼개서, 카드에 이미 들어간 라벨을
// 가진 블록은 제거하고, "상세조건" 같이 카드엔 없는 긴 설명 블록만 남긴다.
// mss 등 구조화 안 된 description 은 블록 판별 실패 시 원문 그대로 반환 → 안전.
// ============================================================
const CARD_DUPLICATE_LABELS = [
  "지원대상", "신청대상", "대상", "자격", "자격요건",
  "대출한도", "지원금액", "혜택", "혜택내용",
  "금리", "이자", "이자율",
  "상환방식", "상환조건", "최대 대출기간", "대출기간", "상환기간",
  "대출용도", "용도",
  "취급기관", "문의", "연락처",
  "모집기한", "신청기간", "접수기간", "지원기간",
  "신청방법", "신청절차",
];

export function stripCardDuplicates(desc: string | null | undefined): string {
  if (!desc) return "";
  // \n\n 우선 split. 블록 1개밖에 없으면 \n 단일로 재시도.
  let blocks = desc.split(/\n{2,}/);
  if (blocks.length === 1) blocks = desc.split(/\n/);

  const kept = blocks.filter((raw) => {
    const b = raw.trim();
    if (b.length === 0) return false;
    // "라벨:" 또는 "라벨 :" 으로 시작하는 블록만 판별 대상
    const m = b.match(/^([가-힣A-Za-z][가-힣A-Za-z ·]{0,14})\s*[:：]/);
    if (!m) return true; // 라벨 없는 자유 텍스트 → 보존
    const label = m[1].replace(/\s/g, "");
    return !CARD_DUPLICATE_LABELS.some((k) => k.replace(/\s/g, "") === label);
  });
  return kept.join("\n\n").trim();
}

// ============================================================
// 블로그 글 헬퍼
// ============================================================

// 한글 제목 → URL 친화적 slug 생성
// 한글은 그대로 유지 (Next.js·Vercel 모두 한글 URL 지원), 공백 → 하이픈,
// 특수문자 제거. 마지막에 시간+random 8자 suffix 로 충돌 방지.
//   예: "2026년 청년월세 신청방법" → "2026년-청년월세-신청방법-a3f9k2x1"
// 4자 → 8자로 늘려서 동시 호출에서도 UNIQUE 위반 거의 0.
export function makeSlug(title: string): string {
  const base = title
    .toLowerCase()
    .trim()
    // URL 에 안전한 문자만 (한글·영문·숫자·하이픈)
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80);
  // 시간 4자 + random 4자 = 8자 suffix (36^8 = 2.8조 가지)
  const time = Date.now().toString(36).slice(-4);
  const rand = Math.random().toString(36).slice(2, 6);
  return `${base}-${time}${rand}`;
}

// ============================================================
// HTML Sanitizer — AI 생성 HTML 의 위험 태그·속성 제거
// ============================================================
// 화이트리스트 기반 간단 정제. 외부 패키지 없이 정규식으로.
// AdSense 정책 + XSS 방어를 위해 발행 전 항상 적용.
//
// 제거:
//   - <script>, <style>, <iframe>, <object>, <embed>, <link>, <meta>, <form>
//   - on* 이벤트 속성 (onclick, onerror, onload 등)
//   - javascript:, data:, vbscript: 스킴의 href/src
//
// 유지: 일반 텍스트 마크업 (h1~h6, p, ul, ol, li, table, a, strong, em, blockquote 등)
// ============================================================
export function sanitizeHtml(html: string): string {
  let safe = html;

  // 위험 태그 통째로 제거 (내용 포함)
  const dangerousTags = ["script", "style", "iframe", "object", "embed", "form", "input", "button", "select", "textarea"];
  for (const tag of dangerousTags) {
    const re = new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}>`, "gi");
    safe = safe.replace(re, "");
    // 자체 닫힘 또는 닫힘 태그 누락도 제거
    const re2 = new RegExp(`<\\/?${tag}\\b[^>]*>`, "gi");
    safe = safe.replace(re2, "");
  }

  // 단독 위험 태그 (link, meta 등)
  const voidDanger = ["link", "meta", "base"];
  for (const tag of voidDanger) {
    const re = new RegExp(`<${tag}\\b[^>]*>`, "gi");
    safe = safe.replace(re, "");
  }

  // on* 이벤트 속성 제거 (onclick, onerror 등)
  safe = safe.replace(/\son\w+\s*=\s*"[^"]*"/gi, "");
  safe = safe.replace(/\son\w+\s*=\s*'[^']*'/gi, "");
  safe = safe.replace(/\son\w+\s*=\s*[^\s>]+/gi, "");

  // 위험 스킴 (javascript:, data:, vbscript:) → 빈 href 로 변환
  safe = safe.replace(/(href|src)\s*=\s*"\s*(javascript|data|vbscript):[^"]*"/gi, '$1=""');
  safe = safe.replace(/(href|src)\s*=\s*'\s*(javascript|data|vbscript):[^']*'/gi, "$1=''");

  return safe;
}

// 한국어 글의 예상 읽기 시간 (분)
// 평균 한국 성인 분당 읽기 속도: 약 500자
export function estimateReadingTime(content: string): number {
  const charCount = content.replace(/\s/g, "").length;
  return Math.max(1, Math.ceil(charCount / 500));
}

// 한국어 날짜 포맷 (예: "2026년 4월 22일")
export function formatKoreanDate(iso: string): string {
  return new Date(iso).toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

// 본문에서 description (첫 단락, max 160자) 자동 추출
// markdown/html 마크업 제거 후 짧게 자름
export function extractDescription(content: string, maxLen = 160): string {
  const plain = content
    .replace(/<[^>]+>/g, "")          // HTML 태그 제거
    .replace(/[#*`_~\[\]()>]/g, "")   // markdown 마크업 제거
    .replace(/\s+/g, " ")
    .trim();
  if (plain.length <= maxLen) return plain;
  return plain.slice(0, maxLen).replace(/\s+\S*$/, "") + "…";
}

// ============================================================
// cn — shadcn/ui 컴포넌트 클래스 머지 헬퍼
// ============================================================
// shadcn init (chore/shadcn-init 브랜치) 시 자동 추가됨.
// components/ui/* 가 import { cn } from "@/lib/utils" 형태로 가져감.
// keepioo 자체 유틸과 평화롭게 공존하기 위해 같은 파일 끝에 부착.
// ============================================================
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
