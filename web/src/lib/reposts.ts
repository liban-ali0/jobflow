import "server-only";
import { cache } from "react";
import { findReposts, type RepostSibling } from "@/core/reposts.mjs";
import { listJobs } from "./data";
import { formatDateTime } from "./format";
import { SENT_STATUSES, STATUS_LABELS, type Job, type Status } from "./types";

// Reposted jobs (core/reposts.mjs): the other listings of each job's opening,
// worked out once per request.
const index = cache(() => findReposts(listJobs({})));

export type RepostNote = {
  // applied: the user applied to another listing of this opening;
  // set-aside: they excluded one; after-applying: listed again after they
  // applied (often still open); reposted: listed more than once.
  kind: "applied" | "set-aside" | "after-applying" | "reposted";
  label: string;
  text: string;
  other: RepostSibling | null;
};

const day = (iso: string) => formatDateTime(iso).split(",")[0];

export function repostNote(job: Job): RepostNote | null {
  const others = index().get(job.id) ?? [];
  const sent = (status: string) => SENT_STATUSES.includes(status as Status);
  const applied = others.find((other) => sent(other.status));
  if (applied && !sent(job.status)) {
    return {
      kind: "applied",
      label: "Applied before",
      text: `You already applied to this opening${applied.applied_at ? ` on ${day(applied.applied_at)}` : ""} through an earlier listing (now ${STATUS_LABELS[applied.status as Status] ?? applied.status}).`,
      other: applied,
    };
  }
  const setAside = others.find((other) => other.status === "excluded");
  if (setAside && job.status !== "excluded") {
    return {
      kind: "set-aside",
      label: "Set aside before",
      text: `You set aside an earlier listing of this opening${setAside.excluded_reason ? `: ${setAside.excluded_reason}` : "."}`,
      other: setAside,
    };
  }
  const relistedAfter = sent(job.status) && job.applied_at && job.relisted_at && Date.parse(job.relisted_at) > Date.parse(job.applied_at);
  const laterListing = sent(job.status) && job.applied_at ? others.find((other) => Date.parse(other.found_at) > Date.parse(job.applied_at!)) : undefined;
  if (relistedAfter || laterListing) {
    const when = relistedAfter ? job.relisted_at! : laterListing!.found_at;
    return {
      kind: "after-applying",
      label: "Listed again",
      text: `Listed again on ${day(when)}, after you applied. The role is probably still open, so a short follow-up can help.`,
      other: laterListing ?? null,
    };
  }
  const times = 1 + (job.relisted_count ?? 0) + others.length;
  if (times > 1) {
    const first = [job.found_at, ...others.map((other) => other.found_at)].sort()[0];
    return {
      kind: "reposted",
      label: "Reposted",
      text: `Listed ${times} times since ${day(first)}. A repost can mean the role is hard to fill, or the first round did not work out.`,
      other: others[0] ?? null,
    };
  }
  return null;
}
