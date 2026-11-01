// Types for db.mjs, which stays plain JavaScript so Node can run it directly.
export type Db = { rootDir: string };
type Row = Record<string, unknown>;

export const STATUSES: string[];
export const DOCUMENT_TYPES: string[];
export const QUESTION_CATEGORIES: string[];

export function openDb(rootDir: string): Db;
export function getSettings(db: Db): Row;
export function setSettings(db: Db, patch: Row): Row;

export function addJob(db: Db, job: Row): { id: number; created: boolean };
export function updateJob(db: Db, id: number, patch: Row): Row;
export function getJob(db: Db, id: number): Row | null;
export function listJobs(db: Db, filter?: { status?: string | string[]; since?: string; limit?: number | null; slim?: boolean }): Row[];
export function countJobs(db: Db, filter?: { status?: string | string[]; since?: string }): number;
export function countByStatus(db: Db): Record<string, number>;

export function addContact(db: Db, jobId: number, contact: Row): number;
export function listContacts(db: Db, jobId: number): Row[];

export function saveDocument(db: Db, jobId: number, type: string, filePath: string): void;
export function reviewDocument(db: Db, id: number, review: string, note?: string | null): void;
export function listDocuments(db: Db, jobId: number): Row[];
export function getDocument(db: Db, id: number): Row | null;
export function listAllDocuments(db: Db, types?: string[]): Row[];

export function addEvent(db: Db, jobId: number, type: string, detail?: string | null): void;
export function listEvents(db: Db, jobId: number): Row[];
export function listEventsByJob(db: Db, jobIds: number[]): Map<number, Row[]>;

export function startRun(
  db: Db,
  run: { stage: string; jobId?: number | null; trigger?: string; engine?: string | null; conversationId?: number | null },
): number;
export function addProgress(db: Db, runId: number, line: string): void;

export function createConversation(
  db: Db,
  conversation: { title: string; engine: string; model?: string; effort?: string },
): number;
export function getConversation(db: Db, id: number): Row | null;
export function listConversations(db: Db, limit?: number): Row[];
export function updateConversation(db: Db, id: number, patch: { title?: string; session_id?: string }): void;
export function deleteConversation(db: Db, id: number): void;
export function addMessage(db: Db, conversationId: number, message: { role: string; text: string; runId?: number | null }): void;
export function listMessages(db: Db, conversationId: number): Row[];

export function askQuestion(
  db: Db,
  question: { text: string; why?: string | null; options?: string[] | null; job_id?: number | null; source?: string | null; category?: string | null },
): { id: number; created: boolean };
export function listQuestions(db: Db, filter?: { status?: string }): Row[];
export function getQuestion(db: Db, id: number): Row | null;
export function answerQuestion(db: Db, id: number, answer: string): void;
export function dismissQuestion(db: Db, id: number): void;
export function finishRun(
  db: Db,
  id: number,
  result: { status: string; summary?: string | null; log?: string | null },
): void;
export function listRuns(db: Db, limit?: number, options?: { full?: boolean; offset?: number; status?: string | null }): Row[];
export function countRuns(db: Db, options?: { status?: string | null }): number;
export function listRunningRuns(db: Db): Row[];
export function getRun(db: Db, id: number): Row | undefined;
export { EXPERIENCE_LEVELS } from "./levels.mjs";

export function hasMail(db: Db, messageId: string): boolean;
export function addMail(db: Db, mail: Row): boolean;
export function listMails(db: Db, filter?: { state?: string; jobId?: number | null; limit?: number }): Row[];
export function getMail(db: Db, id: number): Row | null;
export function updateMail(db: Db, id: number, patch: { job_id?: number | null; state?: string; suggestion?: string | null }): void;
