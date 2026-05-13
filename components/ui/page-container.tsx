// ============================================================
// PageContainer — 페이지·섹션 공통 컨테이너 (반응형 padding 단계화)
// ============================================================
// 발견 배경 (2026-05-14): nav 반응형 5 commits + ~50 파일 padding 단계화
// (px-5/6 lg:px-10) 패턴이 코드 전역에 반복. 추상화 안 한 부채 →
// 미래 회귀 위험 (예: 폴드7·태블릿 누락) + sed 변환 시 변종 패턴 사고.
//
// 사용처:
// - `<PageContainer>` — page main 컨테이너 (max-w-content + pt-[80px] pb-20)
// - `<PageContainer as="section" maxW="content" padding="loose">` — section
// - `<PageContainer maxW="640">` — 폼 페이지 (좁은 폭)
//
// 정책:
// - mobile/태블릿/폴드7 메인 (< lg=1024) : px-6 (또는 padding=tight 시 px-5)
// - desktop (lg+) : px-10
// - padding="loose" : pt/pb 도 lg+ 단계 증가
//
// max-w 옵션:
// - "content" (1140px, 기본)
// - "920" / "760" / "640" / "560" / "400" — 폼·상세·인쇄 등 좁은 폭
// - "full" — 풀폭
// ============================================================

import type { ComponentPropsWithoutRef, ElementType, ReactNode } from "react";

type MaxWidth = "content" | "920" | "760" | "640" | "560" | "400" | "full";
type Padding = "tight" | "default" | "loose" | "header";
// - tight: px-5 lg:px-10 (form 페이지, 좁은 본문)
// - default: px-6 lg:px-10 (대부분 section·main)
// - loose: px-6 lg:px-10 + py-12 lg:py-20 (홈 큰 섹션)
// - header: px-6 lg:px-10 + pt-28 pb-20 lg:pt-32 (페이지 main with header offset)

const MAX_W_MAP: Record<MaxWidth, string> = {
  content: "max-w-content",
  "920": "max-w-[920px]",
  "760": "max-w-[760px]",
  "640": "max-w-[640px]",
  "560": "max-w-[560px]",
  "400": "max-w-[400px]",
  full: "",
};

const PADDING_MAP: Record<Padding, string> = {
  tight: "px-5 lg:px-10",
  default: "px-6 lg:px-10",
  loose: "px-6 lg:px-10 py-12 lg:py-20",
  header: "px-6 lg:px-10 pt-24 lg:pt-28 pb-20",
};

// polymorphic — `as` 로 element type 지정 시 해당 element props (e.g. <a href>) 도
// type-safe 하게 받음 (codex P2 fix).
type OwnProps = {
  maxW?: MaxWidth;
  padding?: Padding;
  className?: string;
  children: ReactNode;
};

type Props<C extends ElementType> = OwnProps & {
  as?: C;
} & Omit<ComponentPropsWithoutRef<C>, keyof OwnProps | "as">;

export function PageContainer<C extends ElementType = "div">({
  as,
  maxW = "content",
  padding = "default",
  className = "",
  children,
  ...rest
}: Props<C>) {
  const Component = (as ?? "div") as ElementType;
  const cls = [
    MAX_W_MAP[maxW],
    maxW === "full" ? "" : "mx-auto",
    PADDING_MAP[padding],
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <Component className={cls} {...rest}>
      {children}
    </Component>
  );
}
