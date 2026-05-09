// ============================================================
// 텔레그램 어드민 명령 — /user {keyword} 사용자 lookup.
// ============================================================
// keyword 가 UUID 면 user_profiles 직접, 아니면 subscriptions.customer_email
// 로 user_id 우회 검색 (auth.users 는 service role 로도 직접 select 안 됨).

import { createAdminClient } from "@/lib/supabase/admin";
import { isUuid } from "./utils";

export async function userLookupCommand(q: string): Promise<string> {
  const keyword = q.trim();
  if (!keyword) return "사용법: /user {이메일|UUID}";
  const admin = createAdminClient();

  let userIds: string[] = [];
  const emailMap = new Map<string, string>();

  if (isUuid(keyword)) {
    userIds = [keyword];
  } else {
    const { data: subs, error: subErr } = await admin
      .from("subscriptions")
      .select("user_id, customer_email")
      .ilike("customer_email", `%${keyword}%`)
      .limit(5);
    if (subErr) return `❌ 조회 실패: ${subErr.message.slice(0, 80)}`;
    userIds = (subs ?? [])
      .map((s) => s.user_id as string)
      .filter((v): v is string => Boolean(v));
    for (const s of subs ?? []) {
      if (s.user_id && s.customer_email) {
        emailMap.set(s.user_id as string, s.customer_email as string);
      }
    }
    if (userIds.length === 0) {
      return "검색 결과 없음 (이메일은 결제·구독 등록 사용자만 검색 가능)";
    }
  }

  const { data: profiles, error } = await admin
    .from("user_profiles")
    .select("id, district, age_group, occupation, income_level, created_at")
    .in("id", userIds)
    .limit(5);
  if (error) return `❌ profile 조회 실패: ${error.message.slice(0, 80)}`;

  // tier 정보 — subscriptions 기존 매핑 활용
  const { data: tiers } = await admin
    .from("subscriptions")
    .select("user_id, tier, status")
    .in("user_id", userIds);
  const tierMap = new Map<string, { tier: string; status: string }>();
  for (const t of tiers ?? []) {
    if (t.user_id) {
      tierMap.set(t.user_id as string, {
        tier: (t.tier as string) ?? "?",
        status: (t.status as string) ?? "?",
      });
    }
  }

  const rows = profiles ?? [];
  if (rows.length === 0) return "user_profiles 에 매칭 없음";

  return [
    `[user 검색 — ${rows.length}건]`,
    "",
    ...rows.map((u) => {
      const t = tierMap.get(u.id as string);
      const email = emailMap.get(u.id as string) ?? "-";
      return [
        `· ${email}`,
        `  id: ${u.id}`,
        `  plan: ${t ? `${t.tier} [${t.status}]` : "free"}`,
        `  ${u.district ?? "-"} / ${u.age_group ?? "-"} / ${u.occupation ?? "-"}`,
      ].join("\n");
    }),
  ].join("\n");
}
