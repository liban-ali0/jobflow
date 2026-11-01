// Does a written document (tailored CV, cover letter, outreach email) claim
// anything the user's own sources do not back? The sources are
// candidate/profile.md, candidate/facts.md and the base CVs; numbers, tools,
// employers, education, certificates and inflated scope found nowhere in them
// are listed with the sentence they are in, for the user to check.
//
// The checker is career-ops' verify-cv-facts (MIT), vendored in
// vendor/career-ops/verify-cv-facts.mjs. Claims the user confirms as true go
// into its allow lists, kept in candidate/cv-facts.json. Offerbound adds one
// rule: a name in a sentence that says the user has NOT used it ("I have not
// worked with Q-SYS") is not a claim.
import fs from "node:fs";
import path from "node:path";
import { verifyFacts } from "../vendor/career-ops/verify-cv-facts.mjs";

const CONFIG = path.join("candidate", "cv-facts.json");
const KEYS = ["allow_metrics", "allow_facts", "forbidden_phrases", "warn_phrases"];

export const FACT_KIND_LABELS = {
  number: "Number",
  tool: "Tool or skill",
  employer: "Employer",
  education: "Education",
  certification: "Certificate",
  title: "Job title",
  scope: "Bigger role than your profile says",
  adoption: "How widely it was used",
  authorship: "Who did the work",
};

export function factSources(rootDir) {
  const candidate = path.join(rootDir, "candidate");
  const base = fs.existsSync(candidate) ? fs.readdirSync(candidate).filter((name) => /^base-cv-.+\.md$/.test(name)).sort() : [];
  return ["profile.md", "facts.md", ...base].map((name) => path.join(candidate, name)).filter((file) => fs.existsSync(file));
}

// The sentence (or list line) a claim sits in, so the user can judge it.
const NUMBER_WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen", "twenty"];
const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Where a claim is in the text: a number claim ("10 minutes") by its number,
// written as digits or as a word, followed closely by its noun; a name by
// the name itself.
function claimIndex(plain, value) {
  const low = plain.toLowerCase();
  const claim = String(value).toLowerCase();
  const number = /\d[\d,.]*/.exec(claim)?.[0];
  const noun = claim.match(/\p{L}+/gu)?.pop();
  if (number) {
    const spelled = NUMBER_WORDS[Number(number)];
    const head = spelled ? `(?:${escape(number)}|${spelled})` : escape(number);
    const pattern = noun ? new RegExp(`(?<![\\p{L}\\p{N}])${head}(?![\\p{N}])[^.\\n]{0,40}?${escape(noun)}`, "u") : new RegExp(`(?<![\\p{L}\\p{N}])${head}(?![\\p{N}])`, "u");
    const match = pattern.exec(low);
    if (match) return match.index;
  }
  const at = low.indexOf(claim);
  if (at >= 0) return at;
  const word = claim.match(/[\p{L}\p{N}][\p{L}\p{N}.+#-]*/gu)?.[0];
  return word ? low.search(new RegExp(`(?<![\\p{L}\\p{N}])${escape(word)}`, "u")) : -1;
}

function sentenceOf(text, value) {
  const plain = text.replace(/[*_`#>]/g, "");
  const at = claimIndex(plain, value);
  if (at < 0) return null;
  const start = Math.max(plain.lastIndexOf("\n", at), ...[". ", "! ", "? "].map((stop) => plain.lastIndexOf(stop, at))) + 1;
  const ends = ["\n", ". ", "! ", "? "].map((stop) => plain.indexOf(stop, at)).filter((index) => index >= 0);
  const end = ends.length ? Math.min(...ends) + 1 : plain.length;
  const sentence = plain.slice(start, end).trim();
  return sentence.length > 300 ? `${sentence.slice(0, 297)}…` : sentence;
}

const NEGATION = /\b(?:have not|haven't|has not|hasn't|did not|didn't|not yet|never|no (?:hands-on |direct |professional )?experience|without experience|lack|new to)\b/i;

// Only the clause the name sits in counts: "I have not used X, but I have
// used Y" does not negate Y.
function negated(sentence, value) {
  if (!sentence) return false;
  const at = sentence.toLowerCase().indexOf(String(value).toLowerCase().split(/\s+/)[0]);
  const before = at >= 0 ? sentence.slice(0, at) : sentence;
  const clause = before.slice(Math.max(before.lastIndexOf(","), before.lastIndexOf(";"), before.toLowerCase().lastIndexOf(" but ")) + 1);
  return NEGATION.test(clause);
}

// What the checker could not read, in the user's words (career-ops' own
// message names its config file).
function coverageNote(coverage) {
  if (!coverage) return null;
  if (coverage.reason === "scope-not-checked") return "This document is not in English, so how big a role it describes was not compared with your profile. Numbers were still checked.";
  return "Some counts here are written in a way the checker cannot read, so they were not compared with your profile. Check them yourself; percentages and amounts were still checked.";
}

// { items: [{ kind, label, value, sentence, advisory }], forbidden, note }.
// advisory items are worth a look but are often fine (a job title reframed).
export function checkFacts(rootDir, text) {
  const sources = factSources(rootDir);
  if (!sources.length) return { items: [], forbidden: [], note: "No profile or facts yet, so nothing to check against." };
  const result = verifyFacts(text, { sourcePaths: sources, configPath: path.join(rootDir, CONFIG), cwd: rootDir });
  const raw = [
    ...result.invented.map((value) => ({ kind: "number", value, advisory: false })),
    ...result.unsupportedFacts.map(({ kind, value }) => ({ kind, value, advisory: false })),
    ...result.advisoryFacts.map(({ kind, value }) => ({ kind, value, advisory: true })),
  ];
  const items = raw
    .map((item) => ({ ...item, label: FACT_KIND_LABELS[item.kind] ?? item.kind, sentence: sentenceOf(text, item.value) }))
    .filter((item) => item.kind === "number" || !negated(item.sentence, item.value));
  return { items, forbidden: result.forbidden, note: coverageNote(result.coverage) };
}

function readConfig(rootDir) {
  const file = path.join(rootDir, CONFIG);
  let config = {};
  try {
    config = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    // None yet, or unreadable: start from empty lists.
  }
  for (const key of KEYS) if (!Array.isArray(config[key])) config[key] = [];
  return config;
}

// The user says a flagged claim is true: later checks accept it.
export function allowFact(rootDir, { kind, value }) {
  const text = String(value ?? "").trim().slice(0, 200);
  if (!text) return false;
  const config = readConfig(rootDir);
  const key = kind === "number" ? "allow_metrics" : "allow_facts";
  if (!config[key].includes(text)) config[key].push(text);
  fs.writeFileSync(path.join(rootDir, CONFIG), `${JSON.stringify(config, null, 2)}\n`);
  return true;
}
