"use client";

// ============================================================
// AdminAutoConfirmBadge — 자동등록 배지의 정적 ISR 호환 클라이언트 래퍼
// ============================================================
// 배경: 정책 상세 페이지 정적 ISR 전환(2026-06-13). 서버 렌더에서 관리자 판정
//   (auth.getUser 쿠키 읽기)을 하면 페이지가 동적으로 강제돼 캐시가 안 된다.
//   따라서 mount 후 클라이언트에서 로그인 사용자일 때만 서버 액션을 호출해
//   관리자 여부 + candidateId 를 받아 배지를 렌더한다.
//   tier/isHidden/autoConfirmedAt 는 정적 program 데이터라 props 로 받는다.
//   일반 사용자·크롤러는 서버 액션을 호출하지 않으므로(로그인 사용자만) 렌더 0.
// ============================================================

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { fetchAutoConfirmBadge } from "@/lib/admin/auto-confirm-badge-action";
import { AutoConfirmBadge } from "./auto-confirm-badge";

type Props = {
  table: "welfare_programs" | "loan_programs";
  programId: string;
  tier: "high" | "mid";
  isHidden: boolean;
  autoConfirmedAt: string | null;
};

export function AdminAutoConfirmBadge({
  table,
  programId,
  tier,
  isHidden,
  autoConfirmedAt,
}: Props) {
  const [candidateId, setCandidateId] = useState<string | null>(null);
  const [show, setShow] = useState(false);

  useEffect(() => {
    let cancelled = false;
    createClient()
      .auth.getUser()
      .then(({ data }) => {
        if (cancelled || !data.user) return;
        fetchAutoConfirmBadge(table, programId).then((ctx) => {
          if (cancelled || !ctx) return; // 관리자 아니면 null → 미노출
          setCandidateId(ctx.candidateId);
          setShow(true);
        });
      });
    return () => {
      cancelled = true;
    };
  }, [table, programId]);

  if (!show) return null;
  return (
    <div className="mb-4">
      <AutoConfirmBadge
        candidateId={candidateId}
        tier={tier}
        isHidden={isHidden}
        autoConfirmedAt={autoConfirmedAt}
      />
    </div>
  );
}
