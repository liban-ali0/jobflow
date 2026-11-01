// Asks the user to confirm the first connection to an Offerbound app.
// The answer names the request this window showed, so a request that came
// in after it cannot be the one confirmed.
let nonce = null;
const answer = async (allow) => {
  await chrome.runtime.sendMessage({ type: "confirmConnect", allow, nonce });
  window.close();
};
chrome.runtime.sendMessage({ type: "pendingConnect" }).then((reply) => {
  if (!reply?.pending) {
    document.getElementById("question").textContent = "Nothing to connect.";
    document.getElementById("allow").disabled = true;
    return;
  }
  nonce = reply.pending.nonce;
  document.getElementById("origin").textContent = reply.pending.origin;
});
document.getElementById("allow").addEventListener("click", () => answer(true));
document.getElementById("cancel").addEventListener("click", () => answer(false));
