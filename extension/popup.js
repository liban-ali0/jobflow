// Sends the visible text and links of the current tab to the local Jobflow
// app, which picks out the jobs with the engine chosen in its Settings.
const $ = (id) => document.getElementById(id);
const status = (text, kind = "") => {
  $("status").textContent = text;
  $("status").className = kind;
};

async function settings() {
  const { address = "http://localhost:3000", token = "" } = await chrome.storage.local.get(["address", "token"]);
  return { address: address.replace(/\/+$/, ""), token };
}

function showSetup(show) {
  $("setup").hidden = !show;
  $("send").hidden = show;
}

// Runs inside the page: its readable text and its links.
function readPage() {
  const links = [...document.querySelectorAll("a[href]")]
    .map((a) => ({ text: (a.innerText || a.getAttribute("aria-label") || "").trim(), href: a.href }))
    .filter((link) => link.text && /^https?:/.test(link.href));
  return { url: location.href, title: document.title, text: document.body.innerText, links };
}

async function send() {
  const { address, token } = await settings();
  if (!token) return showSetup(true);
  $("sendButton").disabled = true;
  status("Reading the page…");
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const [{ result: page }] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: readPage });
    page.text = page.text.slice(0, 200000);
    page.links = page.links.slice(0, 400);
    status("Sending…");
    const response = await fetch(`${address}/api/capture`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Jobflow-Token": token },
      body: JSON.stringify(page),
    });
    const reply = await response.json().catch(() => ({ ok: false, message: `Jobflow answered ${response.status}.` }));
    status(reply.message, reply.ok ? "ok" : "error");
  } catch (error) {
    status(/fetch/i.test(String(error)) ? "Jobflow is not reachable. Is the app running?" : `Could not read this page: ${error.message}`, "error");
  } finally {
    $("sendButton").disabled = false;
  }
}

$("sendButton").addEventListener("click", send);
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
  status("Saved. Open a job page and send it.", "ok");
});

settings().then(({ token }) => {
  if (!token) showSetup(true);
});
