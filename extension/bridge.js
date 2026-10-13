// Runs on the Offerbound app's pages: tells the app the extension is installed,
// takes the app's address and key when the user presses Connect, and lets the
// app open application forms.
(() => {
  const answer = (id, reply) => window.postMessage({ source: "jobflow-extension", id, ...reply }, location.origin);
  window.addEventListener("message", async (event) => {
    if (event.source !== window || event.origin !== location.origin || event.data?.source !== "jobflow-app") return;
    const { id, type, jobIds, token } = event.data;
    if (!["ping", "apply", "connect", "collect"].includes(type)) return;
    try {
      answer(id, await chrome.runtime.sendMessage({ type, jobIds, token, origin: location.origin }));
    } catch (error) {
      answer(id, { ok: false, message: error.message });
    }
  });
  answer(null, { type: "hello" });
})();
