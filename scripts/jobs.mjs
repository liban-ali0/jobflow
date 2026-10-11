#!/usr/bin/env node
// Command-line access to the job database, used by the Claude Code skills.
// JSON input is read from --file <path> or from stdin, so nothing depends on
// shell quoting rules.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Node's built-in SQLite prints an experimental notice on every run. It is
// silenced here so the output stays clean JSON.
const emitWarning = process.emitWarning;
process.emitWarning = (warning, ...rest) => {
  const type = typeof rest[0] === "string" ? rest[0] : rest[0]?.type;
  if (type !== "ExperimentalWarning") emitWarning.call(process, warning, ...rest);
};
const core = await import("../web/src/core/db.mjs");
const { scoreJob, normalizeAssessment, ASSESSED } = await import("../web/src/core/score.mjs");

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const HELP = `Usage: node scripts/jobs.mjs <command>

  settings                         Print the current settings
  rules [--file <path>]            Print the extra ranking rules, or replace them with the file's text
  ask                              Ask the user a question in the app (JSON: text, why, options, job_id)
  questions [--status <s>]         List questions: open, answered, dismissed (default: all)
  list [--status a,b] [--since ISO]  List jobs
  get <id>                         One job with contacts, documents, history
  add                              Add jobs (JSON object or array)
  update <id>                      Update a job (JSON object of fields)
  status <id> <status> [reason]    Change a job's status
  score <id>                       Score a job from an assessment (JSON object)
  contact <id>                     Add a contact to a job (JSON object)
  document <id> <type> <path>      Register a document file for a job
  folder <id>                      Create and print the job's folder
  statuses                         Print valid statuses and document types

JSON input: --file <path>, or piped through stdin.`;

function readInput(args) {
  const index = args.indexOf("--file");
  const raw = index >= 0 ? fs.readFileSync(args[index + 1], "utf8") : fs.readFileSync(0, "utf8");
  return JSON.parse(raw.replace(/^﻿/, ""));
}

function option(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function slug(text) {
  return String(text)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

function requireJob(db, id) {
  const job = core.getJob(db, Number(id));
  if (!job) throw new Error(`No job with id ${id}`);
  return job;
}

function main() {
  const [command, ...args] = process.argv.slice(2);
  if (!command || command === "help" || command === "--help") return console.log(HELP);

  const db = core.openDb(ROOT);
  const print = (value) => console.log(JSON.stringify(value, null, 2));

  switch (command) {
    case "settings":
      return print(core.getSettings(db));
    case "rules": {
      const index = args.indexOf("--file");
      if (index >= 0) {
        const text = fs.readFileSync(args[index + 1], "utf8").replace(/^﻿/, "").replace(/\r\n/g, "\n").trim();
        core.setSettings(db, { customRules: text });
      }
      return console.log(core.getSettings(db).customRules || "(no extra rules)");
    }
    case "ask": {
      const input = readInput(args);
      const source = process.env.JOBFLOW_RUN_ID ? `run ${process.env.JOBFLOW_RUN_ID}` : "command line";
      const questions = Array.isArray(input) ? input : [input];
      return print(questions.map((question) => ({ text: question.text, ...core.askQuestion(db, { ...question, source }) })));
    }
    case "questions":
      return print(core.listQuestions(db, { status: option(args, "--status") }));
    case "statuses":
      return print({ statuses: core.STATUSES, documentTypes: core.DOCUMENT_TYPES });
    case "list": {
      const status = option(args, "--status");
      const jobs = core.listJobs(db, { status: status ? status.split(",") : undefined, since: option(args, "--since") });
      // The description is long, so it is left out of lists.
      return print(jobs.map(({ description, ...job }) => job));
    }
    case "get": {
      const job = requireJob(db, args[0]);
      return print({
        ...job,
        contacts: core.listContacts(db, job.id),
        documents: core.listDocuments(db, job.id),
        events: core.listEvents(db, job.id),
      });
    }
    case "add": {
      const input = readInput(args);
      const results = (Array.isArray(input) ? input : [input]).map((job) => ({
        title: job.title,
        company: job.company,
        ...core.addJob(db, job),
      }));
      return print(results);
    }
    case "update":
      requireJob(db, args[0]);
      return print(core.updateJob(db, Number(args[0]), readInput(args)));
    case "status": {
      const [id, status, ...reason] = args;
      requireJob(db, id);
      const patch = { status };
      if (status === "excluded" && reason.length) patch.excluded_reason = reason.join(" ");
      const job = core.updateJob(db, Number(id), patch);
      return print({ id: job.id, status: job.status });
    }
    case "score": {
      const job = requireJob(db, args[0]);
      const assessment = normalizeAssessment(readInput(args));
      const missing = Object.keys(ASSESSED).filter((key) => assessment[key] === undefined && !assessment.exclude);
      if (missing.length) throw new Error(`The assessment is missing: ${missing.join(", ")}`);
      const { score, breakdown, excluded } = scoreJob(job, core.getSettings(db), assessment);
      const patch = {
        score: excluded ? null : score,
        score_breakdown: excluded ? null : breakdown,
        score_reason: assessment.reason ?? null,
        legitimacy: assessment.legitimacy_note ?? null,
        status: excluded ? "excluded" : "ranked",
        excluded_reason: excluded,
      };
      if (assessment.role) patch.role = assessment.role;
      if (assessment.work_mode) patch.work_mode = assessment.work_mode;
      if (assessment.salary_estimate) patch.salary_estimate = assessment.salary_estimate;
      core.updateJob(db, job.id, patch);
      return print({ id: job.id, score: patch.score, status: patch.status, excluded_reason: excluded, breakdown });
    }
    case "contact": {
      const job = requireJob(db, args[0]);
      return print({ id: core.addContact(db, job.id, readInput(args)) });
    }
    case "document": {
      const [id, type, filePath] = args;
      const job = requireJob(db, id);
      if (!filePath || !fs.existsSync(path.resolve(ROOT, filePath))) throw new Error(`File not found: ${filePath}`);
      core.saveDocument(db, job.id, type, filePath);
      return print({ job: job.id, type, path: filePath });
    }
    case "folder": {
      const job = requireJob(db, args[0]);
      const folder = job.folder ?? `jobs/${job.found_at.slice(0, 10)}_${slug(job.company)}_${slug(job.title)}_${job.id}`;
      fs.mkdirSync(path.join(ROOT, folder), { recursive: true });
      if (!job.folder) core.updateJob(db, job.id, { folder });
      return print({ folder });
    }
    default:
      throw new Error(`Unknown command "${command}".\n\n${HELP}`);
  }
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
