export function ageMinutes(iso: string | null, now = Date.now()) {
  if (!iso) return null;
  const time = Date.parse(iso);
  return Number.isNaN(time) ? null : Math.max(0, Math.round((now - time) / 60000));
}

export function formatAge(minutes: number | null) {
  if (minutes === null) return "age unknown";
  if (minutes < 60) return `${minutes} min`;
  if (minutes < 48 * 60) return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
  return `${Math.floor(minutes / 1440)} days`;
}

// Short form for tight spaces such as the departures board: "45m", "3h 12m", "4d".
export function formatAgeShort(minutes: number | null) {
  if (minutes === null) return "?";
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 48 * 60) return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
  return `${Math.floor(minutes / 1440)}d`;
}

export function formatDateTime(iso: string | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatPlace(job: { city: string | null; country: string | null; work_mode: string | null }) {
  return [[job.city, job.country].filter(Boolean).join(", "), job.work_mode].filter(Boolean).join(" · ");
}

// "Today", "Yesterday", or "Fri 10 Oct", for grouping by day.
export function dayLabel(iso: string, now = new Date()) {
  const date = new Date(iso);
  const key = (value: Date) => value.toDateString();
  if (key(date) === key(now)) return "Today";
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (key(date) === key(yesterday)) return "Yesterday";
  return date.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

// "21:41", local time.
export const timeOf = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

// The first line of a Markdown text as plain words, for one-line previews.
export function firstLine(markdown: string, max = 170) {
  const line = markdown
    .split("\n")
    .map((part) => part.replace(/[*_`#>|]/g, "").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").trim())
    .find((part) => part && !/^-+$/.test(part)) ?? "";
  return line.length > max ? `${line.slice(0, max - 1).trimEnd()}…` : line;
}
