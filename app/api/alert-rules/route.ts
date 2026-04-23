// ============================================================
// 맞춤 알림 규칙 CRUD — 목록/생성/미리보기
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { previewMatchCount } from "@/lib/alerts/matching";
import { requireTier } from "@/lib/subscription";

// 알림 규칙은 basic 이상만 (무료 사용자는 pricing 페이지로 유도)
async function requireAuth() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "로그인이 필요합니다.", status: 401 as const };
  const tier = await requireTier(user.id, "basic");
  if (!tier) {
    return {
      error: "맞춤 알림은 베이직 이상 플랜에서 이용 가능해요.",
      status: 403 as const,
      needsUpgrade: true,
    };
  }
  return { user, tier };
}

// ━━ GET: 내 알림 규칙 목록 ━━
export async function GET() {
  const auth = await requireAuth();
  if ("error" in auth) return NextResponse.json(auth, { status: auth.status });

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("user_alert_rules")
    .select("*")
    .eq("user_id", auth.user.id)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ rules: data || [] });
}

// ━━ POST: 새 규칙 생성 + action=preview 시 미리보기 ━━
export async function POST(request: NextRequest) {
  const body = await request.json();

  // 미리보기 모드 — 로그인 필요하나 저장 안 함
  if (body.action === "preview") {
    const auth = await requireAuth();
    if ("error" in auth) return NextResponse.json(auth, { status: auth.status });

    const admin = createAdminClient();
    const preview = await previewMatchCount(admin, {
      region_tags: body.region_tags || [],
      age_tags: body.age_tags || [],
      occupation_tags: body.occupation_tags || [],
      benefit_tags: body.benefit_tags || [],
      household_tags: body.household_tags || [],
      keyword: body.keyword || null,
    });
    return NextResponse.json(preview);
  }

  // 실제 생성
  const auth = await requireAuth();
  if ("error" in auth) return NextResponse.json(auth, { status: auth.status });

  // 카카오 채널은 pro 만 허용
  const channels: string[] = Array.isArray(body.channels) ? body.channels : ["email"];
  if (channels.includes("kakao") && auth.tier !== "pro") {
    return NextResponse.json(
      { error: "카카오 알림톡은 프로 플랜에서만 이용 가능해요.", needsUpgrade: true },
      { status: 403 },
    );
  }

  const name = typeof body.name === "string" && body.name.trim() ? body.name.trim() : "내 맞춤 알림";

  // 1인당 최대 10개 규칙 제한
  const admin = createAdminClient();
  const { count } = await admin
    .from("user_alert_rules")
    .select("id", { count: "exact", head: true })
    .eq("user_id", auth.user.id);
  if ((count || 0) >= 10) {
    return NextResponse.json({ error: "규칙은 최대 10개까지 만들 수 있어요." }, { status: 400 });
  }

  const { data, error } = await admin
    .from("user_alert_rules")
    .insert({
      user_id: auth.user.id,
      name: name.substring(0, 50),
      region_tags: body.region_tags || [],
      age_tags: body.age_tags || [],
      occupation_tags: body.occupation_tags || [],
      benefit_tags: body.benefit_tags || [],
      household_tags: body.household_tags || [],
      keyword: body.keyword?.substring(0, 100) || null,
      channels,
      phone_number: channels.includes("kakao") ? body.phone_number || null : null,
      is_active: true,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ rule: data });
}
