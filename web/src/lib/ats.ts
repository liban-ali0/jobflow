// ATS (applicant tracking system) check of a CV, combining two parts:
// - How six real ATS platforms would read and score it, from the open-source
//   ATS Screener engine (src/vendor/ats-screener, MIT). Its own keyword step
//   counts every word of a listing, so it is given research's clean keyword
//   list instead of the raw listing text when there is one.
// - Jobflow's keyword match: the job's keywords as phrases, with close
//   variants and must-haves, which judges the fit to this job.
// The score is half of each. Deterministic and instant, so the CV editor can
// re-check on every keystroke and the same CV always gets the same score.
import { parseCv, type CvDocument } from "./cv-format";
import { scoreResume } from "@/vendor/ats-screener/scorer/engine";
import { ALL_PROFILES } from "@/vendor/ats-screener/scorer/profiles";
import type { ScoringInput, Suggestion } from "@/vendor/ats-screener/scorer/types";
import { QUANTIFICATION_PATTERNS, STRONG_ACTION_VERBS } from "@/vendor/ats-screener/scorer/experience-scorer";

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

function tokens(text: string) {
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

const significant = (term: string) => tokens(term).filter((word) => !STOPWORDS.has(word));

// A keyword counts as present when its important words all appear in the CV
// (or most of them, for longer phrases).
function present(keyword: string, cvWords: Set<string>) {
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
    // Jobflow's templates are one column of real text, without tables or images.
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

// ---------- Jobflow's own checks ----------

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
    (results.reduce((sum, result, index) => sum + lost(result, index), 0) / results.length) * (hasKeywordList ? 0.5 : 1);
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
    fixes.push({ label: capitalize(message.split(". ")[0]), detail: capitalize(message), points: (penalty / results.length) * (hasKeywordList ? 0.5 : 1), kind: "fix" });
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
    (results.reduce((sum, result, index) => sum + (100 - result.breakdown.keywordMatch.score) * ALL_PROFILES[index].weights.keywordMatch, 0) / results.length) * 0.5;
  const worth = (list: AtsKeyword[]) => (weight(list) / total) * 50 + (missing.length ? (weight(list) / weight(missing)) * engineLost : 0);
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

export function checkCv(markdown: string, target: AtsTarget): AtsResult {
  const doc = parseCv(markdown);
  const input = scoringInput(doc, markdown, target);
  const results = scoreResume(input);
  const systemsScore = average(results.map((result) => result.overallScore));
  const hasKeywordList = target.keywords.length > 0;
  const checks = jobflowChecks(doc, target);
  // Jobflow's own checks carry no points, but recruiters notice them.
  const checkFixes: AtsFix[] = checks.filter((check) => !check.ok).map((check) => ({ label: check.label, detail: check.detail, points: 0, kind: "fix" }));
  const sortFixes = (fixes: AtsFix[]) =>
    fixes.map((fix) => ({ ...fix, points: Math.round(fix.points * 10) / 10 })).sort((a, b) => (a.kind === "choice" ? 1 : 0) - (b.kind === "choice" ? 1 : 0) || b.points - a.points);
  const suggestions = [...new Set(results.flatMap((result) => result.suggestions.map(suggestionText)))]
    // Keyword advice comes from Jobflow's keyword list instead.
    .filter((text) => !/missing keywords|keyword matching|exact terms/i.test(text))
    .slice(0, 5);
  const base = {
    systemsScore,
    systems: results.map((result) => ({ name: result.system, vendor: result.vendor, score: result.overallScore, passes: result.passesFilter })),
    suggestions,
    checks,
  };

  if (!hasKeywordList) {
    return {
      ...base,
      score: systemsScore,
      fixes: sortFixes([...systemFixes(results, input, false), ...checkFixes]),
      keywords: { matched: [], missing: [], must: [], percent: null },
    };
  }
  const cvWords = new Set(tokens(markdown));
  const matched = target.keywords.filter((keyword) => present(keyword.term, cvWords));
  const missing = target.keywords.filter((keyword) => !matched.includes(keyword));
  // Must-have keywords count double.
  const weight = (list: AtsKeyword[]) => list.reduce((sum, keyword) => sum + (keyword.must ? 2 : 1), 0);
  const percent = Math.round((weight(matched) / weight(target.keywords)) * 100);
  return {
    ...base,
    score: Math.round((systemsScore + percent) / 2),
    fixes: sortFixes([...keywordFixes(results, target, matched, missing), ...systemFixes(results, input, true), ...contextFix(doc, matched), ...checkFixes]),
    keywords: {
      matched: matched.map((keyword) => keyword.term),
      missing: missing.map((keyword) => keyword.term),
      must: target.keywords.filter((keyword) => keyword.must).map((keyword) => keyword.term.toLowerCase()),
      percent,
    },
  };
}
