export function hasSupabaseAnonEnv(): boolean {
  const hasEnv = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );

  if (!hasEnv && process.env.VERCEL_ENV === "production") {
    throw new Error(
      "Missing Supabase anon environment variables in production: NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY",
    );
  }

  return hasEnv;
}

export function hasSupabaseAdminEnv(): boolean {
  const hasEnv = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY,
  );

  if (!hasEnv && process.env.VERCEL_ENV === "production") {
    throw new Error(
      "Missing Supabase admin environment variables in production: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY",
    );
  }

  return hasEnv;
}
