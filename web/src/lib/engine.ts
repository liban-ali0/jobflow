import "server-only";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { ROOT, addMessage, addProgress, finishRun, getJob, getSettings, listRuns, startRun, updateConversation } from "./data";
import type { Conversation, EngineChoice } from "./types";

// Skill stages follow .claude/skills/<key>/SKILL.md and run on the engine
// chosen in Settings (Claude Code or Codex). Script stages run a Node script
// directly, which is faster and costs nothing. "assistant" runs carry a chat
// message from the Assistant screen.
type StageDef = { label: string; perJob: boolean; script?: string };

export const STAGES = {
  "build-profile": { label: "Build profile from CV", perJob: false },
  "find-jobs": { label: "Find new jobs", perJob: false, script: "scripts/collect.mjs" },
  "rank-jobs": { label: "Check and rank", perJob: false },
  "research-job": { label: "Research", perJob: true },
  "tailor-job": { label: "Tailor documents", perJob: true },
  "design-template": { label: "Design CV template", perJob: false },
  "follow-up": { label: "Write follow-up", perJob: true },
  "improve-cv": { label: "Improve CV for ATS", perJob: false },
  assistant: { label: "Assistant message", perJob: false },
} satisfies Record<string, StageDef>;

export type Stage = keyof typeof STAGES;

export const ENGINES = {
  claude: { label: "Claude Code", command: "claude" },
  codex: { label: "Codex", command: "codex" },
} as const;

export type EngineKey = keyof typeof ENGINES;

const LOG_LIMIT = 200_000;
const holder = globalThis as unknown as { jobflowRunning?: Set<number>; jobflowCleaned?: boolean; jobflowQueue?: number[] };
const running = (holder.jobflowRunning ??= new Set<number>());
// Jobs waiting for research. They run one at a time (research, then its
// tailoring), so several engine sessions never compete for the subscription.
const queue = (holder.jobflowQueue ??= []);

export function isStage(value: string): value is Stage {
  return value in STAGES;
}

const scriptOf = (stage: Stage) => (STAGES[stage] as StageDef).script;
const skillFile = (stage: Stage) => path.join(ROOT, ".claude", "skills", stage, "SKILL.md");

export function stageReady(stage: Stage) {
  if (stage === "assistant") return true;
  const script = scriptOf(stage);
  return fs.existsSync(script ? path.join(ROOT, script) : skillFile(stage));
}

const pipelineBusy = () => listRuns(50).some((run) => run.status === "running" && (run.stage === "research-job" || run.stage === "tailor-job"));

function startNextQueued() {
  while (queue.length && !pipelineBusy()) {
    const jobId = queue.shift()!;
    try {
      launch("research-job", jobId);
      return;
    } catch {
      // Not possible for this job any more; try the next one.
    }
  }
}

// Adds jobs to the research queue and starts it if nothing is running.
export function queueResearch(jobIds: number[]) {
  const added = jobIds.filter((id) => !queue.includes(id) && !stageRunning("research-job", id) && !stageRunning("tailor-job", id));
  queue.push(...added);
  startNextQueued();
  return added.length;
}

export const queuedResearch = () => [...queue];

export function stageRunning(stage: Stage, jobId: number | null = null) {
  return listRuns(50).some((run) => run.status === "running" && run.stage === stage && run.job_id === jobId);
}

export function conversationRunning(conversationId: number) {
  return listRuns(50).some((run) => run.status === "running" && run.conversation_id === conversationId);
}

export function engineFor(stage: Stage): EngineChoice {
  const choice = getSettings().engines?.[stage];
  return choice && choice.engine in ENGINES ? choice : { engine: "claude", model: "", effort: "" };
}

// Runs left as "running" by a previous app session can never finish.
export function closeAbandonedRuns() {
  if (holder.jobflowCleaned) return;
  holder.jobflowCleaned = true;
  for (const run of listRuns(200)) {
    if (run.status === "running" && !running.has(run.id)) {
      finishRun(run.id, { status: "failed", summary: "The app was closed before this run finished." });
    }
  }
}

// ---------- reading the engines' event streams ----------

type Outcome = { status: "done" | "failed"; summary: string; sessionId?: string };

type Stream = {
  // Called for every line of standard output; returns progress lines to show.
  onLine: (line: string) => string[];
  // Called once the process has ended.
  outcome: (code: number | null, errors: string) => Outcome;
};

const short = (text: string, max = 160) => {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
};

// Codex on Windows wraps commands as: powershell.exe -Command '<command>'
const unwrapShell = (command: string) => /-Command '([\s\S]*)'\s*$/.exec(command)?.[1] ?? command;

function describeClaudeTool(name: string, input: Record<string, unknown>) {
  const value = (key: string) => String(input[key] ?? "");
  switch (name) {
    case "Bash":
    case "PowerShell":
      return `Ran ${short(value("command"))}`;
    case "WebSearch":
      return `Searched the web for "${short(value("query"), 100)}"`;
    case "WebFetch":
      return `Opened ${short(value("url"), 120)}`;
    case "Read":
      return `Read ${path.relative(ROOT, value("file_path")) || value("file_path")}`;
    case "Write":
    case "Edit":
      return `Wrote ${path.relative(ROOT, value("file_path")) || value("file_path")}`;
    case "Skill":
      return `Started the ${value("skill")} step`;
    case "Glob":
    case "Grep":
      return `Looked for files`;
    default:
      return `Used ${name}`;
  }
}

function claudeStream(): Stream {
  let result: { text: string; isError: boolean; sessionId?: string } | null = null;
  let sessionId: string | undefined;
  let trustProblem = false;

  return {
    onLine(line) {
      let event: Record<string, unknown>;
      try {
        event = JSON.parse(line);
      } catch {
        return [];
      }
      if (typeof event.session_id === "string") sessionId = event.session_id;
      if (event.type === "system" && event.subtype === "permission_denied") {
        return ["Refused by the project's permissions"];
      }
      if (event.type === "assistant") {
        const content = (event.message as { content?: Record<string, unknown>[] })?.content ?? [];
        return content.flatMap((part) => {
          if (part.type === "tool_use") return [describeClaudeTool(String(part.name), (part.input ?? {}) as Record<string, unknown>)];
          if (part.type === "text" && String(part.text).trim()) return [short(String(part.text), 200)];
          return [];
        });
      }
      if (event.type === "result") {
        result = { text: String(event.result ?? event.subtype ?? ""), isError: Boolean(event.is_error), sessionId };
      }
      return [];
    },
    outcome(code, errors) {
      if (errors.includes("has not been trusted")) trustProblem = true;
      if (trustProblem) {
        return {
          status: "failed",
          summary:
            "Claude Code does not trust this folder yet. Open a terminal in the project folder, run `claude` once, and accept the trust prompt. Then try again.",
        };
      }
      if (result) {
        return { status: code !== 0 || result.isError ? "failed" : "done", summary: result.text, sessionId };
      }
      return { status: "failed", summary: errors.trim() || `Claude Code stopped with code ${code}.`, sessionId };
    },
  };
}

function codexStream(): Stream {
  let threadId: string | undefined;
  let lastMessage = "";
  let failure = "";
  let completed = false;
  const seenOutput: string[] = [];

  return {
    onLine(line) {
      let event: Record<string, unknown>;
      try {
        event = JSON.parse(line);
      } catch {
        seenOutput.push(line);
        return [];
      }
      if (event.type === "thread.started") threadId = String(event.thread_id);
      if (event.type === "turn.completed") completed = true;
      if (event.type === "turn.failed" || event.type === "error") {
        const error = event.error as { message?: string } | undefined;
        failure = String(error?.message ?? event.message ?? "Codex reported an error.");
      }
      const item = event.item as Record<string, unknown> | undefined;
      if (!item) return [];
      if (event.type === "item.started" && item.type === "command_execution") {
        return [`Ran ${short(unwrapShell(String(item.command ?? "")))}`];
      }
      if (event.type === "item.completed") {
        if (item.type === "agent_message") {
          lastMessage = String(item.text ?? "");
          return [short(lastMessage, 200)];
        }
        if (item.type === "web_search") return [`Searched the web for "${short(String(item.query ?? ""), 100)}"`];
        if (item.type === "file_change") return ["Changed files"];
      }
      return [];
    },
    outcome(code, errors) {
      const all = `${errors}\n${failure}\n${seenOutput.join("\n")}`;
      if (/401 Unauthorized|Missing bearer|not logged in/i.test(all)) {
        return {
          status: "failed",
          summary: "Codex is not signed in. Run `codex` in a terminal and choose Sign in with ChatGPT, then try again.",
        };
      }
      if (/^sandbox: read-only/m.test(all)) {
        return {
          status: "failed",
          summary:
            "Codex ran read-only, so nothing was saved. Open a terminal in the project folder, run `codex` once, and choose to trust it. Then try again.",
          sessionId: threadId,
        };
      }
      if (code === 0 && completed && !failure) return { status: "done", summary: lastMessage, sessionId: threadId };
      return { status: "failed", summary: failure || lastMessage || errors.trim() || `Codex stopped with code ${code}.`, sessionId: threadId };
    },
  };
}

function scriptStream(): Stream {
  const lines: string[] = [];
  return {
    onLine(line) {
      lines.push(line);
      return line.trim() ? [short(line, 200)] : [];
    },
    outcome(code, errors) {
      return {
        status: code === 0 ? "done" : "failed",
        summary: lines.join("\n").trim() || errors.trim() || `Exited with code ${code}`,
      };
    },
  };
}

// ---------- building the command ----------

type Invocation = { command: string; args: string[]; shell: boolean; stdin: string; stream: Stream };

// Arguments never contain spaces or quotes, so running through the Windows
// shell (needed for npm's .cmd launchers) cannot split or alter them.
const WINDOWS = process.platform === "win32";

const ASSISTANT_INTRO = `You are the assistant inside the Jobflow web app, the job application workflow in this folder. The user is writing to you from the app's Assistant screen, not a terminal, and reads your reply there.

- Reply in short, plain language. The user sees your final message only, plus a list of the commands you ran.
- Read and change job data only through \`node scripts/jobs.mjs\` (run it with \`help\` for the commands).
- To run a workflow step (build-profile, rank-jobs, research-job, tailor-job), follow its instruction file in \`.claude/skills/<step>/SKILL.md\`.
- The user's facts are in \`candidate/facts.md\`, the profile in \`candidate/profile.md\`. Extra ranking rules are set with \`node scripts/jobs.mjs rules --file <path>\`.
- When you need a fact from the user that later steps should remember, ask it with \`node scripts/jobs.mjs ask --file <path>\` (JSON: text, why, options). It appears in the app's Questions, and the answer is saved to the facts. For a quick clarification in this conversation, just ask in your reply.
- If something is outside what you may do here, say so and tell the user how to do it in the app.

The user's message:
`;

// Codex has no project skills in the same place, so the skill's instructions
// are sent as the prompt. Project rules reach it through AGENTS.md.
function skillPrompt(stage: Stage, argument: string) {
  const body = fs
    .readFileSync(skillFile(stage), "utf8")
    .replace(/^---[\s\S]*?\n---\s*\n/, "")
    .replaceAll("$ARGUMENTS", argument);
  return [
    `Carry out the project step "${stage}" exactly as described below.`,
    argument ? `Argument for this run: ${argument}` : "No argument was given for this run.",
    "",
    body,
  ].join("\n");
}

function claudeInvocation(prompt: string, choice: EngineChoice, resume?: string): Invocation {
  // Only what .claude/settings.json allows can run: anything else is refused
  // instead of waiting for an answer.
  const args = ["-p", "--output-format", "stream-json", "--verbose", "--permission-mode", "dontAsk"];
  if (resume) args.push("--resume", resume);
  if (choice.model) args.push("--model", choice.model);
  if (choice.effort) args.push("--effort", choice.effort);
  return { command: ENGINES.claude.command, args, shell: WINDOWS, stdin: prompt, stream: claudeStream() };
}

function codexInvocation(prompt: string, choice: EngineChoice, resume?: string): Invocation {
  // Values after -c that are not valid TOML are read as plain strings, so
  // they need no quotes. Writes stay inside the project folder.
  const shared = [
    "--json",
    "--skip-git-repo-check",
    "-c",
    "sandbox_mode=workspace-write",
    "-c",
    "approval_policy=never",
    "-c",
    "web_search=live",
  ];
  if (choice.model) shared.push("-m", choice.model);
  if (choice.effort) shared.push("-c", `model_reasoning_effort=${choice.effort}`);
  const args = resume ? ["exec", "resume", ...shared, resume, "-"] : ["exec", ...shared, "-C", ROOT, "-"];
  return { command: ENGINES.codex.command, args, shell: WINDOWS, stdin: prompt, stream: codexStream() };
}

// ---------- running ----------

type LaunchOptions = {
  stage: Stage;
  jobId?: number | null;
  trigger?: "manual" | "schedule";
  conversation?: Conversation;
  message?: string;
  // Overrides the step's argument, for example "ids:12,34" for rank-jobs.
  argument?: string;
};

export function launch(stage: Stage, jobId: number | null, trigger: "manual" | "schedule" = "manual", argument?: string) {
  return start({ stage, jobId, trigger, argument });
}

// Sends a message from the Assistant screen to the conversation's engine.
export function sendToAssistant(conversation: Conversation, message: string, first: boolean) {
  return start({ stage: "assistant", conversation, message: first ? ASSISTANT_INTRO + message : message });
}

function start({ stage, jobId = null, trigger = "manual", conversation, message, argument: givenArgument }: LaunchOptions) {
  if (!stageReady(stage)) throw new Error(`The "${STAGES[stage].label}" step is not built yet.`);
  if (STAGES[stage].perJob && jobId === null) throw new Error(`"${STAGES[stage].label}" needs a job.`);
  closeAbandonedRuns();
  if (conversation ? conversationRunning(conversation.id) : stageRunning(stage, jobId)) {
    throw new Error(conversation ? "The assistant is still answering the last message." : `"${STAGES[stage].label}" is already running.`);
  }

  const script = scriptOf(stage);
  const choice: EngineChoice | null = conversation
    ? { engine: conversation.engine, model: conversation.model ?? "", effort: conversation.effort ?? "" }
    : script
      ? null
      : engineFor(stage);

  const runId = startRun({
    stage,
    jobId,
    trigger,
    engine: choice?.engine ?? "script",
    conversationId: conversation?.id ?? null,
  });
  running.add(runId);

  const argument = givenArgument ?? (jobId === null ? "" : String(jobId));
  let invocation: Invocation;
  if (script) {
    invocation = {
      command: process.execPath,
      args: [script, ...(argument ? [argument] : [])],
      shell: false,
      stdin: "",
      stream: scriptStream(),
    };
  } else {
    // Claude Code runs skills by name; Codex gets the skill text.
    const prompt =
      message ?? (choice!.engine === "claude" ? `/${stage}${argument ? ` ${argument}` : ""}` : skillPrompt(stage, argument));
    const resume = conversation?.session_id ?? undefined;
    invocation =
      choice!.engine === "codex" ? codexInvocation(prompt, choice!, resume) : claudeInvocation(prompt, choice!, resume);
  }

  const child = spawn(invocation.command, invocation.args, {
    cwd: ROOT,
    shell: invocation.shell,
    windowsHide: true,
    env: { ...process.env, JOBFLOW_RUN_ID: String(runId) },
  });

  let buffer = "";
  let errors = "";
  child.stdout.on("data", (chunk) => {
    buffer += chunk;
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      for (const progress of invocation.stream.onLine(line.replace(/\r$/, ""))) addProgress(runId, progress);
    }
  });
  child.stderr.on("data", (chunk) => (errors = (errors + chunk).slice(-LOG_LIMIT)));

  const finish = ({ status, summary, sessionId }: Outcome) => {
    if (!running.delete(runId)) return;
    finishRun(runId, { status, summary: summary.slice(0, 20000), log: errors });
    // Research is followed straight away by tailoring, so the whole
    // package for a job arrives in one go; not when research excluded the
    // job (closed or not genuine).
    if (stage === "research-job" && status === "done" && jobId !== null && stageReady("tailor-job") && getJob(jobId)?.status === "researched") {
      try {
        launch("tailor-job", jobId, trigger);
      } catch {
        // Already running or not possible now; it can be started by hand.
      }
    }
    // When a job's research or tailoring ends, the next queued job starts.
    if (stage === "research-job" || stage === "tailor-job") startNextQueued();
    if (conversation) {
      if (sessionId && sessionId !== conversation.session_id) updateConversation(conversation.id, { session_id: sessionId });
      addMessage(conversation.id, {
        role: status === "done" ? "assistant" : "error",
        text: summary || (status === "done" ? "(No reply.)" : "The engine stopped without an answer."),
        runId,
      });
    }
  };

  child.on("error", (error) => {
    const missing = (error as NodeJS.ErrnoException).code === "ENOENT";
    const name = choice ? ENGINES[choice.engine].label : "Node";
    finish({ status: "failed", summary: missing ? `${name} is not installed or not on the PATH.` : error.message });
  });

  child.on("close", (code) => {
    if (buffer.trim()) for (const progress of invocation.stream.onLine(buffer)) addProgress(runId, progress);
    // Through the Windows shell, a missing command shows up as exit code 1
    // with a "not recognized" message rather than an error event.
    if (choice && /is not recognized as an internal or external command/i.test(errors)) {
      return finish({ status: "failed", summary: `${ENGINES[choice.engine].label} is not installed or not on the PATH.` });
    }
    finish(invocation.stream.outcome(code, errors));
  });

  child.stdin.end(invocation.stdin);
  return runId;
}

// ---------- checking an engine (Setup screen) ----------

const CHECK_TIMEOUT_MS = 120_000;
const NOT_SIGNED_IN = /please run \/login|not logged in|invalid api key/i;

// Sends the engine a one-word prompt from the project folder, which shows
// whether it is installed, signed in, and trusts this folder.
export function checkEngine(engine: EngineKey): Promise<{ ok: boolean; message: string }> {
  const prompt = "Reply with the single word OK. Do not use any tools.";
  const choice: EngineChoice = { engine, model: "", effort: engine === "codex" ? "low" : "" };
  const invocation = engine === "codex" ? codexInvocation(prompt, choice) : claudeInvocation(prompt, choice);
  const { label, command } = ENGINES[engine];

  return new Promise((resolve) => {
    const child = spawn(invocation.command, invocation.args, { cwd: ROOT, shell: invocation.shell, windowsHide: true });
    let buffer = "";
    let errors = "";
    let settled = false;
    const done = (ok: boolean, message: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ ok, message });
    };
    const timer = setTimeout(() => {
      child.kill();
      done(false, `${label} did not answer within two minutes. Run \`${command}\` in a terminal in this folder to see what it is waiting for.`);
    }, CHECK_TIMEOUT_MS);

    child.stdout.on("data", (chunk) => {
      buffer += chunk;
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) invocation.stream.onLine(line.replace(/\r$/, ""));
    });
    child.stderr.on("data", (chunk) => (errors = (errors + chunk).slice(-LOG_LIMIT)));
    child.on("error", (error) => {
      const missing = (error as NodeJS.ErrnoException).code === "ENOENT";
      done(false, missing ? `${label} is not installed or not on the PATH.` : error.message);
    });
    child.on("close", (code) => {
      if (buffer.trim()) invocation.stream.onLine(buffer);
      if (/is not recognized as an internal or external command|command not found/i.test(errors)) {
        return done(false, `${label} is not installed or not on the PATH.`);
      }
      const outcome = invocation.stream.outcome(code, errors);
      if (outcome.status === "done") return done(true, `${label} is installed, signed in, and trusts this folder.`);
      if (NOT_SIGNED_IN.test(`${outcome.summary}\n${errors}`)) {
        return done(false, `${label} is not signed in. Run \`${command}\` in a terminal and sign in, then check again.`);
      }
      done(false, outcome.summary);
    });
    child.stdin.end(invocation.stdin);
  });
}
