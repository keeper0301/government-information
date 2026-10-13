// 검색 공개 상태와 본문의 발행·확인 표시를 점검한다. 사람 검수나 내용 정확성을 증명하지 않는다.
export function isReviewedNewsPage(path, html) {
  const robots = html.match(/<meta[^>]+name=["']robots["'][^>]+content=["']([^"']+)["'][^>]*>/i)?.[1] ?? '';
  const tokens = robots.toLowerCase().split(/[,\s]+/);
  if (!tokens.includes('index') || tokens.includes('noindex')) return false;
  const text = html.replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  return path === '/news' ? /공개된 검수 뉴스\s+[1-9][0-9]*\s*건/.test(text)
    : /키피오 발행·(?:검수|확인)일/.test(text);
}
