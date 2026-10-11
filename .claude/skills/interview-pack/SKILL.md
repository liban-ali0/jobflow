---
name: interview-pack
description: Prepare the candidate for an interview at one job - a one-file brief with the company and role refresher, the questions likely to come up with prepared answers from the candidate's real experience, the gaps to handle honestly, questions to ask them, and salary notes. Argument - the job id.
---

# Write the interview pack

The job id is: `$ARGUMENTS`

The candidate has an interview for this job. Write the pack they read the evening before and the hour before: practical, specific to this job, and true. Every answer is built only from `candidate/profile.md`, `candidate/facts.md`, and the job's documents. Never invent a project, number, date, or skill.

## Steps

1. Read the job with `node scripts/jobs.mjs get <id>`: notes (the interview details the candidate wrote, such as who and when), contacts, history.
2. Get the folder with `node scripts/jobs.mjs folder <id>` and read `research.md`, `cv.md` (the version they applied with), `cover-letter.md`, and `answers.md` there.
3. Read `candidate/profile.md` and `candidate/facts.md`.
4. Write `<folder>/interview-pack.md` as described below, in the listing's language, and register it with `node scripts/jobs.mjs document <id> interview_pack <folder>/interview-pack.md`.
5. If something the interviewers are likely to ask cannot be answered from the profile and facts (for example the earliest start date or a salary floor), ask it once: check `node scripts/jobs.mjs questions` first, then write `jobs/_work/question.json` (`text`, `why`, `category: "you"`) and run `node scripts/jobs.mjs ask --file jobs/_work/question.json`.
6. End with two lines: the three questions to rehearse first, and anything the candidate must answer in Jobflow before the interview.

## The pack

```markdown
# Interview pack: <role> at <company>

## The interview
Who, when, and format from the notes; "Not recorded" when missing. What this round usually covers for a role like this.

## The company in five lines
What they do, for whom, recent news, how the team fits in. From the research, with the date of anything time-sensitive.

## Why you, in 30 seconds
A spoken pitch (70 to 90 words) linking the candidate's two strongest true results to what the role needs.

## Likely questions and your answers
8 to 12 questions: the role's real requirements, the listing's technical topics, "tell me about yourself", "why us", and behavioural ones. For each: the question, then an answer outline in STAR form (situation, task, action, result) from a real experience in the profile, with its true numbers. Technical questions get the key points to cover, not an essay.

## Gaps to handle honestly
Each requirement the candidate does not fully meet (from the research's gap analysis), with how to answer it truthfully and what related experience to point to.

## Questions to ask them
4 to 6 specific questions that show the research was done (team, first 90 days, how success is measured, the stack, next steps).

## Salary and logistics
The researched market range and the expectation already given in `answers.md`, how to answer if asked again, visa and relocation points, and the notice period from the facts.

## Checklist
The day before and the hour before: documents to have open, links to test, what to wear for the format, a quiet place.
```

## Rules

- Answers are outlines to speak from, not scripts to memorise: short lines, the true numbers, no filler.
- Never claim experience the profile does not show. Where a gap exists, say so in the gaps section and give the honest bridge.
- Keep the whole pack readable in 15 minutes.
