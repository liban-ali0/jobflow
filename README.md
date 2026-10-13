# Jobflow

Finds fresh job postings, ranks them against your CV, and tracks your applications. The AI work is done by Claude Code on your own computer with your own Claude subscription; a local web app is where you control it. Your CV and data never leave your computer except when Claude reads them to do the work.

## What you need

- A Claude subscription (Pro or Max)
- [Node.js](https://nodejs.org) 22.13 or newer
- Claude Code: `npm install -g @anthropic-ai/claude-code`

Works on Windows, macOS, and Linux. Codex (ChatGPT plan) also works as an engine; choose it per step in Settings.

## Install

Get the folder (clone it or unzip it), open a terminal in it, and run:

```
npm run setup
```

This also downloads a browser engine (about 150 MB) that turns your CVs and cover letters into PDF files.

Then, once:

```
claude
```

Sign in with your Claude account if asked, accept the prompt to trust this folder, then type `/exit`. Without this, Claude Code is not allowed to work in the folder.

## Start

```
npm run app
```

Open http://localhost:3000 and follow the **Setup** screen: check Claude Code, upload your CV, add facts the CV does not say, choose countries and roles, and build your profile. Then go to **Today** and press **Find new jobs**.

Stop the app with Ctrl+C in its terminal.

| Screen | Purpose |
|---|---|
| Today | Fresh jobs, ranked, and the ones you picked |
| Questions | Gaps in your CV, facts about you, and questions about single jobs |
| Board | Every job you picked, stage by stage, and the closed ones with the reason |
| Assistant | Chat with Claude about your jobs |
| Profile | Facts about you, extra ranking rules, the profile built from your CV |
| CVs | CV templates, your base CV for each role, and the CVs and cover letters tailored to each job |
| Activity | Every step that has run, by day, with live progress |
| Stats | Replies and interviews by source, country, and role |
| Settings | Countries, roles, sources, schedule, engines, colours |

## Job sources

- **LinkedIn and Workable** are searched automatically, without logging in, country by country in your priority order.
- **Indeed, Bayt, GulfTalent, Naukrigulf, Kariyer.net** block automated access, so they are read in your own browser:
  - With Claude Code: switch them on in Settings → Sources. After **Find new jobs**, Claude in Chrome reads their search pages in your Chrome (install the Claude in Chrome extension and allow it on those sites).
  - With any engine: the **Jobflow extension** (below). On any job site press **Send this page to Jobflow**.

## The Jobflow extension (Chrome, Edge, Firefox)

Settings → Sources shows the steps for the browser you are using, with buttons to copy each address:

- **Chrome or Edge:** open `chrome://extensions` (or `edge://extensions`), switch on Developer mode, press **Load unpacked**, and choose the `extension` folder.
- **Firefox:** open `about:debugging#/runtime/this-firefox`, press **Load Temporary Add-on…**, and choose `manifest.json` in the `extension` folder. Firefox removes it when it closes, so repeat this after a restart.

Then press **Connect** in Settings → Sources. Nothing to paste.

## Applying

When every document of a job is approved, its page shows **Apply**. Jobflow never submits for you:

- **Open and fill the form** (the extension, any engine): opens the job's form, fills every step, and attaches the CV and cover letter. What it cannot fill is marked yellow on the form and listed on a Jobflow bar, and the job shows **Waiting for you** with the reasons. You fill the rest and press Submit; when the site confirms it, the job is marked applied, a copy of what was sent is kept in its folder, and the bar offers to save your typed answers for the next forms. On the Board, **Apply to all** goes through every ready job one by one. LinkedIn is never automated.
- **Fill with Claude** (Claude Code): Claude in Chrome fills unusual forms and stops before Submit.
- **Email draft**: when research found a confirmed email address, an `.eml` draft with both PDFs opens in your mail app.

After applying, record replies and interviews on the job page. An interview gets an interview pack: likely questions with answers from your real experience, gaps, and questions to ask.

## Schedule

Settings → Schedule checks for fresh postings every few minutes during the hours you choose and ranks new ones at once (the fast track), and runs a full search once a day. It works while the app is running.

## Your data

`candidate/` (CV and profile), `jobs/` (one folder per job), and `data/` (the database) are private: they are never part of the shared project. To move to another computer, copy those three folders along with the project.

## Updating

Replace the project files with the new version (or `git pull`), keep your `candidate/`, `jobs/`, and `data/` folders, and run `npm run setup` again.
