"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { hashToTab, normalizeTab, type MypageTab } from "./anchor-utils";

// MypageTabs — 마이페이지 상단 탭 셸
// - 서버 컴포넌트가 페칭한 데이터를 children 으로 받아 탭별 컨텐츠로 분배
// - URL ?tab=... 쿼리로 상태 유지 (새로고침·딥링크 안전)
// - legacy #consents 앵커는 마운트 시 1회 감지해서 ?tab=consents 로 자동 변환
//   (기존 외부 링크 호환 — spec 2-2 절)
//
// 2026-04-29 Phase 5 A3: referral 탭 추가 (3 탭 → 4 탭 — 추천 코드 발급/공유/통계)
export function MypageTabs({
  profileSlot,
  consentsSlot,
  referralSlot,
  accountSlot,
}: {
  profileSlot: React.ReactNode;
  consentsSlot: React.ReactNode;
  referralSlot: React.ReactNode;
  accountSlot: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // URL ?tab= 값을 enum 에 맞춰 정규화 (없거나 무효하면 'profile')
  const current: MypageTab = normalizeTab(searchParams.get("tab"));

  // legacy #consents 등 hash anchor 호환 — 마운트 시 1회만 처리.
  // hash 가 유효한 탭으로 매핑되면 ?tab= 쿼리로 변환 + hash 제거.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const hash = window.location.hash;
    if (!hash) return;
    const fromHash = hashToTab(hash);
    if (fromHash && fromHash !== current) {
      const params = new URLSearchParams(searchParams.toString());
      params.set("tab", fromHash);
      // hash 도 같이 제거 (다시 anchor 가 트리거되지 않도록)
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // 마운트 시 1회

  // 탭 전환 시 ?tab= 만 갱신 (history.replace 로 뒤로가기 폭탄 방지)
  function handleChange(value: string) {
    const next = normalizeTab(value);
    const params = new URLSearchParams(searchParams.toString());
    if (next === "profile") {
      params.delete("tab"); // 기본 탭은 쿼리 비워서 깔끔하게
    } else {
      params.set("tab", next);
    }
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  return (
    <Tabs value={current} onValueChange={handleChange} className="w-full">
      {/* 4 탭 → 모바일 가독성 위해 grid-cols-4. 라벨은 짧게. */}
      <TabsList className="grid w-full grid-cols-4 mb-8 h-11">
        <TabsTrigger value="profile">프로필</TabsTrigger>
        <TabsTrigger value="consents">동의</TabsTrigger>
        <TabsTrigger value="referral">추천</TabsTrigger>
        <TabsTrigger value="account">계정</TabsTrigger>
      </TabsList>

      <TabsContent value="profile" className="focus-visible:outline-none">
        {profileSlot}
      </TabsContent>
      <TabsContent value="consents" className="focus-visible:outline-none">
        {consentsSlot}
      </TabsContent>
      <TabsContent value="referral" className="focus-visible:outline-none">
        {referralSlot}
      </TabsContent>
      <TabsContent value="account" className="focus-visible:outline-none">
        {accountSlot}
      </TabsContent>
    </Tabs>
  );
}
