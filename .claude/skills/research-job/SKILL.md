---
name: research-job
description: Deep research for one selected job - company brief, job analysis against the candidate's profile, people to contact from public sources, and a market salary estimate, written to research.md in the job's folder, plus the job report (verdict, weighted requirement match, gaps, level, pay, legitimacy) saved with jobs.mjs report. Argument - the job id.
---

# Research one job

The candidate picked this job for a full application. This research feeds the tailored CV, the cover letter, the outreach email, and the form answers, so it must be specific and true. Spend real effort here, but stay focused: about 10 to 15 web searches and page reads in total.

The job id is: `$ARGUMENTS`

## Steps

1. Read the job with `node scripts/jobs.mjs get <id>`, and the settings with `node scripts/jobs.mjs settings`. If the job's notes contain answers to earlier questions, use them.
2. Get the job's folder with `node scripts/jobs.mjs folder <id>`. The research goes in that folder; small JSON inputs for `jobs.mjs` go in `jobs/_work/` (overwrite them freely, nothing needs deleting).
3. Read `candidate/profile.md` and `candidate/facts.md`.
4. Research the points switched on in the settings' `research.points` (company, job, people, salary, sponsorship), plus every item in `research.extraPoints`, as described below. Skip a point that is switched off, and leave its section out of `research.md`. Follow `research.rules`: they are the user's own rules and win over this file when the two disagree.
5. Write `<folder>/research.md` using the structure below, and register it with `node scripts/jobs.mjs document <id> research <folder>/research.md`.
6. Write the job report (see "The job report") to `<folder>/report-input.json` and save it with `node scripts/jobs.mjs report <id> --file <folder>/report-input.json`. If it answers "The report was not saved", fix what it lists and run it again until it is saved.
7. Save each person found with `node scripts/jobs.mjs contact <id> --file jobs/_work/<id>-contact-<n>.json` (fields: `name`, `role`, `email`, `email_verified` as 1 or 0, `linkedin`, `notes`).
8. Save the salary estimate with `node scripts/jobs.mjs update <id> --file jobs/_work/<id>-update.json` containing `{"salary_estimate": "..."}`, a short line such as "AED 9,000 to 12,000 a month (mid-range for junior backend roles in Dubai)".
9. Ask about gaps that only the candidate can answer (see "Questions").
10. Set the status with `node scripts/jobs.mjs status <id> researched`. Exception: if the listing is closed (for example "no longer accepting applications") or the research shows it is very likely not genuine, set `node scripts/jobs.mjs status <id> excluded <short reason>` instead (for a closed listing, first run `node scripts/jobs.mjs update <id> --file jobs/_work/<id>-closed.json` with `{"listing_state": "closed", "listing_reason": "<what the page says>"}`, so the app does not check it again), so no documents are written for it, and explain why in the report.
11. End with a short report: the verdict and match figure from the saved report, two or three lines on the company, the biggest strengths and gaps, the people found, the salary estimate, and any questions asked.

## Company brief

What they do, main products or clients, size, ownership or funding, where they operate, tech stack or tools if relevant to the role, recent news from the last 12 months, and anything about culture or hiring (for example, whether they sponsor visas, hire internationally, or are growing the team). Prefer the company's own website, its careers page, reputable news, and public company registers. If the company is a recruitment agency posting for an unnamed client, say so and research what can be inferred about the client.

## Job analysis

- **Real requirements**: what the listing truly needs versus what is nice to have. Note the level and years asked.
- **ATS keywords**: the skills, tools, qualifications, and job-title terms an automated CV reader (ATS) will look for, as written in the listing and in its language. One per line as a bullet, short (one to three words, for example `- Spring Boot`), most important first, with `(must)` after the ones the listing requires (for example `- Java (must)`). Leave out years of experience and degrees; the fit table covers them. The app scores every CV against this list, so keep it to 15 to 40 real keywords.
- **What the team probably does**: day-to-day work, products, and stack, inferred from the listing and the company research.
- **Fit against the profile**: goes in the job report's requirements (below), not in `research.md`. Be honest: it decides what the documents emphasise.
- **Angle**: two or three specific reasons this candidate fits this job, which the cover letter and email can build on.

## The job report

The app shows this as the job's report: a verdict, how each requirement matches (the app weighs them into a match figure), the gaps, the level, the pay and whether the posting looks real. It is checked when saved, so follow these rules exactly. All text in the user's language; quotes in the listing's language.

Fill the requirements in two passes, in this order:

1. **From the listing alone**, before looking at the profile again: each significant requirement (12 at most; keep every critical and high one even past 12), its `importance` and its `basis`.
   - `importance`: `critical` (an explicit must-have, the title or core duty, a required language or work permit), `high` (central, likely tested in interviews), `meaningful` (real, not decisive), `preferred` (nice to have). It measures how much the requirement matters in this listing, never how well the candidate meets it.
   - `basis`: `stated` (the listing marks it required, or it is in the title: put the listing's exact words in `quote`), `structural` (no must-have wording, but where it sits in the listing or how often it repeats shows its weight), `inferred` (your judgment of how such roles are screened). An `inferred` requirement can never be `critical` or `high`; the app lowers it if you try.
   - Include requirements the candidate meets, not only the gaps.
2. **Then against the profile** (`profile.md`, `facts.md`, the job's notes): `match` is `strong` (shown, with the line that shows it in `evidence`), `partial` (something close, say what), `missing`, or `na` (not a skill: for example a work permit the candidate already has). Never change an importance in this pass.

Every `critical` or `high` requirement that is `missing` or `partial` needs an entry in `gaps` with the same `requirement` text, a specific `risk` (how it will come up) and a `mitigation` (the truthful answer: related experience, a project, how fast it can be learned). `blocker` is true only when the listing makes it a hard condition.

`verdict.call` is `apply`, `consider`, `research_first` (something must be checked before spending effort: say what) or `skip`, with one sentence in `reason` drawn from the report. `legitimacy.tier` is `high`, `caution` or `suspicious`, with the signals behind it (`positive`, `neutral` or `concerning`). Present observations, not accusations, and never call a posting suspicious without evidence; a missing date alone is `caution`. The app adds what it knows itself (posting age, whether the listing is open, reposts, earlier applications to this company, fee wording), so do not repeat those.

```json
{
  "verdict": { "call": "apply", "reason": "Meets every must-have except Kafka, and the team is hiring internationally." },
  "summary": "Three to five lines: the company, the job, the main strengths and gaps.",
  "role": { "level": "Junior (1-3 years)", "function": "Build and run backend services", "work_mode": "Hybrid, Dubai", "team": "Payments, about 8 engineers" },
  "requirements": [
    { "requirement": "Java", "importance": "critical", "basis": "stated", "quote": "Strong Java skills are a must", "match": "strong", "evidence": "Two years of Java at Acme (profile, Experience)" },
    { "requirement": "Kafka", "importance": "meaningful", "basis": "inferred", "quote": null, "match": "missing", "evidence": null }
  ],
  "gaps": [ { "requirement": "Docker", "blocker": false, "risk": "Likely asked how services were deployed", "mitigation": "Point to the containerised final-year project and say what was learned" } ],
  "level": { "asked": "2-4 years", "yours": "Junior, close to the lower end", "pitch": "How to present the experience at the level asked, truthfully", "if_lower": "What to ask for if they offer a more junior title" },
  "pay": { "range": "AED 9,000 to 12,000 a month", "ask": "AED 11,000 a month", "basis": "Bayt and Glassdoor ranges for junior backend roles in Dubai", "reliability": "medium" },
  "legitimacy": { "tier": "high", "signals": [ { "signal": "Specific stack and team", "finding": "Names the tools, team size and first-year goals", "weight": "positive" } ] },
  "cv_changes": [ { "section": "Summary", "change": "Lead with payments backend work", "why": "The team is Payments" } ],
  "questions": [ "How is success measured in the first six months?" ]
}
```

Leave `level`, `pay` or a `role` field empty (`""`) when nothing is known, and leave out `pay` text when the salary point is switched off. `cv_changes`: up to five changes the documents should make, from the profile only. `questions`: up to four questions for the candidate to ask the employer, the ones this research leaves open.

## People

Find up to three people who could read an application: the hiring manager, the team lead, or the recruiter, using public sources only (the listing, the company website, public LinkedIn profile pages found through web search, news). Never log in anywhere.

- Record an email only when it is published on a public page, and give the page in `notes`; then `email_verified` is 1.
- Never guess or construct an email address from a name pattern. If none is published, leave `email` empty and include the LinkedIn profile URL if one was found.
- Skip people when the match to this team or role is doubtful, rather than listing someone unrelated.

## Visa sponsorship

Only when the `sponsorship` point is on and the job's country needs sponsorship for this candidate (in the settings' `countries`, the country's `sponsorship` is not `false`). Check whether the employer sponsors work visas or hires internationally: the listing, the careers page, and public reports. Say what was found and how sure it is. When the country is marked as not needing sponsorship, do not research it and do not raise it as a gap.

## Extra points

One short section per item in `research.extraPoints`, named after it, answering it for this company and job from public sources. If it cannot be answered, say so.

## Salary

Estimate the market range for this role, level, and city from public salary data (for example Glassdoor, Bayt salary pages, PayScale, Levels.fyi, or published salary guides), or the listing itself if it states pay. Give the currency and period, and say what the estimate is based on. This is used for "expected salary" questions, so suggest the figure to ask for within the range.

## Questions

When a requirement matters for this job and neither the profile, `facts.md`, nor the job's notes say whether the candidate has it, ask the candidate. At most three questions per job, the ones that change the documents most.

- Check `node scripts/jobs.mjs questions` first, so nothing already asked is asked again.
- Write the question to `jobs/_work/<id>-question-<n>.json` with `text`, `why`, `job_id` (this job), and `options` when a few fixed answers fit, then run `node scripts/jobs.mjs ask --file jobs/_work/<id>-question-<n>.json`.
- Example: `{"text": "This job asks for Docker. Have you used it, and where?", "why": "If so, the tailored CV can mention it under the right role.", "job_id": 67, "category": "job"}`.
- Questions about the candidate's own background (tools used in a past role, how a result was measured, cloud or AI experience) help every future job, so ask them with `"category": "cv"` and no `job_id`: the answer then goes into `candidate/facts.md`. Use `"category": "job"` with the `job_id` only for things that matter to this job alone (for example, whether the candidate would accept its location or shift pattern).
- Do not wait for answers. Tailoring uses whatever is known, and answers improve later rebuilds.

## Structure of research.md

```markdown
# Research: <job title> at <company>

## Summary
(three to five lines: what the company is, why this job, the main strengths and gaps)

## Company
## The job
### Real requirements
### ATS keywords
### What the team probably does
## Angle for the application
## Visa sponsorship
## <one section per extra point>
## People
## Salary
## Sources
(every page used, as links)
```

Leave out the sections of points that are switched off.

## Rules

- Every fact about the company or people comes from a source listed under "Sources". If something could not be confirmed, say so.
- Facts about the candidate come only from `candidate/profile.md`, `candidate/facts.md`, and the job's notes. Never invent experience or skills.
- Do not write the CV, cover letter, or email. That is the next step.
- Change job data only through `node scripts/jobs.mjs`.
