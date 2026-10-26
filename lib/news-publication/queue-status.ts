// 조회 시점의 상태이며 예약 실행이 실제 호출됐다는 증거는 아닙니다.
const LABELS: Record<string, string> = {
  credit_exhausted: '작성 서비스 잔액 소진으로 이번 실행을 중단했습니다. 결제 잔액을 확인해 주세요.',
  insufficient_quota: '작성 서비스 사용 한도 부족으로 이번 실행을 중단했습니다. 잔액과 한도 설정을 확인해 주세요.',
  authentication: '작성 서비스 인증 실패로 이번 실행을 중단했습니다. 운영 인증 설정을 확인해 주세요.',
  permission: '작성 서비스 권한 오류로 이번 실행을 중단했습니다. 운영 계정 권한을 확인해 주세요.',
  daily_limit: '오늘 공개 한도 3편을 채웠습니다.',
  processing: '다른 후보의 검사와 저장이 끝나기를 기다립니다.',
  ready: '다음 정상 예약 실행에서 검사할 후보가 있습니다.',
  attempt_limit: '오늘 새 후보 검사 한도 6건을 채웠습니다.',
  retry_wait: '보류 후보의 재시도 시각을 기다리고 있습니다.',
  no_candidates: '현재 조건에 맞는 새 후보가 없습니다.',
  time_budget: '이번 실행의 처리 시간을 사용해 다음 정상 실행으로 넘겼습니다.',
  candidate_limit: '이번 실행의 후보 처리 횟수를 채웠습니다.',
  failed: '실행 중 오류가 발생했습니다. 처리된 기사와 서버 기록을 확인해 주세요.',
};
// 기사별 품질 문제나 일시적인 요청 지연은 서비스 전체 장애로 단정하지 않습니다.
export function sharedNewsFailure(evidence: unknown): string | null {
  if (!evidence || typeof evidence !== 'object' || !('toolFailure' in evidence)) return null;
  const failure = evidence.toolFailure;
  if (!failure || typeof failure !== 'object' || !('kind' in failure)) return null;
  return typeof failure.kind === 'string'
    && ['credit_exhausted', 'insufficient_quota', 'authentication', 'permission'].includes(failure.kind)
    ? failure.kind : null;
}

// 서버의 지역 설정과 무관하게 한국 시간의 고정 예약 시각을 계산합니다.
export function nextNewsRun(now = new Date()): string {
  const day = new Date(now.getTime() + 9 * 3600000).toISOString().slice(0, 10);
  const slots = ['11:10', '17:10'].map(time => new Date(`${day}T${time}:00+09:00`));
  const next = slots.find(slot => slot > now) ?? new Date(slots[0].getTime() + 86400000);
  return next.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
}
export function queueStatusLabel(value: unknown): string {
  if (!value || typeof value !== 'object' || !('reason' in value)
    || typeof value.reason !== 'string') return '현재 대기 이유를 확인하지 못했습니다.';
  return Object.hasOwn(LABELS, value.reason) ? LABELS[value.reason] : '현재 대기 이유를 확인하지 못했습니다.';
}
