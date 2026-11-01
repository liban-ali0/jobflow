import "server-only";
import { getSettings, listJobs, listRuns } from "./data";
import { chromeSourcesOn, closeAbandonedRuns, launch, stageReady, type Stage } from "./engine";
import type { Run } from "./types";

// The schedule (Settings → Schedule), checked once a minute while the app runs
// (src/instrumentation.ts calls /api/schedule):
// - Fast track: every few minutes within the active hours, LinkedIn and
//   Workable are searched, and jobs posted within the fast-track window are
//   ranked at once, so a fresh match is on Today within minutes.
// - Daily run: at the set time, every source is searched (the Chrome sources
//   too, when on), then the new jobs are ranked, then saved jobs' listings are
//   checked for any that closed.
// What a scheduled run leads to is decided here, from the runs table, so it
// survives a restart of the app.

// One at a time: they read the same sites (LinkedIn most of all).
const SEARCH: Stage[] = ["find-jobs", "browse-jobs", "rank-jobs", "check-open"];
const minutes = (time: string) => {
  const [hours, mins] = time.split(":").map(Number);
  return hours * 60 + mins;
};
const localDay = (date: Date) => `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
const nowMinutes = (date: Date) => date.getHours() * 60 + date.getMinutes();

// Within the active hours, which may run past midnight (22:00 to 02:00).
function active(from: string, to: string, date: Date) {
  const now = nowMinutes(date);
  const start = minutes(from);
  const end = minutes(to);
  return start <= end ? now >= start && now < end : now >= start || now < end;
}

// Runs that a scheduled run leads to, started after it.
const followedBy = (runs: Run[], run: Run, stage: Stage) => runs.some((other) => other.stage === stage && other.id > run.id && other.trigger === run.trigger);

function followUps(runs: Run[], date: Date) {
  for (const run of runs) {
    if (run.status !== "done" || run.trigger === "manual") continue;
    // Only recent runs: an old one's moment has passed.
    if (!run.finished_at || date.getTime() - Date.parse(run.finished_at) > 3 * 3600000) continue;
    // Fast track: rank the fresh jobs this search found.
    if (run.stage === "find-jobs" && run.trigger === "schedule" && !followedBy(runs, run, "rank-jobs")) {
      const fresh = listJobs({ status: "found", since: run.started_at }).filter((job) => job.track === "fast");
      if (fresh.length && stageReady("rank-jobs")) return launch("rank-jobs", null, "schedule", `ids:${fresh.map((job) => job.id).join(",")}`);
    }
    // Daily: the Chrome sources after the open ones, then ranking.
    if (run.stage === "find-jobs" && run.trigger === "daily") {
      const browse = chromeSourcesOn() && stageReady("browse-jobs");
      if (browse && !followedBy(runs, run, "browse-jobs")) return launch("browse-jobs", null, "daily");
      if (!browse && !followedBy(runs, run, "rank-jobs")) return launch("rank-jobs", null, "daily");
    }
    if (run.stage === "browse-jobs" && run.trigger === "daily" && !followedBy(runs, run, "rank-jobs")) return launch("rank-jobs", null, "daily");
    if (run.stage === "rank-jobs" && run.trigger === "daily" && stageReady("check-open") && !followedBy(runs, run, "check-open")) return launch("check-open", null, "daily");
  }
  return null;
}

export type ScheduleStatus = { enabled: boolean; nextFast: Date | null; nextDaily: Date | null; lastCheck: string | null };

// When the next checks are due, for Today and Settings.
export function scheduleStatus(date = new Date()): ScheduleStatus {
  const { schedule } = getSettings();
  const runs = listRuns(200).filter((run) => run.stage === "find-jobs");
  const lastFast = runs.find((run) => run.trigger === "schedule");
  if (!schedule.enabled) return { enabled: false, nextFast: null, nextDaily: null, lastCheck: lastFast?.started_at ?? null };
  const daily = new Date(date);
  daily.setHours(Math.floor(minutes(schedule.dailyRunAt) / 60), minutes(schedule.dailyRunAt) % 60, 0, 0);
  if (daily <= date) daily.setDate(daily.getDate() + 1);
  const every = schedule.fastTrackEveryMinutes * 60000;
  let nextFast = lastFast ? new Date(Math.max(Date.parse(lastFast.started_at) + every, date.getTime())) : date;
  if (!active(schedule.activeFrom ?? "07:00", schedule.activeTo ?? "23:00", nextFast)) {
    const start = new Date(nextFast);
    start.setHours(Math.floor(minutes(schedule.activeFrom ?? "07:00") / 60), minutes(schedule.activeFrom ?? "07:00") % 60, 0, 0);
    if (start <= nextFast) start.setDate(start.getDate() + 1);
    nextFast = start;
  }
  return { enabled: true, nextFast, nextDaily: daily, lastCheck: lastFast?.started_at ?? null };
}

// One minute's check. Returns what it started, for the log.
export function scheduleTick(date = new Date()): string {
  const { schedule } = getSettings();
  if (!schedule.enabled) return "off";
  closeAbandonedRuns();
  const runs = listRuns(200);
  // Never two searches or rankings at once, and never next to the user's own.
  if (runs.some((run) => run.status === "running" && SEARCH.includes(run.stage as Stage))) return "busy";
  try {
    if (followUps(runs, date) !== null) return "follow-up";

    const finds = runs.filter((run) => run.stage === "find-jobs");
    const lastDaily = finds.find((run) => run.trigger === "daily");
    const dailyDone = lastDaily && localDay(new Date(lastDaily.started_at)) === localDay(date);
    if (!dailyDone && nowMinutes(date) >= minutes(schedule.dailyRunAt) && stageReady("find-jobs")) {
      launch("find-jobs", null, "daily");
      return "daily";
    }

    const lastSearch = finds.find((run) => run.trigger !== "manual") ?? finds[0];
    const due = !lastSearch || date.getTime() - Date.parse(lastSearch.started_at) >= schedule.fastTrackEveryMinutes * 60000;
    if (due && active(schedule.activeFrom ?? "07:00", schedule.activeTo ?? "23:00", date) && stageReady("find-jobs")) {
      launch("find-jobs", null, "schedule");
      return "fast";
    }
  } catch (error) {
    return `error: ${(error as Error).message}`;
  }
  return "idle";
}
