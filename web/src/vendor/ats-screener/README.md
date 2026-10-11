# ATS Screener scoring engine (vendored)

From https://github.com/sunnypatell/ats-screener at commit `2caae67` (August 2026), MIT license (see `LICENSE`).

Only the deterministic scoring and language modules are copied: `src/lib/engine/scorer/` (without `report.ts`, which depends on the app's Svelte stores, and without tests) and `src/lib/engine/nlp/`. The only change is the import paths (`$engine/...` became relative paths).

Jobflow calls it from `src/lib/ats.ts`, which builds the scoring input from a CV in the format of `templates/CV-FORMAT.md` and combines the six system scores with Jobflow's own keyword match. To update, copy the same folders from a newer commit and redo the import paths.
