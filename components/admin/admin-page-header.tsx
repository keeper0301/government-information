import type { ReactNode } from "react";

type Props = {
  kicker?: string;
  title: string;
  description?: string | ReactNode;
};

export function AdminPageHeader({
  kicker = "ADMIN",
  title,
  description,
}: Props) {
  const isString = typeof description === "string";

  return (
    <header className="mb-8">
      <p className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-blue-500">
        {kicker}
      </p>
      <h1 className="mb-2 text-[26px] font-extrabold tracking-[-0.03em] text-grey-900 md:text-[32px]">
        {title}
      </h1>
      {description &&
        (isString ? (
          <p className="max-w-3xl text-sm leading-[1.6] text-grey-700">
            {description}
          </p>
        ) : (
          <div className="max-w-3xl text-sm leading-[1.6] text-grey-700">
            {description}
          </div>
        ))}
    </header>
  );
}
