const stages: Record<string, string> = {
  generation: '초안 작성', draft: '형식·숫자 검사', sourceState: '현재·예정 상태 검사',
  caseClaims: '사례 주장 검사', facts: '사실 대조', quality: '글 품질 검사', contentDepth: '본문 충실도 검사',
};
const statuses: Record<string, string> = { started: '시작·완료 미확인', passed: '통과', held: '보류' };

// 이전 자료와 불완전한 기록은 통과로 간주하지 않습니다. 원시 검사 응답은 노출하지 않습니다.
export function reviewLines(value: unknown, attemptedAt?: string, status?: string): string[] {
  if (!value || typeof value !== 'object' || !('events' in value) || !Array.isArray(value.events)) {
    return ['검수 단계 기록 없음 · 해당 검사를 통과했다고 판단할 수 없습니다.'];
  }
  const checkedAt = 'checkedAt' in value && typeof value.checkedAt === 'string' ? Date.parse(value.checkedAt) : NaN;
  if (status === 'processing' || (attemptedAt && (!Number.isFinite(checkedAt) || checkedAt < Date.parse(attemptedAt)))) {
    return ['이번 시도의 검수 결과는 아직 확인되지 않았습니다. 이전 시도의 기록은 표시하지 않습니다.'];
  }
  const latest = new Map<string, string>();
  for (const event of value.events.slice(0, 100)) {
    if (!event || typeof event !== 'object' || !Number.isInteger(event.attempt)
      || !Object.hasOwn(stages, event.stage) || !Object.hasOwn(statuses, event.status)) continue;
    latest.set(`${event.attempt}-${event.stage}`, `${event.attempt}차 · ${stages[event.stage]}: ${statuses[event.status]}`);
  }
  const version = 'version' in value && typeof value.version === 'string' ? value.version.slice(0, 80) : '미확인';
  return [`검수 버전: ${version}`, `검수 기록 시각: ${Number.isFinite(checkedAt) ? new Date(checkedAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }) : '미확인'}`, ...latest.values(), '표시되지 않은 단계는 실행 여부가 확인되지 않았습니다.'];
}
