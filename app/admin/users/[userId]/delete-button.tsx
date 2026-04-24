"use client";

// ============================================================
// DeleteUserButton — 어드민 수동 탈퇴 확인 UI
// ============================================================
// server action `deleteUserAsAdmin` 을 form action 으로 받아
// 2단계 확인 (체크박스 + window.confirm) 후 제출.
//
// 안전장치:
//   1. 본인 계정은 버튼 자체 숨김 (isSelf)
//   2. 체크박스 체크 전엔 버튼 비활성화
//   3. 클릭 시 window.confirm 으로 마지막 확인 (사용자 이메일 포함)
// ============================================================

import { useState } from "react";

type Props = {
  // deleteUserAsAdmin server action
  action: (formData: FormData) => Promise<void>;
  userId: string;
  userEmail: string | null;
  isSelf: boolean;
};

export function DeleteUserButton({ action, userId, userEmail, isSelf }: Props) {
  const [acknowledged, setAcknowledged] = useState(false);

  // 어드민 본인 계정이면 이 UI 자체를 숨김 (server action 에서도 재확인)
  if (isSelf) {
    return (
      <p className="text-[13px] text-grey-600 leading-[1.6]">
        본인 계정이므로 이 페이지에서는 탈퇴 처리할 수 없어요. 본인 탈퇴는
        마이페이지 최하단의 &quot;회원 탈퇴&quot; 섹션을 이용해 주세요.
      </p>
    );
  }

  // form 제출 전 마지막 확인 — cancel 하면 preventDefault 로 제출 막음
  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    const label = userEmail ?? userId;
    const confirmed = window.confirm(
      `정말 이 사용자를 탈퇴 처리할까요?\n\n대상: ${label}\n\n프로필·구독·알림·AI 사용량·동의 기록 등 모든 관련 데이터가 즉시 삭제되며 복구할 수 없어요.`,
    );
    if (!confirmed) e.preventDefault();
  }

  return (
    <form action={action} onSubmit={handleSubmit}>
      <input type="hidden" name="userId" value={userId} />

      <label className="flex items-start gap-2 mb-4 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={acknowledged}
          onChange={(e) => setAcknowledged(e.target.checked)}
          className="mt-1 cursor-pointer"
        />
        <span className="text-[13px] text-grey-700 leading-[1.5]">
          이 사용자의 모든 데이터가 영구 삭제되며 복구할 수 없음을 이해했어요.
        </span>
      </label>

      <button
        type="submit"
        disabled={!acknowledged}
        className="px-4 py-2 text-[13px] font-semibold rounded-md border border-red text-red bg-white hover:bg-red/5 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
      >
        이 사용자 탈퇴 처리
      </button>
    </form>
  );
}
