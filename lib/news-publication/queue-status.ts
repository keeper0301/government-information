// 조회 시점의 상태이며 예약 실행이 실제 호출됐다는 증거는 아닙니다.
const LABELS: Record<string, string> = {
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
export function queueStatusLabel(value: unknown): string {
  if (!value || typeof value !== 'object' || !('reason' in value)
    || typeof value.reason !== 'string') return '현재 대기 이유를 확인하지 못했습니다.';
  return Object.hasOwn(LABELS, value.reason) ? LABELS[value.reason] : '현재 대기 이유를 확인하지 못했습니다.';
}
