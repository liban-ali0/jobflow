---
name: weave-keyword
description: Propose how to work one missing ATS keyword into an existing sentence of a CV, only where the candidate's profile backs it. Writes a proposal; never edits the CV. Argument - the request id.
---

# Work one keyword into the CV

The request id is: `$ARGUMENTS`

Read `jobs/_work/weave-<id>.json`. It has:

- `cv`: the CV as the candidate is editing it right now (Markdown in the format of `templates/CV-FORMAT.md`).
- `keyword`: the keyword to work in, and `must` (true when the listing requires it).
- `jobId`: the job, for a tailored CV (absent for a base CV).
- `confirmed` and `confirmation`: present when the candidate has confirmed they have this skill, with where they used it if they said (it is also saved in `candidate/facts.md` under "Skills I confirmed").

## When the candidate confirmed the skill

The candidate's confirmation is the evidence: always answer `"added"`. Put the keyword where the confirmation places it (the job or project they named), changing that one line. If they named no place, or no existing line fits, add it to the most fitting line of the Skills section (for example `Cloud: AWS, Google Cloud` becomes `Cloud: AWS, Google Cloud, Azure`). Never invent results, numbers, or details beyond what they wrote.

## Steps

1. Read `candidate/profile.md` and `candidate/facts.md`. For a tailored CV, also read the job's notes with `node scripts/jobs.mjs get <jobId>`.
2. Decide whether the profile, facts, or the job's notes show the candidate has this skill or did this work, and in which role or project.
3. Write the proposal to `jobs/_work/weave-<id>-result.json` and stop. Do not edit the CV or any other file.

## The proposal

When there is evidence:

```json
{
  "status": "added",
  "before": "the existing bullet or summary sentence, copied character for character from cv",
  "after": "the same line with the keyword worked in",
  "where": "the role or section, for example IT Specialist / Backend Developer at Ostim Technical University",
  "reason": "one sentence on the evidence, naming the profile or facts line"
}
```

- Change exactly one existing line: the bullet (or summary sentence) where the evidence belongs. Copy `before` exactly from `cv` so the app can find it; do not include the leading "- ".
- Use the keyword as the listing writes it. Keep the line's meaning, facts, and numbers; change as few words as possible, and keep it about the same length.
- Do not create a new bullet, and do not touch other lines.

When there is no evidence, or no line where it fits honestly:

```json
{ "status": "not-supported", "reason": "one sentence: what is missing from the profile, or where it could fit if the candidate confirms it" }
```

## Rules

- Without a confirmation, never claim a skill, tool, or result the profile, facts, or job notes do not show. When in doubt, answer "not-supported"; the candidate can then confirm it.
- Write only `jobs/_work/weave-<id>-result.json`.
