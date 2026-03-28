import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

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

  // Check if user is logged in
  const { data: { user } } = await supabase.auth.getUser();

  // Check for duplicate
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
    user_id: user?.id || null,
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
