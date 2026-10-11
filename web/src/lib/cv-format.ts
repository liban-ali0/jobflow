// Reads CVs and cover letters written in the format of templates/CV-FORMAT.md
// into a structure the templates lay out. Tolerant of older base CVs that
// mark entries with a bold line instead of "###".

export type CvEntry = { title: string; org: string; place: string; dates: string; bullets: string[]; text: string[] };
export type CvSection = { title: string; key: string; entries: CvEntry[]; bullets: string[]; text: string[] };
export type CvDocument = { name: string; headline: string; contact: string[]; sections: CvSection[] };
export type LetterDocument = { name: string; contact: string[]; blocks: string[][] };

export const sectionKey = (title: string) =>
  title
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-|-$/g, "");

const splitFields = (line: string) => line.split("|").map((field) => field.trim());

function entryFrom(header: string): CvEntry {
  const [title = "", org = "", place = "", dates = ""] = splitFields(header);
  return { title, org, place, dates, bullets: [], text: [] };
}

// "**Title** (type), Employer, City | Dates" from older base CVs.
function legacyEntry(line: string): CvEntry | null {
  const match = /^\*\*(.+?)\*\*(.*)$/.exec(line);
  if (!match) return null;
  const [before, dates = ""] = (() => {
    const at = match[2].lastIndexOf("|");
    return at >= 0 ? [match[2].slice(0, at), match[2].slice(at + 1)] : [match[2], ""];
  })();
  const rest = before.replace(/^[\s,]+/, "");
  const [kind, ...more] = rest.startsWith("(") ? [rest.slice(0, rest.indexOf(")") + 1), rest.slice(rest.indexOf(")") + 1)] : ["", rest];
  const parts = more.join("").replace(/^[\s,]+/, "").split(/,\s*/);
  return {
    title: `${match[1]}${kind ? ` ${kind}` : ""}`.trim(),
    org: parts[0] ?? "",
    place: parts.slice(1).join(", "),
    dates: dates.trim(),
    bullets: [],
    text: [],
  };
}

export function parseCv(markdown: string): CvDocument {
  const doc: CvDocument = { name: "", headline: "", contact: [], sections: [] };
  const header: string[] = [];
  let section: CvSection | null = null;
  let entry: CvEntry | null = null;

  for (const raw of markdown.replace(/\r/g, "").split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("# ")) {
      doc.name = line.slice(2).trim();
    } else if (line.startsWith("## ")) {
      const title = line.slice(3).trim();
      section = { title, key: sectionKey(title), entries: [], bullets: [], text: [] };
      entry = null;
      doc.sections.push(section);
    } else if (!section) {
      header.push(line);
    } else if (line.startsWith("### ")) {
      entry = entryFrom(line.slice(4));
      section.entries.push(entry);
    } else if (line.startsWith("- ") || line.startsWith("* ")) {
      (entry ?? section).bullets.push(line.slice(2).trim());
    } else {
      const legacy = legacyEntry(line);
      if (legacy) {
        entry = legacy;
        section.entries.push(entry);
      } else {
        (entry ?? section).text.push(line);
      }
    }
  }

  // The contact line is the one with "|" or an email; anything else is the headline.
  for (const line of header) {
    if (line.includes("|") || /@/.test(line)) doc.contact.push(...splitFields(line).filter(Boolean));
    else doc.headline = doc.headline ? `${doc.headline} · ${line}` : line;
  }
  return doc;
}

export function parseLetter(markdown: string): LetterDocument {
  const letter: LetterDocument = { name: "", contact: [], blocks: [] };
  let block: string[] = [];
  let inHeader = true;
  for (const raw of markdown.replace(/\r/g, "").split("\n")) {
    const line = raw.trim();
    if (line.startsWith("# ")) {
      letter.name = line.slice(2).trim();
      continue;
    }
    if (inHeader && letter.name && line && (line.includes("|") || /@/.test(line)) && letter.contact.length === 0) {
      letter.contact = splitFields(line).filter(Boolean);
      continue;
    }
    if (!line) {
      if (block.length) letter.blocks.push(block);
      block = [];
      if (letter.name) inHeader = false;
      continue;
    }
    inHeader = false;
    block.push(line);
  }
  if (block.length) letter.blocks.push(block);
  return letter;
}

// Plain text with the little inline formatting the format allows.
export function inline(text: string) {
  const escaped = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  return escaped.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
}

// Writes a CV back in the format of templates/CV-FORMAT.md. Older base CVs
// come out in the current format.
export function serializeCv(doc: CvDocument) {
  const lines = [`# ${doc.name.trim()}`];
  if (doc.headline.trim()) lines.push(doc.headline.trim());
  const contact = doc.contact.map((item) => item.trim()).filter(Boolean);
  if (contact.length) lines.push(contact.join(" | "));
  const bullets = (items: string[]) => items.map((item) => item.trim()).filter(Boolean).map((item) => `- ${item}`);
  const text = (items: string[]) => items.map((item) => item.trim()).filter(Boolean);
  for (const section of doc.sections) {
    if (!section.title.trim()) continue;
    lines.push("", `## ${section.title.trim()}`, ...text(section.text), ...bullets(section.bullets));
    for (const entry of section.entries) {
      const fields = [entry.title, entry.org, entry.place, entry.dates].map((field) => field.replace(/\|/g, "/").trim());
      if (!fields.some(Boolean)) continue;
      lines.push("", `### ${fields.join(" | ")}`, ...bullets(entry.bullets), ...text(entry.text));
    }
  }
  return `${lines.join("\n")}\n`;
}

// Replaces one line (a bullet or a paragraph, anywhere in the CV) that reads
// "before" with "after". Returns the same object when no line matches.
export function replaceLine(doc: CvDocument, before: string, after: string): CvDocument {
  const clean = (line: string) => line.replace(/^\s*[-*]\s+/, "").replace(/\s+/g, " ").trim();
  const target = clean(before);
  const next = clean(after);
  let done = false;
  const swap = (lines: string[]) =>
    lines.map((line) => {
      if (!done && clean(line) === target) {
        done = true;
        return next;
      }
      return line;
    });
  const sections = doc.sections.map((section) => ({
    ...section,
    text: swap(section.text),
    bullets: swap(section.bullets),
    entries: section.entries.map((entry) => ({ ...entry, bullets: swap(entry.bullets), text: swap(entry.text) })),
  }));
  return done ? { ...doc, sections } : doc;
}
