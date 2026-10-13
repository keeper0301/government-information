import { createClient } from "@supabase/supabase-js";

/** 공개 자료 전용입니다. 이용자 쿠키와 관리자 키를 사용하지 않습니다. */
export function createPublicClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) } },
  );
}
