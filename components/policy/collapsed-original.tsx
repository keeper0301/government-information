"use client";

import { useState } from "react";

export function CollapsedOriginal({ body }: { body: string }) {
  const [open, setOpen] = useState(false);
  if (!body) return null;

  return (
    <section className="mb-3 scroll-mb-28 rounded-2xl border border-grey-200 bg-white">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex min-h-12 w-full items-center justify-between px-5 text-left text-[15px] font-bold text-grey-900"
      >
        {open ? "원문 접기" : "원문 전체 보기"}
        <span aria-hidden="true" className="text-grey-500">{open ? "▴" : "▾"}</span>
      </button>
      <div className={open ? "px-5 pb-5 text-[15px] leading-[1.8] whitespace-pre-wrap text-grey-800" : "hidden"}>
        {body}
      </div>
    </section>
  );
}
