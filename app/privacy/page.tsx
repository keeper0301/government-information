import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "개인정보처리방침 — 정책알리미",
};

export default function PrivacyPage() {
  return (
    <main className="pt-28 pb-20 max-w-content mx-auto px-10 max-md:px-6">
      <h1 className="text-[28px] font-bold tracking-[-1px] text-grey-900 mb-6">개인정보처리방침</h1>
      <div className="text-[15px] text-grey-700 leading-[1.8] space-y-6">
        <section>
          <h2 className="text-[18px] font-bold text-grey-900 mb-3">1. 수집하는 개인정보</h2>
          <p>서비스는 이메일 알림 등록 시 이메일 주소를 수집합니다. 로그인 시 Supabase Auth를 통해 이메일 주소가 수집됩니다.</p>
        </section>
        <section>
          <h2 className="text-[18px] font-bold text-grey-900 mb-3">2. 개인정보의 이용 목적</h2>
          <p>수집된 이메일 주소는 복지·대출 프로그램 신청 마감일 알림 발송 및 서비스 관련 안내에만 사용됩니다.</p>
        </section>
        <section>
          <h2 className="text-[18px] font-bold text-grey-900 mb-3">3. 개인정보의 보유 및 파기</h2>
          <p>알림 구독 해지 시 관련 개인정보는 즉시 삭제됩니다. 회원 탈퇴 시 모든 개인정보가 파기됩니다.</p>
        </section>
        <section>
          <h2 className="text-[18px] font-bold text-grey-900 mb-3">4. 개인정보의 제3자 제공</h2>
          <p>서비스는 수집된 개인정보를 제3자에게 제공하지 않습니다. 단, 이메일 발송을 위해 Resend 서비스를 이용합니다.</p>
        </section>
        <section>
          <h2 className="text-[18px] font-bold text-grey-900 mb-3">5. 문의</h2>
          <p>개인정보 관련 문의는 서비스 내 문의하기를 통해 접수할 수 있습니다.</p>
        </section>
      </div>
    </main>
  );
}
