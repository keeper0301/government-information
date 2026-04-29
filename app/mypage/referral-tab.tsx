"use client";

import { useState } from "react";

// 추천 탭 — 클라이언트 컴포넌트
// 서버에서 받은 code, stats, capRemaining 을 표시 + 공유 링크 복사 버튼 + 정책 안내.
// 코드 발급은 서버 컴포넌트가 페이지 진입 시 처리 (getOrCreateCode).
export function ReferralTab({
  code,
  shareUrl,
  stats,
  capLimit,
}: {
  code: string;
  shareUrl: string;
  stats: {
    pending: number;
    completed: number;
    rejected: number;
    total: number;
    capRemaining: number;
  };
  capLimit: number;
}) {
  const [copied, setCopied] = useState<"url" | "code" | null>(null);

  async function copyToClipboard(text: string, kind: "url" | "code") {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
      // 2초 후 라벨 복구
      window.setTimeout(() => setCopied(null), 2000);
    } catch {
      // 클립보드 권한 거부 등 — 안내만 표시
      window.alert("복사에 실패했어요. 직접 길게 누르거나 드래그해서 복사해 주세요.");
    }
  }

  return (
    <div className="space-y-8">
      {/* 보상 정책 헤드라인 */}
      <section>
        <h2 className="text-[18px] font-bold text-grey-900 mb-2">
          🎁 친구 초대하고 Pro 1주 무료 받기
        </h2>
        <p className="text-[14px] text-grey-700 leading-[1.7]">
          내 추천 링크로 친구가 가입하면, 자동으로{" "}
          <b className="text-emerald-700">Pro 1주 (7일)</b>가 연장돼요.
          최대 <b>{capLimit}명</b>까지 보상이 누적됩니다.
        </p>
      </section>

      {/* 코드 + 공유 링크 카드 */}
      <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 space-y-4">
        <div>
          <p className="text-[12px] font-semibold text-emerald-700 mb-1">
            내 추천 코드
          </p>
          <div className="flex items-center gap-3 flex-wrap">
            <code className="font-mono text-[24px] tracking-[4px] font-bold text-emerald-900 bg-white px-4 py-2 rounded-lg border border-emerald-300">
              {code}
            </code>
            <button
              type="button"
              onClick={() => copyToClipboard(code, "code")}
              className="min-h-[44px] inline-flex items-center px-4 text-[13px] font-semibold text-emerald-700 bg-white rounded-lg border border-emerald-300 hover:bg-emerald-100 transition-colors"
            >
              {copied === "code" ? "복사됨 ✓" : "코드 복사"}
            </button>
          </div>
        </div>

        <div>
          <p className="text-[12px] font-semibold text-emerald-700 mb-1">
            공유 링크
          </p>
          <div className="flex items-center gap-3 flex-wrap">
            <input
              type="text"
              readOnly
              value={shareUrl}
              className="flex-1 min-w-[200px] font-mono text-[13px] text-grey-900 bg-white px-3 py-2 rounded-lg border border-emerald-300"
              onFocus={(e) => e.currentTarget.select()}
            />
            <button
              type="button"
              onClick={() => copyToClipboard(shareUrl, "url")}
              className="min-h-[44px] inline-flex items-center px-4 text-[13px] font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors"
            >
              {copied === "url" ? "복사됨 ✓" : "링크 복사"}
            </button>
          </div>
          <p className="text-[12px] text-emerald-800 mt-2 leading-[1.6]">
            카카오톡·문자·SNS 어디든 붙여넣어 공유할 수 있어요.
          </p>
        </div>
      </section>

      {/* 통계 3카드 */}
      <section>
        <h3 className="text-[15px] font-semibold text-grey-900 pb-2 mb-4 border-b border-grey-100">
          내 추천 현황
        </h3>
        <div className="grid grid-cols-3 gap-3 max-md:grid-cols-1">
          <StatCard
            label="가입 대기"
            value={stats.pending}
            hint="아직 가입 전"
          />
          <StatCard
            label="보상 적용"
            value={stats.completed}
            hint={`Pro ${stats.completed * 7}일 누적`}
            accent
          />
          <StatCard
            label="남은 보상 한도"
            value={stats.capRemaining}
            hint={`전체 한도 ${capLimit}명`}
          />
        </div>
        {stats.rejected > 0 && (
          <p className="mt-3 text-[12px] text-grey-500 leading-[1.6]">
            ※ 차단된 시도 {stats.rejected}건 (자기 추천·중복 등). 보상 한도엔
            영향 없어요.
          </p>
        )}
      </section>

      {/* 자세한 안내 */}
      <section className="rounded-lg border border-grey-200 bg-white p-4">
        <h3 className="text-[14px] font-semibold text-grey-900 mb-2">
          자주 묻는 질문
        </h3>
        <dl className="space-y-3 text-[13px] text-grey-700 leading-[1.7]">
          <div>
            <dt className="font-semibold text-grey-900">언제 보상이 적용되나요?</dt>
            <dd>
              친구가 내 링크로 처음 가입을 마치는 즉시 자동으로 적용돼요.
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-grey-900">자기 자신을 추천하면?</dt>
            <dd>차단됩니다. 다른 계정으로 가입해도 같은 사람으로 판단되면 거절돼요.</dd>
          </div>
          <div>
            <dt className="font-semibold text-grey-900">한 친구가 여러 번 가입하면?</dt>
            <dd>친구 1명당 1번만 보상이 들어가요. 중복 가입은 차단됩니다.</dd>
          </div>
          <div>
            <dt className="font-semibold text-grey-900">Pro 가 이미 활성 상태라면?</dt>
            <dd>현재 결제 종료일에 7일이 그대로 누적돼서, 더 길게 쓸 수 있어요.</dd>
          </div>
        </dl>
      </section>
    </div>
  );
}

// 통계 카드 1개
function StatCard({
  label,
  value,
  hint,
  accent = false,
}: {
  label: string;
  value: number;
  hint: string;
  accent?: boolean;
}) {
  return (
    <div
      className={
        accent
          ? "rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3"
          : "rounded-lg border border-grey-200 bg-white px-4 py-3"
      }
    >
      <p className="text-[12px] text-grey-600 mb-1">{label}</p>
      <p
        className={
          accent
            ? "text-[24px] font-bold text-emerald-700"
            : "text-[24px] font-bold text-grey-900"
        }
      >
        {value.toLocaleString("ko-KR")}
      </p>
      <p className="text-[11px] text-grey-500 mt-1">{hint}</p>
    </div>
  );
}
