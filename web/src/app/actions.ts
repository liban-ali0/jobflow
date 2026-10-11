"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  addMessage,
  answerQuestion,
  createConversation,
  deleteConversation,
  dismissQuestion,
  getConversation,
  getSettings,
  listJobs,
  listMessages,
  saveCv,
  setSettings,
  unapprovedDocuments,
  updateConversation,
  updateJob,
  writeFacts,
} from "@/lib/data";
import { ENGINES, checkEngine, conversationRunning, isStage, launch, sendToAssistant } from "@/lib/engine";
import { isHex } from "@/lib/theme";
import { EXPERIENCE_LEVELS } from "@/core/levels.mjs";
import type { Settings, Status } from "@/lib/types";
import { RESEARCH_POINTS, STATUS_LABELS } from "@/lib/types";

export type ActionResult = { ok: boolean; message: string };

const ENGINE_STAGES = ["build-profile", "rank-jobs", "research-job", "tailor-job", "design-template", "follow-up", "improve-cv", "weave-keyword"];
const EFFORTS = ["", "low", "medium", "high", "xhigh", "max"];

export async function runStage(stage: string, jobId: number | null = null): Promise<ActionResult> {
  if (!isStage(stage)) return { ok: false, message: `Unknown step "${stage}".` };
  try {
    launch(stage, jobId);
  } catch (error) {
    return { ok: false, message: (error as Error).message };
  }
  revalidatePath("/", "layout");
  return { ok: true, message: "Started. Progress is on the Activity screen." };
}

const MESSAGE_LIMIT = 8000;

export async function startConversation(formData: FormData) {
  const engine = formData.get("engine") === "codex" ? "codex" : "claude";
  // Codex runs with no reasoning by default here, so start it at medium.
  const id = createConversation({ title: "New conversation", engine, effort: engine === "codex" ? "medium" : "" });
  // A conversation can start with a message, for example from a suggestion.
  const message = String(formData.get("message") ?? "").trim();
  if (message) await sendMessage(id, null, formData);
  redirect(`/assistant/${id}`);
}

export async function sendMessage(conversationId: number, _: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const text = String(formData.get("message") ?? "").trim();
  if (!text) return { ok: false, message: "Write a message first." };
  if (text.length > MESSAGE_LIMIT) return { ok: false, message: `Keep messages under ${MESSAGE_LIMIT} characters.` };
  const conversation = getConversation(conversationId);
  if (!conversation) return { ok: false, message: "This conversation no longer exists." };

  if (conversationRunning(conversationId)) return { ok: false, message: "The assistant is still answering the last message." };

  const first = listMessages(conversationId).length === 0;
  addMessage(conversationId, { role: "user", text });
  if (first) updateConversation(conversationId, { title: text.replace(/\s+/g, " ").slice(0, 60) });
  try {
    sendToAssistant(conversation, text, first);
  } catch (error) {
    addMessage(conversationId, { role: "error", text: (error as Error).message });
  }
  revalidatePath("/assistant", "layout");
  return { ok: true, message: "" };
}

export async function removeConversation(conversationId: number) {
  deleteConversation(conversationId);
  redirect("/assistant");
}

export async function answer(questionId: number, formData: FormData): Promise<ActionResult> {
  const text = String(formData.get("answer") ?? "").trim();
  if (!text) return { ok: false, message: "Write an answer first." };
  if (text.length > 2000) return { ok: false, message: "Keep the answer under 2000 characters." };
  try {
    answerQuestion(questionId, text);
  } catch (error) {
    return { ok: false, message: (error as Error).message };
  }
  revalidatePath("/", "layout");
  return { ok: true, message: "Saved." };
}

export async function dismiss(questionId: number): Promise<ActionResult> {
  dismissQuestion(questionId);
  revalidatePath("/", "layout");
  return { ok: true, message: "Dismissed." };
}

const CV_LIMIT = 10 * 1024 * 1024;

export async function uploadCv(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const file = formData.get("cv");
  if (!(file instanceof File) || file.size === 0) return { ok: false, message: "Choose your CV first." };
  if (file.size > CV_LIMIT) return { ok: false, message: "The CV is larger than 10 MB." };
  const bytes = new Uint8Array(await file.arrayBuffer());
  // Every PDF starts with "%PDF".
  if (String.fromCharCode(...bytes.slice(0, 4)) !== "%PDF") return { ok: false, message: "The CV must be a PDF file." };
  saveCv(bytes);
  revalidatePath("/", "layout");
  return { ok: true, message: "CV saved. Build your profile next." };
}

export async function runEngineCheck(engine: string): Promise<ActionResult> {
  if (!(engine in ENGINES)) return { ok: false, message: `Unknown engine "${engine}".` };
  const result = await checkEngine(engine as keyof typeof ENGINES);
  setSettings({ setupCheck: { engine, ...result, at: new Date().toISOString() } });
  revalidatePath("/setup");
  return result;
}

const FACTS_LIMIT = 20000;

export async function saveFacts(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const facts = String(formData.get("facts") ?? "").replace(/\r\n/g, "\n");
  if (facts.length > FACTS_LIMIT) return { ok: false, message: `Keep the facts under ${FACTS_LIMIT} characters.` };
  writeFacts(facts);
  revalidatePath("/profile");
  return { ok: true, message: "Facts saved. Use Rebuild profile to apply them to the profile and base CVs." };
}

export async function saveRules(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const rules = String(formData.get("rules") ?? "").replace(/\r\n/g, "\n").trim();
  if (rules.length > FACTS_LIMIT) return { ok: false, message: `Keep the rules under ${FACTS_LIMIT} characters.` };
  setSettings({ customRules: rules });
  revalidatePath("/profile");
  return { ok: true, message: "Rules saved. The next ranking run follows them." };
}

export async function setStatus(jobId: number, status: string): Promise<ActionResult> {
  if (!(status in STATUS_LABELS)) return { ok: false, message: `Unknown status "${status}".` };

  if (status === "selected") {
    const { dailyCap } = getSettings();
    const selected = listJobs({ status: "selected" }).length;
    if (selected >= dailyCap) {
      return { ok: false, message: `The daily cap is ${dailyCap}. Remove a selected job or raise the cap in Settings.` };
    }
  }

  const patch: { status: Status; follow_up_due?: string } = { status: status as Status };
  if (status === "applied" && unapprovedDocuments(jobId).length) {
    return { ok: false, message: "Approve this job's documents first (Documents on the job page)." };
  }
  if (status === "applied") {
    const { followUpDays } = getSettings();
    patch.follow_up_due = new Date(Date.now() + followUpDays * 86400000).toISOString();
  }
  updateJob(jobId, patch);
  revalidatePath("/", "layout");
  return { ok: true, message: `Moved to ${STATUS_LABELS[status as Status]}.` };
}

export async function saveNotes(jobId: number, formData: FormData) {
  updateJob(jobId, { notes: String(formData.get("notes") ?? "") });
  revalidatePath(`/jobs/${jobId}`);
}

const list = (value: FormDataEntryValue | null) =>
  String(value ?? "")
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);

// A missing or empty field (for example a disabled one, which forms do not
// send) keeps the fallback rather than counting as 0.
const number = (value: FormDataEntryValue | null, fallback: number, min: number, max: number) => {
  if (value === null || String(value).trim() === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, Math.round(parsed))) : fallback;
};

const rowCount = (formData: FormData, name: string) => number(formData.get(name), 0, 0, 50);

// Countries and roles arrive as numbered rows in the order shown, which is
// their priority; blank rows are dropped.
function readCountries(formData: FormData): Settings["countries"] {
  const countries: Settings["countries"] = [];
  for (let index = 0; index < rowCount(formData, "countryCount"); index++) {
    const code = String(formData.get(`country.${index}.code`) ?? "");
    const name = String(formData.get(`country.${index}.name`) ?? "").trim().slice(0, 60);
    if (!name) continue;
    countries.push({
      ...(/^[A-Z]{2}$/.test(code) ? { code } : {}),
      name,
      priority: countries.length + 1,
      cities: jsonList(formData.get(`country.${index}.cities`)),
      sponsorship: formData.get(`country.${index}.sponsorship`) === "on",
    });
  }
  return countries;
}

// A list sent as JSON, such as the chosen cities.
function jsonList(value: FormDataEntryValue | null) {
  try {
    const parsed = JSON.parse(String(value ?? "[]"));
    return Array.isArray(parsed) ? parsed.map((item) => String(item).trim().slice(0, 80)).filter(Boolean).slice(0, 50) : [];
  } catch {
    return [];
  }
}

const slug = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

// A role keeps its key when renamed, so ranked jobs stay linked to it. New
// roles get a key from their name.
function readRoles(formData: FormData): Settings["roles"] {
  const roles: Settings["roles"] = [];
  for (let index = 0; index < rowCount(formData, "roleCount"); index++) {
    const label = String(formData.get(`role.${index}.label`) ?? "").trim().slice(0, 60);
    if (!label) continue;
    let key = String(formData.get(`role.${index}.key`) ?? "");
    if (!/^[a-z0-9-]+$/.test(key)) {
      const base = slug(label) || "role";
      key = base;
      for (let n = 2; roles.some((role) => role.key === key); n++) key = `${base}-${n}`;
    }
    roles.push({
      key,
      label,
      priority: roles.length + 1,
      keywords: list(formData.get(`role.${index}.keywords`)),
    });
  }
  return roles;
}

function targetProblem(countries: Settings["countries"], roles: Settings["roles"]) {
  if (countries.length === 0) return "Add at least one country.";
  if (roles.length === 0) return "Add at least one role.";
  const names = countries.map((country) => country.name.toLowerCase());
  const repeated = names.find((name, index) => names.indexOf(name) !== index);
  if (repeated) return `"${countries[names.indexOf(repeated)].name}" is listed twice.`;
  const keys = roles.map((role) => role.key);
  if (new Set(keys).size !== keys.length) return "Two roles ended up with the same name. Rename one.";
  const empty = roles.find((role) => role.keywords.length === 0);
  if (empty) return `Add at least one search keyword for "${empty.label}".`;
  return null;
}

export async function saveSettings(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const current = getSettings();

  const patch: Partial<Settings> = {
    dailyCap: number(formData.get("dailyCap"), current.dailyCap, 1, 50),
    followUpDays: number(formData.get("followUpDays"), current.followUpDays, 1, 30),
    freshness: {
      maxHours: number(formData.get("maxHours"), current.freshness.maxHours, 1, 168),
      fastTrackMinutes: number(formData.get("fastTrackMinutes"), current.freshness.fastTrackMinutes, 5, 720),
    },
    experience: {
      levels: EXPERIENCE_LEVELS.map((level) => level.key).filter((key) => formData.get(`level.${key}`) === "on"),
      // Left empty, there is no limit.
      maxYears: String(formData.get("maxYears") ?? "").trim() === "" ? null : number(formData.get("maxYears"), 0, 0, 50),
      skipTitles: list(formData.get("skipTitles")),
    },
    countries: readCountries(formData),
    roles: readRoles(formData),
    workModes: ["remote", "onsite", "hybrid"].filter((mode) => formData.get(`workMode.${mode}`) === "on"),
    exclusions: {
      nationalsOnly: formData.get("exclude.nationalsOnly") === "on",
      transferableIqamaRequired: formData.get("exclude.transferableIqamaRequired") === "on",
      payToApply: formData.get("exclude.payToApply") === "on",
    },
    sources: current.sources.map((source) => ({ ...source, enabled: formData.get(`source.${source.key}`) === "on" })),
    schedule: {
      enabled: formData.get("schedule.enabled") === "on",
      fastTrackEveryMinutes: number(formData.get("schedule.every"), current.schedule.fastTrackEveryMinutes, 15, 720),
      dailyRunAt: /^\d{2}:\d{2}$/.test(String(formData.get("schedule.dailyRunAt")))
        ? String(formData.get("schedule.dailyRunAt"))
        : current.schedule.dailyRunAt,
    },
    email: { sendingEnabled: formData.get("email.sendingEnabled") === "on" },
    research: {
      points: Object.fromEntries(RESEARCH_POINTS.map(({ key }) => [key, formData.get(`research.${key}`) === "on"])) as Settings["research"]["points"],
      extraPoints: list(formData.get("research.extraPoints")).slice(0, 20),
      rules: String(formData.get("research.rules") ?? "").replace(/\r\n/g, "\n").trim().slice(0, 5000),
    },
    engines: {},
  };

  if (patch.workModes!.length === 0) return { ok: false, message: "Choose at least one work mode." };
  if (patch.experience!.levels.length === 0) return { ok: false, message: "Choose at least one experience level." };
  const problem = targetProblem(patch.countries!, patch.roles!);
  if (problem) return { ok: false, message: problem };

  const mode = String(formData.get("appearance.mode"));
  const primary = String(formData.get("appearance.primary")).toLowerCase();
  const secondary = String(formData.get("appearance.secondary")).toLowerCase();
  if (!isHex(primary) || !isHex(secondary)) return { ok: false, message: "Colours must be hex values like #12203a." };
  patch.appearance = { mode: mode === "light" || mode === "dark" ? mode : "system", primary, secondary };

  for (const stage of ENGINE_STAGES) {
    const engine = formData.get(`engine.${stage}.engine`) === "codex" ? "codex" : "claude";
    const model = String(formData.get(`engine.${stage}.model`) ?? "").trim();
    const effort = String(formData.get(`engine.${stage}.effort`) ?? "");
    // Model names reach the command line, so only plain names are accepted.
    if (model && !/^[\w.:\[\]-]+$/.test(model)) {
      return { ok: false, message: `"${model}" is not a valid model name.` };
    }
    if (!EFFORTS.includes(effort)) return { ok: false, message: `Unknown effort "${effort}".` };
    if (engine === "codex" && effort === "max") {
      return { ok: false, message: "Max effort is only available on Claude Code. Choose Extra high for Codex." };
    }
    patch.engines![stage] = { engine, model, effort };
  }

  setSettings(patch);
  revalidatePath("/", "layout");
  return { ok: true, message: "Settings saved." };
}
