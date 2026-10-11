// The same header on every screen: a small context line, the title, one
// sentence on what the screen is for, and the screen's main actions.
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: React.ReactNode;
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
      <div className="min-w-0">
        {eyebrow && <p className="font-mono text-xs tracking-[0.2em] text-slate uppercase">{eyebrow}</p>}
        <h1 className="page-title mt-1">{title}</h1>
        {description && <p className="mt-1.5 max-w-2xl text-sm text-slate">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}
