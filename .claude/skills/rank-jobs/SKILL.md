---
name: rank-jobs
description: Check and rank jobs - read each description, apply the exclusions, do a quick legitimacy and company check, and score it. Argument - a number (rank up to that many of the newest "found" jobs, default 20) or "ids:12,34" (rank or re-rank exactly those jobs).
---

# Check and rank new jobs

This is the quick, cheap check. It decides which jobs are worth the full research later, so be fast: a few minutes per job at most, and no deep research.

## Steps

1. Read the settings: `node scripts/jobs.mjs settings`.
2. Decide which jobs to rank from the argument: `$ARGUMENTS`
   - If it starts with `ids:`, rank exactly those job ids, whatever their current status. This is a re-rank when a job was ranked or excluded before: assess it again from scratch with the current rules.
   - Otherwise list the waiting jobs with `node scripts/jobs.mjs list --status found` and take the newest first, up to that number (20 if no number was given).
3. For each job, read it with `node scripts/jobs.mjs get <id>` and assess it as described below.
4. Write the assessment to `jobs/_work/rank-<id>.json` and apply it with `node scripts/jobs.mjs score <id> --file jobs/_work/rank-<id>.json`. The script computes the score and sets the status to `ranked` or `excluded`.
5. End with a short report: how many were ranked and excluded, the five best with their scores and one-line reasons, and any job you could not assess.

## Candidate

Read the "Summary facts", "Experience", and "Skills" sections of `candidate/profile.md` once at the start of the run. Judge every job against that profile: level, years of experience, stack, languages, visa needs, and location.

## Extra rules from the user

The settings contain `customRules`: free text the user wrote in the app's Profile screen. Follow every rule in it. When a rule conflicts with this file, the user's rule wins. When a job is excluded or marked down because of one, say so in `reason`.

## When a fact is missing

If a judgement depends on something about the candidate that the profile and `candidate/facts.md` do not say, and it affects several jobs (for example, whether the candidate may already work in one of the target countries), ask once: write `jobs/_work/question.json` with `text`, `why`, and `options` if fixed answers fit, then run `node scripts/jobs.mjs ask --file jobs/_work/question.json`. Check `node scripts/jobs.mjs questions` first so the same question is not asked twice. Until it is answered, score the cautious way and say so in `reason`.

## Exclude the job (set `exclude` to a short reason) when

Apply the switches in the settings' `exclusions`; skip a rule whose switch is off.

- `nationalsOnly`: it is open only to citizens of the country and the candidate is not one (for example UAE nationals, Saudization or Qatarization roles).
- `transferableIqamaRequired`: it requires a residence or work permit the candidate does not have, such as a transferable iqama or an existing local visa.
- It requires more than the maximum years of experience in the settings (`experience.maxYears`), or it is clearly a senior, lead, or management role. LinkedIn's "Mid-Senior level" label alone is not a reason: judge the years and duties in the description.
- It does not fit any of the target roles in the settings (`roles`), judged from the duties, not only the title. Job fairs and generic recruitment posts never fit.
- It is an internship, or a programme the candidate is not eligible for according to the profile (for example, one limited to recent graduates when they graduated too long ago).
- `payToApply`: it asks for a fee, deposit, or payment to apply or to be processed.
- The work location is outside the target countries.

When a job is excluded, the other fields can be 0.

## Assessment fields

| Field | Values | How to judge |
|---|---|---|
| `role` | a role `key` from the settings | The target role the job really belongs to, judged from the description, not only its title |
| `entry_fit` | 0 to 15 | Experience fit. 15 the years asked match the candidate's and the stack matches the profile closely, 10 the years match but the stack only partly, 5 years unclear or slightly above, 0 clearly needs more experience |
| `legitimacy` | 0 to 10 | 10 known company posting directly, 7 real company through a known agency, 4 thin details or a generic agency post, below 4 signs of a fake listing |
| `company` | 0 to 10 | Reputation, size, stability, and how good a first job there would be |
| `sponsorship` | 0 to 5 | 5 sponsorship or relocation stated, 3 the employer normally hires expats, 0 hints it will not sponsor |
| `language` | 0 to 3 | Advantage from the candidate's languages other than English (see the profile): 3 a language they speak well is required, 1 it is preferred or useful, 0 no mention or a language they lack |
| `response` | 0 to 2 | 2 direct application with a named recruiter or small applicant pool, 0 mass posting or agency collecting CVs |
| `reason` | one sentence | The main reasons behind the score, in plain words |
| `legitimacy_note` | one sentence | What the legitimacy judgement is based on |
| `work_mode` | `remote`, `onsite`, `hybrid` | Only when the description states it |
| `exclude` | short reason | Only when one of the exclusion rules applies |

Example file:

```json
{
  "role": "software",
  "entry_fit": 15,
  "legitimacy": 9,
  "company": 8,
  "sponsorship": 5,
  "language": 1,
  "response": 1,
  "work_mode": "onsite",
  "reason": "Junior Java backend role at a large Dubai bank that sponsors visas; asks for 1-3 years and Spring Boot; Arabic is a plus.",
  "legitimacy_note": "Posted by the bank's own careers team; the role also appears on its website."
}
```

## Legitimacy and company check

- Use what you already know about well-known companies without searching.
- For unknown companies, one or two web searches at most: does the company exist, does it have a real website, is the role plausible for it.
- Warning signs: no company name, free email addresses for applications, payment requests, pay far above the market for a junior role, vague duties, the same text posted by many unrelated agencies.
- A company that appears several times in this run only needs to be checked once.

## Rules

- Do not change anything except through `node scripts/jobs.mjs`.
- Do not start research, write documents, or contact anyone. That happens in later steps.
- If a description is missing, judge from the title and company, and say so in `reason`.
