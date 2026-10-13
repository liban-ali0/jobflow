// The Offerbound mark: a split-flap tile from a departures board with a
// departure arrow. Drawn in the theme's colours (the files in
// public/brand use the default yellow and navy).
export function LogoMark({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      <rect width="64" height="64" rx="14" className="fill-saffron" />
      <path d="M0 32h64" className="stroke-on-saffron" strokeWidth="2.5" />
      <path d="M20 44 44 20M28 20h16v16" fill="none" className="stroke-on-saffron" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
