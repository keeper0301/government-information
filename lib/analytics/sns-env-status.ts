// ============================================================
// SNS 채널별 env 설정 상태 점검 (B 3차)
// ============================================================
// 4 채널 (Twitter/Facebook/Threads/Instagram) 의 OAuth/API 자격증명 상태.
// autonomous hub SnsPublishCard 에서 미설정 채널을 사장님에게 안내.
//
// Instagram 은 DB-based OAuth (instagram_oauth_tokens 테이블) 라 env 가 아님 —
// 별도로 token 존재 여부 점검.
// ============================================================

import { createAdminClient } from "@/lib/supabase/admin";

export type SnsEnvStatus = {
  channel: "twitter" | "facebook" | "threads" | "instagram";
  ready: boolean;
  missing: string[]; // 부족한 env 변수 목록 (instagram 은 "DB token")
  setupGuide: string; // 사장님이 따라 할 1줄 안내
};

const SETUP_GUIDES: Record<SnsEnvStatus["channel"], string> = {
  twitter:
    "X (Twitter) 개발자 포털에서 App 생성 → API Key/Secret + Access Token/Secret (User context 권한 read+write)",
  facebook:
    "Meta for Developers — Facebook Login + Pages API → PAGE_ID + 페이지 access token (장기)",
  threads:
    "Threads API (Meta) — Instagram OAuth 와 같은 token 으로 가능. THREADS_USER_ID + THREADS_ACCESS_TOKEN",
  instagram:
    "/admin/instagram-oauth 에서 OAuth 발급 → instagram_oauth_tokens 테이블 row 생성",
};

function isReadyTwitter(): { ready: boolean; missing: string[] } {
  const required = [
    "TWITTER_API_KEY",
    "TWITTER_API_SECRET",
    "TWITTER_ACCESS_TOKEN",
    "TWITTER_ACCESS_TOKEN_SECRET",
  ];
  const missing = required.filter((k) => !process.env[k]);
  return { ready: missing.length === 0, missing };
}

function isReadyFacebook(): { ready: boolean; missing: string[] } {
  const required = ["FACEBOOK_PAGE_ID", "FACEBOOK_PAGE_ACCESS_TOKEN"];
  const missing = required.filter((k) => !process.env[k]);
  return { ready: missing.length === 0, missing };
}

function isReadyThreads(): { ready: boolean; missing: string[] } {
  const required = ["THREADS_USER_ID", "THREADS_ACCESS_TOKEN"];
  const missing = required.filter((k) => !process.env[k]);
  return { ready: missing.length === 0, missing };
}

// Instagram 은 DB-based — instagram_oauth_tokens row 존재 여부
async function isReadyInstagram(): Promise<{ ready: boolean; missing: string[] }> {
  try {
    const admin = createAdminClient();
    const { count } = await admin
      .from("instagram_oauth_tokens")
      .select("id", { count: "exact", head: true })
      .limit(1);
    if ((count ?? 0) > 0) return { ready: true, missing: [] };
    return { ready: false, missing: ["DB token (instagram_oauth_tokens)"] };
  } catch {
    return { ready: false, missing: ["DB token (조회 실패)"] };
  }
}

export async function getSnsEnvStatus(): Promise<SnsEnvStatus[]> {
  const twitter = isReadyTwitter();
  const facebook = isReadyFacebook();
  const threads = isReadyThreads();
  const instagram = await isReadyInstagram();

  return [
    {
      channel: "twitter",
      ...twitter,
      setupGuide: SETUP_GUIDES.twitter,
    },
    {
      channel: "facebook",
      ...facebook,
      setupGuide: SETUP_GUIDES.facebook,
    },
    {
      channel: "threads",
      ...threads,
      setupGuide: SETUP_GUIDES.threads,
    },
    {
      channel: "instagram",
      ...instagram,
      setupGuide: SETUP_GUIDES.instagram,
    },
  ];
}
