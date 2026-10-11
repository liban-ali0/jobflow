import Link from "next/link";

// Page links under a table: "Showing 11–20 of 33", previous, page numbers,
// next. Long runs of pages collapse to the first, last, and nearby pages.
export function Pagination({
  page,
  pages,
  start,
  shown,
  total,
  href,
}: {
  page: number;
  pages: number;
  start: number;
  shown: number;
  total: number;
  href: (page: number) => string;
}) {
  if (total === 0) return null;
  const numbers = Array.from({ length: pages }, (_, index) => index + 1).filter(
    (number) => number === 1 || number === pages || Math.abs(number - page) <= 1,
  );

  const step = (target: number, label: string, rel: string) =>
    target < 1 || target > pages ? (
      <span className="btn btn-quiet pointer-events-none px-3 opacity-40" aria-disabled>
        {label}
      </span>
    ) : (
      <Link href={href(target)} rel={rel} className="btn btn-quiet px-3">
        {label}
      </Link>
    );

  return (
    <nav className="mt-3 flex flex-wrap items-center justify-between gap-3" aria-label="Pages">
      <p className="text-xs text-slate">
        Showing <span className="font-mono text-ink">{start + 1}–{start + shown}</span> of{" "}
        <span className="font-mono text-ink">{total}</span>
      </p>
      {pages > 1 && (
        <div className="flex items-center gap-1.5">
          {step(page - 1, "← Previous", "prev")}
          {numbers.map((number, index) => (
            <span key={number} className="flex items-center gap-1.5">
              {index > 0 && number - numbers[index - 1] > 1 && <span className="text-slate">…</span>}
              <Link
                href={href(number)}
                aria-current={number === page ? "page" : undefined}
                className={`grid min-h-9 min-w-9 place-items-center rounded-md border font-mono text-xs ${
                  number === page ? "border-primary bg-primary text-on-primary" : "border-field bg-surface hover:border-ink"
                }`}
              >
                {number}
              </Link>
            </span>
          ))}
          {step(page + 1, "Next →", "next")}
        </div>
      )}
    </nav>
  );
}
