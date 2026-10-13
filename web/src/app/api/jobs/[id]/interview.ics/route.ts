import { getJob } from "@/lib/data";

// The interview as a calendar event (.ics): opens in Google Calendar, Outlook,
// or Apple Calendar. One hour, with a reminder an hour before.
const stamp = (iso: string) => iso.replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
// Commas, semicolons, backslashes and line breaks are escaped in .ics text.
const text = (value: string) => value.replace(/[\\;,]/g, (character) => `\\${character}`).replace(/\r?\n/g, "\\n");

export async function GET(request: Request, ctx: RouteContext<"/api/jobs/[id]/interview.ics">) {
  const { id } = await ctx.params;
  const job = getJob(Number(id));
  if (!job?.interview_at) return new Response("No interview time is set for this job.", { status: 404 });
  const start = new Date(job.interview_at);
  const end = new Date(start.getTime() + 3600000);
  const link = `${new URL(request.url).origin}/jobs/${job.id}`;
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Offerbound//Interview//EN",
    "BEGIN:VEVENT",
    `UID:offerbound-interview-${job.id}@offerbound.local`,
    `DTSTAMP:${stamp(new Date().toISOString())}`,
    `DTSTART:${stamp(start.toISOString())}`,
    `DTEND:${stamp(end.toISOString())}`,
    `SUMMARY:${text(`Interview: ${job.title} at ${job.company}`)}`,
    `DESCRIPTION:${text(`Interview pack and notes: ${link}`)}`,
    ...(job.city || job.country ? [`LOCATION:${text([job.city, job.country].filter(Boolean).join(", "))}`] : []),
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    "DESCRIPTION:Interview in one hour",
    "TRIGGER:-PT1H",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  const name = `Interview ${job.company}`.replace(/[\/:*?"<>|]+/g, " ").slice(0, 60);
  return new Response(`${lines.join("\r\n")}\r\n`, {
    headers: { "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": `attachment; filename="${encodeURIComponent(name)}.ics"` },
  });
}
