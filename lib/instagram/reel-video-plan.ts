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
const GENERIC_FACT_RE = /본문에서|공고에서 확인|공식 모집 공고|별도 명시 없음/;

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
    if (/^[은는이가]\s*/.test(cleaned)) continue;
    if (cleaned.length >= 4) return cleaned;
  }
  return null;
}

function rawTableValue(content: string | null, labelRe: RegExp): string | null {
  if (!content) return null;
  for (const row of content.split(/\n+/)) {
    const cells = row
      .split("|")
      .map((cell) => stripHtml(cell).trim())
      .filter(Boolean);
    if (cells.length < 2) continue;
    const label = cells[0].replace(/\s+/g, " ").trim();
    const value = cells.slice(1).join(" · ").replace(/\s+/g, " ").trim();
    if (labelRe.test(label) && value.length >= 4) return value;
  }
  return null;
}

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?。！？]|다\.|요\.)\s+|[\n•·]+/)
    .map(normalizeLine)
    .filter((s) => s.length >= 18);
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

function sectionFact(lines: string[], headingRe: RegExp, factRe: RegExp | null = null): string | null {
  for (let i = 0; i < lines.length; i += 1) {
    if (!headingRe.test(lines[i])) continue;
    for (const candidate of lines.slice(i + 1, i + 4)) {
      if (candidate.length < 12) continue;
      if (BOILERPLATE_RE.test(candidate)) continue;
      if (factRe && !factRe.test(candidate)) continue;
      return candidate;
    }
  }
  return null;
}

function conciseFact(input: string): string {
  return stripHtml(input)
    .replace(/^(지원 대상|지원 혜택|지원 내용|신청 방법|지원 지역|대상|혜택|신청)\s+/, "")
    .replace(/확인해야\s*합니다\.?/g, "확인")
    .replace(/해야 합니다\.?/g, "확인")
    .replace(/확인해야 함니다\.?/g, "확인")
    .replace(/필요합니다\.?/g, "확인")
    .replace(/가능합니다\.?/g, "가능")
    .replace(/제공합니다\.?/g, "지원")
    .replace(/등의 기준이 적용될 수 있습니다\.?/g, "등 기준 적용")
    .replace(/에 실제 거주하는 /g, " 실제 거주 ")
    .replace(/를 대상으로 하며 /g, " · ")
    .replace(/기준을 적용할 수 있습니다\.?/g, "기준 적용")
    .replace(/기준이 적용될 수 있습니다\.?/g, "기준 적용")
    .replace(/차등 적용될 수 있습니다\.?/g, "차등 적용")
    .replace(/연중 상시 접수하거나 특정 기간에만 접수하는 경우가 있습니다\.?/g, "연중 상시 또는 특정 기간 접수")
    .replace(/특정 기간에만 접수하는 경우가 있습니다\.?/g, "특정 기간 접수")
    .replace(/경우가 있습니다\.?/g, "경우 있음")
    .replace(/부부 합산 소득과 자산 기준을 모두 충족해야 하며, 무주택 요건도 중요한 심사 기준입니다\.?/g, "부부 합산 소득·자산·무주택 요건 확인")
    .replace(/중위소득 180% 이내 등의 기준이 적용될 수 있고 무주택 요건도 중요한 심사 기준입니다\.?/g, "중위소득 180% 이내·무주택 요건 확인")
    .replace(/지원 금액은 대출 종류, 금액, 그리고 가구 소득 수준에 따라/g, "대출 종류·금액·소득 수준별")
    .replace(/신청 기간은 /g, "")
    .replace(/^기간은 /g, "")
    .replace(/이 지원사업은 /g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function multiFact(items: Array<string | null | undefined>, limit = 2): string {
  const facts: string[] = [];
  for (const item of items) {
    if (!item) continue;
    const fact = conciseFact(item);
    if (!fact) continue;
    const duplicate = facts.some((seen) => seen.includes(fact.slice(0, 18)) || fact.includes(seen.slice(0, 18)));
    if (!duplicate) facts.push(fact);
    if (facts.length >= limit) break;
  }
  return facts.join("\n");
}

function firstConcrete(items: Array<string | null | undefined>): string | null {
  for (const item of items) {
    const fact = item ? conciseFact(item) : "";
    if (fact && !GENERIC_FACT_RE.test(fact)) return fact;
  }
  return null;
}

function concreteFacts(items: Array<string | null | undefined>, limit = 3): string[] {
  const facts: string[] = [];
  for (const item of items) {
    const fact = item ? conciseFact(item) : "";
    if (!fact || GENERIC_FACT_RE.test(fact)) continue;
    const duplicate = facts.some((seen) => seen.includes(fact.slice(0, 18)) || fact.includes(seen.slice(0, 18)));
    if (!duplicate) facts.push(fact);
    if (facts.length >= limit) break;
  }
  return facts;
}

function benefitDetailFacts(benefit: string | null | undefined): string[] {
  const fact = benefit ? conciseFact(benefit) : "";
  const details: string[] = [];
  if (/대출\s*이자/.test(fact)) details.push("주거자금 대출 이자 부담 완화");
  if (/현금/.test(fact)) details.push("지원 방식: 현금 지원");
  if (/월세/.test(fact)) details.push("월세 부담 완화 목적");
  if (/대여/.test(fact)) details.push("필요 물품을 빌려 쓰는 지원");
  return details;
}

function distinctSentence(lines: string[], pattern: RegExp, used: Array<string | null | undefined>, avoid: RegExp | null = null): string | null {
  const sentences = splitSentences(lines.join("\n"))
    .filter((sentence) => pattern.test(sentence))
    .filter((sentence) => !avoid || !avoid.test(sentence))
    .sort((a, b) => scoreSentence(b) - scoreSentence(a));
  for (const sentence of sentences) {
    const fact = conciseFact(sentence);
    const duplicate = used.filter(Boolean).some((seen) => {
      const normalized = conciseFact(String(seen));
      return normalized.includes(fact.slice(0, 18)) || fact.includes(normalized.slice(0, 18));
    });
    if (!duplicate) return sentence;
  }
  return null;
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
  const targetFromTable = rawTableValue(post.content, /^지원\s*대상|^대상/) || tableValue(lines, /^지원\s*대상|^대상/);
  const benefitFromTable = rawTableValue(post.content, /^지원\s*(혜택|내용)|^혜택/) || tableValue(lines, /^지원\s*(혜택|내용)|^혜택/);
  const amountFromTable = rawTableValue(post.content, /^지원\s*(금액|한도|액)|^금액|^한도|^지원액/) || tableValue(lines, /^지원\s*(금액|한도|액)|^금액|^한도|^지원액/);
  const applyFromTable = rawTableValue(post.content, /^신청\s*방법|^신청/) || tableValue(lines, /^신청\s*방법|^신청/);
  const periodFromTable = rawTableValue(post.content, /^신청\s*(기간|마감)|^접수\s*기간|^기간|^마감/) || tableValue(lines, /^신청\s*(기간|마감)|^접수\s*기간|^기간|^마감/);
  const docsFromTable = rawTableValue(post.content, /^제출\s*서류|^필요\s*서류|^서류/) || tableValue(lines, /^제출\s*서류|^필요\s*서류|^서류/);
  const placeFromTable = rawTableValue(post.content, /^접수처|^신청\s*(장소|기관|처)|^문의|^담당/) || tableValue(lines, /^접수처|^신청\s*(장소|기관|처)|^문의|^담당/);
  const regionFromTable = rawTableValue(post.content, /^지원\s*지역|^지역/) || tableValue(lines, /^지원\s*지역|^지역/);

  const targetSentence = sentenceFact(
    lines,
    /대상|거주|신혼|청년|소상공|사업자|노인|어르신|장애인|가구|무주택|소득|혼인|영구임대/,
    /반드시|공식 안내|정확한 자격 조건/,
  );
  const targetSecondary = sentenceFact(lines, /소득|무주택|혼인|연령|주민등록|거주|영구임대주택/, /지원 금액|월 최대|총 지원|혜택/);
  const residenceOrAgeSection = sectionFact(lines, /나이|지역|거주|대상/, /거주|신혼|청년|혼인|연령|대상/);
  const incomeOrAssetSection = sectionFact(lines, /소득|자격|자산|무주택/, /소득|자산|무주택|중위소득|요건/);

  const benefitSentence = sentenceFact(
    lines,
    /지원 금액|지원 내용|지원 혜택|대출 이자|현금 지원|월 최대|최대|프로그램|활동|자원 연계|현물대여|금액|혜택/,
    /구체적인 내용은|확인해야/,
  );
  const benefitSection = sectionFact(lines, /지원|혜택|금액|내용/, /지원|이자|현금|월 최대|최대|금액|대여|프로그램|혜택/);
  const benefitSecondary = sentenceFact(lines, /월 최대|최대|한도|금액|계좌|프로그램|장소|전문가|자원/);

  const applySentence = sentenceFact(lines, /신청|방문|접수|주민센터|관리사무소|공식|복지로|누리집|마감|기간/);
  const deadlineSentence = sentenceFact(lines, /신청 기간|마감일|상시|연중|현재.*명시|최신 공고/);
  const applySection = sectionFact(lines, /신청|접수|방법/, /신청|방문|접수|주민센터|누리집|복지로|기간|서류/);

  const target = targetFromTable || targetSentence || regionFromTable || FALLBACK_FACTS[0];
  const benefit = benefitFromTable || benefitSection || benefitSentence || FALLBACK_FACTS[1];
  const apply = applyFromTable || applySection || applySentence || FALLBACK_FACTS[2];
  const targetDetail = firstConcrete([residenceOrAgeSection, targetSecondary, targetSentence].filter((fact) => fact !== target));
  const targetExtra = firstConcrete([incomeOrAssetSection, distinctSentence(lines, /소득|무주택|혼인|연령|주민등록/, [target, targetSecondary], /지원 금액|월 최대|총 지원|혜택/)]);
  const amountOrSecondaryRaw = amountFromTable || benefitSecondary;
  const amountOrSecondary = amountOrSecondaryRaw && !/공식 모집 공고에서 확인|공고에서 확인/.test(amountOrSecondaryRaw) ? amountOrSecondaryRaw : null;
  const benefitExtra = distinctSentence(lines, /월 최대|최대|한도|금액|대출 종류|소득 수준|차등|계좌|프로그램|장소|전문가|자원/, [benefit, amountOrSecondary], /공식 모집 공고에서 확인|공고에서 확인/);
  const applyPeriod = periodFromTable || deadlineSentence;
  const applyPlaceOrDocs = placeFromTable || docsFromTable;
  const applyExtra = distinctSentence(lines, /서류|접수처|방문|주민센터|누리집|복지로|신청 기간|마감|상시|연중/, [apply, applyPeriod, applyPlaceOrDocs]);

  return {
    target,
    targetRegion: titleRegion(post.title) || regionFromTable,
    targetDetail: targetDetail && targetDetail !== target ? targetDetail : null,
    targetSecondary: targetSecondary && targetSecondary !== target ? targetSecondary : null,
    targetExtra,
    benefit,
    benefitSecondary: amountOrSecondary && amountOrSecondary !== benefit ? amountOrSecondary : null,
    benefitExtra,
    apply,
    applySecondary: applyPeriod && applyPeriod !== apply ? applyPeriod : null,
    applyExtra: applyPlaceOrDocs || applyExtra,
  };
}

export function buildReelVideoPlan(post: ReelVideoPostInput): ReelVideoPlan {
  const category = post.category ?? "정책정보";
  const title = clampTitle(post.title);
  const readableCoverTitle = makeReadableCoverTitle(post.title, category);
  const facts = buildArticleFacts(post);

  const eligibilityFacts = concreteFacts([
    facts.target,
    facts.targetDetail,
    facts.targetExtra,
    facts.targetRegion && `지역: ${facts.targetRegion}`,
  ], 3);
  const benefitFacts = concreteFacts([
    facts.benefit,
    facts.benefitSecondary,
    facts.benefitExtra,
    ...benefitDetailFacts(facts.benefit),
  ], 3);
  const applyFacts = concreteFacts([
    facts.apply,
    facts.applySecondary,
    facts.applyExtra,
  ], 3);
  const searchCue = readableCoverTitle.split(" · ").slice(-2).join(" ") || "정책명";

  const slides: ReelVideoSlide[] = [
    {
      eyebrow: `${category} · keepioo`,
      kicker: title,
      title: readableCoverTitle,
      body: `신청 전 3가지만 확인\n01\n02\n03`,
    },
    {
      eyebrow: "01",
      title: "조건",
      body: multiFact(eligibilityFacts, 3),
    },
    {
      eyebrow: "02",
      title: "혜택",
      body: multiFact(benefitFacts, 3),
    },
    {
      eyebrow: "03",
      title: "방법",
      body: multiFact(applyFacts, 3),
    },
    {
      eyebrow: "저장",
      title: "체크",
      body: `자격 조건\n신청 기간\n제출 서류\nkeepioo에서 ${searchCue} 검색`,
    },
  ];
  return {
    durationSeconds: Math.max(24, slides.length * 5),
    slides,
  };
}
