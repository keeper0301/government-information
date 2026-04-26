import type { Metadata } from "next";
import { TERMS_VERSION } from "@/lib/consent";

export const metadata: Metadata = {
  title: "이용약관 — 정책알리미",
};

export default function TermsPage() {
  return (
    <main className="pt-28 pb-20 max-w-content mx-auto px-10 max-md:px-6">
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
      </div>
    </main>
  );
}
