// ============================================================
// 블로그 자동 발행 — 정책 선택 + AI 생성 + DB 저장
// ============================================================
// 매일 1번 cron 에서 호출. 카테고리 순환 + 마감 임박 우선 + 중복 방지.
//
// 2026-04-24 복구 (커밋 76ff8ab 에서 영구 폐기됐다가 옵션 C 로 복원):
//   - 파이프라인 로직은 그대로 복구
//   - 신규 품질 가드 (lib/ai.ts 의 detectDescriptionCopy·detectMetaCopy) 연동
//   - Gemini 가 정책 원문 description 을 본문·meta 에 복붙한 경우 거절 후
//     cron 다음 주기 재시도 (경보는 notifyCronFailure 에 detail 포함)
// ============================================================

import { createAdminClient } from "@/lib/supabase/admin";
import {
  generateBlogPost,
  detectDescriptionCopy,
  detectMetaCopy,
  type ProgramContext,
} from "@/lib/ai";
import { makeSlug, estimateReadingTime, sanitizeHtml } from "@/lib/utils";

// AdSense 가이드 — 본문 길이 (한글 기준)
// 1,000자 미만이면 "valuable inventory: low quality" 로 거절될 위험
// 3,000자 초과는 가독성 떨어지고 AI 가 잡담 늘리는 신호 (재시도 권장)
const MIN_CONTENT_LENGTH = 1000;
const MAX_CONTENT_LENGTH = 3000;

// SEO — meta description 길이 가드 (검색 스니펫 잘림 방지)
// 프롬프트 지시는 150~160자(목표 155). 실제 Gemini 출력은 108~131자 폭 편차.
// 너무 엄격하게 하한 잡으면 false positive 로 연속 발행 실패 (2026-04-24 노년·
// 학생·교육 카테고리 108~109자로 거절된 사례) → 하한 95 로 완화.
// 95자 미만·175자 초과 시에만 거절. 프롬프트 지시(155자) 는 유지해 점진적 개선.
const META_MIN_LENGTH = 95;
const META_MAX_LENGTH = 175;
const VALID_CATEGORIES = new Set([
  "청년", "소상공인", "주거", "육아·가족", "노년", "학생·교육", "문화", "큐레이션",
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
  "문화": ["문화", "여가", "예술", "체육", "공연", "전시", "도서관", "관광", "스포츠", "박물관", "문화생활"],
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
// 베이스 함수 — 미사용 candidates 를 최대 maxCandidates 개 반환.
// publishOnePost 의 품질 가드 retry loop 가 사용 (하나 throw 시 다음 시도).
// ============================================================
type PickedProgram = {
  ctx: ProgramContext;
  programId: string;
  programType: "welfare" | "loan";
};

export async function pickProgramsForCategory(
  category: string,
  maxCandidates: number,
): Promise<PickedProgram[]> {
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

  const results: PickedProgram[] = [];

  // 큐레이션은 별도 처리 (마감 임박 정책 모음 형식).
  // loan 은 큐레이션 대상이 아님 (welfare 만) → usedLoan 전달 안 함.
  if (category === "큐레이션") {
    return pickCurationPrograms(admin, today, usedWelfare, maxCandidates);
  }

  // 일반 카테고리: 키워드 매칭
  const keywords = CATEGORY_KEYWORDS[category] || [];
  if (keywords.length === 0) return results;

  // 키워드를 title/target/description 에 포함하는 정책 (마감 임박순)
  // OR 검색을 위해 .or() 사용. description 까지 보면 매칭 폭이 넓어짐
  const orFilter = keywords
    .flatMap((k) => [`title.ilike.%${k}%`, `target.ilike.%${k}%`, `description.ilike.%${k}%`])
    .join(",");

  // 활성 정책 (apply_end >= 오늘) + 상시 정책 (apply_end IS NULL) 모두 포함
  // 정부 정책은 99% 가 apply_end NULL (상시 모집) — 이걸 빼면 매칭 거의 안 됨
  // 마감 임박순으로 활성 우선, NULL 은 마지막
  const datePolicy = `apply_end.is.null,apply_end.gte.${today}`;

  // welfare 우선 시도
  // 정렬: 최신 등록순(published_at DESC) 우선, 같은 날짜는 마감임박순 보조
  // — 사용자 요청: "최신글을 가져오는 게 제일 중요"
  const { data: welfares } = await admin
    .from("welfare_programs")
    .select("id, title, category, target, description, eligibility, benefits, apply_method, apply_url, apply_start, apply_end, source, region")
    .or(orFilter)
    .or(datePolicy)
    .order("published_at", { ascending: false, nullsFirst: false })
    .order("apply_end", { ascending: true, nullsFirst: false })
    .limit(30);

  for (const w of welfares || []) {
    if (results.length >= maxCandidates) return results;
    if (!usedWelfare.has(w.id)) {
      results.push({
        programId: w.id,
        programType: "welfare",
        ctx: { type: "welfare", ...w },
      });
    }
  }

  // welfare 다 사용했으면 loan 시도 (동일 정렬 정책)
  const { data: loans } = await admin
    .from("loan_programs")
    .select("id, title, category, target, description, eligibility, loan_amount, interest_rate, repayment_period, apply_method, apply_url, apply_start, apply_end, source")
    .or(orFilter)
    .or(datePolicy)
    .order("published_at", { ascending: false, nullsFirst: false })
    .order("apply_end", { ascending: true, nullsFirst: false })
    .limit(30);

  for (const l of loans || []) {
    if (results.length >= maxCandidates) return results;
    if (!usedLoan.has(l.id)) {
      results.push({
        programId: l.id,
        programType: "loan",
        ctx: { type: "loan", ...l },
      });
    }
  }

  // 키워드 매칭 실패 시: 카테고리 무관 fallback 안 함
  // 잘못된 정책으로 카테고리 글 발행하면 SEO·UX 모두 나쁨
  // cron 다음날 재시도되니 발행 한 번 거르는 게 안전
  return results;
}

// 기존 1건 반환 시그니처 — 외부 호출처 호환성 유지 (pickProgramsForCategory 의 wrapper)
export async function pickProgramForCategory(category: string): Promise<PickedProgram | null> {
  const list = await pickProgramsForCategory(category, 1);
  return list[0] ?? null;
}

// 큐레이션 글: 일요일에 "이번주 마감 임박 정책" 모음 형식.
// 단일 정책이 아니라 여러 개를 묶지만, 구현 단순화 위해 가장 임박한 정책 1개를
// 메인으로 선택 (확장 시 여러 정책 모음으로 발전).
async function pickCurationPrograms(
  admin: ReturnType<typeof createAdminClient>,
  today: string,
  usedWelfare: Set<string>,
  maxCandidates: number,
): Promise<PickedProgram[]> {
  const results: PickedProgram[] = [];
  // 큐레이션도 동일 — 활성 + 상시 정책 모두 포함, 최신순 우선
  const { data } = await admin
    .from("welfare_programs")
    .select("id, title, category, target, description, eligibility, benefits, apply_method, apply_url, apply_start, apply_end, source, region")
    .or(`apply_end.is.null,apply_end.gte.${today}`)
    .order("published_at", { ascending: false, nullsFirst: false })
    .order("apply_end", { ascending: true, nullsFirst: false })
    .limit(20);

  for (const w of data || []) {
    if (results.length >= maxCandidates) return results;
    if (!usedWelfare.has(w.id)) {
      results.push({
        programId: w.id,
        programType: "welfare",
        ctx: { type: "welfare", ...w },
      });
    }
  }
  return results;
}

// ============================================================
// 글 1개 생성 + DB 저장
// ============================================================
// dryRun=true 면 DB 저장 안 하고 결과만 반환 (테스트용).
//
// 2026-04-26 retry loop: 단일 candidate 가 품질 가드(본문 길이·복붙·meta 길이) 로
// throw 시 다음 candidate 로 자동 재시도 (최대 MAX_PUBLISH_ATTEMPTS 회).
// LLM API 실패 같은 인프라 에러는 즉시 throw (무한 retry 방지).
// 가속한 5글 발행에서 가드 누적 실패로 발행 글 수가 줄어드는 회귀 차단.
// ============================================================
const MAX_PUBLISH_ATTEMPTS = 3;

// 품질 가드 throw 메시지에 포함되는 식별 문구 — 다음 candidate 로 retry 가능한 신호.
// generateBlogPost 의 LLM API 에러나 DB 저장 실패는 여기 매치 안 됨 → 즉시 throw.
function isQualityGuardError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes("본문이 너무 짧음") ||
    msg.includes("본문이 너무 김") ||
    msg.includes("meta_description 길이 부적정") ||
    msg.includes("본문이 원문 설명을 복붙") ||
    msg.includes("메타 설명이 원문을 복붙")
  );
}

export async function publishOnePost(opts: {
  category?: string;       // 명시 안 하면 오늘 요일 카테고리
  dryRun?: boolean;
} = {}) {
  const category = opts.category || getTodayCategory();
  const candidates = await pickProgramsForCategory(category, MAX_PUBLISH_ATTEMPTS);
  if (candidates.length === 0) {
    throw new Error(`발행 가능한 정책을 못 찾았어요 (카테고리: ${category}). 모든 정책이 이미 글로 발행됐거나 매칭이 없어요.`);
  }

  // 첫 candidate 부터 차례로 시도. 품질 가드 에러는 다음 candidate 로 retry.
  // 인프라 에러(LLM API·DB)는 즉시 throw — retry 해도 같은 결과.
  let lastQualityError: unknown = null;
  for (let i = 0; i < candidates.length; i++) {
    const picked = candidates[i];
    try {
      return await publishWithCandidate(picked, category, opts);
    } catch (err) {
      if (isQualityGuardError(err)) {
        lastQualityError = err;
        // 다음 candidate 시도 (있으면)
        continue;
      }
      // 인프라 에러 → 즉시 전파
      throw err;
    }
  }
  // 모든 candidate 가 품질 가드로 거절된 경우 마지막 에러 throw
  throw lastQualityError ?? new Error(`모든 candidate (${candidates.length}건) 가 품질 가드로 거절됨. 카테고리: ${category}`);
}

// 1개 candidate 처리 — 기존 publishOnePost 의 picked 받은 이후 로직.
// 품질 가드 에러는 throw — 호출자(publishOnePost) 가 잡아서 다음 candidate 시도.
async function publishWithCandidate(
  picked: PickedProgram,
  category: string,
  opts: { dryRun?: boolean },
) {
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

  // meta_description 은 평문만 허용 — BlogCard 에서 text 로 렌더되는데 HTML
  // 태그가 포함되면 "<strong>190만 원</strong>" 이 카드에 그대로 노출됨.
  // Gemini 가 프롬프트 지시에도 불구하고 가끔 <strong> 을 넣는 케이스 방지
  // + 기존 저장 동안 누적된 품질 보정. 태그·다중 공백·앞뒤 공백 정리.
  // 2026-04-24 버그: "기업에는 실습생 월 <strong>190만 원</strong>..." 노출 사례.
  generated.meta_description = (generated.meta_description || "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
  // title 도 같은 이유로 평문화 (실제 노출 사례는 아직 없지만 예방적 sanitize).
  generated.title = (generated.title || "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();

  // SEO 가드 — meta description 길이 체크 (2026-04-24 신규)
  // 150~160자 권장 범위를 크게 벗어나면 거절 → 검색 결과 스니펫 품질 보호.
  const metaLen = (generated.meta_description || "").length;
  if (metaLen < META_MIN_LENGTH || metaLen > META_MAX_LENGTH) {
    throw new Error(
      `meta_description 길이 부적정 (${metaLen}자, 권장 ${META_MIN_LENGTH}~${META_MAX_LENGTH}자). ` +
      `SEO 검색 스니펫 잘림·저품질 위험. 다음 cron 에서 재시도.`,
    );
  }

  // 품질 가드 — 원문 description 복붙 감지 (2026-04-24 신규)
  // Gemini 가 [정책 데이터] 의 설명 필드를 본문·meta 에 그대로 베낀 경우 거절.
  // cron 다음 주기에 재시도되므로 한 번 거르는 편이 품질 사고보다 안전.
  const contentCopy = detectDescriptionCopy(generated.content, picked.ctx.description);
  if (contentCopy) {
    throw new Error(
      `본문이 원문 설명을 복붙 (${contentCopy.lcsLength}자 연속 일치, 임계 ${contentCopy.threshold}). ` +
      `다음 cron 에서 재시도. 복붙 구간: "${contentCopy.snippet.slice(0, 80)}..."`,
    );
  }
  const metaCopy = detectMetaCopy(generated.meta_description || "", picked.ctx.description);
  if (metaCopy) {
    throw new Error(
      `메타 설명이 원문을 복붙 (${metaCopy.lcsLength}자 연속 일치, 임계 ${metaCopy.threshold}). ` +
      `다음 cron 에서 재시도. 복붙 구간: "${metaCopy.snippet.slice(0, 60)}..."`,
    );
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
  // cover_image — 우리 도메인의 OG endpoint 경로 저장. Next.js file convention 으로
  // 자동 생성되는 PNG (1200×630) 가 BlogCard 카드·상세 hero·SNS 공유 카드에 모두
  // 동일하게 사용됨. AdSense 검수자에게 "이미지 부재" 신호 회피의 영구 해결책.
  // 외부 hosting 의존 없음 (별도 Storage 업로드 X) — Next.js ImageResponse 캐싱 활용.
  const coverImage = `/blog/${encodeURIComponent(slug)}/opengraph-image`;
  const { error } = await admin.from("blog_posts").insert({
    slug,
    title: generated.title,
    content: generated.content,
    meta_description: generated.meta_description,
    tags: generated.tags,
    category: generated.category || category,
    faqs: generated.faqs,
    reading_time_min: reading,
    cover_image: coverImage,
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
