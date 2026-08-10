// ============================================================
// Instagram Reels 영상 기획 — blog_posts 텍스트를 짧은 세로 영상 슬라이드로 변환
// ============================================================

export type ReelVideoPostInput = {
  title: string;
  content: string | null;
  meta_description: string | null;
  category: string | null;
  slug: string;
};

export type ReelVideoSlide = {
  eyebrow: string;
  title: string;
  body: string;
  kicker?: string;
};

export type ReelVideoPlan = {
  slides: ReelVideoSlide[];
  durationSeconds: number;
};

const INFO_KEYWORDS = [
  "대상",
  "지원",
  "신청",
  "기간",
  "서류",
  "소득",
  "금액",
  "문의",
  "자격",
  "마감",
];

export function stripHtml(input: string): string {
  return input
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?。！？]|다\.|요\.)\s+|[\n•·]+/)
    .map((s) => s.replace(/^[-–—\d.)\s]+/, "").trim())
    .filter((s) => s.length >= 18)
    .map((s) => (s.length > 95 ? `${s.slice(0, 92).trim()}…` : s));
}

function scoreSentence(sentence: string): number {
  let score = Math.min(sentence.length, 90) / 90;
  for (const keyword of INFO_KEYWORDS) {
    if (sentence.includes(keyword)) score += 0.4;
  }
  if (/\d/.test(sentence)) score += 0.3;
  return score;
}

function pickBullets(post: ReelVideoPostInput, count: number): string[] {
  const text = stripHtml([post.meta_description, post.content].filter(Boolean).join("\n"));
  const sentences = splitSentences(text)
    .sort((a, b) => scoreSentence(b) - scoreSentence(a));
  const deduped: string[] = [];
  for (const sentence of sentences) {
    if (deduped.some((existing) => existing.includes(sentence.slice(0, 24)) || sentence.includes(existing.slice(0, 24)))) {
      continue;
    }
    deduped.push(sentence);
    if (deduped.length >= count) break;
  }
  while (deduped.length < count) {
    deduped.push([
      "대상·신청 기간·제출 서류를 먼저 확인하세요.",
      "지역과 소득 조건에 따라 실제 지원 내용이 달라질 수 있어요.",
      "자세한 신청 방법은 keepioo 상세 글에서 확인하세요.",
    ][deduped.length]);
  }
  return deduped;
}

function bodyLine(input: string): string {
  const cleaned = stripHtml(input)
    .replace(/해야 합니다\.?/g, "확인")
    .replace(/확인해야 함니다\.?/g, "확인")
    .replace(/필요합니다\.?/g, "확인")
    .replace(/가능합니다\.?/g, "가능")
    .replace(/제공합니다\.?/g, "지원")
    .replace(/\s+/g, " ")
    .trim();
  if (/대상|조건|자격/.test(cleaned)) return "대상 조건부터 확인";
  if (/기간|마감|신청/.test(cleaned)) return "신청 기간부터 확인";
  if (/서류|공식|신청처|문의/.test(cleaned)) return "공식 신청처 확인";
  return cleaned.slice(0, 28);
}

function clampTitle(title: string, max = 74): string {
  const clean = stripHtml(title);
  return clean.length > max ? `${clean.slice(0, max - 1).trim()}…` : clean;
}

function titleRegion(title: string): string | null {
  return title.match(/20\d{2}년\s*([^\s]+구|[^\s]+시|[^\s]+군|[^\s]+도|[^\s]+특별시|[^\s]+광역시)/)?.[1] ?? null;
}

function titleAudience(title: string, category: string): string {
  if (/영유아|아동|육아|보육|장난감|가정/.test(title) || /육아|가족|아동|출산|보육/.test(category)) return "영유아 가정";
  if (/청년/.test(title)) return "청년";
  if (/소상공|자영|사업자|창업/.test(title) || /창업|소상공|사업|자영/.test(category)) return "사장님";
  if (/주거|월세|전세|임대/.test(title) || /주거|월세|전세|임대/.test(category)) return "주거 지원 대상자";
  return "지원 대상자";
}

function titleBenefit(title: string, category: string): string {
  if (/장난감|도서|대여/.test(title)) return "무료 장난감 대여";
  if (/월세|임대료/.test(title)) return "월세 지원";
  if (/마음|상담|심리/.test(title)) return "상담 지원";
  if (/대출|융자|자금/.test(title)) return "자금 지원";
  if (/교육|훈련/.test(title)) return "교육 지원";
  if (/육아|가족|아동|출산|보육/.test(category)) return "육아 지원";
  return "정부지원";
}

function makeReadableCoverTitle(title: string, category: string): string {
  const clean = stripHtml(title);
  const region = titleRegion(clean);
  const audience = titleAudience(clean, category);
  const benefit = titleBenefit(clean, category);
  return [region, audience, benefit].filter(Boolean).join(" · ");
}

export function buildReelVideoPlan(post: ReelVideoPostInput): ReelVideoPlan {
  const bullets = pickBullets(post, 3);
  const category = post.category ?? "정책정보";
  const title = clampTitle(post.title);
  const readableCoverTitle = makeReadableCoverTitle(post.title, category);
  return {
    durationSeconds: 15,
    slides: [
      {
        eyebrow: `${category} · keepioo`,
        kicker: title,
        title: readableCoverTitle,
        body: "놓치기 쉬운 정부지원 정보\n15초로 핵심만 확인하세요",
      },
      {
        eyebrow: "1단계",
        title: "대상부터 확인",
        body: bodyLine(bullets[0]),
      },
      {
        eyebrow: "2단계",
        title: "기간을 확인",
        body: bodyLine(bullets[1]),
      },
      {
        eyebrow: "3단계",
        title: "서류를 확인",
        body: bodyLine(bullets[2]),
      },
      {
        eyebrow: "마지막",
        title: "상세 글에서 확인",
        body: `프로필 링크에서\n“${clampTitle(post.title, 24)}” 검색`,
      },
    ],
  };
}
