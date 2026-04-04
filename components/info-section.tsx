export function InfoSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-6">
      <h2 className="text-[15px] font-bold text-grey-900 mb-3 flex items-center gap-2">
        {title}
      </h2>
      <div className="text-[15px] text-grey-700 leading-[1.7] whitespace-pre-line">
        {children}
      </div>
    </section>
  );
}
