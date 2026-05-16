// ============================================================
// 인스타그램 Graph API carousel 자동 발행 client
// ============================================================
// blog_posts 새 글 → 카드 3장 (api/instagram-card) + 캡션 → 인스타 carousel 발행.
//
// Graph API flow (5 steps):
//   1~3. 카드별 media container 생성 (is_carousel_item=true)
//   4.   carousel container 생성 (media_type=CAROUSEL, children=[c1,c2,c3])
//   5.   media_publish (carousel container → 실제 게시)
//
// Credentials (instagram_oauth_tokens 테이블 — OAuth flow Phase 2 이후):
//   access_token — Long-Lived (60일, refresh cron 자동 연장)
//   ig_user_id   — Instagram Business Account ID
// ============================================================

import { buildInstagramCaption, type CaptionInput } from "./caption";

// v23.0 — oauth.ts:133 getInstagramUserInfo 와 통일 (2026-05-14 review 정리).
// Instagram Graph API 는 매년 한 version 씩 deprecate. 최신 사용 권장.
const API_BASE = "https://graph.instagram.com/v23.0";

export type PublishInput = CaptionInput & {
  /** /api/instagram-card 가 만드는 1080×1350 (4:5) 카드 3장의 public URL */
  cardUrls: [string, string, string];
};

export type PublishCreds = {
  /** long-lived Instagram User access token */
  token: string;
  /** Instagram Business Account ID */
  userId: string;
};

export type PublishResult =
  | { ok: true; mediaId: string; permalink: string | null }
  | { ok: false; error: string };

/**
 * 1 카드의 media container 생성. is_carousel_item=true 로 carousel 자식 등록.
 */
async function createCardContainer(
  cardUrl: string,
  token: string,
  userId: string,
): Promise<string> {
  const url = `${API_BASE}/${userId}/media`;
  const body = new URLSearchParams({
    image_url: cardUrl,
    is_carousel_item: "true",
    access_token: token,
  });
  const res = await fetch(url, { method: "POST", body });
  const json = (await res.json()) as { id?: string; error?: { message: string } };
  if (!res.ok || !json.id) {
    throw new Error(
      `media container 생성 실패 (${cardUrl}): ${json.error?.message ?? res.status}`,
    );
  }
  return json.id;
}

/**
 * carousel container 생성 — 자식 container_id 3개 + 캡션 묶음.
 */
async function createCarouselContainer(
  childIds: string[],
  caption: string,
  token: string,
  userId: string,
): Promise<string> {
  const url = `${API_BASE}/${userId}/media`;
  const body = new URLSearchParams({
    media_type: "CAROUSEL",
    children: childIds.join(","),
    caption,
    access_token: token,
  });
  const res = await fetch(url, { method: "POST", body });
  const json = (await res.json()) as { id?: string; error?: { message: string } };
  if (!res.ok || !json.id) {
    throw new Error(
      `carousel container 생성 실패: ${json.error?.message ?? res.status}`,
    );
  }
  return json.id;
}

/**
 * Container status polling — Instagram 권장. carousel container 생성 직후
 * publish 호출하면 IN_PROGRESS 상태라 "Media ID is not available" 실패.
 * status_code 가 FINISHED 될 때까지 polling (최대 120초, 2초 간격).
 *
 * 30s → 60s (2026-05-12): 첫 발행에서 30s 안에 FINISHED 안 떠서 3연속 실패.
 * 60s → 120s + FINISHED 후 5s 추가 sleep (2026-05-16): 5/15+5/16 누적 2건
 * attempt:1 fail (Graph API race — FINISHED 응답 직후에도 publish 실패).
 * Vercel maxDuration 300s 안전.
 */
async function waitForContainerReady(
  containerId: string,
  token: string,
): Promise<void> {
  const url = `${API_BASE}/${containerId}?fields=status_code&access_token=${token}`;
  const start = Date.now();
  const TIMEOUT_MS = 120_000;
  const POLL_MS = 2_000;
  // FINISHED 응답 직후에도 publish 가 indexing 미완료로 fail 하는 race —
  // 추가 sleep 으로 안전 마진 (2026-05-16 사고).
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
      throw new Error(`container 상태 ${json.status_code}`);
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
  throw new Error(`container ready timeout 120s (마지막 polling)`);
}

/**
 * 최종 게시 — carousel container 를 진짜 인스타 피드에 노출.
 */
async function publishContainer(
  containerId: string,
  token: string,
  userId: string,
): Promise<string> {
  const url = `${API_BASE}/${userId}/media_publish`;
  const body = new URLSearchParams({
    creation_id: containerId,
    access_token: token,
  });
  const res = await fetch(url, { method: "POST", body });
  const json = (await res.json()) as { id?: string; error?: { message: string } };
  if (!res.ok || !json.id) {
    throw new Error(`media_publish 실패: ${json.error?.message ?? res.status}`);
  }
  return json.id;
}

/**
 * 발행된 media 의 permalink (https://www.instagram.com/p/{shortcode}) 조회.
 * 실패해도 발행 자체는 성공이므로 null 반환만.
 */
async function getPermalink(
  mediaId: string,
  token: string,
): Promise<string | null> {
  try {
    const url = `${API_BASE}/${mediaId}?fields=permalink&access_token=${token}`;
    const res = await fetch(url);
    const json = (await res.json()) as { permalink?: string };
    return json.permalink ?? null;
  } catch {
    return null;
  }
}

/**
 * 전체 파이프라인 — 카드 URL + 캡션 input → 인스타 carousel 발행 결과.
 *
 * 호출 측 (cron) 이 catch 처리. 여기서는 error 명시 메시지로 throw.
 */
export async function publishCarousel(
  input: PublishInput,
  creds: PublishCreds,
): Promise<PublishResult> {
  try {
    const { token, userId } = creds;
    const caption = buildInstagramCaption(input);

    // 1~3. 카드별 container 생성 (sequential — 동시 호출 시 rate limit 위험)
    const childIds: string[] = [];
    for (const cardUrl of input.cardUrls) {
      const id = await createCardContainer(cardUrl, token, userId);
      childIds.push(id);
    }

    // 4. carousel container 생성
    const carouselId = await createCarouselContainer(
      childIds,
      caption,
      token,
      userId,
    );

    // 4.5. container 처리 완료 대기 (FINISHED 까지 polling, 최대 60초)
    // 이걸 안 하면 publish 시 "Media ID is not available" 에러.
    await waitForContainerReady(carouselId, token);

    // 5. 최종 게시
    const mediaId = await publishContainer(carouselId, token, userId);

    // 6. permalink (best-effort)
    const permalink = await getPermalink(mediaId, token);

    return { ok: true, mediaId, permalink };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
