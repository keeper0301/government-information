// ============================================================
// 동의 기록 API — 본인 동의 기록 / 철회
// ============================================================
// POST /api/consent
//   body:
//     - action: 'record' | 'withdraw'
//     - consentType: 'privacy_policy' | 'terms' | 'marketing' | 'sensitive_topic' | 'kakao_messaging'
//     - version?: string  (record 시에만. 안 주면 현재 최신 상수 사용)
//
// 보안:
//   - 로그인 필수 (본인 동의만 기록/철회)
//   - 필수 동의(privacy_policy, terms) 는 철회 금지 — 탈퇴 흐름 안내
//   - IP, UA 는 서버에서 직접 추출 (클라이언트 조작 불가)
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  recordConsent,
  withdrawConsent,
  PRIVACY_POLICY_VERSION,
  TERMS_VERSION,
  KAKAO_MESSAGING_VERSION,
  type ConsentType,
} from "@/lib/consent";

// 필수 동의 = 서비스 이용 전제. 철회하려면 탈퇴해야 함.
const REQUIRED_CONSENTS: ConsentType[] = ["privacy_policy", "terms"];

// 알려진 동의 종류 (body 값 검증용)
const VALID_TYPES: ConsentType[] = [
  "privacy_policy",
  "terms",
  "marketing",
  "sensitive_topic",
  "kakao_messaging",
];

// 기본 버전 — 클라이언트가 version 안 넘기면 현재 시행 버전으로 기록
function defaultVersion(type: ConsentType): string {
  if (type === "privacy_policy") return PRIVACY_POLICY_VERSION;
  if (type === "terms") return TERMS_VERSION;
  if (type === "kakao_messaging") return KAKAO_MESSAGING_VERSION;
  // marketing, sensitive_topic 은 별도 버전 개념 없음 → 방침 버전 따라감
  return PRIVACY_POLICY_VERSION;
}

// 요청 헤더에서 IP 추출 (Vercel 환경: x-forwarded-for 첫 번째)
function getClientIp(req: NextRequest): string | undefined {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]?.trim();
  return req.headers.get("x-real-ip") ?? undefined;
}

export async function POST(req: NextRequest) {
  // 1) 로그인 확인
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });
  }

  // 2) 본문 파싱
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청이에요." }, { status: 400 });
  }
  const b = body as {
    action?: string;
    consentType?: string;
    version?: string;
  };

  // 3) 입력 검증
  if (b.action !== "record" && b.action !== "withdraw") {
    return NextResponse.json({ error: "action 이 잘못됐어요." }, { status: 400 });
  }
  if (!b.consentType || !VALID_TYPES.includes(b.consentType as ConsentType)) {
    return NextResponse.json(
      { error: "consentType 이 잘못됐어요." },
      { status: 400 },
    );
  }
  const consentType = b.consentType as ConsentType;

  // 4) 필수 동의는 철회 금지
  if (b.action === "withdraw" && REQUIRED_CONSENTS.includes(consentType)) {
    return NextResponse.json(
      {
        error:
          "필수 동의는 철회할 수 없어요. 회원 탈퇴를 원하시면 keeper0301@gmail.com 으로 문의해주세요.",
      },
      { status: 400 },
    );
  }

  // 5) 실행
  try {
    if (b.action === "record") {
      await recordConsent({
        userId: user.id,
        consentType,
        version: b.version || defaultVersion(consentType),
        ipAddress: getClientIp(req),
        userAgent: req.headers.get("user-agent") ?? undefined,
      });
      return NextResponse.json({ ok: true, action: "recorded" });
    } else {
      await withdrawConsent(user.id, consentType);
      return NextResponse.json({ ok: true, action: "withdrawn" });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "알 수 없는 오류";
    console.error("[api/consent] 실패:", msg);
    return NextResponse.json(
      { error: "처리 중 문제가 생겼어요. 잠시 후 다시 시도해주세요." },
      { status: 500 },
    );
  }
}
