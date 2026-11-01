// Reads a job site's page for the Offerbound app, in the user's own browser.
// jobflowReadCards(linkPattern): the job ads on a search page, each with its
// title and the text of its card, or why the page cannot be read (a captcha,
// "access denied"). jobflowReadListing(): one job ad's full text.
// jobflowReadPage(): a listing's text and buttons, to tell if it is open. It only
// reads; it never clicks or types anything.
(() => {
  if (globalThis.jobflowReadCards) return;
  const clean = (text) => (text || "").replace(/[ \t]+/g, " ").trim();
  const visible = (element) => {
    const box = element.getBoundingClientRect();
    return box.width > 0 && box.height > 0;
  };
  const BLOCKED = /access (to this page )?(has been )?denied|just a moment|verify (that )?you are (a )?human|are you a robot|unusual traffic|güvenlik doğrulaması|erişim engellendi|robot olmadığınızı/i;
  const CAPTCHA = 'iframe[src*="captcha"], iframe[src*="challenges.cloudflare.com"], .g-recaptcha, .h-captcha, .cf-turnstile';

  function blocked() {
    const head = `${document.title} ${(document.body?.innerText || "").slice(0, 3000)}`;
    if (BLOCKED.test(head)) return "the site asks to check you are not a robot; open it yourself once";
    if ([...document.querySelectorAll(CAPTCHA)].some(visible)) return "a captcha is showing; solve it yourself once";
    return null;
  }

  globalThis.jobflowReadCards = (source) => {
    const why = blocked();
    if (why) return { blocked: why, cards: [] };
    const pattern = new RegExp(source, "i");
    const links = [...document.querySelectorAll("a[href]")].filter((a) => pattern.test(a.href));
    const byUrl = new Map();
    for (const link of links) {
      const url = link.href.split("#")[0];
      if (byUrl.has(url)) continue;
      // The card: the largest box around the link that holds no other ad.
      let card = link;
      for (let i = 0; i < 8 && card.parentElement && card.parentElement !== document.body; i++) {
        const others = new Set([...card.parentElement.querySelectorAll("a[href]")].filter((a) => pattern.test(a.href)).map((a) => a.href.split("#")[0]));
        if (others.size > 1) break;
        card = card.parentElement;
      }
      const heading = card.querySelector("h1, h2, h3, h4, [class*='title' i]");
      const title = clean(heading?.innerText || link.getAttribute("title") || link.innerText.split("\n")[0]);
      const lines = [...new Set((card.innerText || "").split("\n").map(clean).filter(Boolean))].slice(0, 12);
      if (title) byUrl.set(url, { url, title, lines });
    }
    return { blocked: null, cards: [...byUrl.values()].slice(0, 80) };
  };

  // The listing's own text: the JobPosting data the site publishes for search
  // engines when there is one, else the main part of the page.
  globalThis.jobflowReadListing = () => {
    const why = blocked();
    if (why) return { blocked: why };
    for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
      try {
        const data = [JSON.parse(script.textContent)].flat().flatMap((item) => (item["@graph"] ? item["@graph"] : [item]));
        const posting = data.find((item) => item["@type"] === "JobPosting");
        if (posting?.description) {
          // Parsed as an inert document: nothing in it runs or loads.
          const doc = new DOMParser().parseFromString(posting.description, "text/html");
          for (const block of doc.querySelectorAll("p, li, br, h1, h2, h3, h4, div")) block.append("\n");
          return { text: doc.body.textContent.replace(/[ \t]+/g, " ").replace(/\n\s*\n\s*\n+/g, "\n\n").trim().slice(0, 30000), postedAt: posting.datePosted || null };
        }
      } catch {
        // Not JSON the page meant for us.
      }
    }
    const candidates = [...document.querySelectorAll("main, article, [class*='description' i], [class*='detail' i], [id*='description' i]")].filter(visible);
    const best = candidates.sort((a, b) => (b.innerText || "").length - (a.innerText || "").length)[0] || document.body;
    return { text: (best.innerText || "").replace(/\n{3,}/g, "\n\n").trim().slice(0, 30000), postedAt: null };
  };

  // A listing as it shows, for "is it still open?": its address, its text,
  // and the labels of its visible links and buttons (where Apply would be).
  globalThis.jobflowReadPage = () => {
    const why = blocked();
    if (why) return { blocked: why };
    const controls = [...document.querySelectorAll("a, button, input[type=submit], [role=button]")]
      .filter(visible)
      .map((element) => clean(element.innerText || element.value || element.getAttribute("aria-label") || ""))
      .filter((label) => label && label.length <= 80);
    return { url: location.href, text: (document.body?.innerText || "").slice(0, 40000), controls: [...new Set(controls)].slice(0, 300) };
  };
})();
