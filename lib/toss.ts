// ============================================================
// 토스페이먼츠 서버 SDK 래퍼
// ============================================================
// 빌링키(자동결제 키) 발급, 매월 자동결제, 결제 조회.
// 클라이언트에서 호출 금지 — TOSS_SECRET_KEY 가 노출됨.
// API 문서: https://docs.tosspayments.com/reference
// ============================================================

const TOSS_API_BASE = "https://api.tosspayments.com";

// 토스 시크릿 키 가져오기 (서버 전용)
function getSecretKey(): string {
  const key = process.env.TOSS_SECRET_KEY;
  if (!key) {
    throw new Error("TOSS_SECRET_KEY 환경변수가 설정되지 않았습니다.");
  }
  return key;
}

// 토스 API 인증 헤더 생성
// 형식: Authorization: Basic base64(SECRET_KEY:)  ← 콜론 뒤 빈 문자열
function authHeader(): string {
  const secretKey = getSecretKey();
  const encoded = Buffer.from(`${secretKey}:`).toString("base64");
  return `Basic ${encoded}`;
}

// 공통 fetch 래퍼: JSON 송수신, 에러 처리
async function tossFetch<T>(
  endpoint: string,
  body: Record<string, unknown>,
): Promise<T> {
  const res = await fetch(`${TOSS_API_BASE}${endpoint}`, {
    method: "POST",
    headers: {
      Authorization: authHeader(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  // 토스는 실패 시에도 JSON 으로 { code, message } 반환
  const data = await res.json().catch(() => ({ code: "PARSE_ERROR", message: "응답 파싱 실패" }));

  if (!res.ok) {
    // 호출자가 분기할 수 있도록 코드와 메시지를 함께 던짐
    throw new TossError(data.code || "UNKNOWN", data.message || "토스 API 호출 실패", res.status);
  }

  return data as T;
}

// 토스 API 에러 타입 (호출자가 instanceof 로 분기 가능)
export class TossError extends Error {
  constructor(
    public code: string,
    message: string,
    public httpStatus: number,
  ) {
    super(message);
    this.name = "TossError";
  }
}

// ============================================================
// 빌링키 발급 — 카드 등록 인증 후 authKey 를 영구 키로 교환
// ============================================================
// 클라이언트에서 카드 등록 → 토스가 successUrl 로 authKey 전달
// → 서버에서 이 함수로 영구 빌링키 발급 → DB 저장
// 빌링키는 한 번 발급되면 카드 만료/해지 전까지 계속 유효
// ============================================================
export type BillingKeyResponse = {
  billingKey: string;
  customerKey: string;
  authenticatedAt: string;
  method: string;          // "카드"
  cardCompany: string;     // "현대카드"
  cardNumber: string;      // 마스킹된 카드번호 ("1234-****-****-5678")
  cardType: string;
};

export async function issueBillingKey(
  authKey: string,
  customerKey: string,
): Promise<BillingKeyResponse> {
  return tossFetch<BillingKeyResponse>(
    "/v1/billing/authorizations/issue",
    { authKey, customerKey },
  );
}

// ============================================================
// 자동 결제 — 등록된 빌링키로 즉시 결제
// ============================================================
// 매월 cron 으로 호출되거나, 가입 직후 첫 결제 시 호출
// orderId 는 우리 시스템에서 발급하는 고유값 (중복 결제 방지)
// ============================================================
export type ChargeBillingParams = {
  billingKey: string;
  customerKey: string;
  amount: number;          // 원 단위 정수 (4900, 9900 등)
  orderId: string;         // 6~64자, 영숫자·하이픈·언더스코어
  orderName: string;       // 100자 이내, 예: "정책알리미 프로 9월"
  customerEmail: string;
  customerName?: string;
};

export type PaymentResponse = {
  paymentKey: string;
  orderId: string;
  status: "READY" | "IN_PROGRESS" | "DONE" | "CANCELED" | "FAILED" | string;
  totalAmount: number;
  approvedAt: string;
  receipt?: { url: string };
  card?: {
    company: string;
    number: string;
    issuerCode?: string;
    acquirerCode?: string;
    installmentPlanMonths?: number;
  };
  // 토스가 추가로 보내는 필드들 (필요 시 확장)
  [key: string]: unknown;
};

export async function chargeBilling(params: ChargeBillingParams): Promise<PaymentResponse> {
  const { billingKey, customerKey, amount, orderId, orderName, customerEmail, customerName } = params;

  return tossFetch<PaymentResponse>(
    `/v1/billing/${billingKey}`,
    {
      customerKey,
      amount,
      orderId,
      orderName,
      customerEmail,
      customerName: customerName || customerEmail.split("@")[0],
    },
  );
}

// ============================================================
// 결제 단건 조회 — 웹훅 검증 등에 사용
// ============================================================
export async function getPayment(paymentKey: string): Promise<PaymentResponse> {
  const res = await fetch(`${TOSS_API_BASE}/v1/payments/${paymentKey}`, {
    method: "GET",
    headers: { Authorization: authHeader() },
    cache: "no-store",
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new TossError(data.code || "UNKNOWN", data.message || "결제 조회 실패", res.status);
  }
  return data as PaymentResponse;
}

// ============================================================
// 빌링키 삭제 — DB 저장 실패 시 좀비 빌링키 정리
// ============================================================
// success 페이지에서 issueBillingKey 는 성공했는데 DB INSERT 가 실패한 경우,
// 토스에 발급된 빌링키가 우리 DB 에는 없는 "좀비" 상태가 됨.
// 이 함수로 토스 쪽 빌링키도 삭제해서 정합성 회복.
//
// 토스가 빌링키 삭제 API 를 공식적으로 제공하지 않으면 (404 등) 조용히 실패하고
// 호출자가 별도로 로그/알림 처리.
// ============================================================
export async function deleteBillingKey(billingKey: string): Promise<{ ok: boolean; reason?: string }> {
  try {
    const res = await fetch(`${TOSS_API_BASE}/v1/billing/${billingKey}`, {
      method: "DELETE",
      headers: { Authorization: authHeader() },
      cache: "no-store",
    });
    if (res.ok) return { ok: true };
    const data = await res.json().catch(() => ({}));
    return { ok: false, reason: data.message || `HTTP ${res.status}` };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : "삭제 요청 실패" };
  }
}

// ============================================================
// 주문번호(orderId) 생성 헬퍼
// ============================================================
// 6~64자, 영숫자/하이픈/언더스코어만 허용
// 형식: sub_{userId 앞 8자}_{YYYYMMDDHHmmss}_{랜덤4자}
// 같은 사용자가 동시에 두 번 결제 요청해도 중복 안 남
// ============================================================
export function generateOrderId(userId: string, prefix = "sub"): string {
  const userPart = userId.replace(/-/g, "").slice(0, 8);
  const now = new Date();
  const ymd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  const hms = `${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}${String(now.getSeconds()).padStart(2, "0")}`;
  const rand = Math.random().toString(36).slice(2, 6);
  return `${prefix}_${userPart}_${ymd}${hms}_${rand}`;
}
