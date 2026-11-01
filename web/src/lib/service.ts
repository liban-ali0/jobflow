import "server-only";
import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { CODE_ROOT } from "./data";
import { passwordOn } from "./login";

// Settings → This computer: whether Offerbound runs in the background and
// starts at sign-in, through scripts/service.mjs (the same commands work in a
// terminal).

const run = promisify(execFile);
const SERVICE = path.join(CODE_ROOT, "scripts", "service.mjs");

export type ServiceStatus = {
  // How this server was started: in the background, or from a terminal.
  mode: "background" | "terminal" | "development";
  autostart: boolean;
  autostartSupported: boolean;
  since: string | null;
  log: string;
  // A password is needed to open Offerbound (lib/login.ts).
  password: boolean;
};

export async function serviceStatus(): Promise<ServiceStatus> {
  const mode = process.env.OFFERBOUND_SERVICE === "1" ? "background" : process.env.NODE_ENV === "development" ? "development" : "terminal";
  try {
    const { stdout } = await run(process.execPath, [SERVICE, "status", "--json", "--no-ping"], { cwd: CODE_ROOT, windowsHide: true, timeout: 15_000 });
    const status = JSON.parse(stdout);
    return { mode, autostart: status.autostart, autostartSupported: status.autostartSupported, since: mode === "background" ? status.since : null, log: status.log, password: passwordOn() };
  } catch {
    return { mode, autostart: false, autostartSupported: false, since: null, log: "", password: passwordOn() };
  }
}

export async function setAutostart(on: boolean) {
  const port = process.env.PORT ?? "3000";
  try {
    const { stdout } = await run(process.execPath, [SERVICE, "autostart", on ? "on" : "off", "--port", port], { cwd: CODE_ROOT, windowsHide: true, timeout: 15_000 });
    return { ok: true, message: stdout.trim() };
  } catch (error) {
    const stderr = (error as { stderr?: string }).stderr?.trim();
    return { ok: false, message: stderr || "Could not change the sign-in start." };
  }
}
