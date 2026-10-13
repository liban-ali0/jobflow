"use client";

import { useState } from "react";
import { GROUPS, ORDERS, PERIODS, STAGES, type AppQuery } from "@/lib/applications";

type Option = { value: string; count: number; label?: string };

// The applications table's filters, as a GET form: each choice applies at
// once, the search on Enter. Works without JavaScript too (Show button).
export function ApplicationsFilters({ query, countries, roles, years }: { query: AppQuery; countries: Option[]; roles: Option[]; years: number[] }) {
  const submit = (event: React.ChangeEvent<HTMLSelectElement>) => event.currentTarget.form?.requestSubmit();
  const field = "w-full rounded-md border border-field bg-surface px-2.5 py-2 text-sm";
  // On phones the choices fold behind a button; the search stays visible.
  const [open, setOpen] = useState(false);
  const active = [query.stage !== "all", query.period !== "all", query.country, query.role, query.group !== "month", query.sort !== "date" || query.dir !== "desc"].filter(Boolean).length;
  const order = ORDERS.some((item) => item.value === `${query.sort}:${query.dir}`) ? `${query.sort}:${query.dir}` : "date:desc";
  return (
    <form action="/board#applications" method="get" className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-[minmax(12rem,1.6fr)_repeat(6,minmax(0,1fr))]" role="search" aria-label="Filter applications">
      <label className="col-span-2 sm:col-span-3 lg:col-span-1">
        <span className="label">Search</span>
        <span className="flex gap-2">
          <input type="search" name="q" defaultValue={query.q} placeholder="Company, title, city…" className={field} />
          <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="btn btn-quiet shrink-0 px-3 text-sm sm:hidden">
            Filters{active ? ` · ${active}` : ""}
          </button>
        </span>
      </label>
      <label className={open ? "" : "max-sm:hidden"}>
        <span className="label">Stage</span>
        <select name="stage" defaultValue={query.stage} onChange={submit} className={field}>
          {STAGES.map((stage) => (
            <option key={stage.value} value={stage.value}>
              {stage.label}
            </option>
          ))}
        </select>
      </label>
      <label className={open ? "" : "max-sm:hidden"}>
        <span className="label">When</span>
        <select name="period" defaultValue={query.period} onChange={submit} className={field}>
          {PERIODS.map((period) => (
            <option key={period.value} value={period.value}>
              {period.label}
            </option>
          ))}
          {years.map((year) => (
            <option key={year} value={String(year)}>
              In {year}
            </option>
          ))}
        </select>
      </label>
      <label className={open ? "" : "max-sm:hidden"}>
        <span className="label">Country</span>
        <select name="country" defaultValue={query.country} onChange={submit} className={field}>
          <option value="">All countries</option>
          {countries.map((country) => (
            <option key={country.value} value={country.value}>
              {country.value} ({country.count})
            </option>
          ))}
        </select>
      </label>
      <label className={open ? "" : "max-sm:hidden"}>
        <span className="label">Role</span>
        <select name="role" defaultValue={query.role} onChange={submit} className={field}>
          <option value="">All roles</option>
          {roles.map((role) => (
            <option key={role.value} value={role.value}>
              {role.label ?? role.value} ({role.count})
            </option>
          ))}
        </select>
      </label>
      <label className={open ? "" : "max-sm:hidden"}>
        <span className="label">Group by</span>
        <select name="group" defaultValue={query.group} onChange={submit} className={field}>
          {GROUPS.map((group) => (
            <option key={group.value} value={group.value}>
              {group.label}
            </option>
          ))}
        </select>
      </label>
      <label className={open ? "" : "max-sm:hidden"}>
        <span className="label">Order</span>
        <select name="sort" defaultValue={order} onChange={submit} className={field}>
          {ORDERS.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      </label>
      <noscript>
        <button type="submit" className="btn btn-quiet">
          Show
        </button>
      </noscript>
    </form>
  );
}
