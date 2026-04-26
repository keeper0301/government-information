"use client";

import { useEffect, useRef, useState } from "react";

// 토스 풍 숫자 카운트업 — 0 → to 까지 부드럽게.
// Intersection Observer 로 viewport 진입 시 시작 (스크롤하다 만나는 순간).
// prefers-reduced-motion 환경에선 즉시 to 표시 (모션 감소 사용자 보호).
//
// 사용:
//   <CountUp to={23545} />           → 23,545
//   <CountUp to={12} suffix="건" />  → 12건

type Props = {
  to: number;
  durationMs?: number;
  suffix?: string;
};

// easeOutQuart — 빠르게 시작해서 천천히 멈춤 (자연스러운 카운트업)
function easeOutQuart(t: number): number {
  return 1 - Math.pow(1 - t, 4);
}

export function CountUp({ to, durationMs = 1400, suffix = "" }: Props) {
  const [n, setN] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    // 모션 감소 환경 → 즉시 결과 표시.
    // setState 동기 호출은 effect cascading render 룰 위반이라 micro-task 로 schedule.
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (mediaQuery.matches) {
      queueMicrotask(() => setN(to));
      return;
    }

    if (!ref.current) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting || startedRef.current) return;
        startedRef.current = true;
        const start = performance.now();
        const animate = (t: number) => {
          const p = Math.min((t - start) / durationMs, 1);
          setN(Math.floor(easeOutQuart(p) * to));
          if (p < 1) requestAnimationFrame(animate);
          else setN(to); // 마지막 값 정확히 도달
        };
        requestAnimationFrame(animate);
        obs.disconnect();
      },
      { threshold: 0.3 },
    );
    obs.observe(ref.current);
    return () => obs.disconnect();
  }, [to, durationMs]);

  return (
    <span ref={ref} className="tabular-nums">
      {n.toLocaleString()}
      {suffix}
    </span>
  );
}
