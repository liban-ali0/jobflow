// A job's requirements as short lines, for matching interview stories: the
// job report's requirements when there is one, else the research's ATS
// keywords. Empty when the job was never researched.
import fs from "node:fs";
import path from "node:path";

export function jobRequirements(root, job) {
  if (!job?.folder) return [];
  const folder = path.join(root, job.folder);
  try {
    const report = JSON.parse(fs.readFileSync(path.join(folder, "report.json"), "utf8"));
    const rows = (report.requirements ?? []).filter((row) => row?.requirement && row.match !== "na").map((row) => String(row.requirement));
    if (rows.length) return rows.slice(0, 20);
  } catch {
    // No report: fall back to the research.
  }
  try {
    const research = fs.readFileSync(path.join(folder, "research.md"), "utf8");
    const section = research.match(/^#{2,3}\s*ATS keywords\s*$([\s\S]*?)(?=^#{1,3}\s|$(?![\s\S]))/im)?.[1] ?? "";
    return section
      .split("\n")
      .map((line) => line.replace(/^\s*[-*•]\s*/, "").replace(/\s*\((must|required)\)\s*$/i, "").trim())
      .filter((line) => line && line.length <= 60)
      .slice(0, 20);
  } catch {
    return [];
  }
}
