"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Today", hint: "jobs waiting" },
  { href: "/questions", label: "Questions", hint: "questions for you", urgent: true },
  { href: "/board", label: "Board", hint: "in progress" },
  { href: "/assistant", label: "Assistant" },
  { href: "/profile", label: "Profile" },
  { href: "/cvs", label: "CVs" },
  { href: "/activity", label: "Activity" },
  { href: "/settings", label: "Settings" },
];

// Top bar styled like an airport direction sign: signal yellow, black type,
// the logo on a black end panel, counts as gate-number badges.
export function Nav({ counts, running }: { counts: Record<string, number>; running: string | null }) {
  const pathname = usePathname();

  return (
    <header className="border-b-2 border-primary bg-saffron text-on-saffron">
      <nav className="flex h-14 items-stretch overflow-x-auto" aria-label="Main">
        <Link href="/" className="flex shrink-0 items-center gap-2.5 bg-primary px-5 text-on-primary">
          <span className="grid size-7 place-items-center rounded-sm bg-saffron font-display text-lg font-bold text-on-saffron" aria-hidden>
            J
          </span>
          <span className="font-display text-2xl font-semibold tracking-wider uppercase">Jobflow</span>
        </Link>

        <ul className="flex items-stretch px-2">
          {LINKS.map((link) => {
            const active = link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
            const count = counts[link.href] ?? 0;
            return (
              <li key={link.href} className="flex">
                <Link
                  href={link.href}
                  aria-current={active ? "page" : undefined}
                  className={`my-2 flex items-center gap-2 rounded-sm px-3 font-display text-lg font-semibold tracking-wider whitespace-nowrap uppercase transition-colors ${
                    active ? "bg-primary text-primary-accent" : "hover:bg-on-saffron/10"
                  }`}
                >
                  {link.label}
                  {count > 0 && (
                    <span
                      title={`${count} ${link.hint ?? ""}`}
                      className={`grid min-w-6 place-items-center rounded-sm px-1 font-mono text-xs font-medium ${
                        active ? "bg-saffron text-on-saffron" : link.urgent ? "fresh-dot bg-primary text-primary-accent" : "bg-primary text-on-primary"
                      }`}
                    >
                      {count}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>

        <div className="ml-auto flex shrink-0 items-center pr-5 pl-3">
          {running ? (
            <Link
              href="/activity"
              className="flex items-center gap-2 rounded-sm bg-primary px-3 py-1.5 font-mono text-xs whitespace-nowrap text-on-primary"
            >
              <span className="fresh-dot size-2 rounded-full bg-saffron" aria-hidden />
              {running}
            </Link>
          ) : (
            <span className="font-mono text-xs whitespace-nowrap text-on-saffron/80">All quiet</span>
          )}
        </div>
      </nav>
    </header>
  );
}
