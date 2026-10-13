import { GuideBodyBlock } from "@/components/guide-body-block";

export function GuideArticleBody({ posts, headings }: { posts: string[]; headings: string[] }) {
  return <div data-guide-body="true">{posts.map((post, index) => <section key={index} className="mb-8">
    {index > 0 && <h2 className="text-xl font-semibold mb-3 mt-8">{headings[index]}</h2>}
    {post.split(/\n\n+/).map((paragraph, number) =>
      <GuideBodyBlock key={number} text={paragraph} />)}
  </section>)}</div>;
}
