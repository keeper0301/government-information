// 다른 생성 경로의 시험에서는 내용 판정을 고정합니다. 실제 보류 검사는 별도 시험에서 수행합니다.
export const contentDepthFixture = (count: number) => ({ missingFacts: [],
  sections: Object.fromEntries(Array.from({ length: count }, (_, sectionIndex) => [String(sectionIndex), { sectionIndex, paragraphIndex: 0,
    role: 'specific', reason: `본문 ${sectionIndex + 1}의 구체적 정보가 보존됐다는 모의 판정입니다.` }])),
});
