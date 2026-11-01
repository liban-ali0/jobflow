// The text of the user's CV (the PDF in candidate/), one line per line of the
// page, for engines that cannot read a PDF themselves (Codex). Uses Mozilla's
// pdf.js, plain JavaScript, so nothing else needs to be installed.
import fs from "node:fs";
import path from "node:path";

export function findCv(root) {
  const folder = path.join(root, "candidate");
  if (!fs.existsSync(folder)) return null;
  const name = fs.readdirSync(folder).find((file) => /\.pdf$/i.test(file));
  return name ? path.join(folder, name) : null;
}

export async function cvText(file) {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const pdf = await getDocument({ data: new Uint8Array(fs.readFileSync(file)), useSystemFonts: true, isEvalSupported: false }).promise;
  const pages = [];
  for (let number = 1; number <= pdf.numPages; number++) {
    const page = await pdf.getPage(number);
    const content = await page.getTextContent();
    // Pieces on the same line share a y position; a new y starts a new line.
    const lines = [];
    let current = "";
    let lastY = null;
    for (const item of content.items) {
      if (!("str" in item)) continue;
      const y = Math.round(item.transform[5]);
      if (lastY !== null && Math.abs(y - lastY) > 2) {
        lines.push(current.trimEnd());
        current = "";
      }
      current += item.str + (item.hasEOL ? "" : "");
      lastY = y;
    }
    if (current.trim()) lines.push(current.trimEnd());
    pages.push(lines.filter((line, index, all) => line || all[index - 1]).join("\n"));
  }
  await pdf.destroy();
  return pages.join("\n\n").replace(/[ \t]+\n/g, "\n").trim();
}
