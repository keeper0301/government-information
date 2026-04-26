"use client";

import { useEffect, useRef, useState } from "react";

// Intersection Observer 기반 스크롤 fade-up.
// 토스 전략: "스크롤로 끝까지 읽게 만드는 장치 — 사람들이 스크롤하다가
// 새 영역 만나는 순간 자연스럽게 등장". viewport 진입 시 한 번만 활성화.
//
// prefers-reduced-motion 환경에선 즉시 보이게 (모션 감소 사용자 보호).
// 한 번 보이면 영구 유지 (재진입해도 다시 페이드 X — 산만함 방지).

type Props = {
  children: React.ReactNode;
  /** 진입 후 시작 지연 (ms). 0=즉시. 형제 섹션끼리 stagger 줄 때 사용. */
  delayMs?: number;
};

export function RevealOnScroll({ children, delayMs = 0 }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    // 모션 감소 환경 → 즉시 표시.
    // setState 동기 호출은 effect cascading render 룰 위반이라 micro-task 로 schedule.
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      queueMicrotask(() => setVisible(true));
      return;
    }
    if (!ref.current) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          obs.disconnect();
        }
      },
      // threshold 0.15 + rootMargin -40px → 화면에 살짝 들어왔을 때 trigger
      { threshold: 0.15, rootMargin: "0px 0px -40px 0px" },
    );
    obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`transition-all duration-700 ease-out ${
        visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3"
      }`}
      style={{ transitionDelay: `${delayMs}ms` }}
    >
      {children}
    </div>
  );
}
