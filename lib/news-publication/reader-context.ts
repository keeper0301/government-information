import type { EditorialNews } from '@/lib/editorial-news-data';

// 공개 여부는 상세 화면에서 다시 검사합니다. 주제와 무관한 가이드는 연결하지 않습니다.
export function relatedNewsGuide(title: string): string {
  if (/정책자금|소상공인.*대출/.test(title)) return 'small-business-policy-fund-mistakes';
  if (/중복|동시.*지원/.test(title)) return 'policy-duplicate-benefit-limits';
  if (/어린이집|유치원/.test(title) && /신청|입소|입학/.test(title)) return 'documents-before-government-benefit';
  if (/통행료.*할인|고속도로.*할인|전세사기|통합돌봄/.test(title)) return 'policy-application-call-script';
  if (/입주자.*모집|주택.*모집|적금.*접수|지원.*신청/.test(title)) return 'deadline-policy-not-missing';
  return '';
}

// 원문에 실제 주소가 있는 경우에만 미리 확인한 공식 창구를 보충합니다.
export function officialNewsActions(title: string, sourceBody: string, checkedAt: string): NonNullable<EditorialNews['additionalSources']> {
  const actions = [
    { topic: /어린이집|유치원/, host: 'www.childinfo.go.kr', title: '유보통합포털에서 어린이집·유치원 신청 경로 확인', scope: '기관 검색과 신청 경로 안내입니다. 접수 가능 여부와 일정은 포털에서 다시 확인하세요.' },
    { topic: /통행료|하이패스|고속도로.*할인/, host: 'www.hipass.co.kr', title: '고속도로 통행료 누리집에서 할인 등록 방법 확인', scope: '할인 등록 창구입니다. 해당 차량과 가구의 적용 조건은 공식 안내를 확인하세요.' },
  ];
  return actions.filter(action => action.topic.test(title)
    && new RegExp(`(?<![a-z0-9.-])${action.host.replaceAll('.', '\\.')}(?=$|[^a-z0-9.-])`, 'i').test(sourceBody))
    .map(action => ({ title: action.title, url: `https://${action.host}/`, scope: action.scope, checkedAt }));
}
