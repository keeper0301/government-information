// 본문의 공식 주소는 읽기 화면에서 바로 열 수 있도록 연결합니다.
function linkedText(text: string) {
  return text.split(/(https?:\/\/[^\s)]+)/g).map((part, index) =>
    /^https?:\/\//.test(part)
      ? <a key={index} href={part} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline break-all">{part}</a>
      : <span key={index}>{part}</span>);
}

export function GuideArticleBody({ posts, headings }: { posts: string[]; headings: string[] }) {
  return <div data-guide-body="true">{posts.map((post, index) => <section key={index} className="mb-8">
    {index > 0 && <h2 className="text-xl font-semibold mb-3 mt-8">{headings[index]}</h2>}
    {post.split(/\n\n+/).map((paragraph, number) =>
      <p key={number} className="mb-4 leading-relaxed whitespace-pre-line">{linkedText(paragraph)}</p>)}
  </section>)}</div>;
}
