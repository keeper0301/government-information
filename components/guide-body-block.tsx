// 승인 본문의 주소는 연결하고, 나머지 문자는 그대로 표시합니다.
function linkedText(text: string) {
  return text.split(/(https?:\/\/[^\s)]+)/g).map((part, index) =>
    /^https?:\/\//.test(part)
      ? <a key={index} href={part} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline break-all">{part}</a>
      : <span key={index}>{part}</span>);
}

export function GuideBodyBlock({ text }: { text: string }) {
  const lines = text.split("\n");
  // 승인 자료에 있는 표만 문서의 표 요소로 옮깁니다. 외부 태그는 해석하지 않습니다.
  if (lines.length >= 3 && lines.every(line => line.trim().startsWith("|"))
    && /^\|\s*:?-+:?\s*(\|\s*:?-+:?\s*)+\|$/.test(lines[1].trim())) {
    const rows = lines.filter((_, index) => index !== 1)
      .map(line => line.trim().slice(1, -1).split("|").map(cell => cell.trim()));
    return <div className="mb-4 overflow-x-auto">
      <table className="w-full border-collapse text-sm leading-relaxed">
        <thead><tr>{rows[0].map((cell, index) => <th key={index} scope="col" className="border border-gray-200 bg-gray-50 p-3 text-left break-words">{linkedText(cell)}</th>)}</tr></thead>
        <tbody>{rows.slice(1).map((row, index) => <tr key={index}>{row.map((cell, column) =>
          <td key={column} className="border border-gray-200 p-3 align-top break-words">{linkedText(cell)}</td>)}</tr>)}</tbody>
      </table>
    </div>;
  }
  if (lines.every(line => line.startsWith("> "))) return <blockquote className="mb-4 border-l-4 border-blue-200 pl-4 leading-relaxed">
    {linkedText(lines.map(line => line.slice(2)).join("\n"))}
  </blockquote>;
  return <p className="mb-4 leading-relaxed whitespace-pre-line">{linkedText(text)}</p>;
}
