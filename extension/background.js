// The Offerbound extension's background worker: opens application forms for
// ready jobs (one after another in an apply session), fills them on every
// page load, keeps the app told what is left for the user, and records the
// application when the user's submit is confirmed. It never submits. It also
// reads new Gmail for replies, and opens emails in Gmail for the user to send.
// Chrome runs this as a service worker and loads common.js here; Firefox
// loads both files as background scripts (see manifest.json).
if (typeof jobflowCall === "undefined") importScripts("common.js");

const GROUP_TITLE = "Offerbound applications";

// Tab state lives in session storage, so it survives the worker sleeping.
const load = async (key, fallback) => (await chrome.storage.session.get(key))[key] ?? fallback;
const save = (key, value) => chrome.storage.session.set({ [key]: value });
const tabKey = (tabId) => `tab:${tabId}`;
const packKey = (jobId) => `pack:${jobId}`;

// Application systems whose forms sit on their own domain, often inside a
// company's careers page. Filling is allowed in frames and tabs on these
// hosts and on the form's own origin, nowhere else.
const ATS_HOSTS =
  /(^|\.)(greenhouse\.io|lever\.co|workable\.com|ashbyhq\.com|smartrecruiters\.com|myworkdayjobs\.com|workday\.com|icims\.com|bamboohr\.com|jobvite\.com|taleo\.net|successfactors\.(com|eu)|recruitee\.com|personio\.(de|com)|teamtailor\.com|breezy\.hr|applytojob\.com|rippling\.com|comeet\.com|zohorecruit\.com|oraclecloud\.com|eightfold\.ai|phenom\.com|avature\.net)$/i;
const onFormSite = (url, formOrigin) => {
  try {
    const address = new URL(url);
    return address.origin === formOrigin || ATS_HOSTS.test(address.hostname);
  } catch {
    return false;
  }
};

// A message from a web page says which page sent it (bridge.js); the browser
// knows the real sender, and the two must agree. Once connected, only the
// connected Offerbound may ask for anything.
function senderOrigin(sender) {
  try {
    return sender.origin ?? new URL(sender.url).origin;
  } catch {
    return null;
  }
}
async function fromOfferbound(message, sender, { connected = true } = {}) {
  if (!message?.origin || senderOrigin(sender) !== message.origin) return false;
  if (!connected) return true;
  const { address } = await jobflowSettings();
  return message.origin === address;
}
const NOT_ALLOWED = { ok: false, message: "Only your connected Offerbound can ask the extension to do this." };

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
  await save(tabKey(tab.id), { jobId, formOrigin: new URL(target.url).origin, frames: {}, attemptAt: null, fields: [], typed: [], confirmed: false });
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

// Fills the page after every load, while the tab is on the form's site (not
// a sign-in page it was sent to, not an address the user typed), in the
// frames on that site or on a known application system.
async function inject(tabId) {
  const state = await load(tabKey(tabId), null);
  if (!state) return;
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  if (!tab || !onFormSite(tab.url, state.formOrigin)) return;
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
      args: [{ pack, queue, formOrigin: state.formOrigin, atsHosts: ATS_HOSTS.source, attemptAt: state.attemptAt, fields: state.fields, typed: state.typed, confirmed: state.confirmed, filled: state.filled || 0, files: state.files || 0 }],
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
  // The pack (facts, documents) is not needed any more.
  await chrome.storage.session.remove(packKey(state.jobId));
  const queue = (await load("queue", [])).length;
  chrome.tabs.sendMessage(tabId, { type: "bar", state: { confirmed: true, typed, queue } }, { frameId: 0 }).catch(() => null);
  return { ok: true, typed };
}

chrome.tabs.onUpdated.addListener((tabId, info) => {
  // In turn with the frames' reports, which read and write the same state.
  if (info.status === "complete") serial(() => inject(tabId));
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

// ---------- collecting jobs from sites that block automated access ----------

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
// Pauses between pages: a person's pace, not a crawler's.
const PAGE_PAUSE = 4000;
const LISTINGS_PER_SITE = 8;
let collecting = false;

// Loads a page in the collect tab and waits until it has finished loading.
function visit(tabId, url) {
  return new Promise((resolve) => {
    const done = () => {
      chrome.tabs.onUpdated.removeListener(listen);
      clearTimeout(timer);
      resolve();
    };
    const listen = (id, info) => {
      if (id === tabId && info.status === "complete") done();
    };
    const timer = setTimeout(done, 30000);
    chrome.tabs.onUpdated.addListener(listen);
    chrome.tabs.update(tabId, { url });
  });
}

async function read(tabId, func, args = []) {
  await chrome.scripting.executeScript({ target: { tabId }, files: ["collect.js"] });
  const [{ result } = {}] = await chrome.scripting.executeScript({ target: { tabId }, func, args });
  return result;
}

// One collect run: every planned search page of every enabled site, then the
// full text of the new jobs, in a minimized window of the user's browser.
async function collect(trigger = "manual") {
  if (collecting) return { ok: false, message: "Already collecting." };
  collecting = true;
  let windowId = null;
  try {
    const plan = await jobflowCall(`/api/collect/plan?trigger=${trigger}`);
    const created = [];
    const stopped = [];
    const win = await chrome.windows.create({ url: "about:blank", focused: false, state: "minimized" });
    windowId = win.id;
    const tabId = win.tabs[0].id;
    for (const site of plan.sites) {
      for (const page of site.pages) {
        await visit(tabId, page.url);
        await sleep(2500);
        let result;
        try {
          result = await read(tabId, (link) => globalThis.jobflowReadCards(link), [site.link]);
        } catch (error) {
          result = { blocked: `the page could not be read (${error.message})`, cards: [] };
        }
        const reply = await jobflowCall("/api/collect", {
          method: "POST",
          body: JSON.stringify({ runId: plan.runId, site: site.key, siteName: site.name, page, cards: result?.cards ?? [], blocked: result?.blocked ?? null }),
        });
        if (result?.blocked) {
          stopped.push(`${site.name}: ${result.blocked}`);
          break;
        }
        created.push(...reply.created.map((job) => ({ ...job, site: site.key })));
        await sleep(PAGE_PAUSE);
      }
    }
    // The full listing of each new job, a few per site.
    const perSite = new Map();
    for (const job of created) {
      const count = perSite.get(job.site) ?? 0;
      if (count >= LISTINGS_PER_SITE) continue;
      perSite.set(job.site, count + 1);
      await visit(tabId, job.url);
      await sleep(2000);
      const listing = await read(tabId, () => globalThis.jobflowReadListing()).catch(() => null);
      if (listing?.text) await jobflowCall("/api/collect/description", { method: "POST", body: JSON.stringify({ id: job.id, text: listing.text, postedAt: listing.postedAt }) }).catch(() => null);
      await sleep(PAGE_PAUSE);
    }
    const done = await jobflowCall("/api/collect/done", { method: "POST", body: JSON.stringify({ runId: plan.runId, created: created.length, stopped }) });
    return { ok: true, message: done.message };
  } catch (error) {
    return { ok: false, message: error.message };
  } finally {
    collecting = false;
    if (windowId !== null) chrome.windows.remove(windowId).catch(() => null);
  }
}

// ---------- is the listing still open, on sites only a browser can read ----------

// Offerbound checks most listings itself; Indeed refuses that, so the
// extension reads those listings in the user's own browser, in a minimized
// window at a person's pace, and stops at the first "are you a robot" page.
const LISTINGS_EVERY_MINUTES = 360;
let checkingListings = false;

async function checkListings(trigger = "manual") {
  if (checkingListings) return { ok: false, message: "Already checking listings." };
  checkingListings = true;
  let windowId = null;
  try {
    const plan = await jobflowCall(`/api/listings/browser?trigger=${trigger}`);
    if (!plan.jobs.length) return { ok: true, message: "No listings in your browser are due a check." };
    const counts = { open: 0, closed: 0, unsure: 0 };
    let stopped = "";
    const win = await chrome.windows.create({ url: "about:blank", focused: false, state: "minimized" });
    windowId = win.id;
    const tabId = win.tabs[0].id;
    for (const job of plan.jobs) {
      await visit(tabId, job.url);
      await sleep(2500);
      const page = await read(tabId, () => globalThis.jobflowReadPage()).catch((error) => ({ blocked: `the page could not be read (${error.message})` }));
      if (!page || page.blocked) {
        stopped = page?.blocked ?? "the page could not be read";
        break;
      }
      const reply = await jobflowCall("/api/listings/browser", {
        method: "POST",
        body: JSON.stringify({ runId: plan.runId, id: job.id, finalUrl: page.url, text: page.text, controls: page.controls }),
      }).catch(() => null);
      if (reply?.state in counts) counts[reply.state]++;
      await sleep(PAGE_PAUSE);
    }
    const done = await jobflowCall("/api/listings/browser/done", { method: "POST", body: JSON.stringify({ runId: plan.runId, ...counts, stopped }) });
    return { ok: true, message: done.message };
  } catch (error) {
    return { ok: false, message: error.message };
  } finally {
    checkingListings = false;
    if (windowId !== null) chrome.windows.remove(windowId).catch(() => null);
  }
}

// ---------- Gmail: replies to applications, and emails the user sends ----------

// Gmail's own feed of new (unread) inbox mail, read with the user's signed-in
// session in this browser. Offerbound keeps only the emails about applications.
const MAIL_EVERY_MINUTES = 15;
let mailChecking = false;

const decode = (text) =>
  text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&amp;/g, "&");
const rawTag = (xml, name) => (xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`)) || [])[1] || "";
const tag = (xml, name) => decode(rawTag(xml, name)).trim();

// The feed as plain data (the worker has no XML parser).
function parseFeed(xml) {
  const address = (tag(xml, "title").match(/[^\s<>]+@[^\s<>]+/) || [])[0] || null;
  const mails = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map(([, entry]) => {
    const author = rawTag(entry, "author");
    return {
      id: tag(entry, "id"),
      subject: tag(entry, "title"),
      summary: tag(entry, "summary"),
      at: tag(entry, "issued") || tag(entry, "modified"),
      link: decode((entry.match(/<link[^>]*href="([^"]*)"/) || [])[1] || ""),
      fromName: tag(author, "name"),
      fromEmail: tag(author, "email"),
    };
  });
  return { address, mails: mails.filter((mail) => mail.id) };
}

async function checkMail() {
  if (mailChecking) return { ok: false, message: "Already checking." };
  mailChecking = true;
  try {
    const plan = await jobflowCall("/api/mail");
    if (!plan.watch) return { ok: false, message: "Watching Gmail is off: turn it on in Offerbound → Settings → Email." };
    let response;
    try {
      response = await fetch(`https://mail.google.com/mail/u/${Number(plan.account) || 0}/feed/atom`, { credentials: "include", cache: "no-store" });
    } catch {
      response = null;
    }
    const xml = response?.ok ? await response.text() : "";
    if (!xml.includes("<feed")) {
      const error = response?.status === 401 || response?.ok ? "Not signed in to Gmail in this browser, or no Gmail account with that number. Open Gmail here once." : "Gmail could not be reached.";
      await jobflowCall("/api/mail", { method: "POST", body: JSON.stringify({ error }) });
      return { ok: false, message: error };
    }
    const { address, mails } = parseFeed(xml);
    return await jobflowCall("/api/mail", { method: "POST", body: JSON.stringify({ address, mails }) });
  } catch (error) {
    return { ok: false, message: error.message };
  } finally {
    mailChecking = false;
  }
}

// One alarm, made once (making it again would restart its countdown each
// time the worker wakes).
async function ensureMailAlarm() {
  if (!chrome.alarms) return;
  if (!(await chrome.alarms.get("mail"))) chrome.alarms.create("mail", { delayInMinutes: 1, periodInMinutes: MAIL_EVERY_MINUTES });
  if (!(await chrome.alarms.get("listings"))) chrome.alarms.create("listings", { delayInMinutes: 10, periodInMinutes: LISTINGS_EVERY_MINUTES });
}
ensureMailAlarm();
chrome.alarms?.onAlarm.addListener((alarm) => {
  if (alarm.name === "mail") checkMail();
  if (alarm.name === "listings") checkListings("timer");
});

// Emails the user sends: Offerbound opens Gmail's compose window filled in,
// and records the email as sent once the user presses Send there.
const composeKey = (tabId) => `compose:${tabId}`;
// The compose address rebuilt from its parts: Gmail's compose window in one
// signed-in account, with only the recipient, subject and text (no other
// Gmail parameters, such as copies to other addresses, pass through).
function gmailCompose(url) {
  let given;
  try {
    given = new URL(url);
  } catch {
    return null;
  }
  const account = given.pathname.match(/^\/mail\/u\/(\d)\/$/)?.[1];
  if (given.protocol !== "https:" || given.hostname !== "mail.google.com" || given.port || given.username || given.password || !account) return null;
  if (given.searchParams.get("view") !== "cm" || [...given.searchParams.keys()].some((key) => !["view", "fs", "to", "su", "body"].includes(key))) return null;
  const to = given.searchParams.get("to") || "";
  if (to && !/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(to)) return null;
  const clean = new URLSearchParams({ view: "cm", fs: "1", to, su: (given.searchParams.get("su") || "").slice(0, 300), body: (given.searchParams.get("body") || "").slice(0, 6000) });
  return { url: `https://mail.google.com/mail/u/${account}/?${clean}`, to };
}

async function compose(payload, origin) {
  const { address } = await jobflowSettings();
  if (origin !== address) return { ok: false, message: "Only your connected Offerbound can open emails." };
  const jobId = Number(payload?.jobId);
  const email = gmailCompose(payload?.url || "");
  if (!Number.isInteger(jobId) || jobId <= 0 || !email) return { ok: false, message: "This is not an email Offerbound can open." };
  const tab = await chrome.tabs.create({ url: email.url, active: true });
  await save(composeKey(tab.id), { jobId, kind: payload.kind === "application" ? "application" : "follow_up", to: email.to, pressedAt: null, done: false });
  return { ok: true, message: "Opened in Gmail. Check it, attach anything listed, and press Send there." };
}

async function composeSent(tabId) {
  const state = await load(composeKey(tabId), null);
  if (!state || state.done) return;
  await save(composeKey(tabId), { ...state, done: true });
  await jobflowCall("/api/mail/sent", { method: "POST", body: JSON.stringify({ jobId: state.jobId, kind: state.kind, to: state.to }) }).catch(() => null);
}

// Send pressed shortly before: leaving the compose window means it went.
const justPressed = (state) => state?.pressedAt && Date.now() - state.pressedAt < 60000;

chrome.tabs.onUpdated.addListener(async (tabId, info, tab) => {
  const state = await load(composeKey(tabId), null);
  if (!state || state.done) return;
  const url = info.url || tab.url || "";
  if (info.url && !url.includes("view=cm") && justPressed(state)) return composeSent(tabId);
  if (info.status === "complete" && url.includes("view=cm")) {
    chrome.scripting.executeScript({ target: { tabId }, files: ["compose-watch.js"] }).catch(() => null);
  }
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  const state = await load(composeKey(tabId), null);
  if (!state) return;
  if (!state.done && justPressed(state)) await composeSent(tabId);
  await chrome.storage.session.remove(composeKey(tabId));
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
        if (!(await fromOfferbound(message, sender, { connected: false }))) return NOT_ALLOWED;
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
        // own window, so no other page on this computer can claim it. The
        // window answers with the request's own number, so what the user
        // confirms is what the window showed, and a request waiting for an
        // answer (two minutes) cannot be swapped by another page meanwhile.
        {
          const waiting = await load("pendingConnect", null);
          if (waiting && Date.now() - waiting.at < 2 * 60000 && waiting.origin !== message.origin) {
            return { ok: false, message: "Another connection is waiting for your answer in the small Offerbound window." };
          }
        }
        await save("pendingConnect", { origin: message.origin, token: message.token, nonce: crypto.randomUUID(), at: Date.now() });
        await chrome.windows.create({ url: chrome.runtime.getURL("connect.html"), type: "popup", width: 420, height: 300 });
        return { ok: true, pending: true, message: "Confirm in the small Offerbound window that just opened." };
      case "confirmConnect": {
        // Only the extension's own connect.html may confirm, and only the
        // request it showed.
        if (sender.url !== chrome.runtime.getURL("connect.html")) return { ok: false, message: "Not allowed." };
        const pending = await load("pendingConnect", null);
        await chrome.storage.session.remove("pendingConnect");
        if (!pending || !message.allow || message.nonce !== pending.nonce) return { ok: true, message: "Not connected." };
        await chrome.storage.local.set({ address: pending.origin, token: pending.token });
        return { ok: true, message: "Connected." };
      }
      case "pendingConnect": {
        if (sender.url !== chrome.runtime.getURL("connect.html")) return { ok: false };
        return { ok: true, pending: await load("pendingConnect", null) };
      }
      case "collect":
        // Runs for a few minutes: answer now, progress shows on Activity.
        if (!(await fromOfferbound(message, sender))) return NOT_ALLOWED;
        if (collecting) return { ok: false, message: "Already collecting." };
        collect(message.trigger === "timer" ? "timer" : "manual");
        return { ok: true, message: "Collecting in your browser, in a minimized window. Follow it on Activity." };
      case "checkMail":
        if (!(await fromOfferbound(message, sender))) return NOT_ALLOWED;
        return checkMail();
      case "compose":
        if (!(await fromOfferbound(message, sender))) return NOT_ALLOWED;
        return compose(message.payload, message.origin);
      case "checkListings": {
        // Runs for a minute or two: answer now, progress shows on Activity.
        if (!(await fromOfferbound(message, sender))) return NOT_ALLOWED;
        if (checkingListings) return { ok: false, message: "Already checking listings." };
        checkListings("manual");
        return { ok: true, message: "Checking Indeed listings in your browser, in a minimized window." };
      }
      // From a Gmail compose window Offerbound opened (compose-watch.js).
      case "composeSend": {
        const state = await load(composeKey(tabId), null);
        if (state && !state.done) await save(composeKey(tabId), { ...state, pressedAt: Date.now() });
        return { ok: true };
      }
      case "composeSent":
        await composeSent(tabId);
        return { ok: true };
      case "apply": {
        if (!(await fromOfferbound(message, sender))) return NOT_ALLOWED;
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
        if (state) await chrome.storage.session.remove(packKey(state.jobId));
        return openNext();
      }
      default:
        return { ok: false, message: "Unknown request." };
    }
  };
  // Opening the next form waits for nothing else; the rest is serialised.
  const run = ["apply", "next", "skip", "ping", "collect", "checkMail", "compose", "checkListings"].includes(message?.type) ? handle() : serial(handle);
  run.then(reply, (error) => reply({ ok: false, message: error.message }));
  return true;
});
