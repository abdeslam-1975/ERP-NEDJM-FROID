import { z } from "zod";
import { HTMLElement } from "node-html-parser";
import { escapeHtml, parseTemplate } from "@/lib/doc/engine";

/**
 * Page setup of the documents created from the interface. It is written into the template as a managed
 * <style id="doc-setup"> block plus a few marked elements, so the editor shows it and every approved
 * version keeps the layout it was approved with:
 *
 * - `img.doc-letterhead`: full-page letterhead (every page or the first one only);
 * - `.doc-watermark`: diagonal text behind the content;
 * - `.doc-header` / `.doc-footer`: repeated at the top / bottom of every printed page;
 * - `table.doc-frame`: its header and footer rows reserve the room of the margins on every page,
 *   the content is typed in `td.doc-body`.
 */

export const PAGE_SETUP_STYLE_ID = "doc-setup";

export const PAGE_SIZES = { A4: [210, 297], A5: [148, 210], Letter: [216, 279] } as const;
export type PageSize = keyof typeof PAGE_SIZES;

/** Room kept at the bottom of every page for the page numbers. */
const PAGE_NUMBER_BAND = 10;

const mm = (max: number, fallback: number) => z.number().min(0).max(max).catch(fallback);

export const pageSetupSchema = z.object({
  size: z.enum(["A4", "A5", "Letter"]).catch("A4"),
  orientation: z.enum(["portrait", "landscape"]).catch("portrait"),
  margin_top: mm(80, 20),
  margin_right: mm(60, 18),
  margin_bottom: mm(80, 20),
  margin_left: mm(60, 18),
  letterhead: z.enum(["company", "custom", "none"]).catch("company"),
  letterhead_url: z.string().trim().max(1000).catch(""),
  letterhead_pages: z.enum(["all", "first"]).catch("all"),
  header_height: mm(80, 0),
  footer_height: mm(80, 0),
  page_numbers: z.enum(["none", "left", "center", "right"]).catch("none"),
  page_number_label: z.enum(["fr", "ar", "plain"]).catch("fr"),
  watermark: z.string().trim().max(60).catch(""),
  font_family: z.string().trim().max(80).catch(""),
  font_size: z.number().min(7).max(24).catch(11),
  line_height: z.number().min(1).max(2.5).catch(1.5),
});

export type PageSetup = z.infer<typeof pageSetupSchema>;

export const DEFAULT_PAGE_SETUP: PageSetup = pageSetupSchema.parse({});

export function normalizePageSetup(raw: unknown): PageSetup {
  return pageSetupSchema.parse(raw && typeof raw === "object" ? raw : {});
}

/** Width and height of the sheet, in millimetres. */
export function pageDimensions(page: Pick<PageSetup, "size" | "orientation">) {
  const [w, h] = PAGE_SIZES[page.size];
  return page.orientation === "landscape" ? { width: h, height: w } : { width: w, height: h };
}

/** Width of the sheet in CSS pixels (96 dpi), for the editor and the preview frames. */
export function pageWidthPx(page: Pick<PageSetup, "size" | "orientation">) {
  return Math.round((pageDimensions(page).width * 96) / 25.4);
}

const PAGE_NUMBER_TEXT: Record<PageSetup["page_number_label"], string> = {
  fr: '"Page " counter(page) " / " counter(pages)',
  ar: '"صفحة " counter(page) " من " counter(pages)',
  plain: 'counter(page) " / " counter(pages)',
};

const n = (v: number) => Number(v.toFixed(2));

/** The managed CSS of a document: sheet, margins, letterhead, header / footer, watermark, page numbers. */
export function pageSetupCss(page: PageSetup, fontStack: string): string {
  const { width, height } = pageDimensions(page);
  const band = page.page_numbers === "none" ? 0 : PAGE_NUMBER_BAND;
  const area = height - band;
  const hh = page.header_height;
  const fh = page.footer_height;
  const gapTop = hh ? 4 : 0;
  const gapBottom = fh ? 4 : 0;
  const pageNumbers =
    page.page_numbers === "none"
      ? ""
      : ` @bottom-${page.page_numbers} { content: ${PAGE_NUMBER_TEXT[page.page_number_label]}; font-family: ${fontStack}; font-size: 8.5pt; color: #444; }`;
  return [
    `@page { size: ${width}mm ${height}mm; margin: 0 0 ${band}mm 0;${pageNumbers} }`,
    "* { box-sizing: border-box; }",
    "html, body { margin: 0; padding: 0; background: #fff; color: #000; }",
    `body { position: relative; width: ${width}mm; min-height: ${n(area)}mm; font-family: ${fontStack}; font-size: ${page.font_size}pt; line-height: ${page.line_height}; -webkit-print-color-adjust: exact; print-color-adjust: exact; }`,
    "p { margin: 0 0 0.6em; }",
    `.doc-letterhead { position: absolute; top: 0; left: 0; width: ${width}mm; height: ${n(area)}mm; object-fit: fill; z-index: 0; pointer-events: none; }`,
    '.doc-letterhead:not([src]), .doc-letterhead[src=""] { display: none; }',
    `.doc-watermark { position: absolute; top: ${n(area / 2)}mm; left: 50%; transform: translate(-50%, -50%) rotate(-30deg); font-size: 60pt; font-weight: 700; color: #000; opacity: 0.07; white-space: nowrap; z-index: 0; pointer-events: none; }`,
    `.doc-header { position: absolute; top: ${page.margin_top}mm; left: ${page.margin_left}mm; right: ${page.margin_right}mm; height: ${hh}mm; overflow: hidden; z-index: 2;${hh ? "" : " display: none;"} }`,
    `.doc-footer { position: absolute; top: ${n(area - page.margin_bottom - fh)}mm; left: ${page.margin_left}mm; right: ${page.margin_right}mm; height: ${fh}mm; overflow: hidden; z-index: 2;${fh ? "" : " display: none;"} }`,
    ".doc-frame { position: relative; z-index: 1; width: 100%; border-collapse: collapse; border-spacing: 0; }",
    ".doc-frame > thead > tr > td, .doc-frame > tfoot > tr > td { padding: 0; }",
    `.doc-head-space { height: ${n(page.margin_top + hh + gapTop)}mm; }`,
    `.doc-foot-space { height: ${n(page.margin_bottom + fh + gapBottom)}mm; }`,
    `.doc-body { padding: 0 ${page.margin_right}mm 0 ${page.margin_left}mm; vertical-align: top; }`,
    "@media print {",
    `  .doc-header { position: fixed; top: ${page.margin_top}mm; }`,
    `  .doc-footer { position: fixed; top: auto; bottom: ${page.margin_bottom}mm; }`,
    "  .doc-watermark { position: fixed; top: 50%; }",
    page.letterhead_pages === "all" ? "  .doc-letterhead { position: fixed; top: 0; left: 0; width: 100%; height: 100%; }" : "",
    "}",
  ]
    .filter(Boolean)
    .join("\n");
}

const LETTERHEAD_HTML = '<img class="doc-letterhead" src="" data-attr-src="letterhead" alt="">';

function child(parent: HTMLElement, selector: string) {
  return parent.childNodes.find(
    (c): c is HTMLElement => c instanceof HTMLElement && c.matches?.(selector) === true,
  );
}

function prepend(parent: HTMLElement, html: string) {
  const nodes = parseTemplate(html).childNodes;
  for (const node of nodes) node.parentNode = parent;
  parent.childNodes = [...nodes, ...parent.childNodes];
}

export type PageSetupTarget = { page: PageSetup; lang: "fr" | "ar" | "bi"; fontStack: string };

/**
 * Writes the page setup into a template: managed style, letterhead and watermark elements, header / footer
 * blocks when they are switched on and missing, language and direction of the document.
 */
export function applyPageSetup(html: string, { page, lang, fontStack }: PageSetupTarget): string {
  const root = parseTemplate(html);
  const doc = root.querySelector("html");
  const head = root.querySelector("head");
  const body = root.querySelector("body");
  if (!doc || !head || !body) return html;

  doc.setAttribute("lang", lang === "ar" ? "ar" : "fr");
  doc.setAttribute("dir", lang === "ar" ? "rtl" : "ltr");

  const css = pageSetupCss(page, fontStack);
  const existing = head.querySelector(`#${PAGE_SETUP_STYLE_ID}`);
  if (existing) existing.set_content(`\n${css}\n`);
  else {
    const anchor = head.querySelector("style");
    const tag = `<style id="${PAGE_SETUP_STYLE_ID}">\n${css}\n</style>`;
    if (anchor) anchor.insertAdjacentHTML("beforebegin", tag);
    else head.insertAdjacentHTML("beforeend", tag);
  }

  const watermark = child(body, ".doc-watermark");
  if (page.watermark) {
    if (watermark) watermark.set_content(escapeHtml(page.watermark));
    else prepend(body, `<div class="doc-watermark">${escapeHtml(page.watermark)}</div>`);
  } else watermark?.remove();

  const letterhead = child(body, "img.doc-letterhead");
  if (page.letterhead === "none") letterhead?.remove();
  else if (!letterhead) prepend(body, LETTERHEAD_HTML);

  const frame = child(body, "table.doc-frame");
  const insertBlock = (cls: string, text: string) => {
    const tag = `<div class="${cls}"><p>${text}</p></div>`;
    if (frame) frame.insertAdjacentHTML("beforebegin", tag);
    else body.insertAdjacentHTML("beforeend", tag);
  };
  if (page.header_height > 0 && !child(body, ".doc-header")) insertBlock("doc-header", "En-tête");
  if (page.footer_height > 0 && !child(body, ".doc-footer")) insertBlock("doc-footer", "Pied de page");

  return root.toString();
}
