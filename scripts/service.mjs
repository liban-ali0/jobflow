#!/usr/bin/env node
// Runs Offerbound in the background, like a desktop app: no window to keep
// open, started again if it stops unexpectedly, and (on Windows) started when
// you sign in. The app is the same production server as `npm start`.
//
//   node scripts/service.mjs start          start in the background
//   node scripts/service.mjs stop           stop it
//   node scripts/service.mjs restart        stop, then start
//   node scripts/service.mjs status         running or not, sign-in start on or off
//   node scripts/service.mjs update         get the latest version, then restart
//   node scripts/service.mjs logs           the end of the log
//   node scripts/service.mjs autostart on   start at sign-in (Windows)
//   node scripts/service.mjs autostart off
//
// Add --json to status for the app's Settings page. The server log is in
// data/logs/offerbound.log, and data/service.json says which process runs it.
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA = path.join(ROOT, "data");
const STATE = path.join(DATA, "service.json");
const LOGS = path.join(DATA, "logs");
const LOG = path.join(LOGS, "offerbound.log");
const LAUNCHER = path.join(DATA, "autostart.vbs");
const RUN_KEY = "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run";
// One sign-in entry per copy of Offerbound, so two copies never clash.
const RUN_NAME = `Offerbound (${path.basename(ROOT)})`;
const WINDOWS = process.platform === "win32";

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const option = (name) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : undefined;
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function readState() {
  try {
    return JSON.parse(fs.readFileSync(STATE, "utf8"));
  } catch {
    return null;
  }
}

function alive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === "EPERM";
  }
}

// Whether something answers on the port (Offerbound or another program).
function portBusy(port) {
  return new Promise((resolve) => {
    const socket = net.connect(Number(port), "127.0.0.1");
    socket.setTimeout(1500);
    socket.once("connect", () => (socket.destroy(), resolve(true)));
    socket.once("timeout", () => (socket.destroy(), resolve(false)));
    socket.once("error", () => resolve(false));
  });
}

async function answers(port) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/manifest.webmanifest`, { signal: AbortSignal.timeout(5000) });
    return response.ok;
  } catch {
    return false;
  }
}

function running() {
  const state = readState();
  return state && alive(state.pid) ? state : null;
}

// ---- The supervisor (run in the background by `start`) ----

function log(line) {
  fs.mkdirSync(LOGS, { recursive: true });
  fs.appendFileSync(LOG, `[${new Date().toISOString()}] ${line}\n`);
}

// Keeps the log small: the previous one is kept as offerbound.old.log.
function rotate() {
  try {
    if (fs.statSync(LOG).size > 5 * 1024 * 1024) fs.renameSync(LOG, path.join(LOGS, "offerbound.old.log"));
  } catch {
    // No log yet.
  }
}

async function supervise(port) {
  fs.mkdirSync(LOGS, { recursive: true });
  fs.writeFileSync(STATE, JSON.stringify({ pid: process.pid, port: Number(port), started: new Date().toISOString() }, null, 2));
  let stopping = false;
  let child = null;
  const stop = () => {
    stopping = true;
    if (child) child.kill();
    try {
      fs.rmSync(STATE, { force: true });
    } catch {
      // Already gone.
    }
    process.exit(0);
  };
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) process.on(signal, stop);

  // Crashes in a row; the wait grows so a broken update does not spin.
  let failures = 0;
  while (!stopping) {
    rotate();
    const out = fs.openSync(LOG, "a");
    log(`starting Offerbound on port ${port}`);
    const startedAt = Date.now();
    child = spawn(process.execPath, [path.join(ROOT, "scripts", "start.mjs")], {
      cwd: ROOT,
      env: { ...process.env, PORT: String(port), OFFERBOUND_SERVICE: "1" },
      stdio: ["ignore", out, out],
      windowsHide: true,
    });
    const code = await new Promise((resolve) => child.on("exit", (exitCode, signal) => resolve(exitCode ?? signal)));
    fs.closeSync(out);
    if (stopping) break;
    failures = Date.now() - startedAt > 10 * 60_000 ? 1 : failures + 1;
    const wait = Math.min(5_000 * 2 ** (failures - 1), 5 * 60_000);
    log(`Offerbound stopped (${code}); starting again in ${Math.round(wait / 1000)} s`);
    await sleep(wait);
  }
}

// ---- Commands ----

async function start({ quiet = false, wait = true } = {}) {
  const port = option("port") ?? process.env.PORT ?? readState()?.port ?? "3000";
  const current = running();
  if (current) {
    if (!quiet) console.log(`Offerbound is already running: http://localhost:${current.port}`);
    return true;
  }
  if (await portBusy(port)) {
    console.error(
      `Port ${port} is already in use by another program (is \`npm run app\` or \`npm start\` still open?). Close it first, or choose another port with --port.`,
    );
    return false;
  }
  if (!fs.existsSync(path.join(ROOT, "web", "node_modules", "next"))) {
    console.error("The app is not installed yet. Run `npm run setup` first.");
    return false;
  }
  const supervisor = spawn(process.execPath, [fileURLToPath(import.meta.url), "run", "--port", String(port)], {
    cwd: ROOT,
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  supervisor.unref();
  if (!wait) return true;
  if (!quiet) console.log("Starting Offerbound in the background (the first start builds it: a minute or two)…");
  for (let second = 0; second < 600; second += 2) {
    await sleep(2000);
    if (await answers(port)) {
      if (!quiet) console.log(`Offerbound is running: http://localhost:${port}`);
      return true;
    }
    if (!alive(supervisor.pid)) break;
  }
  console.error(`Offerbound did not start. See the log: ${LOG}`);
  return false;
}

async function stop({ quiet = false } = {}) {
  const current = running();
  if (!current) {
    if (!quiet) console.log("Offerbound is not running in the background.");
    fs.rmSync(STATE, { force: true });
    return;
  }
  // The supervisor and everything it started (the build or the server).
  if (WINDOWS) spawnSync("taskkill", ["/pid", String(current.pid), "/t", "/f"], { stdio: "ignore", windowsHide: true });
  else {
    try {
      process.kill(-current.pid, "SIGTERM");
    } catch {
      process.kill(current.pid, "SIGTERM");
    }
  }
  for (let tries = 0; tries < 20 && (alive(current.pid) || (await portBusy(current.port))); tries++) await sleep(500);
  fs.rmSync(STATE, { force: true });
  if (!quiet) console.log("Offerbound stopped.");
}

function autostartOn() {
  if (!WINDOWS) return false;
  const query = spawnSync("reg", ["query", RUN_KEY, "/v", RUN_NAME], { encoding: "utf8", windowsHide: true });
  return query.status === 0;
}

function setAutostart(on) {
  if (!WINDOWS) {
    console.error("Starting at sign-in is set up for Windows only. On macOS or Linux, add `node scripts/service.mjs start` to your login items.");
    return false;
  }
  if (!on) {
    spawnSync("reg", ["delete", RUN_KEY, "/v", RUN_NAME, "/f"], { stdio: "ignore", windowsHide: true });
    fs.rmSync(LAUNCHER, { force: true });
    console.log("Offerbound no longer starts when you sign in.");
    return true;
  }
  const port = option("port") ?? readState()?.port ?? process.env.PORT ?? "3000";
  const command = `"${process.execPath}" "${fileURLToPath(import.meta.url)}" start --quiet --no-wait --port ${port}`;
  // A small script started by Windows Script Host runs the command without
  // opening a window. Where it is missing (VBScript can be removed), a hidden
  // PowerShell does the same with a brief flash.
  let entry;
  if (fs.existsSync(path.join(process.env.SystemRoot ?? "C:\\Windows", "System32", "wscript.exe"))) {
    fs.mkdirSync(DATA, { recursive: true });
    // UTF-16 with a byte order mark, so folder names in any language work.
    const script = `' Starts Offerbound in the background at sign-in (scripts/service.mjs).\r\nCreateObject("WScript.Shell").Run "${command.replace(/"/g, '""')}", 0, False\r\n`;
    fs.writeFileSync(LAUNCHER, `﻿${script}`, "utf16le");
    entry = `wscript.exe //B //Nologo "${LAUNCHER}"`;
  } else {
    entry = `powershell.exe -NoProfile -WindowStyle Hidden -Command "& ${command.replace(/"/g, "'")}"`;
  }
  const result = spawnSync("reg", ["add", RUN_KEY, "/v", RUN_NAME, "/t", "REG_SZ", "/d", entry, "/f"], { encoding: "utf8", windowsHide: true });
  if (result.status !== 0) {
    console.error(`Could not set Offerbound to start at sign-in: ${result.stderr.trim()}`);
    return false;
  }
  console.log("Offerbound now starts in the background when you sign in to Windows.");
  return true;
}

async function status() {
  const current = running();
  const port = current?.port ?? option("port") ?? process.env.PORT ?? "3000";
  const report = {
    running: Boolean(current),
    // --no-ping: asked by the app itself, which is answering.
    answering: current ? flag("no-ping") || (await answers(port)) : false,
    pid: current?.pid ?? null,
    port: Number(port),
    since: current?.started ?? null,
    autostart: autostartOn(),
    autostartSupported: WINDOWS,
    log: LOG,
  };
  if (flag("json")) return console.log(JSON.stringify(report));
  if (!current) console.log("Offerbound is not running in the background.");
  else console.log(`Offerbound is ${report.answering ? "running" : "starting"}: http://localhost:${port} (since ${new Date(report.since).toLocaleString()})`);
  if (WINDOWS) console.log(`Start at sign-in: ${report.autostart ? "on" : "off"}`);
  console.log(`Log: ${LOG}`);
}

function run(command, commandArgs, cwd) {
  console.log(`> ${command} ${commandArgs.join(" ")}`);
  // npm is a .cmd file on Windows, which needs a shell to run.
  const result = spawnSync(command, commandArgs, { cwd, stdio: "inherit", shell: WINDOWS && command === "npm" });
  return result.status === 0;
}

async function update() {
  const wasRunning = Boolean(running());
  if (!fs.existsSync(path.join(ROOT, ".git"))) {
    console.error("This copy was not downloaded with git, so it cannot update itself. Download the new version instead.");
    process.exit(1);
  }
  if (!run("git", ["pull", "--ff-only"], ROOT)) {
    console.error("Could not get the latest version (see above). Nothing was changed.");
    process.exit(1);
  }
  // Windows keeps a running app's files locked, so it stops before installing.
  if (wasRunning) await stop({ quiet: true });
  const installed = run("npm", ["install"], ROOT) && run("npm", ["install"], path.join(ROOT, "web"));
  if (installed) run(process.execPath, ["scripts/jobs.mjs", "statuses"], ROOT);
  if (wasRunning) {
    // The new version is built on this start (start.mjs sees the change).
    const started = await start();
    process.exit(installed && started ? 0 : 1);
  }
  if (!installed) process.exit(1);
  console.log("Updated. Start it with `node scripts/service.mjs start`.");
}

function tail() {
  if (!fs.existsSync(LOG)) return console.log("No log yet.");
  const lines = fs.readFileSync(LOG, "utf8").trimEnd().split("\n");
  console.log(lines.slice(-Number(option("lines") ?? 60)).join("\n"));
}

const command = args[0];
switch (command) {
  case "run":
    await supervise(option("port") ?? process.env.PORT ?? "3000");
    break;
  case "start":
    process.exit((await start({ quiet: flag("quiet"), wait: !flag("no-wait") })) ? 0 : 1);
    break;
  case "stop":
    await stop();
    break;
  case "restart":
    await stop({ quiet: true });
    process.exit((await start()) ? 0 : 1);
    break;
  case "status":
    await status();
    break;
  case "update":
    await update();
    break;
  case "logs":
    tail();
    break;
  case "autostart":
    if (!["on", "off"].includes(args[1])) {
      console.error("Use: node scripts/service.mjs autostart on|off");
      process.exit(1);
    }
    process.exit(setAutostart(args[1] === "on") ? 0 : 1);
    break;
  default:
    console.log(fs.readFileSync(fileURLToPath(import.meta.url), "utf8").split("\n").slice(1, 16).map((line) => line.replace(/^\/\/ ?/, "")).join("\n"));
}
