// Asks the user to confirm the first connection to an Offerbound app.
const answer = async (allow) => {
  await chrome.runtime.sendMessage({ type: "confirmConnect", allow });
  window.close();
};
chrome.runtime.sendMessage({ type: "pendingConnect" }).then((reply) => {
  if (!reply?.pending) {
    document.getElementById("question").textContent = "Nothing to connect.";
    document.getElementById("allow").disabled = true;
    return;
  }
  document.getElementById("origin").textContent = reply.pending.origin;
});
document.getElementById("allow").addEventListener("click", () => answer(true));
document.getElementById("cancel").addEventListener("click", () => answer(false));
