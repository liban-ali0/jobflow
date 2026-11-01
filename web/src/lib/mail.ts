import "server-only";
import { fold } from "./browser-sites";
import { addMail, getSettings, hasMail, listContacts, listDocuments, listJobs, setSettings } from "./data";
import { readText } from "./documents";
import { applyPack } from "./apply";
export { MAIL_KIND_LABELS } from "./mail-labels";
import { SENT_STATUSES, type Job, type MailKind, type Status } from "./types";

// Replies to applications, read from the user's Gmail by the browser
// extension (it sends the subject, sender and Gmail's short preview of each
// new email). Each one is sorted by what it says and matched to the
// application it is about; the user confirms before anything changes.
// The sorting follows career-ops' reply-watch (MIT, career-ops-hq/career-ops):
// noise first, a rejection wins over offer wording, and nothing is applied
// without the user.

export type IncomingMail = {
  id: string;
  fromName: string;
  fromEmail: string;
  subject: string;
  summary: string;
  at: string | null;
  link: string | null;
};

// Phrases, lower case and without accents (see fold), in English, Turkish and Arabic.
const NOISE = [
  "job alert", "jobs you may", "recommended jobs", "jobs for you", "new jobs", "suggested jobs", "job recommendation", "newsletter", "invitation to apply",
  "is ilani onerileri", "sana uygun ilan", "size uygun ilan", "ilan onerisi", "yeni ilanlar", "benzer ilanlar",
  "وظائف مقترحة", "وظائف جديدة", "تنبيه وظائف",
];
const REJECTED = [
  "unfortunately", "regret to inform", "not be moving forward", "not moving forward", "decided not to proceed", "decided to proceed with other",
  "other candidates", "position has been filled", "role has been filled", "role has been closed", "not been selected", "not selected", "unable to offer",
  "not a match", "will not be progressing", "unsuccessful",
  "maalesef", "olumsuz", "uygun bulunmadi", "baska bir aday", "devam edemeyecegiz", "sureci sonlandir", "degerlendirmeye alinamamis",
  "للأسف", "نأسف", "لم يتم اختيارك", "لن نتمكن من المضي", "تم شغل الوظيفة",
];
const OFFER = [
  "offer letter", "job offer", "pleased to offer", "employment offer", "offer of employment", "employment agreement", "employment contract",
  "is teklifi", "teklif mektubu", "is sozlesmesi",
  "عرض عمل", "عرض وظيفي", "خطاب العرض", "عقد العمل",
];
const INTERVIEW = [
  "invite you to an interview", "invite you for an interview", "interview invitation", "invitation to interview", "schedule an interview", "schedule a call",
  "set up a call", "phone screen", "video interview", "technical interview", "your availability", "available for a call", "book a time", "pick a time",
  "calendly.com", "would like to speak with you", "would love to speak with you", "next round", "final round", "meet the team",
  "mulakat", "gorusme daveti", "gorusmeye davet", "teknik gorusme", "online gorusme", "yuz yuze gorusme",
  "مقابلة", "دعوة لمقابلة", "موعد المقابلة",
];
const ACTION = [
  "assessment", "coding challenge", "online test", "take-home", "take home", "please complete", "complete the form", "fill out", "provide the following",
  "send us your", "case study", "hackerrank", "codility", "testgorilla",
  "degerlendirme testi", "online test", "lutfen doldur", "lutfen tamamla", "envanter",
  "اختبار", "يرجى تعبئة", "يرجى إرسال",
];
const RECEIVED = [
  "thank you for applying", "thanks for applying", "application received", "received your application", "we have received your application",
  "application has been received", "thank you for your application", "thank you for your interest", "confirmation of application", "automatic reply",
  "basvurunuz alinmistir", "basvurunuz icin tesekkur", "basvurunuzu aldik", "basvurunuz bize ulasti", "otomatik yanit",
  "تم استلام طلبك", "شكرا لتقديمك", "شكراً لتقديمك", "استلمنا طلبك",
];
// A generic word for an interview, after the confirmations ("if selected
// for an interview, we will contact you").
const INTERVIEW_WORD = ["interview", "mulakat", "gorusme", "مقابلة"];
// Words that say an email is about applying at all.
const APPLYING = ["application", "applied", "candidate", "position", "role", "recruit", "hiring", "basvuru", "aday", "pozisyon", "ise alim", "طلب", "وظيفة", "التوظيف"];

const SUGGEST: Record<MailKind, Status | null> = {
  interview: "interview",
  offer: "offer",
  rejected: "rejected",
  action: "replied",
  replied: "replied",
  received: null,
};


const found = (text: string, phrases: string[]) => phrases.filter((phrase) => text.includes(fold(phrase)));

// What an email says, with the phrases that showed it. null: not about an
// application (alerts, newsletters, anything else).
export function classifyMail(mail: Pick<IncomingMail, "subject" | "summary" | "fromName">): { kind: MailKind | null; evidence: string[] } {
  const text = fold(`${mail.subject} ${mail.summary}`);
  const noise = found(text, NOISE);
  if (noise.length) return { kind: null, evidence: noise };
  for (const [kind, phrases] of [
    ["rejected", REJECTED],
    ["offer", OFFER],
    ["interview", INTERVIEW],
    ["action", ACTION],
    ["received", RECEIVED],
    ["interview", INTERVIEW_WORD],
  ] as const) {
    const evidence = found(text, phrases);
    if (evidence.length) return { kind, evidence };
  }
  const applying = found(text, APPLYING);
  return applying.length ? { kind: "replied", evidence: applying } : { kind: null, evidence: [] };
}

// Mail services and job sites: their address says nothing about the company.
const SHARED_DOMAINS =
  /(^|\.)(gmail|googlemail|outlook|hotmail|live|yahoo|icloud|proton|protonmail|yandex|gmx|aol|zoho|greenhouse|greenhouse-mail|lever|hire\.lever|workable|workablemail|smartrecruiters|ashbyhq|myworkday|workday|icims|successfactors|taleo|bamboohr|recruitee|teamtailor|personio|jobvite|breezy|linkedin|indeed|indeedemail|bayt|gulftalent|naukrigulf|naukri|kariyer|eleman|techcareer|secretcv|yenibiris|glassdoor|monster)\./;
// Words in company names that are not the name.
const COMPANY_SUFFIX = /\b(ltd|limited|llc|l\.l\.c|inc|corp|corporation|co|company|group|holding|holdings|fze|fzco|fz|llp|plc|gmbh|sa|as|a\.s|ve|ticaret|sanayi|tic|san|teknoloji|technologies|technology|solutions|services|international|global|the)\b/g;

const companyName = (company: string) => fold(company).replace(/[.,'’&()-]/g, " ").replace(COMPANY_SUFFIX, " ").replace(/\s+/g, " ").trim();
const domainOf = (email: string) => email.toLowerCase().split("@")[1] ?? "";

// How strongly an email points at one application.
function matchScore(job: Job, mail: IncomingMail, text: string, contactDomains: Set<string>) {
  let score = 0;
  const domain = domainOf(mail.fromEmail);
  const name = companyName(job.company);
  const compact = name.replace(/\s+/g, "");
  if (domain && contactDomains.has(domain)) score += 4;
  else if (domain && !SHARED_DOMAINS.test(domain) && compact.length >= 3) {
    const host = domain.replace(/\.(com|net|org|io|co|ae|sa|qa|tr|com\.tr|com\.sa|com\.qa|om|kw|bh)$/g, "").replace(/[^a-z0-9]/g, "");
    if (host.includes(compact) || (compact.includes(host) && host.length >= 4)) score += 3;
  }
  if (name.length >= 3 && new RegExp(`(^|[^a-z0-9])${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`).test(text)) score += 2;
  const titleWords = fold(job.title)
    .split(/[^a-z0-9؀-ۿ]+/)
    .filter((word) => word.length >= 4);
  if (titleWords.length && titleWords.filter((word) => text.includes(word)).length >= Math.min(2, titleWords.length)) score += 1;
  return score;
}

export type MatchableJob = { job: Job; domains: Set<string> };

// Sent applications with their contacts' own email domains.
export function matchableJobs(): MatchableJob[] {
  return listJobs({ status: SENT_STATUSES }).map((job) => ({
    job,
    domains: new Set(listContacts(job.id).flatMap((contact) => (contact.email ? [domainOf(contact.email)] : [])).filter((domain) => domain && !SHARED_DOMAINS.test(domain))),
  }));
}

// The application an email is about, or null when no single one fits.
export function matchMail(mail: IncomingMail, jobs: MatchableJob[]) {
  const text = fold(`${mail.fromName} ${mail.subject} ${mail.summary}`);
  const scored = jobs
    .map(({ job, domains }) => ({ job, score: matchScore(job, mail, text, domains) }))
    .filter((row) => row.score >= 2)
    .sort((a, b) => b.score - a.score || Date.parse(b.job.applied_at ?? "") - Date.parse(a.job.applied_at ?? ""));
  if (!scored.length) return null;
  // Two applications at the same company, equally likely: the user picks.
  if (scored[1] && scored[1].score === scored[0].score && scored[1].job.company !== scored[0].job.company) return null;
  return scored[0].job;
}

const clean = (value: unknown, max: number) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);

export function cleanIncoming(input: unknown): IncomingMail | null {
  if (!input || typeof input !== "object") return null;
  const mail = input as Record<string, unknown>;
  const id = clean(mail.id, 200);
  if (!id) return null;
  const at = Date.parse(String(mail.at ?? ""));
  const link = clean(mail.link, 500);
  return {
    id,
    fromName: clean(mail.fromName, 120),
    fromEmail: clean(mail.fromEmail, 200).toLowerCase(),
    subject: clean(mail.subject, 300),
    summary: clean(mail.summary, 600),
    at: Number.isFinite(at) ? new Date(at).toISOString() : null,
    // Only links into Gmail itself.
    link: /^https:\/\/mail\.google\.com\//.test(link) ? link : null,
  };
}

// New emails from one check: each is read once. Emails that are about an
// application are kept for the user; the rest only as their id.
export function ingestMails(mails: IncomingMail[]) {
  const jobs = matchableJobs();
  let kept = 0;
  let received = 0;
  for (const mail of mails) {
    if (hasMail(mail.id)) continue;
    const { kind, evidence } = classifyMail(mail);
    const job = kind ? matchMail(mail, jobs) : null;
    // About an application only when it names one, or when it clearly is a
    // recruiting email (not a plain "reply" from anyone).
    if (!kind || (!job && (kind === "replied" || kind === "received"))) {
      addMail({ message_id: mail.id, state: "ignored" });
      continue;
    }
    const suggestion = SUGGEST[kind];
    addMail({
      message_id: mail.id,
      job_id: job?.id ?? null,
      from_name: mail.fromName,
      from_email: mail.fromEmail,
      subject: mail.subject,
      snippet: mail.summary,
      link: mail.link,
      received_at: mail.at,
      kind,
      evidence: evidence.slice(0, 4).join(", "),
      suggestion,
      // "We received your application" changes nothing: noted on the job.
      state: kind === "received" ? "done" : "new",
    });
    if (kind === "received") received += 1;
    else kept += 1;
  }
  return { kept, received };
}

export function recordMailCheck(ok: boolean, message: string, address: string | null = null) {
  setSettings({ mailCheck: { at: new Date().toISOString(), ok, message: message.slice(0, 300), address } });
}

// ---------- writing emails in Gmail ----------

export type ComposeKind = "follow_up" | "application";
export type Compose = { kind: ComposeKind; to: string; subject: string; body: string; attach: string[]; url: string };

// A written email: the To and Subject lines, then the body.
function parseEmail(markdown: string) {
  const to = /^To:\s*(.+)$/im.exec(markdown)?.[1] ?? "";
  const address = /[\w.+-]+@[\w-]+\.[\w.-]+/.exec(to)?.[0] ?? "";
  const subject = /^Subject:\s*(.+)$/im.exec(markdown)?.[1]?.trim() ?? "";
  const lines = markdown.split("\n");
  const start = lines.findIndex((line) => /^Subject:/i.test(line));
  const body = lines
    .slice(start + 1)
    .join("\n")
    .replace(/^#+\s+.*$/gm, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .trim();
  return { to: address, subject, body };
}

// Gmail's own compose window with the email filled in (in the account the
// user picked). The user attaches files, if any, and presses Send.
export function gmailComposeUrl(to: string, subject: string, body: string) {
  const account = getSettings().email.account ?? 0;
  const params = new URLSearchParams({ view: "cm", fs: "1", to, su: subject, body });
  return `https://mail.google.com/mail/u/${account}/?${params.toString()}`;
}

// The emails of a job that can be opened in Gmail.
export function composeFor(jobId: number, kind: ComposeKind): Compose | null {
  if (kind === "application") {
    const pack = applyPack(jobId);
    if (!pack?.email) return null;
    return { kind, to: pack.email.to, subject: pack.email.subject, body: pack.email.body, attach: pack.files.map((file) => file.fileName), url: gmailComposeUrl(pack.email.to, pack.email.subject, pack.email.body) };
  }
  const document = listDocuments(jobId).find((doc) => doc.type === "follow_up");
  const markdown = document ? readText(document.path) : null;
  if (!markdown) return null;
  const email = parseEmail(markdown);
  if (!email.body) return null;
  return { kind, ...email, attach: [], url: gmailComposeUrl(email.to, email.subject, email.body) };
}
