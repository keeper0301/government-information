import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireTier } from "@/lib/subscription";

// 내 알림 목록 조회
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  // 알림 구독 목록 조회 (최대 100건)
  const { data: subscriptions } = await supabase
    .from("alarm_subscriptions")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(100);

  if (!subscriptions || subscriptions.length === 0) {
    return NextResponse.json({ subscriptions: [], programs: {} });
  }

  // 연결된 프로그램 정보 조회
  const welfareIds = subscriptions.filter((s) => s.program_type === "welfare").map((s) => s.program_id);
  const loanIds = subscriptions.filter((s) => s.program_type === "loan").map((s) => s.program_id);

  const programs: Record<string, { title: string; apply_end: string | null }> = {};

  if (welfareIds.length > 0) {
    const { data } = await supabase
      .from("welfare_programs")
      .select("id, title, apply_end")
      .in("id", welfareIds);
    (data || []).forEach((p) => { programs[p.id] = { title: p.title, apply_end: p.apply_end }; });
  }

  if (loanIds.length > 0) {
    const { data } = await supabase
      .from("loan_programs")
      .select("id, title, apply_end")
      .in("id", loanIds);
    (data || []).forEach((p) => { programs[p.id] = { title: p.title, apply_end: p.apply_end }; });
  }

  return NextResponse.json({ subscriptions, programs });
}

// 알림 해제 (is_active를 false로 변경)
export async function DELETE(request: NextRequest) {
  const { subscriptionId } = await request.json();

  if (!subscriptionId) {
    return NextResponse.json({ error: "알림 ID가 필요합니다." }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const adminSupabase = createAdminClient();
  const { error } = await adminSupabase
    .from("alarm_subscriptions")
    .update({ is_active: false })
    .eq("id", subscriptionId)
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json({ error: "알림 해제에 실패했습니다." }, { status: 500 });
  }

  return NextResponse.json({ message: "알림이 해제되었습니다." });
}

export async function POST(request: NextRequest) {
  const { email, programId, programType } = await request.json();

  if (!email || !programId || !programType) {
    return NextResponse.json({ error: "필수 항목이 누락되었습니다." }, { status: 400 });
  }

  if (!["welfare", "loan"].includes(programType)) {
    return NextResponse.json({ error: "잘못된 프로그램 유형입니다." }, { status: 400 });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return NextResponse.json({ error: "올바른 이메일 주소를 입력해주세요." }, { status: 400 });
  }

  const supabase = await createClient();

  // 로그인 필수 (이전엔 비로그인도 가능했지만, 유료 기능으로 전환)
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { error: "알림 등록은 로그인 후 이용 가능해요.", needsLogin: true },
      { status: 401 },
    );
  }

  // 베이직 이상 티어만 알림 등록 가능 (무료 사용자는 가격표 안내)
  const tier = await requireTier(user.id, "basic");
  if (!tier) {
    return NextResponse.json(
      {
        error: "마감 알림은 베이직 이상 플랜에서 이용 가능해요.",
        needsUpgrade: true,
        upgradeUrl: "/pricing",
      },
      { status: 403 },
    );
  }

  // 중복 체크
  const { data: existing } = await supabase
    .from("alarm_subscriptions")
    .select("id")
    .eq("email", email)
    .eq("program_id", programId)
    .eq("is_active", true)
    .limit(1);

  if (existing && existing.length > 0) {
    return NextResponse.json({ message: "이미 알림이 등록되어 있습니다." });
  }

  const adminSupabase = createAdminClient();
  const { error } = await adminSupabase.from("alarm_subscriptions").insert({
    user_id: user.id,
    email,
    program_type: programType,
    program_id: programId,
    notify_before_days: 7,
  });

  if (error) {
    return NextResponse.json({ error: "알림 등록에 실패했습니다. 로그인이 필요할 수 있습니다." }, { status: 500 });
  }

  return NextResponse.json({ message: "알림이 등록되었습니다. 마감 7일 전에 이메일로 알려드리겠습니다." });
}
