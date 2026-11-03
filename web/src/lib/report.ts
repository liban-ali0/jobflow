import "server-only";
import fs from "node:fs";
import path from "node:path";
import { matchFigure, normalizeReport, orderedRequirements, type JobReport } from "@/core/report.mjs";
import { ROOT, otherJobsAt } from "./data";
import { STATUS_LABELS, SENT_STATUSES, type Job, type Status } from "./types";

// The job report on the job page: the research step's report.json, and the
// facts Offerbound already knows about the listing, worked out in code.

export function readReport(job: Job): JobReport | null {
  if (!job.folder) return null;
  const file = path.join(ROOT, job.folder, "report.json");
  if (!fs.existsSync(file)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf8"));
    const { report } = normalizeReport(raw);
    return report ? { ...report, saved_at: typeof raw.saved_at === "string" ? raw.saved_at : undefined } : null;
  } catch {
    return null;
  }
}

export type Fact = { label: string; state: "ok" | "warn" | "info"; text: string; href?: string };

const DAY = 86400000;
const FEE = /\b(registration|processing|training|visa|application)\s+fee\b|\bpay(?:ment)?\s+(?:a\s+)?(?:fee|deposit)\b|رسوم\s+(?:التسجيل|التقديم)/i;
const PAY = /\b(?:AED|SAR|QAR|KWD|BHD|OMR|USD|EUR|GBP|TRY|TL)\s?\d|[$€£₺]\s?\d|\d[\d,.]*\s?(?:AED|SAR|QAR|KWD|BHD|OMR|USD|EUR|GBP|TRY|TL)\b|\bsalary\s*(?:range|:)\s*\S*\d/i;

// What the data says, without any AI: whether the listing is open, how old
// it is, whether it was posted again, the user's history with the company,
// and signs in the listing's own text.
export function jobFacts(job: Job, now = Date.now()): Fact[] {
  const facts: Fact[] = [];
  const posted = job.posted_at ? Date.parse(job.posted_at) : null;
  if (posted) {
    const days = Math.max(0, Math.floor((now - posted) / DAY));
    facts.push({ label: "Posting age", state: days > 45 ? "warn" : "ok", text: days === 0 ? "Posted today" : `Posted ${days} ${days === 1 ? "day" : "days"} ago${days > 45 ? ": an old posting may already be filled" : ""}` });
  } else {
    facts.push({ label: "Posting age", state: "info", text: "The listing does not say when it was posted" });
  }
  const listing = { open: { state: "ok", text: "Still open when last checked" }, kept: { state: "ok", text: "You said it is still open" }, closed: { state: "warn", text: `Closed${job.listing_reason ? `: ${job.listing_reason}` : ""}` }, unsure: { state: "info", text: "Could not tell whether it is still open" } } as const;
  const known = job.listing_state ? listing[job.listing_state] : null;
  facts.push(known ? { label: "Listing", ...known } : { label: "Listing", state: "info", text: "Not checked yet" });
  if (job.relisted_count) facts.push({ label: "Posted again", state: "info", text: `Listed again ${job.relisted_count} ${job.relisted_count === 1 ? "time" : "times"}: often a hard-to-fill role, sometimes a standing advert` });

  const description = job.description ?? "";
  if (description) {
    const words = description.split(/\s+/).length;
    if (words < 80) facts.push({ label: "Description", state: "warn", text: `Only ${words} words: little to go on` });
    if (FEE.test(description)) facts.push({ label: "Fee", state: "warn", text: "The listing mentions a fee or deposit: genuine employers do not charge applicants" });
    facts.push({ label: "Pay in the listing", state: "info", text: PAY.test(description) ? "The listing states pay" : "No pay stated: the range below is an estimate" });
  }

  const others = job.company ? otherJobsAt(job.company, job.id) : [];
  const sent = others.filter((other) => SENT_STATUSES.includes(other.status as Status));
  if (sent.length) {
    const answered = sent.filter((other) => ["replied", "interview", "offer", "accepted", "declined", "rejected"].includes(other.status));
    const latest = sent[0];
    facts.push({
      label: "You and this company",
      state: answered.length ? "ok" : "info",
      text: `Applied ${sent.length === 1 ? "once" : `${sent.length} times`} before${answered.length ? `, answered ${answered.length}` : ", no answer yet"} (latest: ${latest.title}, ${STATUS_LABELS[latest.status as Status] ?? latest.status})`,
      href: `/jobs/${latest.id}`,
    });
  }
  return facts;
}

export { matchFigure, orderedRequirements };
