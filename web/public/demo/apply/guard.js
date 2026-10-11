// Demo forms for testing Jobflow's form filling. Nothing here is sent
// anywhere: a submit only records that it happened, which a filler must never
// cause (window.__submitted, data-submitted on <body>, and a red banner).
window.__submitted = false;
document.addEventListener("submit", (event) => {
  event.preventDefault();
  window.__submitted = true;
  document.body.dataset.submitted = "yes";
  const banner = document.createElement("p");
  banner.className = "submitted";
  banner.textContent = "SUBMITTED. In a test this means the filler pressed Submit, which it must never do.";
  document.body.prepend(banner);
});

// What the form holds now, for the test to read.
window.__formState = () => {
  const state = {};
  for (const el of document.querySelectorAll("input, textarea, select")) {
    if (!el.name) continue;
    if (el.type === "file") {
      if (el.files.length) state[el.name] = [...el.files].map((file) => `${file.name} (${file.size} bytes)`).join(", ");
    } else if (el.type === "checkbox" || el.type === "radio") {
      if (el.checked) state[el.name] = el.value;
    } else if (el.value) {
      state[el.name] = el.value;
    }
  }
  return state;
};
