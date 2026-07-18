import { NextRequest, NextResponse } from "next/server";
import { getRecommendations, PROGRAM_TYPES, type ProgramType } from "@/lib/recommend";
import { loadUserProfile } from "@/lib/personalization/load-profile";
import {
  AGE_KEYWORDS,
  OCCUPATION_KEYWORDS,
  REGION_OPTIONS,
  type AgeOption,
  type OccupationOption,
  type RegionOption,
} from "@/lib/profile-options";
import {
  isJsonBodyTooLargeError,
  readJsonWithLimit,
} from "@/lib/http/json";
import { checkRateLimit, getClientIp } from "@/lib/support/rate-limit";
import { createClient } from "@/lib/supabase/server";
import { checkAndConsumeRecommendQuota } from "@/lib/quota";

const MAX_JSON_BODY_BYTES = 4 * 1024;
const RECOMMEND_LIMIT_PER_MINUTE = 30;
const PUBLIC_REGION_OPTION_SET = new Set<string>(REGION_OPTIONS);

// 맞춤추천 API — 실제 매칭 로직은 lib/recommend.ts 에 위치.
// 이 파일은 입력값 검증과 응답 변환만 담당 (서버 페이지와 로직 공유 목적).
export async function POST(request: NextRequest) {
  const rl = await checkRateLimit({
    bucket: `recommend:ip:${getClientIp(request)}`,
    limit: RECOMMEND_LIMIT_PER_MINUTE,
  });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "rate_limited", retry_after_sec: rl.retryAfterSec },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
    );
  }

  let body: {
    ageGroup?: unknown;
    region?: unknown;
    district?: unknown;
    occupation?: unknown;
    programType?: unknown;
  };
  try {
    body = await readJsonWithLimit(request, MAX_JSON_BODY_BYTES);
  } catch (err) {
    return NextResponse.json(
      { error: isJsonBodyTooLargeError(err) ? "요청 본문이 너무 큽니다." : "요청 본문이 올바르지 않습니다." },
      { status: isJsonBodyTooLargeError(err) ? 413 : 400 },
    );
  }

  const {
    ageGroup,
    region,
    district,
    occupation,
    programType = "all",
  } = body;

  const ageGroupValue = typeof ageGroup === "string" ? ageGroup : "";
  const regionValue = typeof region === "string" ? region : "";
  const occupationValue = typeof occupation === "string" ? occupation : "";
  const programTypeValue = typeof programType === "string" ? programType : "all";

  // 입력값 검증
  if (!ageGroupValue || !regionValue || !occupationValue) {
    return NextResponse.json({ error: "모든 항목을 선택해주세요." }, { status: 400 });
  }
  if (!(ageGroupValue in AGE_KEYWORDS)) {
    return NextResponse.json({ error: "올바른 나이대를 선택해주세요." }, { status: 400 });
  }
  if (!PUBLIC_REGION_OPTION_SET.has(regionValue)) {
    return NextResponse.json({ error: "올바른 지역을 선택해주세요." }, { status: 400 });
  }
  if (!(occupationValue in OCCUPATION_KEYWORDS)) {
    return NextResponse.json({ error: "올바른 직업을 선택해주세요." }, { status: 400 });
  }
  if (!PROGRAM_TYPES.includes(programTypeValue as ProgramType)) {
    return NextResponse.json({ error: "올바른 정보 종류를 선택해주세요." }, { status: 400 });
  }
  // district 는 optional. 임의 문자열 주입 막으려고 길이·형식만 가볍게 검증.
  // 더 엄격한 화이트리스트 검증은 폼 UI 가 광역에 맞는 옵션만 노출하므로
  // 서버는 길이만 체크하고 매칭 로직(regionMatches)에서 자연스럽게 무시됨.
  const safeDistrict =
    typeof district === "string" && district.length > 0 && district.length <= 20
      ? district
      : null;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    const quota = await checkAndConsumeRecommendQuota(user.id);
    if (!quota.ok && quota.reason === "over_limit") {
      return NextResponse.json(
        {
          error: `오늘은 맞춤 추천을 ${quota.limit}회 모두 사용하셨어요. 베이직 이상 플랜에서는 무제한으로 이용할 수 있어요.`,
          needsUpgrade: true,
          quota: { exceeded: true, limit: quota.limit, tier: quota.tier },
        },
        { status: 429 },
      );
    }
  }

  const fullProfile = await loadUserProfile();
  const programs = await getRecommendations({
    ageGroup: ageGroupValue as AgeOption,
    region: regionValue as RegionOption,
    district: safeDistrict,
    occupation: occupationValue as OccupationOption,
    incomeLevel: fullProfile?.signals.incomeLevel ?? null,
    householdTypes: fullProfile?.signals.householdTypes ?? [],
    benefitTags: fullProfile?.signals.benefitTags ?? [],
    hasChildren: fullProfile?.signals.hasChildren ?? null,
    merit: fullProfile?.signals.merit ?? null,
    businessProfile: fullProfile?.signals.businessProfile ?? null,
    programType: programTypeValue as ProgramType,
  });

  return NextResponse.json({ programs });
}
