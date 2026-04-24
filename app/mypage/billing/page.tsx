// ============================================================
// /mypage/billing — 내 구독 관리
// ============================================================
// 표시:
//   - 현재 티어, 상태 (체험/정상/연체/해지)
//   - 등록 카드 (마스킹)
//   - 다음 결제일
//   - 결제 이력 최근 5건
// 동작:
//   - "구독 해지" 버튼 → /api/billing/cancel
//   - "카드 변경" 버튼 → /checkout?tier=현재티어 로 이동 (다시 빌링 인증)
// ============================================================

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { TIER_NAMES, TIER_PRICES, type Tier } from "@/lib/subscription";
import { CancelButton } from "./cancel-button";

type SearchParams = Promise<{ already?: string; welcome?: string }>;

export default async function BillingPage({ searchParams }: { searchParams: SearchParams }) {
  const { already, welcome } = await searchParams;

  // 로그인 체크
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login?next=/mypage/billing");
  }

  // 구독 정보 조회 (admin 으로 — RLS 우회 필요 없지만 일관성 위해 동일 패턴)
  const admin = createAdminClient();
  const { data: subscription } = await admin
    .from("subscriptions")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  // 결제 이력 (최근 5건)
  const { data: history } = await admin
    .from("payment_history")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(5);

  // 무료 사용자 (또는 카드 등록 전 pending 상태 — 아직 구독 시작 안 됨)
  if (!subscription || subscription.tier === "free" || subscription.status === "pending") {
    return <FreeUserView />;
  }

  const tier = subscription.tier as Exclude<Tier, "free">;
  const tierName = TIER_NAMES[tier];
  const price = TIER_PRICES[tier];

  // 상태 표시 정보
  const statusInfo = getStatusInfo(subscription.status, subscription.cancelled_at);

  // 다음 결제일 (해지 상태면 "사용 종료일")
  const periodEnd = subscription.current_period_end
    ? new Date(subscription.current_period_end)
    : null;
  const periodEndStr = periodEnd
    ? periodEnd.toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" })
    : "—";

  return (
    <main className="min-h-screen bg-grey-50 pt-[80px] pb-20">
      <div className="max-w-[640px] mx-auto px-5">
        {/* 헤더 */}
        <div className="mb-6">
          <a href="/mypage" className="text-[13px] text-grey-600 hover:text-grey-700 no-underline">
            ← 내 정보
          </a>
          <h1 className="text-[24px] md:text-[28px] font-extrabold text-grey-900 mt-3 tracking-[-0.5px]">
            내 구독
          </h1>
        </div>

        {/* 환영 안내 (방금 가입 완료 → /checkout/success 에서 redirect) */}
        {welcome === "1" && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-5 text-[13px] text-blue-700 leading-[1.6]">
            <b>{tierName} 구독이 시작되었어요!</b><br />
            7일 무료체험이 진행 중이며, 등록한 카드는 체험 종료 후 자동 결제됩니다.
          </div>
        )}

        {/* "이미 구독중" 안내 (pricing 에서 redirect 된 경우) */}
        {already === "1" && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-5 text-[13px] text-blue-700">
            이미 {tierName} 플랜을 사용 중이에요.
          </div>
        )}

        {/* 현재 플랜 카드 */}
        <div className="bg-white rounded-2xl border border-grey-100 shadow-[0_4px_20px_rgba(0,0,0,0.04)] p-6 mb-5">
          <div className="flex items-center justify-between mb-5">
            <div>
              <div className="text-[13px] text-grey-600 mb-1">현재 플랜</div>
              <div className="text-[22px] font-extrabold text-grey-900">{tierName}</div>
            </div>
            <span className={`text-[12px] font-bold px-3 py-1.5 rounded-full ${statusInfo.badgeClass}`}>
              {statusInfo.label}
            </span>
          </div>

          <div className="border-t border-grey-100 pt-4 space-y-3">
            <Row label="월 결제 금액" value={`${price.toLocaleString()}원`} />
            <Row
              label={subscription.status === "cancelled" ? "사용 종료일" : "다음 결제일"}
              value={periodEndStr}
            />
            {subscription.card_company && subscription.card_number_masked && (
              <Row
                label="등록 카드"
                value={`${subscription.card_company} · ${subscription.card_number_masked}`}
              />
            )}
            <Row label="결제 알림" value={user.email || ""} />
          </div>
        </div>

        {/* 액션 버튼들 */}
        <div className="grid grid-cols-2 gap-2.5 mb-8">
          <a
            href={`/checkout?tier=${tier}`}
            className="min-h-[48px] flex items-center justify-center text-[14px] font-semibold rounded-xl bg-white border border-grey-200 text-grey-900 hover:bg-grey-50 no-underline"
          >
            카드 변경
          </a>
          {subscription.status !== "cancelled" && (
            <CancelButton tierName={tierName} />
          )}
        </div>

        {/* 결제 이력 */}
        <div className="bg-white rounded-2xl border border-grey-100 shadow-[0_4px_20px_rgba(0,0,0,0.04)] p-6">
          <h2 className="text-[16px] font-bold text-grey-900 mb-4">결제 이력</h2>
          {!history || history.length === 0 ? (
            <p className="text-[14px] text-grey-600">아직 결제 이력이 없어요.</p>
          ) : (
            <ul className="divide-y divide-grey-100">
              {history.map((h) => (
                <HistoryRow key={h.id} item={h} />
              ))}
            </ul>
          )}
        </div>
      </div>
    </main>
  );
}

// ============================================================
// 무료 사용자 화면 — 가격표로 유도
// ============================================================
function FreeUserView() {
  return (
    <main className="min-h-screen bg-grey-50 pt-[80px] pb-20">
      <div className="max-w-[480px] mx-auto px-5 text-center">
        <h1 className="text-[24px] font-extrabold text-grey-900 mt-10 mb-3">
          아직 구독 중이지 않아요
        </h1>
        <p className="text-[14px] text-grey-700 mb-6 leading-[1.6]">
          베이직 또는 프로 플랜으로 마감 알림과 맞춤 추천을 받아보세요.<br />
          7일 무료체험으로 시작할 수 있어요.
        </p>
        <a
          href="/pricing"
          className="inline-block min-h-[52px] px-8 flex items-center justify-center text-[15px] font-bold rounded-xl bg-blue-500 text-white hover:bg-blue-600 no-underline"
        >
          요금제 보러가기
        </a>
      </div>
    </main>
  );
}

// 항목 한 줄
function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-[13px] text-grey-600 flex-shrink-0">{label}</span>
      <span className="text-[14px] font-semibold text-grey-900 text-right break-all">{value}</span>
    </div>
  );
}

// 결제 이력 한 줄
function HistoryRow({ item }: { item: PaymentHistoryRow }) {
  const date = new Date(item.created_at).toLocaleDateString("ko-KR", {
    year: "numeric", month: "2-digit", day: "2-digit",
  });
  const isFailed = item.status === "FAILED" || item.status === "ABORTED";

  return (
    <li className="py-3 flex items-center justify-between gap-3">
      <div>
        <div className="text-[13px] text-grey-600">{date}</div>
        <div className="text-[14px] font-semibold text-grey-900">
          {TIER_NAMES[item.tier as Tier] || item.tier} 구독
        </div>
      </div>
      <div className="text-right">
        <div className={`text-[14px] font-bold ${isFailed ? "text-red-500" : "text-grey-900"}`}>
          {item.amount.toLocaleString()}원
        </div>
        <div className={`text-[11px] font-semibold ${isFailed ? "text-red-500" : "text-grey-600"}`}>
          {isFailed ? "실패" : "결제 완료"}
        </div>
      </div>
    </li>
  );
}

// 상태별 라벨과 배지 색상
function getStatusInfo(status: string, cancelledAt: string | null) {
  if (status === "pending") {
    return { label: "결제 대기 중", badgeClass: "bg-grey-100 text-grey-700" };
  }
  if (status === "trialing") {
    return { label: "무료체험 중", badgeClass: "bg-blue-100 text-blue-700" };
  }
  if (status === "active") {
    return { label: "정상 결제 중", badgeClass: "bg-green-100 text-green-700" };
  }
  if (status === "charging") {
    return { label: "결제 진행 중", badgeClass: "bg-blue-100 text-blue-700" };
  }
  if (status === "past_due") {
    return { label: "결제 실패", badgeClass: "bg-red-100 text-red-700" };
  }
  if (status === "cancelled") {
    return {
      label: cancelledAt ? "해지됨" : "해지 예정",
      badgeClass: "bg-grey-200 text-grey-700",
    };
  }
  return { label: status, badgeClass: "bg-grey-100 text-grey-700" };
}

// payment_history row 타입 (필요한 필드만)
type PaymentHistoryRow = {
  id: string;
  tier: string;
  amount: number;
  status: string;
  created_at: string;
};
