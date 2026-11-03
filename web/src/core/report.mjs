// The job report: the research step's judgments in a fixed shape
// (<job folder>/report.json), checked here before it is saved, plus a match
// figure computed from it in code.
//
// The shape follows the questions career-ops' evaluation answers (github.com/
// career-ops-hq/career-ops, MIT): should I apply, how do the requirements
// match, what level and pay, is the posting real. What differs: the rules it
// states for the model are enforced here instead. An importance that rests on
// a guess ("inferred") can never be critical or high, a "stated" importance
// needs the listing's own words, a strong match needs evidence, and the match
// figure is arithmetic, not the model's opinion.

export const IMPORTANCE = ["critical", "high", "meaningful", "preferred"];
export const BASIS = ["stated", "structural", "inferred"];
export const MATCH = ["strong", "partial", "missing", "na"];
export const CALLS = ["apply", "consider", "research_first", "skip"];
const WEIGHT = { critical: 4, high: 3, meaningful: 2, preferred: 1 };
const CREDIT = { strong: 1, partial: 0.5, missing: 0 };

const text = (value, max = 600) => (typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "");
const pick = (value, allowed, fallback) => (allowed.includes(value) ? value : fallback);
const list = (value, max) => (Array.isArray(value) ? value.slice(0, max) : []);

// Checks and tidies a report. Returns { report, problems, fixed }: problems
// make the save fail (the engine fixes them), fixed lists what was corrected
// silently.
export function normalizeReport(raw) {
  const problems = [];
  const fixed = [];
  if (!raw || typeof raw !== "object") return { report: null, problems: ["The report must be a JSON object."], fixed };

  const verdict = { call: pick(raw.verdict?.call, CALLS, null), reason: text(raw.verdict?.reason, 300) };
  if (!verdict.call) problems.push(`verdict.call must be one of ${CALLS.join(", ")}.`);
  if (!verdict.reason) problems.push("verdict.reason: one sentence on why.");

  const requirements = [];
  for (const [index, item] of list(raw.requirements, 25).entries()) {
    const requirement = text(item?.requirement, 160);
    if (!requirement) {
      problems.push(`requirements[${index}].requirement is empty.`);
      continue;
    }
    let importance = pick(item.importance, IMPORTANCE, null);
    const basis = pick(item.basis, BASIS, null);
    const match = pick(item.match, MATCH, null);
    const quote = text(item.quote, 300);
    const evidence = text(item.evidence, 400);
    if (!importance) problems.push(`requirements[${index}].importance must be one of ${IMPORTANCE.join(", ")}.`);
    if (!basis) problems.push(`requirements[${index}].basis must be one of ${BASIS.join(", ")}.`);
    if (!match) problems.push(`requirements[${index}].match must be one of ${MATCH.join(", ")}.`);
    if (basis === "stated" && !quote) problems.push(`requirements[${index}] ("${requirement}") is "stated": quote the listing's words in "quote".`);
    if (match === "strong" && !evidence) problems.push(`requirements[${index}] ("${requirement}") is a strong match: give the evidence from the profile.`);
    // A guess about how much something matters cannot make it decisive.
    if (basis === "inferred" && (importance === "critical" || importance === "high")) {
      fixed.push(`"${requirement}": importance lowered to meaningful (it was inferred, not in the listing).`);
      importance = "meaningful";
    }
    requirements.push({ requirement, importance, basis, match, quote: quote || null, evidence: evidence || null });
  }
  if (!requirements.length) problems.push("requirements: list the listing's main requirements (at least one).");

  const gaps = list(raw.gaps, 12)
    .map((gap) => ({ requirement: text(gap?.requirement, 160), blocker: gap?.blocker === true, risk: text(gap?.risk, 400), mitigation: text(gap?.mitigation, 500) }))
    .filter((gap) => gap.requirement);
  // Every unmet critical or high requirement needs its risk and a way to answer it.
  for (const row of requirements) {
    if (!["critical", "high"].includes(row.importance) || !["missing", "partial"].includes(row.match)) continue;
    const gap = gaps.find((item) => item.requirement.toLowerCase() === row.requirement.toLowerCase());
    if (!gap || !gap.risk || !gap.mitigation) problems.push(`gaps: "${row.requirement}" is a ${row.importance} requirement not fully met; add it with "risk" and "mitigation".`);
  }

  const legitimacyTier = pick(raw.legitimacy?.tier, ["high", "caution", "suspicious"], "caution");
  const report = {
    verdict,
    summary: text(raw.summary, 700),
    role: {
      level: text(raw.role?.level, 80),
      function: text(raw.role?.function, 120),
      work_mode: text(raw.role?.work_mode, 60),
      team: text(raw.role?.team, 200),
    },
    requirements,
    gaps,
    level: {
      asked: text(raw.level?.asked, 120),
      yours: text(raw.level?.yours, 120),
      pitch: text(raw.level?.pitch, 600),
      if_lower: text(raw.level?.if_lower, 400),
    },
    pay: {
      range: text(raw.pay?.range, 160),
      ask: text(raw.pay?.ask, 160),
      basis: text(raw.pay?.basis, 400),
      reliability: pick(raw.pay?.reliability, ["high", "medium", "low"], "low"),
    },
    legitimacy: {
      tier: legitimacyTier,
      signals: list(raw.legitimacy?.signals, 12)
        .map((signal) => ({ signal: text(signal?.signal, 80), finding: text(signal?.finding, 300), weight: pick(signal?.weight, ["positive", "neutral", "concerning"], "neutral") }))
        .filter((signal) => signal.signal && signal.finding),
    },
    cv_changes: list(raw.cv_changes, 8)
      .map((change) => ({ section: text(change?.section, 60), change: text(change?.change, 300), why: text(change?.why, 200) }))
      .filter((change) => change.section && change.change),
    questions: list(raw.questions, 6).map((question) => text(question, 200)).filter(Boolean),
  };
  if (!report.summary) problems.push("summary: three to five lines on the company, the job and the fit.");
  if (requirements.length > 20) fixed.push("More than 20 requirements: keep the important ones.");
  return { report, problems, fixed };
}

// The match figure: each requirement weighted by importance, credited by
// how well the profile meets it. "na" rows do not count.
export function matchFigure(report) {
  const rows = (report?.requirements ?? []).filter((row) => row.match in CREDIT && row.importance in WEIGHT);
  if (!rows.length) return null;
  const total = rows.reduce((sum, row) => sum + WEIGHT[row.importance], 0);
  const earned = rows.reduce((sum, row) => sum + WEIGHT[row.importance] * CREDIT[row.match], 0);
  const decisive = rows.filter((row) => row.importance === "critical" || row.importance === "high");
  return {
    percent: Math.round((earned / total) * 100),
    decisive: { met: decisive.filter((row) => row.match === "strong").length, partial: decisive.filter((row) => row.match === "partial").length, missing: decisive.filter((row) => row.match === "missing").length, total: decisive.length },
    rows: rows.length,
  };
}

// Requirements in reading order: most important first, unmet before met.
export function orderedRequirements(report) {
  const order = { missing: 0, partial: 1, strong: 2, na: 3 };
  return [...(report?.requirements ?? [])].sort((a, b) => IMPORTANCE.indexOf(a.importance) - IMPORTANCE.indexOf(b.importance) || order[a.match] - order[b.match]);
}
