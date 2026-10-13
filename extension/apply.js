// Runs in every frame of a tab the extension opened to apply for a job.
// Fills the form (fill.js) and fills again when the next step appears,
// reports what it could not fill, shows the Jobflow bar in the top frame,
// and notices when the user's submit is confirmed by the page. It never
// presses Submit or any other button.
(() => {
  if (globalThis.jobflowApplyStart) return;
  const isTop = window === window.top;
  const norm = (text) => (text || "").replace(/\s+/g, " ").trim().toLowerCase();
  const send = (message) => chrome.runtime.sendMessage(message).catch(() => null);

  // ---------- what the page says ----------

  const CONFIRMED = /application (has been |was )?(submitted|received|sent|complete)|thank(s| you) for (applying|your application|your interest)|we('ve| have) received your application|successfully (applied|submitted)|başvurunuz (alınmıştır|alındı|tamamlandı|iletildi|başarıyla)|başvurunuz için teşekkür|başvuru(nuz)? (başarıyla )?(gönderildi|tamamlandı)|تم (استلام|إرسال|تقديم) (طلبك|طلبكم)|شكرا (لك )?(على|ل)(تقديم|التقديم)/i;
  const CONFIRMED_URL = /thank|confirmation|success|submitted|applied|tesekkur|basvuru-tamam/i;
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
      // Typed by the user (not filled by Jobflow), short, and reusable: a
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
    bar.innerHTML = `
      <style>
        .card { font: 13px/1.45 system-ui, sans-serif; color: #1b2433; background: #fff; width: 320px; max-height: 60vh; overflow: auto; border-radius: 10px; box-shadow: 0 8px 30px rgb(18 32 58 / 0.28); border: 1px solid #d9dee7; }
        header { display: flex; align-items: center; gap: 8px; padding: 8px 12px; background: #12203a; color: #fff; border-radius: 10px 10px 0 0; }
        header b { display: grid; place-items: center; width: 20px; height: 20px; border-radius: 4px; background: #e63946; font-size: 12px; }
        header span { flex: 1; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        header button { background: none; border: 0; color: #c9d1de; cursor: pointer; font: inherit; text-decoration: underline; padding: 0; }
        main { padding: 10px 12px 12px; }
        p { margin: 0 0 6px; }
        ul { margin: 4px 0 8px; padding-left: 18px; }
        li { margin: 2px 0; }
        .need { color: #8a5a00; font-weight: 600; }
        .ok { color: #1d7a46; font-weight: 600; }
        .row { display: flex; gap: 6px; align-items: flex-start; margin: 4px 0; }
        .actions { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 8px; }
        .actions button { flex: 1; padding: 7px 8px; border-radius: 6px; font: inherit; font-weight: 600; cursor: pointer; border: 1px solid #d9dee7; background: #fff; color: #1b2433; }
        .actions button.main { background: #ffc20e; border-color: #ffc20e; color: #12203a; }
        .hint { color: #5b6576; font-size: 12px; }
        .min main { display: none; }
      </style>
      <div class="card ${s.min ? "min" : ""}" role="region" aria-label="Jobflow">
        <header><b>J</b><span>${escapeHtml(s.title || "Jobflow")}</span><button data-act="min">${s.min ? "Show" : "Hide"}</button></header>
        <main>
          ${
            s.confirmed
              ? `<p class="ok">Applied ✓ Recorded in Jobflow.</p>
                 ${typed ? `<p>Save what you typed, so the next forms fill it?</p>${typed}<div class="actions"><button class="main" data-act="save">Save for next time</button></div>` : ""}
                 ${s.message ? `<p class="hint">${escapeHtml(s.message)}</p>` : ""}
                 <div class="actions">${s.queue ? `<button class="main" data-act="next">Next job (${s.queue} left)</button>` : ""}</div>`
              : `<p>Filled ${s.filled} ${s.filled === 1 ? "field" : "fields"}${s.files ? ` and ${s.files} ${s.files === 1 ? "file" : "files"}` : ""}.</p>
                 ${s.reasons.length ? `<p class="need">${s.reasons.length} ${s.reasons.length === 1 ? "thing needs" : "things need"} you (yellow on the form):</p><ul>${items}</ul>` : `<p class="ok">Nothing left: check the form and submit it.</p>`}
                 <p class="hint">Jobflow never presses Submit. When you submit, it records the application.</p>
                 ${s.message ? `<p class="hint">${escapeHtml(s.message)}</p>` : ""}
                 <div class="actions"><button data-act="submitted">I submitted it</button>${s.queue ? `<button data-act="skip">Skip to next</button>` : ""}</div>`
          }
        </main>
      </div>`;
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
      else barState.message = reply?.message || "Could not reach Jobflow.";
    }
    if (act === "save") {
      const chosen = [...bar.querySelectorAll("input[data-i]:checked")].map((box) => barState.typed[Number(box.dataset.i)]);
      const reply = await send({ type: "saveFacts", facts: chosen });
      Object.assign(barState, { typed: [], message: reply?.message || "Could not reach Jobflow." });
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
