import { isExternalSource } from './evidence-guide';
import { isDeepLink, sanitizeApplyUrl } from '@/lib/utils/apply-url';

// 주소 모양만으로 같은 사업임을 보장할 수 없어 관리자 대조 확인을 함께 요구한다.
export function sourceCorrection(value: unknown, confirmed: unknown) {
  if (typeof value !== 'string' || value.length > 2048 || confirmed !== true) {
    throw new Error('공식 공고와 사업·지역·연도를 확인하세요.');
  }
  const url = value.trim();
  if (!isExternalSource(url) || new URL(url).protocol !== 'https:' || new URL(url).pathname === '/') {
    throw new Error('기관 첫 화면이 아닌 공식 공고의 보안 주소를 입력하세요.');
  }
  return { url, guidance: { version: 1, status: 'needs_source' } };
}

export function applicationCorrection(value: unknown, confirmed: unknown) {
  if (typeof value !== 'string' || value.length > 2048 || confirmed !== true) throw new Error('해당 사업의 신청 안내를 확인하세요.');
  const url = sanitizeApplyUrl(value);
  if (!url || !isDeepLink(url)) throw new Error('기관 첫 화면이 아닌 신청 안내 주소가 필요합니다.');
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.pathname === '/') throw new Error('안전한 신청 안내 주소가 필요합니다.');
  return { url, guidance: { version: 1, status: 'needs_source' } };
}
