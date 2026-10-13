# CV and cover letter format

Every CV Offerbound writes (base CVs in `candidate/`, tailored CVs in job folders) uses this Markdown format, so any template can lay it out and automated CV readers (ATS) can parse the PDF. Write nothing outside these rules.

## CV

```markdown
# Full Name
Headline, for example: Backend Developer · Java, Spring Boot, Python
email@example.com | +90 555 000 0000 | Ankara, Turkey | linkedin.com/in/name

## Summary
Two to four sentences.

## Experience
### Job title | Employer | City, Country | Feb 2024 - Present
- Achievement or duty, starting with a verb.
- Another one.

### Job title (part-time) | Employer | City, Country | Aug 2023 - Feb 2024
- ...

## Education
### Degree | School | City, Country | Graduated Jul 2024
- Optional detail line.

## Projects
### Project name | Role or context | | 2023
- What it is and the candidate's part.

## Skills
- Languages: Java, Python
- Frameworks: Spring Boot, Django

## Certificates
- Name, issuer, year

## Languages
- Arabic (native), English (B2), Turkish (B1)
```

Rules:

- `#` once, the candidate's name. The next lines, before the first `##`, are the header: an optional headline line, then one contact line with items separated by ` | `.
- `##` starts a section. Use these names when they apply: Summary, Experience, Education, Projects, Skills, Certificates, Languages, Awards, Volunteering. Leave out a section with nothing true to put in it.
- `###` starts an entry inside a section: exactly four fields separated by ` | `: title, organisation, place, dates. Leave a field empty (`| |`) rather than dropping it.
- Under an entry or section: `- ` bullet lines, or plain paragraphs. Bold (`**...**`) may mark a label at the start of a skills line; no other formatting, tables, images, columns, or emoji.
- Dates as `Mon YYYY - Mon YYYY`, `Mon YYYY - Present`, or a single year.
- One page when rendered: about 450 to 600 words for a junior candidate, more for long careers but still focused on the most relevant.

## Cover letter

```markdown
# Full Name
email@example.com | +90 555 000 0000 | Ankara, Turkey | linkedin.com/in/name

11 October 2026

Hiring Manager name or team
Company
City, Country

Dear Ms Example,

Three to five short paragraphs.

Kind regards,
Full Name
```

- Same header as the CV. Then the date, the recipient block (each line on its own line), the greeting, the body, and the sign-off.
- In the language of the listing. Arabic letters are written right to left; keep the same structure.
- 250 to 400 words. No placeholders like `[Company]` may remain.
