import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "키피오 계정 삭제 요청",
  description: "키피오 앱 계정과 관련 데이터의 삭제를 요청하는 방법과 보관 기간을 안내합니다.",
};

export default function AccountDeletionPage() {
  const email = "keeper0301@gmail.com";
  const requestLink = `mailto:${email}?subject=${encodeURIComponent("키피오 계정 삭제 요청")}`;

  return (
    <main className="mx-auto max-w-2xl space-y-8 px-5 py-12 text-grey-900">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold">키피오 계정 삭제 요청</h1>
        <p>키피오: 지원금·복지정책 찾기 앱의 계정과 관련 데이터 삭제를 요청할 수 있습니다.</p>
      </header>
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">로그인할 수 있는 경우</h2>
        <ol className="list-decimal space-y-2 pl-6">
          <li><Link href="/mypage?tab=account" className="underline">마이페이지의 계정 탭</Link>을 엽니다.</li>
          <li>진행 중인 구독이 있다면 결제·구독 메뉴에서 먼저 취소합니다.</li>
          <li>계정 탭의 회원 탈퇴를 선택하고 화면 안내에 따라 요청합니다.</li>
        </ol>
        <p>탈퇴 요청 후 30일 동안은 다시 로그인해 계정을 복구하거나 즉시 영구 삭제할 수 있습니다. 복구하지 않으면 유예 기간이 지난 뒤 자동 삭제가 진행됩니다.</p>
      </section>
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">로그인할 수 없는 경우</h2>
        <p>가입한 이메일에서 삭제 요청을 보내 주세요. 로그인이 어렵거나 구독을 취소할 수 없는 경우도 이 주소로 문의할 수 있습니다. 비밀번호나 카드 정보는 보내지 마세요.</p>
        <a href={requestLink} className="inline-block rounded-lg border px-4 py-3 font-semibold underline">이메일로 계정 삭제 요청</a>
        <p className="text-sm">받는 주소 {email}</p>
      </section>
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">삭제 대상과 보관 기간</h2>
        <p>최종 삭제 대상에는 로그인 계정, 프로필, 관심 분야와 맞춤 추천 설정 등 계정에 연결된 정보가 포함됩니다.</p>
        <p>개인정보처리방침에 따라 보관이 필요한 경우 결제 기록은 5년, 접속 로그는 3개월, 알림 발송 이력은 탈퇴 후 30일, 동의 이력은 탈퇴 후 5년간 보관할 수 있습니다.</p>
        <Link href="/privacy" className="underline">개인정보처리방침 보기</Link>
      </section>
    </main>
  );
}
