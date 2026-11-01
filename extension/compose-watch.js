// Runs in a Gmail compose window Offerbound opened: tells the extension when
// the user presses Send (the button or Ctrl+Enter) and when Gmail says the
// message was sent. It only watches; it never clicks or types anything.
(() => {
  if (globalThis.offerboundComposeWatch) return;
  globalThis.offerboundComposeWatch = true;
  // Gmail's Send button, labelled in the account's language ("Send (Ctrl-Enter)").
  const SEND = /^(send|gönder|إرسال|envoyer|enviar|senden|invia|verzenden)\b/i;
  const SENT = /message sent|ileti gönderildi|mesaj gönderildi|تم إرسال الرسالة|message envoyé|mensaje enviado|nachricht gesendet/i;
  const isSend = (target) => {
    const button = target instanceof Element ? target.closest('[role="button"], button') : null;
    if (!button) return false;
    const label = (button.getAttribute("aria-label") || button.getAttribute("data-tooltip") || button.textContent || "").trim();
    return SEND.test(label);
  };
  let watching = false;
  const pressed = () => {
    chrome.runtime.sendMessage({ type: "composeSend" }).catch(() => null);
    if (watching) return;
    watching = true;
    const until = Date.now() + 20000;
    const look = () => {
      const notice = [...document.querySelectorAll('[role="alert"], [aria-live]')].some((node) => SENT.test(node.textContent || ""));
      if (notice) {
        chrome.runtime.sendMessage({ type: "composeSent" }).catch(() => null);
        watching = false;
      } else if (Date.now() < until) setTimeout(look, 500);
      else watching = false;
    };
    look();
  };
  document.addEventListener("click", (event) => isSend(event.target) && pressed(), true);
  document.addEventListener("keydown", (event) => event.key === "Enter" && (event.ctrlKey || event.metaKey) && pressed(), true);
})();
