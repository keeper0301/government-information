// ============================================================
// Instagram Graph API Reels 발행 client
// ============================================================
// 사전 렌더링된 public MP4 video_url → Reels container 생성 → FINISHED 대기
// → media_publish 로 공개 게시. 영상 렌더링 자체는 이 파일에서 하지 않는다.
// ============================================================

import { buildInstagramCaption, type CaptionInput } from "./caption";

const API_BASE = "https://graph.instagram.com/v23.0";

export type PublishReelInput = CaptionInput & {
  /** Meta 서버가 직접 fetch 가능한 public MP4 URL */
  videoUrl: string;
  /** 릴스를 피드에도 노출할지 여부. 기본 true */
  shareToFeed?: boolean;
};

export type PublishReelCreds = {
  token: string;
  userId: string;
};

export type PublishReelResult =
  | { ok: true; mediaId: string; permalink: string | null }
  | { ok: false; error: string };

function assertPublicVideoUrl(videoUrl: string): void {
  let url: URL;
  try {
    url = new URL(videoUrl);
  } catch {
    throw new Error("reels video_url 이 올바른 URL 이 아님");
  }
  if (url.protocol !== "https:") {
    throw new Error("reels video_url 은 https public URL 이어야 함");
  }
}

async function createReelContainer(
  input: PublishReelInput,
  token: string,
  userId: string,
): Promise<string> {
  assertPublicVideoUrl(input.videoUrl);
  const url = `${API_BASE}/${userId}/media`;
  const body = new URLSearchParams({
    media_type: "REELS",
    video_url: input.videoUrl,
    caption: buildInstagramCaption(input),
    share_to_feed: input.shareToFeed === false ? "false" : "true",
    access_token: token,
  });
  const res = await fetch(url, { method: "POST", body });
  const json = (await res.json()) as { id?: string; error?: { message: string } };
  if (!res.ok || !json.id) {
    throw new Error(`reels container 생성 실패: ${json.error?.message ?? res.status}`);
  }
  return json.id;
}

async function waitForReelReady(containerId: string, token: string): Promise<void> {
  const url = `${API_BASE}/${containerId}?fields=status_code&access_token=${token}`;
  const start = Date.now();
  const TIMEOUT_MS = 180_000;
  const POLL_MS = 3_000;
  const POST_FINISHED_SLEEP_MS = 5_000;

  while (Date.now() - start < TIMEOUT_MS) {
    const res = await fetch(url);
    const json = (await res.json()) as {
      status_code?: string;
      error?: { message: string };
    };
    if (json.status_code === "FINISHED") {
      await new Promise((r) => setTimeout(r, POST_FINISHED_SLEEP_MS));
      return;
    }
    if (json.status_code === "ERROR" || json.status_code === "EXPIRED") {
      throw new Error(`reels container 상태 ${json.status_code}`);
    }
    if (json.error?.message) {
      throw new Error(`reels container 상태 조회 실패: ${json.error.message}`);
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
  throw new Error("reels container ready timeout 180s");
}

async function publishContainer(containerId: string, token: string, userId: string): Promise<string> {
  const url = `${API_BASE}/${userId}/media_publish`;
  const body = new URLSearchParams({
    creation_id: containerId,
    access_token: token,
  });
  const res = await fetch(url, { method: "POST", body });
  const json = (await res.json()) as { id?: string; error?: { message: string } };
  if (!res.ok || !json.id) {
    throw new Error(`reels media_publish 실패: ${json.error?.message ?? res.status}`);
  }
  return json.id;
}

async function getPermalink(mediaId: string, token: string): Promise<string | null> {
  try {
    const url = `${API_BASE}/${mediaId}?fields=permalink&access_token=${token}`;
    const res = await fetch(url);
    const json = (await res.json()) as { permalink?: string };
    return json.permalink ?? null;
  } catch {
    return null;
  }
}

export async function publishReel(
  input: PublishReelInput,
  creds: PublishReelCreds,
): Promise<PublishReelResult> {
  try {
    const containerId = await createReelContainer(input, creds.token, creds.userId);
    await waitForReelReady(containerId, creds.token);
    const mediaId = await publishContainer(containerId, creds.token, creds.userId);
    const permalink = await getPermalink(mediaId, creds.token);
    return { ok: true, mediaId, permalink };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
