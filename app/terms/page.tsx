import type { Metadata } from "next";
import { TERMS_VERSION } from "@/lib/consent";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "이용약관 — 정책알리미",
};

export default function TermsPage() {
  return (
    <main className="pt-28 pb-20 max-w-content mx-auto px-6 lg:px-10">
      <h1 className="text-[28px] font-bold tracking-[-1px] text-grey-900 mb-2">이용약관</h1>
      <p className="text-[13px] text-grey-600 mb-8">
        시행일자: {TERMS_VERSION} · 운영자: 키피오 (사업자등록번호 657-24-02265 · 통신판매번호 2026-전남순천-7182)
      </p>
      <div className="text-[15px] text-grey-700 leading-[1.8] space-y-6">
        <section>
          <h2 className="text-[18px] font-bold text-grey-900 mb-3">제1조 (목적)</h2>
          <p>이 약관은 정책알리미(이하 &ldquo;서비스&rdquo;)의 이용에 관한 기본적인 사항을 규정합니다.</p>
        </section>
        <section>
          <h2 className="text-[18px] font-bold text-grey-900 mb-3">제2조 (서비스 내용)</h2>
          <p>서비스는 공공기관에서 제공하는 복지 정보 및 소상공인 대출·지원금 정보를 수집·정리하여 안내하는 것을 목적으로 합니다. 본 서비스에서 제공하는 정보는 참고용이며, 실제 신청은 각 기관의 공식 사이트에서 진행됩니다.</p>
        </section>
        <section>
          <h2 className="text-[18px] font-bold text-grey-900 mb-3">제3조 (데이터 출처)</h2>
          <p>서비스에서 제공하는 정보는 복지로, 소상공인24, 소상공인시장진흥공단, 금융위원회, 공공데이터포털, 온통청년 등 공공기관의 공개 데이터를 기반으로 합니다.</p>
        </section>
        <section>
          <h2 className="text-[18px] font-bold text-grey-900 mb-3">제4조 (면책)</h2>
          <p>서비스는 정보의 정확성을 위해 노력하지만, 공공기관 데이터의 변경 또는 오류로 인한 불일치에 대해 책임을 지지 않습니다. 중요한 결정을 내리기 전 반드시 해당 기관의 공식 사이트를 확인하시기 바랍니다.</p>
        </section>
        <section>
          <h2 className="text-[18px] font-bold text-grey-900 mb-3">제5조 (유료 서비스 및 정기결제)</h2>
          <p>① 서비스는 일부 기능에 대해 유료 구독 (베이직 월 4,900원, 프로 월 9,900원) 을 제공합니다. 모든 유료 구독은 신용카드 정기결제 (월 단위 자동결제) 로 운영됩니다.</p>
          <p>② 회원이 유료 구독을 신청하면 토스페이먼츠를 통해 등록한 카드로 매월 같은 날 자동 결제됩니다. 최초 가입 시 7일 무료체험이 제공되며, 체험 종료 후 첫 결제가 진행됩니다.</p>
          <p>③ 회사는 결제 7일 전 회원에게 결제 예정 안내를 이메일로 발송할 의무가 있습니다.</p>
        </section>
        <section>
          <h2 className="text-[18px] font-bold text-grey-900 mb-3">제6조 (결제 취소 및 환불)</h2>
          <p>① 회원은 언제든지 마이페이지 → 결제·구독 메뉴에서 직접 구독을 취소할 수 있습니다. 취소 시 다음 결제일부터 자동결제가 중단되며, 현재 결제된 주기까지는 서비스를 그대로 이용할 수 있습니다.</p>
          <p>② 현재 결제된 주기 중 미사용 일수에 대한 일할 계산 환불은 디지털 콘텐츠 (정보 안내 서비스) 의 특성상 원칙적으로 제공되지 않습니다.</p>
          <p>③ 다만 다음 경우에는 결제 전액 환불이 가능합니다.</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>가. 회사의 귀책사유 (서비스 장애, 결제 오류 등) 로 서비스를 이용하지 못한 경우</li>
            <li>나. 결제 후 24시간 이내에 환불을 요청하고, 해당 기간 동안 회원이 유료 기능을 사용하지 않은 경우 (콘텐츠산업진흥법 시행령 제35조 청약철회 기준)</li>
          </ul>
          <p>④ 환불 신청은 이메일 (keeper0301@gmail.com) 로 접수하며, 영업일 기준 7일 이내에 처리됩니다. 환불 금액은 결제 시 사용한 카드로 환급됩니다.</p>
          <p>⑤ 회원이 약관을 위반하여 회사가 이용계약을 해지한 경우에는 환불이 제한될 수 있습니다.</p>
        </section>
        <section>
          <h2 className="text-[18px] font-bold text-grey-900 mb-3">제7조 (회원 탈퇴)</h2>
          <p>회원은 마이페이지에서 언제든지 탈퇴할 수 있습니다. 단, 유료 구독 중인 경우에는 구독 취소를 먼저 진행한 뒤 탈퇴해 주시기 바랍니다. 탈퇴 시 개인정보는 개인정보처리방침에 따라 처리됩니다.</p>
        </section>
      </div>
    </main>
  );
}
