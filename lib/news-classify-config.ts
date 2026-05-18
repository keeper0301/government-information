// spec opt-C — 100 → 200 확대 + 동시 5 병렬화. 14k backlog 14일 해소 목표.
// gpt-4o-mini 비용: cron 6회 × 200건 = 1,200건/일 ≈ 월 ~$15 (Haiku 의 ~1/7).
// timeout: 200 × ~3초 ÷ 동시 5 ≈ 120초 < maxDuration 600초 (5x margin).
export const NEWS_CLASSIFY_CAP_PER_CRON = 200;
