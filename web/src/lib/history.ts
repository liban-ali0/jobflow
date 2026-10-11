import { DOCUMENT_LABELS, STATUS_LABELS, type JobEvent, type Status } from "./types";

const SOURCES: Record<string, string> = { linkedin: "LinkedIn" };
const label = (status: string) => STATUS_LABELS[status as Status] ?? status;

// A job's history event in plain words.
export function describeEvent(event: JobEvent): string {
  switch (event.type) {
    case "found":
      return event.detail ? `Found on ${SOURCES[event.detail] ?? event.detail}` : "Found";
    case "status": {
      const [, to] = (event.detail ?? "").split(" → ");
      return to ? `Moved to ${label(to)}` : "Status changed";
    }
    case "document":
      return `${DOCUMENT_LABELS[event.detail ?? ""] ?? "Document"} written`;
    case "follow-up sent":
      return "Follow-up sent";
    default:
      return [event.type.replace(/^\w/, (letter) => letter.toUpperCase()), event.detail].filter(Boolean).join(": ");
  }
}
