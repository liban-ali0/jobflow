// Shared by the popup and the background worker: the connection to the
// user's own Offerbound app (address and key from the extension's settings).

async function jobflowSettings() {
  const { address = "http://localhost:3000", token = "" } = await chrome.storage.local.get(["address", "token"]);
  return { address: address.replace(/\/+$/, ""), token };
}

async function jobflowCall(path, options = {}) {
  const { address, token } = await jobflowSettings();
  if (!token) throw new Error("Paste your key in the extension's settings first (from Offerbound → Settings → Sources).");
  let response;
  try {
    response = await fetch(`${address}${path}`, { ...options, headers: { "Content-Type": "application/json", "X-Jobflow-Token": token, ...(options.headers || {}) } });
  } catch {
    throw new Error("Offerbound is not reachable. Is the app running?");
  }
  const reply = await response.json().catch(() => ({ ok: false, message: `Offerbound answered ${response.status}.` }));
  if (!reply.ok) throw new Error(reply.message);
  return reply;
}

async function jobflowBase64(url) {
  const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

// A job's application pack with its PDFs inside, ready for a page.
async function jobflowPack(jobId) {
  const { pack } = await jobflowCall(`/api/apply/${jobId}`);
  pack.files = await Promise.all(pack.files.map(async (file) => ({ ...file, base64: await jobflowBase64(file.url) })));
  return pack;
}
