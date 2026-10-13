import "server-only";
import fs from "node:fs";
import path from "node:path";
import { parseCv } from "./cv-format";
import { ROOT, answeredFacts, getJob, listContacts, listDocuments } from "./data";
import { jobDocumentPage, readText } from "./documents";
import { htmlToPdf } from "./pdf";

// Everything needed to fill one application: the candidate's details from the
// tailored CV's header, the form answers as question and answer, the files,
// and the email application when there is a confirmed address. Shared by the
// job page, the browser extension, and the apply-job step.

export type ApplyAnswer = { question: string; answer: string; note: string };
export type ApplyProfile = {
  name: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  location: string;
  linkedin: string;
  website: string;
  headline: string;
};
export type ApplyPack = {
  job: { id: number; title: string; company: string; url: string | null; status: string };
  profile: ApplyProfile;
  answers: ApplyAnswer[];
  // Questions the user answered in Jobflow or saved from earlier forms, for
  // fields the job's own answers do not cover.
  facts: { question: string; answer: string }[];
  files: { type: "cv" | "cover_letter"; documentId: number; fileName: string }[];
  coverLetterText: string;
  email: { to: string; name: string; subject: string; body: string } | null;
  // Every document of the package approved by the user.
  approved: boolean;
};

const PACKAGE = ["cv", "cover_letter", "email", "answers"];

// The answers document: one "## question" per answer. A paragraph starting
// "For you, not the form" is a note for the candidate, never pasted.
export function parseAnswers(markdown: string): ApplyAnswer[] {
  return markdown
    .split(/^##\s+/m)
    .slice(1)
    .map((section) => {
      const [question, ...rest] = section.split("\n");
      const paragraphs = rest.join("\n").split(/\n\s*\n/).map((paragraph) => paragraph.trim()).filter(Boolean);
      const isNote = (paragraph: string) => /^(\*\*)?for you, not the form/i.test(paragraph);
      return {
        question: question.trim(),
        answer: paragraphs.filter((paragraph) => !isNote(paragraph)).join("\n\n"),
        note: paragraphs.filter(isNote).map((paragraph) => paragraph.replace(/^(\*\*)?for you, not the form:?(\*\*)?:?\s*/i, "")).join("\n\n"),
      };
    })
    .filter((item) => item.question && item.answer);
}

// Answers still waiting for a fact from the user.
export const UNANSWERED = /not known yet|open question|fill this in|\bTBD\b|to be confirmed/i;

const words = (text: string) => new Set(text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((word) => word.length > 3));

// An answer written before the user answered the question in Jobflow: the
// answer saved in facts.md ("- question → answer (answered date)") replaces it.
function fromFacts(answers: ApplyAnswer[], facts: string): ApplyAnswer[] {
  const answered = [...facts.matchAll(/^-\s*(.+?)\s*→\s*(.+?)\s*(?:\(answered [^)]*\))?\s*$/gm)].map((match) => ({ question: match[1], answer: match[2] }));
  return answers.map((item) => {
    if (!UNANSWERED.test(item.answer)) return item;
    const asked = words(item.question);
    const fact = answered.find((entry) => [...words(entry.question)].filter((word) => asked.has(word)).length >= 1 && [...words(entry.question)].some((word) => /notice|start|salary|visa|relocat|nationality|licen/.test(word) && asked.has(word)));
    return fact ? { ...item, answer: fact.answer, note: [item.note, `From your answer in Jobflow: “${fact.question}”.`].filter(Boolean).join(" ") } : item;
  });
}

// The CV's contact line, sorted into the fields forms ask for.
export function profileFromCv(markdown: string): ApplyProfile {
  const cv = parseCv(markdown);
  const items = cv.contact.map((item) => item.trim()).filter(Boolean);
  const find = (test: (item: string) => boolean) => items.find(test) ?? "";
  const email = find((item) => /@/.test(item) && !/\s/.test(item));
  const phone = find((item) => /^\+?[\d\s().-]{7,}$/.test(item));
  const linkedin = find((item) => /linkedin\.com/i.test(item));
  const website = find((item) => /\.[a-z]{2,}(\/|$)/i.test(item) && !/linkedin\.com|@/i.test(item));
  const location = find((item) => item !== email && item !== phone && item !== linkedin && item !== website && /^[\p{L}\s,.'-]+$/u.test(item));
  const withScheme = (url: string) => (url && !/^https?:\/\//.test(url) ? `https://${url}` : url);
  const [firstName, ...rest] = cv.name.trim().split(/\s+/);
  return {
    name: cv.name.trim(),
    firstName: firstName ?? "",
    lastName: rest.join(" "),
    email,
    phone,
    location,
    linkedin: withScheme(linkedin),
    website: withScheme(website),
    headline: cv.headline,
  };
}

// The outreach email, when it is addressed to a confirmed email address.
function emailApplication(markdown: string, confirmed: Set<string>) {
  const to = /^To:\s*(.+)$/im.exec(markdown)?.[1] ?? "";
  const address = /[\w.+-]+@[\w-]+\.[\w.-]+/.exec(to)?.[0];
  if (!address || !confirmed.has(address.toLowerCase())) return null;
  const subject = /^Subject:\s*(.+)$/im.exec(markdown)?.[1]?.trim() ?? "";
  // The body: everything after the header lines (To, Subject, LinkedIn, notes).
  const lines = markdown.split("\n");
  const start = lines.findIndex((line) => /^Subject:/i.test(line));
  const body = lines
    .slice(start + 1)
    .join("\n")
    .replace(/^##\s+.*$/gm, "")
    .trim();
  return { to: address, name: to.replace(/<[^>]*>|[\w.+-]+@[\w-]+\.[\w.-]+/g, "").replace(/\(.*?\)/g, "").trim(), subject, body };
}

// The letter for a form's text box: from the greeting to the sign-off,
// without the name, contact, date, and recipient blocks at its top.
export function letterBody(markdown: string) {
  const text = markdown.replace(/^#\s.*\n.*\n+/, "").trim();
  const greeting = text.search(/^(dear|hello|hi|to whom|sayın|السيد|عزيزي)\b/im);
  return (greeting > 0 ? text.slice(greeting) : text).trim();
}

export function applyPack(jobId: number): ApplyPack | null {
  const job = getJob(jobId);
  if (!job) return null;
  const documents = listDocuments(jobId);
  const docOf = (type: string) => documents.find((document) => document.type === type);
  const cv = docOf("cv");
  const cvText = cv ? readText(cv.path) : null;
  const answers = docOf("answers");
  const letter = docOf("cover_letter");
  const email = docOf("email");
  const confirmed = new Set(
    listContacts(jobId)
      .filter((contact) => contact.email && contact.email_verified)
      .map((contact) => contact.email!.toLowerCase()),
  );
  const files = (["cv", "cover_letter"] as const).flatMap((type) => {
    const document = docOf(type);
    const page = document ? jobDocumentPage(document.id) : null;
    return document && page ? [{ type, documentId: document.id, fileName: page.fileName }] : [];
  });
  const letterText = letter ? (readText(letter.path) ?? "") : "";
  return {
    job: { id: job.id, title: job.title, company: job.company, url: job.url, status: job.status },
    profile: profileFromCv(cvText ?? ""),
    answers: answers ? fromFacts(parseAnswers(readText(answers.path) ?? ""), readText("candidate/facts.md") ?? "") : [],
    facts: answeredFacts(),
    files,
    coverLetterText: letterBody(letterText),
    email: email ? emailApplication(readText(email.path) ?? "", confirmed) : null,
    approved: PACKAGE.every((type) => documents.some((document) => document.type === type && document.review === "approved")),
  };
}

// Writes the CV and cover letter as PDFs into the job's folder, for steps that
// attach files by path (the apply-job step). Returns the paths, relative to
// the project.
export async function exportPdfs(jobId: number) {
  const job = getJob(jobId);
  if (!job?.folder) return [];
  const written: string[] = [];
  for (const document of listDocuments(jobId).filter((item) => item.type === "cv" || item.type === "cover_letter")) {
    const page = jobDocumentPage(document.id);
    if (!page) continue;
    const relative = `${job.folder}/${page.fileName}`;
    fs.writeFileSync(path.join(ROOT, relative), await htmlToPdf(page.html, { fitOnePage: page.fitOnePage }));
    written.push(relative);
  }
  return written;
}

// An email application as an .eml file: it opens in Outlook, Thunderbird, or
// Apple Mail as an unsent draft with the CV and cover letter attached.
export async function emailDraft(jobId: number) {
  const pack = applyPack(jobId);
  if (!pack?.email) return null;
  const boundary = `jobflow-${jobId}-${Date.now().toString(36)}`;
  const encodeHeader = (text: string) => (/^[\x20-\x7e]*$/.test(text) ? text : `=?UTF-8?B?${Buffer.from(text).toString("base64")}?=`);
  const wrap = (base64: string) => base64.replace(/.{1,76}/g, "$&\r\n");
  const parts = [
    `--${boundary}\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${wrap(Buffer.from(pack.email.body.replace(/\r?\n/g, "\r\n")).toString("base64"))}`,
  ];
  for (const file of pack.files) {
    const page = jobDocumentPage(file.documentId);
    if (!page) continue;
    const bytes = await htmlToPdf(page.html, { fitOnePage: page.fitOnePage });
    parts.push(
      `--${boundary}\r\nContent-Type: application/pdf; name="${encodeHeader(file.fileName)}"\r\nContent-Disposition: attachment; filename="${encodeHeader(file.fileName)}"\r\nContent-Transfer-Encoding: base64\r\n\r\n${wrap(Buffer.from(bytes).toString("base64"))}`,
    );
  }
  const headers = [
    "X-Unsent: 1",
    `To: ${pack.email.name ? `${encodeHeader(pack.email.name)} <${pack.email.to}>` : pack.email.to}`,
    `Subject: ${encodeHeader(pack.email.subject)}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
  ];
  const fileName = `${pack.job.company} - ${pack.job.title}`.replace(/[\\/:*?"<>|]+/g, " ").slice(0, 80);
  return { eml: `${headers.join("\r\n")}\r\n\r\n${parts.join("\r\n")}\r\n--${boundary}--\r\n`, fileName: `${fileName}.eml` };
}
