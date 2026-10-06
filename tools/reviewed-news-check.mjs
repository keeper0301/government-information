// 검색 공개 상태와 본문의 검수 표시를 함께 확인한다.
export function isReviewedNewsPage(path, html) {
  const robots = html.match(/<meta[^>]+name=["']robots["'][^>]+content=["']([^"']+)["'][^>]*>/i)?.[1] ?? '';
  const tokens = robots.toLowerCase().split(/[,\s]+/);
  if (!tokens.includes('index') || tokens.includes('noindex')) return false;
  const text = html.replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  return path === '/news' ? /공개된 검수 뉴스\s+[1-9][0-9]*건/.test(text)
    : text.includes('키피오 발행·검수일');
}
