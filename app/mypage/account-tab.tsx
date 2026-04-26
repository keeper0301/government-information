"use client";

import { WithdrawDialog } from "./withdraw-dialog";

// 계정 탭 — 상단 "내 계정 요약" 카드 + 하단 위험 영역(탈퇴)
// 요약 정보는 서버 컴포넌트에서 prop 으로 받는다 (가입일·로그인 방식·이번 달 알림톡 발송 수).
export function AccountTab({
  email,
  createdAt,
  provider,
  alertsThisMonth,
}: {
  email: string;
  createdAt: string; // ISO timestamp
  provider: string | null; // 'google' | 'kakao' 등
  alertsThisMonth: number;
}) {
  const joinedLabel = new Date(createdAt).toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const providerLabel = providerToLabel(provider, email);

  return (
    <div className="space-y-10">
      {/* 계정 요약 카드 */}
      <section>
        <h2 className="text-[15px] font-semibold text-grey-900 pb-2 mb-4 border-b border-grey-100">
          계정 요약
        </h2>
        <dl className="rounded-lg border border-grey-200 bg-white divide-y divide-grey-100">
          <SummaryRow label="가입 일자" value={joinedLabel} />
          <SummaryRow label="로그인 방식" value={providerLabel} />
          <SummaryRow
            label="알림톡 발송 수"
            value={`${alertsThisMonth.toLocaleString("ko-KR")}건 (이번 달)`}
          />
        </dl>
      </section>

      {/* 위험 영역 — 시각적으로 분리해서 사용자가 의도치 않게 들어가지 않도록 */}
      <section>
        <h2 className="text-[15px] font-semibold text-red pb-2 mb-4 border-b border-red/30 flex items-center gap-2">
          <span aria-hidden>⚠️</span>
          위험 영역
        </h2>
        <div className="rounded-lg border border-red/30 bg-red/5 p-4 space-y-3">
          <h3 className="text-[14px] font-semibold text-grey-900">회원 탈퇴</h3>
          <p className="text-[13px] text-grey-700 leading-[1.6]">
            탈퇴 신청 후 <b>30일 유예</b>가 지나면 모든 데이터가 영구 삭제됩니다.
            유예 기간 안에 같은 이메일로 다시 로그인하면 복구 가능합니다.
          </p>
          <div className="pt-1">
            <WithdrawDialog />
          </div>
        </div>
      </section>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between px-4 py-3">
      <dt className="text-[13px] text-grey-700">{label}</dt>
      <dd className="text-[14px] font-medium text-grey-900">{value}</dd>
    </div>
  );
}

// provider 코드를 한국어 라벨로.
// Supabase auth user.app_metadata.provider 가 'google' / 'kakao' / 'email' 등.
function providerToLabel(provider: string | null, email: string): string {
  switch (provider) {
    case "google":
      return `구글 (${email})`;
    case "kakao":
      return `카카오 (${email})`;
    case "email":
      return `이메일 (${email})`;
    default:
      return email || "(알 수 없음)";
  }
}
