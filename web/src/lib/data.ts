import "server-only";
import fs from "node:fs";
import path from "node:path";
import * as core from "@/core/db.mjs";
import type {
  Contact,
  Conversation,
  Job,
  JobDocument,
  JobEvent,
  Mail,
  Message,
  Question,
  Run,
  Settings,
  Status,
} from "./types";

// The app runs from web/, the project root is one level up.
// Where the code is (scripts, skills, node_modules); the data root may be
// elsewhere (JOBFLOW_ROOT, for a test copy of the data).
export const CODE_ROOT = path.resolve(process.cwd(), "..");
export const ROOT = process.env.JOBFLOW_ROOT ?? CODE_ROOT;

type Db = ReturnType<typeof core.openDb>;
const holder = globalThis as unknown as { jobflowDb?: Db };

function db(): Db {
  holder.jobflowDb ??= core.openDb(ROOT);
  return holder.jobflowDb;
}

// Candidate files the Profile screen reads and edits.
const candidateFile = (name: string) => path.join(ROOT, "candidate", name);
const readIfExists = (file: string) => (fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null);

export const readFacts = () => readIfExists(candidateFile("facts.md"));
export const readProfile = () => readIfExists(candidateFile("profile.md"));
export const profileUpdatedAt = () => {
  const file = candidateFile("profile.md");
  return fs.existsSync(file) ? fs.statSync(file).mtime.toISOString() : null;
};
const cvNames = () =>
  fs.existsSync(path.join(ROOT, "candidate"))
    ? fs.readdirSync(path.join(ROOT, "candidate")).filter((name) => name.toLowerCase().endsWith(".pdf"))
    : [];
export const hasCv = () => cvNames().length > 0;
export const cvName = () => cvNames()[0] ?? null;

// Saves an uploaded CV as candidate/cv.pdf. Earlier CVs move to
// candidate/previous/ so the profile step only ever finds one.
export function saveCv(bytes: Uint8Array) {
  const folder = path.join(ROOT, "candidate");
  fs.mkdirSync(path.join(folder, "previous"), { recursive: true });
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  for (const name of cvNames()) {
    fs.renameSync(path.join(folder, name), path.join(folder, "previous", `${stamp}_${name}`));
  }
  fs.writeFileSync(path.join(folder, "cv.pdf"), bytes);
}

export function writeFacts(text: string) {
  fs.mkdirSync(path.join(ROOT, "candidate"), { recursive: true });
  fs.writeFileSync(candidateFile("facts.md"), text.endsWith("\n") ? text : `${text}\n`);
}

export const listQuestions = (status?: Question["status"]) => core.listQuestions(db(), { status }) as Question[];
export const getQuestion = (id: number) => core.getQuestion(db(), id) as Question | null;
export const dismissQuestion = (id: number) => core.dismissQuestion(db(), id);

const ANSWERS_HEADING = "## Answers to questions";

// Saves an answer where later steps will read it: the job's notes for a job
// question, otherwise the facts file.
export function answerQuestion(id: number, answer: string) {
  const question = getQuestion(id);
  if (!question) throw new Error("This question no longer exists.");
  core.answerQuestion(db(), id, answer);
  const day = new Date().toISOString().slice(0, 10);
  if (question.job_id) {
    const job = getJob(question.job_id);
    if (job) {
      const note = `Q: ${question.text}\nA: ${answer} (${day})`;
      updateJob(job.id, { notes: job.notes ? `${job.notes}\n\n${note}` : note });
    }
    return;
  }
  appendFact(question.text, answer);
}

// Adds "- question → answer (answered date)" under the facts file's answers,
// the form every step and the form filler read.
export function appendFact(question: string, answer: string) {
  const day = new Date().toISOString().slice(0, 10);
  const facts = readFacts() ?? "# Facts not on the CV\n";
  const line = `- ${question.replace(/\s+/g, " ").trim()} → ${answer.replace(/\s+/g, " ").trim()} (answered ${day})`;
  writeFacts(
    facts.includes(ANSWERS_HEADING)
      ? facts.replace(ANSWERS_HEADING, `${ANSWERS_HEADING}\n\n${line}`).replace(/\n{3,}/g, "\n\n")
      : `${facts.trimEnd()}\n\n${ANSWERS_HEADING}\n\n${line}\n`,
  );
}

// The answered questions in the facts file, newest first.
export function answeredFacts() {
  return [...(readFacts() ?? "").matchAll(/^-\s*(.+?)\s*→\s*(.+?)\s*(?:\(answered [^)]*\))?\s*$/gm)].map((match) => ({ question: match[1], answer: match[2] }));
}

export const getSettings = () => core.getSettings(db()) as Settings;
export const setSettings = (patch: Partial<Settings>) => core.setSettings(db(), patch) as Settings;

// Jobs for lists: every match, without the long description (use getJob for it).
export const listJobs = (filter: { status?: Status | Status[]; since?: string; archived?: boolean; limit?: number } = {}) =>
  core.listJobs(db(), { ...filter, slim: true }) as Job[];
export const countJobs = (filter: { status?: Status | Status[]; since?: string } = {}) => core.countJobs(db(), filter);
// Jobs stored within the last `hours`, whatever their status.
export const listFoundWithin = (hours: number) =>
  listJobs({ since: new Date(Date.now() - hours * 3600000).toISOString() });
export const countFoundWithin = (hours: number) => countJobs({ since: new Date(Date.now() - hours * 3600000).toISOString() });
export const getJob =(id: number) => core.getJob(db(), id) as Job | null;
export const updateJob = (id: number, patch: Partial<Job>) => core.updateJob(db(), id, patch) as Job;
// Adds a job, or finds the one already stored (same link, or same title and company lately).
export const addJob = (job: Partial<Job> & { title: string; company: string }) => core.addJob(db(), job) as { id: number; created: boolean };
export const countByStatus = () => core.countByStatus(db()) as Record<Status, number>;

export const listContacts = (jobId: number) => core.listContacts(db(), jobId) as Contact[];
export const listDocuments = (jobId: number) => core.listDocuments(db(), jobId) as JobDocument[];
export const getDocument = (id: number) => core.getDocument(db(), id) as JobDocument | null;
// Application documents (not the research) the user has not approved yet.
export const unapprovedDocuments = (jobId: number) =>
  listDocuments(jobId).filter((doc) => !["research", "follow_up", "interview_pack"].includes(doc.type) && doc.review !== "approved");
export type DocumentWithJob = JobDocument & { job_title: string; job_company: string; job_role: string | null; job_status: Status };
export const listAllDocuments = (types?: string[]) => core.listAllDocuments(db(), types) as DocumentWithJob[];
export const listEvents = (jobId: number) => core.listEvents(db(), jobId) as JobEvent[];
export const listEventsByJob = (jobIds: number[]) => core.listEventsByJob(db(), jobIds) as Map<number, JobEvent[]>;
export const addEvent = (jobId: number, type: string, detail: string | null = null) => core.addEvent(db(), jobId, type, detail);
export const reviewDocument = (id: number, review: JobDocument["review"], note: string | null = null) =>
  core.reviewDocument(db(), id, review, note);

export const startRun = (run: {
  stage: string;
  jobId?: number | null;
  trigger?: string;
  engine?: string | null;
  conversationId?: number | null;
}) => core.startRun(db(), run) as number;
export const addProgress = (runId: number, line: string) => core.addProgress(db(), runId, line);

export const createConversation = (conversation: { title: string; engine: string; model?: string; effort?: string }) =>
  core.createConversation(db(), conversation);
export const getConversation = (id: number) => core.getConversation(db(), id) as Conversation | null;
export const listConversations = () => core.listConversations(db()) as Conversation[];
export const updateConversation = (id: number, patch: { title?: string; session_id?: string }) =>
  core.updateConversation(db(), id, patch);
export const deleteConversation = (id: number) => core.deleteConversation(db(), id);
export const addMessage = (conversationId: number, message: { role: Message["role"]; text: string; runId?: number | null }) =>
  core.addMessage(db(), conversationId, message);
export const listMessages = (conversationId: number) => core.listMessages(db(), conversationId) as Message[];
export const finishRun = (id: number, result: { status: Run["status"]; summary?: string | null; log?: string | null }) =>
  core.finishRun(db(), id, result);
// Recent runs without their long progress and log; `full` includes them.
export const listRuns = (limit = 50, options: { full?: boolean; offset?: number; status?: Run["status"] } = {}) => core.listRuns(db(), limit, options) as Run[];
export const countRuns = (options: { status?: Run["status"] } = {}) => core.countRuns(db(), options);
export const listRunningRuns = () => core.listRunningRuns(db()) as Run[];
export const getRun = (id: number) => core.getRun(db(), id) as Run | undefined;

const CONFIRMED_HEADING = "## Skills I confirmed";

// A skill the candidate confirmed while editing a CV, so every later step
// (research, tailoring, ATS fixes) treats it as true.
export function confirmSkill(skill: string, evidence: string) {
  const facts = readFacts() ?? "# Facts not on the CV\n";
  const day = new Date().toISOString().slice(0, 10);
  const line = `- ${skill}${evidence ? `: ${evidence}` : ""} (confirmed ${day})`;
  if (facts.toLowerCase().includes(`- ${skill.toLowerCase()}`)) return;
  writeFacts(
    facts.includes(CONFIRMED_HEADING)
      ? facts.replace(CONFIRMED_HEADING, `${CONFIRMED_HEADING}\n\n${line}`).replace(/\n{3,}/g, "\n\n")
      : `${facts.trimEnd()}\n\n${CONFIRMED_HEADING}\n\n${line}\n`,
  );
}

// Emails about applications, read from the user's Gmail by the extension.
export const hasMail = (messageId: string) => core.hasMail(db(), messageId);
export const addMail = (mail: Partial<Mail> & { message_id: string }) => core.addMail(db(), mail);
export const listMails = (filter: { state?: Mail["state"]; jobId?: number | null; limit?: number } = {}) => core.listMails(db(), filter) as Mail[];
export const getMail = (id: number) => core.getMail(db(), id) as Mail | null;
export const updateMail = (id: number, patch: { job_id?: number | null; state?: Mail["state"]; suggestion?: Status | null }) => core.updateMail(db(), id, patch);

// Whether saved jobs' listings are still open (core/liveness.mjs checks them).
export const setListing = (id: number, check: { state: NonNullable<Job["listing_state"]>; reason?: string | null }) => core.setListing(db(), id, check);
export const listingTargets = (options: { ids?: number[] | null; limit?: number } = {}) => core.listingTargets(db(), options);

// The archive: jobs set aside out of the lists, never deleted.
export const archiveJobs = (ids: number[], archived = true) => core.archiveJobs(db(), ids, archived);
export const archiveStale = (days: number) => core.archiveStale(db(), days);
