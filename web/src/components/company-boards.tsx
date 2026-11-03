"use client";

import { useState, useTransition } from "react";
import {
  checkAllCompanies,
  checkCompany,
  confirmCompanyBoard,
  followCompanies,
  followFromJobs,
  setCompanyLink,
  setCompanyMaxDays,
  unfollowCompany,
} from "@/app/company-actions";
import type { FollowedCompany } from "@/lib/types";

const VENDORS: Record<string, string> = {
  greenhouse: "Greenhouse",
  lever: "Lever",
  ashby: "Ashby",
  workable: "Workable",
  smartrecruiters: "SmartRecruiters",
  recruitee: "Recruitee",
  workday: "Workday",
  oracle: "Oracle",
};

const STATE: Record<FollowedCompany["state"], { label: string; tone: string }> = {
  found: { label: "Board found", tone: "bg-teal-soft text-teal" },
  check: { label: "Check it", tone: "bg-saffron/20 text-ink" },
  none: { label: "No board found", tone: "bg-mist text-slate" },
  new: { label: "Not checked", tone: "bg-mist text-slate" },
};

// Settings → Sources → Companies you follow. It sits inside the settings
// form, so its fields have no names and each button saves at once.
export function CompanyBoards({ companies, maxDays, suggested, enabled }: { companies: FollowedCompany[]; maxDays: number; suggested: number; enabled: boolean }) {
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [days, setDays] = useState(String(maxDays));
  const [linkFor, setLinkFor] = useState<string | null>(null);
  const [link, setLink] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const run = (label: string, task: () => Promise<{ ok: boolean; message: string }>, after?: () => void) => {
    setBusy(label);
    start(async () => {
      const result = await task();
      setMessage({ ok: result.ok, text: result.message });
      if (result.ok) after?.();
      setBusy(null);
    });
  };
  const add = () => text.trim() && run("add", () => followCompanies(text), () => setText(""));
  const working = (label: string) => pending && busy === label;
  const found = companies.filter((company) => company.state === "found").length;

  return (
    <div className="border-t border-line/70 px-5 py-4 md:px-6" id="companies">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-medium">Companies you follow</p>
        <p className="text-sm text-slate">
          {companies.length ? `${companies.length} followed · ${found} with a board` : "None yet"}
          {!enabled && found > 0 && <span className="text-coral"> · turn on Company job boards above to collect from them</span>}
        </p>
      </div>
      <p className="mt-0.5 max-w-2xl text-sm text-slate">
        Offerbound finds where each company posts its jobs: from a board link you paste, from the company&rsquo;s website, or by trying its name on the common job boards. Collecting then reads those boards with every search, and keeps the jobs that fit your roles and countries. No AI, nothing to sign in to.
      </p>

      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-start">
        <textarea
          aria-label="Companies to follow"
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
              event.preventDefault();
              add();
            }
          }}
          rows={2}
          placeholder={"One per line, with the website if you know it:\nCareem careem.com"}
          className="field w-full sm:max-w-md"
          dir="auto"
        />
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn btn-primary" disabled={pending || !text.trim()} onClick={add}>
            {working("add") ? "Looking…" : "Follow"}
          </button>
          {suggested > 0 && (
            <button type="button" className="btn btn-quiet" disabled={pending} onClick={() => run("jobs", followFromJobs)} title="The companies that appear most in your saved jobs">
              {working("jobs") ? "Looking…" : `Find boards for companies in my jobs`}
            </button>
          )}
        </div>
      </div>

      {message && (
        <p role="status" className={`mt-2 text-sm ${message.ok ? "text-go" : "text-coral"}`}>
          {message.text}
        </p>
      )}

      {companies.length > 0 && (
        <ul className="mt-4 divide-y divide-line/70 rounded-md border border-line/70">
          {companies.map((company) => {
            const state = STATE[company.state] ?? STATE.new;
            return (
              <li key={company.name} className="px-3 py-2.5">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="font-medium">{company.name}</span>
                  <span className={`rounded-full px-2 py-0.5 font-mono text-[11px] tracking-wide uppercase ${state.tone}`}>{state.label}</span>
                  {company.board?.url && (
                    <a href={company.board.url} target="_blank" rel="noreferrer" className="text-sm text-teal underline">
                      {VENDORS[company.board.vendor] ?? "Board"}
                    </a>
                  )}
                  {company.jobs !== undefined && company.state !== "none" && (
                    <span className="text-sm text-slate">
                      {company.jobs} open{company.matching !== undefined ? ` · ${company.matching} fit you` : ""}
                    </span>
                  )}
                  <span className="ml-auto flex flex-wrap gap-1">
                    {company.state === "check" && (
                      <button type="button" className="btn btn-quiet px-2.5 py-1 text-xs" disabled={pending} onClick={() => run(company.name, () => confirmCompanyBoard(company.name))}>
                        It is this company
                      </button>
                    )}
                    <button type="button" className="btn btn-quiet px-2.5 py-1 text-xs" disabled={pending} onClick={() => run(company.name, () => checkCompany(company.name))}>
                      {working(company.name) ? "Checking…" : "Check again"}
                    </button>
                    <button
                      type="button"
                      className="btn btn-quiet px-2.5 py-1 text-xs"
                      disabled={pending}
                      onClick={() => {
                        setLinkFor(linkFor === company.name ? null : company.name);
                        setLink(company.board?.url ?? company.website ?? "");
                      }}
                    >
                      Set link
                    </button>
                    <button type="button" className="btn btn-quiet px-2.5 py-1 text-xs" disabled={pending} onClick={() => run(company.name, () => unfollowCompany(company.name))} aria-label={`Remove ${company.name}`}>
                      Remove
                    </button>
                  </span>
                </div>
                {company.message && <p className="mt-0.5 text-xs text-slate">{company.message}</p>}
                {linkFor === company.name && (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <input
                      aria-label={`Board or website for ${company.name}`}
                      value={link}
                      onChange={(event) => setLink(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key !== "Enter") return;
                        event.preventDefault();
                        if (link.trim()) run(company.name, () => setCompanyLink(company.name, link), () => setLinkFor(null));
                      }}
                      placeholder="Careers page, board link or website"
                      className="field w-full sm:w-96"
                    />
                    <button type="button" className="btn btn-primary px-3 py-1 text-sm" disabled={pending || !link.trim()} onClick={() => run(company.name, () => setCompanyLink(company.name, link), () => setLinkFor(null))}>
                      Use it
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {companies.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
          <label htmlFor="company-days" className="text-slate">
            Collect board jobs posted in the last
          </label>
          <input
            id="company-days"
            type="number"
            min={1}
            max={90}
            value={days}
            onChange={(event) => setDays(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              event.preventDefault();
              run("days", () => setCompanyMaxDays(Number(days)));
            }}
            onBlur={() => Number(days) !== maxDays && run("days", () => setCompanyMaxDays(Number(days)))}
            className="field w-20 font-mono"
          />
          <span className="text-slate">days</span>
          <button type="button" className="btn btn-quiet ml-auto px-2.5 py-1 text-xs" disabled={pending} onClick={() => run("all", checkAllCompanies)}>
            {working("all") ? "Checking…" : "Check all again"}
          </button>
        </div>
      )}
    </div>
  );
}
