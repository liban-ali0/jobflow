// A code in split-flap tiles, like a departures board destination.
export function Flap({ code, className = "text-lg" }: { code: string; className?: string }) {
  return (
    <span className={`flap ${className}`} aria-label={code}>
      {code.split("").map((letter, index) => (
        <span key={index} aria-hidden>
          {letter}
        </span>
      ))}
    </span>
  );
}
