import { afterEach, describe, expect, it, vi } from "vitest";
import { hasSupabaseAdminEnv, hasSupabaseAnonEnv } from "@/lib/supabase/env";

describe("supabase env guards", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("allows missing anon env outside Vercel production so local/CI static builds can fallback", () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");

    expect(hasSupabaseAnonEnv()).toBe(false);
  });

  it("throws when anon env is missing in Vercel production", () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");

    expect(() => hasSupabaseAnonEnv()).toThrow(/Missing Supabase anon environment variables/);
  });

  it("throws when admin env is missing in Vercel production", () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");

    expect(() => hasSupabaseAdminEnv()).toThrow(/Missing Supabase admin environment variables/);
  });

  it("returns true when required env vars are present", () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service");

    expect(hasSupabaseAnonEnv()).toBe(true);
    expect(hasSupabaseAdminEnv()).toBe(true);
  });
});
