// The Offerbound extension's background worker: opens application forms for
// ready jobs (one after another in an apply session), fills them on every
// page load, keeps the app told what is left for the user, and records the
// application when the user's submit is confirmed. It never submits.
// Chrome runs this as a service worker and loads common.js here; Firefox
// loads both files as background scripts (see manifest.json).
if (typeof jobflowCall === "undefined") importScripts("common.js");

const GROUP_TITLE = "Offerbound applications";

// Tab state lives in session storage, so it survives the worker sleeping.
const load = async (key, fallback) => (await chrome.storage.session.get(key))[key] ?? fallback;
const save = (key, value) => chrome.storage.session.set({ [key]: value });
const tabKey = (tabId) => `tab:${tabId}`;
const packKey = (jobId) => `pack:${jobId}`;

// Where the form is, from the listing's link. Some application systems put
// the form at a known address next to the listing.
function applyAddress(url) {
  let address;
  try {
    address = new URL(url);
  } catch {
    return { stop: "No link to the listing" };
  }
  const host = address.hostname.replace(/^www\./, "");
  if (/(^|\.)linkedin\.com$/.test(host)) return { stop: "LinkedIn: apply yourself (Offerbound never automates LinkedIn)" };
  if (host === "apply.workable.com" && /\/j\/[^/]+\/?$/.test(address.pathname)) address.pathname = address.pathname.replace(/\/?$/, "/apply/");
  if (host === "jobs.lever.co" && !/\/apply\/?$/.test(address.pathname)) address.pathname = address.pathname.replace(/\/?$/, "/apply");
  return { url: address.toString() };
}

async function report(jobId, missing) {
  try {
    await jobflowCall(`/api/apply/${jobId}/state`, { method: "POST", body: JSON.stringify({ missing }) });
  } catch (error) {
    // The app is not reachable; the bar still shows what is left.
    console.warn(`Offerbound: could not report job ${jobId}: ${error.message}`);
  }
}

async function groupTab(tabId) {
  // Tab groups exist in Chrome and newer Firefox; without them the tab just opens.
  if (!chrome.tabGroups || !chrome.tabs.group) return;
  const groups = await chrome.tabGroups.query({ title: GROUP_TITLE }).catch(() => []);
  const groupId = await chrome.tabs.group({ tabIds: [tabId], ...(groups[0] ? { groupId: groups[0].id } : {}) });
  if (!groups[0]) await chrome.tabGroups.update(groupId, { title: GROUP_TITLE, color: "yellow" });
}

// Opens one job's form. Jobs that cannot be applied to here are flagged in
// the app with the reason, and the session moves on.
async function openJob(jobId) {
  let pack;
  try {
    pack = await jobflowPack(jobId);
  } catch (error) {
    return { ok: false, message: error.message };
  }
  const target = applyAddress(pack.job.url);
  if (target.stop) {
    await report(jobId, [target.stop]);
    return { ok: false, message: target.stop };
  }
  await save(packKey(jobId), pack);
  const tab = await chrome.tabs.create({ url: target.url, active: true });
  await save(tabKey(tab.id), { jobId, frames: {}, attemptAt: null, fields: [], typed: [], confirmed: false });
  await groupTab(tab.id).catch(() => null);
  return { ok: true, message: `Opened ${pack.job.title} at ${pack.job.company}.` };
}

async function openNext() {
  const queue = await load("queue", []);
  while (queue.length) {
    const jobId = queue.shift();
    await save("queue", queue);
    const opened = await openJob(jobId);
    if (opened.ok) return opened;
  }
  return { ok: true, message: "No more ready jobs in this session." };
}

// Fills the page after every load, in every frame.
async function inject(tabId) {
  const state = await load(tabKey(tabId), null);
  if (!state) return;
  const pack = await load(packKey(state.jobId), null);
  if (!pack) return;
  // A new page: what is left is read again; the totals filled stay.
  state.frames = {};
  await save(tabKey(tabId), state);
  const queue = (await load("queue", [])).length;
  try {
    await chrome.scripting.executeScript({ target: { tabId, allFrames: true }, files: ["fill.js", "apply.js"] });
    await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      func: (context) => globalThis.jobflowApplyStart?.(context),
      args: [{ pack, queue, attemptAt: state.attemptAt, fields: state.fields, typed: state.typed, confirmed: state.confirmed, filled: state.filled || 0, files: state.files || 0 }],
    });
  } catch {
    // Pages the extension may not touch (the browser's own pages).
  }
}

// What is left across all frames of the tab, sent to the app and the bar.
async function onReport(tabId, frameId, message) {
  const state = await load(tabKey(tabId), null);
  if (!state || state.confirmed) return;
  // Each pass reports what it newly filled; what is left is per frame, latest.
  state.frames[frameId] = { left: message.left, fields: message.fields };
  state.filled = (state.filled || 0) + message.filled;
  state.files = (state.files || 0) + message.files;
  await save(tabKey(tabId), state);
  const frames = Object.values(state.frames);
  const left = [...new Set(frames.flatMap((frame) => frame.left))];
  const { filled, files } = state;
  const anyFields = frames.some((frame) => frame.fields > 0);
  const missing = anyFields || left.length ? left : ["No application form on this page yet: press the site's Apply button, and Offerbound fills the form when it appears"];
  const sent = JSON.stringify(missing);
  if (state.reported !== sent) {
    state.reported = sent;
    await save(tabKey(tabId), state);
    await report(state.jobId, missing);
  }
  const queue = (await load("queue", [])).length;
  chrome.tabs.sendMessage(tabId, { type: "bar", state: { reasons: missing, filled, files, queue } }, { frameId: 0 }).catch(() => null);
}

async function onSubmitted(tabId, message) {
  const state = await load(tabKey(tabId), null);
  if (!state) return { ok: false, message: "This tab is not an application Offerbound opened." };
  if (state.confirmed) return { ok: true, typed: [] };
  const fields = message.fields?.length ? message.fields : state.fields;
  try {
    // The form's own address, without a query (a thank-you page's address can
    // carry the whole form).
    const formUrl = (state.formUrl || message.url || "").split(/[?#]/)[0];
    await jobflowCall(`/api/apply/${state.jobId}/applied`, { method: "POST", body: JSON.stringify({ confirmedBy: message.by, url: formUrl, fields }) });
  } catch (error) {
    return { ok: false, message: error.message };
  }
  const typed = message.typed?.length ? message.typed : state.typed;
  // Kept until saved or dismissed, so a reload of the thank-you page still offers it.
  Object.assign(state, { confirmed: true, typed });
  await save(tabKey(tabId), state);
  const queue = (await load("queue", [])).length;
  chrome.tabs.sendMessage(tabId, { type: "bar", state: { confirmed: true, typed, queue } }, { frameId: 0 }).catch(() => null);
  return { ok: true, typed };
}

chrome.tabs.onUpdated.addListener((tabId, info) => {
  if (info.status === "complete") inject(tabId);
});

// A tab closed before the application was sent: the job keeps waiting.
chrome.tabs.onRemoved.addListener(async (tabId) => {
  const state = await load(tabKey(tabId), null);
  if (!state) return;
  await chrome.storage.session.remove(tabKey(tabId));
  if (state.confirmed) return;
  const left = state.reported ? JSON.parse(state.reported) : [];
  await report(state.jobId, [...left.filter((reason) => !/^Form closed/.test(reason)), "Form closed before submitting"]);
});

// Requests are handled one at a time, so frames reporting together do not
// overwrite each other's state.
let chain = Promise.resolve();
const serial = (task) => (chain = chain.then(task, task));

chrome.runtime.onMessage.addListener((message, sender, reply) => {
  const tabId = sender.tab?.id;
  const handle = async () => {
    switch (message?.type) {
      // From the Offerbound app (through bridge.js).
      case "ping": {
        const { token, address } = await jobflowSettings();
        return { ok: true, version: chrome.runtime.getManifest().version, connected: Boolean(token) && address === message.origin };
      }
      // "Connect" in Offerbound's settings: the app's address and key, so the
      // user never pastes them.
      case "connect":
        if (!message.token || !/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(message.origin || "")) return { ok: false, message: "Open Offerbound on this computer to connect." };
        {
          // Once connected, only that same Offerbound can connect again, so no
          // other page on this computer can point the extension at itself.
          // Moving to another address is done by hand in the extension's settings.
          const { address: current } = await chrome.storage.local.get("address");
          if (current && current !== message.origin) {
            return { ok: false, message: `The extension is connected to ${current}. To switch, change the address in the extension's Settings.` };
          }
          // The same Offerbound again (a new key): no need to ask.
          if (current === message.origin) {
            await chrome.storage.local.set({ token: message.token });
            return { ok: true, message: "Connected." };
          }
        }
        // The first connection is confirmed by the user in the extension's
        // own window, so no other page on this computer can claim it.
        await save("pendingConnect", { origin: message.origin, token: message.token });
        await chrome.windows.create({ url: chrome.runtime.getURL("connect.html"), type: "popup", width: 420, height: 300 });
        return { ok: true, pending: true, message: "Confirm in the small Offerbound window that just opened." };
      case "confirmConnect": {
        // Only the extension's own connect.html may confirm.
        if (sender.url !== chrome.runtime.getURL("connect.html")) return { ok: false, message: "Not allowed." };
        const pending = await load("pendingConnect", null);
        await chrome.storage.session.remove("pendingConnect");
        if (!pending || !message.allow) return { ok: true, message: "Not connected." };
        await chrome.storage.local.set({ address: pending.origin, token: pending.token });
        return { ok: true, message: "Connected." };
      }
      case "pendingConnect": {
        if (sender.url !== chrome.runtime.getURL("connect.html")) return { ok: false };
        return { ok: true, pending: await load("pendingConnect", null) };
      }
      case "apply": {
        const ids = [...new Set((message.jobIds || []).map(Number).filter(Boolean))];
        if (!ids.length) return { ok: false, message: "No job to apply for." };
        await save("queue", ids);
        return openNext();
      }
      // From an application tab (apply.js).
      case "report":
        await onReport(tabId, sender.frameId, message);
        return { ok: true };
      case "attempt": {
        const state = await load(tabKey(tabId), null);
        if (state) await save(tabKey(tabId), { ...state, attemptAt: Date.now(), fields: message.fields, typed: message.typed, formUrl: message.url });
        return { ok: true };
      }
      case "submitted":
        return onSubmitted(tabId, message);
      case "saveFacts":
        try {
          const saved = await jobflowCall("/api/facts", { method: "POST", body: JSON.stringify({ facts: message.facts || [] }) });
          const state = await load(tabKey(tabId), null);
          if (state) await save(tabKey(tabId), { ...state, typed: [] });
          return saved;
        } catch (error) {
          return { ok: false, message: error.message };
        }
      case "next":
        return openNext();
      case "skip": {
        const state = await load(tabKey(tabId), null);
        if (state) await report(state.jobId, [...(state.reported ? JSON.parse(state.reported) : []), "Skipped in the apply session"]);
        return openNext();
      }
      default:
        return { ok: false, message: "Unknown request." };
    }
  };
  // Opening the next form waits for nothing else; the rest is serialised.
  const run = ["apply", "next", "skip", "ping"].includes(message?.type) ? handle() : serial(handle);
  run.then(reply, (error) => reply({ ok: false, message: error.message }));
  return true;
});
