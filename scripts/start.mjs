#!/usr/bin/env node
// Starts Offerbound for everyday use (npm start): the app is built once, and
// again only when its code changed, then served in production mode, which is
// faster and lighter than the development server (npm run app).
// The build lives in web/.next-prod, apart from the development server's.
import { spawnSync, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WEB = path.join(ROOT, "web");
const DIST = ".next-prod";
const PORT = process.env.PORT ?? "3000";
const env = { ...process.env, NEXT_DIST_DIR: DIST, PORT };
const next = path.join(WEB, "node_modules", "next", "dist", "bin", "next");

if (!fs.existsSync(next)) {
  console.error("The app is not installed yet. Run `npm run setup` first.");
  process.exit(1);
}

// The newest change to anything the build is made from.
function newest(dir) {
  let latest = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) latest = Math.max(latest, newest(full));
    else latest = Math.max(latest, fs.statSync(full).mtimeMs);
  }
  return latest;
}
const built = path.join(WEB, DIST, "BUILD_ID");
const sources = Math.max(newest(path.join(WEB, "src")), ...["package.json", "next.config.ts"].map((file) => fs.statSync(path.join(WEB, file)).mtimeMs));
if (!fs.existsSync(built) || fs.statSync(built).mtimeMs < sources || process.argv.includes("--rebuild")) {
  console.log("Building Offerbound (a minute or two, only after an update)…");
  const build = spawnSync(process.execPath, [next, "build"], { cwd: WEB, env, stdio: "inherit" });
  if (build.status !== 0) process.exit(build.status ?? 1);
}

console.log(`Offerbound is starting at http://localhost:${PORT} (stop it with Ctrl+C).`);
// Only this computer by default; other devices (a phone over Tailscale) are
// let in by the access key, see Settings → Other devices.
const host = process.env.HOST ?? "127.0.0.1";
const server = spawn(process.execPath, [next, "start", "-H", host, "-p", PORT], { cwd: WEB, env, stdio: "inherit" });
server.on("exit", (code) => process.exit(code ?? 0));
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => server.kill(signal));
