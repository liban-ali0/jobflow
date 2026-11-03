import "server-only";
import fs from "node:fs";
import path from "node:path";
import { ROOT, listJobs } from "./data";
import type { Job, Offer } from "./types";

// Offers side by side (the Offers page): the terms the user entered, a yearly
// cash figure worked out from them, where each sits against the market range
// the research found, and the deadline. Plain arithmetic on the user's own
// numbers: nothing is converted between currencies or taxed.

export const OFFER_STATUSES = ["offer", "accepted", "declined"] as const;
const DAY = 86400000;

export function cleanOffer(input: Partial<Record<keyof Offer, unknown>>): Offer {
  const text = (value: unknown, max = 200) => (typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "");
  const amount = (value: unknown) => {
    const number = typeof value === "number" ? value : Number(String(value ?? "").replace(/[,\s]/g, ""));
    return Number.isFinite(number) && number > 0 ? Math.round(number) : null;
  };
  return {
    pay: amount(input.pay),
    currency: text(input.currency, 6).toUpperCase(),
    period: input.period === "year" ? "year" : "month",
    bonus: amount(input.bonus),
    allowances: amount(input.allowances),
    benefits: text(input.benefits, 600),
    title: text(input.title, 120),
    location: text(input.location, 120),
    workMode: text(input.workMode, 40),
    start: text(input.start, 40),
    deadline: /^\d{4}-\d{2}-\d{2}$/.test(String(input.deadline ?? "")) ? String(input.deadline) : "",
    contract: text(input.contract, 200),
    probation: text(input.probation, 80),
    notes: text(input.notes, 1500),
    updatedAt: new Date().toISOString(),
  };
}

// Base pay and allowances for a year, plus the yearly bonus.
export function yearlyCash(offer: Offer) {
  if (!offer.pay) return null;
  const times = offer.period === "month" ? 12 : 1;
  return offer.pay * times + (offer.allowances ?? 0) * times + (offer.bonus ?? 0);
}

// "AED 9,000 to 12,000 a month" → { low, high, currency, period }.
export function parseRange(text: string | null | undefined) {
  if (!text) return null;
  const numbers = [...text.matchAll(/(\d[\d,.]*)\s*(k)?/gi)]
    .map(([, value, k]) => Number(value.replace(/,/g, "")) * (k ? 1000 : 1))
    .filter((value) => Number.isFinite(value) && value >= 100);
  if (!numbers.length) return null;
  const currency = /\b(AED|SAR|QAR|KWD|BHD|OMR|USD|EUR|GBP|TRY|TL|INR|PKR|EGP|JOD)\b/i.exec(text)?.[1]?.toUpperCase().replace("TL", "TRY") ?? (/\$/.test(text) ? "USD" : /€/.test(text) ? "EUR" : /£/.test(text) ? "GBP" : /₺/.test(text) ? "TRY" : "");
  const period = /\b(year|annual|annum|yearly|p\.?a\.?)\b/i.test(text) ? "year" : "month";
  return { low: Math.min(...numbers.slice(0, 2)), high: Math.max(...numbers.slice(0, 2)), currency, period: period as "month" | "year" };
}

// The market range from the job's report (pay.range) or its salary estimate.
function marketOf(job: Job) {
  let range: string | null = null;
  if (job.folder) {
    try {
      range = JSON.parse(fs.readFileSync(path.join(ROOT, job.folder, "report.json"), "utf8"))?.pay?.range ?? null;
    } catch {
      // No report.
    }
  }
  return parseRange(range || job.salary_estimate);
}

export type OfferRow = {
  job: Job;
  offer: Offer | null;
  yearly: number | null;
  // Where base pay sits in the market range, when currency and period allow.
  market: { low: number; high: number; currency: string; period: "month" | "year"; position: "below" | "within" | "above" | null } | null;
  daysLeft: number | null;
};

export function offerRows(now = Date.now()): { offers: OfferRow[]; interviewing: OfferRow[]; currencies: string[] } {
  const row = (job: Job): OfferRow => {
    const offer = job.offer;
    const range = marketOf(job);
    let position: "below" | "within" | "above" | null = null;
    if (offer?.pay && range && (!range.currency || !offer.currency || range.currency === offer.currency)) {
      const monthly = offer.period === "month" ? offer.pay : offer.pay / 12;
      const low = range.period === "month" ? range.low : range.low / 12;
      const high = range.period === "month" ? range.high : range.high / 12;
      position = monthly < low ? "below" : monthly > high ? "above" : "within";
    }
    const deadline = offer?.deadline ? Date.parse(`${offer.deadline}T23:59:59`) : null;
    return {
      job,
      offer,
      yearly: offer ? yearlyCash(offer) : null,
      market: range ? { ...range, position } : null,
      daysLeft: deadline ? Math.ceil((deadline - now) / DAY) : null,
    };
  };
  const jobs = listJobs({ status: [...OFFER_STATUSES, "interview"] });
  const offers = jobs.filter((job) => (OFFER_STATUSES as readonly string[]).includes(job.status)).map(row);
  const interviewing = jobs.filter((job) => job.status === "interview").map(row);
  const currencies = [...new Set(offers.map((item) => item.offer?.currency).filter((value): value is string => Boolean(value)))];
  return { offers, interviewing, currencies };
}

// The AI comparison, written by the compare-offers step.
export const COMPARISON_FILE = "jobs/_offers/comparison.md";
export function readComparison() {
  const file = path.join(ROOT, COMPARISON_FILE);
  if (!fs.existsSync(file)) return null;
  return { text: fs.readFileSync(file, "utf8"), at: fs.statSync(file).mtime.toISOString() };
}
