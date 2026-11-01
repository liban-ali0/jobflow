// Starts the schedule's clock when the app starts: once a minute it asks the
// app's own /api/schedule route to check what is due (lib/scheduler.ts). The
// check runs in a route so it uses the app's normal server code. A random
// key, known only to this process, keeps anyone else from calling it.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const holder = globalThis as unknown as { jobflowClock?: ReturnType<typeof setInterval> };
  if (holder.jobflowClock) clearInterval(holder.jobflowClock);
  // Web Crypto, so nothing Node-only is imported here (Next also compiles
  // this file for its Edge runtime and warned on every build).
  process.env.JOBFLOW_TICK_KEY = globalThis.crypto.randomUUID().replace(/-/g, "");
  const port = process.env.PORT ?? "3000";
  const tick = () =>
    fetch(`http://127.0.0.1:${port}/api/schedule`, { method: "POST", headers: { "x-jobflow-tick": process.env.JOBFLOW_TICK_KEY ?? "" } }).catch(() => {
      // The server is still starting or stopping; the next minute tries again.
    });
  holder.jobflowClock = setInterval(tick, 60_000);
}
