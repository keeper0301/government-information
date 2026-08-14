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
  "거주",
  "방문",
  "공식",
];

const FALLBACK_FACTS = [
  "본문에서 지원 대상 문장을 찾지 못했습니다.",
  "본문에서 지원 혜택 문장을 찾지 못했습니다.",
  "본문에서 신청 방법 문장을 찾지 못했습니다.",
];

const BOILERPLATE_RE = /내 조건에 맞는 정부 지원|정책 정보를 큐레이션|데이터 출처|본 서비스는 정보 안내|이 글에서 확인할 수 있는 것|더 자세한 맞춤 정책|자주 묻는 질문|카테고리 다른 글|마감 놓치지 마세요|관심 있는 정책에 알림|공식 출처를 기준/;

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

function decodeMarkdown(input: string): string {
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
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\*\*/g, "")
    .replace(/`/g, "");
}

function normalizeLine(input: string): string {
  return stripHtml(input)
    .replace(/^#{1,6}\s*/, "")
    .replace(/^[-–—\d.)\s]+/, "")
    .replace(/\s*\|\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function contentLines(post: ReelVideoPostInput): string[] {
  const text = decodeMarkdown([post.meta_description, post.content].filter(Boolean).join("\n"));
  return text
    .split(/\n+/)
    .map(normalizeLine)
    .filter((line) => line.length >= 8 && !/^[-: ]+$/.test(line))
    .filter((line) => !BOILERPLATE_RE.test(line));
}

function tableValue(lines: string[], labelRe: RegExp): string | null {
  for (const line of lines) {
    if (!labelRe.test(line)) continue;
    const cleaned = line
      .replace(labelRe, "")
      .replace(/^[:\s|]+/, "")
      .replace(/\s+/g, " ")
      .trim();
    if (cleaned.length >= 4) return cleaned;
  }
  return null;
}

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?。！？]|다\.|요\.)\s+|[\n•·]+/)
    .map(normalizeLine)
    .filter((s) => s.length >= 18)
    .map((s) => (s.length > 118 ? `${s.slice(0, 115).trim()}…` : s));
}

function scoreSentence(sentence: string): number {
  let score = Math.min(sentence.length, 100) / 100;
  for (const keyword of INFO_KEYWORDS) {
    if (sentence.includes(keyword)) score += 0.45;
  }
  if (/\d/.test(sentence)) score += 0.45;
  if (/반드시|정확한|확인해야|확인하셔야|공식/.test(sentence)) score -= 0.25;
  return score;
}

function sentenceFact(lines: string[], pattern: RegExp, avoid: RegExp | null = null): string | null {
  const sentences = splitSentences(lines.join("\n"))
    .filter((sentence) => pattern.test(sentence))
    .filter((sentence) => !avoid || !avoid.test(sentence))
    .sort((a, b) => scoreSentence(b) - scoreSentence(a));
  return sentences[0] ?? null;
}

function conciseFact(input: string, max = 54): string {
  const cleaned = stripHtml(input)
    .replace(/^(지원 대상|지원 혜택|지원 내용|신청 방법|지원 지역|대상|혜택|신청)\s+/, "")
    .replace(/확인해야\s*합니다\.?/g, "확인")
    .replace(/해야 합니다\.?/g, "확인")
    .replace(/확인해야 함니다\.?/g, "확인")
    .replace(/필요합니다\.?/g, "확인")
    .replace(/가능합니다\.?/g, "가능")
    .replace(/제공합니다\.?/g, "지원")
    .replace(/권장됩니다\.?/g, "권장")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.length > max ? `${cleaned.slice(0, max - 1).trim()}…` : cleaned;
}

function twoLineFact(primary: string, secondary?: string | null): string {
  return multiFact([primary, secondary]);
}

function multiFact(items: Array<string | null | undefined>, limit = 3): string {
  const facts: string[] = [];
  for (const item of items) {
    if (!item) continue;
    const fact = conciseFact(item, facts.length === 0 ? 46 : 50);
    if (!fact) continue;
    const duplicate = facts.some((seen) => seen.includes(fact.slice(0, 18)) || fact.includes(seen.slice(0, 18)));
    if (!duplicate) facts.push(fact);
    if (facts.length >= limit) break;
  }
  return facts.join("\n");
}

function distinctSentence(lines: string[], pattern: RegExp, used: Array<string | null | undefined>, avoid: RegExp | null = null): string | null {
  const sentences = splitSentences(lines.join("\n"))
    .filter((sentence) => pattern.test(sentence))
    .filter((sentence) => !avoid || !avoid.test(sentence))
    .sort((a, b) => scoreSentence(b) - scoreSentence(a));
  for (const sentence of sentences) {
    const fact = conciseFact(sentence, 50);
    const duplicate = used.filter(Boolean).some((seen) => {
      const normalized = conciseFact(String(seen), 50);
      return normalized.includes(fact.slice(0, 18)) || fact.includes(normalized.slice(0, 18));
    });
    if (!duplicate) return sentence;
  }
  return null;
}

function labeledFact(label: string, fact: string, secondary?: string | null): string {
  return `${label}\n${twoLineFact(fact, secondary)}`;
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
  if (/신혼/.test(title)) return "신혼부부";
  if (/청년/.test(title)) return "청년";
  if (/노인|어르신|장애인/.test(title)) return "어르신·장애인";
  if (/소상공|자영|사업자|창업/.test(title) || /창업|소상공|사업|자영/.test(category)) return "사장님";
  if (/주거|월세|전세|임대/.test(title) || /주거|월세|전세|임대/.test(category)) return "주거 지원 대상자";
  return "지원 대상자";
}

function titleBenefit(title: string, category: string): string {
  if (/장난감|도서|대여/.test(title)) return "무료 장난감 대여";
  if (/월세|임대료/.test(title)) return "월세 지원";
  if (/이자|대출이자/.test(title)) return "대출이자 지원";
  if (/마음|상담|심리/.test(title)) return "상담 지원";
  if (/대출|융자|자금/.test(title)) return "자금 지원";
  if (/교육|훈련/.test(title)) return "교육 지원";
  if (/공동체|프로그램/.test(title)) return "공동체 활동";
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

function buildArticleFacts(post: ReelVideoPostInput) {
  const lines = contentLines(post);
  const targetFromTable = tableValue(lines, /^지원\s*대상|^대상/);
  const benefitFromTable = tableValue(lines, /^지원\s*(혜택|내용)|^혜택/);
  const applyFromTable = tableValue(lines, /^신청\s*방법|^신청/);
  const regionFromTable = tableValue(lines, /^지원\s*지역|^지역/);

  const targetSentence = sentenceFact(
    lines,
    /대상|거주|신혼|청년|소상공|사업자|노인|어르신|장애인|가구|무주택|소득|혼인|영구임대/,
    /반드시|공식 안내|정확한 자격 조건/,
  );
  const targetSecondary = sentenceFact(lines, /소득|무주택|혼인|연령|주민등록|거주|영구임대주택/, /지원 금액|월 최대|총 지원|혜택/);

  const benefitSentence = sentenceFact(
    lines,
    /지원 금액|지원 내용|지원 혜택|대출 이자|현금 지원|월 최대|최대|프로그램|활동|자원 연계|현물대여|금액|혜택/,
    /구체적인 내용은|확인해야/,
  );
  const benefitSecondary = sentenceFact(lines, /월 최대|최대|기간|계좌|프로그램|장소|전문가|자원/);

  const applySentence = sentenceFact(lines, /신청|방문|접수|주민센터|관리사무소|공식|복지로|누리집|마감|기간/);
  const deadlineSentence = sentenceFact(lines, /신청 기간|마감일|상시|연중|현재.*명시|최신 공고/);

  const target = [targetFromTable, regionFromTable].filter(Boolean).join(" · ") || targetSentence || FALLBACK_FACTS[0];
  const benefit = benefitFromTable || benefitSentence || FALLBACK_FACTS[1];
  const apply = applyFromTable || applySentence || FALLBACK_FACTS[2];
  const targetExtra = distinctSentence(lines, /소득|무주택|혼인|연령|주민등록|거주/, [target, targetSecondary], /지원 금액|월 최대|총 지원|혜택/);
  const benefitExtra = distinctSentence(lines, /월 최대|최대|기간|대출 종류|소득 수준|차등|계좌|프로그램|장소|전문가|자원/, [benefit, benefitSecondary]);
  const applyExtra = distinctSentence(lines, /서류|접수처|방문|주민센터|누리집|복지로|신청 기간|마감|상시|연중/, [apply, deadlineSentence]);

  return {
    target,
    targetSecondary: targetSecondary && targetSecondary !== target ? targetSecondary : null,
    targetExtra,
    benefit,
    benefitSecondary: benefitSecondary && benefitSecondary !== benefit ? benefitSecondary : null,
    benefitExtra,
    apply,
    applySecondary: deadlineSentence && deadlineSentence !== apply ? deadlineSentence : null,
    applyExtra,
  };
}

export function buildReelVideoPlan(post: ReelVideoPostInput): ReelVideoPlan {
  const category = post.category ?? "정책정보";
  const title = clampTitle(post.title);
  const readableCoverTitle = makeReadableCoverTitle(post.title, category);
  const facts = buildArticleFacts(post);
  return {
    durationSeconds: 18,
    slides: [
      {
        eyebrow: `${category} · keepioo`,
        kicker: title,
        title: readableCoverTitle,
        body: `놓치기 쉬운 조건은 저장\n자격\n금액\n신청`,
      },
      {
        eyebrow: "",
        title: "자격",
        body: multiFact([facts.target, facts.targetSecondary, facts.targetExtra]),
      },
      {
        eyebrow: "",
        title: "금액",
        body: multiFact([facts.benefit, facts.benefitSecondary, facts.benefitExtra]),
      },
      {
        eyebrow: "",
        title: "신청",
        body: multiFact([facts.apply, facts.applySecondary, facts.applyExtra]),
      },
      {
        eyebrow: "마지막",
        title: "저장 리스트",
        body: `자격 조건\n신청 기간\n제출 서류\nkeepioo에서 “${clampTitle(post.title, 18)}” 검색`,
      },
    ],
  };
}
