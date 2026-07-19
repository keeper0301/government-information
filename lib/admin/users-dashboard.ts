import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAllAuthUsers, fetchAllRows } from "@/lib/supabase/paginate";

export type RegisteredUserAuthRow = {
  id: string;
  email?: string | null;
  created_at: string;
  last_sign_in_at?: string | null;
  email_confirmed_at?: string | null;
  app_metadata?: { providers?: string[] } | null;
};

type ProfileRow = {
  id: string;
  region: string | null;
  sub_district?: string | null;
  occupation: string | null;
  age_group: string | null;
  income_level: string | null;
  interests?: string[] | string | null;
  created_at: string;
  updated_at?: string | null;
};

type SubscriptionRow = {
  user_id: string;
  tier: string;
  status: string;
  current_period_end: string | null;
  trial_ends_at: string | null;
  updated_at: string | null;
};

type AlertRuleRow = {
  user_id: string;
  is_active: boolean | null;
};

export type RegisteredUsersFilter = {
  query?: string;
  tier?: string;
  profile?: string;
  emailConfirmed?: string;
  alert?: string;
};

export type RegisteredUserDashboardRow = {
  userId: string;
  email: string | null;
  authCreatedAt: string;
  lastSignInAt: string | null;
  emailConfirmed: boolean;
  providers: string[];
  hasProfile: boolean;
  profileCreatedAt: string | null;
  profileUpdatedAt: string | null;
  region: string | null;
  subDistrict: string | null;
  occupation: string | null;
  ageGroup: string | null;
  incomeLevel: string | null;
  interests: string[];
  tier: string;
  subscriptionStatus: string | null;
  currentPeriodEnd: string | null;
  trialEndsAt: string | null;
  activeAlertRules: number;
  totalAlertRules: number;
};

export type RegisteredUsersDashboard = {
  stats: {
    totalUsers: number;
    confirmedEmails: number;
    unconfirmedEmails: number;
    profiledUsers: number;
    missingProfileUsers: number;
    activeLast30Days: number;
    freeUsers: number;
    paidUsers: number;
    activeAlertUsers: number;
  };
  rows: RegisteredUserDashboardRow[];
};

const PAID_TIERS = new Set(["basic", "pro"]);

function normalizeInterests(value: ProfileRow["interests"]): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  return String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function buildRegisteredUsersDashboard(input: {
  users: RegisteredUserAuthRow[];
  profiles: ProfileRow[];
  subscriptions: SubscriptionRow[];
  alertRules: AlertRuleRow[];
  now?: Date;
}): RegisteredUsersDashboard {
  const now = input.now ?? new Date();
  const activeSinceMs = now.getTime() - 30 * 24 * 60 * 60 * 1000;
  const profileMap = new Map(input.profiles.map((profile) => [profile.id, profile] as const));
  const subscriptionMap = new Map(
    input.subscriptions.map((subscription) => [subscription.user_id, subscription] as const),
  );

  const alertCounts = new Map<string, { active: number; total: number }>();
  for (const rule of input.alertRules) {
    const prev = alertCounts.get(rule.user_id) ?? { active: 0, total: 0 };
    prev.total += 1;
    if (rule.is_active) prev.active += 1;
    alertCounts.set(rule.user_id, prev);
  }

  const rows = input.users.map((user) => {
    const profile = profileMap.get(user.id) ?? null;
    const subscription = subscriptionMap.get(user.id) ?? null;
    const alerts = alertCounts.get(user.id) ?? { active: 0, total: 0 };
    return {
      userId: user.id,
      email: user.email ?? null,
      authCreatedAt: user.created_at,
      lastSignInAt: user.last_sign_in_at ?? null,
      emailConfirmed: Boolean(user.email_confirmed_at),
      providers: user.app_metadata?.providers ?? [],
      hasProfile: Boolean(profile),
      profileCreatedAt: profile?.created_at ?? null,
      profileUpdatedAt: profile?.updated_at ?? null,
      region: profile?.region ?? null,
      subDistrict: profile?.sub_district ?? null,
      occupation: profile?.occupation ?? null,
      ageGroup: profile?.age_group ?? null,
      incomeLevel: profile?.income_level ?? null,
      interests: normalizeInterests(profile?.interests),
      tier: subscription?.tier ?? "free",
      subscriptionStatus: subscription?.status ?? null,
      currentPeriodEnd: subscription?.current_period_end ?? null,
      trialEndsAt: subscription?.trial_ends_at ?? null,
      activeAlertRules: alerts.active,
      totalAlertRules: alerts.total,
    } satisfies RegisteredUserDashboardRow;
  });

  rows.sort((a, b) => b.authCreatedAt.localeCompare(a.authCreatedAt));

  const stats = {
    totalUsers: rows.length,
    confirmedEmails: rows.filter((row) => row.emailConfirmed).length,
    unconfirmedEmails: rows.filter((row) => !row.emailConfirmed).length,
    profiledUsers: rows.filter((row) => row.hasProfile).length,
    missingProfileUsers: rows.filter((row) => !row.hasProfile).length,
    activeLast30Days: rows.filter((row) => {
      if (!row.lastSignInAt) return false;
      return new Date(row.lastSignInAt).getTime() >= activeSinceMs;
    }).length,
    freeUsers: rows.filter((row) => !PAID_TIERS.has(row.tier)).length,
    paidUsers: rows.filter((row) => PAID_TIERS.has(row.tier)).length,
    activeAlertUsers: rows.filter((row) => row.activeAlertRules > 0).length,
  };

  return { stats, rows };
}

export function filterRegisteredUserRows(
  rows: RegisteredUserDashboardRow[],
  filters: RegisteredUsersFilter,
): RegisteredUserDashboardRow[] {
  const query = (filters.query ?? "").trim().toLowerCase();
  const tier = filters.tier ?? "";
  const profile = filters.profile ?? "";
  const emailConfirmed = filters.emailConfirmed ?? "";
  const alert = filters.alert ?? "";

  return rows.filter((row) => {
    if (tier) {
      if (tier === "paid") {
        if (!PAID_TIERS.has(row.tier)) return false;
      } else if (row.tier !== tier) return false;
    }
    if (profile === "complete" && !row.hasProfile) return false;
    if (profile === "missing" && row.hasProfile) return false;
    if (emailConfirmed === "yes" && !row.emailConfirmed) return false;
    if (emailConfirmed === "no" && row.emailConfirmed) return false;
    if (alert === "active" && row.activeAlertRules <= 0) return false;
    if (alert === "none" && row.activeAlertRules > 0) return false;
    if (!query) return true;

    const haystack = [
      row.email,
      row.userId,
      row.region,
      row.subDistrict,
      row.occupation,
      row.ageGroup,
      row.incomeLevel,
      ...row.interests,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(query);
  });
}

export async function getRegisteredUsersDashboard(): Promise<RegisteredUsersDashboard> {
  const admin = createAdminClient();
  const [authResult, profilesResult, subscriptionsResult, alertRulesResult] = await Promise.all([
    fetchAllAuthUsers<RegisteredUserAuthRow>((page, perPage) =>
      admin.auth.admin.listUsers({ page, perPage }),
    ),
    fetchAllRows<ProfileRow>((from, to) =>
      admin
        .from("user_profiles")
        .select("id, region, sub_district, occupation, age_group, income_level, interests, created_at, updated_at")
        .order("id")
        .range(from, to) as unknown as PromiseLike<{ data: ProfileRow[] | null; error: { message: string } | null }>,
    ),
    fetchAllRows<SubscriptionRow>((from, to) =>
      admin
        .from("subscriptions")
        .select("user_id, tier, status, current_period_end, trial_ends_at, updated_at")
        .order("user_id")
        .range(from, to) as unknown as PromiseLike<{ data: SubscriptionRow[] | null; error: { message: string } | null }>,
    ),
    fetchAllRows<AlertRuleRow>((from, to) =>
      admin
        .from("user_alert_rules")
        .select("user_id, is_active")
        .order("user_id")
        .range(from, to) as unknown as PromiseLike<{ data: AlertRuleRow[] | null; error: { message: string } | null }>,
    ),
  ]);

  if (authResult.error) {
    console.error("[admin/users] auth users fetch failed", authResult.error);
  }
  if (profilesResult.error) {
    console.error("[admin/users] profiles fetch failed", profilesResult.error);
  }
  if (subscriptionsResult.error) {
    console.error("[admin/users] subscriptions fetch failed", subscriptionsResult.error);
  }
  if (alertRulesResult.error) {
    console.error("[admin/users] alert rules fetch failed", alertRulesResult.error);
  }

  return buildRegisteredUsersDashboard({
    users: authResult.users,
    profiles: profilesResult.rows,
    subscriptions: subscriptionsResult.rows,
    alertRules: alertRulesResult.rows,
  });
}
