// ============================================================
// 맞춤 알림 규칙 개별 CRUD — PATCH(수정) / DELETE(삭제)
// ============================================================
// Next.js 16: params 는 Promise → await 필수

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireTier } from "@/lib/subscription";

async function requireAuth() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "로그인이 필요합니다.", status: 401 as const };
  const tier = await requireTier(user.id, "basic");
  if (!tier) return { error: "베이직 이상 플랜이 필요해요.", status: 403 as const };
  return { user, tier };
}

// PATCH: 규칙 수정
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const auth = await requireAuth();
  if ("error" in auth) return NextResponse.json(auth, { status: auth.status });

  const body = await request.json();

  // 채널 kakao 는 pro 만
  if (Array.isArray(body.channels) && body.channels.includes("kakao") && auth.tier !== "pro") {
    return NextResponse.json(
      { error: "카카오 알림톡은 프로 플랜 전용이에요.", needsUpgrade: true },
      { status: 403 },
    );
  }

  // 본인 규칙인지 먼저 확인
  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("user_alert_rules")
    .select("id, user_id")
    .eq("id", id)
    .maybeSingle();

  if (!existing || existing.user_id !== auth.user.id) {
    return NextResponse.json({ error: "규칙을 찾을 수 없어요." }, { status: 404 });
  }

  // 허용된 필드만 업데이트
  const update: Record<string, unknown> = {};
  if (typeof body.name === "string") update.name = body.name.trim().substring(0, 50);
  if (Array.isArray(body.region_tags)) update.region_tags = body.region_tags;
  if (Array.isArray(body.age_tags)) update.age_tags = body.age_tags;
  if (Array.isArray(body.occupation_tags)) update.occupation_tags = body.occupation_tags;
  if (Array.isArray(body.benefit_tags)) update.benefit_tags = body.benefit_tags;
  if (Array.isArray(body.household_tags)) update.household_tags = body.household_tags;
  if (typeof body.keyword === "string" || body.keyword === null) {
    update.keyword = body.keyword?.substring(0, 100) || null;
  }
  if (Array.isArray(body.channels)) update.channels = body.channels;
  if (typeof body.phone_number === "string" || body.phone_number === null) {
    update.phone_number = body.phone_number || null;
  }
  if (typeof body.is_active === "boolean") update.is_active = body.is_active;

  const { data, error } = await admin
    .from("user_alert_rules")
    .update(update)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ rule: data });
}

// DELETE: 규칙 삭제
export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const auth = await requireAuth();
  if ("error" in auth) return NextResponse.json(auth, { status: auth.status });

  const admin = createAdminClient();
  const { error } = await admin
    .from("user_alert_rules")
    .delete()
    .eq("id", id)
    .eq("user_id", auth.user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
