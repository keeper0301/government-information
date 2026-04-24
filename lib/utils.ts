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

export function cleanDescription(raw: string | null | undefined): string {
  if (!raw) return "";
  let text = raw;

  // 1) HTML 엔티티 디코드 먼저 (이후 구조 파악 정확도 ↑)
  text = decodeHtmlEntities(text);

  // 2) 블록 태그 → 줄바꿈. 그 외 태그는 공백으로 제거.
  text = text.replace(/<br\s*\/?\s*>/gi, "\n");
  text = text.replace(/<\/(p|div|li|h[1-6]|tr)>/gi, "\n");
  text = text.replace(/<li[^>]*>/gi, "• ");
  text = text.replace(/<[^>]+>/g, " ");

  // 3) 섹션 구분자 앞에 줄바꿈 — 정부 공고 관행상 ▶/◆/■/◎/※ 가 새 섹션 시작 신호
  text = text.replace(/\s*▶\s*/g, "\n\n▶ ");
  text = text.replace(/\s*◆\s*/g, "\n\n◆ ");
  text = text.replace(/\s*■\s*/g, "\n\n■ ");
  text = text.replace(/\s*◎\s*/g, "\n\n◎ ");
  text = text.replace(/\s*※\s*/g, "\n※ ");

  // 4) ①②③... 원문자 번호 앞에 줄바꿈 (목록 가독성)
  text = text.replace(/\s*([①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮])\s*/g, "\n$1 ");

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
    .filter((line) => line.length > 0)
    .join("\n");

  // 6) 3줄 이상 공백 줄은 2줄로 제한 (단락 간격 통일)
  text = text.replace(/\n{3,}/g, "\n\n");

  return text.trim();
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
