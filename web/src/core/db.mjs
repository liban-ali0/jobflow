// Shared data layer. Used by the web app and by scripts/jobs.mjs (which the
// Claude Code skills call), so it stays plain ESM with no dependencies.
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

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
  "rejected",
  "no_response",
  "excluded",
];

export const DOCUMENT_TYPES = ["cv", "cover_letter", "email", "answers", "research", "interview_pack"];

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
  status TEXT NOT NULL DEFAULT 'open',
  answer TEXT,
  created_at TEXT NOT NULL,
  answered_at TEXT
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS jobs_found_at ON jobs(found_at);
`;

const JOB_COLUMNS = [
  "title", "company", "country", "city", "work_mode", "role", "source", "url", "language",
  "description", "posted_at", "track", "score", "score_reason", "score_breakdown", "legitimacy",
  "salary_estimate", "status", "excluded_reason", "folder", "notes", "applied_at", "follow_up_due",
];

const now = () => new Date().toISOString();

// Columns added after the first release, for databases created before them.
const ADDED_COLUMNS = [
  ["runs", "engine", "TEXT"],
  ["runs", "progress", "TEXT"],
  ["runs", "conversation_id", "INTEGER"],
];

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

function readDefaults(rootDir) {
  return JSON.parse(fs.readFileSync(path.join(rootDir, "config", "defaults.json"), "utf8"));
}

export function getSettings(db) {
  const settings = readDefaults(db.rootDir);
  for (const row of db.prepare("SELECT key, value FROM settings").all()) {
    settings[row.key] = JSON.parse(row.value);
  }
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
  return { ...row, score_breakdown: row.score_breakdown ? JSON.parse(row.score_breakdown) : null };
}

function jobValues(job) {
  const values = {};
  for (const column of JOB_COLUMNS) {
    if (job[column] === undefined) continue;
    const value = job[column];
    values[column] = column === "score_breakdown" && value !== null ? JSON.stringify(value) : value;
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
  const existing =
    (job.url && db.prepare("SELECT id FROM jobs WHERE url = ?").get(job.url)) ||
    db
      .prepare("SELECT id FROM jobs WHERE lower(title) = lower(?) AND lower(company) = lower(?) AND found_at > ?")
      .get(job.title, job.company, new Date(Date.now() - 30 * 86400000).toISOString());
  if (existing) return { id: existing.id, created: false };

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

export function listJobs(db, { status, since, limit = 500 } = {}) {
  const where = [];
  const params = [];
  if (status) {
    const list = Array.isArray(status) ? status : [status];
    where.push(`status IN (${list.map(() => "?").join(", ")})`);
    params.push(...list);
  }
  if (since) {
    where.push("found_at >= ?");
    params.push(since);
  }
  const sql = `SELECT * FROM jobs ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY score IS NULL, score DESC, posted_at DESC LIMIT ?`;
  return db.prepare(sql).all(...params, limit).map(parseJob);
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
}

export function reviewDocument(db, id, review, note = null) {
  if (!["draft", "approved", "changes_requested"].includes(review)) throw new Error(`Unknown review "${review}"`);
  db.prepare("UPDATE documents SET review = ?, review_note = ?, updated_at = ? WHERE id = ?").run(review, note, now(), id);
}

export function listDocuments(db, jobId) {
  return db.prepare("SELECT * FROM documents WHERE job_id = ? ORDER BY id").all(jobId);
}

export function listEvents(db, jobId) {
  return db.prepare("SELECT * FROM events WHERE job_id = ? ORDER BY id DESC").all(jobId);
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
export function askQuestion(db, { text, why = null, options = null, job_id = null, source = null }) {
  if (!text || !String(text).trim()) throw new Error("A question needs text");
  if (options !== null && (!Array.isArray(options) || options.length < 2)) {
    throw new Error("options must be a list of at least two answers, or left out");
  }
  const existing = db
    .prepare("SELECT id FROM questions WHERE status = 'open' AND lower(text) = lower(?) AND job_id IS ?")
    .get(String(text).trim(), job_id);
  if (existing) return { id: existing.id, created: false };
  const result = db
    .prepare("INSERT INTO questions (text, why, options, job_id, source, created_at) VALUES (?, ?, ?, ?, ?, ?)")
    .run(String(text).trim(), why, options ? JSON.stringify(options.map(String)) : null, job_id, source, now());
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

export function listRuns(db, limit = 50) {
  return db.prepare("SELECT * FROM runs ORDER BY id DESC LIMIT ?").all(limit);
}

export function getRun(db, id) {
  return db.prepare("SELECT * FROM runs WHERE id = ?").get(id);
}

export function countByStatus(db) {
  const counts = Object.fromEntries(STATUSES.map((s) => [s, 0]));
  for (const row of db.prepare("SELECT status, COUNT(*) AS n FROM jobs GROUP BY status").all()) counts[row.status] = row.n;
  return counts;
}
