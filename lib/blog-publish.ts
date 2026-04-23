// ============================================================
// 블로그 자동 발행 — 정책 선택 + AI 생성 + DB 저장
// ============================================================
// 매일 1번 cron 에서 호출. 카테고리 순환 + 마감 임박 우선 + 중복 방지.
// ============================================================

import { createAdminClient } from "@/lib/supabase/admin";
import { generateBlogPost, type ProgramContext } from "@/lib/ai";
import { makeSlug, estimateReadingTime, sanitizeHtml } from "@/lib/utils";

// AdSense 가이드 — 본문 길이 (한글 기준)
// 1,000자 미만이면 "valuable inventory: low quality" 로 거절될 위험
// 3,000자 초과는 가독성 떨어지고 AI 가 잡담 늘리는 신호 (재시도 권장)
const MIN_CONTENT_LENGTH = 1000;
const MAX_CONTENT_LENGTH = 3000;
const VALID_CATEGORIES = new Set([
  "청년", "소상공인", "주거", "육아·가족", "노년", "학생·교육", "큐레이션",
]);

// 요일별 카테고리 순환 (0=일, 1=월, ..., 6=토)
// 일=큐레이션 외 6일 = 6개 메인 카테고리
const WEEKDAY_CATEGORY: Record<number, string> = {
  0: "큐레이션",
  1: "청년",
  2: "소상공인",
  3: "주거",
  4: "육아·가족",
  5: "노년",
  6: "학생·교육",
};

// 카테고리별로 정책 데이터에서 매칭에 쓸 키워드 (target/title/description 에서 검색)
const CATEGORY_KEYWORDS: Record<string, string[]> = {
  "청년": ["청년", "취업준비생", "구직자", "20대", "30대", "사회초년생"],
  "소상공인": ["소상공인", "자영업", "창업", "사업자", "중소기업", "벤처", "스타트업"],
  "주거": ["주거", "전세", "월세", "임대", "주택", "보증금", "공공임대", "전월세"],
  "육아·가족": ["육아", "보육", "출산", "아동", "가족", "다자녀", "임산부", "양육", "어린이집", "유아", "신생아"],
  "노년": ["노년", "고령", "노인", "65세", "기초연금", "어르신", "은퇴", "장년", "노후", "60세"],
  "학생·교육": ["학생", "장학", "학자금", "교육비", "초등", "중등", "고등학생", "대학생", "학교", "학습"],
};

// 오늘 발행할 카테고리 결정
export function getTodayCategory(now = new Date()): string {
  return WEEKDAY_CATEGORY[now.getDay()] || "청년";
}

// ============================================================
// 발행할 정책 1개 선택
// ============================================================
// 우선순위:
//   1) 카테고리 키워드 매칭
//   2) 마감일이 가까운 정책 (apply_end IS NOT NULL AND > 오늘)
//   3) 아직 글로 발행 안 된 정책 (source_program_id 중복 X)
//   4) 매칭 실패 시 그냥 마감 임박한 정책 아무거나
// ============================================================
export async function pickProgramForCategory(category: string): Promise<{
  ctx: ProgramContext;
  programId: string;
  programType: "welfare" | "loan";
} | null> {
  const admin = createAdminClient();
  const today = new Date().toISOString().slice(0, 10);

  // 이미 글로 발행된 정책 ID 목록 (중복 방지)
  const { data: published } = await admin
    .from("blog_posts")
    .select("source_program_id, source_program_type")
    .not("source_program_id", "is", null);
  const usedWelfare = new Set<string>();
  const usedLoan = new Set<string>();
  for (const p of published || []) {
    if (p.source_program_type === "welfare" && p.source_program_id) usedWelfare.add(p.source_program_id);
    else if (p.source_program_type === "loan" && p.source_program_id) usedLoan.add(p.source_program_id);
  }

  // 큐레이션은 별도 처리 (마감 임박 정책 모음 형식)
  if (category === "큐레이션") {
    return pickCurationProgram(admin, today, usedWelfare, usedLoan);
  }

  // 일반 카테고리: 키워드 매칭
  const keywords = CATEGORY_KEYWORDS[category] || [];
  if (keywords.length === 0) return null;

  // 키워드를 title/target/description 에 포함하는 정책 (마감 임박순)
  // OR 검색을 위해 .or() 사용. description 까지 보면 매칭 폭이 넓어짐
  const orFilter = keywords
    .flatMap((k) => [`title.ilike.%${k}%`, `target.ilike.%${k}%`, `description.ilike.%${k}%`])
    .join(",");

  // welfare 우선 시도
  const { data: welfares } = await admin
    .from("welfare_programs")
    .select("id, title, category, target, description, eligibility, benefits, apply_method, apply_url, apply_start, apply_end, source, region")
    .or(orFilter)
    .gte("apply_end", today)
    .order("apply_end", { ascending: true })
    .limit(30);

  for (const w of welfares || []) {
    if (!usedWelfare.has(w.id)) {
      return {
        programId: w.id,
        programType: "welfare",
        ctx: { type: "welfare", ...w },
      };
    }
  }

  // welfare 다 사용했으면 loan 시도
  const { data: loans } = await admin
    .from("loan_programs")
    .select("id, title, category, target, description, eligibility, loan_amount, interest_rate, repayment_period, apply_method, apply_url, apply_start, apply_end, source")
    .or(orFilter)
    .gte("apply_end", today)
    .order("apply_end", { ascending: true })
    .limit(30);

  for (const l of loans || []) {
    if (!usedLoan.has(l.id)) {
      return {
        programId: l.id,
        programType: "loan",
        ctx: { type: "loan", ...l },
      };
    }
  }

  // 키워드 매칭 실패 시: 카테고리 무관 fallback 안 함
  // 잘못된 정책으로 카테고리 글 발행하면 SEO·UX 모두 나쁨
  // cron 다음날 재시도되니 발행 한 번 거르는 게 안전
  return null;
}

// 큐레이션 글: 일요일에 "이번주 마감 임박 정책" 모음 형식.
// 단일 정책이 아니라 여러 개를 묶지만, 구현 단순화 위해 가장 임박한 정책 1개를
// 메인으로 선택 (확장 시 여러 정책 모음으로 발전).
async function pickCurationProgram(
  admin: ReturnType<typeof createAdminClient>,
  today: string,
  usedWelfare: Set<string>,
  usedLoan: Set<string>,
) {
  const { data } = await admin
    .from("welfare_programs")
    .select("id, title, category, target, description, eligibility, benefits, apply_method, apply_url, apply_start, apply_end, source, region")
    .gte("apply_end", today)
    .order("apply_end", { ascending: true })
    .limit(20);

  for (const w of data || []) {
    if (!usedWelfare.has(w.id)) {
      return {
        programId: w.id,
        programType: "welfare" as const,
        ctx: { type: "welfare" as const, ...w },
      };
    }
  }
  return null;
}

// ============================================================
// 글 1개 생성 + DB 저장
// ============================================================
// dryRun=true 면 DB 저장 안 하고 결과만 반환 (테스트용).
// ============================================================
export async function publishOnePost(opts: {
  category?: string;       // 명시 안 하면 오늘 요일 카테고리
  dryRun?: boolean;
} = {}) {
  const category = opts.category || getTodayCategory();
  const picked = await pickProgramForCategory(category);
  if (!picked) {
    throw new Error(`발행 가능한 정책을 못 찾았어요 (카테고리: ${category}). 모든 정책이 이미 글로 발행됐거나 매칭이 없어요.`);
  }

  // AI 호출 (1회 retry — 일시적 5xx·timeout 대응)
  let generated;
  try {
    generated = await generateBlogPost(picked.ctx);
  } catch (firstErr) {
    // 한 번 더 시도 (Gemini 일시 오류는 흔함)
    await new Promise((resolve) => setTimeout(resolve, 2000));
    try {
      generated = await generateBlogPost(picked.ctx);
    } catch {
      // 두 번째도 실패하면 첫 에러 던짐
      throw firstErr;
    }
  }

  // AI 응답 검증 (AdSense 정책 + 데이터 무결성)
  const plainLen = generated.content.replace(/<[^>]+>/g, "").trim().length;
  if (plainLen < MIN_CONTENT_LENGTH) {
    throw new Error(`본문이 너무 짧음 (${plainLen}자, 최소 ${MIN_CONTENT_LENGTH}자). AdSense 정책상 발행 불가.`);
  }
  if (plainLen > MAX_CONTENT_LENGTH) {
    throw new Error(`본문이 너무 김 (${plainLen}자, 최대 ${MAX_CONTENT_LENGTH}자). AI 가 잡담 늘리는 신호. 다음 cron 에서 재시도.`);
  }
  if (!VALID_CATEGORIES.has(generated.category)) {
    // AI 가 다른 카테고리 반환 시 요청 카테고리로 강제 (안전한 fallback)
    generated.category = category;
  }

  // XSS 방어: AI 가 생성한 HTML 의 위험 태그·속성 제거
  generated.content = sanitizeHtml(generated.content);

  // 본문 글자수 기준 읽기 시간
  const reading = estimateReadingTime(generated.content);

  // slug 생성 (제목 기반 + 시간·random 8자 suffix)
  const slug = makeSlug(generated.title);

  if (opts.dryRun) {
    return {
      dryRun: true,
      slug,
      generated,
      reading,
      sourceProgramId: picked.programId,
      sourceProgramType: picked.programType,
    };
  }

  // DB 저장
  const admin = createAdminClient();
  const now = new Date().toISOString();
  const { error } = await admin.from("blog_posts").insert({
    slug,
    title: generated.title,
    content: generated.content,
    meta_description: generated.meta_description,
    tags: generated.tags,
    category: generated.category || category,
    faqs: generated.faqs,
    reading_time_min: reading,
    published_at: now,
    source_program_id: picked.programId,
    source_program_type: picked.programType,
  });

  if (error) {
    throw new Error(`DB 저장 실패: ${error.message}`);
  }

  return {
    dryRun: false,
    slug,
    generated,
    reading,
    sourceProgramId: picked.programId,
    sourceProgramType: picked.programType,
  };
}
