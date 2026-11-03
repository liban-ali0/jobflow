// The story bank: the candidate's interview stories (situation, task, action,
// result, and what they learned), kept in candidate/stories.json and reused
// across every interview. Engines add stories through `jobs.mjs story`; the
// user confirms or removes them on the Profile screen.
//
// After career-ops' story bank (github.com/career-ops-hq/career-ops, MIT): a
// story without an action is not a story, and figures in a story are not facts
// until the profile backs them or the user confirms the story. Matching a
// story to a job's requirements is done here in code (word overlap), not by
// the model.
import fs from "node:fs";
import path from "node:path";

const FILE = "candidate/stories.json";
const MAX = 200;

const text = (value, max) => (typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "");
const words = (value) =>
  String(value ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[^\p{L}\p{N}+#.]+/u)
    .map((word) => word.replace(/^\.+|\.+$/g, ""))
    .filter((word) => word.length > 2 && !STOP.has(word));
const STOP = new Set("the and for with from into that this have has had was were are you your our their they them who what when where how why which about over under after before during while also very more most than then there here able using used use work worked working team role job".split(" "));

export function readStories(root) {
  const file = path.join(root, FILE);
  if (!fs.existsSync(file)) return [];
  try {
    const list = JSON.parse(fs.readFileSync(file, "utf8"));
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function writeStories(root, list) {
  const file = path.join(root, FILE);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(`${file}.tmp`, JSON.stringify(list.slice(0, MAX), null, 2));
  fs.renameSync(`${file}.tmp`, file);
}

// Checks one story. Returns { story, problems }.
export function normalizeStory(raw) {
  const problems = [];
  const story = {
    title: text(raw?.title, 100),
    theme: text(raw?.theme, 40),
    situation: text(raw?.situation, 600),
    task: text(raw?.task, 400),
    action: text(raw?.action, 900),
    result: text(raw?.result, 500),
    reflection: text(raw?.reflection, 400),
    skills: (Array.isArray(raw?.skills) ? raw.skills : []).map((skill) => text(skill, 40)).filter(Boolean).slice(0, 10),
    // Where it came from: the profile, or a job's interview (job id).
    source: Number.isInteger(raw?.job_id) ? { job_id: raw.job_id } : { profile: true },
  };
  if (!story.title) problems.push("title is empty.");
  if (!story.situation) problems.push(`"${story.title || "story"}": situation is empty.`);
  if (!story.action) problems.push(`"${story.title || "story"}": action is empty (what the candidate did is the story).`);
  if (!story.result) problems.push(`"${story.title || "story"}": result is empty.`);
  if (!story.skills.length) problems.push(`"${story.title || "story"}": list the skills it shows in "skills".`);
  return { story, problems };
}

// Adds stories (one or a list). A story with the same title replaces the
// older one unless the user confirmed that one. `unbacked(text)` lists the
// story's figures the profile does not back.
export function addStories(root, input, unbacked = () => []) {
  const list = readStories(root);
  const added = [];
  const problems = [];
  for (const raw of Array.isArray(input) ? input : [input]) {
    const { story, problems: found } = normalizeStory(raw);
    if (found.length) {
      problems.push(...found);
      continue;
    }
    const same = list.findIndex((item) => item.title.toLowerCase() === story.title.toLowerCase());
    if (same >= 0 && list[same].confirmed) {
      problems.push(`"${story.title}" is already in the bank and the user confirmed it: use another title for a different story.`);
      continue;
    }
    const figures = unbacked([story.situation, story.task, story.action, story.result].join("\n"));
    const entry = { ...story, id: same >= 0 ? list[same].id : nextId(list), confirmed: false, unbacked: figures, added_at: new Date().toISOString() };
    if (same >= 0) list[same] = entry;
    else list.push(entry);
    added.push({ id: entry.id, title: entry.title, unbacked: figures });
  }
  if (added.length) writeStories(root, list);
  return { added, problems };
}

const nextId = (list) => list.reduce((max, item) => Math.max(max, Number(item.id) || 0), 0) + 1;

export function updateStory(root, id, patch) {
  const list = readStories(root);
  const index = list.findIndex((item) => item.id === id);
  if (index < 0) return false;
  list[index] = { ...list[index], ...patch };
  writeStories(root, list);
  return true;
}

export function removeStory(root, id) {
  const list = readStories(root);
  const next = list.filter((item) => item.id !== id);
  if (next.length === list.length) return false;
  writeStories(root, next);
  return true;
}

// The best stories for each requirement: the share of the requirement's
// words a story's skills, title and text contain (skills count double).
// Returns [{ requirement, stories: [{ id, title, fit }] }].
export function matchStories(stories, requirements, perRequirement = 2) {
  const prepared = stories.map((story) => ({
    story,
    tags: new Set(words([story.title, ...story.skills].join(" "))),
    body: new Set(words([story.situation, story.task, story.action, story.result].join(" "))),
  }));
  return requirements
    .map((requirement) => {
      const wanted = [...new Set(words(requirement))];
      if (!wanted.length) return { requirement, stories: [] };
      const ranked = prepared
        .map(({ story, tags, body }) => {
          const hits = wanted.reduce((sum, word) => sum + (tags.has(word) ? 2 : body.has(word) ? 1 : 0), 0);
          return { id: story.id, title: story.title, confirmed: Boolean(story.confirmed), fit: Math.round((hits / (wanted.length * 2)) * 100) };
        })
        .filter((item) => item.fit >= 25)
        .sort((a, b) => b.fit - a.fit || Number(b.confirmed) - Number(a.confirmed))
        .slice(0, perRequirement);
      return { requirement, stories: ranked };
    })
    .filter((row) => row.stories.length);
}
