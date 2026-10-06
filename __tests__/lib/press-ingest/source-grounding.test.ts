import { beforeEach, describe, expect, it, vi } from 'vitest';
import { classifyPressNews } from '@/lib/press-ingest/classify';
import { autoConfirmPendingPressCandidates } from '@/lib/press-ingest/candidates';

const { databaseFrom, pendingRows, heldIds, finalRead } = vi.hoisted(() => ({ databaseFrom: vi.fn(),
  pendingRows: [] as Array<Record<string, unknown>>, heldIds: new Set<string>(), finalRead: { row: null as unknown } }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: databaseFrom }) }));
vi.mock('@/lib/press-ingest/auto-confirm-settings', () => ({ getCurrentTierFloor: async () => 'high' }));
vi.mock('@/lib/admin-actions', () => ({ logAdminAction: vi.fn(async () => undefined) }));

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  vi.stubEnv('OPENAI_API_KEY', '검사용');
  pendingRows.length = 0;
  heldIds.clear(); finalRead.row = null;
  let hold = false; let excludeHeld = false;
  const query = { select: vi.fn().mockReturnThis(),
    eq: vi.fn((column: string, value: string) => {
      if (column === 'id' && hold) heldIds.add(value);
      return query;
    }),
    update: vi.fn((values: Record<string, unknown>) => {
      hold = values.skip_reason === 'application_source_unverified'; return query;
    }), insert: vi.fn().mockReturnThis(), in: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(),
    or: vi.fn(() => { excludeHeld = true; return query; }),
    maybeSingle: vi.fn(async () => ({ data: finalRead.row, error: null })),
    single: vi.fn(async () => ({ data: { id: '등록된정책' }, error: null })),
    then: (resolve: (value: unknown) => unknown) => Promise.resolve({ error: null }).then(resolve),
    limit: vi.fn(async (limit: number) => ({ data: pendingRows.filter(row =>
      !excludeHeld || !heldIds.has(row.id as string)).slice(0, limit), error: null })) };
  databaseFrom.mockReset().mockReturnValue(query);
});

describe('이미 저장된 후보의 자동 등록 방어', () => {
  it.each([
    ['직접 응답', 'https://www.seoul.go.kr/apply/invented', [], '방문 신청'],
    ['주소 목록', null, ['https://www.seoul.go.kr/apply/invented'], '방문 신청'],
    ['본문 정규식', null, [], 'https://name:password@www.seoul.go.kr/apply'],
  ])('%s 경로도 근거가 없거나 로그인 정보가 섞이면 검수 대기로 유지한다', async (_, url, urls, body) => {
    pendingRows.push({ id: '기존후보', confidence_tier: 'high',
      classified_payload: { apply_url: url, body_urls: urls },
      news_posts: { id: '원문', slug: null, ministry: '서울특별시', body } });
    const result = await autoConfirmPendingPressCandidates();
    expect(result.confirmed).toBe(0);
    expect(result.skipped_no_url).toBe(1);
    expect(databaseFrom).toHaveBeenCalledTimes(2);
    expect(databaseFrom).toHaveBeenCalledWith('press_ingest_candidates');
  });
});

describe('자동 등록 재조회와 대기 목록 병목', () => {
  const valid = 'https://www.seoul.go.kr/apply?id=17';
  function validRow() {
    return { id: '정상후보', news_id: '원문', status: 'pending', program_type: 'welfare',
      title: '지원', category: '주거', confidence_tier: 'high',
      classified_payload: { apply_url: valid, body_urls: [], title: '지원' },
      news_posts: { id: '원문', slug: null, ministry: '서울특별시', body: `신청: ${valid}` } };
  }

  it('최종 재조회에서 주소가 바뀌면 정책을 등록하지 않는다', async () => {
    pendingRows.push(validRow());
    finalRead.row = { ...validRow(), classified_payload: { apply_url: 'https://www.seoul.go.kr/invented' } };
    const result = await autoConfirmPendingPressCandidates();
    expect(result.confirmed).toBe(0);
    expect(result.errors[0].message).toContain('원문 근거가 바뀌었습니다');
    expect(databaseFrom.mock.calls.some(([table]) => table === 'welfare_programs')).toBe(false);
  });

  it('대체 주소 저장 중 수정 충돌이 나면 기존 내용을 덮어쓰지 않고 등록을 중단한다', async () => {
    const row = { ...validRow(), classified_payload: { apply_url: null, body_urls: [valid] } };
    pendingRows.push(row); finalRead.row = validRow();
    const query = databaseFrom('press_ingest_candidates');
    query.single.mockResolvedValueOnce({ data: null, error: { message: '동시 수정으로 변경된 행 없음' } });
    const result = await autoConfirmPendingPressCandidates();
    expect(result.confirmed).toBe(0);
    expect(result.fallback_filled).toBe(0);
    expect(result.errors[0].message).toContain('동시 수정');
    expect(query.eq).toHaveBeenCalledWith('classified_payload', JSON.stringify(row.classified_payload));
  });

  it('앞의 미확인 후보 50개를 보존하고 다음 실행에서 51번째 정상 후보를 등록한다', async () => {
    for (let index = 0; index < 50; index++) pendingRows.push({ ...validRow(), id: `보류${index}`,
      news_posts: { id: '원문', slug: null, ministry: '서울특별시', body: '방문 신청' } });
    pendingRows.push(validRow()); finalRead.row = validRow();
    expect((await autoConfirmPendingPressCandidates()).skipped_no_url).toBe(50);
    expect(heldIds.size).toBe(50);
    expect(pendingRows.length).toBe(51);
    expect((await autoConfirmPendingPressCandidates()).confirmed).toBe(1);
  });
});

function modelResponse(url: string, bodyUrls: string[]) {
  // 실제 유료 호출 없이, 원문에 없는 주소를 만든 응답을 재현한다.
  fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({
    choices: [{ message: { content: JSON.stringify({
      is_policy: true, program_type: 'welfare', title: '청년 지원',
      confidence: 'high', apply_url: url, body_urls: bodyUrls,
    }) } }],
  }) });
}

describe('보도자료 주소의 원문 근거', () => {
  it('공공기관 형식이어도 원문에 없는 주소는 등록 후보에서 제외한다', async () => {
    const madeUp = 'https://www.seoul.go.kr/apply/invented';
    modelResponse(madeUp, [madeUp]);
    const result = await classifyPressNews({ title: '청년 지원', summary: null,
      body: '주민센터를 방문해 신청합니다.' });
    expect(result.apply_url).toBeNull();
    expect(result.body_urls).toEqual([]);
  });

  it('원문에 실제로 적힌 공공기관 상세 주소는 유지한다', async () => {
    const actual = 'https://www.seoul.go.kr/apply?id=17&year=2026';
    modelResponse(actual, [actual]);
    const result = await classifyPressNews({ title: '청년 지원', summary: null,
      body: `온라인 신청 주소는 ${actual} 입니다.` });
    expect(result.apply_url).toBe(actual);
    expect(result.body_urls).toEqual([actual]);
  });

  it('기관 첫 화면과 로그인 정보가 섞인 주소는 원문에 있어도 제외한다', async () => {
    const homepage = 'https://www.seoul.go.kr';
    const credentials = 'https://name:password@www.seoul.go.kr/apply';
    modelResponse(homepage, [homepage, credentials]);
    const result = await classifyPressNews({ title: '청년 지원', summary: null,
      body: `${homepage} ${credentials}` });
    expect(result.apply_url).toBeNull();
    expect(result.body_urls).toEqual([]);
  });
});
