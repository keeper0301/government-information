const FIRST_PARTY_NEWS_THUMBNAIL_HOSTS = new Set([
  "www.korea.kr",
  "korea.kr",
]);

export function safeNewsThumbnailUrl(
  thumbnailUrl: string | null | undefined,
  sourceOutlet?: string | null,
): string | null {
  if (!thumbnailUrl) return null;

  // Naver/외부 언론사 OG 이미지는 원 도메인의 인증서·핫링크 정책에 직접 영향받는다.
  // 깨진 이미지/ERR_CERT_DATE_INVALID 를 사용자 브라우저에 만들지 않기 위해
  // 외부 언론사 카드·상세는 안정적인 카테고리 placeholder 를 사용한다.
  if (sourceOutlet) return null;

  let url: URL;
  try {
    url = new URL(thumbnailUrl);
  } catch {
    return null;
  }

  if (url.protocol !== "https:") return null;
  if (!FIRST_PARTY_NEWS_THUMBNAIL_HOSTS.has(url.hostname)) return null;
  return url.toString();
}
