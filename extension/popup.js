// The Offerbound extension's popup: sends the page you are reading to your
// Offerbound app (which picks out the jobs), fills the application form on this
// page from a job's approved package, or starts an apply session for every
// ready job. It never submits anything.
const $ = (id) => document.getElementById(id);
const status = (id, text, kind = "") => {
  $(id).textContent = text;
  $(id).className = `status ${kind}`;
};

const settings = jobflowSettings;

function showSetup(show) {
  $("setup").hidden = !show;
  $("work").hidden = show;
}

async function call(path, options = {}) {
  if (!(await settings()).token) {
    showSetup(true);
    throw new Error("Paste your key first.");
  }
  return jobflowCall(path, options);
}

const activeTab = async () => (await chrome.tabs.query({ active: true, currentWindow: true }))[0];

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
  status("sendStatus", "Reading the page…");
  try {
    const tab = await activeTab();
    const [{ result: page }] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: readPage });
    status("sendStatus", "Sending…");
    const reply = await call("/api/capture", { method: "POST", body: JSON.stringify(page) });
    status("sendStatus", reply.message, "ok");
  } catch (error) {
    status("sendStatus", error.message, "error");
  } finally {
    $("sendButton").disabled = false;
  }
}

// ---------- apply ----------

async function loadJobs() {
  try {
    const { jobs } = await call("/api/apply");
    const tab = await activeTab();
    const host = tab?.url ? new URL(tab.url).hostname : "";
    $("job").innerHTML = "";
    if (!jobs.length) {
      $("job").append(new Option("No job is ready to apply yet", ""));
      $("fillButton").disabled = true;
      return;
    }
    for (const job of jobs) $("job").append(new Option(`${job.title} · ${job.company}`, String(job.id)));
    // The job whose listing is on this site, if one is.
    const match = jobs.find((job) => job.url && host && new URL(job.url).hostname === host);
    const { lastJob } = await chrome.storage.local.get("lastJob");
    $("job").value = String(match?.id ?? lastJob ?? jobs[0].id);
    if (!$("job").value) $("job").value = String(jobs[0].id);
  } catch (error) {
    $("job").innerHTML = "";
    $("job").append(new Option("Could not load jobs", ""));
    status("fillStatus", error.message, "error");
  }
}


async function fill() {
  const id = $("job").value;
  if (!id) return;
  await chrome.storage.local.set({ lastJob: id });
  $("fillButton").disabled = true;
  $("fillReport").hidden = true;
  status("fillStatus", "Getting the answers and PDFs…");
  try {
    // The page cannot reach the local app, so the PDFs are fetched here.
    const pack = await jobflowPack(id);
    const tab = await activeTab();
    await chrome.scripting.executeScript({ target: { tabId: tab.id, allFrames: true }, files: ["fill.js"] });
    const results = await chrome.scripting.executeScript({ target: { tabId: tab.id, allFrames: true }, func: (data) => globalThis.jobflowFill(data), args: [pack] });
    const report = results.map((item) => item.result).filter(Boolean).reduce((all, one) => ({ filled: [...all.filled, ...one.filled], files: [...all.files, ...one.files], left: [...all.left, ...one.left] }), { filled: [], files: [], left: [] });
    if (!report.filled.length && !report.files.length) {
      status("fillStatus", "No form fields found here. Open the application form first.", "error");
      return;
    }
    status("fillStatus", `Filled ${report.filled.length} fields${report.files.length ? `, attached ${report.files.length} files` : ""}. Green: filled. Yellow: left for you.`, "ok");
    $("fillReport").innerHTML = "";
    for (const left of report.left) {
      const item = document.createElement("li");
      item.textContent = left;
      $("fillReport").append(item);
    }
    $("fillReport").hidden = report.left.length === 0;
    $("appliedButton").hidden = false;
  } catch (error) {
    status("fillStatus", error.message, "error");
  } finally {
    $("fillButton").disabled = false;
  }
}

async function markApplied() {
  try {
    const reply = await call(`/api/apply/${$("job").value}/applied`, { method: "POST" });
    status("fillStatus", reply.message, "ok");
    $("appliedButton").hidden = true;
  } catch (error) {
    status("fillStatus", error.message, "error");
  }
}

// An apply session: each ready job's form opens in turn, filled.
async function applyAll() {
  $("applyAllButton").disabled = true;
  try {
    const { jobs } = await call("/api/apply");
    if (!jobs.length) throw new Error("No job is ready to apply yet.");
    const reply = await chrome.runtime.sendMessage({ type: "apply", jobIds: jobs.map((job) => job.id) });
    status("fillStatus", reply.message, reply.ok ? "ok" : "error");
  } catch (error) {
    status("fillStatus", error.message, "error");
  } finally {
    $("applyAllButton").disabled = false;
  }
}

// ---------- setup ----------

$("sendButton").addEventListener("click", send);
$("fillButton").addEventListener("click", fill);
$("appliedButton").addEventListener("click", markApplied);
$("applyAllButton").addEventListener("click", applyAll);
$("collectButton").addEventListener("click", async () => {
  const reply = await chrome.runtime.sendMessage({ type: "collect" });
  status("collectStatus", reply.message, reply.ok ? "ok" : "error");
});
$("showSetup").addEventListener("click", async () => {
  const { address, token } = await settings();
  $("address").value = address;
  $("token").value = token;
  showSetup(true);
});
$("setup").addEventListener("submit", async (event) => {
  event.preventDefault();
  await chrome.storage.local.set({ address: $("address").value.trim() || "http://localhost:3000", token: $("token").value.trim() });
  showSetup(false);
  status("sendStatus", "Saved.", "ok");
  loadJobs();
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

settings().then(({ token }) => {
  if (!token) showSetup(true);
  else loadJobs();
});
