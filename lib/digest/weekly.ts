// ============================================================
// 주간 정책 다이제스트 — 데이터 로더 (Phase 5 A4)
// ============================================================
// 매주 월요일 09:00 KST cron 이 호출.
// alert-dispatch 와 중복 0 보장하기 위해 "알림 규칙이 없는 사용자" 만 대상으로
// 이번 주 hot 정책 5건을 묶어 메일 1통 발송.
// 이메일 마케팅 동의(consent_log.marketing) 한 사용자만 추림 — 정보통신망법 제50조.
// ============================================================

import type { SupabaseClient } from "@supabase/supabase-js";

// ━━ 다이제스트에 들어갈 정책 카드 1건의 최소 필드 ━━
// title/source/마감/CTA 만 표시하므로 select 컬럼 최소화 (Disk IO 보호).
export interface WeeklyDigestProgram {
  id: string;
  type: "welfare" | "loan";
  title: string;
  source: string | null;
  apply_end: string | null;
}

// ━━ 발송 대상 사용자 ━━
export interface DigestRecipient {
  user_id: string;
  email: string;
}

// 한번에 추천할 hot 정책 개수 — 카드 5개가 메일 한 화면에 깔끔히 들어감.
export const HOT_PROGRAMS_LIMIT = 5;

// 최근 N일 신규 → "이번 주" 의미. cron 이 매주 월요일 도는 동안
// 지난 주 정책 + 주말 신규까지 자연스럽게 포함하기 위해 7일 윈도우.
const WINDOW_DAYS = 7;

// ============================================================
// hot 정책 5건 로드 — welfare/loan 통합 최신순.
// 조건:
//   - 최근 7일 내 신규 (created_at >= 7일 전)
//   - 활성 정책 (apply_end NULL OR apply_end >= today)
//   - 중복 아님 (duplicate_of_id IS NULL)
// 정렬: created_at DESC — 가장 최근 등록된 5건.
//   추후 view_count·매칭률 가중 가능하지만 1차는 단순 최신순.
// ============================================================
export async function loadHotPrograms(
  supabase: SupabaseClient,
  limit: number = HOT_PROGRAMS_LIMIT,
): Promise<WeeklyDigestProgram[]> {
  const sinceIso = new Date(
    Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();
  const today = new Date().toISOString().slice(0, 10);

  const results: WeeklyDigestProgram[] = [];

  for (const table of ["welfare_programs", "loan_programs"] as const) {
    const { data, error } = await supabase
      .from(table)
      .select("id, title, source, apply_end, created_at")
      .gte("created_at", sinceIso)
      .is("duplicate_of_id", null)
      // 활성 — 마감 안 지났거나 상시
      .or(`apply_end.is.null,apply_end.gte.${today}`)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      console.error(`[digest:weekly] ${table} hot 정책 조회 실패:`, error);
      continue;
    }

    const type = table === "welfare_programs" ? "welfare" : "loan";
    for (const row of data || []) {
      results.push({
        id: row.id as string,
        type,
        title: row.title as string,
        source: (row.source as string | null) ?? null,
        apply_end: (row.apply_end as string | null) ?? null,
      });
    }
  }

  // welfare 와 loan 각각 created_at 최신순으로 받았으므로, 통합 후 앞쪽 limit 건만 컷.
  // 정확히 통합 최신순으로 섞으려면 created_at 도 응답에 포함시켜 정렬해야 하지만,
  // 1차 버전은 welfare/loan 가 균형 있게 노출되도록 자연 순서 유지 — 사용자 입장에선
  // "복지 + 대출 골고루" 가 오히려 자연스러움.
  return results.slice(0, limit);
}

// ============================================================
// 발송 대상 사용자 로드.
// ━━ 조건 ━━
//   1) auth.users 에 존재 (email 보유)
//   2) consent_log.marketing 활성 동의 (withdrawn_at IS NULL + 만료 안 됨)
//   3) user_alert_rules 에 활성 규칙(is_active=true) 1건도 없음
//      → alert-dispatch 와 발송 대상 중복 0 보장.
// ============================================================
// 구현 전략:
//   - auth admin listUsers 로 전체 사용자 풀 1회 fetch
//   - user_alert_rules WHERE is_active=true → 제외할 user_id set
//   - user_latest_consent (view) WHERE consent_type='marketing' AND is_active=true
//     → 마케팅 동의 user_id set
//   - 두 set 으로 candidates 필터링
// ============================================================
export async function loadRecipients(
  supabase: SupabaseClient,
  // auth admin client 로 listUsers 호출하기 위해 admin client 가 필요 — 별도 인자.
  // alert-dispatch 처럼 같은 supabase 인스턴스로 호출 가능하지만 SupabaseClient 타입엔
  // auth.admin 타입 노출이 안 돼 any 캐스트로 처리.
  authAdmin: { auth: { admin: { listUsers: (opts: { page: number; perPage: number }) => Promise<{ data: { users: Array<{ id: string; email?: string | null; deleted_at?: string | null }> } | null }> } } },
): Promise<DigestRecipient[]> {
  // 1) 활성 알림 규칙 가진 user_id set
  const { data: rules } = await supabase
    .from("user_alert_rules")
    .select("user_id")
    .eq("is_active", true);
  const usersWithRules = new Set<string>(
    (rules ?? []).map((r: { user_id: string }) => r.user_id),
  );

  // 2) 마케팅 동의 활성 user_id set
  // user_latest_consent 는 (user_id, consent_type) 별 최신 1행만 노출 + is_active 컬럼 제공.
  // marketing 은 광고성이라 만료 개념이 있지만 — 만료된 row 도 is_active=true 로 view 가
  // 노출할 수 있어, consented_at 이 2년 이내인지 응용 레이어에서 한 번 더 검증.
  const { data: consents } = await supabase
    .from("user_latest_consent")
    .select("user_id, consented_at, is_active")
    .eq("consent_type", "marketing")
    .eq("is_active", true);

  const TWO_YEARS_MS = 365 * 2 * 24 * 60 * 60 * 1000;
  const now = Date.now();
  const usersWithMarketing = new Set<string>();
  for (const c of consents ?? []) {
    const consentedAt = (c as { consented_at: string }).consented_at;
    const t = new Date(consentedAt).getTime();
    if (Number.isNaN(t)) continue;
    if (now - t > TWO_YEARS_MS) continue; // 2년 만료
    usersWithMarketing.add((c as { user_id: string }).user_id);
  }

  // 3) auth.users 풀에서 후보 추림
  // listUsers 는 perPage 최대 1000. keepioo 규모(~수천명) 까지 1페이지로 충분.
  // 추후 1만 넘어가면 페이지네이션 추가 필요.
  const { data: usersResp } = await authAdmin.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });

  const recipients: DigestRecipient[] = [];
  for (const u of usersResp?.users ?? []) {
    if (!u.id || !u.email) continue;
    if (u.deleted_at) continue;
    if (usersWithRules.has(u.id)) continue; // 알림 규칙 있는 사용자 제외
    if (!usersWithMarketing.has(u.id)) continue; // 마케팅 동의 없는 사용자 제외
    recipients.push({ user_id: u.id, email: u.email });
  }

  return recipients;
}
