import { ageMinutes, formatAge } from "@/lib/format";

// A posting loses value as it ages: the bar starts full and burns down to
// empty at the maximum age set in Settings.
export function Freshness({
  postedAt,
  maxHours,
  fastTrackMinutes,
}: {
  postedAt: string | null;
  maxHours: number;
  fastTrackMinutes: number;
}) {
  const minutes = ageMinutes(postedAt);
  const left = minutes === null ? 0 : Math.max(0, 1 - minutes / (maxHours * 60));
  const fresh = minutes !== null && minutes <= fastTrackMinutes;
  const expired = minutes !== null && left === 0;

  return (
    <div className="w-28 shrink-0">
      <div className="flex items-center gap-1.5 font-mono text-xs">
        {fresh && <span className="fresh-dot size-2 rounded-full bg-saffron" aria-hidden />}
        <span className={expired ? "text-coral" : fresh ? "font-medium text-ink" : "text-slate"}>
          {formatAge(minutes)}
        </span>
      </div>
      <div
        className="mt-1.5 h-1 overflow-hidden rounded-full bg-line"
        role="img"
        aria-label={minutes === null ? "Posting age unknown" : `Posted ${formatAge(minutes)} ago`}
      >
        <div
          className={`h-full rounded-full ${fresh ? "bg-saffron" : "bg-teal"}`}
          style={{ width: `${Math.round(left * 100)}%` }}
        />
      </div>
    </div>
  );
}
