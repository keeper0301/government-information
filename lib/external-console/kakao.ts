// ============================================================
// 카카오 알림톡 / SMS 발송 통계 점검 (Phase 3 외부 console)
// ============================================================
// Solapi `/messages/v4/list` API 로 24h 발송 결과 통계 fetch.
// 인증: HMAC-SHA256 (lib/notifications/sms-ops-alert.ts 와 동일 패턴).
// env: SOLAPI_API_KEY / SOLAPI_API_SECRET (이미 발송용으로 등록됨).
//
// 점검 항목:
//   - 24h 발송 시도 건수 (전체)
//   - 실패율 (≥10% → kakao_high_failure alert)
//   - 발송 0건 (cron 가동 중인데 0이면 의심) — 단, 신규 정책 0이면 자연 0 이라
//     단순 0 → alert 안 함. 7d 평균과 비교해 -90% 이상일 때만 alert
//   - 누적 pending (오래된 PENDING 상태)
// ============================================================

import crypto from "crypto";
import type { ConsoleCheckResult, ConsoleAlert } from "./types";

const SOLAPI_BASE = "https://api.solapi.com";

// statusCode 분류 — Solapi 공식 status code (2000 성공, 그 외 실패/대기)
// https://docs.solapi.com/api-reference/overview/error-code
function classifyStatus(code: string): "success" | "failed" | "pending" {
  if (!code) return "pending";
  const c = code.toUpperCase();
  if (c.startsWith("2")) return "success"; // 2xxx 성공
  if (c.startsWith("4") || c.startsWith("5")) return "failed"; // 4xxx·5xxx 실패
  return "pending"; // 1xxx·3xxx·기타 — 발송 대기·진행중
}

export interface SolapiMessageRow {
  messageId?: string;
  type?: string;        // SMS·LMS·MMS·ATA(알림톡)·CTA(친구톡) 등
  statusCode?: string;
  to?: string;
  from?: string;
  createdAt?: string;
  dateUpdated?: string;
}

interface SolapiListResponse {
  messageList?: Record<string, SolapiMessageRow>;
  limit?: number;
  startKey?: string | null;
  nextKey?: string | null;
}

// HMAC-SHA256 인증 헤더 — Solapi 공통 패턴.
function buildAuthHeader(): string | null {
  const apiKey = process.env.SOLAPI_API_KEY;
  const apiSecret = process.env.SOLAPI_API_SECRET;
  if (!apiKey || !apiSecret) return null;
  const date = new Date().toISOString();
  const salt = crypto.randomBytes(32).toString("hex");
  const signature = crypto
    .createHmac("sha256", apiSecret)
    .update(`${date}${salt}`)
    .digest("hex");
  return `HMAC-SHA256 apiKey=${apiKey}, date=${date}, salt=${salt}, signature=${signature}`;
}

// 2026-05-14 — Solapi 잔액 조회 응답.
// docs.solapi.com/api-reference/cash/getBalance
// SMS 1건 ~45원 (LMS 90자 미만 SMS 단가 + 알림톡 ~17원).
// 잔액 0 사고 (5/9~5/14): SMS 5일 다운 — 사전 경고가 메타 안전성 핵심.
export interface SolapiBalance {
  balance: number; // 보유 현금 잔액 (원)
  point: number;   // 보유 포인트 (원)
}

// 잔액 조회 fetch — 단일 호출 (pagination 없음).
async function fetchSolapiBalance(): Promise<SolapiBalance> {
  const auth = buildAuthHeader();
  if (!auth) throw new Error("SOLAPI credentials missing");

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10_000);
  try {
    const res = await fetch(`${SOLAPI_BASE}/cash/v1/balance`, {
      method: "GET",
      headers: { Authorization: auth, "Content-Type": "application/json" },
      cache: "no-store",
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (!res.ok) {
      throw new Error(
        `Solapi balance ${res.status}: ${(await res.text()).slice(0, 200)}`,
      );
    }
    const data = (await res.json()) as { balance?: number; point?: number };
    return {
      balance: typeof data.balance === "number" ? data.balance : 0,
      point: typeof data.point === "number" ? data.point : 0,
    };
  } catch (e) {
    clearTimeout(timer);
    throw e;
  }
}

// pure function — 잔액 → alert (또는 null). buildKakaoAlerts 와 분리해 단위 테스트 용이.
// 잔액 + 포인트 합산 < SOLAPI_BALANCE_ALERT_FLOOR 면 alert.
// 2026-05-14 — 임계 5000 → 10000 (subagent Warning-3 fix).
// 1만원 = SMS ~220건 = 4~5일 buffer. cron 24h 1회 → 한 cron 사이 5000원→0원 추락 방지.
// 사장님 충전 시간 (주말 포함 2~3일) 확보 + 텔레그램 fallback 으로 alert 자체 도달 보장.
//
// NaN 가드 (subagent Warning-1 fix): env typo (예: "1ee04") 시 Number=NaN →
// `usable >= NaN` = false → null 리턴 → 잔액 0 사고도 alert 0. 5/14 사고 재발 방지 본분 위반.
// Number.isFinite 검증 후 fallback 10000.
const SOLAPI_BALANCE_FLOOR_RAW = Number(
  process.env.SOLAPI_BALANCE_ALERT_FLOOR ?? "10000",
);
const SOLAPI_BALANCE_FLOOR = Number.isFinite(SOLAPI_BALANCE_FLOOR_RAW)
  ? SOLAPI_BALANCE_FLOOR_RAW
  : 10000;
export function buildKakaoBalanceAlert(
  balance: SolapiBalance,
): ConsoleAlert | null {
  const usable = balance.balance + balance.point;
  if (usable >= SOLAPI_BALANCE_FLOOR) return null;
  // SMS 본문 압축 (subagent Improvement-3): SMS 90byte 초과 시 LMS 단가 4배 → 잔액 더 빨리 소진 역효과.
  return {
    key: "solapi_balance_low",
    message: `Solapi 잔액 ${usable.toLocaleString()}원 — SMS ${Math.floor(usable / 45)}건 후 단절 (임계 ${SOLAPI_BALANCE_FLOOR.toLocaleString()}+).`,
    recommendation:
      "console.solapi.com/cash/charge 충전 (1만=220건). SOLAPI_BALANCE_ALERT_FLOOR env 로 1분 toggle.",
  };
}

// 24h 발송 통계 fetch — pagination 한 번만 (limit 500 으로 거의 다 잡힘).
// 정상 운영 발송량 (사장님 SMS·user 알림톡) 일일 ~수십~수백 건이라 1 페이지 충분.
async function fetchRecentMessages(): Promise<SolapiMessageRow[]> {
  const auth = buildAuthHeader();
  if (!auth) throw new Error("SOLAPI credentials missing");

  const startDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const endDate = new Date().toISOString();

  const url = `${SOLAPI_BASE}/messages/v4/list?dateType=CREATED&startDate=${encodeURIComponent(
    startDate,
  )}&endDate=${encodeURIComponent(endDate)}&limit=500`;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15_000);
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { Authorization: auth, "Content-Type": "application/json" },
      cache: "no-store",
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (!res.ok) {
      throw new Error(`Solapi list ${res.status}: ${(await res.text()).slice(0, 200)}`);
    }
    const data = (await res.json()) as SolapiListResponse;
    const list = data.messageList ?? {};
    return Object.values(list);
  } catch (e) {
    clearTimeout(timer);
    throw e;
  }
}

// pure function — 메시지 배열 → alerts/kpis. 단위 테스트 + main 둘 다 호출.
export function buildKakaoAlerts(
  messages: SolapiMessageRow[],
): { alerts: ConsoleAlert[]; kpis: Record<string, unknown> } {
  const alerts: ConsoleAlert[] = [];

  let success = 0;
  let failed = 0;
  let pending = 0;
  const byType: Record<string, number> = {};
  const failedCodes: Record<string, number> = {};

  for (const m of messages) {
    const cls = classifyStatus(m.statusCode ?? "");
    if (cls === "success") success++;
    else if (cls === "failed") {
      failed++;
      const code = m.statusCode ?? "UNKNOWN";
      failedCodes[code] = (failedCodes[code] ?? 0) + 1;
    } else pending++;

    const t = m.type ?? "UNKNOWN";
    byType[t] = (byType[t] ?? 0) + 1;
  }

  const total = messages.length;
  const failureRate = total === 0 ? 0 : failed / total;

  // 실패율 ≥ 10% 면 alert (운영 사고 신호 — Solapi 잔액 부족·번호 차단·템플릿 반려 등)
  if (total >= 5 && failureRate >= 0.1) {
    alerts.push({
      key: "kakao_high_failure",
      message: `Solapi 24h 발송 실패율 ${Math.round(failureRate * 100)}% (${failed}/${total}). 주요 코드: ${
        Object.entries(failedCodes)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([c, n]) => `${c}(${n})`)
          .join(", ") || "—"
      }`,
      recommendation:
        "Solapi 콘솔 잔액·발신번호 차단·알림톡 템플릿 심사 상태 확인. /admin/alimtalk 에서 최근 실패 로그도 점검",
    });
  }

  // 24h pending 누적 — 정상은 즉시 처리. ≥10건 이상 pending 으로 남으면 발송 시스템 정체
  if (pending >= 10) {
    alerts.push({
      key: "kakao_pending_stuck",
      message: `Solapi pending 누적 ${pending}건 (24h 안에서 발송 미완).`,
      recommendation:
        "Solapi 콘솔에서 실시간 발송 상태 + 카카오 비즈 채널 정지 여부 확인",
    });
  }

  return {
    alerts,
    kpis: {
      total_24h: total,
      success_24h: success,
      failed_24h: failed,
      pending_24h: pending,
      failure_rate: Number(failureRate.toFixed(3)),
      by_type: byType,
      failed_codes: failedCodes,
    },
  };
}

// console checker — cron route 에서 호출.
export async function checkKakao(): Promise<ConsoleCheckResult> {
  if (!process.env.SOLAPI_API_KEY || !process.env.SOLAPI_API_SECRET) {
    return {
      console: "kakao",
      alerts: [],
      kpis: {},
      error: "skipped: SOLAPI credentials missing",
    };
  }

  // 발송 통계 + 잔액 병렬 fetch (라운드트립 1).
  // 잔액 fetch 실패해도 message 통계는 표시 — 부분 결과 우선.
  const [messagesResult, balanceResult] = await Promise.allSettled([
    fetchRecentMessages(),
    fetchSolapiBalance(),
  ]);

  if (messagesResult.status === "rejected") {
    return {
      console: "kakao",
      alerts: [
        {
          key: "kakao_fetch_failed",
          message: `Solapi list API 호출 실패: ${(messagesResult.reason as Error).message.slice(0, 120)}`,
          recommendation: "SOLAPI_API_KEY/SECRET 만료·Solapi 장애 확인",
        },
      ],
      kpis: {},
      error: (messagesResult.reason as Error).message,
    };
  }

  const { alerts, kpis } = buildKakaoAlerts(messagesResult.value);

  // 잔액 alert 추가 (메타 안전책 — 5/9~5/14 잔액 0 사고 재발 방지).
  // 잔액 fetch 자체가 실패하면 KPI 에 fetch_error 만 기록 (alert 추가 안 함, message 통계는 유지).
  if (balanceResult.status === "fulfilled") {
    const balance = balanceResult.value;
    kpis.balance_total = balance.balance + balance.point;
    kpis.balance_cash = balance.balance;
    kpis.balance_point = balance.point;
    const balanceAlert = buildKakaoBalanceAlert(balance);
    if (balanceAlert) {
      // 단일화 (subagent Warning-1): solapi_balance_low 가 발화하면 kakao_high_failure 는
      // 같은 사고의 결과 (잔액 부족 → 모든 발송 실패) 라 SMS noise 압축. 잔액 alert 우선.
      const filtered = alerts.filter((a) => a.key !== "kakao_high_failure");
      filtered.push(balanceAlert);
      return { console: "kakao", alerts: filtered, kpis };
    }
  } else {
    kpis.balance_fetch_error = (balanceResult.reason as Error).message.slice(
      0,
      200,
    );
  }

  return { console: "kakao", alerts, kpis };
}
