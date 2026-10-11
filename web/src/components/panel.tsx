// A section of a record page: a header strip with the title, an optional
// one-line hint and actions, then the content. The same look as Settings.
export function Panel({
  id,
  title,
  hint,
  actions,
  children,
  className = "",
}: {
  id?: string;
  title: string;
  hint?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section id={id} className={`card scroll-mt-32 overflow-hidden rounded-xl shadow-sm ${className}`}>
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-line/70 px-5 py-3.5">
        <div className="min-w-0">
          <h2 className="card-title">{title}</h2>
          {hint && <p className="mt-0.5 text-sm text-slate">{hint}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </header>
      <div className="px-5 py-4">{children}</div>
    </section>
  );
}
