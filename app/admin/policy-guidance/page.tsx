import { PolicyGuidanceEditor } from '@/components/admin/PolicyGuidanceEditor';
export default function Page() {
  return <div className="max-w-4xl"><h1 className="text-2xl font-bold mb-4">정책 원문·해설 검수</h1>
    <p className="mb-6">해당 사업의 지역·연도·회차와 원문을 대조한 뒤 설명을 승인하세요. 자동 생성은 초안만 만듭니다.</p>
    <PolicyGuidanceEditor /></div>;
}
