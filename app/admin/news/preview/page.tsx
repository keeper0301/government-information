import { redirect } from 'next/navigation';
import Link from 'next/link';
import { requireAdminUser } from '@/lib/admin-auth-server';
import { NewsPreviewForm } from './preview-form';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;
export const metadata = { title: '정책뉴스 비공개 검사 | 키피오', robots: { index: false, follow: false } };

export default async function NewsPreviewPage() {
  if (!await requireAdminUser()) redirect('/login?next=/admin/news/preview');
  return <div className="mx-auto max-w-4xl space-y-6">
    <Link href="/admin/news" className="text-sm text-blue-600">← 정책뉴스 운영으로 돌아가기</Link>
    <h1 className="text-2xl font-bold">정책뉴스 비공개 검사</h1>
    <p>운영 서버의 최신 작성 기준으로 새 초안을 만들고 공식 원문과 비교합니다. 이 화면에서 작성한 글은 공개되지 않습니다.</p>
    <NewsPreviewForm />
  </div>;
}
