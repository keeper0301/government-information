// AdSense in-feed 슬롯 — env 미설정 시 placeholder, 설정 시 진짜 광고.
//
// 환경변수 2종 (NEXT_PUBLIC_ 접두 → 빌드 타임 inline. 클라이언트 번들에 포함):
//   NEXT_PUBLIC_ADSENSE_ID         publisher ID, ca-pub-... (AdsenseLazyLoader 와 동일 변수 — 통일)
//   NEXT_PUBLIC_ADSENSE_SLOT_INFEED in-feed 슬롯 ID (사장님 외부 액션, AdSense 콘솔에서 발급)
//
// 동작 흐름:
//   1. AdsenseLazyLoader 가 사용자 상호작용 또는 10초 후 adsbygoogle.js 라이브러리 로드.
//      (자동광고 활성도 함께)
//   2. 본 컴포넌트 mount 시 window.adsbygoogle.push({}) 로 in-feed 슬롯 채움 요청.
//      라이브러리가 아직 안 로드돼도 push 큐에 쌓여 있다가 로드되는 즉시 처리.
//   3. env 둘 중 하나라도 없으면 placeholder div 만 렌더 — 개발/preview/AdSense 미승인 단계 안전.
//
// 사용처: 5개 위치 (홈·hub·eligibility·welfare·loan) in-feed 카드 그리드 사이.

"use client";
import { useEffect } from "react";

const PUBLISHER_ID = process.env.NEXT_PUBLIC_ADSENSE_ID;
const SLOT_INFEED = process.env.NEXT_PUBLIC_ADSENSE_SLOT_INFEED;

// adsbygoogle 전역 타입 — AdsenseLazyLoader 가 주입하는 큐 배열.
// any 회피 위해 최소 형태만 선언.
type AdsByGoogle = Array<Record<string, unknown>>;

interface AdSlotProps {
  /**
   * AdSense ad-format.
   * - "fluid": in-feed (콘텐츠 사이 자연스럽게 끼워짐, 권장)
   * - "auto":  responsive 일반 배너
   */
  format?: "fluid" | "auto";
}

export function AdSlot({ format = "fluid" }: AdSlotProps) {
  useEffect(() => {
    // env 미설정 시 push 안 함 (placeholder 분기에서 일찍 return 하지만 안전 보강)
    if (!PUBLISHER_ID || !SLOT_INFEED) return;
    if (typeof window === "undefined") return;

    try {
      const w = window as unknown as { adsbygoogle?: AdsByGoogle };
      w.adsbygoogle = w.adsbygoogle ?? [];
      w.adsbygoogle.push({});
    } catch (err) {
      // push 실패는 광고 노출에만 영향 (서비스 동작 무관) → warn 으로만 남김
      console.warn("[AdSlot] adsbygoogle.push 실패:", err);
    }
  }, []);

  // env 미설정 → placeholder (개발/preview 환경 + AdSense 미승인 단계 안전).
  // 시각적으로 "광고가 들어갈 자리" 만 알려주는 옅은 placeholder.
  if (!PUBLISHER_ID || !SLOT_INFEED) {
    return (
      <div className="max-w-content mx-auto px-10 max-md:px-6">
        <div className="border-t border-b border-grey-100 py-4 text-center text-xs text-grey-500">
          광고
        </div>
      </div>
    );
  }

  // 진짜 AdSense in-feed 슬롯 — adsbygoogle.js 가 ins 태그를 자동 채움.
  // display:block 은 AdSense 가 요구하는 필수 스타일.
  return (
    <div className="max-w-content mx-auto px-10 max-md:px-6 my-4">
      <ins
        className="adsbygoogle block"
        style={{ display: "block" }}
        data-ad-format={format}
        data-ad-client={PUBLISHER_ID}
        data-ad-slot={SLOT_INFEED}
      />
    </div>
  );
}
