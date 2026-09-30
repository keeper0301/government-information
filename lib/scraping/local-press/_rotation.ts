/**
 * UTC 날짜별로 앞/뒤 묶음을 번갈아 시작해 고정 순서의 예산 독점을 막는다.
 * 모든 시작 묶음은 한 주기 안에 한 번씩 방문한다. 같은 날 재시도는 같은 순서다.
 * 저장 상태가 없으므로 서버 재시작에도 유지되지만 정확한 중단 위치 재개는 아니다.
 */
export function rotatePressCities<T>(entries: readonly T[], batchSize: number, now: number): T[] {
  if (entries.length === 0) return [];
  const batches = Math.ceil(entries.length / batchSize);
  const day = Math.floor(now / 86_400_000);
  const slot = ((day % batches) + batches) % batches;
  const startBatch = Math.floor(slot / 2) + (slot % 2) * Math.ceil(batches / 2);
  const offset = startBatch * batchSize;
  return [...entries.slice(offset), ...entries.slice(0, offset)];
}
