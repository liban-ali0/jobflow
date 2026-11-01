// Runs on the Offerbound app's pages: tells the app the extension is installed,
// takes the app's address and key when the user presses Connect, and lets the
// app open application forms, check Gmail, open emails in Gmail, and check
// Indeed listings.
(() => {
  const answer = (id, reply) => window.postMessage({ source: "jobflow-extension", id, ...reply }, location.origin);
  window.addEventListener("message", async (event) => {
    if (event.source !== window || event.origin !== location.origin || event.data?.source !== "jobflow-app") return;
    const { id, type, jobIds, token, payload } = event.data;
    if (!["ping", "apply", "connect", "collect", "checkMail", "compose", "checkListings"].includes(type)) return;
    try {
      answer(id, await chrome.runtime.sendMessage({ type, jobIds, token, payload, origin: location.origin }));
    } catch (error) {
      answer(id, { ok: false, message: error.message });
    }
  });
  answer(null, { type: "hello" });
})();
