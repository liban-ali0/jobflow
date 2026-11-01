---
name: follow-up
description: Write one short, polite follow-up email for a job the candidate applied to and has not heard back from. Argument - the job id.
---

# Write a follow-up email

The job id is: `$ARGUMENTS`

The candidate applied some days ago and has had no reply. At most two follow-ups are sent per job, so each must be short, specific, and easy to answer.

Count the `follow-up sent` events in the job's history. None: write the first follow-up. One: write the second and last one: shorter (40 to 70 words), it refers to the earlier message without repeating it, adds nothing pushy, and leaves the door open ("if the role has been filled, a short note would help me too"). Two or more: do not write a third; say so in the report and stop.

## Steps

1. Read the job with `node scripts/jobs.mjs get <id>`: the applied date, contacts, documents, notes, and history.
2. Get the folder with `node scripts/jobs.mjs folder <id>`, then read `<folder>/research.md`, `<folder>/email.md` (the first outreach, if any), and `<folder>/cover-letter.md`.
3. Read `candidate/profile.md` and `candidate/facts.md` for anything new since applying (for example a new answer or skill).
4. Write `<folder>/follow-up.md` (replacing an earlier one that was already sent) and register it with `node scripts/jobs.mjs document <id> follow_up <folder>/follow-up.md`.
5. End with two lines: who it goes to and the one new point it makes.

## The email

```markdown
To: Name (role), followed by <email> only when a confirmed email exists
Subject: Following up: <role title> application

The email itself, with no label in front of it.
```

Everything after the Subject line is sent as written, so no notes or labels there.

- 60 to 110 words, in the listing's language.
- Address the same person as the first outreach email; if none was found, write it for the company's hiring or careers contact from the research, or as a LinkedIn message, and say so in one line at the top.
- Mention the role and when the candidate applied (the applied date in the job), restate interest in one sentence, and add one new, specific point: a relevant result from the profile not stressed before, or something recent about the company from the research.
- Ask one easy question, such as whether the role is still open or what the next step would be.
- Polite and confident. No apologies for following up, no pressure, no repeated pitch.

## Rules

- Every claim about the candidate comes from `candidate/profile.md`, `candidate/facts.md`, or the job's notes.
- Never invent an email address. Nothing is sent: the candidate reviews and sends it.
- Change job data only through `node scripts/jobs.mjs`.
