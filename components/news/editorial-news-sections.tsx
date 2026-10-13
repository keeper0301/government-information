import type { EditorialNews } from '@/lib/editorial-news-data';

export function EditorialNewsSections({ article }: { article: EditorialNews }) {
  return article.sections.map(section => <section key={section.heading} className="mb-9">
    <h2 className="text-2xl font-bold mb-4">{section.heading}</h2>
    {section.paragraphs.map(paragraph => <p key={paragraph} className="text-grey-700 leading-[1.9] mb-4">{paragraph}</p>)}
    {/* 휴대전화에서도 질문이 잘리지 않도록 표 안에서만 가로로 이동할 수 있습니다. */}
    {section.table && <div className="overflow-x-auto rounded-xl border border-grey-200">
      <table className="w-full text-left text-sm leading-relaxed">
        <caption className="text-left font-bold p-4 bg-blue-50">{section.table.caption}</caption>
        <thead><tr>{section.table.columns.map(column => <th key={column} scope="col" className="p-4 border-b border-grey-200">{column}</th>)}</tr></thead>
        <tbody>{section.table.rows.map(row => <tr key={row[0]}>{row.map((cell, index) => index === 0
          ? <th key={index} scope="row" className="p-4 border-b border-grey-100 font-semibold">{cell}</th>
          : <td key={index} className="p-4 border-b border-grey-100 text-grey-700">{cell}</td>)}</tr>)}</tbody>
      </table>
    </div>}
  </section>);
}
