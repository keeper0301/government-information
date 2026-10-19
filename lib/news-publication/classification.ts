import { DISTRICTS_BY_PROVINCE, PROVINCES, PROVINCE_CODE_TO_SHORT } from '@/lib/regions';
import { findNewsRegionEvidence } from './region-evidence';

// 본문의 방문 수단·사례·비유가 주제 분류로 번지는 것을 막습니다.
// 원문 대조를 마친 공개 제목만 사용하며, 불명확한 주제는 기타로 남깁니다.
const BENEFIT_RULES: [string, RegExp][] = [
  ['주거', /주거|주택|전세|월세|공공임대|재개발|재건축|청약/],
  ['의료', /의료|진료|건강검진|건강보험|예방접종|접종|백신|자살예방|통합돌봄|요양/],
  ['양육', /양육|보육|출산|아동수당|어린이집|유치원|산후조리/],
  ['교육', /교육|학자금|장학금|학습|진학|유치원|공동학위/],
  ['문화', /문화|관광|여행|공연|축제|페스티벌|특별전|(?:^|[^가-힣])전시|박물관|유적|왕릉|궁궐|국악|전통기술|한글|온천|관람|개관|다듬은 말|우리말/],
  ['취업', /취업|일자리|고용|구직|직업훈련|인턴/],
  ['창업', /창업|스타트업|벤처/],
  ['금융', /대출|금융|저축|적금|신용|보험|정책자금|보증료|신용보증/],
  ['생계', /생계|기초수급|생활비|긴급복지|재난지원금/],
  ['에너지', /에너지|전기요금|가스요금|난방비|유류비\s*지원|연료비\s*지원/],
  ['교통', /교통|통행료|하이패스|고속도로\s*할인|버스요금|철도요금/],
  // 역사 속 장례나 사망 언급은 장례 지원과 다릅니다.
  ['장례', /장례비|장제비|장제급여|장례\s*지원|공영장례/],
  ['법률', /법률\s*(상담|지원|구조)|무료\s*변호|소송\s*(지원|구조)/],
];

function mentionsPlace(title: string, name: string) {
  // 경기장·세종대왕·대전환처럼 지역 이름을 포함하는 다른 단어는 제외합니다.
  return new RegExp(`(^|[^가-힣])${name}(?=$|[^가-힣]|에서|에서는|의|에|은|는|과|와)`).test(title);
}

function classifyRegions(title: string) {
  // 전시 제목 뒤에 나오는 소개 대상 지역은 행사 장소와 구분합니다.
  title = title.split('…')[0];
  const regions = new Set<string>();
  const add = (code: string) => regions.add(['jeonnam', 'gwangju'].includes(code) ? 'jeonnam-gwangju' : code);
  const venues: [RegExp, string][] = [
    [/서울숲|광화문|덕수궁|청와대 사랑채|문화역서울284|성수동|서촌/, 'seoul'],
    [/부산국제록페스티벌|동래온천/, 'busan'],
    [/수원화성/, 'gyeonggi'],
  ];
  for (const [pattern, code] of venues) if (pattern.test(title)) add(code);
  for (const province of PROVINCES) {
    const short = PROVINCE_CODE_TO_SHORT[province.code];
    const ambiguous = PROVINCES.some(p => p.code !== province.code
      && DISTRICTS_BY_PROVINCE[p.code].some(d => d.replace(/[시군구]$/, '') === short));
    const shortCity = province.name.endsWith('시') && mentionsPlace(title, `${short}시`);
    if (mentionsPlace(title, province.name) || (!ambiguous && (mentionsPlace(title, short) || shortCity))) add(province.code);
  }
  // 정식 시군구명은 중복 지역을 제외합니다. 중구·고성군 등은 추측하지 않습니다.
  for (const province of PROVINCES) {
    for (const district of DISTRICTS_BY_PROVINCE[province.code]) {
      const owners = PROVINCES.filter(p => DISTRICTS_BY_PROVINCE[p.code].includes(district));
      if (owners.length === 1 && mentionsPlace(title, district)) add(province.code);
      // 여행 제목에서 흔한 공주·부여 등의 줄임말만 제한적으로 인정합니다.
      const short = district.slice(0, -1);
      const overlapsProvince = PROVINCES.some(p => p.code !== province.code && PROVINCE_CODE_TO_SHORT[p.code] === short);
      if (owners.length === 1 && !overlapsProvince && /여행|관광|왕릉|공산성|문화제|관람|해인사/.test(title)
        && /[시군]$/.test(district) && mentionsPlace(title, district.slice(0, -1))) add(province.code);
    }
  }
  // 순위·대회 이름의 '전국'은 대상 범위가 아닙니다. 지역이 없다는 이유로 전국을 붙이지 않습니다.
  if (/전국\s*(대상|시행|확대|도입)|전국민\s*(대상|지원)|전국\s*모든/.test(title)) regions.add('nationwide');
  return regions.size ? [...regions] : ['unclassified'];
}

export function classifyEditorialNews(title: string, sourceBody = '') {
  // 관광업 구직 안내의 혜택은 여행이 아니라 취업입니다.
  const subject = title.replace(/관광(?:업|산업|분야)/g, '').replace(/건강보험/g, '의료').replace(/고용보험/g, '고용');
  const benefits = BENEFIT_RULES.filter(([, rule]) => rule.test(subject)).map(([name]) => name);
  const regions = classifyRegions(title);
  const evidence = regions.includes('unclassified') ? findNewsRegionEvidence(title, sourceBody) : null;
  return { benefits: benefits.length ? benefits : ['기타'], regions, ...evidence };
}
