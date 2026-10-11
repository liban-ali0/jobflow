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
| Questions | Things Claude needs you to answer |
| Board | Every application by status |
| Assistant | Chat with Claude about your jobs |
| Profile | Facts about you, extra ranking rules, the profile built from your CV |
| Activity | Every step that has run, with live progress |
| Settings | Countries, roles, freshness, engines, colours |

## Job sources

Only LinkedIn's public job feed is searched automatically, without logging in. Other job sites block automated access.

## Your data

`candidate/` (CV and profile), `jobs/` (one folder per job), and `data/` (the database) are private: they are never part of the shared project. To move to another computer, copy those three folders along with the project.

## Updating

Replace the project files with the new version (or `git pull`), keep your `candidate/`, `jobs/`, and `data/` folders, and run `npm run setup` again.
