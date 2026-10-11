"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { AGE_OPTIONS, DEFAULT_LIMIT, LIMIT_OPTIONS, MODE_OPTIONS, SCORE_OPTIONS } from "@/lib/filters";

// Search box and drop-down filters for the departures board. Each change
// updates the address (and so the list) and returns to the first page.
export function FilterBar() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [text, setText] = useState(params.get("q") ?? "");

  // Builds on the address as it is right now, not as it was when this screen
  // last rendered, so a delayed search update cannot undo a newer change.
  const update = (changes: Record<string, string | undefined>) => {
    const next = new URLSearchParams(window.location.search);
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    next.delete("page");
    const query = next.toString();
    router.replace(`${pathname}${query ? `?${query}` : ""}#departures`, { scroll: false });
  };

  // Search as you type, after a short pause.
  useEffect(() => {
    if (text === (new URLSearchParams(window.location.search).get("q") ?? "")) return;
    const timer = setTimeout(() => update({ q: text.trim() || undefined }), 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  const select = (name: string, label: string, options: { value: string; label: string }[]) => (
    <label className="flex items-center gap-2">
      <span className="sr-only">{label}</span>
      <select
        value={params.get(name) ?? ""}
        onChange={(event) => update({ [name]: event.target.value || undefined })}
        className="field w-auto py-1.5 pr-8 text-xs"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );

  const active = ["q", "age", "min", "mode"].some((key) => params.get(key));

  return (
    <div className="flex flex-wrap items-center gap-2.5">
      <span className="label mb-0">Filter</span>
      <label className="relative">
        <span className="sr-only">Search title or company</span>
        <input
          type="search"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Search title or company"
          className="field w-60 py-1.5 text-xs"
        />
      </label>
      {select("age", "Posted within", AGE_OPTIONS)}
      {select("min", "Minimum score", SCORE_OPTIONS)}
      {select("mode", "Work mode", MODE_OPTIONS)}
      <label className="flex items-center gap-2 text-xs text-slate">
        Rows
        <select
          value={params.get("limit") ?? String(DEFAULT_LIMIT)}
          onChange={(event) => update({ limit: event.target.value === String(DEFAULT_LIMIT) ? undefined : event.target.value })}
          className="field w-auto py-1.5 pr-8 text-xs text-ink"
        >
          {LIMIT_OPTIONS.map((limit) => (
            <option key={limit} value={limit}>
              {limit} per page
            </option>
          ))}
        </select>
      </label>
      <a
        href="/export"
        onClick={(event) => {
          // Exports what the board shows now: same view, filters, and sort.
          event.currentTarget.href = `/export${window.location.search}`;
        }}
        download
        className="btn btn-quiet px-3 py-1.5 text-xs"
        title="Download every job matching these filters, all pages, as a spreadsheet"
      >
        Export list
      </a>
      {active && (
        <button
          type="button"
          onClick={() => {
            setText("");
            update({ q: undefined, age: undefined, min: undefined, mode: undefined });
          }}
          className="text-xs text-teal underline"
        >
          Clear filters
        </button>
      )}
    </div>
  );
}
