// The Offerbound extension's popup: sends the page you are reading to your
// Offerbound app (which picks out the jobs), fills the application form on this
// page from a job's approved package, starts an apply session for every ready
// job, or collects from the job sites read in the browser. It never submits
// anything.
const $ = (id) => document.getElementById(id);
const settings = jobflowSettings;

// A message under a button, shown only when there is something to say.
function status(id, text, kind = "") {
  $(id).textContent = text;
  $(id).className = `note ${kind}`;
  $(id).hidden = !text;
}

// Which screen shows: work, connect (first run), offline, or settings.
function view(name) {
  $("work").hidden = name !== "work";
  $("connectView").hidden = name !== "connect";
  $("offlineView").hidden = name !== "offline";
  $("setup").hidden = name !== "setup";
}

function connection(state) {
  const text = { on: "Connected", off: "Not connected", checking: "Checking…" }[state];
  $("connection").textContent = text;
  $("connection").className = `pill ${state === "checking" ? "" : state}`;
}

const activeTab = async () => (await chrome.tabs.query({ active: true, currentWindow: true }))[0];

async function openApp(path = "") {
  const { address } = await settings();
  await chrome.tabs.create({ url: `${address}${path}` });
  window.close();
}

// ---------- find jobs ----------

// Runs inside the page: its readable text and its links.
function readPage() {
  const links = [...document.querySelectorAll("a[href]")]
    .map((a) => ({ text: (a.innerText || a.getAttribute("aria-label") || "").trim(), href: a.href }))
    .filter((link) => link.text && /^https?:/.test(link.href));
  return { url: location.href, title: document.title, text: document.body.innerText.slice(0, 200000), links: links.slice(0, 400) };
}

async function send() {
  $("sendButton").disabled = true;
  status("sendStatus", "Reading the page…", "busy");
  try {
    const tab = await activeTab();
    const [{ result: page }] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: readPage });
    status("sendStatus", "Sending…", "busy");
    const reply = await jobflowCall("/api/capture", { method: "POST", body: JSON.stringify(page) });
    status("sendStatus", reply.message, "ok");
  } catch (error) {
    status("sendStatus", /Cannot access|cannot be scripted|chrome:\/\//i.test(error.message) ? "This page cannot be read (a browser page). Open a job site first." : error.message, "error");
  } finally {
    $("sendButton").disabled = false;
  }
}

// ---------- apply ----------

let readyJobs = [];

function showJobs(jobs, host) {
  readyJobs = jobs;
  $("job").innerHTML = "";
  $("readyCount").hidden = false;
  $("readyCount").textContent = `${jobs.length} ready`;
  $("fillButton").disabled = !jobs.length;
  $("applyAllButton").disabled = !jobs.length;
  $("applyAllButton").textContent = jobs.length > 1 ? `Apply to all ${jobs.length} ready jobs, one by one` : "Open the ready job's form, filled";
  if (!jobs.length) {
    $("job").append(new Option("No job is ready to apply yet", ""));
    $("job").disabled = true;
    return;
  }
  $("job").disabled = false;
  for (const job of jobs) $("job").append(new Option(`${job.title} · ${job.company}`, String(job.id)));
  return chrome.storage.local.get("lastJob").then(({ lastJob }) => {
    // The job whose listing is on this site, if one is.
    const match = jobs.find((job) => {
      try {
        return job.url && host && new URL(job.url).hostname === host;
      } catch {
        return false;
      }
    });
    $("job").value = String(match?.id ?? lastJob ?? jobs[0].id);
    if (!$("job").value) $("job").value = String(jobs[0].id);
  });
}

async function fill() {
  const id = $("job").value;
  if (!id) return;
  await chrome.storage.local.set({ lastJob: id });
  $("fillButton").disabled = true;
  $("fillReport").hidden = true;
  status("fillStatus", "Getting the answers and PDFs…", "busy");
  try {
    // The page cannot reach the local app, so the PDFs are fetched here.
    const pack = await jobflowPack(id);
    const tab = await activeTab();
    await chrome.scripting.executeScript({ target: { tabId: tab.id, allFrames: true }, files: ["fill.js"] });
    const results = await chrome.scripting.executeScript({ target: { tabId: tab.id, allFrames: true }, func: (data) => globalThis.jobflowFill(data), args: [pack] });
    const report = results.map((item) => item.result).filter(Boolean).reduce((all, one) => ({ filled: [...all.filled, ...one.filled], files: [...all.files, ...one.files], left: [...all.left, ...one.left] }), { filled: [], files: [], left: [] });
    if (!report.filled.length && !report.files.length) {
      status("fillStatus", "No form fields found here. Open the job's application form, then try again.", "error");
      return;
    }
    const files = report.files.length ? ` and attached ${report.files.length} ${report.files.length === 1 ? "file" : "files"}` : "";
    status("fillStatus", `Filled ${report.filled.length} ${report.filled.length === 1 ? "field" : "fields"}${files}. ${report.left.length ? "These need you (yellow on the form):" : "Check the form, then submit it yourself."}`, "ok");
    $("fillReport").innerHTML = "";
    for (const left of report.left) {
      const item = document.createElement("li");
      item.textContent = left;
      $("fillReport").append(item);
    }
    $("fillReport").hidden = report.left.length === 0;
    $("appliedButton").hidden = false;
  } catch (error) {
    status("fillStatus", /Cannot access|cannot be scripted/i.test(error.message) ? "This page cannot be filled (a browser page). Open the job's application form first." : error.message, "error");
  } finally {
    $("fillButton").disabled = false;
  }
}

async function markApplied() {
  try {
    const reply = await jobflowCall(`/api/apply/${$("job").value}/applied`, { method: "POST" });
    status("fillStatus", reply.message, "ok");
    $("appliedButton").hidden = true;
    $("fillReport").hidden = true;
  } catch (error) {
    status("fillStatus", error.message, "error");
  }
}

// An apply session: each ready job's form opens in turn, filled.
async function applyAll() {
  $("applyAllButton").disabled = true;
  try {
    if (!readyJobs.length) throw new Error("No job is ready to apply yet.");
    const reply = await chrome.runtime.sendMessage({ type: "apply", jobIds: readyJobs.map((job) => job.id) });
    status("fillStatus", reply.message, reply.ok ? "ok" : "error");
  } catch (error) {
    status("fillStatus", error.message, "error");
  } finally {
    $("applyAllButton").disabled = false;
  }
}

async function collect() {
  $("collectButton").disabled = true;
  try {
    const reply = await chrome.runtime.sendMessage({ type: "collect" });
    status("collectStatus", reply.message, reply.ok ? "ok" : "error");
  } finally {
    $("collectButton").disabled = false;
  }
}

// ---------- start ----------

// Checks the connection by asking for the ready jobs, and picks the screen.
async function start() {
  const { token } = await settings();
  if (!token) {
    connection("off");
    return view("connect");
  }
  connection("checking");
  const tab = await activeTab().catch(() => null);
  let host = "";
  try {
    host = tab?.url && /^https?:/.test(tab.url) ? new URL(tab.url).hostname : "";
  } catch {
    // Not a web page.
  }
  $("site").textContent = host ? `On ${host.replace(/^www\./, "")}` : "Open a job site to send its jobs.";
  $("sendButton").disabled = !host;
  try {
    const { jobs } = await jobflowCall("/api/apply");
    connection("on");
    view("work");
    await showJobs(jobs, host);
  } catch (error) {
    connection("off");
    // A wrong key: connect again. Anything else: the app is not answering.
    if (/key does not match/i.test(error.message)) {
      view("connect");
      return;
    }
    $("offlineText").textContent = /not reachable/i.test(error.message) ? "Is it running? Start it on this computer, then try again." : error.message;
    view("offline");
  }
}

$("sendButton").addEventListener("click", send);
$("fillButton").addEventListener("click", fill);
$("appliedButton").addEventListener("click", markApplied);
$("applyAllButton").addEventListener("click", applyAll);
$("collectButton").addEventListener("click", collect);
$("openApp").addEventListener("click", () => openApp("/"));
$("openSources").addEventListener("click", () => openApp("/settings#sources"));
$("openOffline").addEventListener("click", () => openApp("/"));
$("retry").addEventListener("click", start);
$("showSetup").addEventListener("click", async () => {
  const { address, token } = await settings();
  $("address").value = address;
  $("token").value = token;
  status("setupStatus", "");
  view("setup");
});
$("closeSetup").addEventListener("click", start);
$("setup").addEventListener("submit", async (event) => {
  event.preventDefault();
  let address;
  try {
    address = new URL($("address").value.trim() || "http://localhost:3000").origin;
  } catch {
    return status("setupStatus", "That address does not look right. It is usually http://localhost:3000.", "error");
  }
  await chrome.storage.local.set({ address, token: $("token").value.trim() });
  start();
});

// Firefox asks for the right to read sites after installing; Chrome grants it
// on install.
const SITES = { origins: ["<all_urls>"] };
chrome.permissions?.contains(SITES).then((granted) => {
  $("permission").hidden = granted;
});
$("permissionButton").addEventListener("click", async () => {
  $("permission").hidden = await chrome.permissions.request(SITES);
});

start();
