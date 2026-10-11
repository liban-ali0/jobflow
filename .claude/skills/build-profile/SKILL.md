---
name: build-profile
description: Build the candidate's master profile and one base CV per target role from the CV in candidate/. Run once at the start and again whenever the CV changes.
---

# Build the candidate profile

Every document the workflow produces is generated from `candidate/profile.md`. Nothing may appear in a CV, cover letter, or email that is not in that profile, so it must be complete and it must be true.

## Steps

1. Find the CV in `candidate/`: the PDF file directly in that folder, whatever its name (older CVs in `candidate/previous/` are ignored). Its file name is never a gap. If there is no CV, stop and report: "Add your CV in the app's Setup screen (or put the PDF in the candidate folder), then run this step again." Do not create a profile from anything else.
2. Read the whole CV.
3. Read the targeting rules with `node scripts/jobs.mjs settings`.
4. Write `candidate/profile.md` using the structure below.
5. Write one base CV per role in the settings' `roles`: `candidate/base-cv-<role key>.md`.
6. Ask the user about gaps they can answer in words (see "Asking the user").
7. Report what was written, the questions asked, and the gaps left.

## Asking the user

Some gaps need the candidate's answer rather than a CV edit: work permit status, notice period, start date, which tools were used in a role, and the like. For each of these:

- First check `node scripts/jobs.mjs questions` and `candidate/facts.md`. Do not ask anything already answered, dismissed, or still open.
- Write the question to `candidate/q-<n>.json` and run `node scripts/jobs.mjs ask --file candidate/q-<n>.json`. Fields: `text` (one clear question), `why` (one sentence on what the answer changes), and `options` when a few fixed answers cover it (for example `["Yes", "No, the employer needs to apply"]`). Leave `options` out for open answers. Delete the file afterwards.
- Ask at most 5 questions per run, the ones that change the most first.
- Gaps that need a CV edit (typos, missing sections) stay in the "Gaps" list only.

Answers arrive in `candidate/facts.md` under "Answers to questions".

## Rules

- Copy facts exactly: names, dates, grades, employers, technologies. Never improve a number or stretch a date.
- Keep the wording of achievements close to the CV. Rephrasing for clarity is fine, adding results that are not stated is not.
- If something is unclear or looks inconsistent in the CV, keep the original and list it under "Gaps" instead of guessing.
- Read `candidate/facts.md` and merge its facts into the profile: employment type per role, level, languages, visa, location, and work preferences. Where it disagrees with the CV, it wins. Items it marks "to confirm" go under "Gaps".
- Label each role with its employment type from `facts.md` (full-time, part-time, internship). Do not call paid roles internships.

## Structure of profile.md

```markdown
# Profile: <full name>

## Contact
## Summary facts        (degree, graduation date, level, languages, visa, work modes)
## Education
## Experience           (one subsection each: employer, dates, role, employment type, what was done, technologies)
## Projects             (one subsection each: what it is, the candidate's part, technologies, link)
## Skills               (grouped in the way that suits the candidate's field)
## Certificates and courses
## Awards and activities
## Links                (GitHub, LinkedIn, portfolio)
## Gaps                 (missing or unclear items the candidate should supply)
```

## Base CVs

Each base CV is one page when rendered, in plain Markdown with a single column and standard headings (Summary, Education, Experience, Projects, Skills, Languages) so automated CV readers parse it correctly.

Each base CV leads with the experience, projects, skills, and certificates most relevant to its role, using the role's label and keywords from the settings to judge relevance.

The files contain the same facts in a different order and emphasis. If the profile has little material for one track, keep that CV honest and short, and list the weakness under "Gaps" in the profile.

## Gaps

Check for and report: missing GitHub or portfolio link, missing graduation date or grade, internships without dates, projects without a description of the candidate's own contribution, no phone number or email, and any target role with fewer than two supporting items.
