import "server-only";
import { parseKeywords, type AtsTarget } from "./ats";
import { getJob, getSettings } from "./data";
import { readText } from "./documents";

// What a job's CV is checked against: the listing text, plus the "ATS
// keywords" part of the job's research.
export function targetForJob(jobId: number): AtsTarget {
  const job = getJob(jobId);
  const research = job?.folder ? readText(`${job.folder}/research.md`) : null;
  const section = research?.match(/^#{2,3}\s*ATS keywords\s*$([\s\S]*?)(?=^#{1,3}\s|$(?![\s\S]))/im)?.[1];
  return { title: job?.title, text: [job?.title, job?.description].filter(Boolean).join("\n\n"), keywords: section ? parseKeywords(section.trim()) : [] };
}

// A base CV is checked against its role's name and search keywords.
export function targetForRole(roleKey: string): AtsTarget {
  const role = getSettings().roles.find((item) => item.key === roleKey);
  return role ? { title: role.label, text: role.label, keywords: parseKeywords(role.keywords.join("\n")) } : { text: "", keywords: [] };
}
