// ============================================================
// /admin/welfare/new — 수동 정책 등록 server action
// ============================================================
// 사장님이 자동 수집 (보조금24·복지로) 못 잡는 광역 자체 사업 (예: 전남도
// 고유가 피해지원금) 을 직접 추가. extractRegionTags/extractBenefitTags
// 등 자동 분류로 매칭 태그는 자동 채움 — 사장님 입력 부담 ↓.
//
// source_code='manual_admin' + source_id=timestamp+random 으로 고유 키 보장
// (welfare_source_code_id_uniq 인덱스).
// ============================================================

"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminUser } from "@/lib/admin-auth";
import { logAdminAction } from "@/lib/admin-actions";
import {
  extractRegionTags,
  extractAgeTags,
  extractOccupationTags,
  extractBenefitTags,
  extractHouseholdTags,
} from "@/lib/tags/taxonomy";

// 폼 입력 검증 — 빈 문자열 → null 변환, 길이 cap
function asStr(v: FormDataEntryValue | null, max = 5000): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length === 0 ? null : t.slice(0, max);
}

// YYYY-MM-DD 만 허용 (DATE 컬럼). 빈 값 또는 형식 외 → null
function asDate(v: FormDataEntryValue | null): string | null {
  const s = asStr(v, 10);
  if (!s) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

export async function createWelfareProgram(formData: FormData) {
  // 권한 체크 — 어드민만
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !isAdminUser(user.email)) {
    throw new Error("권한 없음");
  }

  const title = asStr(formData.get("title"), 500);
  const description = asStr(formData.get("description"), 10000);
  const apply_url = asStr(formData.get("apply_url"), 1000);
  const source = asStr(formData.get("source"), 200);
  const category = asStr(formData.get("category"), 50);

  // 필수 필드 검증
  if (!title || !description || !apply_url || !source || !category) {
    throw new Error("필수 필드 누락 (title·description·apply_url·source·category)");
  }

  // 선택 필드
  const target = asStr(formData.get("target"), 1000);
  const eligibility = asStr(formData.get("eligibility"), 5000);
  const benefits = asStr(formData.get("benefits"), 2000);
  const apply_method = asStr(formData.get("apply_method"), 2000);
  const apply_start = asDate(formData.get("apply_start"));
  const apply_end = asDate(formData.get("apply_end"));
  const source_url = asStr(formData.get("source_url"), 1000);
  const region = asStr(formData.get("region"), 200);

  // 자동 분류 — title + description + target + eligibility 합쳐서 추출
  const matchText = [title, description, target, eligibility]
    .filter((s): s is string => !!s)
    .join(" ");
  const region_tags = extractRegionTags(matchText);
  const age_tags = extractAgeTags(matchText);
  const occupation_tags = extractOccupationTags(matchText);
  const benefit_tags = extractBenefitTags(matchText);
  const household_target_tags = extractHouseholdTags(matchText);

  // 고유 source_id — timestamp + random (collision 방지)
  const source_code = "manual_admin";
  const source_id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("welfare_programs")
    .insert({
      title,
      category,
      target,
      description,
      eligibility,
      benefits,
      apply_method,
      apply_url,
      apply_start,
      apply_end,
      source,
      source_url,
      region,
      source_code,
      source_id,
      region_tags,
      age_tags,
      occupation_tags,
      benefit_tags,
      household_target_tags,
    })
    .select("id")
    .single();

  if (error) {
    console.error("[admin/welfare/new] INSERT 실패:", error);
    throw new Error(`등록 실패: ${error.message}`);
  }

  // 감사 로그 — 누가 무엇을 등록했는지 영구 보존
  try {
    await logAdminAction({
      actorId: user.id,
      action: "manual_program_create",
      details: {
        table: "welfare_programs",
        program_id: data.id,
        title,
        source,
        source_code,
        region,
        category,
        // 자동 추출 결과 도 보존 (디버깅·재현용)
        region_tags,
        benefit_tags,
        household_target_tags,
      },
    });
  } catch (e) {
    // 감사 로그 실패는 비차단 (이미 INSERT 성공)
    console.warn("[admin/welfare/new] 감사 로그 실패:", e);
  }

  // 등록된 정책 상세로 이동
  redirect(`/welfare/${data.id}`);
}
