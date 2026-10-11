import { csvResponse, type CsvValue } from "@/lib/csv";
import { listContacts, listDocuments, listEvents, listJobs } from "@/lib/data";
import { FOLLOW_UP_SENT } from "@/lib/followups";
import { STATUS_LABELS, type Job, type Status } from "@/lib/types";

// Every application on the Board, with its dates, contacts, and documents.
const STATUSES: Status[] = ["selected", "researched", "ready", "applied", "replied", "interview", "offer", "rejected", "no_response"];
const day = (iso: string | null | undefined) => (iso ? iso.slice(0, 10) : null);

export function GET() {
  const header = [
    "Id",
    "Title",
    "Company",
    "City",
    "Country",
    "Status",
    "Applied",
    "Follow-up sent",
    "Next follow-up",
    "Last update",
    "Score",
    "Salary estimate",
    "Documents approved",
    "Contacts",
    "Listing",
    "Notes",
  ];
  const rows: CsvValue[][] = listJobs({ status: STATUSES }).map((job: Job) => {
    const docs = listDocuments(job.id).filter((doc) => ["cv", "cover_letter", "email", "answers"].includes(doc.type));
    const followedUp = listEvents(job.id).find((event) => event.type === FOLLOW_UP_SENT);
    const contacts = listContacts(job.id)
      .map((contact) => [contact.name, contact.role, contact.email].filter(Boolean).join(", "))
      .join("; ");
    return [
      job.id,
      job.title,
      job.company,
      job.city,
      job.country,
      STATUS_LABELS[job.status],
      day(job.applied_at),
      day(followedUp?.at),
      job.status === "applied" ? day(job.follow_up_due) : null,
      day(job.updated_at),
      job.score === null ? null : Math.round(job.score),
      job.salary_estimate,
      docs.length ? `${docs.filter((doc) => doc.review === "approved").length}/${docs.length}` : null,
      contacts,
      job.url,
      job.notes,
    ];
  });
  return csvResponse([header, ...rows], `jobflow-applications-${new Date().toISOString().slice(0, 10)}.csv`);
}
