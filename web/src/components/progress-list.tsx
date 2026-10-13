import { formatDateTime } from "@/lib/format";
import type { ProgressLine } from "@/lib/types";

export function parseProgress(progress: string | null): ProgressLine[] {
  if (!progress) return [];
  try {
    return JSON.parse(progress) as ProgressLine[];
  } catch {
    return [];
  }
}

// What an engine did during a run, newest last.
export function ProgressList({ lines, live = false }: { lines: ProgressLine[]; live?: boolean }) {
  if (lines.length === 0) {
    return live ? <p className="text-sm text-slate">Starting…</p> : null;
  }
  return (
    <ol className="space-y-1 border-l-2 border-line pl-3 font-mono text-xs">
      {lines.map((line, index) => (
        <li key={index} className="flex gap-3">
          <span className="shrink-0 text-slate">{formatDateTime(line.at).split(", ").pop()}</span>
          <span className="min-w-0 break-words" dir="auto">
            {line.text}
          </span>
        </li>
      ))}
      {live && (
        <li className="flex items-center gap-2 text-slate">
          <span className="fresh-dot size-2 rounded-full bg-signal" aria-hidden />
          working
        </li>
      )}
    </ol>
  );
}
