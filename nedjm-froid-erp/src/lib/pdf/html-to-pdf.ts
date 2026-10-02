import { existsSync } from "node:fs";
import chromium from "@sparticuz/chromium";
import puppeteer, { type Browser } from "puppeteer-core";

export type PdfAsset = { body: Buffer; contentType: string };

const LOCAL_BROWSERS = [
  process.env.CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
];

async function launch(): Promise<Browser> {
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    return puppeteer.launch({
      args: await puppeteer.defaultArgs({ args: chromium.args, headless: "shell" }),
      executablePath: await chromium.executablePath(),
      headless: "shell",
    });
  }
  const executablePath = LOCAL_BROWSERS.find((path) => path && existsSync(path));
  if (!executablePath) throw new Error("Navigateur introuvable pour générer le PDF (variable CHROME_PATH).");
  return puppeteer.launch({ executablePath, headless: true });
}

function withBase(html: string, baseUrl: string) {
  if (!baseUrl || /<base\s/i.test(html)) return html;
  const tag = `<base href="${baseUrl.replace(/"/g, "&quot;").replace(/\/?$/, "/")}">`;
  return /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, (head) => `${head}${tag}`) : `${tag}${html}`;
}

/**
 * Prints a standalone HTML document to PDF with the browser engine, exactly as « Imprimer » does
 * (the document's @page size and margins, backgrounds, web fonts loaded first).
 * `resolve` serves the assets the headless page cannot fetch itself (private files behind the session).
 */
export async function htmlToPdf(
  html: string,
  options: { baseUrl?: string; resolve?: (url: URL) => Promise<PdfAsset | null> } = {},
): Promise<Buffer> {
  const browser = await launch();
  try {
    const page = await browser.newPage();
    const { resolve } = options;
    if (resolve) {
      await page.setRequestInterception(true);
      page.on("request", (request) => {
        void (async () => {
          let asset: PdfAsset | null = null;
          try {
            asset = await resolve(new URL(request.url()));
          } catch {
            asset = null;
          }
          if (asset) await request.respond({ status: 200, contentType: asset.contentType, body: asset.body });
          else await request.continue();
        })().catch(() => undefined);
      });
    }
    await page.setContent(withBase(html, options.baseUrl ?? ""), { waitUntil: "load", timeout: 30_000 });
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    const pdf = await page.pdf({ printBackground: true, preferCSSPageSize: true, format: "A4" });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}
