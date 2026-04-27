"use client";

import { useState } from "react";
import { WithdrawDialog } from "./withdraw-dialog";

// 계정 탭 — 상단 "내 계정 요약" 카드 + 내 정보 다운로드 + 하단 위험 영역(탈퇴)
// 요약 정보는 서버 컴포넌트에서 prop 으로 받는다 (가입일·로그인 방식·이번 달 알림톡 발송 수).
export function AccountTab({
  email,
  createdAt,
  provider,
  alertsThisMonth,
}: {
  email: string;
  createdAt: string | null; // ISO timestamp · null 이면 "(미상)"
  provider: string | null; // 'google' | 'kakao' 등
  alertsThisMonth: number;
}) {
  // 가입 일자 — Supabase user.created_at 이 비어있는 비정상 케이스에 "오늘 가입"
  // 처럼 잘못 표시되지 않도록 명시적 fallback.
  const joinedLabel = createdAt
    ? new Date(createdAt).toLocaleDateString("ko-KR", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : "(미상)";
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

      {/* 내 정보 다운로드 — 「개인정보 보호법」 제35조 열람권 */}
      <ExportSection />

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

// 내 정보 다운로드 섹션 — /api/account/export 호출.
// fetch 로 받아 Blob 으로 변환 → a 태그 클릭 트리거. 로그인 세션 쿠키가 함께
// 전송되므로 본인 인증은 서버가 처리. 실패 시 한국어로 사유 안내.
function ExportSection() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDownload() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/account/export", {
        method: "GET",
        credentials: "same-origin",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error ?? `다운로드 실패 (HTTP ${res.status})`);
      }
      // 서버가 Content-Disposition 으로 파일명을 주지만, 브라우저가 그대로
      // 적용하지 못하는 경우가 있어 클라이언트에서도 fallback 파일명 지정.
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `keepioo-mydata-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "다운로드 중 오류가 발생했어요.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section>
      <h2 className="text-[15px] font-semibold text-grey-900 pb-2 mb-4 border-b border-grey-100">
        내 정보 다운로드
      </h2>
      <div className="rounded-lg border border-grey-200 bg-white p-4 space-y-3">
        <p className="text-[13px] text-grey-700 leading-[1.7]">
          keepioo 가 보관 중인 회원님의 개인정보 사본을 JSON 파일로 받을 수 있어요.
          프로필·관심분야·알림 규칙·동의 이력·결제 이력 등 모든 식별 데이터가 포함됩니다.
        </p>
        <p className="text-[12px] text-grey-500 leading-[1.6]">
          ※ 「개인정보 보호법」 제35조에 따른 열람권 행사 수단입니다.
          파일에는 민감정보가 포함될 수 있으니 외부 공유 시 주의해 주세요.
        </p>
        {error && (
          <p className="text-[13px] text-red leading-[1.6]">{error}</p>
        )}
        <button
          type="button"
          onClick={handleDownload}
          disabled={loading}
          className="inline-flex items-center justify-center px-4 py-2 rounded-lg bg-grey-900 text-white text-[13px] font-semibold hover:bg-grey-700 transition-colors disabled:opacity-50"
        >
          {loading ? "준비 중..." : "내 정보 JSON 다운로드"}
        </button>
      </div>
    </section>
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
      // email provider 자체가 이메일이라 라벨 중복 회피
      return email || "이메일";
    default:
      return email || "(알 수 없음)";
  }
}
