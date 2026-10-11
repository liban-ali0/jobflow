// Turns the ranking step's judgement of a job into a score out of 100.
// Role, country, and freshness are computed from the settings so they stay
// consistent between runs; the rest comes from the assessment.

// Parts that Claude assesses, with the highest value each can take.
export const ASSESSED = {
  entry_fit: { label: "Experience fit", max: 15 },
  legitimacy: { label: "Legitimacy", max: 10 },
  company: { label: "Company", max: 10 },
  sponsorship: { label: "Sponsorship", max: 5 },
  language: { label: "Language", max: 3 },
  response: { label: "Response chance", max: 2 },
};

const ROLE_POINTS = [25, 20, 14];
const COUNTRY_POINTS = [15, 11, 8];
const FRESHNESS_MAX = 15;
const UNKNOWN_AGE_POINTS = 5;

// Below this legitimacy value a job is treated as likely fake and excluded.
export const LEGITIMACY_FLOOR = 4;

const clamp = (value, max) => Math.max(0, Math.min(max, Number(value) || 0));
const byPriority = (a, b) => a.priority - b.priority;

// Older assessments called the language criterion "arabic".
export const normalizeAssessment = (assessment) =>
  assessment.language === undefined && assessment.arabic !== undefined ? { ...assessment, language: assessment.arabic } : assessment;

export function scoreJob(job, settings, given, now = Date.now()) {
  const assessment = normalizeAssessment(given);
  const breakdown = {};

  const roleKey = assessment.role ?? job.role;
  const roleRank = [...settings.roles].sort(byPriority).findIndex((role) => role.key === roleKey);
  breakdown.Role = roleRank >= 0 ? (ROLE_POINTS[roleRank] ?? 10) : 0;

  const countries = [...settings.countries].sort(byPriority);
  const countryRank = countries.findIndex((country) => country.name === job.country);
  let countryPoints = countryRank >= 0 ? (COUNTRY_POINTS[countryRank] ?? 6) : 0;
  const preferredCity = countryRank >= 0 ? countries[countryRank].cities[0] : null;
  if (countryPoints && job.city && preferredCity && job.work_mode !== "remote" && job.city !== preferredCity) {
    countryPoints -= 2;
  }
  breakdown.Country = countryPoints;

  const posted = job.posted_at ? Date.parse(job.posted_at) : NaN;
  if (Number.isNaN(posted)) {
    breakdown.Freshness = UNKNOWN_AGE_POINTS;
  } else {
    const left = 1 - (now - posted) / (settings.freshness.maxHours * 3600000);
    breakdown.Freshness = Math.round(FRESHNESS_MAX * Math.max(0, Math.min(1, left)));
  }

  for (const [key, { label, max }] of Object.entries(ASSESSED)) {
    breakdown[label] = clamp(assessment[key], max);
  }

  const score = Object.values(breakdown).reduce((sum, value) => sum + value, 0);

  let excluded = assessment.exclude ? String(assessment.exclude) : null;
  if (!excluded && breakdown.Legitimacy < LEGITIMACY_FLOOR) excluded = "Likely not a genuine listing";
  if (!excluded && breakdown.Role === 0) excluded = "Not one of the target roles";

  return { score, breakdown, excluded };
}
