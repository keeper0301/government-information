"use client";

import { useEffect, useState } from "react";
import { getNavAuthState } from "@/lib/nav/nav-auth-state";

export function AdminReviewStatus({
  checkedAt,
  reviewedAt,
}: {
  checkedAt: string | null;
  reviewedAt: string | null;
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getNavAuthState()
      .then((state) => {
        if (!cancelled) setVisible(state.isAdmin);
      })
      .catch(() => {
        if (!cancelled) setVisible(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!visible) return null;

  return (
    <p className="mb-4 text-[12px] font-medium text-grey-500">
      관리자 전용 · 원문 확인일: {checkedAt ?? "미확인"} · 사람 검수일: {reviewedAt ?? "검수 전"}
    </p>
  );
}
