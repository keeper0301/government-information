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

const API_BASE = "https://graph.instagram.com/v22.0";

export type PublishInput = CaptionInput & {
  /** /api/instagram-card 가 만드는 1080×1080 카드 3장의 public URL */
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
