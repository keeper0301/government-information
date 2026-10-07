import { createHash } from 'node:crypto';
import { load } from 'cheerio';
import { parseDetailBodyHtml } from '@/lib/news-collectors/korea-kr-detail';
import { officialNewsId, normalizeSourceText } from './validation';

export interface OfficialNewsSource {
  title: string; url: string; body: string; hash: string; publishedAt: string;
}

// 최초 읽기와 공개 직전 읽기가 같은 기사인지 확인합니다. 외부 이동은 따라가지 않습니다.
export async function readOfficialNews(url: string, expectedTitle: string): Promise<OfficialNewsSource> {
  if (!officialNewsId(url)) throw new Error('공식 기사 주소가 아닙니다.');
  const response = await fetch(url, { redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error('공식 원문에 접속하지 못했습니다.');
  const html = await response.text();
  const $ = load(html);
  const title = $('h1').first().text().trim();
  const date = $('.info').first().text().match(/(20\d{2})\.(\d{2})\.(\d{2})/);
  const publishedAt = date ? `${date[1]}-${date[2]}-${date[3]}` : '';
  const titleKey = (text: string) => text.replace(/[^\p{L}\p{N}]/gu, '');
  const mainBody = parseDetailBodyHtml(html);
  // 공용 정리 도구가 제거하는 부제·사진 설명에도 시행일 같은 중요한 사실이 있습니다.
  // 사진 파일이나 배너 설명은 가져오지 않고 기사 안의 설명 문장만 근거에 보존합니다.
  const subtitle = $('.article_head h2').first().clone();
  subtitle.find('br').replaceWith('\n');
  const captions = $('.article_body figure figcaption, .view_cont figure figcaption')
    .map((_, element) => $(element).text().trim()).get();
  const body = [subtitle.text().trim(), mainBody, ...captions].filter(Boolean).join('\n');
  if (!title || titleKey(title) !== titleKey(expectedTitle) || !mainBody || mainBody.length < 700 || !publishedAt
    || new Date(`${publishedAt}T00:00:00Z`).toISOString().slice(0, 10) !== publishedAt)
    throw new Error('기사 제목이나 원문 분량을 확인하지 못했습니다.');
  return { title, url, body, publishedAt, hash: createHash('sha256').update(normalizeSourceText(`${title}\n${publishedAt}\n${body}`)).digest('hex') };
}
