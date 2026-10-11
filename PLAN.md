# Job Application Workflow: Plan

Status (2026-10-11): phases 1 and 2 are built (LinkedIn only; email-alert sources still to do). Sharing is built: anyone can install their own copy and set it up from the Setup screen. Phase 3 is next.

## 1. Candidate profile

Each user's own details live in `candidate/` (CV, `facts.md`, the generated `profile.md`), which is private and never shared. Jobflow works for any field and any level, from internships to executive roles; each user sets their levels, roles, and countries, and ranking judges every job against their own profile.

## 2. Targeting rules

Set per user on the Setup and Settings screens and stored in their own database. The shipped defaults (`config/defaults.json`) have no countries or roles, so each new user chooses their own.

| Rule | Setting |
|---|---|
| Countries | Any number, in priority order, with preferred cities |
| Roles | Any number, each with a label, priority, and search keywords in any language |
| Freshness | Maximum posting age, and a shorter high-priority window |
| Experience | Levels to search (internship to executive), most years a listing may ask for (or no limit), title words to skip |

Hard exclusions (switches in Settings): nationals-only listings, listings requiring a residence or work permit the candidate lacks, pay-to-apply listings. Always excluded: too much experience required, duplicates, suspected fake listings.

## 3. Pipeline overview

```
Collect -> Filter -> Quick check and rank -> Select top N -> Deep research
        -> Tailor documents -> Review -> Apply -> Outreach email -> Track -> Follow up
```

Two tracks run through the same pipeline:

| Track | Trigger | Handling |
|---|---|---|
| Fast | Posted under 1 hour ago and passes filters | Light tailoring, apply quickly, researched outreach email follows afterwards |
| Standard | Posted under 24 hours ago | Ranked in the daily list, full research before applying if selected in the top N |

A third, separate list holds graduate programs, which run on deadlines rather than freshness.

## 4. Stages

### Stage 1: Collect

Sources, as tested on 2026-09-27:

| Source | Access | Method |
|---|---|---|
| LinkedIn | Public job feed answers plain requests, no login | `scripts/collect.mjs`: about 30 list requests plus one per new job, 1.5 s apart |
| Bayt | Blocks Node and headless browsers (Cloudflare) | Job alert emails, to build |
| GulfTalent | Cloudflare challenge | Job alert emails, to build |
| Indeed (Gulf domains) | Blocked page | Job alert emails, to build |
| Naukrigulf | Drops the connection | Job alert emails, to build |
| Company career pages | Not tested | Watchlist of target employers and graduate programs, to build |

Bypassing the blocks (browser disguise, VPN or IP rotation) is ruled out: it defeats the sites' bot protection and risks getting this machine's IP blocked.

First real run: 228 listings, 61 new within 24 hours, 18 more dropped because LinkedIn listed them as Mid-Senior level despite the entry-level filter.

Source quality is measured over time: sources that produce replies and interviews get checked more often, weak ones are dropped.

Schedule: a check every 30 to 60 minutes during working hours for the fast track, plus one full daily run that builds the ranked list.

### Stage 2: Filter

Apply the hard exclusions from section 2 and remove duplicates. Everything that survives is logged in the tracker, including jobs that are never applied to.

### Stage 3: Quick check and rank

Done by the `rank-jobs` skill. Claude judges the listing; `web/src/core/score.mjs` turns the judgement into a score out of 100 so rankings stay consistent (role 25, country 15, freshness 15, entry-level fit 15, legitimacy 10, company 10, sponsorship 5, language 3, response chance 2). Legitimacy below 4 excludes the job.

A short, cheap check per job (a few minutes each, no deep research):

| Criterion | What is checked |
|---|---|
| Role match | Target roles in priority order |
| Country | Target countries in priority order, preferred city first |
| Freshness | Age of the posting |
| Entry-level fit | Requirements compared with the candidate's profile |
| Legitimacy | Real company, working website, consistent listing, no fees, no free email domains for recruiters |
| Company quality | Size, reputation, employee reviews |
| Sponsorship | Visa sponsorship stated or the employer is known to sponsor |
| Language advantage | A language the candidate speaks is required or preferred |
| Response likelihood | Number of applicants if shown, named recruiter, direct application versus third-party agency |

Each job gets a score and a one-line reason.

### Stage 4: Select top N

- Daily cap: 5 jobs to start, configurable in the app.
- The ranked list is shown for approval. Jobs can be swapped in or out before research starts.
- Jobs below the cap stay in the tracker and can be promoted on a slow day.

### Stage 5: Deep research (selected jobs only)

| Research | Content |
|---|---|
| Company brief | What they do, products, customers, size, ownership or funding, tech stack, recent news, culture |
| Job analysis | Real requirements, keywords, what the team probably builds, gaps against the candidate's profile |
| People | Hiring manager, team lead, or recruiter from public sources. Emails only when confirmed, never guessed. |

### Stage 6: Tailor documents

All documents are generated from one master profile built from the candidate's CV. Tailoring reorders and rephrases. It never adds anything that is not true.

| Document | Notes |
|---|---|
| Tailored CV | One page, ATS-friendly layout, based on the matching base version (software, AI, or IT) |
| Cover letter | In the listing's language, built around the company brief and job analysis |
| Outreach email | Short, addressed to a named person, references something specific about their work |
| Form answers | Salary expectation (researched per job from market rates for the role, level, and city), notice period, visa status, relocation |
| Interview pack | The research plus likely questions and prepared answers, expanded when an interview is scheduled |

### Stage 7: Review

Documents for each job are approved before anything is sent. Approval can be loosened later for document types that prove reliable.

### Stage 8: Apply

| Application type | Method |
|---|---|
| Email applications | Automated: email created as a Gmail draft with attachments, sent after approval |
| Simple web forms | Automated through the browser where the site allows it |
| Sites with login, CAPTCHA, or long multi-step forms (Workday, LinkedIn) | Manual: the workflow prepares the documents and all answers, the candidate submits |

Manual is always available as an option for any job. Automated submission on LinkedIn is avoided because it risks the account being restricted.

### Stage 9: Outreach

- Sending is switched off for now. The email text is still written and saved with each job, so it can be sent manually or enabled later.
- When enabled: email to HR, the team lead, or hiring lead, created as a Gmail draft.
- If no confirmed email exists, a LinkedIn message text is prepared for the candidate to send.

### Stage 10: Track and follow up

Tracked per job: company, title, country, source, link, posting time, score, status, documents used, contacts, dates, and notes.

Statuses: found, ranked, selected, researched, applied, email sent, replied, interview, offer, rejected, no response.

Follow-up reminder after 5 to 7 days without a reply, one follow-up per job.

Tracker: a local web app connected to the workflow, built alongside it rather than afterwards.

| Screen | Purpose |
|---|---|
| Daily list | Ranked jobs with scores and reasons, select or swap the top 5 |
| Job page | Listing, research, documents, contacts, status, notes |
| Review | Approve or request changes to CV, cover letter, and email |
| Board | All applications by status, follow-ups due |
| Settings | Targeting rules, daily cap, sources, schedule on or off, email sending on or off |
| Statistics | Replies and interviews by source, country, and role |

Excel export is available from the board.

### Running mode

- On demand: started from the app or by asking Claude Code.
- Scheduled: optional, with an enable and disable switch in settings. Needed for the 1 hour fast track.

## 5. Folder structure

```
job-workflow/
  PLAN.md
  .claude/skills/   one skill per workflow stage
  web/              the web app
  scripts/          Node helper scripts used by the skills
  config/           targeting rules and sources (defaults)
  candidate/        CV, master profile, base CVs          (private)
  jobs/                                                    (private)
    2026-09-27_company_title/
      listing.md
      research.md
      cv.pdf
      cover-letter.pdf
      email.md
      interview-pack.md
  data/             database file and Excel exports        (private)
```

## 6. Build phases

| Phase | Scope | Result |
|---|---|---|
| 1 | Master profile, base CVs, targeting config, app skeleton with database and settings | Candidate material ready, app opens |
| 2 | Collect, filter, quick check, ranking, daily list screen | Daily ranked job list in the app |
| 3 | Deep research and document tailoring, job page and review screen | Complete package per selected job |
| 4 | Board, follow-up reminders, Excel export | End-to-end manual-submit workflow |
| 5 | Schedule switch, fast track | Jobs under 1 hour old are caught |
| 6 | Automated form submission, email sending, statistics | Less manual work, tuning |
| Sharing | Setup screen (engine check, CV upload, facts, targets, profile), editable countries and roles, generic skills and defaults | Friends run their own copy with their own Claude subscription |

The workflow is usable from the end of phase 4.

### Phase 3 plan (agreed 2026-10-11)

| Part | What it does |
|---|---|
| `research-job` skill | Writes `research.md` in the job folder: company brief, job analysis (real requirements, ATS keywords, gaps against the profile), people from public sources (emails only when published, marked confirmed or not, saved with `jobs.mjs contact`), market salary estimate. Asks job-specific questions through Questions. Status becomes `researched`, then tailoring starts automatically. |
| `tailor-job` skill | From the profile and the base CV of the job's role: tailored CV (one page, ATS-safe), cover letter for every job in the listing's language, outreach email to a named person, form answers (salary, notice, visa, relocation, why this company). Never adds anything that is not in the profile. Uses the review note when a document is redone. |
| PDFs | Built in: the chosen template is filled with the document and printed to PDF with Playwright. Setup installs Playwright's Chromium (about 150 MB). |
| CVs page (new) | Templates (three built in: Classic, Modern, Compact; editable with live preview: font, accent colour, margins, section order, spacing; new ones by duplicating or by describing them to the engine, checked against ATS-safe rules; default per user, override per role or job). Base CVs grouped by the roles in Settings. Tailored CVs and cover letters grouped by job with review state. Actions: download PDF, copy text, compare with the base CV, rebuild. |
| Job page review | Read and edit each document, approve or request changes with a note, download, copy the email. All approved moves the job to `ready`. |
| Questions as the single inbox | Grouped: About you, CV gaps, This job. CV gaps that need the user's input (projects, links, missing dates) and fixes Jobflow can apply itself (typos, after a yes) become questions; answers go to `facts.md` and the profile and CVs are rebuilt. The CV improvements list on Profile is retired. |
| Bulk | "Research all selected", and a "Waiting for your review" list. |

Out of scope for phase 3: sending emails, automated form submission (phase 6), the interview pack (when a job reaches interview).

Build order: research skill, tailoring skill, PDF templates and the CVs page, job page review, questions grouping and CV-gap questions, bulk actions. Each part is tested on real selected jobs.

## 7. Decisions made

| Decision | Choice |
|---|---|
| Daily cap | 5 |
| Email sending | Off for now, method kept available |
| Salary expectation | Based on market rates per job |
| Tracker | Local web app built with the workflow |
| Running mode | On demand, plus optional schedule with a switch |

## 8. Implementation options

The web app and database are the same in both options. The difference is what performs the thinking steps (ranking, research, tailoring).

| | Option A: Claude Code as the engine | Option B: Standalone app with the Claude API |
|---|---|---|
| How steps run | Claude Code commands in this project, started by asking or from the app | The app calls the API itself |
| Cost | Covered by the existing Claude subscription | Paid per use through an API key |
| Scheduling | Windows Task Scheduler starts Claude Code in the background | Built into the app |
| Build effort | Lower | Higher |
| Flexibility | Steps are easy to adjust by editing instructions | Changes need code changes |
| Independence | Needs Claude Code installed on the machine | Runs anywhere |

Decision: option A. Claude Code is the engine, and the web app sends it instructions and displays the results.

Update (2026-10-10): Codex is a second engine, signed in with the user's ChatGPT plan (no API key). Settings choose the engine, model, and effort per step. Both engines follow the same instruction file per step (`.claude/skills/<step>/SKILL.md`; Codex receives it as the prompt) and the same rules (`AGENTS.md`, imported by `CLAUDE.md`). Each run records which engine did it. Codex needs `codex` signed in and the folder trusted, or it runs read-only.

Stack:

| Part | Choice |
|---|---|
| Web app | Next.js with TypeScript |
| Database | SQLite, one local file |
| Workflow steps | Claude Code skills, one per stage, stored inside the project |
| CV and cover letter PDFs | HTML templates rendered to PDF |
| Schedule | Built into the app, switched from the settings screen |

### Portability

The workflow must run on any machine with Claude Code (Windows, macOS, Linux).

| Rule | Reason |
|---|---|
| Everything lives in one project folder | Copy or clone the folder and it works |
| Skills are stored in the project's `.claude/skills/` | They travel with the project instead of staying on one machine |
| Helper scripts are written in Node, not PowerShell or Bash | Same behaviour on every system |
| All paths are relative to the project | No drive letters or user folders |
| The schedule runs inside the app, not in Windows Task Scheduler | No per-system setup |
| The app starts Claude Code through its command line in background mode | Works wherever the `claude` command exists |
| Personal data (`candidate/`, `jobs/`, `data/`) is kept out of version control | The project can be shared without sharing anyone's CV or applications |
| One setup command | `npm run setup` installs everything and creates the database |

Requirements on a new machine: Claude Code (logged in) and Node 22 or newer.

## 9. Open decisions

1. Earliest start date for the form answers (asked through Questions).
