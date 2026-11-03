// ATS (applicant tracking system) check of a CV, combining three parts:
// - How six real ATS platforms would read and score it, from the open-source
//   ATS Screener engine (src/vendor/ats-screener, MIT). Its own keyword step
//   counts every word of a listing, so it is given research's clean keyword
//   list instead of the raw listing text when there is one.
// - Offerbound's keyword match: the job's keywords as phrases, with close
//   variants and must-haves, which judges the fit to this job.
// - The CV review from the open-source VeriWorkly ats-engine (npm, MIT): how an
//   ATS parses it (roles, dates, degree, languages), a rubric of readiness
//   checks with evidence and a fix each, and the listing's requirements one by
//   one (years, degree, languages compared as values), met or missing.
// The score weighs them by WEIGHTS. Deterministic and quick (about 15 ms), so
// the CV editor can re-check as you type and the same CV gets the same score.
import { parseCv, serializeCv, type CvDocument } from "./cv-format";
import { scoreResume } from "@/vendor/ats-screener/scorer/engine";
import { ALL_PROFILES } from "@/vendor/ats-screener/scorer/profiles";
import type { ScoringInput, Suggestion } from "@/vendor/ats-screener/scorer/types";
import { QUANTIFICATION_PATTERNS, STRONG_ACTION_VERBS } from "@/vendor/ats-screener/scorer/experience-scorer";
import { check as reviewCv, type AtsReport } from "@veriworkly/ats-engine";
import { categoryLabel, formatRoleDates, formatSpokenLanguage, formatTenure, DEGREE_LABELS } from "@veriworkly/ats-engine/format";

// How much each part counts. "keyed": a keyword list exists (a job's research
// or a role's search keywords); "plain": none yet.
const WEIGHTS = {
  keyed: { systems: 0.35, keywords: 0.35, review: 0.3 },
  plain: { systems: 0.6, review: 0.4 },
};

export type AtsKeyword = { term: string; must: boolean };
export type AtsCheck = { id: string; label: string; ok: boolean; detail: string };
export type AtsSystem = { name: string; vendor: string; score: number; passes: boolean };
// One way to raise the score, with about how many points it is worth.
// "fix": worth doing; "if-true": only when it is true for the candidate;
// "choice": points given up on purpose (for example a GPA kept off the CV).
export type AtsFix = { label: string; detail: string; points: number; kind: "fix" | "if-true" | "choice" };
export type AtsResult = {
  score: number;
  // Everything that keeps the score below 100, biggest gain first.
  fixes: AtsFix[];
  // The average of the six systems, before it is combined with the keywords.
  systemsScore: number;
  systems: AtsSystem[];
  keywords: { matched: string[]; missing: string[]; must: string[]; percent: number | null };
  suggestions: string[];
  checks: AtsCheck[];
  review: AtsReview;
};
// The VeriWorkly review, trimmed to what the panel shows.
export type AtsRequirement = { text: string; status: "met" | "partial" | "missing" | "unverifiable"; required: boolean; detail: string; evidence: string };
export type AtsReview = {
  // The review's part of the score: readiness, averaged with the job match when there is a listing.
  score: number;
  readiness: number;
  jobMatch: number | null;
  categories: { label: string; score: number; lost: number }[];
  strengths: string[];
  requirements: AtsRequirement[];
  // What an ATS would store from this CV.
  parsed: { label: string; value: string }[];
};
// What a CV is checked against: the listing text and research's keywords.
export type AtsTarget = { text: string; keywords: AtsKeyword[]; title?: string };

// ---------- keyword matching ----------

const STOPWORDS = new Set(
  "a an and or the of to in on for with by at as from into within across using use used experience knowledge skills skill ability strong good excellent".split(" "),
);

// Spellings that mean the same skill.
const SYNONYMS: Record<string, string> = {
  restful: "rest",
  apis: "api",
  js: "javascript",
  ts: "typescript",
  k8s: "kubernetes",
  postgres: "postgresql",
  ml: "machine-learning",
  llms: "llm",
  gcp: "google-cloud",
};

export function tokens(text: string) {
  return text
    .toLowerCase()
    .replace(/c\+\+/g, " cpp ")
    .replace(/c#/g, " csharp ")
    .replace(/\.net\b/g, " dotnet ")
    .replace(/machine learning/g, " machine-learning ")
    .replace(/google cloud/g, " google-cloud ")
    .split(/[^\p{L}\p{N}+#-]+/u)
    .map((word) => word.replace(/^-+|-+$/g, ""))
    .filter(Boolean)
    .map((word) => SYNONYMS[word] ?? word)
    // A light stem so "applications" matches "application".
    .map((word) => (word.length > 4 && word.endsWith("s") && !word.endsWith("ss") ? word.slice(0, -1) : word));
}

export const significant = (term: string) => tokens(term).filter((word) => !STOPWORDS.has(word));

// A keyword counts as present when its important words all appear in the CV
// (or most of them, for longer phrases).
export function present(keyword: string, cvWords: Set<string>) {
  const words = significant(keyword);
  const found = words.filter((word) => cvWords.has(word)).length;
  return words.length <= 2 ? found === words.length : found / words.length >= 0.7;
}

// The keyword list research writes: one per line ("- Java (must)"), or the
// older comma or semicolon separated phrases. Requirements that are not skills
// (years of experience, degrees) are left out; they are judged elsewhere.
export function parseKeywords(text: string): AtsKeyword[] {
  const seen = new Set<string>();
  return text
    .split(/\n|;|,(?![^(]*\))/)
    // Leftovers of a phrase split at its commas start with "and" or "or".
    .map((item) => item.trim().replace(/^[-*•]\s*/, "").replace(/^(and|or)\s+/i, "").trim())
    .map((item) => ({ term: item.replace(/\s*\((must|required)\)\s*$/i, "").replace(/\.$/, "").trim(), must: /\((must|required)\)\s*$/i.test(item) }))
    .filter(({ term }) => term && term.split(/\s+/).length <= 6)
    .filter(({ term }) => !/\b\d+\s*[-–+]?\s*\d*\s*years?\b|\bdegree\b|\bbachelor|\bmaster'?s?\b/i.test(term))
    .filter(({ term }) => significant(term).length > 0)
    .filter(({ term }) => {
      const key = significant(term).join(" ");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

// ---------- the six-system simulation ----------

// The engine's names for the sections ATS platforms look for.
function canonicalSection(key: string) {
  if (/experience|employment|work-history/.test(key)) return "experience";
  if (/education|academic/.test(key)) return "education";
  if (/skill|competenc|technolog/.test(key)) return "skills";
  if (/summary|profile|about|objective/.test(key)) return "summary";
  if (/project/.test(key)) return "projects";
  if (/certif|licen/.test(key)) return "certifications";
  return key;
}

const plain = (text: string) => text.replace(/\*\*/g, "");

function scoringInput(doc: CvDocument, markdown: string, target: AtsTarget): ScoringInput {
  const lines = [doc.name, doc.headline, doc.contact.join(" | ")];
  for (const section of doc.sections) {
    lines.push(section.title, ...section.text, ...section.bullets);
    for (const entry of section.entries) lines.push([entry.title, entry.org, entry.place, entry.dates].filter(Boolean).join(" | "), ...entry.bullets, ...entry.text);
  }
  const resumeText = plain(lines.filter(Boolean).join("\n"));
  const find = (name: string) => doc.sections.filter((section) => canonicalSection(section.key) === name);
  const skills = find("skills")
    .flatMap((section) => [...section.bullets, ...section.text])
    .flatMap((line) => plain(line).replace(/^[^:]+:/, "").split(/[,;]/))
    .map((skill) => skill.trim())
    .filter(Boolean);
  const sections = new Set(doc.sections.map((section) => canonicalSection(section.key)));
  if (doc.contact.some((item) => item.includes("@"))) sections.add("contact");
  const wordCount = resumeText.split(/\s+/).filter(Boolean).length;
  return {
    resumeText,
    resumeSkills: skills,
    resumeSections: [...sections],
    experienceBullets: find("experience").flatMap((section) => section.entries.flatMap((entry) => entry.bullets.map(plain))),
    educationText: find("education")
      .flatMap((section) => [...section.text, ...section.entries.map((entry) => [entry.title, entry.org, entry.dates].join(" "))])
      .join("\n"),
    // Offerbound's templates are one column of real text, without tables or images.
    hasMultipleColumns: false,
    hasTables: /^\s*\|.*\|\s*$/m.test(markdown),
    hasImages: /!\[[^\]]*\]\(/.test(markdown),
    // Downloads are fitted to one page when the CV allows.
    pageCount: wordCount > 900 ? 2 : 1,
    wordCount,
    // The clean keyword list when there is one; the listing text otherwise.
    jobDescription: target.keywords.length ? target.keywords.map((keyword) => keyword.term).join("\n") : target.text,
  };
}

// ---------- Offerbound's own checks ----------

const DATES = /((jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{4}|\b\d{4}\b)/i;
const FIRST_PERSON = /\b(i|my|me)\b/i;

// Words that make a bullet describe duties instead of results.
const FILLER = /\b(responsible for|duties included|helped( to)?|assisted (in|with)|worked on|involved in|participated in|tasked with|various|etc\.?)(?=\W|$)/i;

// The listing's title without extras such as "(Remote)" or "- Dubai".
const coreTitle = (title: string) => title.replace(/\(.*?\)/g, " ").split(/\s[-–|,/]\s|\s@\s/)[0].trim();

// A few checks the engine does not make, shown alongside its scores.
function jobflowChecks(doc: CvDocument, target: AtsTarget): AtsCheck[] {
  const experience = doc.sections.filter((section) => canonicalSection(section.key) === "experience").flatMap((section) => section.entries);
  const bullets = experience.flatMap((entry) => entry.bullets.map(plain)).filter((bullet) => bullet.trim());
  const undated = experience.filter((entry) => !DATES.test(entry.dates));
  const thin = experience.filter((entry) => entry.bullets.length < 2 || entry.bullets.length > 6);
  const firstPerson = [...experience.flatMap((entry) => entry.bullets), ...doc.sections.flatMap((section) => section.text)].filter((line) => FIRST_PERSON.test(line));
  const contact = doc.contact.join(" ");
  const filler = bullets.filter((bullet) => FILLER.test(bullet));
  const wordsIn = (bullet: string) => bullet.split(/\s+/).filter(Boolean).length;
  const tooShort = bullets.filter((bullet) => wordsIn(bullet) < 8);
  const tooLong = bullets.filter((bullet) => wordsIn(bullet) > 35);
  // The same opening verb on three or more bullets.
  const starts = new Map<string, number>();
  for (const bullet of bullets) starts.set(firstWord(bullet), (starts.get(firstWord(bullet)) ?? 0) + 1);
  const repeated = [...starts].filter(([word, count]) => word && count >= 3).map(([word, count]) => `${capitalize(word)} (${count}×)`);
  // The title the listing uses, in the headline or summary.
  const title = target.title ? coreTitle(target.title) : "";
  const summary = doc.sections.filter((section) => canonicalSection(section.key) === "summary").flatMap((section) => section.text);
  const titleShown = !title || significant(title).length === 0 || present(title, new Set(tokens([doc.headline, ...summary].join("\n"))));
  const words = [doc.headline, ...doc.sections.flatMap((section) => [section.title, ...section.text, ...section.bullets, ...section.entries.flatMap((entry) => [entry.title, entry.org, ...entry.bullets, ...entry.text])])]
    .join(" ")
    .split(/\s+/)
    .filter(Boolean).length;
  return [
    {
      id: "title",
      label: "The job's title in your headline or summary",
      ok: titleShown,
      detail: `The listing says “${title}”. Recruiters search by title, so use it (if it fits you) in the headline or the summary's first line.`,
    },
    {
      id: "filler",
      label: "Bullets say what you achieved, not your duties",
      ok: filler.length === 0,
      detail: filler.length ? `Rewrite ${listed(filler)}: drop “responsible for”, “helped”, “worked on” and say what you did and what changed.` : "",
    },
    {
      id: "length",
      label: "Bullets of 1 to 2 lines",
      ok: tooShort.length === 0 && tooLong.length === 0,
      detail: [tooLong.length ? `Too long (over 35 words): ${listed(tooLong, 2)}.` : "", tooShort.length ? `Too short to show a result: ${listed(tooShort, 2)}.` : ""].filter(Boolean).join(" "),
    },
    {
      id: "variety",
      label: "Varied opening verbs",
      ok: repeated.length === 0,
      detail: repeated.length ? `${repeated.join(", ")}. Vary them so each bullet reads as its own result (Built, Cut, Led, Automated…).` : "",
    },
    {
      id: "size",
      label: "Fits one or two pages",
      ok: words >= 250 && words <= 800,
      detail: words > 800 ? `${words} words. Over about 800 it runs past two pages; cut the oldest or least related bullets.` : `${words} words. Under about 250 it looks thin; add results to your recent jobs.`,
    },
    { id: "contact", label: "Email and phone in the header", ok: /@/.test(contact) && /\d{6,}/.test(contact.replace(/[\s()+-]/g, "")), detail: "CV readers take your contact details from the top." },
    { id: "headline", label: "Headline under your name", ok: Boolean(doc.headline), detail: "A short line naming the role you are after." },
    { id: "dates", label: "Dates on every job", ok: experience.length > 0 && undated.length === 0, detail: undated.length ? `Missing or unclear: ${undated.map((entry) => entry.title || "an entry").join(", ")}.` : "" },
    { id: "bullets", label: "2 to 6 bullets per job", ok: experience.length > 0 && thin.length === 0, detail: thin.length ? `Check: ${thin.map((entry) => entry.title || "an entry").join(", ")}.` : "" },
    { id: "voice", label: "No “I” or “my”", ok: firstPerson.length === 0, detail: firstPerson.length ? `${firstPerson.length} line(s) use the first person.` : "" },
  ];
}

// ---------- what to fix ----------

type EngineResult = ReturnType<typeof scoreResume>[number];

// The start of a bullet, to point at it in a fix.
const quote = (bullet: string) => {
  const words = bullet.trim().split(/\s+/);
  return `“${words.slice(0, 7).join(" ")}${words.length > 7 ? "…" : ""}”`;
};
const listed = (bullets: string[], max = 3) => `${bullets.slice(0, max).map(quote).join(", ")}${bullets.length > max ? `, and ${bullets.length - max} more` : ""}`;
const hasNumber = (bullet: string) => QUANTIFICATION_PATTERNS.some((pattern) => pattern.test(bullet));
const firstWord = (bullet: string) => bullet.trim().split(/\s+/)[0]?.toLowerCase().replace(/[^a-z]/g, "") ?? "";
const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

// Points lost in the six-system half of the score, split by cause. Each
// system's loss is (100 - part score) × the part's weight; the six are
// averaged and halved, since the systems make up half the overall score.
function systemFixes(results: EngineResult[], input: ScoringInput, hasKeywordList: boolean): AtsFix[] {
  const share = (lost: (result: EngineResult, index: number) => number) =>
    (results.reduce((sum, result, index) => sum + lost(result, index), 0) / results.length) * (hasKeywordList ? WEIGHTS.keyed.systems : WEIGHTS.plain.systems);
  const weights = (index: number) => ALL_PROFILES[index].weights;
  const fixes: AtsFix[] = [];
  const first = results[0]?.breakdown;
  if (!first) return fixes;

  // Experience bullets: numbers, action verbs, and how many there are.
  const { quantifiedBullets: quantified, totalBullets: total, actionVerbCount: verbs } = first.experience;
  const quantRatio = total ? quantified / total : 0;
  const verbRatio = total ? verbs / total : 0;
  const quantPoints = share((result, index) => {
    const w = weights(index);
    return (40 - Math.min(1, quantRatio / 0.4) * 40) * w.experienceRelevance + (100 - quantRatio * 100) * w.quantification;
  });
  const withoutNumbers = input.experienceBullets.filter((bullet) => !hasNumber(bullet));
  if (quantPoints >= 0.5) {
    fixes.push({
      label: "Put numbers in more experience bullets",
      detail:
        (quantRatio >= 0.4
          ? `${quantified} of ${total} bullets (${Math.round(quantRatio * 100)}%) have a number, which is good; each extra one still adds a little (users, time saved, percentages, money).`
          : `${quantified} of ${total} bullets (${Math.round(quantRatio * 100)}%) have a number. Aim for 40% or more: users, time saved, percentages, money.`) +
        (withoutNumbers.length ? ` Without one: ${listed(withoutNumbers)}.` : ""),
      points: quantPoints,
      kind: "fix",
    });
  }
  const weakStarts = input.experienceBullets.filter((bullet) => !STRONG_ACTION_VERBS.has(firstWord(bullet)));
  const verbPoints = share((_, index) => (30 - Math.min(1, verbRatio / 0.7) * 30) * weights(index).experienceRelevance);
  if (verbPoints >= 0.5) {
    fixes.push({
      label: "Start more bullets with a strong action verb",
      detail: `${Math.round(verbRatio * 100)}% start with one (for example Built, Led, Reduced, Automated). Aim for 70%.${
        weakStarts.length ? ` Change the start of ${listed(weakStarts)}.` : ""
      }`,
      points: verbPoints,
      kind: "fix",
    });
  }
  const countLost = 30 - (total >= 8 ? 30 : total >= 5 ? 25 : total >= 3 ? 20 : 10);
  const countPoints = share((_, index) => countLost * weights(index).experienceRelevance);
  if (countPoints >= 0.5) {
    fixes.push({ label: "Add more experience bullets", detail: `${total} now; 8 or more across your jobs scores best.`, points: countPoints, kind: "fix" });
  }

  // Layout and length.
  const formatPoints = share((result, index) => (100 - result.breakdown.formatting.score) * weights(index).formatting);
  if (formatPoints >= 0.5) {
    fixes.push({ label: "Fix layout issues", detail: capitalize([...new Set(results.flatMap((result) => result.breakdown.formatting.issues))].join("; ")), points: formatPoints, kind: "fix" });
  }

  // Sections the systems look for.
  const missingSections = [...new Set(results.flatMap((result) => result.breakdown.sections.missing))];
  const sectionPoints = share((result, index) => (100 - result.breakdown.sections.score) * weights(index).sectionCompleteness);
  if (sectionPoints >= 0.5) {
    fixes.push({
      label: `Add the ${missingSections.join(", ")} section${missingSections.length === 1 ? "" : "s"}`,
      detail: "Use these names exactly, so every system files the part correctly.",
      points: sectionPoints,
      kind: "fix",
    });
  }

  // Education: what can be fixed, and the GPA or honours, which are a choice.
  const notes = first.education.notes.filter((note) => /no |not |consider|may not/i.test(note));
  const choice = (note: string) => /gpa|honou?rs|cum laude|dean/i.test(note);
  const educationPoints = share((result, index) => (100 - result.breakdown.education.score) * weights(index).educationMatch);
  const fixable = notes.filter((note) => !choice(note));
  if (educationPoints >= 0.5) {
    fixes.push(
      fixable.length
        ? { label: "Complete the education entry", detail: capitalize(fixable.join("; ")), points: educationPoints, kind: "fix" }
        : {
            label: "Education extras (GPA, honours)",
            detail: "The systems add points for a GPA or honours. Leave them out if you prefer, as your facts say; no other fix needed.",
            points: educationPoints,
            kind: "choice",
          },
    );
  }

  // Each system's own rules (for example too few listed skills for Taleo).
  const quirks = new Map<string, number>();
  ALL_PROFILES.forEach((profile) => {
    for (const quirk of profile.quirks) {
      const hit = quirk.check(input);
      if (hit && hit.penalty > 0) quirks.set(hit.message, (quirks.get(hit.message) ?? 0) + hit.penalty);
    }
  });
  for (const [message, penalty] of quirks) {
    fixes.push({ label: capitalize(message.split(". ")[0]), detail: capitalize(message), points: (penalty / results.length) * (hasKeywordList ? WEIGHTS.keyed.systems : WEIGHTS.plain.systems), kind: "fix" });
  }
  return fixes;
}

// ---------- the combined result ----------

const suggestionText = (suggestion: Suggestion) => (typeof suggestion === "string" ? suggestion : suggestion.summary);
const average = (values: number[]) => (values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : 0);

// The keyword part of the fixes: points from both halves of the score.
function keywordFixes(results: EngineResult[], target: AtsTarget, matched: AtsKeyword[], missing: AtsKeyword[]): AtsFix[] {
  const weight = (list: AtsKeyword[]) => list.reduce((sum, keyword) => sum + (keyword.must ? 2 : 1), 0);
  const total = weight(target.keywords);
  // The engine's keyword part, spread over the missing keywords by weight.
  const engineLost =
    (results.reduce((sum, result, index) => sum + (100 - result.breakdown.keywordMatch.score) * ALL_PROFILES[index].weights.keywordMatch, 0) / results.length) * WEIGHTS.keyed.systems;
  const worth = (list: AtsKeyword[]) => (weight(list) / total) * WEIGHTS.keyed.keywords * 100 + (missing.length ? (weight(list) / weight(missing)) * engineLost : 0);
  const must = missing.filter((keyword) => keyword.must);
  const other = missing.filter((keyword) => !keyword.must);
  const fixes: AtsFix[] = [];
  if (must.length) {
    fixes.push({
      label: `Add the required keywords you really have (${must.length})`,
      detail: `${must.map((keyword) => keyword.term).join(", ")}. The listing requires these; use the same words, in the summary, a job's bullets, or Skills.`,
      points: worth(must),
      kind: "if-true",
    });
  }
  if (other.length) {
    fixes.push({
      label: `Add more of the job's keywords that are true for you (${other.length} missing)`,
      detail: `${other.slice(0, 15).map((keyword) => keyword.term).join(", ")}${other.length > 15 ? ", …" : ""}. Skip any you do not have: a recruiter will check.`,
      points: worth(other),
      kind: "if-true",
    });
  }
  if (!matched.length && !missing.length) return [];
  return fixes;
}

// Keywords found only in the Skills list: systems that rank by context, and
// recruiters, trust a skill more when a job's bullets show it in use.
function contextFix(doc: CvDocument, matched: AtsKeyword[]): AtsFix[] {
  const used = new Set(
    tokens(
      [doc.headline, ...doc.sections.filter((section) => !/skill|competenc|technolog/.test(section.key)).flatMap((section) => [...section.text, ...section.bullets, ...section.entries.flatMap((entry) => [entry.title, ...entry.bullets, ...entry.text])])].join("\n"),
    ),
  );
  const listOnly = matched.filter((keyword) => !present(keyword.term, used));
  if (!listOnly.length) return [];
  const terms = [...listOnly.filter((keyword) => keyword.must), ...listOnly.filter((keyword) => !keyword.must)].map((keyword) => keyword.term);
  return [
    {
      label: `Show ${terms.length === 1 ? "this skill" : `these ${terms.length} skills`} in your experience, not only in Skills`,
      detail: `${terms.slice(0, 12).join(", ")}${terms.length > 12 ? ", …" : ""}. Name each one in the bullet where you used it, or in the summary: a skill shown in use counts for more than a list.`,
      points: 0,
      kind: "fix",
    },
  ];
}

// ---------- the VeriWorkly review ----------

// Its rules that Offerbound's own fixes already cover, so the advice is not given
// twice: the review's points go to Offerbound's fix instead.
const COVERED: Record<string, string> = {
  "ats-v2.content.metrics": "Put numbers in more experience bullets",
  "ats-v2.content.verbs": "Start more bullets with a strong action verb",
};
// Its rules that match one of Offerbound's checks, which names the exact bullets.
const SAME_CHECK: Record<string, string> = {
  "ats-v2.writing.firstPerson": "voice",
  "ats-v2.writing.weakOpeners": "filler",
  "ats-v2.writing.bulletLength": "length",
  "ats-v2.writing.repeatedOpeners": "variety",
  "ats-v2.writing.bulletsPerRole": "bullets",
  "ats-v2.format.length": "size",
};

// Below this, the target is only a role's name, not a listing to match.
const LISTING_MIN = 200;

// Listings' sub-headings ("Strongly Preferred", "We will want to understand:")
// are read as requirements too; a requirement says something.
const isRequirement = (requirement: { text: string }) => {
  const text = requirement.text.trim();
  return text.split(/\s+/).length >= 3 && !text.endsWith(":") && !/^(evidence|strongly preferred|nice to have|requirements|qualifications)\b/i.test(text);
};

function runReview(markdown: string, target: AtsTarget): AtsReport {
  const text = markdown.replace(/\*\*/g, "");
  const listing = target.text.length >= LISTING_MIN ? target.text : undefined;
  return reviewCv(text, undefined, { jobDescription: listing, now: new Date() });
}

function summarize(report: AtsReport): AtsReview {
  const parsed = report.parsed;
  const rows: { label: string; value: string }[] = [];
  if (parsed.name) rows.push({ label: "Name", value: parsed.name });
  rows.push({ label: "Contact", value: [parsed.email, parsed.phone].filter(Boolean).join(" · ") || "Not found" });
  for (const role of parsed.roles.slice(0, 6)) {
    rows.push({ label: "Role", value: [`${role.title}${role.employer ? `, ${role.employer}` : ""}`, formatRoleDates(role)].filter(Boolean).join(" · ") });
  }
  if (parsed.monthsOfExperience !== null) rows.push({ label: "Experience", value: formatTenure(parsed.monthsOfExperience) });
  if (parsed.highestDegree) rows.push({ label: "Degree", value: DEGREE_LABELS[parsed.highestDegree] });
  if (parsed.skills.length) rows.push({ label: "Skills", value: `${parsed.skills.length}: ${parsed.skills.slice(0, 10).join(", ")}${parsed.skills.length > 10 ? ", …" : ""}` });
  if (parsed.spokenLanguages.length) rows.push({ label: "Languages", value: parsed.spokenLanguages.map(formatSpokenLanguage).join(", ") });
  return {
    score: report.jobMatchScore === null ? report.readinessScore : Math.round((report.readinessScore + report.jobMatchScore) / 2),
    readiness: report.readinessScore,
    jobMatch: report.jobMatchScore,
    categories: report.categories.filter((category) => category.possible > 0).map((category) => ({ label: categoryLabel(category.category), score: category.score, lost: category.lost })),
    strengths: report.strengths,
    requirements: report.requirements.filter(isRequirement).map((requirement) => ({
      text: requirement.text,
      status: requirement.status,
      required: requirement.importance === "required",
      detail: requirement.detail ?? "",
      evidence: requirement.evidence.slice(0, 2).join(" · "),
    })),
    parsed: rows,
  };
}

// The review's failed checks and unmet requirements as fixes. Points are what
// each costs in the overall score.
function reviewFixes(report: AtsReport, weight: number, fixes: AtsFix[], checks: AtsCheck[]): AtsFix[] {
  const share = report.jobMatchScore === null ? 1 : 0.5;
  const out: AtsFix[] = [];
  for (const failed of report.failedChecks) {
    const points = failed.scoreImpact * share * weight;
    const covered = COVERED[failed.id] ? fixes.find((fix) => fix.label === COVERED[failed.id]) : undefined;
    if (covered) {
      covered.points += points;
      continue;
    }
    const sameCheck = SAME_CHECK[failed.id] ? checks.find((item) => item.id === SAME_CHECK[failed.id] && !item.ok) : undefined;
    if (sameCheck) {
      out.push({ label: sameCheck.label, detail: `${sameCheck.detail} ${failed.fix}`.trim(), points, kind: "fix" });
      continue;
    }
    if (failed.id === "ats-v2.content.skillEvidence") {
      const context = fixes.find((fix) => fix.label.startsWith("Show "));
      if (context) {
        context.points += points;
        continue;
      }
    }
    out.push({ label: failed.fix.split(/(?<=\.)\s/)[0], detail: failed.evidence, points, kind: "fix" });
  }
  if (report.jobMatchScore !== null) {
    const unmet = report.requirements.filter(isRequirement).filter((requirement) => requirement.status === "missing" || requirement.status === "partial");
    if (unmet.length) {
      const required = unmet.filter((requirement) => requirement.importance === "required");
      const listed = unmet
        .slice(0, 5)
        .map((requirement) => `“${requirement.text.replace(/\.\s*$/, "")}”${requirement.detail ? ` (${requirement.detail})` : requirement.status === "partial" ? " (partly shown)" : ""}`)
        .join("; ");
      out.push({
        label: `Show the listing's requirements you meet (${unmet.length} not shown${required.length ? `, ${required.length} required` : ""})`,
        detail: `${listed}${unmet.length > 5 ? "; …" : ""}. Where it is true, say it in the listing's words: years in the role, the degree, the skill in a bullet.`,
        points: (100 - report.jobMatchScore) * 0.5 * weight,
        kind: "if-true",
      });
    }
  }
  return out;
}

export function checkCv(raw: string, target: AtsTarget): AtsResult {
  // The CV in its own layout, so every screen (editor, lists, job page)
  // scores the same text whatever the file's formatting.
  const doc = parseCv(raw);
  const markdown = serializeCv(doc);
  const input = scoringInput(doc, markdown, target);
  const results = scoreResume(input);
  const systemsScore = average(results.map((result) => result.overallScore));
  const hasKeywordList = target.keywords.length > 0;
  const checks = jobflowChecks(doc, target);
  // Offerbound's own checks carry no points, but recruiters notice them.
  const checkFixes: AtsFix[] = checks.filter((check) => !check.ok).map((check) => ({ label: check.label, detail: check.detail, points: 0, kind: "fix" }));
  const sortFixes = (fixes: AtsFix[]) =>
    fixes.map((fix) => ({ ...fix, points: Math.round(fix.points * 10) / 10 })).sort((a, b) => (a.kind === "choice" ? 1 : 0) - (b.kind === "choice" ? 1 : 0) || b.points - a.points);
  const suggestions = [...new Set(results.flatMap((result) => result.suggestions.map(suggestionText)))]
    // Keyword advice comes from Offerbound's keyword list instead.
    .filter((text) => !/missing keywords|keyword matching|exact terms/i.test(text))
    .slice(0, 5);
  const report = runReview(markdown, target);
  const review = summarize(report);
  const base = {
    review,
    systemsScore,
    systems: results.map((result) => ({ name: result.system, vendor: result.vendor, score: result.overallScore, passes: result.passesFilter })),
    suggestions,
    checks,
  };

  // A Offerbound check the review's fixes already carry is not listed twice.
  const merge = (fixes: AtsFix[], fromReview: AtsFix[]) => [...fixes, ...fromReview, ...checkFixes.filter((fix) => !fromReview.some((item) => item.label === fix.label))];
  if (!hasKeywordList) {
    const fixes = systemFixes(results, input, false);
    return {
      ...base,
      score: Math.round(systemsScore * WEIGHTS.plain.systems + review.score * WEIGHTS.plain.review),
      fixes: sortFixes(merge(fixes, reviewFixes(report, WEIGHTS.plain.review, fixes, checks))),
      keywords: { matched: [], missing: [], must: [], percent: null },
    };
  }
  const cvWords = new Set(tokens(markdown));
  const matched = target.keywords.filter((keyword) => present(keyword.term, cvWords));
  const missing = target.keywords.filter((keyword) => !matched.includes(keyword));
  // Must-have keywords count double.
  const weight = (list: AtsKeyword[]) => list.reduce((sum, keyword) => sum + (keyword.must ? 2 : 1), 0);
  const percent = Math.round((weight(matched) / weight(target.keywords)) * 100);
  const fixes = [...keywordFixes(results, target, matched, missing), ...systemFixes(results, input, true), ...contextFix(doc, matched)];
  return {
    ...base,
    score: Math.round(systemsScore * WEIGHTS.keyed.systems + percent * WEIGHTS.keyed.keywords + review.score * WEIGHTS.keyed.review),
    fixes: sortFixes(merge(fixes, reviewFixes(report, WEIGHTS.keyed.review, fixes, checks))),
    keywords: {
      matched: matched.map((keyword) => keyword.term),
      missing: missing.map((keyword) => keyword.term),
      must: target.keywords.filter((keyword) => keyword.must).map((keyword) => keyword.term.toLowerCase()),
      percent,
    },
  };
}
