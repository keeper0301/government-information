"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { trackPolicyDetailEvent } from "@/lib/analytics/policy-detail-events";
import { loadDetailViewer } from "@/lib/policy/detail-viewer";

type Viewer = { loggedIn: boolean; matchCount: number | null };

export function DetailSignupCardView({
  audience,
  viewer,
  onFindMore,
}: {
  audience: "parent" | "self";
  viewer: Viewer;
  onFindMore?: () => void;
}) {
  if (viewer.loggedIn) {
    const countLabel = viewer.matchCount === null
      ? "내 조건에 맞는 지원"
      : `내 조건에 맞는 지원 ${viewer.matchCount.toLocaleString("ko-KR")}개`;
    return (
      <section className="mb-3 rounded-2xl border border-grey-200 bg-white p-5">
        <h2 className="text-[17px] font-bold tracking-[-0.3px] text-grey-900">{countLabel}</h2>
        {viewer.matchCount === null && (
          <p className="mt-2 text-[14px] leading-[1.6] text-grey-600">
            지역·나이를 고르면 개수를 보여드려요.
          </p>
        )}
        <Link
          href={viewer.matchCount === null ? "/quiz" : "/recommend"}
          className="mt-4 inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-grey-100 px-4 text-[15px] font-semibold text-grey-900 no-underline"
        >
          {viewer.matchCount === null ? "내 조건 고르기" : "맞춤 목록 보기"}
        </Link>
      </section>
    );
  }

  const title = audience === "self"
    ? "나도 받을 수 있는 지원, 또 있을지 몰라요"
    : "부모님이 받을 수 있는 지원, 또 있을지 몰라요";

  return (
    <section className="mb-3 rounded-2xl border border-grey-200 bg-white p-5">
      <h2 className="text-[17px] font-bold tracking-[-0.3px] text-grey-900">{title}</h2>
      <p className="mt-2 text-[14px] leading-[1.6] text-grey-600">
        지역·나이만 고르면 맞춤 목록과 변경 알림을 보내드려요.
      </p>
      <Link
        href="/quiz"
        onClick={onFindMore}
        className="mt-4 inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-grey-100 px-4 text-[15px] font-semibold text-grey-900 no-underline"
      >
        내 조건으로 더 찾기 (무료)
      </Link>
    </section>
  );
}

export function DetailSignupCard({
  audience,
  programId,
  programTable,
  sourcePage,
}: {
  audience: "parent" | "self";
  programId: string;
  programTable: "welfare_programs" | "loan_programs";
  sourcePage: string;
}) {
  const [viewer, setViewer] = useState<Viewer>({ loggedIn: false, matchCount: null });

  useEffect(() => {
    let cancelled = false;
    loadDetailViewer()
      .then((next) => {
        if (!cancelled) setViewer(next);
      })
      .catch(() => {
        // 익명 카드 유지. 개수를 지어내지 않는다.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <DetailSignupCardView
      audience={audience}
      viewer={viewer}
      onFindMore={() =>
        trackPolicyDetailEvent({
          eventType: "signup_from_detail",
          programId,
          programTable,
          sourcePage,
        })
      }
    />
  );
}
