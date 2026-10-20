// 제목에서 범위를 확정하지 못한 경우에만, 주제와 원문의 장소·대상 근거를 함께 확인합니다.
// 기자의 거주지·사진 촬영지·기관 소재지는 정책의 적용 지역으로 사용하지 않습니다.
const RULES: { topic: RegExp; evidence: RegExp; regions: string[] }[] = [
  { topic: /한복문화주간/, evidence: /공모로 선정된 기획프로그램도 전국 곳곳에서 만나볼 수 있다/, regions: ['nationwide'] },
  { topic: /수도권.*(?:주택|착공|청약|입주|모집)/, evidence: /[^.。\n]*수도권에서[^.。\n]*주택[^.。\n]*모집[^.。\n]*/, regions: ['seoul', 'incheon', 'gyeonggi'] },
  { topic: /궁중문화축전/, evidence: /4대 궁\(경복궁·창덕궁·덕수궁·창경궁\)과 종묘에서[^.。\n]*/, regions: ['seoul'] },
  { topic: /한글.*(?:박물관|전시)/, evidence: /대한민국역사박물관 3층 주제관에서[^.。\n]*/, regions: ['seoul'] },
  { topic: /코리안\s*페스티벌/, evidence: /송도 센트럴파크 잔디광장에서 열린[^.。\n]*/, regions: ['incheon'] },
  { topic: /돌봄의 디자인/, evidence: /문화역서울284에서 개최[^.。\n]*/, regions: ['seoul'] },
  { topic: /농촌.*여행/, evidence: /전국 11개 광역[^.。\n]*시범 운영[^.。\n]*/, regions: ['nationwide'] },
  { topic: /접종/, evidence: /전국 위탁의료기관 및 보건소에서 무료로 예방접종을 받을 수 있으며[^.。\n]*/, regions: ['nationwide'] },
];

export function findNewsRegionEvidence(title: string, sourceBody: string) {
  for (const rule of RULES) {
    if (!rule.topic.test(title)) continue;
    const quote = sourceBody.match(rule.evidence)?.[0]?.trim();
    if (quote) return { regions: rule.regions, regionEvidence: quote };
  }
  return null;
}
