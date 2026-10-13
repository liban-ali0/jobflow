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
5. Write one base CV per role in the settings' `roles`: `candidate/base-cv-<role key>.md`. Skip every role listed in the settings' `cvLocked`: the user edited that CV by hand, so leave the file exactly as it is and mention it in the report.
6. Turn gaps into questions for the user (see "Asking the user").
7. Report what was written, the questions asked, and the gaps left.

## Asking the user

Questions are the one place the candidate deals with gaps, so ask about every gap they can help with, in two categories:

- `"category": "you"`: facts about the candidate that are not about the CV itself, such as work permit status, notice period, or start date.
- `"category": "cv"`: gaps and problems in the CV, phrased so the answer fixes them:
  - Missing content: "Your CV has no projects. Describe one or two you built: what it was, your part, the tools." or "Do you have a portfolio or GitHub link to add?" (open answers).
  - Unclear facts: "Your CV gives no end date for the Vodobox internship. When did it end?"
  - Fixes Offerbound can apply itself, as yes/no: "Your CV spells 'Univeristy'. Use 'University' in the CVs Offerbound makes?" with options `["Yes, fix it", "No, keep it"]`.
  - A role in the settings with little supporting material: "Your CV shows little for the AI role. Any courses, projects, or work with AI tools to add?"

For each question:

- First check `node scripts/jobs.mjs questions` and `candidate/facts.md`. Do not ask anything already answered, dismissed, or still open.
- Write the question to `jobs/_work/profile-q-<n>.json` and run `node scripts/jobs.mjs ask --file jobs/_work/profile-q-<n>.json`. Fields: `text` (one clear question), `why` (one sentence on what the answer changes), and `options` when a few fixed answers cover it (for example `["Yes", "No, the employer needs to apply"]`). Leave `options` out for open answers. The file can stay; it is overwritten next time.
- Ask at most 8 questions per run, the ones that change the CVs most first.
- Every gap still goes in the profile's "Gaps" list too, as the record of what is missing.
- When rebuilding, apply the answers in `candidate/facts.md`: add the described projects, links, and dates, and apply the fixes the candidate agreed to (for example, correct the typo in the CVs Offerbound writes, never in the original PDF).

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

Each base CV follows the format in `templates/CV-FORMAT.md` exactly (the app's CV templates and PDF export depend on it) and is one page when rendered, so automated CV readers parse it correctly.

Each base CV leads with the experience, projects, skills, and certificates most relevant to its role, using the role's label and keywords from the settings to judge relevance.

The files contain the same facts in a different order and emphasis. If the profile has little material for one track, keep that CV honest and short, and list the weakness under "Gaps" in the profile.

## Gaps

Check for and report: missing GitHub or portfolio link, missing graduation date or grade, internships without dates, projects without a description of the candidate's own contribution, no phone number or email, and any target role with fewer than two supporting items.
