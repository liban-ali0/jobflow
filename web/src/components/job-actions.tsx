"use client";

import { SENT_STATUSES, type Status } from "@/lib/types";
import { useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { runStage, type ActionResult } from "@/app/actions";
import {
  addJobNote,
  askAboutJob,
  excludeJobs,
  markApplied,
  rankJobs,
  removeFromSelected,
  restoreJobs,
  selectJobs,
  archiveJobs,
  unarchiveJobs,
} from "@/app/job-actions";

export type JobSummary = { id: number; status: string; url: string | null; ranked: boolean; archived?: boolean };

// The reason form for "Not interested", used by the bulk bar, the row menu,
// and the job page.
export function ExcludeForm({
  onSubmit,
  onCancel,
  dark = false,
  pending = false,
}: {
  onSubmit: (reason: string, asRule: boolean) => void;
  onCancel: () => void;
  dark?: boolean;
  pending?: boolean;
}) {
  const [reason, setReason] = useState("");
  const [asRule, setAsRule] = useState(false);
  return (
    <form
      className="space-y-2"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(reason, asRule);
      }}
    >
      <label className="block text-xs font-medium">
        Why not? (optional)
        <input
          autoFocus
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="e.g. needs a driving licence"
          maxLength={300}
          className={`field mt-1 text-xs ${dark ? "border-board-control bg-board-row text-board-text" : ""}`}
        />
      </label>
      <label className="flex items-center gap-2 text-xs">
        <input type="checkbox" checked={asRule} disabled={!reason.trim()} onChange={(event) => setAsRule(event.target.checked)} className="size-4 accent-teal" />
        Also skip jobs like this when ranking
      </label>
      <div className="flex gap-2">
        <button type="submit" disabled={pending} className="btn btn-primary px-3 py-1 text-xs">
          {pending ? "Excluding…" : "Exclude"}
        </button>
        <button type="button" onClick={onCancel} className="btn btn-quiet px-3 py-1 text-xs">
          Cancel
        </button>
      </div>
    </form>
  );
}

function useRunner() {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const run = (action: () => Promise<ActionResult | void>, after?: () => void) =>
    startTransition(async () => {
      const outcome = await action();
      if (outcome) setResult(outcome);
      if (!outcome || outcome.ok) after?.();
    });
  return { pending, result, setResult, run };
}

// The "⋯" menu on each departures row.
export function RowMenu({ job }: { job: JobSummary }) {
  const [open, setOpen] = useState(false);
  const [panel, setPanel] = useState<"menu" | "note" | "exclude">("menu");
  const [note, setNote] = useState("");
  const { pending, result, setResult, run } = useRunner();
  const box = useRef<HTMLDivElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  // The menu is drawn above the whole page (not inside the board, which
  // clips it), next to the button, opening upwards near the bottom.
  const [place, setPlace] = useState<{ right: number; top?: number; bottom?: number } | null>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent) {
        if (event.key === "Escape") setOpen(false);
        return;
      }
      const target = event.target as Node;
      if (!box.current?.contains(target) && !menu.current?.contains(target)) setOpen(false);
    };
    const away = () => setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    window.addEventListener("resize", away);
    window.addEventListener("scroll", away, true);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
      window.removeEventListener("resize", away);
      window.removeEventListener("scroll", away, true);
    };
  }, [open]);

  const toggle = () => {
    const rect = box.current?.getBoundingClientRect();
    if (rect) {
      const right = window.innerWidth - rect.right;
      const roomBelow = window.innerHeight - rect.bottom;
      setPlace(roomBelow > 340 ? { right, top: rect.bottom + 4 } : { right, bottom: window.innerHeight - rect.top + 4 });
    }
    setOpen((value) => !value);
    setPanel("menu");
    setResult(null);
  };
  const item = "block w-full rounded px-3 py-1.5 text-left text-sm hover:bg-mist disabled:opacity-40";
  const excluded = job.status === "excluded";
  const selected = job.status === "selected";

  return (
    <div ref={box} className="relative inline-block text-left">
      <button
        type="button"
        onClick={toggle}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="More actions"
        className="btn btn-board min-h-8 px-2.5 py-1"
      >
        ⋯
      </button>
      {open &&
        place &&
        createPortal(
        <div ref={menu} role="menu" style={place} className="card fixed z-50 w-64 p-1.5 text-ink shadow-lg">
          {panel === "menu" && (
            <>
              {job.url && (
                <a href={job.url} target="_blank" rel="noreferrer" className={item} role="menuitem">
                  Open listing ↗
                </a>
              )}
              {selected ? (
                <button type="button" role="menuitem" className={item} disabled={pending} onClick={() => run(() => removeFromSelected([job.id]))}>
                  Remove from selected
                </button>
              ) : (
                job.status === "ranked" && (
                  <button type="button" role="menuitem" className={item} disabled={pending} onClick={() => run(() => selectJobs([job.id]))}>
                    Select for research
                  </button>
                )
              )}
              <button type="button" role="menuitem" className={item} disabled={pending} onClick={() => run(() => rankJobs([job.id]))}>
                {job.ranked || excluded ? "Re-rank this job" : "Rank this job"}
              </button>
              <button type="button" role="menuitem" className={item} disabled={pending} onClick={() => run(() => askAboutJob(job.id))}>
                Ask the Assistant about it
              </button>
              {/* Only before applying: later stages would lose their place. */}
              {!SENT_STATUSES.includes(job.status as Status) && (
                <button type="button" role="menuitem" className={item} disabled={pending} onClick={() => run(() => markApplied(job.id))}>
                  Mark as applied
                </button>
              )}
              <button type="button" role="menuitem" className={item} onClick={() => setPanel("note")}>
                Add a note…
              </button>
              <div className="my-1 border-t border-line" />
              {job.archived ? (
                <button type="button" role="menuitem" className={item} disabled={pending} onClick={() => run(() => unarchiveJobs([job.id]))}>
                  Bring back from the archive
                </button>
              ) : (
                !SENT_STATUSES.includes(job.status as Status) && (
                  <button type="button" role="menuitem" className={item} disabled={pending} onClick={() => run(() => archiveJobs([job.id]))}>
                    Archive
                  </button>
                )
              )}
              {excluded ? (
                <button type="button" role="menuitem" className={item} disabled={pending} onClick={() => run(() => restoreJobs([job.id]))}>
                  Restore
                </button>
              ) : (
                <button type="button" role="menuitem" className={`${item} text-coral`} onClick={() => setPanel("exclude")}>
                  Not interested…
                </button>
              )}
            </>
          )}
          {panel === "note" && (
            <form
              className="space-y-2 p-1.5"
              onSubmit={(event) => {
                event.preventDefault();
                run(() => addJobNote(job.id, note), () => setNote(""));
              }}
            >
              <label className="block text-xs font-medium">
                Note
                <textarea autoFocus rows={3} value={note} onChange={(event) => setNote(event.target.value)} className="field mt-1 text-xs" dir="auto" />
              </label>
              <div className="flex gap-2">
                <button type="submit" disabled={pending || !note.trim()} className="btn btn-primary px-3 py-1 text-xs">
                  Save note
                </button>
                <button type="button" onClick={() => setPanel("menu")} className="btn btn-quiet px-3 py-1 text-xs">
                  Back
                </button>
              </div>
            </form>
          )}
          {panel === "exclude" && (
            <div className="p-1.5">
              <ExcludeForm pending={pending} onSubmit={(reason, asRule) => run(() => excludeJobs([job.id], reason, asRule))} onCancel={() => setPanel("menu")} />
            </div>
          )}
          {result && (
            <p role="status" className={`px-3 pt-1.5 pb-1 text-xs ${result.ok ? "text-go" : "text-coral"}`}>
              {result.message}
            </p>
          )}
        </div>,
          document.body,
        )}
    </div>
  );
}

// The job page's actions: one primary button for the next step at this
// stage, then the other actions in the same quiet style.
export function JobActionBar({ job, hasResearch, working }: { job: JobSummary; hasResearch: boolean; working: boolean }) {
  const [excluding, setExcluding] = useState(false);
  const { pending, result, run } = useRunner();
  const excluded = job.status === "excluded";
  const selected = job.status === "selected";
  const applied = SENT_STATUSES.includes(job.status as Status);
  const busy = pending || working;
  const quiet = "btn btn-quiet px-3 py-1.5 text-xs";

  const primary = (() => {
    if (excluded) return { label: "Restore", act: () => run(() => restoreJobs([job.id])) };
    if (job.status === "found" && !job.ranked) return { label: "Rank this job", act: () => run(() => rankJobs([job.id])) };
    if (job.status === "ranked" || (job.status === "found" && job.ranked)) return { label: "Select for research", act: () => run(() => selectJobs([job.id])) };
    if (selected && !hasResearch) return { label: "Research this job", act: () => run(() => runStage("research-job", job.id)) };
    if (job.status === "researched" || (selected && hasResearch)) return { label: "Review documents", href: "#documents" };
    if (job.status === "ready") return { label: "Apply", href: "#apply" };
    return null;
  })();

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {primary &&
          (primary.href ? (
            <a href={primary.href} className="btn btn-primary">
              {primary.label}
            </a>
          ) : (
            <button type="button" className="btn btn-primary" disabled={busy} onClick={primary.act}>
              {pending && <span className="size-3 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />}
              {primary.label}
            </button>
          ))}
        {selected && (
          <button type="button" className={quiet} disabled={busy} onClick={() => run(() => removeFromSelected([job.id]))}>
            Remove from selected
          </button>
        )}
        {job.ranked && !applied && (
          <button type="button" className={quiet} disabled={busy} onClick={() => run(() => rankJobs([job.id]))}>
            Re-rank
          </button>
        )}
        <button type="button" className={quiet} disabled={busy} onClick={() => run(() => askAboutJob(job.id))}>
          Ask the Assistant
        </button>
        {!applied && !excluded && (
          <button type="button" className={quiet} disabled={busy} onClick={() => run(() => markApplied(job.id))}>
            Mark as applied
          </button>
        )}
        {job.url && (
          <a href={job.url} target="_blank" rel="noreferrer" className={quiet}>
            Open listing ↗
          </a>
        )}
        {!excluded && !applied && (
          <button type="button" className={`${quiet} text-coral`} disabled={busy} onClick={() => setExcluding(true)}>
            Not interested
          </button>
        )}
      </div>
      {excluding && (
        <div className="card max-w-md rounded-xl p-4">
          <ExcludeForm
            pending={pending}
            onSubmit={(reason, asRule) => run(() => excludeJobs([job.id], reason, asRule), () => setExcluding(false))}
            onCancel={() => setExcluding(false)}
          />
        </div>
      )}
      {result && (
        <p role="status" className={`text-sm ${result.ok ? "text-go" : "text-coral"}`}>
          {result.message}
        </p>
      )}
    </div>
  );
}
