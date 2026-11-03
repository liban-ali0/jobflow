"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { saveOffer } from "@/app/offer-actions";
import type { Offer } from "@/lib/types";

// The job page at the Offer stage: the offer's terms, so offers can be put
// side by side on the Offers page.
export function OfferForm({ jobId, offer, market }: { jobId: number; offer: Offer | null; market: string | null }) {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const field = (name: keyof Offer, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div>
      <label className="label" htmlFor={`offer-${name}`}>
        {label}
      </label>
      <input id={`offer-${name}`} name={name} defaultValue={offer?.[name] === null || offer?.[name] === undefined ? "" : String(offer[name])} className="field w-full" dir="auto" {...props} />
    </div>
  );
  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        const data = Object.fromEntries(new FormData(event.currentTarget).entries());
        start(async () => {
          const result = await saveOffer(jobId, data);
          setMessage({ ok: result.ok, text: result.message });
        });
      }}
    >
      <div className="grid gap-4 sm:grid-cols-4">
        {field("pay", "Base pay", { inputMode: "numeric", placeholder: "e.g. 12000", required: true })}
        {field("currency", "Currency", { placeholder: "AED", maxLength: 6, required: true })}
        <div>
          <label className="label" htmlFor="offer-period">
            Per
          </label>
          <select id="offer-period" name="period" defaultValue={offer?.period ?? "month"} className="field w-full">
            <option value="month">Month</option>
            <option value="year">Year</option>
          </select>
        </div>
        {field("allowances", "Allowances, same period", { inputMode: "numeric", placeholder: "Housing, transport" })}
        {field("bonus", "Bonus a year", { inputMode: "numeric" })}
        {field("title", "Title offered")}
        {field("location", "Location")}
        {field("workMode", "Work mode", { placeholder: "On site, hybrid, remote" })}
        {field("start", "Start date")}
        {field("deadline", "Answer by", { type: "date" })}
        {field("contract", "Contract", { placeholder: "Permanent, 2-year, fixed term" })}
        {field("probation", "Probation", { placeholder: "e.g. 6 months" })}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="offer-benefits">
            Benefits
          </label>
          <textarea id="offer-benefits" name="benefits" defaultValue={offer?.benefits ?? ""} rows={3} placeholder="Health insurance, flights home, visa, leave days" className="field w-full" dir="auto" />
        </div>
        <div>
          <label className="label" htmlFor="offer-notes">
            Anything else
          </label>
          <textarea id="offer-notes" name="notes" defaultValue={offer?.notes ?? ""} rows={3} placeholder="What they said, what is still open" className="field w-full" dir="auto" />
        </div>
      </div>
      {market && <p className="text-xs text-slate">The research&rsquo;s market range for this role: {market}.</p>}
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Saving…" : offer ? "Save changes" : "Save the offer"}
        </button>
        <Link href="/offers" className="text-sm text-teal underline">
          Compare all offers
        </Link>
        {message && (
          <span role="status" className={`text-sm ${message.ok ? "text-go" : "text-coral"}`}>
            {message.text}
          </span>
        )}
      </div>
    </form>
  );
}
