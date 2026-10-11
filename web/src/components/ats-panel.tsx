"use client";

import { useState, useTransition } from "react";
import type { ActionResult } from "@/app/actions";
import { improveCv } from "@/app/ats-actions";
import type { AtsResult } from "@/lib/ats";

export type KeywordState = { state: "working" | "added" | "skipped" | "failed"; note?: string };

// "Fix with AI": the engine applies the fix list using only profile facts.
function ImproveButton({ target, running, blocked }: { target: string; running: boolean; blocked?: string }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const busy = running || pending;
  return (
    <div className="space-y-1">
      <button
        type="button"
        disabled={busy || Boolean(blocked)}
        title={blocked}
        onClick={() => start(async () => setResult(await improveCv(target)))}
        className="btn btn-primary w-full"
      >
        {busy ? (
          <>
            <span className="size-3 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />
            Improving with AI…
          </>
        ) : (
          "Fix with AI"
        )}
      </button>
      <p className="text-xs text-slate">
        {blocked ?? (running ? "Claude is applying the fixes. The CV reloads when it is done." : "Claude applies these fixes using only facts from your profile, and tells you what it left out.")}
      </p>
      {result && !result.ok && (
        <p role="status" className="text-xs text-coral">
          {result.message}
        </p>
      )}
    </div>
  );
}

const band = (score: number) => (score >= 75 ? "text-go" : score >= 60 ? "text-teal" : "text-coral");
const ring = (score: number) => (score >= 75 ? "var(--go)" : score >= 60 ? "var(--link)" : "var(--stop)");
const verdict = (score: number) => (score >= 75 ? "Strong" : score >= 60 ? "Fair" : "Weak");

// A small score for lists, like "ATS 72".
export function AtsBadge({ score }: { score: number }) {
  return (
    <span className={`rounded-full bg-mist px-2 py-0.5 font-mono text-[11px] font-semibold ${band(score)}`} title={`ATS score ${score} of 100 (${verdict(score)}), averaged over six ATS systems`}>
      ATS {score}
    </span>
  );
}

// The full check: the average and each of the six systems, the keywords the
// strictest one is missing, what to improve, and Jobflow's own checks.
export function AtsPanel({
  result,
  source,
  onKeyword,
  keywordState,
  improve,
  flat = false,
}: {
  result: AtsResult;
  source: string;
  // In the editor: "+" on a missing keyword, either straight into Skills or
  // worked into an experience bullet by the engine.
  // "confirm": the candidate says they have it (with where, if they said).
  onKeyword?: (term: string, how: "skills" | "weave" | "confirm", evidence?: string) => void;
  // Progress and outcome of keywords being worked in.
  keywordState?: Record<string, KeywordState>;
  // "Fix with AI" for this CV ("doc:<id>" or "base:<role>").
  improve?: { target: string; running: boolean; blocked?: string };
  // Inside another section: a tinted area instead of a second card.
  flat?: boolean;
}) {
  const [menu, setMenu] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [evidence, setEvidence] = useState("");
  const { score, systems, keywords, suggestions, checks } = result;
  const passing = systems.filter((system) => system.passes).length;
  const failing = checks.filter((check) => !check.ok);
  const isMust = (term: string) => keywords.must.includes(term.toLowerCase());

  return (
    <section className={`space-y-4 rounded-xl p-4 ${flat ? "bg-mist/50" : "card"}`} aria-label="ATS check">
      <div className="flex items-center gap-4">
        <div
          className="grid size-16 shrink-0 place-items-center rounded-full"
          style={{ background: `conic-gradient(${ring(score)} ${score * 3.6}deg, var(--line) 0deg)` }}
          aria-hidden
        >
          <div className="grid size-12 place-items-center rounded-full bg-surface font-display text-xl font-bold">{score}</div>
        </div>
        <div className="min-w-0">
          <h3 className="font-display text-base font-semibold tracking-wide uppercase">ATS score · {score}/100</h3>
          <p className={`text-sm font-medium ${band(score)}`}>
            {verdict(score)} · readable by {passing === systems.length ? "all" : `${passing} of`} {systems.length} systems
          </p>
          <p className="text-xs text-slate">
            {keywords.percent === null
              ? `How six ATS systems read it: ${result.systemsScore}. No keyword list to compare with yet.`
              : `Half how six ATS systems read it (${result.systemsScore}), half keyword match with ${source} (${keywords.percent}%).`}
          </p>
        </div>
      </div>

      {score < 100 ? (
        <div className="rounded-lg border border-line bg-mist/40 p-3">
          <p className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-sm font-semibold">What to fix</span>
            <span className="text-xs text-slate">{100 - score} points to 100 · biggest gain first</span>
          </p>
          <ol className="space-y-2.5">
            {result.fixes.map((fix) => (
              <li key={fix.label} className="flex gap-3">
                <span
                  className={`mt-0.5 h-fit shrink-0 rounded-md px-1.5 py-0.5 font-mono text-[11px] font-semibold ${
                    fix.kind === "choice" ? "bg-mist text-slate" : fix.points >= 1 ? "bg-teal-soft text-teal" : "bg-mist text-slate"
                  }`}
                >
                  {fix.points >= 1 ? `+${Math.round(fix.points)}` : fix.points > 0 ? "+<1" : "tip"}
                </span>
                <div className="min-w-0 text-sm">
                  <p className="font-medium">
                    {fix.label}
                    {fix.kind === "if-true" && <span className="ml-1.5 rounded-full bg-saffron-soft px-1.5 text-[10px] font-semibold text-ink uppercase">only if true</span>}
                    {fix.kind === "choice" && <span className="ml-1.5 rounded-full bg-mist px-1.5 text-[10px] font-semibold text-slate uppercase">your choice</span>}
                  </p>
                  {fix.detail && (
                    <p className="text-xs text-slate" dir="auto">
                      {fix.detail}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ol>
          {result.fixes.length === 0 && <p className="text-xs text-slate">Nothing specific left: the last points come from rounding across the six systems.</p>}
          {improve && result.fixes.some((fix) => fix.kind !== "choice") && (
            <div className="mt-3 border-t border-line pt-3">
              <ImproveButton {...improve} />
            </div>
          )}
        </div>
      ) : (
        <p className="rounded-lg bg-go-soft px-3 py-2 text-sm font-medium text-go">Nothing to fix: full marks.</p>
      )}

      <ul className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
        {systems.map((system) => (
          <li key={system.name} className="rounded-md border border-line px-2.5 py-1.5" title={`${system.vendor}: ${system.passes ? "passes" : "below"} its screening threshold`}>
            <div className="flex items-baseline justify-between gap-2">
              <span className="truncate text-xs font-medium">{system.name}</span>
              <span className={`font-mono text-sm font-semibold ${band(system.score)}`}>{system.score}</span>
            </div>
            <div className={`text-[11px] ${system.passes ? "text-go" : "text-coral"}`}>{system.passes ? "✓ passes" : "✗ filtered"}</div>
          </li>
        ))}
      </ul>

      {keywords.percent !== null && keywords.missing.length > 0 && (
        <div>
          <p className="mb-1 text-xs font-semibold text-slate">
            Missing keywords ({keywords.missing.length}) · {onKeyword ? "press + on the ones that are true for you" : "add only what is true for you"}
          </p>
          <ul className="flex flex-wrap gap-1">
            {keywords.missing.slice(0, 40).map((term) => {
              const state = keywordState?.[term];
              const working = state?.state === "working";
              return (
                <li
                  key={term}
                  className={`relative inline-flex items-center rounded-full text-xs ${isMust(term) ? "bg-coral-soft font-semibold text-coral" : "bg-mist text-ink"} ${onKeyword ? "pl-0.5" : "px-2 py-0.5"}`}
                  dir="auto"
                >
                  {onKeyword && (
                    <button
                      type="button"
                      disabled={working}
                      onClick={() => setMenu(menu === term ? null : term)}
                      aria-expanded={menu === term}
                      aria-haspopup="menu"
                      className="mr-0.5 grid size-6 place-items-center rounded-full text-sm font-bold hover:bg-teal hover:text-on-primary disabled:hover:bg-transparent"
                      aria-label={`Add ${term}`}
                      title="Add this keyword (only if true)"
                    >
                      {working ? <span className="size-3 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden /> : "+"}
                    </button>
                  )}
                  <span className={onKeyword ? "py-0.5 pr-2" : ""}>
                    {term}
                    {isMust(term) && " · must"}
                  </span>
                  {onKeyword && menu === term && (
                    <div role="menu" className="card absolute top-full left-0 z-30 mt-1 w-64 p-1 text-ink shadow-lg" onKeyDown={(event) => event.key === "Escape" && setMenu(null)}>
                      <button
                        type="button"
                        role="menuitem"
                        autoFocus
                        onClick={() => {
                          setMenu(null);
                          onKeyword(term, "skills");
                        }}
                        className="block w-full rounded px-3 py-2 text-left hover:bg-mist"
                      >
                        <span className="block text-sm font-medium">Add to Skills</span>
                        <span className="block text-xs font-normal text-slate">Instant. Best for tools and technologies.</span>
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setMenu(null);
                          onKeyword(term, "weave");
                        }}
                        className="block w-full rounded px-3 py-2 text-left hover:bg-mist"
                      >
                        <span className="block text-sm font-medium">Work it into my experience (AI)</span>
                        <span className="block text-xs font-normal text-slate">Rewrites the one bullet your profile backs. You see it before saving.</span>
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          {keywordState && Object.entries(keywordState).some(([, value]) => value.state !== "working" && value.note) && (
            <ul className="mt-2 space-y-1">
              {Object.entries(keywordState)
                .filter(([, value]) => value.state !== "working" && value.note)
                .map(([term, value]) => (
                  <li key={term} className={`text-xs ${value.state === "added" ? "text-go" : "text-slate"}`}>
                    <span className="font-semibold">{term}:</span> {value.note}
                    {value.state === "skipped" && onKeyword && confirming !== term && (
                      <button
                        type="button"
                        onClick={() => {
                          setConfirming(term);
                          setEvidence("");
                        }}
                        className="ml-1.5 font-semibold text-teal underline"
                      >
                        I have this, add it
                      </button>
                    )}
                    {confirming === term && (
                      <form
                        className="mt-1.5 space-y-1.5 rounded-md border border-line bg-surface p-2"
                        onSubmit={(event) => {
                          event.preventDefault();
                          setConfirming(null);
                          onKeyword?.(term, "confirm", evidence);
                        }}
                      >
                        <label className="block font-medium text-ink" htmlFor={`evidence-${term}`}>
                          Where did you use {term}? (optional, helps place it)
                        </label>
                        <input
                          id={`evidence-${term}`}
                          autoFocus
                          value={evidence}
                          maxLength={300}
                          onChange={(event) => setEvidence(event.target.value)}
                          placeholder="e.g. Azure Functions for a university project in 2023"
                          className="field py-1.5 text-xs"
                          dir="auto"
                        />
                        <p className="text-[11px] text-slate">It is saved to your facts, so later steps treat it as true.</p>
                        <div className="flex gap-1.5">
                          <button type="submit" className="btn btn-primary px-2.5 py-1 text-xs">
                            Add it
                          </button>
                          <button type="button" onClick={() => setConfirming(null)} className="btn btn-quiet px-2.5 py-1 text-xs">
                            Cancel
                          </button>
                        </div>
                      </form>
                    )}
                  </li>
                ))}
            </ul>
          )}
        </div>
      )}
      {keywords.matched.length > 0 && (
        <details>
          <summary className="cursor-pointer text-xs font-semibold text-slate">Found ({keywords.matched.length})</summary>
          <ul className="mt-1 flex flex-wrap gap-1">
            {keywords.matched.map((term) => (
              <li key={term} className="rounded-full bg-go-soft px-2 py-0.5 text-xs text-go" dir="auto">
                {term}
              </li>
            ))}
          </ul>
        </details>
      )}

      {suggestions.length > 0 && (
        <div>
          <p className="mb-1 text-xs font-semibold text-slate">Notes from the systems</p>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {suggestions.map((suggestion) => (
              <li key={suggestion}>{suggestion.charAt(0).toUpperCase() + suggestion.slice(1)}</li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <p className="mb-1 text-xs font-semibold text-slate">Jobflow checks {failing.length === 0 ? "· all pass" : `· ${failing.length} to fix`}</p>
        <ul className="space-y-1 text-sm">
          {checks.map((check) => (
            <li key={check.id} className="flex gap-2">
              <span aria-hidden className={check.ok ? "text-go" : "text-coral"}>
                {check.ok ? "✓" : "✗"}
              </span>
              <span>
                {check.label}
                {!check.ok && check.detail && <span className="block text-xs text-slate">{check.detail}</span>}
              </span>
            </li>
          ))}
        </ul>
      </div>
      <p className="text-[11px] text-slate">
        Scores by the open-source{" "}
        <a href="https://github.com/sunnypatell/ats-screener" target="_blank" rel="noreferrer" className="underline">
          ATS Screener
        </a>{" "}
        engine, which approximates how each system parses and filters; not the vendors&apos; own algorithms.
      </p>
    </section>
  );
}
