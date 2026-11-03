---
name: compare-offers
description: Compare the candidate's job offers (and interviews still running) side by side against what matters to them, with negotiation points and questions to ask about each contract. Writes jobs/_offers/comparison.md. No argument.
---

# Compare offers

The candidate has at least one offer. Help them decide and negotiate, with their own numbers. This is a comparison, not legal, tax or financial advice: say so once, and point them to the employer's HR or a professional for anything binding.

## Steps

1. Run `node scripts/jobs.mjs offers`: every job with an offer (and the ones at the interview stage), with the terms the candidate entered, the market range from the research, and each job's folder.
2. For each, read `report.json` and `research.md` in its folder (pay, level, gaps, legitimacy), and any `debrief*.md` (what the interviewers said).
3. Read `candidate/profile.md` and `candidate/facts.md` for what the candidate wants (location, visa, priorities, salary floor). If what matters most to them is not written anywhere, ask once with `node scripts/jobs.mjs ask --file jobs/_work/offers-question.json` (`text`, `why`, `category: "you"`, `options` such as pay, growth, stability, location, visa sponsorship), and compare on the usual factors meanwhile.
4. Write `jobs/_offers/comparison.md` as below.
5. End with two lines: which offer leads and why, and the one thing to ask or negotiate first.

## comparison.md

```markdown
# Your offers, <date>

## In short
Two or three lines: which leads for this candidate and why, and what would change that.

## Side by side
| | <Company A> | <Company B> |
|---|---|---|
| Role and level | | |
| Base pay | as entered, with currency and period | |
| Yearly cash | base × 12 + allowances + bonus, as entered | |
| Against the market | below / within / above the researched range | |
| Benefits | | |
| Location and work mode | | |
| Visa and relocation | | |
| Contract and probation | | |
| Start and deadline | | |
| Growth | from the research and debriefs | |
| Risks | from the report's legitimacy and the debriefs' warning signs | |

Different currencies stay in their own currency: never convert. Leave a cell as "Not given" when the candidate did not enter it.

## Negotiation points
For each offer: what is reasonable to ask for (within the researched market range, with the range and its source), the strongest true reasons from the profile, and a short polite message the candidate could adapt. Never suggest claiming another offer that does not exist.

## Questions to ask before signing
For each offer: what the contract or the offer leaves unclear, for example the notice period, end-of-service terms, housing or transport allowance, visa costs, working hours, probation terms, non-compete. These are questions for the employer, not legal conclusions.

## If you are still interviewing
How the open interviews compare with the offers, and whether it is worth asking for more time on a deadline.
```

## Rules

- The candidate's numbers are theirs: never change them, convert currencies or estimate tax.
- Facts about companies come from the research files; about the candidate, only from the profile and facts.
- Nothing is sent and no status is changed.
