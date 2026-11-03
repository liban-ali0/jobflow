"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { LogoMark } from "./logo-mark";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Today", hint: "jobs waiting", daily: true },
  { href: "/jobs", label: "Jobs", hint: "every saved job by stage", daily: true },
  { href: "/questions", label: "Questions", hint: "questions for you", urgent: true, daily: true },
  { href: "/board", label: "Board", hint: "in progress", daily: true },
  // Shown only while there are offers.
  { href: "/offers", label: "Offers", hint: "offers side by side", whenCounted: true },
  { href: "/assistant", label: "Assistant" },
  { href: "/profile", label: "Profile" },
  { href: "/cvs", label: "CVs" },
  { href: "/activity", label: "Activity" },
  { href: "/stats", label: "Stats", hint: "what works" },
  { href: "/settings", label: "Settings" },
];

type NavLink = (typeof LINKS)[number];

function SearchForm({ id, className, autoFocus = false }: { id: string; className: string; autoFocus?: boolean }) {
  return (
    <form action="/search" role="search" className="relative flex items-center">
      <label className="sr-only" htmlFor={id}>
        Search all jobs
      </label>
      <input id={id} name="q" type="search" placeholder="Search jobs…" autoFocus={autoFocus} className={className} />
    </form>
  );
}

// Top bar styled like an airport direction sign: signal yellow, black type,
// the logo on a black end panel, counts as gate-number badges. On a phone it
// keeps the four daily screens and puts the rest, and search, under "More".
export function Nav({ counts, running }: { counts: Record<string, number>; running: string | null }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  // The menu closes when the page changes (adjusted while rendering).
  const [shownFor, setShownFor] = useState(pathname);
  if (shownFor !== pathname) {
    setShownFor(pathname);
    setOpen(false);
  }
  const moreButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      moreButton.current?.focus();
    };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [open]);

  const isActive = (link: NavLink) => (link.href === "/" ? pathname === "/" : pathname.startsWith(link.href));
  const tab = (link: NavLink, compact = false) => {
    const active = isActive(link);
    const count = counts[link.href] ?? 0;
    return (
      <li key={link.href} className="flex">
        <Link
          href={link.href}
          aria-current={active ? "page" : undefined}
          className={`my-2 flex items-center rounded-sm font-display font-semibold whitespace-nowrap uppercase transition-colors ${
            compact ? "gap-1 px-1.5 text-[15px] tracking-wide" : "gap-2 px-3 text-lg tracking-wider"
          } ${active ? "bg-primary text-primary-accent" : "hover:bg-on-saffron/10"}`}
        >
          {link.label}
          {count > 0 && (
            <span
              title={`${count} ${link.hint ?? ""}`}
              className={`grid place-items-center rounded-sm px-1 font-mono font-medium ${compact ? "min-w-4 text-[11px]" : "min-w-6 text-xs"} ${
                active ? "bg-saffron text-on-saffron" : link.urgent ? "fresh-dot bg-primary text-primary-accent" : "bg-primary text-on-primary"
              }`}
            >
              {count}
            </span>
          )}
        </Link>
      </li>
    );
  };
  const links = LINKS.filter((link) => !("whenCounted" in link) || (counts[link.href] ?? 0) > 0);
  const others = links.filter((link) => !link.daily);

  return (
    <header className="border-b-2 border-primary bg-saffron text-on-saffron">
      {/* Wide screens: every screen in one bar. */}
      <nav className="hidden h-14 items-stretch overflow-x-auto md:flex" aria-label="Main">
        <Link href="/" className="flex shrink-0 items-center gap-2.5 bg-primary px-5 text-on-primary">
          <LogoMark className="size-8" />
          <span className="font-display text-2xl font-semibold tracking-wider uppercase">Offerbound</span>
        </Link>

        <ul className="flex items-stretch px-2">{links.map((link) => tab(link))}</ul>

        <div className="ml-auto flex shrink-0 items-center gap-3 pr-5 pl-3">
          {/* Search every job, whatever its stage. */}
          <SearchForm
            id="nav-search"
            className="w-36 rounded-sm border border-primary/30 bg-surface px-2.5 py-1 text-sm text-ink placeholder:text-slate focus:w-52 focus:outline-2 focus:outline-primary motion-safe:transition-[width]"
          />
          {running ? (
            <Link href="/activity" className="flex items-center gap-2 rounded-sm bg-primary px-3 py-1.5 font-mono text-xs whitespace-nowrap text-on-primary">
              <span className="fresh-dot size-2 rounded-full bg-saffron" aria-hidden />
              {running}
            </Link>
          ) : (
            <span className="font-mono text-xs whitespace-nowrap text-on-saffron/80">All quiet</span>
          )}
        </div>
      </nav>

      {/* Phones: the four daily screens, the rest under More. */}
      <nav className="flex h-12 items-stretch md:hidden" aria-label="Main">
        <Link href="/" className="flex shrink-0 items-center bg-primary px-2 text-on-primary" aria-label="Offerbound, Today">
          <LogoMark className="size-6" />
        </Link>
        <ul className="flex min-w-0 items-stretch overflow-x-auto px-0.5">{links.filter((link) => link.daily).map((link) => tab(link, true))}</ul>
        <div className="ml-auto flex shrink-0 items-center gap-1 pr-1.5">
          {running && (
            <Link href="/activity" className="grid size-8 place-items-center rounded-sm bg-primary" aria-label={`Running: ${running}`} title={running}>
              <span className="fresh-dot size-2 rounded-full bg-saffron" aria-hidden />
            </Link>
          )}
          <button
            ref={moreButton}
            type="button"
            aria-expanded={open}
            aria-controls="nav-more"
            onClick={() => setOpen((value) => !value)}
            className={`rounded-sm px-1.5 py-1 font-display text-[15px] font-semibold tracking-wide uppercase ${open || others.some(isActive) ? "bg-primary text-primary-accent" : "hover:bg-on-saffron/10"}`}
          >
            More
          </button>
        </div>
      </nav>
      {open && (
        <div id="nav-more" className="border-t border-primary/30 px-3 pt-3 pb-4 md:hidden">
          <SearchForm id="nav-search-phone" autoFocus className="w-full rounded-sm border border-primary/30 bg-surface px-3 py-2 text-base text-ink placeholder:text-slate focus:outline-2 focus:outline-primary" />
          <ul className="mt-3 grid grid-cols-2 gap-1.5">
            {others.map((link) => {
              const active = isActive(link);
              return (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    aria-current={active ? "page" : undefined}
                    className={`block rounded-sm px-3 py-2 font-display text-lg font-semibold tracking-wider uppercase ${active ? "bg-primary text-primary-accent" : "bg-on-saffron/10"}`}
                  >
                    {link.label}
                  </Link>
                </li>
              );
            })}
          </ul>
          <p className="mt-3 font-mono text-xs text-on-saffron/80">{running ? `Running: ${running}` : "All quiet"}</p>
        </div>
      )}
    </header>
  );
}
