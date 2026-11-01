---
name: improve-cv
description: Improve one CV's ATS score by applying the fix list the app wrote, using only true facts from the candidate's profile. Argument - "doc:<document id>" for a job's tailored CV or "base:<role key>" for a base CV.
---

# Improve a CV for ATS

The target is: `$ARGUMENTS`

The app checked this CV with its ATS scorer and wrote what to fix in `jobs/_work/ats-<target>.json`, where `<target>` is the argument with `:` replaced by `-` (for example `jobs/_work/ats-doc-12.json` or `jobs/_work/ats-base-software.json`). It contains:

- `file`: the CV to edit (a path under `jobs/` or `candidate/`).
- `jobId`: the job, for a tailored CV (absent for a base CV).
- `missingKeywords`: keywords the CV lacks, each with `term` and `must` (required by the listing).
- `fixes`: the other points lost, each with `label` and `detail` (numbers in bullets, action verbs, writing, sections, layout).
- `requirements`: the listing's requirements the CV does not show yet (`missing`) or only partly (`partial`), with `required` and the checker's `detail` (for example "0 years in roles naming python, 3 asked").

## Steps

1. Read the JSON file, then the CV in `file`, `candidate/profile.md`, and `candidate/facts.md`. For a tailored CV, also read the job's notes with `node scripts/jobs.mjs get <jobId>`, and `research.md` in the job's folder (`node scripts/jobs.mjs folder <jobId>`).
2. Edit the CV in place, following `templates/CV-FORMAT.md` exactly.
3. For a tailored CV, register it again with `node scripts/jobs.mjs document <jobId> cv <file>`. This puts it back to waiting for the candidate's review. Then run `node scripts/jobs.mjs factcheck <jobId>` and reword or remove anything it lists in the CV that the profile and facts do not back.
4. Report in a few lines: the keywords added and where, the keywords left out because the profile does not support them, and the other changes.

## How to fix

- **Missing keywords**: add a keyword only when the profile, `facts.md`, or the job's notes show the candidate has that skill or did that work. Put it where the evidence is: in the relevant job's bullet, the summary, or the Skills section, using the listing's exact words. Required (`must`) keywords first. Never add a keyword without evidence, even a required one; list it as left out instead.
- **Requirements**: for each one the profile supports, make the CV show it in the listing's words: the years in the summary or the role ("3 years building Java back ends"), the degree with its field as written in the profile, the skill in the bullet where it was used, a language with its level. Required ones first. If the profile does not support it, leave it and list it as not shown.
- **Numbers in bullets**: surface figures that are already in the profile (users, transactions, percentages, time saved, team size). Never invent or estimate a number.
- **Action verbs**: start bullets with a strong verb (Built, Led, Reduced, Automated, Integrated, Designed) without changing what the bullet says.
- **Sections and layout**: rename or add sections the fix list names, using the standard names (Summary, Experience, Education, Skills).
- Keep every role's true title, employer, dates, and employment type. Keep it to one page: if adding something pushes it over, shorten the least relevant bullets.
- Do not touch a GPA or honours the candidate has chosen to leave out.

## Rules

- Every change must be backed by `candidate/profile.md`, `candidate/facts.md`, or the job's notes. When in doubt, leave it out and say so.
- Edit only the file named in `file`. Change job data only through `node scripts/jobs.mjs`.
