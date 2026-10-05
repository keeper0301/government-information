// 전국 수집을 여섯 번으로 나누어 마지막 지역도 매일 실행되도록 한다.
export const LOCAL_PRESS_SHARD_COUNT = 6;

export function selectPressShard<T>(entries: readonly T[], shard: string): T[] {
  if (!/^[0-5]$/.test(shard)) throw new Error("수집 묶음은 0부터 5까지 지정해 주세요.");
  const index = Number(shard);
  return entries.filter((_, position) => position % LOCAL_PRESS_SHARD_COUNT === index);
}
