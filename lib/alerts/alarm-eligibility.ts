"use server";

import { createClient } from "@/lib/supabase/server";
import { getUserTier, type Tier } from "@/lib/subscription";

export type AlarmEligibilityState = {
  loggedIn: boolean;
  tier: Tier;
  canCreateAlert: boolean;
  email: string | null;
};

export async function getAlarmEligibilityState(): Promise<AlarmEligibilityState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { loggedIn: false, tier: "free", canCreateAlert: false, email: null };
  }

  const tier = await getUserTier(user.id);
  return {
    loggedIn: true,
    tier,
    canCreateAlert: tier === "basic" || tier === "pro",
    email: user.email ?? null,
  };
}
