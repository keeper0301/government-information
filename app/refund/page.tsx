import type { Metadata } from "next";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "환불정책 — 정책알리미",
  description: "정책알리미 유료 구독의 해지, 자동결제, 환불 기준 안내.",
  alternates: { canonical: "/refund" },
};

export default function RefundPage() {
  return (
    <main className="pt-28 pb-20 max-w-content mx-auto px-6 lg:px-10">
      <h1 className="text-[28px] font-bold tracking-[-1px] text-grey-900 mb-2">환불정책</h1>
      <p className="text-[13px] text-grey-600 mb-8">
        시행일자: 2026-07-18 · 운영자: 키피오 (사업자등록번호 657-24-02265 · 통신판매번호 2026-전남순천-7182)
      </p>

      <div className="text-[15px] text-grey-700 leading-[1.8] space-y-7">
        <Section title="1. 적용 대상">
          <p>
            본 환불정책은 정책알리미의 베이직·프로 월 구독 상품에 적용됩니다. 무료 플랜에는 결제 및 환불이 발생하지 않습니다.
          </p>
        </Section>

        <Section title="2. 무료체험 및 자동결제">
          <ul className="list-disc pl-6 space-y-1">
            <li>유료 플랜 신청 시 7일 무료체험이 제공됩니다.</li>
            <li>무료체험 기간 중 해지하면 요금이 청구되지 않습니다.</li>
            <li>무료체험 종료 후 등록한 카드로 매월 같은 날 자동결제됩니다.</li>
            <li>카드 등록 전 자동결제 금액과 조건에 대한 명시 동의를 받습니다.</li>
          </ul>
        </Section>

        <Section title="3. 구독 해지">
          <ul className="list-disc pl-6 space-y-1">
            <li>회원은 언제든지 마이페이지 → 내 구독에서 직접 구독을 해지할 수 있습니다.</li>
            <li>해지 시 다음 결제일부터 자동결제가 중단됩니다.</li>
            <li>이미 결제된 이용 기간은 기간 종료일까지 계속 이용할 수 있습니다.</li>
          </ul>
        </Section>

        <Section title="4. 환불 가능 기준">
          <p>다음 경우에는 결제 전액 환불이 가능합니다.</p>
          <ul className="list-disc pl-6 mt-2 space-y-1">
            <li>서비스 장애, 결제 오류 등 회사의 귀책사유로 유료 기능을 이용하지 못한 경우</li>
            <li>결제 후 7일 이내에 환불을 요청했고, 해당 기간 동안 유료 기능 사용 이력이 없는 경우</li>
          </ul>
        </Section>

        <Section title="5. 환불 제한">
          <ul className="list-disc pl-6 space-y-1">
            <li>디지털 정보 안내 서비스의 특성상, 현재 결제 주기의 미사용 일수에 대한 일할 환불은 원칙적으로 제공하지 않습니다.</li>
            <li>결제 후 유료 기능을 사용하거나 맞춤형 유료 정보 제공이 시작된 경우에는 디지털 콘텐츠 제공 개시로 보아 청약철회가 제한될 수 있습니다.</li>
            <li>회원의 약관 위반으로 서비스 이용이 제한되거나 계약이 해지된 경우 환불이 제한될 수 있습니다.</li>
          </ul>
        </Section>

        <Section title="6. 환불 신청 및 처리">
          <ul className="list-disc pl-6 space-y-1">
            <li>
              환불 신청은 이메일{" "}
              <a href="mailto:keeper0301@gmail.com" className="text-blue-500 underline">keeper0301@gmail.com</a>
              {" "}으로 접수합니다.
            </li>
            <li>접수 시 가입 이메일, 결제일, 환불 요청 사유를 함께 알려주세요.</li>
            <li>환불은 영업일 기준 7일 이내 검토·처리하며, 결제 시 사용한 카드로 환급됩니다.</li>
          </ul>
        </Section>
      </div>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-[18px] font-bold text-grey-900 mb-3">{title}</h2>
      <div className="space-y-2">{children}</div>
    </section>
  );
}
