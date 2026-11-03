import "server-only";
import { SKILLS_TAXONOMY, detectIndustry } from "@/vendor/ats-screener/nlp/skills-taxonomy";
import { parseKeywords, present, significant, tokens } from "./ats";
import { getSettings, listJobsWithText, readFacts, readProfile, setSettings } from "./data";
import { readText } from "./documents";
import type { Job, Settings } from "./types";

// Skills your jobs keep asking for that your profile, facts and base CVs do
// not show. Worked out in code from every saved job, without AI:
//   - what to look for: the "ATS keywords" each research wrote, the job
//     reports' requirements, and a skills vocabulary (vendored ATS Screener,
//     MIT) scanned across all the listings;
//   - how much it matters: one count per job (a listing that repeats a word
//     counts once), more for jobs that score well for you and for the ones
//     the research marked as a must.
// career-ops' upskill reads gaps from its evaluation reports only; this also
// reads the listings that were never researched, so it sees the whole search.

export type SkillGap = {
  skill: string;
  jobs: number;
  share: number;
  must: number;
  weight: number;
  examples: { id: number; title: string; company: string }[];
};

const CORPUS_DAYS = 120;
const CORPUS_LIMIT = 600;
const SHOWN = 25;

type Need = { label: string; must: boolean; strength: number };

// The research's keyword list and the report's requirements for one job.
function researchedNeeds(job: Job): Need[] {
  if (!job.folder) return [];
  const needs: Need[] = [];
  const research = readText(`${job.folder}/research.md`);
  const section = research?.match(/^#{2,3}\s*ATS keywords\s*$([\s\S]*?)(?=^#{1,3}\s|$(?![\s\S]))/im)?.[1];
  if (section) for (const keyword of parseKeywords(section.trim())) needs.push({ label: keyword.term, must: keyword.must, strength: keyword.must ? 1.5 : 1 });
  const report = readText(`${job.folder}/report.json`);
  if (report) {
    try {
      for (const row of JSON.parse(report).requirements ?? []) {
        const label = typeof row?.requirement === "string" ? row.requirement.trim() : "";
        if (!label || label.split(/\s+/).length > 4 || row.match === "na") continue;
        const strength = row.importance === "critical" ? 2 : row.importance === "high" ? 1.5 : 1;
        needs.push({ label, must: strength >= 1.5, strength });
      }
    } catch {
      // A damaged report adds nothing.
    }
  }
  return needs;
}

// Vocabulary terms short enough to be read wrongly ("r", "go") are skipped.
const usable = (skill: string) => skill.replace(/[^a-z0-9]/gi, "").length >= 3;
const VOCABULARY_SET = new Set(SKILLS_TAXONOMY.flatMap((category) => category.skills).filter(usable));

// The vocabulary of the fields the candidate works in (from the profile and
// role names), so a logistics word in a developer's listings is not a gap.
function vocabularyFor(text: string) {
  const industries = detectIndustry(text.toLowerCase());
  const top = industries[0]?.matchCount ?? 0;
  const chosen = new Set(industries.filter((item) => item.matchCount >= Math.max(2, top / 3)).map((item) => item.industry));
  return [...new Set(SKILLS_TAXONOMY.filter((category) => chosen.has(category.industry)).flatMap((category) => category.skills))].filter(usable);
}

// The term as a listing writes it ("typescript" → "TypeScript").
function spelled(term: string, raw: string) {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, "iu").exec(raw)?.[0] ?? term;
}

// A term counts in a listing when its words appear together, in order:
// "business requirements" is not found in "business ... requirements".
const inText = (words: string[], text: string) => text.includes(` ${words.join(" ")} `);

// Words every listing uses, and soft skills: true of nearly everyone, and not
// something to add to a CV as a skill.
const GENERIC = new Set(
  "requirement requirements develop development design product products solution solutions engineering business stakeholder stakeholders security support field standards standard best practice practices quality monitoring compliance maintain maintenance management manage process processes system systems operations service services customer customers client clients project projects team teams work".split(" "),
);
const SOFT = /\b(communication|cross[- ]functional|root causes?|problem[- ]?solving|analytical|team ?work|teamwork|stakeholder|leadership|interpersonal|attention to detail|time management|self[- ]?(motivated|starter)|collaborat|presentation skills|organi[sz]ational|fast[- ]paced|detail[- ]oriented|written and verbal|work ethic|multitask|ownership|proactive|passion)/i;

function isGeneric(label: string, words: string[]) {
  if (SOFT.test(label)) return true;
  if (words.every((word) => GENERIC.has(word))) return true;
  // A single ordinary lowercase word ("develop") is not a named skill.
  if (words.length === 1 && label === label.toLowerCase() && !VOCABULARY_SET.has(label.toLowerCase())) return true;
  return false;
}

const keyOf = (label: string) => significant(label).join(" ");

export function skillGaps(settings: Settings = getSettings()): { gaps: SkillGap[]; jobs: number; dismissed: string[] } {
  const dismissed = settings.skillGaps?.dismissed ?? [];
  const skip = new Set(dismissed.map(keyOf));
  // What the candidate already shows.
  const own = [readProfile(), readFacts(), ...settings.roles.map((role) => readText(`candidate/base-cv-${role.key}.md`))].filter(Boolean).join("\n");
  const ownWords = new Set(tokens(own));
  // The user's own role words are not skills to learn.
  const roleWords = new Set(settings.roles.flatMap((role) => [role.label, ...role.keywords]).map(keyOf));

  const since = new Date(Date.now() - CORPUS_DAYS * 86400000).toISOString();
  const jobs = listJobsWithText({ since, limit: CORPUS_LIMIT }).filter((job) => job.status !== "excluded" || job.score !== null);
  const found = new Map<string, { label: string; jobs: Set<number>; must: number; weight: number; examples: SkillGap["examples"] }>();
  const add = (job: Job, need: Need) => {
    const key = keyOf(need.label);
    if (!key || skip.has(key) || roleWords.has(key) || isGeneric(need.label, key.split(" "))) return;
    let entry = found.get(key);
    if (!entry) {
      entry = { label: need.label, jobs: new Set(), must: 0, weight: 0, examples: [] };
      found.set(key, entry);
    }
    if (entry.jobs.has(job.id)) return;
    entry.jobs.add(job.id);
    if (need.must) entry.must++;
    // Jobs that fit you better say more about what you need.
    entry.weight += need.strength * (job.score === null ? 1 : 0.5 + Math.min(job.score, 100) / 100);
    if (entry.examples.length < 3) entry.examples.push({ id: job.id, title: job.title, company: job.company });
  };

  // First what research named, then every listing scanned for those terms
  // and the vocabulary.
  for (const job of jobs) for (const need of researchedNeeds(job)) add(job, need);
  const vocabulary = vocabularyFor([own, ...settings.roles.map((role) => role.label)].join("\n"));
  const terms = [...[...found.values()].map((entry) => entry.label), ...vocabulary].map((label) => ({ label, words: significant(label) })).filter((term) => term.words.length);
  for (const job of jobs) {
    if (!job.description) continue;
    const text = ` ${tokens(`${job.title}\n${job.description}`).join(" ")} `;
    for (const { label, words } of terms) if (inText(words, text)) add(job, { label: label === label.toLowerCase() ? spelled(label, job.description) : label, must: false, strength: 1 });
  }

  const gaps = [...found.values()]
    .filter((entry) => entry.jobs.size >= 2 && !present(entry.label, ownWords))
    .map((entry) => ({
      skill: entry.label,
      jobs: entry.jobs.size,
      share: Math.round((entry.jobs.size / Math.max(1, jobs.length)) * 100),
      must: entry.must,
      weight: Math.round(entry.weight * 10) / 10,
      examples: entry.examples,
    }))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, SHOWN);
  return { gaps, jobs: jobs.length, dismissed };
}

export function dismissSkill(skill: string, undo = false) {
  const current = getSettings().skillGaps?.dismissed ?? [];
  const next = undo ? current.filter((item) => keyOf(item) !== keyOf(skill)) : [...new Set([...current, skill])].slice(-300);
  setSettings({ skillGaps: { dismissed: next } });
}
