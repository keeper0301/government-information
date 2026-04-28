// ============================================================
// /admin/loan/new — 대출·정책자금 수동 등록 server action
// ============================================================
// welfare 와 동일 패턴, loan 컬럼 차이 반영:
//   - loan_amount / interest_rate / repayment_period 추가 (benefits 대신)
//   - region 자유 텍스트 컬럼 없음 (region_tags array 만 사용)
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

function asStr(v: FormDataEntryValue | null, max = 5000): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length === 0 ? null : t.slice(0, max);
}

function asDate(v: FormDataEntryValue | null): string | null {
  const s = asStr(v, 10);
  if (!s) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

export async function createLoanProgram(formData: FormData) {
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

  if (!title || !description || !apply_url || !source || !category) {
    throw new Error("필수 필드 누락 (title·description·apply_url·source·category)");
  }

  const target = asStr(formData.get("target"), 1000);
  const eligibility = asStr(formData.get("eligibility"), 5000);
  // loan 고유 — loan_amount / interest_rate / repayment_period
  const loan_amount = asStr(formData.get("loan_amount"), 500);
  const interest_rate = asStr(formData.get("interest_rate"), 200);
  const repayment_period = asStr(formData.get("repayment_period"), 200);
  const apply_method = asStr(formData.get("apply_method"), 2000);
  const apply_start = asDate(formData.get("apply_start"));
  const apply_end = asDate(formData.get("apply_end"));
  const source_url = asStr(formData.get("source_url"), 1000);

  const matchText = [title, description, target, eligibility]
    .filter((s): s is string => !!s)
    .join(" ");
  const region_tags = extractRegionTags(matchText);
  const age_tags = extractAgeTags(matchText);
  const occupation_tags = extractOccupationTags(matchText);
  const benefit_tags = extractBenefitTags(matchText);
  const household_target_tags = extractHouseholdTags(matchText);

  const source_code = "manual_admin";
  const source_id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("loan_programs")
    .insert({
      title,
      category,
      target,
      description,
      eligibility,
      loan_amount,
      interest_rate,
      repayment_period,
      apply_method,
      apply_url,
      apply_start,
      apply_end,
      source,
      source_url,
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
    console.error("[admin/loan/new] INSERT 실패:", error);
    throw new Error(`등록 실패: ${error.message}`);
  }

  try {
    await logAdminAction({
      actorId: user.id,
      action: "manual_program_create",
      details: {
        table: "loan_programs",
        program_id: data.id,
        title,
        source,
        source_code,
        category,
        region_tags,
        benefit_tags,
        household_target_tags,
      },
    });
  } catch (e) {
    console.warn("[admin/loan/new] 감사 로그 실패:", e);
  }

  redirect(`/loan/${data.id}`);
}
