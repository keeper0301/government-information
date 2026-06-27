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

function clampTitle(title: string, max = 44): string {
  const clean = stripHtml(title);
  return clean.length > max ? `${clean.slice(0, max - 1).trim()}…` : clean;
}

export function buildReelVideoPlan(post: ReelVideoPostInput): ReelVideoPlan {
  const bullets = pickBullets(post, 3);
  const category = post.category ?? "정책정보";
  const title = clampTitle(post.title);
  return {
    durationSeconds: 15,
    slides: [
      {
        eyebrow: `${category} · keepioo`,
        title,
        body: "놓치기 쉬운 정부지원 정보\n15초로 핵심만 확인하세요",
      },
      {
        eyebrow: "핵심 1",
        title: "누가 확인하면 좋을까요?",
        body: bullets[0],
      },
      {
        eyebrow: "핵심 2",
        title: "신청 전 체크",
        body: bullets[1],
      },
      {
        eyebrow: "핵심 3",
        title: "놓치면 안 되는 점",
        body: bullets[2],
      },
      {
        eyebrow: "자세히 보기",
        title: "keepioo에서 바로 확인",
        body: `프로필 링크에서\n“${clampTitle(post.title, 24)}” 검색`,
      },
    ],
  };
}
