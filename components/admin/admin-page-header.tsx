// components/admin/admin-page-header.tsx
// ============================================================
// 어드민 페이지 표준 헤더 슬롯 — kicker · title · description
// ============================================================
// 각 admin sub page 가 점진 마이그레이션 시 사용. 1차 plan 에서는
// 메인 대시보드 (/admin) 만 도입. 후속 plan 에서 다른 페이지로 확장.
// ============================================================

type Props = {
  kicker?: string;
  title: string;
  description?: string;
};

export function AdminPageHeader({
  kicker = "ADMIN",
  title,
  description,
}: Props) {
  return (
    <div className="mb-8">
      <p className="text-[12px] text-blue-500 font-bold tracking-[0.18em] mb-2 uppercase">
        {kicker}
      </p>
      <h1 className="text-[26px] md:text-[32px] font-extrabold tracking-[-0.04em] text-grey-900 mb-2">
        {title}
      </h1>
      {description && (
        <p className="text-[14px] md:text-[15px] text-grey-700 leading-[1.6] max-w-2xl">
          {description}
        </p>
      )}
    </div>
  );
}
