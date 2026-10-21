import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { authorizeCronRequest } from '@/lib/cron-auth';
import { runNewsPublication } from '@/lib/news-publication/run';
import { saveNewsRun } from '@/lib/news-publication/run-log';
import { callLLM } from '@/lib/llm/text';
import { newsToolFailure } from '@/lib/news-publication/tool-failure';

export const dynamic = 'force-dynamic';
export const maxDuration = 240;

// 운영 인증을 가진 담당자만 고정 문장으로 연결을 확인합니다. 기사·예약 기록은 건드리지 않습니다.
export async function POST(request: Request) {
  const denied = authorizeCronRequest(request);
  if (denied) return denied;
  const headers = { 'Cache-Control': 'no-store' };
  try {
    await callLLM({ prompt: '연결 확인입니다. 확인이라고만 답하세요.', maxTokens: 8, timeoutMs: 15000 });
    return NextResponse.json({ connected: true, checkedAt: new Date().toISOString() }, { headers });
  } catch (error) {
    const failure = newsToolFailure(error);
    return NextResponse.json({ connected: false, checkedAt: new Date().toISOString(),
      reason: failure.reason, toolFailure: failure.detail }, { status: 502, headers });
  }
}

// 기존 예약 작업 인증을 사용합니다. 실행 결과에는 비공개 원문이나 키를 담지 않습니다.
export async function GET(request: Request) {
  const denied = authorizeCronRequest(request);
  if (denied) return denied;
  try {
    const result = await runNewsPublication();
    const runRecorded = await saveNewsRun(result);
    if (result.published) {
      for (const path of ['/', '/news', ...result.slugs.map(slug => `/news/${slug}`)]) revalidatePath(path);
    }
    return NextResponse.json({ ...result, runRecorded }, { status: result.stopReason === 'failed' ? 500 : 200 });
  } catch {
    await saveNewsRun({ stopReason: 'failed' });
    return NextResponse.json({ error: '정책뉴스 자동 발행 작업에 실패했습니다.' }, { status: 500 });
  }
}
