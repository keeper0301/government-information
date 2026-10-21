import { NewsDraftError } from './errors';
import { newsToolFailure } from './tool-failure';

export const NEWS_REVIEW_VERSION = '2026-10-20-event-state-v2';
export type ReviewStage = 'generation' | 'draft' | 'sourceState' | 'caseClaims' | 'facts' | 'quality' | 'contentDepth';
export type ReviewEvent = { attempt: number; stage: ReviewStage; status: 'started' | 'passed' | 'held'; reason?: string };

// 실제 도달한 단계만 기록합니다. 기록이 없는 단계를 통과로 추정하지 않습니다.
export class NewsReviewAudit {
  private attempt = 0;
  private stage: ReviewStage = 'generation';
  private events: ReviewEvent[] = [];
  nextAttempt() { this.attempt++; this.start('generation'); }
  start(stage: ReviewStage) { this.stage = stage; this.events.push({ attempt: this.attempt, stage, status: 'started' }); }
  pass(stage: ReviewStage) { this.events.push({ attempt: this.attempt, stage, status: 'passed' }); }
  hold(stage: ReviewStage, reason: string) { this.events.push({ attempt: this.attempt, stage, status: 'held', reason: reason.slice(0, 240) }); }
  sourceState(issue: string | null) {
    this.start('sourceState');
    if (issue) this.hold('sourceState', issue); else this.pass('sourceState');
    this.stage = 'draft';
  }
  snapshot(status: 'passed' | 'held') {
    return { version: NEWS_REVIEW_VERSION, checkedAt: new Date().toISOString(), status, events: [...this.events] };
  }
  fail(reason: string) { this.hold(this.stage, reason); return this.snapshot('held'); }
}

export async function withNewsReviewAudit<T>(work: (audit: NewsReviewAudit) => Promise<T>) {
  const audit = new NewsReviewAudit();
  try {
    const result = await work(audit);
    return { ...result, reviewAudit: audit.snapshot('passed') };
  } catch (error) {
    // 작성 도구의 원시 오류에는 비밀값이 포함될 수 있으므로 저장하지 않습니다.
    const failure = newsToolFailure(error);
    const reason = error instanceof NewsDraftError ? error.message : failure.reason;
    const evidence = error instanceof NewsDraftError
      ? (error.evidence && typeof error.evidence === 'object' ? error.evidence : {})
      : { toolFailure: failure.detail };
    throw new NewsDraftError(reason, { ...evidence, reviewAudit: audit.fail(reason) });
  }
}
