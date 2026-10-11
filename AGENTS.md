# Job application workflow

The web app in `web/` shows the data and starts the steps. Each step runs on Claude Code or Codex, chosen per step in the app's Settings. The full plan is in `PLAN.md`.

## Rules

- All job data goes through `node scripts/jobs.mjs` (run it with `help` for the commands). Never edit `data/jobflow.db` directly.
- Run project commands exactly as `node scripts/jobs.mjs <command> ...`, from the project folder you already start in. Do not add `cd`, pipes (`|`), redirects, or `&&`: background runs only allow the plain command and refuse anything else. Read long output in full instead of trimming it with `head`.
- JSON input for that script is passed with `--file <path>` using a file written inside the job's folder, `jobs/_work/`, or `candidate/`.
- Files for one job live in its folder. Get the folder with `node scripts/jobs.mjs folder <id>`.
- Documents are written only from facts in `candidate/profile.md`. Never invent experience, skills, dates, or results.
- Nothing is submitted or sent to an employer without the user's approval.
- Keep everything portable: relative paths, Node scripts only, no system-specific commands.

## Layout

| Path | Content |
|---|---|
| `.claude/skills/` | One instruction file per workflow step, used by both engines |
| `web/` | Web app (Next.js). Read `web/AGENTS.md` before changing it. |
| `web/src/core/db.mjs` | Data layer shared by the app and `scripts/jobs.mjs` |
| `web/src/core/score.mjs` | Score formula used by the ranking step |
| `scripts/collect.mjs` | LinkedIn collector, runs without an AI engine |
| `config/defaults.json` | Default settings. Changes made in the app are stored in the database. |
| `candidate/`, `jobs/`, `data/` | Private data, excluded from version control |
