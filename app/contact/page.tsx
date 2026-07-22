import type { Metadata } from "next";
import Link from "next/link";
import { ContactForm } from "./contact-form";

export const metadata: Metadata = {
  title: "문의하기 — 정책알리미",
  description:
    "정책알리미 서비스 문의, 정책 정보 정정 요청, 개인정보·광고·제휴 문의 접수 창구입니다.",
  alternates: { canonical: "/contact" },
  openGraph: {
    title: "문의하기 — 정책알리미",
    description: "정책 정보 정정 요청과 서비스 문의를 접수합니다.",
    type: "website",
  },
};

export const revalidate = 86400;

export default function ContactPage() {
  return (
    <main className="min-h-screen bg-grey-50 pt-[96px] pb-20">
      <div className="max-w-[760px] mx-auto px-5">
        <header className="mb-8">
          <p className="text-sm font-semibold text-blue-600 mb-2">Contact</p>
          <h1 className="text-[28px] md:text-[36px] font-extrabold text-grey-900 tracking-[-0.6px] mb-3">
            문의하기
          </h1>
          <p className="text-[15px] md:text-[17px] text-grey-700 leading-[1.7]">
            정책 정보 오류, 서비스 이용 문제, 개인정보·광고·제휴 문의를 한곳에서 접수합니다.
            정책 신청 가능 여부는 최종적으로 각 기관 공식 창구에서 확인해야 합니다.
          </p>
        </header>

        <section className="grid gap-4 md:grid-cols-3 mb-6">
          <InfoCard title="정책 정보 정정" text="마감일, 신청 조건, 원문 링크가 다르면 URL과 함께 알려 주세요." />
          <InfoCard title="서비스 이용 문의" text="로그인, 알림, 결제, 맞춤추천 사용 중 생긴 문제를 접수합니다." />
          <InfoCard title="운영·광고 문의" text="개인정보, 제휴, 광고, 데이터 출처 관련 문의를 확인합니다." />
        </section>

        <ContactForm />

        <section className="mt-8 rounded-2xl border border-grey-100 bg-white p-5 md:p-6 text-sm text-grey-700 leading-7">
          <h2 className="text-lg font-bold text-grey-900 mb-3">확인 기준</h2>
          <ul className="list-disc pl-5 space-y-2">
            <li>정책 정보는 정부24, 복지로, 기업마당, 지자체 공식 페이지 등 원문을 우선 확인합니다.</li>
            <li>오류 제보는 원문과 대조해 정정하며, 접수 내용만으로 지원 가능 여부를 확정하지 않습니다.</li>
            <li>개인정보 관련 요청은 본인 확인이 필요한 경우 추가 정보를 요청할 수 있습니다.</li>
            <li>
              이메일 직접 문의가 필요하면{" "}
              <a href="mailto:keeper0301@gmail.com" className="font-semibold text-blue-600 hover:underline">
                keeper0301@gmail.com
              </a>
              으로 보내 주세요.
            </li>
          </ul>
          <p className="mt-4 text-grey-600">
            운영자와 사업자 정보는{" "}
            <Link href="/about" className="font-semibold text-blue-600 hover:underline">서비스 소개</Link>,{" "}
            개인정보 처리 기준은{" "}
            <Link href="/privacy" className="font-semibold text-blue-600 hover:underline">개인정보처리방침</Link>에서 확인할 수 있습니다.
          </p>
        </section>
      </div>
    </main>
  );
}

function InfoCard({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-2xl border border-grey-100 bg-white p-4">
      <h2 className="text-[15px] font-bold text-grey-900 mb-2">{title}</h2>
      <p className="text-[13px] leading-6 text-grey-600">{text}</p>
    </div>
  );
}
