import { afterEach, expect, it, vi } from 'vitest';
import { readOfficialNews } from '@/lib/news-publication/source';

afterEach(() => vi.unstubAllGlobals());
const title = '군 복무 청년 지원 개선방안';
const url = 'https://www.korea.kr/news/policyNewsView.do?newsId=148972915';
const body = '군 복무 청년의 의료비 부담을 완화하기 위한 개선방안이 발표됐습니다. '.repeat(30);
function html(caption = '정부는 2027년 7월부터 도입할 예정이라고 발표했습니다.') {
  return `<h1>${title}</h1><div class="article_head"><h2>의료비 지원 범위 확대<br>내년 7월부터 시행 예정</h2></div>
    <div class="info">2026.10.06</div><div class="article_body"><p>${body}</p>
    <figure><img src="사진주소"><figcaption>${caption}</figcaption></figure></div>
    <aside><figure><figcaption>관련 없는 배너 설명</figcaption></figure></aside>`;
}
it('본문 정리에서 빠지던 부제와 사진 설명의 시행 예정일을 사실 근거에 보존한다', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(html())));
  const source = await readOfficialNews(url, title);
  expect(source.body).toContain('내년 7월부터 시행 예정');
  expect(source.body).toContain('2027년 7월부터 도입할 예정');
  expect(source.body).not.toContain('관련 없는 배너 설명');
  expect(source.body).not.toContain('사진주소');
});
it('본문이 같아도 시행 예정일이 바뀌면 원문 변경으로 판별한다', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response(html()))
    .mockResolvedValueOnce(new Response(html('정부는 2027년 8월부터 도입할 예정이라고 발표했습니다.'))));
  const first = await readOfficialNews(url, title);
  const changed = await readOfficialNews(url, title);
  expect(first.hash).not.toBe(changed.hash);
});
