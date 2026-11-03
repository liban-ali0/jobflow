---
name: tailor-job
description: Write the application documents for one researched job - tailored CV, cover letter, outreach email, and form answers - from the candidate's profile and the job's research. Once written, redoes only documents marked "changes requested" (and missing ones). Argument - the job id.
---

# Tailor the application for one job

The job id is: `$ARGUMENTS`

These documents go to a real employer under the candidate's name. They must be true, specific to this job, and ready to send after the candidate's review.

## Steps

1. Read the job with `node scripts/jobs.mjs get <id>` (it lists existing documents and their review state) and the settings with `node scripts/jobs.mjs settings`. Read the job's notes: answers to questions about this job are there.
2. Get the folder with `node scripts/jobs.mjs folder <id>` and read `<folder>/research.md` and `<folder>/report.json` (the requirements with their match and evidence, the gaps and how to answer them, and `cv_changes`). If there is no research, stop and report: "Run Research for this job first."
3. Read `candidate/profile.md`, `candidate/facts.md`, the base CV for the job's role, `candidate/base-cv-<role>.md` (if missing, use the closest base CV), and the format rules in `templates/CV-FORMAT.md`.
4. Decide what to write:
   - No documents yet: write all four.
   - Some documents exist: rewrite only those whose review is `changes_requested`, following their `review_note` exactly, and any that are missing. Leave approved and draft documents untouched; the candidate may have edited them by hand.
5. Write the files in the job folder, and register each one:
   - `cv.md`, then `node scripts/jobs.mjs document <id> cv <folder>/cv.md`
   - `cover-letter.md`, then `node scripts/jobs.mjs document <id> cover_letter <folder>/cover-letter.md`
   - `email.md`, then `node scripts/jobs.mjs document <id> email <folder>/email.md`
   - `answers.md`, then `node scripts/jobs.mjs document <id> answers <folder>/answers.md`
6. Check the facts: run `node scripts/jobs.mjs factcheck <id>`. It lists every number, tool, employer, education, certificate or role size in the CV, cover letter and email that `profile.md`, `facts.md` and the base CVs do not back, with the sentence it is in, and any phrase the user ruled out (`forbidden`). For each one that is about the candidate's past, reword it to what the sources say or remove it; never make the sources fit. A number that is not about the candidate (a request such as "ten minutes for a call", a plan) can stay. A claim marked "worth a look" (a reframed title, how widely something was used) stays when it is true; say so in the report. Remove every forbidden phrase. Run it once more after fixing; mention anything still listed, and why it is fine, in the report.
7. End with a short report: what each document emphasises, anything left out on purpose, and gaps the candidate should know about.

## Tailored CV (`cv.md`)

Start from the base CV for the role and adapt it to this job, following `templates/CV-FORMAT.md` exactly.

- **Headline and summary**: aimed at this job's title and the requirements in the research. Name the role type, the strongest matching skills, and the level, truthfully.
- **Order and emphasis**: put the experience bullets that match the job's real requirements first within each role; drop or shorten bullets that do not help this job. Keep every role in the profile with its true title, dates, and employment type.
- **Keywords**: use the listing's exact words (from "ATS keywords" in the research) wherever the profile truly supports them, for example "REST APIs" if the listing says so and the profile shows API work, and cover every `(must)` keyword the profile supports. The app shows the candidate an ATS score for the CV (keywords matched plus format checks), but never add a keyword the profile does not support just to raise it.
- **Skills**: reorder so the job's skills come first; leave out skills irrelevant to this job if space is short.
- **Length**: one page. Cut the least relevant content first.
- **Language**: the listing's language. If the listing is in Arabic, write the CV in Arabic; otherwise English.

## Cover letter (`cover-letter.md`)

Follow the cover letter format in `templates/CV-FORMAT.md`.

- Address the named person from the research if there is one, otherwise the team ("Dear Hiring Team").
- First paragraph: the role, and one specific reason this company (from the research, not a generic compliment).
- Middle: two or three of the strongest matches between the job's requirements and the profile, each with concrete evidence from the profile (what was built, the result, the tools).
- If something the job wants is missing, do not claim it; where the profile shows something close or a quick learning record, say that briefly.
- Practical line when it matters: location or relocation and availability, from `facts.md`. Mention needing visa sponsorship only when the job's country needs it for this candidate (its `sponsorship` in the settings' `countries` is not `false`); never mention visas for a country where the candidate can already work.
- Close with a clear, polite next step. 250 to 400 words, in the listing's language.

## Outreach email (`email.md`)

A short message to the person found in the research, sent after applying.

```markdown
To: Name (role), followed by <email> only when a confirmed email exists
LinkedIn: profile URL if known
Subject: one line naming the role

The email itself, with no label in front of it, ending with the candidate's name and contact line.
```

The body is 80 to 150 words: who the candidate is, that they applied for the role, one specific thing about the person's team or work from the research, the strongest single match, and a short request (a brief call or a look at the application). No attachments mentioned beyond the CV. Everything after the Subject line is sent as written, so no notes or labels there.

If no person was found, address it to the company's hiring or careers contact from the research, or write it for a LinkedIn message (under 300 characters for a connection note, plus the longer version) and say so at the top.

## Form answers (`answers.md`)

Ready-to-paste answers for common application questions, each as `## Question` followed by the answer:

- Expected salary: from the job's salary estimate and research, as one figure or a narrow range with the currency and period, and a one-line justification for the candidate (not for the form).
- Notice period and earliest start date: from `facts.md`. If unknown, write "Not known yet" and ask (see below).
- Visa and work permit status: from `facts.md` and the country's `sponsorship` setting, stated plainly (for example, "Needs employer sponsorship", or "Already allowed to work in Turkey").
- Willing to relocate: from `facts.md` and the settings.
- Why this company (80 to 120 words) and why this role (80 to 120 words): specific, from the research.
- Years of relevant experience: a number with a short basis, from the profile.

## Questions

If a document needs a fact that the profile, `facts.md`, and the job's notes do not give (for example, the notice period), check `node scripts/jobs.mjs questions` for it first; if it was not asked, write `jobs/_work/<id>-tailor-q-<n>.json` with `text`, `why`, and a `category`: `"you"` (no `job_id`) for facts like the notice period, `"cv"` (no `job_id`) for the candidate's background, or `"job"` with this `job_id` only for things that matter to this job alone and run `node scripts/jobs.mjs ask --file jobs/_work/<id>-tailor-q-<n>.json`. At most two questions. Write the documents anyway, with the cautious wording, and mention the open question in the report.

## Rules

- Every claim about the candidate must be backed by `candidate/profile.md`, `candidate/facts.md`, or the job's notes. Never invent experience, skills, tools, numbers, dates, or results, and never stretch a part-time role into full-time or an internship into a job.
- Keep numbers exactly as the profile states them.
- No placeholders may remain (`[Company]`, `XX`, `TBD`).
- Nothing is sent or submitted. The candidate reviews every document in the app first.
- Change job data only through `node scripts/jobs.mjs`.
