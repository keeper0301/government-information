import type { EditorialNews } from '@/lib/editorial-news-data';
import { getEditorialNewsPhoto } from '@/lib/editorial-news-images';

// 고정된 운영 호스트의 등록 자료사진만 확인합니다. 외부 주소나 리디렉션은 따라가지 않습니다.
export async function checkNewsPhoto(article: EditorialNews) {
  const photo = getEditorialNewsPhoto(article);
  if (!photo) return { status: 'held' as const, reason: '주제에 맞는 허가된 자료사진이 없습니다.' };
  const base = { url: photo.url, sourceUrl: photo.sourceUrl, licenseUrl: photo.licenseUrl };
  const listArticle: EditorialNews = { ...article, sections: [] };
  if (!/^\/images\/news\/[a-z0-9-]+\.webp$/.test(photo.url)
    || getEditorialNewsPhoto(listArticle)?.url !== photo.url)
    return { ...base, status: 'held' as const, reason: '목록과 상세의 사진 경로가 일치하지 않습니다.' };
  const paths = [photo.url, photo.url.replace('.webp', '-480.webp'), photo.url.replace('.webp', '-640.webp')];
  const checks = await Promise.all(paths.map(async path => {
    try {
      const response = await fetch(`https://www.keepioo.com${path}`, {
        method: 'HEAD', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(5000),
      });
      return { path, status: response.status, valid: response.ok && /^image\/webp(?:;|$)/i.test(response.headers.get('content-type') ?? '') };
    } catch { return { path, status: null, valid: false }; }
  }));
  return { ...base, checkedAt: new Date().toISOString(), checks,
    status: checks.every(check => check.valid) ? 'passed' as const : 'held' as const,
    reason: checks.every(check => check.valid) ? null : '사진 파일 응답을 확인하지 못했습니다. 정상 응답 확인 후 다시 검사합니다.' };
}
