// Runs in every frame of a tab the extension opened to apply for a job.
// Fills the form (fill.js) and fills again when the next step appears,
// reports what it could not fill, shows the Offerbound bar in the top frame,
// and notices when the user's submit is confirmed by the page. It never
// presses Submit or any other button.
(() => {
  if (globalThis.jobflowApplyStart) return;
  const isTop = window === window.top;
  const norm = (text) => (text || "").replace(/\s+/g, " ").trim().toLowerCase();
  const send = (message) => chrome.runtime.sendMessage(message).catch(() => null);

  // ---------- what the page says ----------

  // Only words a site uses once an application is in. "Thanks for your
  // interest" is said on sign-in and newsletter pages too, so it is not one.
  const CONFIRMED = /application (has been |was )?(submitted|received|sent|complete)|thank(s| you) for (applying|your application)|we('ve| have) received your application|successfully (applied|submitted)|başvurunuz (alınmıştır|alındı|tamamlandı|iletildi|başarıyla)|başvurunuz için teşekkür|başvuru(nuz)? (başarıyla )?(gönderildi|tamamlandı)|تم (استلام|إرسال|تقديم) (طلبك|طلبكم)|شكرا (لك )?(على|ل)(تقديم|التقديم)/i;
  // A whole path segment, so /jobs/applied-scientist is not a thank-you page.
  const CONFIRMED_URL = /(^|\/)(thank-?you|thanks|confirmation|success|submitted|applied|tesekkur(ler)?|basvuru-tamam)(\/|$)/i;
  const CLOSED = /no longer accepting|no longer available|this (job|position) (is|has been) (closed|filled|expired)|position has been filled|job (has )?expired|ilan(ın)? (yayından kaldırıl|süresi dol)|bu ilan (artık )?(yayında değil|aktif değil)|başvuruya kapa/i;
  const CAPTCHA = 'iframe[src*="recaptcha"], iframe[src*="hcaptcha"], iframe[src*="challenges.cloudflare.com"], .g-recaptcha, .h-captcha, .cf-turnstile';
  const SUBMIT = /\b(submit|send|apply|finish|complete)\b|gönder|başvur|tamamla|bitir|إرسال|تقديم/i;
  const NOT_SUBMIT = /\b(next|continue|back|previous|save (for later|draft|and continue)|upload|add|remove|cancel|edit)\b|ileri|devam|geri|sonraki|önceki|kaydet|ekle|sil|iptal|التالي|السابق/i;

  const visible = (element) => {
    if (!element || !element.isConnected) return false;
    const box = element.getBoundingClientRect();
    return box.width > 0 && box.height > 0 && getComputedStyle(element).visibility !== "hidden";
  };
  const pageText = () => norm(document.body?.innerText || "").slice(0, 60000);
  const confirmedNow = () => CONFIRMED.test(pageText());
  const formFields = () =>
    [...document.querySelectorAll("input, textarea, select")].filter(
      (element) => !["hidden", "submit", "button", "reset", "image", "search"].includes((element.type || "").toLowerCase()) && (visible(element) || element.type === "file"),
    );
  const errorsShown = () =>
    [...document.querySelectorAll('[aria-invalid="true"], [role="alert"], .error, .errors, .invalid-feedback, .field-error')].some(
      (element) => visible(element) && (element.matches('[aria-invalid="true"]') || norm(element.innerText).length > 2),
    );

  // Problems that stop filling before it starts, in the top frame.
  function blockers() {
    const found = [];
    if (CLOSED.test(pageText())) found.push("Posting closed");
    if ([...document.querySelectorAll(CAPTCHA)].some(visible)) found.push(`Captcha on ${location.hostname}: solve it yourself`);
    const fields = formFields();
    if (fields.some((element) => element.type === "password") && fields.filter((element) => element.type !== "password").length <= 2) found.push(`Log in to ${location.hostname} yourself`);
    return found;
  }

  // The fields with a value, as the user would read them, for the record of
  // what was sent. Passwords and consent boxes are never recorded.
  function snapshot() {
    const filledBefore = globalThis.__jobflowFilled || new WeakSet();
    const fields = [];
    const typed = [];
    const seenRadio = new Set();
    // Every step of the form, including the ones hidden now.
    const all = [...document.querySelectorAll("input, textarea, select")].filter((element) => !["hidden", "submit", "button", "reset", "image", "search"].includes((element.type || "").toLowerCase()));
    for (const element of all) {
      const type = (element.type || "").toLowerCase();
      if (type === "password") continue;
      const label = labelFor(element);
      if (!label) continue;
      let value = "";
      if (type === "file") value = [...(element.files || [])].map((file) => file.name).join(", ");
      else if (type === "radio") {
        if (seenRadio.has(element.name) || !element.checked) continue;
        seenRadio.add(element.name);
        value = norm(element.labels?.[0]?.innerText || element.value);
      } else if (type === "checkbox") {
        if (!element.checked || /agree|consent|terms|privacy|kvkk|onay|aydınlatma/i.test(label)) continue;
        value = "Yes";
      } else if (element instanceof HTMLSelectElement) value = element.selectedIndex > 0 ? element.options[element.selectedIndex].text.trim() : "";
      else value = element.value.trim();
      if (!value) continue;
      fields.push({ label, value });
      // Typed by the user (not filled by Offerbound), short, and reusable: a
      // candidate for "save for next time".
      const own = !filledBefore.has(element) && !(type === "radio" && [...document.querySelectorAll(`input[name="${CSS.escape(element.name)}"]`)].some((radio) => filledBefore.has(radio)));
      if (own && type !== "file" && !(element instanceof HTMLTextAreaElement) && value.length <= 120 && !/e-?mail|phone|name|surname|ad soyad|password|şifre/i.test(label)) typed.push({ label, value });
    }
    return { fields, typed };
  }

  function labelFor(element) {
    const parts = [];
    for (const label of element.labels || []) parts.push(label.innerText);
    if (element.getAttribute("aria-label")) parts.push(element.getAttribute("aria-label"));
    if (!parts.length && element.type === "radio") parts.push(element.closest("fieldset")?.querySelector("legend")?.innerText || "");
    if (!parts.length && element.placeholder) parts.push(element.placeholder);
    if (!parts.length) parts.push(element.name || element.id || "");
    return (parts.join(" ").replace(/\s+/g, " ").replace(/\s*\*\s*$/, "").trim()).slice(0, 200);
  }

  // ---------- the bar (top frame) ----------

  let bar = null;
  let barState = { title: "", reasons: [], filled: 0, files: 0, confirmed: false, typed: [], queue: 0, message: "" };

  function renderBar() {
    if (!isTop) return;
    if (!bar) {
      const host = document.createElement("div");
      host.id = "jobflow-bar";
      host.style.cssText = "all: initial; position: fixed; z-index: 2147483647; right: 16px; bottom: 16px;";
      bar = host.attachShadow({ mode: "open" });
      document.documentElement.append(host);
    }
    const s = barState;
    const items = s.reasons.map((reason) => `<li>${escapeHtml(reason)}</li>`).join("");
    const typed = s.typed.map((field, index) => `<label class="row"><input type="checkbox" data-i="${index}" checked> <span><b>${escapeHtml(field.label)}</b>: ${escapeHtml(field.value)}</span></label>`).join("");
    const mark = `<svg viewBox="0 0 64 64" width="20" height="20" aria-hidden="true"><rect width="64" height="64" rx="14" fill="#ffc20e"/><path d="M0 32h64" stroke="#12203a" stroke-width="2.5"/><path d="M20 44 44 20M28 20h16v16" fill="none" stroke="#12203a" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    const need = s.reasons.length;
    const summary = s.confirmed ? "Applied ✓" : need ? `${need} ${need === 1 ? "thing needs" : "things need"} you` : "Ready to submit";
    const progress = `<span class="chip">${s.filled} ${s.filled === 1 ? "field" : "fields"} filled</span>${s.files ? `<span class="chip">${s.files} ${s.files === 1 ? "file" : "files"} attached</span>` : ""}${s.queue ? `<span class="chip">${s.queue} more ${s.queue === 1 ? "job" : "jobs"} after this</span>` : ""}`;
    bar.innerHTML = `
      <style>
        :host { all: initial; }
        .card {
          --card: #ffffff; --ink: #12203a; --muted: #5a6578; --line: #d7dde6; --soft: #f5f7fa; --focus: #1d5fa8;
          --go: #1d7a46; --go-soft: #e7f4ec; --wait: #8a5a00; --wait-soft: #fff6db;
          font: 13px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif; color: var(--ink); background: var(--card);
          width: 330px; max-width: calc(100vw - 32px); max-height: 70vh; overflow: auto; border-radius: 14px;
          box-shadow: 0 12px 36px rgb(18 32 58 / 0.3); border: 1px solid var(--line);
        }
        @media (prefers-color-scheme: dark) {
          .card { --card: #16223a; --ink: #e8edf5; --muted: #a3afc2; --line: #2b3a55; --soft: #1b2944; --focus: #7fb2ee; --go: #6fd39b; --go-soft: #15362a; --wait: #ffd36b; --wait-soft: #3a3016; }
        }
        header { display: flex; align-items: center; gap: 8px; padding: 9px 10px 9px 12px; background: #12203a; color: #fff; }
        header .title { flex: 1; min-width: 0; }
        header .job { display: block; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        header .state { display: block; font-size: 11px; color: #c9d1de; }
        .icon { display: grid; place-items: center; width: 28px; height: 28px; padding: 0; border: 0; border-radius: 6px; background: transparent; color: #d6dde9; cursor: pointer; font: 600 16px/1 system-ui, sans-serif; }
        .icon:hover { background: rgb(255 255 255 / 0.12); color: #fff; }
        main { padding: 12px; display: grid; gap: 10px; }
        p { margin: 0; }
        .chips { display: flex; flex-wrap: wrap; gap: 6px; }
        .chip { padding: 2px 8px; border-radius: 999px; background: var(--soft); border: 1px solid var(--line); font-size: 12px; }
        .callout { padding: 9px 10px; border-radius: 10px; }
        .callout.need { background: var(--wait-soft); color: var(--wait); }
        .callout.ok { background: var(--go-soft); color: var(--go); }
        .callout b { display: block; margin-bottom: 2px; }
        ul { margin: 4px 0 0; padding-left: 18px; }
        li + li { margin-top: 2px; }
        .row { display: flex; gap: 8px; align-items: flex-start; padding: 6px 8px; border-radius: 8px; background: var(--soft); }
        .row + .row { margin-top: 4px; }
        .actions { display: flex; gap: 8px; flex-wrap: wrap; }
        .actions button { flex: 1; min-width: 120px; padding: 8px 10px; border-radius: 8px; font: inherit; font-weight: 600; cursor: pointer; border: 1px solid var(--line); background: transparent; color: var(--ink); }
        .actions button:hover { background: var(--soft); }
        .actions button.main { background: #ffc20e; border-color: #ffc20e; color: #12203a; }
        button:focus-visible, input:focus-visible { outline: 3px solid var(--focus); outline-offset: 2px; }
        .hint { color: var(--muted); font-size: 12px; }
        .pill { display: flex; align-items: center; gap: 8px; padding: 7px 8px 7px 10px; border: 0; border-radius: 999px; background: #12203a; color: #fff; font: 600 13px/1.2 system-ui, sans-serif; cursor: pointer; box-shadow: 0 8px 24px rgb(18 32 58 / 0.35); }
        .pill .count { padding: 2px 8px; border-radius: 999px; background: #ffc20e; color: #12203a; }
      </style>
      ${
        s.min
          ? `<button class="pill" data-act="min" aria-label="Show the Offerbound panel">${mark}<span>Offerbound</span><span class="count">${escapeHtml(summary)}</span></button>`
          : `<div class="card" role="region" aria-label="Offerbound">
        <header>${mark}<span class="title"><span class="job">${escapeHtml(s.title || "Offerbound")}</span><span class="state">${escapeHtml(summary)}</span></span><button class="icon" data-act="min" title="Hide" aria-label="Hide the Offerbound panel">–</button></header>
        <main>
          ${
            s.confirmed
              ? `<div class="callout ok"><b>Applied ✓</b>Recorded in Offerbound.</div>
                 ${typed ? `<div><p style="margin-bottom:6px">Save what you typed, so the next forms fill it?</p>${typed}</div><div class="actions"><button class="${s.queue ? "" : "main"}" data-act="save">Save for next time</button></div>` : ""}
                 ${s.message ? `<p class="hint">${escapeHtml(s.message)}</p>` : ""}
                 ${s.queue ? `<div class="actions"><button class="main" data-act="next">Next job (${s.queue} left)</button></div>` : ""}`
              : `<div class="chips">${progress}</div>
                 ${need ? `<div class="callout need"><b>Needs you (yellow on the form)</b><ul>${items}</ul></div>` : `<div class="callout ok"><b>Nothing left to fill</b>Check the form, then submit it yourself.</div>`}
                 ${s.message ? `<p class="hint">${escapeHtml(s.message)}</p>` : ""}
                 <div class="actions"><button data-act="submitted">I submitted it</button>${s.queue ? `<button data-act="skip">Skip this job</button>` : ""}</div>
                 <p class="hint">Offerbound never presses Submit. When you submit, it records the application.</p>`
          }
        </main>
      </div>`
      }`;
    bar.querySelectorAll("button[data-act]").forEach((button) => button.addEventListener("click", (event) => onBar(event, button.dataset.act)));
  }

  const escapeHtml = (text) => String(text).replace(/[&<>"']/g, (character) => `&#${character.charCodeAt(0)};`);

  async function onBar(event, act) {
    event.stopPropagation();
    if (act === "min") barState.min = !barState.min;
    if (act === "submitted") {
      const { fields, typed } = snapshot();
      const reply = await send({ type: "submitted", by: "user", url: location.href, fields, typed });
      if (reply?.ok) Object.assign(barState, { confirmed: true, typed: reply.typed ?? typed, message: "" });
      else barState.message = reply?.message || "Could not reach Offerbound.";
    }
    if (act === "save") {
      const chosen = [...bar.querySelectorAll("input[data-i]:checked")].map((box) => barState.typed[Number(box.dataset.i)]);
      const reply = await send({ type: "saveFacts", facts: chosen });
      Object.assign(barState, { typed: [], message: reply?.message || "Could not reach Offerbound." });
    }
    if (act === "next") send({ type: "next" });
    if (act === "skip") send({ type: "skip" });
    renderBar();
  }

  // ---------- filling and the submit ----------

  let pack = null;
  let attemptTimer = null;

  function run() {
    if (!pack || barState.confirmed) return;
    const report = globalThis.jobflowFill(pack);
    const stops = isTop ? blockers() : [];
    send({ type: "report", filled: report.filled.length, files: report.files.length, left: [...stops, ...report.left], fields: formFields().length });
  }

  // A press on something that sends the form. With a filled form, the form
  // disappearing without an error counts as sent; a one-click apply (no
  // form) counts only when the page says so.
  function onAttempt() {
    const { fields, typed } = snapshot();
    const withForm = fields.length >= 2;
    if (withForm) send({ type: "attempt", url: location.href, fields, typed });
    clearTimeout(attemptTimer);
    const formsBefore = [...document.querySelectorAll("form")].filter(visible).length;
    const saidBefore = confirmedNow();
    let tries = 0;
    const check = () => {
      tries += 1;
      const formsGone = withForm && formsBefore > 0 && [...document.querySelectorAll("form")].filter(visible).length < formsBefore && formFields().length < 2;
      if ((!saidBefore && confirmedNow()) || (formsGone && !errorsShown())) {
        send({ type: "submitted", by: "page", url: location.href, fields, typed });
        return;
      }
      if (tries < 6) attemptTimer = setTimeout(check, 1500);
    };
    attemptTimer = setTimeout(check, 1500);
  }

  document.addEventListener("submit", onAttempt, true);
  document.addEventListener(
    "click",
    (event) => {
      const target = event.target instanceof Element ? event.target.closest('button, input[type="submit"], [role="button"], a') : null;
      if (!target || target.closest("#jobflow-bar")) return;
      const text = norm(target.innerText || target.value || target.getAttribute("aria-label") || "");
      if (text.length > 40 || NOT_SUBMIT.test(text)) return;
      if (SUBMIT.test(text) || (target.type === "submit" && text)) onAttempt();
    },
    true,
  );

  // The next step of a form, or fields that load late, get filled too: new
  // elements, steps shown by class or hidden, and anything after a click
  // (a "Next" button). Style changes are not watched: the filler's own
  // highlights are styles.
  let pending = null;
  const later = () => {
    clearTimeout(pending);
    pending = setTimeout(run, 700);
  };
  new MutationObserver(later).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "hidden", "aria-hidden", "open"] });
  document.addEventListener("click", later, true);

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === "bar" && isTop) {
      Object.assign(barState, message.state);
      renderBar();
    }
  });

  // Called by the background worker after each page load.
  globalThis.jobflowApplyStart = (context) => {
    // A frame from elsewhere (a chat widget, an ad) gets nothing: only the
    // form's own site and known application systems are filled.
    if (!isTop && location.origin !== context.formOrigin && !(context.atsHosts && new RegExp(context.atsHosts, "i").test(location.hostname))) return;
    pack = context.pack;
    Object.assign(barState, { title: `${context.pack.job.title} · ${context.pack.job.company}`, queue: context.queue || 0, filled: context.filled || 0, files: context.files || 0 });
    // A page after the user's submit: the site's confirmation counts.
    if (isTop && context.attemptAt && Date.now() - context.attemptAt < 3 * 60000 && (confirmedNow() || CONFIRMED_URL.test(location.pathname))) {
      send({ type: "submitted", by: "page", url: location.href, fields: context.fields || [], typed: context.typed || [] });
      return;
    }
    if (context.confirmed) {
      Object.assign(barState, { confirmed: true, typed: context.typed || [] });
      renderBar();
      return;
    }
    run();
    renderBar();
  };
})();
