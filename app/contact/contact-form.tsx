"use client";

import { useState, type FormEvent } from "react";

type SubmitState =
  | { status: "idle" }
  | { status: "submitting" }
  | { status: "success"; ticketId: string }
  | { status: "error"; message: string };

function errorMessage(code: string | undefined) {
  switch (code) {
    case "contact_email_required_for_anonymous":
      return "비로그인 문의는 답변 받을 이메일이 필요합니다.";
    case "message_required":
      return "문의 내용을 입력해 주세요.";
    case "message_too_long":
      return "문의 내용은 1,000자 이내로 줄여 주세요.";
    case "subject_too_long":
      return "제목은 200자 이내로 줄여 주세요.";
    case "rate_limited":
      return "문의가 짧은 시간에 너무 많이 접수됐습니다. 잠시 후 다시 시도해 주세요.";
    default:
      return "문의 접수에 실패했습니다. 잠시 후 다시 시도하거나 이메일로 보내 주세요.";
  }
}

export function ContactForm() {
  const [state, setState] = useState<SubmitState>({ status: "idle" });

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    setState({ status: "submitting" });

    try {
      const res = await fetch("/api/support/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: String(formData.get("subject") ?? "").trim(),
          contact_email: String(formData.get("contact_email") ?? "").trim(),
          contact_phone: String(formData.get("contact_phone") ?? "").trim(),
          message: String(formData.get("message") ?? "").trim(),
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.ok) {
        setState({ status: "error", message: errorMessage(body.error) });
        return;
      }
      form.reset();
      setState({ status: "success", ticketId: body.ticket_id });
    } catch {
      setState({
        status: "error",
        message: "네트워크 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.",
      });
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 rounded-2xl border border-grey-200 bg-white p-5 md:p-6">
      <div>
        <label htmlFor="subject" className="block text-sm font-semibold text-grey-900 mb-1">
          문의 제목
        </label>
        <input
          id="subject"
          name="subject"
          maxLength={200}
          placeholder="예: 정책 정보 정정 요청"
          className="w-full rounded-xl border border-grey-200 px-3 py-2.5 text-sm outline-none focus:border-blue-400"
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label htmlFor="contact_email" className="block text-sm font-semibold text-grey-900 mb-1">
            답변 받을 이메일 <span className="text-red-500">*</span>
          </label>
          <input
            id="contact_email"
            name="contact_email"
            type="email"
            required
            placeholder="name@example.com"
            className="w-full rounded-xl border border-grey-200 px-3 py-2.5 text-sm outline-none focus:border-blue-400"
          />
        </div>
        <div>
          <label htmlFor="contact_phone" className="block text-sm font-semibold text-grey-900 mb-1">
            연락처 선택 입력
          </label>
          <input
            id="contact_phone"
            name="contact_phone"
            type="tel"
            placeholder="긴급한 정정 요청일 때만 입력"
            className="w-full rounded-xl border border-grey-200 px-3 py-2.5 text-sm outline-none focus:border-blue-400"
          />
        </div>
      </div>

      <div>
        <label htmlFor="message" className="block text-sm font-semibold text-grey-900 mb-1">
          문의 내용 <span className="text-red-500">*</span>
        </label>
        <textarea
          id="message"
          name="message"
          required
          maxLength={1000}
          rows={7}
          placeholder="문제가 있는 URL, 정책명, 확인한 공식 출처를 함께 적어 주시면 더 빠르게 확인할 수 있습니다."
          className="w-full rounded-xl border border-grey-200 px-3 py-2.5 text-sm leading-6 outline-none focus:border-blue-400"
        />
        <p className="mt-1 text-xs text-grey-500">정책 신청 가능 여부는 최종적으로 각 기관 공식 창구에서 확인해야 합니다.</p>
      </div>

      <button
        type="submit"
        disabled={state.status === "submitting"}
        className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-blue-600 px-5 text-sm font-bold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-grey-300"
      >
        {state.status === "submitting" ? "접수 중..." : "문의 접수하기"}
      </button>

      {state.status === "success" && (
        <p role="status" className="rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
          문의가 접수됐습니다. 접수번호는 {state.ticketId}입니다. 답변은 입력한 이메일로 안내합니다.
        </p>
      )}
      {state.status === "error" && (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          {state.message}
        </p>
      )}
    </form>
  );
}
