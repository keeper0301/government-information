import { expect, it } from 'vitest';
import { classifyEditorialNews } from '@/lib/news-publication/classification';

it.each([
  ['부산 동래온천지구, 전국 네 번째 온천도시 지정', ['문화'], ['busan']],
  ['공주 공산성에서 부여 왕릉원까지 백제 여행', ['문화'], ['chungnam']],
  ['다자녀 고속도로 할인…차량 1대·카드 1개 등록과 선불·후불 처리 차이', ['교통'], ['unclassified']],
  ['경주 가족 여행…천마총과 박물관', ['문화'], ['gyeongbuk']],
  ['장례 문화 특별전', ['문화'], ['unclassified']],
  ['전국체전 경기장 소개', ['기타'], ['unclassified']],
  ['세종대왕 한글 창제', ['문화'], ['unclassified']],
  ['고성군 관광 지원', ['문화'], ['unclassified']],
  ['서울특별시 주거 지원', ['주거'], ['seoul']],
  ['부산에서 열리는 문화 행사', ['문화'], ['busan']],
  ['전국 대상 장제급여 지원', ['장례'], ['nationwide']],
  ['서울 장례비 지원', ['장례'], ['seoul']],
  ['청년미래적금 신청', ['금융'], ['unclassified']],
  ['통합돌봄 토론회와 예산안', ['의료'], ['unclassified']],
  ['전세사기 최소보장제 시행 예정', ['주거'], ['unclassified']],
  ['법률 상담과 소송 지원', ['법률'], ['unclassified']],
  ['청와대 사랑채 전시…전북·강원 콘텐츠 추가', ['문화'], ['seoul']],
  ['해인사와 합천 함벽루…관람 포인트', ['문화'], ['gyeongnam']],
  ['서울숲 국악 공연', ['문화'], ['seoul']],
  ['부산국제록페스티벌 종료', ['문화'], ['busan']],
  ['수원화성문화제 종료', ['문화'], ['gyeonggi']],
  ['관광업 재취업 상담', ['취업'], ['unclassified']],
  ['돌봄의 디자인…개관과 휴관 안내', ['문화'], ['unclassified']],
  ['동물 입양 상담', ['기타'], ['unclassified']],
  ['대전시 교통 지원', ['교통'], ['daejeon']],
  ['건강보험 진료비 지원', ['의료'], ['unclassified']],
  ['고용보험 지원', ['취업'], ['unclassified']],
  ['광주 여행', ['문화'], ['unclassified']],
  ['광주광역시 여행', ['문화'], ['jeonnam-gwangju']],
  ['광주시 여행', ['문화'], ['gyeonggi']],
])('제목의 핵심 주제와 명확한 지역만 분류: %s', (title, benefits, regions) => {
  expect(classifyEditorialNews(title)).toEqual({ benefits, regions });
});
