import "server-only";
import { createRequire } from "node:module";
import path from "node:path";
import { ROOT } from "./data";

// Prints an HTML page to an A4 PDF with Playwright's Chromium. Playwright is
// a project dependency loaded at run time (not bundled into the app), and
// one browser is kept open between downloads.
type Browser = { newPage: () => Promise<Page>; isConnected: () => boolean };
type Page = {
  setContent: (html: string, options: { waitUntil: "load" }) => Promise<void>;
  setViewportSize: (size: { width: number; height: number }) => Promise<void>;
  emulateMedia: (options: { media: "print" }) => Promise<void>;
  evaluate: <A>(fn: (arg: A) => void, arg: A) => Promise<void>;
  pdf: (options: { format: string; printBackground: boolean; preferCSSPageSize: boolean }) => Promise<Uint8Array>;
  close: () => Promise<void>;
};

const holder = globalThis as unknown as { jobflowBrowser?: Promise<Browser> };

function browser(): Promise<Browser> {
  const open = async () => {
    const { chromium } = createRequire(path.join(ROOT, "package.json"))("playwright");
    try {
      return (await chromium.launch()) as Browser;
    } catch (error) {
      if (/Executable doesn't exist|install/i.test(String(error))) {
        throw new Error("The PDF browser is not installed. Run `npx playwright install chromium` in the project folder, or `npm run setup` again.");
      }
      throw error;
    }
  };
  holder.jobflowBrowser ??= open().catch((error) => {
    holder.jobflowBrowser = undefined;
    throw error;
  });
  return holder.jobflowBrowser.then(async (instance) => {
    if (instance.isConnected()) return instance;
    holder.jobflowBrowser = open();
    return holder.jobflowBrowser;
  });
}

// Steps a CV that runs slightly over one page down in text size and spacing
// until it fits, never below a readable size. Runs inside the page.
function fitToOnePage(minSize: number) {
  const root = document.documentElement;
  const mm = 96 / 25.4;
  const margin = parseFloat(getComputedStyle(root).getPropertyValue("--cv-margin")) || 15;
  const pageHeight = (297 - 2 * margin) * mm;
  let size = parseFloat(getComputedStyle(root).getPropertyValue("--cv-size")) || 10.5;
  let gap = parseFloat(getComputedStyle(root).getPropertyValue("--cv-gap")) || 11;
  const start = { size, gap };
  while (document.body.scrollHeight > pageHeight && size > minSize) {
    size = Math.max(minSize, size - 0.25);
    gap = Math.max(4, gap * 0.9);
    root.style.setProperty("--cv-size", `${size}pt`);
    root.style.setProperty("--cv-gap", `${gap}pt`);
  }
  // Still too long at the smallest size: keep the template's own sizes and
  // let it run onto a second page.
  if (document.body.scrollHeight > pageHeight) {
    root.style.setProperty("--cv-size", `${start.size}pt`);
    root.style.setProperty("--cv-gap", `${start.gap}pt`);
  }
}

const MIN_FIT_SIZE = 8.5;

export async function htmlToPdf(html: string, { fitOnePage = false } = {}) {
  const page = await (await browser()).newPage();
  try {
    if (fitOnePage) {
      // Measure at the printed width: A4 minus the side margins.
      const margin = Number(/--cv-margin:\s*([\d.]+)mm/.exec(html)?.[1] ?? 15);
      await page.setViewportSize({ width: Math.round(((210 - 2 * margin) * 96) / 25.4), height: 1123 });
      await page.emulateMedia({ media: "print" });
    }
    await page.setContent(html, { waitUntil: "load" });
    if (fitOnePage) await page.evaluate(fitToOnePage, MIN_FIT_SIZE);
    return await page.pdf({ format: "A4", printBackground: true, preferCSSPageSize: true });
  } finally {
    await page.close();
  }
}

// The page itself, or a PDF download of it.
// "inline" shows the PDF in the browser (the viewer); otherwise it downloads.
export async function pageResponse(page: { html: string; fileName: string; fitOnePage?: boolean }, pdf: boolean, inline = false) {
  if (!pdf) return new Response(page.html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
  try {
    const bytes = await htmlToPdf(page.html, { fitOnePage: page.fitOnePage });
    return new Response(Buffer.from(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(page.fileName)}`,
      },
    });
  } catch (error) {
    return new Response((error as Error).message, { status: 500 });
  }
}
