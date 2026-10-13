// Fills the application form on the current page from a Jobflow application
// pack. Loaded into the page by the popup or the background worker, then
// called as jobflowFill(pack); calling it again fills fields that appeared
// since (the next step of a form). It only fills empty fields it has not
// filled before and attaches files; it never clicks a button, never ticks
// consent boxes, and never submits. Required fields it cannot fill are
// reported with the reason, and kept in globalThis.__jobflowLeft.
(() => {
  const norm = (text) => (text || "").replace(/\s+/g, " ").trim().toLowerCase();

  // The words a person sees for a field: its label, aria label, placeholder,
  // the legend of its group, or the text just before it.
  function labelOf(element) {
    const parts = [];
    for (const label of element.labels || []) parts.push(label.innerText);
    if (element.getAttribute("aria-label")) parts.push(element.getAttribute("aria-label"));
    for (const id of (element.getAttribute("aria-labelledby") || "").split(/\s+/).filter(Boolean)) {
      const node = document.getElementById(id);
      if (node) parts.push(node.innerText);
    }
    if (element.placeholder) parts.push(element.placeholder);
    if (!parts.length) {
      const legend = element.closest("fieldset")?.querySelector("legend");
      if (legend) parts.push(legend.innerText);
    }
    if (!parts.length) {
      let node = element.previousElementSibling || element.parentElement?.previousElementSibling;
      if (node && node.innerText && node.innerText.length < 200) parts.push(node.innerText);
    }
    if (!parts.length) parts.push(element.name || element.id || "");
    return norm(parts.join(" "));
  }

  // The field's label as written on the page (labelOf lowercases it).
  function labelText(element) {
    const label = element.labels?.[0]?.innerText || element.getAttribute("aria-label") || element.placeholder || element.closest("fieldset")?.querySelector("legend")?.innerText || "";
    return label.replace(/\s+/g, " ").trim().slice(0, 160);
  }

  const required = (element, label) => element.required || element.getAttribute("aria-required") === "true" || /\*/.test(label);

  // Sets a value the way typing would, so sites built with React or Vue see it.
  function setValue(element, value) {
    const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, "value").set.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
    element.dispatchEvent(new Event("blur", { bubbles: true }));
  }

  // Green: filled by Jobflow. Amber: needs the user.
  const mark = (element, ok) => {
    element.style.outline = ok ? "2px solid #1d7a46" : "3px solid #f2a900";
    element.style.outlineOffset = "1px";
  };

  // Fields Jobflow filled once are left alone after that, even if the user
  // clears them.
  const filledBefore = (globalThis.__jobflowFilled ||= new WeakSet());

  // Why a required field was left: what the user sees in the app and on the bar.
  function reason(element, label) {
    const type = (element.type || "").toLowerCase();
    // As the form says it, without the required mark.
    const plain = (labelText(element) || label).replace(/\s*\*\s*$/, "").trim();
    const name = plain ? plain.charAt(0).toUpperCase() + plain.slice(1) : "A field without a label";
    if (type === "file") return `Upload: ${name}`;
    if (type === "checkbox") return `Tick yourself: ${name}`;
    if (element instanceof HTMLTextAreaElement || /\bwhy\b|motivat|describe|tell us|explain|neden|açıkla/.test(label)) return `Open question: ${name}`;
    return `Missing: ${name}`;
  }

  // Answers still waiting for a fact from the user are never pasted.
  const UNANSWERED = /not known yet|open question|fill this in|\btbd\b|to be confirmed/i;

  // Words that say what a question is about. Words every form question uses
  // ("this position", "your") would match unrelated questions.
  const COMMON = new Set("this that these your with about what when where which have from will would could should please position role company team here there job jobs their them they into than then also does done more most such very just only some much many work working bu şu için ile olan olarak".split(" "));
  const meaningful = (text) => text.split(/[^\p{L}\p{N}]+/u).filter((word) => word.length > 3 && !COMMON.has(word));

  // The answer whose question shares the most meaningful words with the field's label.
  function answerFor(label, answers, pattern) {
    const known = answers.filter((answer) => !UNANSWERED.test(answer.answer));
    if (pattern) {
      if (answers.some((answer) => pattern.test(norm(answer.question)) && UNANSWERED.test(answer.answer))) return null;
      const direct = known.find((answer) => pattern.test(norm(answer.question)));
      if (direct) return direct.answer;
    }
    answers = known;
    const words = new Set(meaningful(label));
    let best = null;
    let bestScore = 0;
    for (const answer of answers) {
      const questionWords = meaningful(norm(answer.question));
      if (!questionWords.length) continue;
      const shared = questionWords.filter((word) => words.has(word)).length / questionWords.length;
      if (shared > bestScore) {
        best = answer.answer;
        bestScore = shared;
      }
    }
    return bestScore >= 0.5 ? best : null;
  }

  // Yes or no, from an answer, for the question a field asks.
  function yesNo(label, answer) {
    if (!answer) return null;
    const text = norm(answer);
    const needsSponsorship = /need|require|sponsor/.test(text) && !/no (visa|sponsorship) (needed|required)|do not need|don't need/.test(text);
    if (/authori[sz]ed|right to work|eligible to work|without sponsorship/.test(label)) return needsSponsorship ? "no" : "yes";
    if (/sponsor|visa/.test(label)) return needsSponsorship ? "yes" : "no";
    if (/^yes\b/.test(text)) return "yes";
    if (/^no\b/.test(text)) return "no";
    return null;
  }

  // What a field asks for, in order: the first rule that matches wins.
  function valueFor(label, element, pack) {
    const { profile, answers, coverLetterText } = pack;
    const type = (element.type || "").toLowerCase();
    if (type === "email" || /e-?mail/.test(label)) return profile.email;
    if (type === "tel" || /phone|mobile|telephone|whatsapp/.test(label)) return profile.phone;
    if (/first.?name|given.?name|forename|\bfname\b/.test(label)) return profile.firstName;
    if (/last.?name|surname|family.?name|\blname\b/.test(label)) return profile.lastName;
    if (/full.?name|your name|^name\b|\bname\b/.test(label) && !/company|user|employer|reference|school|referr/.test(label)) return profile.name;
    // Where the user found the job: only an answer to that question, never a guess.
    if (/hear about|how did you (find|hear|learn)|where did you (see|find|hear)|referral source|nereden duydunuz|nasıl haberdar/.test(label)) return answerFor(label, answers, /hear|found|source|referr/) ?? null;
    if (/linkedin/.test(label)) return profile.linkedin;
    if (/website|portfolio|github|personal (site|url|page)/.test(label)) return profile.website;
    if (/salary|compensation|pay expect|expected (pay|ctc|package)|remuneration/.test(label)) return answerFor(label, answers, /salary|compensation/);
    if (/notice|start date|available to start|availability|when can you (start|join)|joining/.test(label)) return answerFor(label, answers, /notice|start/);
    if (/visa|sponsor|work permit|authori[sz]ed|right to work|eligible to work/.test(label)) return answerFor(label, answers, /visa|work permit|sponsor/);
    if (/relocat/.test(label)) return answerFor(label, answers, /relocat/);
    if (/why.*(company|us\b|join|work (here|with us|at)|interested in)/.test(label)) return answerFor(label, answers, /why this company|why .*company/);
    if (/why.*(role|position|job)|motivation/.test(label)) return answerFor(label, answers, /why this role|why .*role/);
    if (/years? of (relevant |professional )?experience|how many years/.test(label)) return answerFor(label, answers, /years/);
    if (element instanceof HTMLTextAreaElement && /cover.?letter|motivation letter|message|additional information|anything else/.test(label)) return coverLetterText;
    if (/city|location|where .*based|current address|town/.test(label) && !/e-?mail/.test(label)) return profile.location;
    return answerFor(label, answers);
  }

  // A select's option for a value: an option whose text appears in it, or yes/no.
  function optionFor(select, label, value) {
    const options = [...select.options].filter((option) => option.value !== "" && !option.disabled);
    const choice = yesNo(label, value);
    if (choice) {
      const found = options.find((option) => norm(option.text).startsWith(choice));
      if (found) return found;
    }
    const text = norm(value);
    return options.find((option) => norm(option.text).length > 1 && text.includes(norm(option.text))) || null;
  }

  function base64ToFile(file) {
    const bytes = Uint8Array.from(atob(file.base64), (character) => character.charCodeAt(0));
    return new File([bytes], file.fileName, { type: "application/pdf" });
  }

  function attach(input, file) {
    const transfer = new DataTransfer();
    transfer.items.add(base64ToFile(file));
    input.files = transfer.files;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  // Boxes that agree to something are the user's to tick.
  const CONSENT = /agree|consent|terms|privacy|policy|marketing|newsletter|subscribe|certify|confirm that|accurate/;

  globalThis.jobflowFill = (input) => {
    // The job's own answers first, then everything the user answered before.
    const pack = { ...input, answers: [...input.answers, ...(input.facts || [])] };
    const report = { filled: [], files: [], left: [] };
    const leftElements = [];
    const leave = (element, label) => {
      mark(element, false);
      report.left.push(reason(element, label));
      leftElements.push({ element, label });
    };
    const fill = (element) => {
      mark(element, true);
      filledBefore.add(element);
    };
    const visible = (element) => element.offsetParent !== null || element.type === "file";
    const fields = [...document.querySelectorAll("input, textarea, select")].filter(
      (element) => !element.disabled && !element.readOnly && visible(element) && !["hidden", "submit", "button", "reset", "image", "password", "search"].includes((element.type || "").toLowerCase()),
    );

    // File inputs: the CV to the resume one, the cover letter to its own.
    const fileInputs = fields.filter((element) => element.type === "file");
    const cv = pack.files.find((file) => file.type === "cv");
    const letter = pack.files.find((file) => file.type === "cover_letter");
    for (const input of fileInputs) {
      const label = labelOf(input);
      if (input.files.length > 0 || filledBefore.has(input)) continue;
      const file = /cover|ön yazı|motivation/.test(label) ? letter : /resume|cv|curriculum|özgeçmiş|upload|yükle/.test(label) || fileInputs.length === 1 ? cv : null;
      if (file) {
        try {
          attach(input, file);
          fill(input);
          report.files.push(file.fileName);
        } catch {
          leave(input, label || "a file upload");
        }
      } else if (required(input, label)) {
        leave(input, label || "a file upload");
      }
    }

    // Radio groups, once per group name.
    const radios = fields.filter((element) => element.type === "radio");
    for (const name of new Set(radios.map((radio) => radio.name))) {
      const group = radios.filter((radio) => radio.name === name);
      if (group.some((radio) => radio.checked)) continue;
      const container = group[0].closest("fieldset, [role=radiogroup], .question, .field, div");
      const question = norm(container?.querySelector("legend, label, p, span")?.innerText || labelOf(group[0]));
      const value = valueFor(question, group[0], pack);
      const choice = yesNo(question, value);
      const pick = choice && group.find((radio) => norm(labelOf(radio)).startsWith(choice));
      if (pick) {
        pick.click();
        fill(pick);
        report.filled.push(question);
      } else if (group.some((radio) => required(radio, question))) {
        leave(group[0], question);
      }
    }

    for (const element of fields) {
      const type = (element.type || "").toLowerCase();
      if (type === "file" || type === "radio") continue;
      const label = labelOf(element);
      if (type === "checkbox") {
        if (required(element, label) && !element.checked) leave(element, label);
        continue;
      }
      if (filledBefore.has(element)) continue;
      if (CONSENT.test(label) && !(element instanceof HTMLTextAreaElement)) continue;
      if (element instanceof HTMLSelectElement) {
        if (element.value && element.selectedIndex > 0) continue;
        const option = optionFor(element, label, valueFor(label, element, pack) || "");
        if (option) {
          setValue(element, option.value);
          fill(element);
          report.filled.push(label);
        } else if (required(element, label)) {
          leave(element, label);
        }
        continue;
      }
      if (element.value) continue;
      let value = valueFor(label, element, pack);
      // A number box takes the first number in the answer ("About 2.5 years" → 2.5).
      if (value && type === "number") value = /\d+(?:\.\d+)?/.exec(value)?.[0] ?? null;
      if (value && element.maxLength > 0 && value.length > element.maxLength) value = value.slice(0, element.maxLength);
      // A one-line box gets the first sentence of a long answer.
      if (value && element instanceof HTMLInputElement && value.length > 160) value = value.split(/(?<=\.)\s/)[0];
      if (value) {
        setValue(element, value);
        fill(element);
        report.filled.push(label);
      } else if (required(element, label)) {
        leave(element, label);
      }
    }
    globalThis.__jobflowLeft = leftElements;
    return report;
  };
})();
