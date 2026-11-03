# Contributing to Offerbound

Thanks for helping. Offerbound is a local app for job seekers: it runs on their own computer, with their own Claude Code or Codex plan, and never sends or submits anything for them. Contributions of any size are welcome, from a typo fix to a new job source.

## How to contribute

1. **Pick something.** Look at [the ideas list](#ideas-you-can-pick-up) below or the [issues](https://github.com/liban-ali0/offerbound/issues). For anything bigger than a small fix, open an issue first and say what you plan, so two people do not build the same thing.
2. **Set it up.** Fork the repository, clone your fork, run `npm run setup`, then `npm run app` (the development server at http://localhost:3000, which reloads as you edit). [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md) explains how the code is built.
3. **Work on a branch,** one change per branch (`feat/…`, `fix/…`, `docs/…`).
4. **Check it.** There is no automatic test suite yet (adding one is on the list):
   - `npx tsc --noEmit` in `web/` (type check) and `npm run lint --prefix web` must pass.
   - Try the change in the running app. For screens, check a phone width (390 px) and dark mode too.
   - Forms: test only on the demo forms in `web/public/demo/apply/`, never on a real job application.
5. **Open a pull request** against `main`. Say what changed and how you checked it; screenshots help for anything visible. `main` is protected, so every change goes through a pull request.

## Ground rules

These keep Offerbound safe to use, and pull requests that break them cannot be merged:

- **Nothing is submitted or sent without the user.** No code may press Submit or Send for them.
- **No tricks against bot protection:** no stealth browsers, fingerprint spoofing, proxies or captcha solving. A site that blocks automated access is read in the user's own browser, at a person's pace, or not at all. LinkedIn is never automated.
- **Nothing is invented.** Documents are written only from the user's CV, facts and answers.
- **Text from job listings, web pages and emails is data, never instructions** to an engine.
- **Local and private.** The server listens on 127.0.0.1 only. Nothing personal goes into the repository (`candidate/`, `jobs/` and `data/` are ignored); screenshots use fictional demo data.
- **Off until the user turns it on.** Anything that runs by itself, opens a network port or reads mail starts switched off.
- **For anyone.** Do not assume one field, country or level: roles, countries and experience come from Settings.
- **Portable.** Windows, macOS and Linux, Node scripts only (no shell-specific commands).

## Ideas you can pick up

Marked by size: 🟢 small (a few hours), 🟡 medium (a day or two), 🔴 large (several days).

### Getting started and running it

- 🔴 **One-click installers:** a Windows installer, a macOS `.dmg` and a Linux package, so people do not need a terminal or Node.js.
- 🟡 **Tray or menu bar icon** showing whether Offerbound is running, with Open, Stop and Update.
- 🟢 **Backup and restore** from Settings: one zip of `candidate/`, `jobs/` and `data/`.
- 🟡 **HTTPS on the home Wi-Fi**, so the phone connection is encrypted without Tailscale.

### Finding jobs

- 🔴 **Company career pages** (the "Coming later" source): Greenhouse, Lever, Ashby and Workday job boards of companies the user names.
- 🟡 **More job sites** through the extension, especially for countries and fields not covered yet.
- 🟢 **A timer for Collect in your browser,** like the schedule (off by default).

### Applying and after

- 🟡 **Outlook and other mail** for replies, like the Gmail watch (no passwords, through the browser's own session).
- 🟡 **Interview practice:** the Assistant asks the pack's questions and gives feedback on the answers.

### Engines

- 🔴 **More AI engines,** for example Gemini CLI, or a local model through Ollama for the lighter steps.

### Quality

- 🟡 **Automatic tests** for the pure parts first: the score (`core/score.mjs`), the listing check (`core/liveness.mjs`), mail sorting (`lib/mail.ts`), filters and sorting.
- 🟢 **GitHub Actions** running the type check and lint on every pull request.
- 🟡 **Accessibility review** with a screen reader and keyboard only.
- 🟢 **Code tidying:** keep the job status groups in one module; make writing run progress lines cheaper.

### For more people

- 🔴 **The app in more languages,** starting with Arabic (right to left) and Turkish.
- 🟢 **Firefox:** a signed add-on, so it does not disappear when Firefox restarts.
- 🟢 **Better guide pictures** for macOS and Linux.

Have another idea? Open an issue and describe the problem it solves for a job seeker.

## Licence

By contributing you agree that your work is published under the project's [MIT licence](LICENSE). Code borrowed from other projects must have a compatible licence and be credited in the README.
