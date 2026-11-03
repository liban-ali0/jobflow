// Shared data layer. Used by the web app and by scripts/jobs.mjs (which the
// Claude Code skills call), so it stays plain ESM with no dependencies.
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { EXPERIENCE_LEVELS } from "./levels.mjs";

import { siteOf } from "./reposts.mjs";

export { EXPERIENCE_LEVELS };

export const STATUSES = [
  "found",
  "ranked",
  "selected",
  "researched",
  "ready",
  "applied",
  "replied",
  "interview",
  "offer",
  "accepted",
  "declined",
  "rejected",
  "withdrawn",
  "no_response",
  "excluded",
];

export const DOCUMENT_TYPES = ["cv", "cover_letter", "email", "answers", "research", "follow_up", "interview_pack"];

const SCHEMA = `
CREATE TABLE IF NOT EXISTS jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  company TEXT NOT NULL,
  country TEXT,
  city TEXT,
  work_mode TEXT,
  role TEXT,
  source TEXT,
  url TEXT UNIQUE,
  language TEXT,
  description TEXT,
  posted_at TEXT,
  found_at TEXT NOT NULL,
  track TEXT NOT NULL DEFAULT 'standard',
  score REAL,
  score_reason TEXT,
  score_breakdown TEXT,
  legitimacy TEXT,
  salary_estimate TEXT,
  status TEXT NOT NULL DEFAULT 'found',
  excluded_reason TEXT,
  folder TEXT,
  notes TEXT,
  applied_at TEXT,
  follow_up_due TEXT,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS contacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  role TEXT,
  email TEXT,
  email_verified INTEGER NOT NULL DEFAULT 0,
  linkedin TEXT,
  notes TEXT
);
CREATE TABLE IF NOT EXISTS documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  path TEXT NOT NULL,
  review TEXT NOT NULL DEFAULT 'draft',
  review_note TEXT,
  updated_at TEXT NOT NULL,
  UNIQUE (job_id, type)
);
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  at TEXT NOT NULL,
  type TEXT NOT NULL,
  detail TEXT
);
CREATE TABLE IF NOT EXISTS runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  stage TEXT NOT NULL,
  job_id INTEGER,
  trigger TEXT NOT NULL DEFAULT 'manual',
  status TEXT NOT NULL DEFAULT 'running',
  started_at TEXT NOT NULL,
  finished_at TEXT,
  summary TEXT,
  log TEXT
);
CREATE TABLE IF NOT EXISTS conversations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  engine TEXT NOT NULL,
  model TEXT,
  effort TEXT,
  session_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  text TEXT NOT NULL,
  run_id INTEGER,
  at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS questions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  text TEXT NOT NULL,
  why TEXT,
  options TEXT,
  job_id INTEGER,
  source TEXT,
  category TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  answer TEXT,
  created_at TEXT NOT NULL,
  answered_at TEXT
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
-- Emails from the user's mailbox about their applications, read by the
-- browser extension. Mail that is about nothing the user applied to is kept
-- only as its id (state 'ignored'), so it is not read again.
CREATE TABLE IF NOT EXISTS mails (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  message_id TEXT NOT NULL UNIQUE,
  job_id INTEGER REFERENCES jobs(id) ON DELETE SET NULL,
  from_name TEXT,
  from_email TEXT,
  subject TEXT,
  snippet TEXT,
  link TEXT,
  received_at TEXT,
  kind TEXT,
  evidence TEXT,
  suggestion TEXT,
  state TEXT NOT NULL DEFAULT 'new',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS mails_state ON mails(state);
CREATE INDEX IF NOT EXISTS jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS jobs_found_at ON jobs(found_at);
CREATE INDEX IF NOT EXISTS jobs_applied_at ON jobs(applied_at);
CREATE INDEX IF NOT EXISTS events_job ON events(job_id);
CREATE INDEX IF NOT EXISTS contacts_job ON contacts(job_id);
CREATE INDEX IF NOT EXISTS runs_status ON runs(status);
CREATE INDEX IF NOT EXISTS runs_stage ON runs(stage, id);
CREATE INDEX IF NOT EXISTS questions_status ON questions(status);
`;

const JOB_COLUMNS = [
  "title", "company", "country", "city", "work_mode", "role", "source", "url", "language",
  "description", "posted_at", "track", "score", "score_reason", "score_breakdown", "legitimacy",
  "salary_estimate", "status", "excluded_reason", "folder", "notes", "applied_at", "follow_up_due",
  "apply_state", "apply_missing", "interview_at", "listing_state", "listing_reason", "listing_checked_at", "relisted_count", "relisted_at", "archived_at", "offer",
];

const now = () => new Date().toISOString();

// Columns added after the first release, for databases created before them.
const ADDED_COLUMNS = [
  ["runs", "engine", "TEXT"],
  ["runs", "progress", "TEXT"],
  ["runs", "conversation_id", "INTEGER"],
  ["questions", "category", "TEXT"],
  // Applying through the extension: "waiting" while the user finishes the
  // form, with the reasons as a JSON list.
  ["jobs", "apply_state", "TEXT"],
  ["jobs", "apply_missing", "TEXT"],
  // When the interview is (ISO time), if the user gave it.
  ["jobs", "interview_at", "TEXT"],
  // Whether the listing is still open (open, closed, unsure, or kept when the
  // user says it is open), why, and when that was checked.
  ["jobs", "listing_state", "TEXT"],
  ["jobs", "listing_reason", "TEXT"],
  ["jobs", "listing_checked_at", "TEXT"],
  // How often the same opening was found again under a new link, and when last.
  ["jobs", "relisted_count", "INTEGER"],
  ["jobs", "relisted_at", "TEXT"],
  // Set aside out of the lists (never deleted): unpicked jobs whose posting
  // is too old, or any job the user archived before applying.
  ["jobs", "archived_at", "TEXT"],
  // The offer's terms the user entered (JSON, see lib/offers.ts).
  ["jobs", "offer", "TEXT"],
];

// What a question is about: the candidate in general, a gap in their CV, or
// one job. Older questions without a category count by their job.
export const QUESTION_CATEGORIES = ["you", "cv", "job"];

function migrate(db) {
  for (const [table, column, type] of ADDED_COLUMNS) {
    const exists = db.prepare(`SELECT 1 FROM pragma_table_info('${table}') WHERE name = ?`).get(column);
    if (!exists) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
  }
}

export function openDb(rootDir) {
  const dataDir = path.join(rootDir, "data");
  fs.mkdirSync(dataDir, { recursive: true });
  const db = new DatabaseSync(path.join(dataDir, "jobflow.db"));
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
  db.exec(SCHEMA);
  migrate(db);
  db.rootDir = rootDir;
  return db;
}

// Settings saved before levels existed described a junior search: these are
// the levels and title words its collector used.
const JUNIOR_SEARCH = {
  levels: ["entry", "associate", "mid-senior"],
  skipTitles: ["senior", "snr", "sr", "lead", "principal", "head", "manager", "director", "architect", "staff", "chief", "vp", "vice president", "expert"],
};

function normalizeExperience(experience = {}) {
  if (Array.isArray(experience.levels)) return { maxYears: null, skipTitles: [], ...experience };
  const { maxYears = null } = experience;
  return { maxYears, ...JUNIOR_SEARCH };
}

function readDefaults(rootDir) {
  return JSON.parse(fs.readFileSync(path.join(rootDir, "config", "defaults.json"), "utf8"));
}

// Sources are defined by the code (config/defaults.json); only the user's
// on/off choice is saved, so sources added later appear in every copy.
function normalizeSources(defaults, saved) {
  const enabled = new Map((saved ?? []).map((source) => [source.key, source.enabled]));
  return defaults.map((source) => ({ ...source, enabled: enabled.get(source.key) ?? source.enabled }));
}

export function getSettings(db) {
  const defaults = readDefaults(db.rootDir);
  const settings = structuredClone(defaults);
  for (const row of db.prepare("SELECT key, value FROM settings").all()) {
    settings[row.key] = JSON.parse(row.value);
  }
  settings.experience = normalizeExperience(settings.experience);
  settings.sources = normalizeSources(defaults.sources, settings.sources);
  // Email settings saved before a key existed take its default.
  settings.email = { ...defaults.email, ...settings.email };
  return settings;
}

export function setSettings(db, patch) {
  const stmt = db.prepare(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  );
  for (const [key, value] of Object.entries(patch)) stmt.run(key, JSON.stringify(value));
  return getSettings(db);
}

function parseJob(row) {
  if (!row) return null;
  return {
    ...row,
    score_breakdown: row.score_breakdown ? JSON.parse(row.score_breakdown) : null,
    apply_missing: row.apply_missing ? JSON.parse(row.apply_missing) : null,
    offer: row.offer ? JSON.parse(row.offer) : null,
  };
}

function jobValues(job) {
  const values = {};
  for (const column of JOB_COLUMNS) {
    if (job[column] === undefined) continue;
    const value = job[column];
    values[column] = (column === "score_breakdown" || column === "apply_missing" || column === "offer") && value !== null ? JSON.stringify(value) : value;
  }
  if (values.status !== undefined && !STATUSES.includes(values.status)) {
    throw new Error(`Unknown status "${values.status}". Use one of: ${STATUSES.join(", ")}`);
  }
  return values;
}

export function addEvent(db, jobId, type, detail = null) {
  db.prepare("INSERT INTO events (job_id, at, type, detail) VALUES (?, ?, ?, ?)").run(jobId, now(), type, detail);
}

// Adds a job, or returns the existing one when the same url (or the same
// title and company) is already stored.
export function addJob(db, job) {
  if (!job.title || !job.company) throw new Error("A job needs a title and a company");
  const byUrl = job.url && db.prepare("SELECT id FROM jobs WHERE url = ?").get(job.url);
  if (byUrl) return { id: byUrl.id, created: false };
  // The same title at the same company, in the same country and on the same
  // site, within 30 days is the same opening (another country is another
  // opening). Under a new link on a later day it was listed again: noted on
  // the job (a repost after applying usually means the role is still open).
  const same = db
    .prepare("SELECT id, url, country, found_at, relisted_at FROM jobs WHERE lower(title) = lower(?) AND lower(company) = lower(?) AND found_at > ? ORDER BY found_at DESC")
    .all(job.title, job.company, new Date(Date.now() - 30 * 86400000).toISOString())
    .find((row) => (row.country ?? "") === (job.country ?? "") && siteOf(row.url ?? "") === siteOf(job.url ?? ""));
  if (same) {
    const last = Date.parse(same.relisted_at ?? same.found_at);
    if (job.url && job.url !== same.url && Date.now() - last >= 20 * 3600000) {
      // The new listing's date keeps the job fresh on the board.
      db.prepare("UPDATE jobs SET relisted_count = COALESCE(relisted_count, 0) + 1, relisted_at = ?, posted_at = COALESCE(?, posted_at) WHERE id = ?").run(now(), job.posted_at ?? null, same.id);
      addEvent(db, same.id, "relisted", job.url);
      return { id: same.id, created: false, relisted: true };
    }
    return { id: same.id, created: false };
  }

  const values = { ...jobValues(job), found_at: now(), updated_at: now() };
  const columns = Object.keys(values);
  const result = db
    .prepare(`INSERT INTO jobs (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`)
    .run(...columns.map((c) => values[c]));
  const id = Number(result.lastInsertRowid);
  addEvent(db, id, "found", job.source ?? null);
  return { id, created: true };
}

export function updateJob(db, id, patch) {
  const current = db.prepare("SELECT status FROM jobs WHERE id = ?").get(id);
  if (!current) throw new Error(`No job with id ${id}`);
  const values = { ...jobValues(patch), updated_at: now() };
  if (values.status === "applied" && patch.applied_at === undefined) values.applied_at = now();
  // Picking an archived job (or anything but excluding it) brings it back.
  if (values.status && values.status !== current.status && values.status !== "excluded" && values.archived_at === undefined) values.archived_at = null;
  const columns = Object.keys(values);
  db.prepare(`UPDATE jobs SET ${columns.map((c) => `${c} = ?`).join(", ")} WHERE id = ?`).run(
    ...columns.map((c) => values[c]),
    id,
  );
  if (values.status && values.status !== current.status) {
    addEvent(db, id, "status", `${current.status} → ${values.status}`);
  }
  return getJob(db, id);
}

export function getJob(db, id) {
  return parseJob(db.prepare("SELECT * FROM jobs WHERE id = ?").get(id));
}

// Every column but the long description, for lists.
const JOB_LIST_COLUMNS = `id, ${JOB_COLUMNS.filter((column) => column !== "description").join(", ")}, found_at, updated_at, description IS NOT NULL AS has_description`;

function jobFilter({ status, since, archived }) {
  const where = [];
  const params = [];
  // true: only archived jobs; false: only the rest; undefined: all.
  if (archived === true) where.push("archived_at IS NOT NULL");
  if (archived === false) where.push("archived_at IS NULL");
  if (status) {
    const list = Array.isArray(status) ? status : [status];
    where.push(`status IN (${list.map(() => "?").join(", ")})`);
    params.push(...list);
  }
  if (since) {
    where.push("found_at >= ?");
    params.push(since);
  }
  return { where: where.length ? `WHERE ${where.join(" AND ")}` : "", params };
}

// All matching jobs (no limit unless one is given). `slim` leaves out the
// description, which lists never show.
export function listJobs(db, { status, since, archived, limit = null, slim = false } = {}) {
  const { where, params } = jobFilter({ status, since, archived });
  const sql = `SELECT ${slim ? JOB_LIST_COLUMNS : "*"} FROM jobs ${where}
    ORDER BY score IS NULL, score DESC, posted_at DESC${limit ? " LIMIT ?" : ""}`;
  return db.prepare(sql).all(...params, ...(limit ? [limit] : [])).map(parseJob);
}

export function countJobs(db, filter = {}) {
  const { where, params } = jobFilter(filter);
  return db.prepare(`SELECT COUNT(*) AS n FROM jobs ${where}`).get(...params).n;
}

export function addContact(db, jobId, contact) {
  if (!contact.name) throw new Error("A contact needs a name");
  const result = db
    .prepare(
      "INSERT INTO contacts (job_id, name, role, email, email_verified, linkedin, notes) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .run(
      jobId,
      contact.name,
      contact.role ?? null,
      contact.email ?? null,
      contact.email_verified ? 1 : 0,
      contact.linkedin ?? null,
      contact.notes ?? null,
    );
  return Number(result.lastInsertRowid);
}

export function listContacts(db, jobId) {
  return db.prepare("SELECT * FROM contacts WHERE job_id = ? ORDER BY id").all(jobId);
}

// The contacts of many jobs in one query: Map<jobId, contacts>.
export function listContactsByJob(db, jobIds) {
  const byJob = new Map(jobIds.map((id) => [id, []]));
  if (!jobIds.length) return byJob;
  for (const row of db.prepare("SELECT * FROM contacts WHERE job_id IN (SELECT value FROM json_each(?)) ORDER BY id").all(JSON.stringify(jobIds))) {
    byJob.get(row.job_id)?.push(row);
  }
  return byJob;
}

// Registers a document file for a job. Saving a new version resets its review.
export function saveDocument(db, jobId, type, filePath) {
  if (!DOCUMENT_TYPES.includes(type)) {
    throw new Error(`Unknown document type "${type}". Use one of: ${DOCUMENT_TYPES.join(", ")}`);
  }
  const relative = path.isAbsolute(filePath) ? path.relative(db.rootDir, filePath) : filePath;
  db.prepare(
    `INSERT INTO documents (job_id, type, path, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(job_id, type) DO UPDATE SET path = excluded.path, review = 'draft', review_note = NULL, updated_at = excluded.updated_at`,
  ).run(jobId, type, relative.split(path.sep).join("/"), now());
  addEvent(db, jobId, "document", type);
  // A new version of a package document waits for approval again, so a job
  // that was ready to apply is not any more.
  if (["cv", "cover_letter", "email", "answers"].includes(type) && getJob(db, jobId)?.status === "ready") updateJob(db, jobId, { status: "researched" });
}

export function reviewDocument(db, id, review, note = null) {
  if (!["draft", "approved", "changes_requested"].includes(review)) throw new Error(`Unknown review "${review}"`);
  db.prepare("UPDATE documents SET review = ?, review_note = ?, updated_at = ? WHERE id = ?").run(review, note, now(), id);
}

export function listDocuments(db, jobId) {
  return db.prepare("SELECT * FROM documents WHERE job_id = ? ORDER BY id").all(jobId);
}

export function getDocument(db, id) {
  return db.prepare("SELECT * FROM documents WHERE id = ?").get(id) ?? null;
}

// Documents of the given types across all jobs, newest first, with the
// job's title, company, role, and status.
export function listAllDocuments(db, types = DOCUMENT_TYPES) {
  const marks = types.map(() => "?").join(", ");
  return db
    .prepare(
      `SELECT d.*, j.title AS job_title, j.company AS job_company, j.role AS job_role, j.status AS job_status
       FROM documents d JOIN jobs j ON j.id = d.job_id
       WHERE d.type IN (${marks}) ORDER BY d.updated_at DESC`,
    )
    .all(...types);
}

export function listEvents(db, jobId) {
  return db.prepare("SELECT * FROM events WHERE job_id = ? ORDER BY id DESC").all(jobId);
}

// Events of many jobs in one query, newest first, grouped by job.
export function listEventsByJob(db, jobIds) {
  const byJob = new Map(jobIds.map((id) => [id, []]));
  if (!jobIds.length) return byJob;
  for (const row of db.prepare(`SELECT * FROM events WHERE job_id IN (SELECT value FROM json_each(?)) ORDER BY id DESC`).all(JSON.stringify(jobIds))) {
    byJob.get(row.job_id)?.push(row);
  }
  return byJob;
}

export function startRun(db, { stage, jobId = null, trigger = "manual", engine = null, conversationId = null }) {
  const result = db
    .prepare("INSERT INTO runs (stage, job_id, trigger, engine, conversation_id, started_at) VALUES (?, ?, ?, ?, ?, ?)")
    .run(stage, jobId, trigger, engine, conversationId, now());
  return Number(result.lastInsertRowid);
}

const PROGRESS_LIMIT = 200;

// Live progress of a run: a list of short lines such as "Ran node scripts/…".
export function addProgress(db, runId, line) {
  const row = db.prepare("SELECT progress FROM runs WHERE id = ?").get(runId);
  const lines = row?.progress ? JSON.parse(row.progress) : [];
  lines.push({ at: now(), text: String(line).slice(0, 500) });
  db.prepare("UPDATE runs SET progress = ? WHERE id = ?").run(JSON.stringify(lines.slice(-PROGRESS_LIMIT)), runId);
}

export function createConversation(db, { title, engine, model = "", effort = "" }) {
  const result = db
    .prepare(
      "INSERT INTO conversations (title, engine, model, effort, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .run(title, engine, model, effort, now(), now());
  return Number(result.lastInsertRowid);
}

export function getConversation(db, id) {
  return db.prepare("SELECT * FROM conversations WHERE id = ?").get(id) ?? null;
}

export function listConversations(db, limit = 50) {
  return db.prepare("SELECT * FROM conversations ORDER BY updated_at DESC LIMIT ?").all(limit);
}

export function updateConversation(db, id, patch) {
  const allowed = ["title", "session_id"];
  const columns = Object.keys(patch).filter((key) => allowed.includes(key));
  db.prepare(`UPDATE conversations SET ${[...columns.map((c) => `${c} = ?`), "updated_at = ?"].join(", ")} WHERE id = ?`).run(
    ...columns.map((c) => patch[c]),
    now(),
    id,
  );
}

export function deleteConversation(db, id) {
  db.prepare("DELETE FROM conversations WHERE id = ?").run(id);
}

export function addMessage(db, conversationId, { role, text, runId = null }) {
  db.prepare("INSERT INTO messages (conversation_id, role, text, run_id, at) VALUES (?, ?, ?, ?, ?)").run(
    conversationId,
    role,
    text,
    runId,
    now(),
  );
  updateConversation(db, conversationId, {});
}

// Questions an engine asks the user. Asking the same open question twice
// returns the existing one.
export function askQuestion(db, { text, why = null, options = null, job_id = null, source = null, category = null }) {
  if (!text || !String(text).trim()) throw new Error("A question needs text");
  if (category !== null && !QUESTION_CATEGORIES.includes(category)) {
    throw new Error(`category must be one of: ${QUESTION_CATEGORIES.join(", ")}`);
  }
  const kind = category ?? (job_id ? "job" : "you");
  // An empty list means no fixed answers, as leaving it out does.
  if (Array.isArray(options) && options.length === 0) options = null;
  if (options !== null && (!Array.isArray(options) || options.length < 2)) {
    throw new Error("options must be a list of at least two answers, or left out");
  }
  const existing = db
    .prepare("SELECT id FROM questions WHERE status = 'open' AND lower(text) = lower(?) AND job_id IS ?")
    .get(String(text).trim(), job_id);
  if (existing) return { id: existing.id, created: false };
  const result = db
    .prepare("INSERT INTO questions (text, why, options, job_id, source, category, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(String(text).trim(), why, options ? JSON.stringify(options.map(String)) : null, job_id, source, kind, now());
  return { id: Number(result.lastInsertRowid), created: true };
}

function parseQuestion(row) {
  return row ? { ...row, options: row.options ? JSON.parse(row.options) : null } : null;
}

export function listQuestions(db, { status } = {}) {
  const rows = status
    ? db.prepare("SELECT * FROM questions WHERE status = ? ORDER BY id DESC").all(status)
    : db.prepare("SELECT * FROM questions ORDER BY id DESC").all();
  return rows.map(parseQuestion);
}

export function getQuestion(db, id) {
  return parseQuestion(db.prepare("SELECT * FROM questions WHERE id = ?").get(id));
}

export function answerQuestion(db, id, answer) {
  db.prepare("UPDATE questions SET status = 'answered', answer = ?, answered_at = ? WHERE id = ?").run(answer, now(), id);
}

export function dismissQuestion(db, id) {
  db.prepare("UPDATE questions SET status = 'dismissed', answered_at = ? WHERE id = ?").run(now(), id);
}

export function listMessages(db, conversationId) {
  return db.prepare("SELECT * FROM messages WHERE conversation_id = ? ORDER BY id").all(conversationId);
}

export function finishRun(db, id, { status, summary = null, log = null }) {
  db.prepare("UPDATE runs SET status = ?, summary = ?, log = ?, finished_at = ? WHERE id = ?").run(
    status,
    summary,
    log,
    now(),
    id,
  );
}

// Recent runs. Without `full`, the long progress and log are left out and the
// summary is shortened: enough for status checks and lists.
export function listRuns(db, limit = 50, { full = false, offset = 0, status = null } = {}) {
  const columns = full ? "*" : "id, stage, job_id, trigger, engine, conversation_id, status, started_at, finished_at, substr(summary, 1, 3000) AS summary, NULL AS progress, NULL AS log";
  const where = status ? "WHERE status = ?" : "";
  return db.prepare(`SELECT ${columns} FROM runs ${where} ORDER BY id DESC LIMIT ? OFFSET ?`).all(...(status ? [status] : []), limit, offset);
}

export function countRuns(db, { status = null } = {}) {
  return status ? db.prepare("SELECT COUNT(*) AS n FROM runs WHERE status = ?").get(status).n : db.prepare("SELECT COUNT(*) AS n FROM runs").get().n;
}

export function listRunningRuns(db) {
  return db.prepare("SELECT id, stage, job_id, trigger, engine, conversation_id, status, started_at FROM runs WHERE status = 'running' ORDER BY id DESC").all();
}

export function getRun(db, id) {
  return db.prepare("SELECT * FROM runs WHERE id = ?").get(id);
}

export function countByStatus(db) {
  const counts = Object.fromEntries(STATUSES.map((s) => [s, 0]));
  // The workflow's counts: archived jobs are out of the way.
  for (const row of db.prepare("SELECT status, COUNT(*) AS n FROM jobs WHERE archived_at IS NULL GROUP BY status").all()) counts[row.status] = row.n;
  return counts;
}

// ---------- emails about applications ----------

export function hasMail(db, messageId) {
  return Boolean(db.prepare("SELECT 1 FROM mails WHERE message_id = ?").get(messageId));
}

// Stores one email (once per message id). Returns whether it was new.
export function addMail(db, mail) {
  const result = db
    .prepare(
      `INSERT OR IGNORE INTO mails (message_id, job_id, from_name, from_email, subject, snippet, link, received_at, kind, evidence, suggestion, state, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      mail.message_id,
      mail.job_id ?? null,
      mail.from_name ?? null,
      mail.from_email ?? null,
      mail.subject ?? null,
      mail.snippet ?? null,
      mail.link ?? null,
      mail.received_at ?? null,
      mail.kind ?? null,
      mail.evidence ?? null,
      mail.suggestion ?? null,
      mail.state ?? "new",
      now(),
    );
  return result.changes > 0;
}

// Emails waiting for the user (state 'new'), newest first, with their job.
export function listMails(db, { state = "new", jobId = null, limit = 100 } = {}) {
  const where = ["m.state = ?"];
  const params = [state];
  if (jobId !== null) {
    where.push("m.job_id = ?");
    params.push(jobId);
  }
  return db
    .prepare(
      `SELECT m.*, j.title AS job_title, j.company AS job_company, j.status AS job_status
       FROM mails m LEFT JOIN jobs j ON j.id = m.job_id
       WHERE ${where.join(" AND ")} ORDER BY m.received_at DESC, m.id DESC LIMIT ?`,
    )
    .all(...params, limit)
    // Plain objects: the app hands these to the browser.
    .map((row) => ({ ...row }));
}

export function getMail(db, id) {
  const row = db.prepare("SELECT * FROM mails WHERE id = ?").get(id);
  return row ? { ...row } : null;
}

export function updateMail(db, id, patch) {
  const allowed = ["job_id", "state", "suggestion"];
  const columns = Object.keys(patch).filter((key) => allowed.includes(key));
  if (!columns.length) return;
  db.prepare(`UPDATE mails SET ${columns.map((c) => `${c} = ?`).join(", ")} WHERE id = ?`).run(...columns.map((c) => patch[c]), id);
}

// ---------- is the listing still open ----------

// Jobs worth checking: not yet given up, not decided by the employer. The
// ones the user is working on are checked daily, the rest every three days.
const LISTING_ACTIVE = ["selected", "researched", "ready"];
const LISTING_CHECKED = ["found", "ranked", ...LISTING_ACTIVE, "applied"];

export function listingTargets(db, { ids = null, limit = 60 } = {}) {
  if (ids) {
    const list = ids.filter((id) => Number.isInteger(id) && id > 0);
    if (!list.length) return [];
    return db.prepare(`SELECT id, title, company, url, status FROM jobs WHERE id IN (${list.map(() => "?").join(", ")})`).all(...list).map((row) => ({ ...row }));
  }
  const day = 24 * 3600000;
  const recent = new Date(Date.now() - day + 3600000).toISOString();
  const older = new Date(Date.now() - 3 * day + 3600000).toISOString();
  return db
    .prepare(
      `SELECT id, title, company, url, status FROM jobs
       WHERE status IN (${LISTING_CHECKED.map(() => "?").join(", ")}) AND url LIKE 'http%' AND archived_at IS NULL
         AND (listing_state IS NULL OR listing_state NOT IN ('closed', 'kept'))
         AND (listing_checked_at IS NULL OR listing_checked_at < CASE WHEN status IN (${LISTING_ACTIVE.map(() => "?").join(", ")}) THEN ? ELSE ? END)
       ORDER BY CASE status WHEN 'ready' THEN 0 WHEN 'researched' THEN 1 WHEN 'selected' THEN 2 WHEN 'ranked' THEN 3 WHEN 'applied' THEN 4 ELSE 5 END,
         listing_checked_at IS NOT NULL, listing_checked_at, score IS NULL, score DESC, id DESC
       LIMIT ?`,
    )
    .all(...LISTING_CHECKED, ...LISTING_ACTIVE, recent, older, limit)
    .map((row) => ({ ...row }));
}

// Stores a check without touching updated_at: nothing about the job changed.
export function setListing(db, id, { state, reason = null }) {
  if (!["open", "closed", "unsure", "kept"].includes(state)) throw new Error(`Unknown listing state "${state}"`);
  db.prepare("UPDATE jobs SET listing_state = ?, listing_reason = ?, listing_checked_at = ? WHERE id = ?").run(state, reason, now(), id);
}

// ---------- the archive ----------

// Jobs that can be archived: not yet applied to. Applications stay on the
// Board, where their outcome matters.
export const ARCHIVABLE = ["found", "ranked", "selected", "researched", "ready", "excluded"];

export function archiveJobs(db, ids, archived = true) {
  const archive = db.prepare(`UPDATE jobs SET archived_at = ? WHERE id = ? AND archived_at IS NULL AND status IN (${ARCHIVABLE.map(() => "?").join(", ")})`);
  const bringBack = db.prepare("UPDATE jobs SET archived_at = NULL WHERE id = ? AND archived_at IS NOT NULL");
  let changed = 0;
  for (const id of new Set(ids.filter((id) => Number.isInteger(id) && id > 0))) {
    const result = archived ? archive.run(now(), id, ...ARCHIVABLE) : bringBack.run(id);
    if (!result.changes) continue;
    addEvent(db, id, archived ? "archived" : "unarchived");
    changed++;
  }
  return changed;
}

// Archives the jobs the user never picked (not ranked, ranked, excluded)
// whose posting is older than `days`. Picked jobs are never archived on
// their own. Returns how many.
export function archiveStale(db, days) {
  if (!days || days <= 0) return 0;
  const cutoff = new Date(Date.now() - days * 86400000).toISOString();
  const rows = db
    .prepare("SELECT id FROM jobs WHERE archived_at IS NULL AND status IN ('found', 'ranked', 'excluded') AND COALESCE(posted_at, found_at) < ?")
    .all(cutoff);
  if (!rows.length) return 0;
  const at = now();
  const mark = db.prepare("UPDATE jobs SET archived_at = ? WHERE id = ?");
  for (const { id } of rows) {
    mark.run(at, id);
    addEvent(db, id, "archived", "posting too old");
  }
  return rows.length;
}
