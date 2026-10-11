import Link from "next/link";

// A sortable column header for light tables. The active column is dark with
// an arrow; the others show their arrow on hover.
export function SortLink({
  label,
  active,
  dir,
  href,
}: {
  label: string;
  active: boolean;
  dir: "asc" | "desc";
  href: string;
}) {
  return (
    <Link
      href={href}
      aria-label={`Sort by ${label}`}
      className={`group inline-flex items-center gap-1 transition-colors hover:text-ink ${active ? "text-ink" : ""}`}
    >
      {label}
      <span aria-hidden className={active ? "" : "opacity-0 group-hover:opacity-40"}>
        {active && dir === "asc" ? "↑" : "↓"}
      </span>
    </Link>
  );
}
