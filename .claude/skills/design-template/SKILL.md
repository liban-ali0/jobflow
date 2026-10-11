---
name: design-template
description: Create a new CV and cover letter template from the user's description, as a stylesheet over Jobflow's fixed CV markup. Argument - the description.
---

# Design a CV template

The user described the template they want: `$ARGUMENTS`

A template is a folder with two files, `template.json` (name, description, options) and `style.css`. Jobflow lays out every CV with the same HTML and the template restyles it, so the CSS is all you design. Read the three built-in templates in `templates/cv/` (classic, modern, compact) first: they show the markup's class names and how far a stylesheet can go.

## Steps

1. Read `templates/cv/*/template.json` and `templates/cv/*/style.css`, and `templates/CV-FORMAT.md`.
2. Pick a short id in lowercase letters, numbers, and dashes that is not already used in `templates/cv/` or `candidate/templates/`, for example `slate-sidebar`.
3. Write `candidate/templates/<id>/template.json` and `candidate/templates/<id>/style.css`.
4. Report the template's name, what it looks like, and anything from the description you could not do and why.

## The markup

```html
<body class="cv">                          <!-- "letter" for cover letters -->
  <div class="page">
    <header class="cv-header">
      <h1>Name</h1>
      <p class="cv-headline">Headline</p>
      <p class="cv-contact"><span>email</span><span>phone</span>…</p>
    </header>
    <section class="cv-section" data-section="experience">   <!-- summary, experience, education, projects, skills, certificates, languages, … -->
      <h2>Experience</h2>
      <p>section text</p>
      <ul><li>section bullet</li></ul>
      <div class="cv-entry">
        <div class="cv-entry-head">
          <span class="cv-entry-title"></span><span class="cv-entry-org"></span><span class="cv-entry-place"></span><span class="cv-entry-dates"></span>
        </div>
        <ul><li>bullet</li></ul>
      </div>
    </section>
  </div>
</body>
```

Cover letters use the same header, then `<div class="letter-body">` with one `<div class="letter-block">` per paragraph.

These CSS variables are set from the options, so use them instead of fixed values: `--cv-font`, `--cv-accent`, `--cv-size`, `--cv-margin`, `--cv-gap`.

## template.json

```json
{
  "name": "Two to three words",
  "description": "One sentence on the look and who it suits.",
  "options": {
    "font": "arial | calibri | helvetica | georgia | garamond | times",
    "accent": "#rrggbb",
    "size": 10.5,
    "margin": 15,
    "spacing": "tight | normal | airy",
    "sectionOrder": ["summary", "experience", "education", "projects", "skills", "certificates", "languages"]
  }
}
```

## Rules for CVs that automated readers (ATS) can parse

- Real text only: no text in images, no `content:` used to add words, no icons standing in for labels.
- Reading order must stay the order of the markup. A side column is allowed only with CSS grid on `.page` for short sections (skills, languages, contact) and must not reorder experience; prefer one column when unsure, and say so in the report.
- No background images, external fonts, or `@import`; only the font stacks above. Accent colours must keep body text dark on white (contrast at least 4.5:1).
- Must fit one A4 page for a typical CV at the default size; do not set font sizes in absolute units on body text (use `em` on top of `--cv-size`).
- Work for right-to-left text: use logical properties (`margin-inline-start`, `padding-inline-end`) rather than left and right where it matters.
- Write only inside `candidate/templates/<id>/`.
