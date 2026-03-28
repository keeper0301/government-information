const features = [
  {
    num: "01",
    title: "조건에 맞는\n혜택만 보여드려요",
    desc: "나이, 지역, 직업 정보를 입력하면 받을 수 있는 복지와 대출만 필터링합니다.",
  },
  {
    num: "02",
    title: "마감 전에\n이메일로 알려드려요",
    desc: "관심 있는 사업을 등록하면 신청 마감 7일 전에 이메일 알림을 보내드립니다.",
  },
  {
    num: "03",
    title: "모르는 건\n챗봇에게 물어보세요",
    desc: "자격 요건이 헷갈릴 때, 챗봇이 해당 프로그램 정보를 바탕으로 안내합니다.",
  },
];

export function FeatureGrid() {
  return (
    <div>
      <div className="mb-8">
        <h2 className="text-[22px] font-bold tracking-[-0.6px] text-grey-900">
          이렇게 도와드려요
        </h2>
      </div>
      <div className="grid grid-cols-3 gap-px bg-grey-200 rounded-2xl overflow-hidden max-md:grid-cols-1">
        {features.map((f) => (
          <div key={f.num} className="bg-white p-9 px-7">
            <div className="text-[13px] font-bold text-blue-500 mb-3.5">
              {f.num}
            </div>
            <div className="text-[17px] font-bold text-grey-900 tracking-[-0.4px] mb-2 leading-[1.4] whitespace-pre-line">
              {f.title}
            </div>
            <div className="text-sm text-grey-600 leading-[1.6]">{f.desc}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
