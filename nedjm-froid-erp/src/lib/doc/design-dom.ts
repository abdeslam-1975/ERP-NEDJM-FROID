/** Browser-side helpers of the document editor (the design view is a live DOM inside an iframe). */

import { DOC_ATTR_PREFIX, DOC_EDITOR_MARKERS } from "@/lib/doc/engine";

export const EDITOR_STYLE_ID = "nf-doc-editor-style";

export const EDITOR_CSS = `
body[contenteditable="true"] { outline: none; caret-color: #2563eb; }
[data-field] { background: rgba(37, 99, 235, 0.1); box-shadow: inset 0 0 0 1px rgba(37, 99, 235, 0.45); border-radius: 2px; cursor: pointer; }
[data-each]:not([data-doc-clone]) { outline: 1px dashed rgba(16, 185, 129, 0.8); outline-offset: -1px; }
[data-doc-clone] { opacity: 0.45; }
[data-doc-off] { opacity: 0.4; outline: 1px dashed #d97706; outline-offset: -1px; }
[data-doc-empty] { opacity: 0.4; outline: 1px dashed #64748b; outline-offset: -1px; }
[data-doc-sel] { outline: 2px solid #2563eb !important; outline-offset: 1px; }
`;

const EDITOR_ONLY_ATTRS = [...DOC_EDITOR_MARKERS, "contenteditable", "spellcheck"];

function cleanElement(el: Element) {
  for (const name of EDITOR_ONLY_ATTRS) el.removeAttribute(name);
  for (const attr of Array.from(el.attributes)) {
    if (!attr.name.startsWith(DOC_ATTR_PREFIX)) continue;
    const target = attr.name.slice(DOC_ATTR_PREFIX.length);
    if (el.hasAttribute(target)) el.setAttribute(target, "");
  }
}

/** Turns the edited design view back into a template (values, repeated copies and editor marks removed). */
export function serializeDesign(doc: Document): string {
  const root = doc.documentElement.cloneNode(true) as HTMLElement;
  root.querySelector(`#${EDITOR_STYLE_ID}`)?.remove();
  root.querySelectorAll("[data-doc-clone]").forEach((n) => n.remove());
  root.querySelectorAll("[data-field]").forEach((n) => {
    n.textContent = "";
  });
  cleanElement(root);
  root.querySelectorAll("*").forEach(cleanElement);
  return `<!doctype html>\n${root.outerHTML}`;
}

export function installEditorStyle(doc: Document) {
  const style = doc.createElement("style");
  style.id = EDITOR_STYLE_ID;
  style.textContent = EDITOR_CSS;
  doc.head.appendChild(style);
}

/** Child indices from <body> down to the element, to find it again after the view is rebuilt. */
export function elementPath(el: Element | null): number[] | null {
  if (!el) return null;
  const path: number[] = [];
  let cur: Element | null = el;
  while (cur && cur.tagName !== "BODY") {
    const parent: Element | null = cur.parentElement;
    if (!parent) return null;
    path.unshift(Array.prototype.indexOf.call(parent.children, cur));
    cur = parent;
  }
  return cur ? path : null;
}

export function elementAt(doc: Document, path: number[] | null): HTMLElement | null {
  if (!path) return null;
  let cur: Element | null = doc.body;
  for (const i of path) {
    cur = cur?.children[i] ?? null;
    if (!cur) return null;
  }
  return cur as HTMLElement | null;
}

export function describeElement(el: Element) {
  const cls = el.getAttribute("class")?.trim().split(/\s+/)[0];
  const field = el.getAttribute("data-field");
  const base = el.tagName.toLowerCase() + (cls ? `.${cls}` : "");
  return field ? `${base} «${field}»` : base;
}

// ---------------------------------------------------------------- editing operations

function lastCopy(el: Element) {
  let ref = el;
  while (ref.nextElementSibling?.hasAttribute("data-doc-clone")) ref = ref.nextElementSibling;
  return ref;
}

function emptyCell(doc: Document, like: Element) {
  const cell = doc.createElement(like.tagName.toLowerCase());
  const cls = like.getAttribute("class");
  if (cls) cell.setAttribute("class", cls);
  cell.appendChild(doc.createElement("br"));
  return cell;
}

export function insertRow(cell: HTMLTableCellElement, after: boolean) {
  const row = cell.parentElement as HTMLTableRowElement;
  const copy = row.cloneNode(true) as HTMLTableRowElement;
  copy.removeAttribute("data-each");
  cleanElement(copy);
  for (const c of Array.from(copy.cells)) {
    c.textContent = "";
    cleanElement(c);
    for (const attr of Array.from(c.attributes)) if (attr.name.startsWith("data-")) c.removeAttribute(attr.name);
    c.appendChild(row.ownerDocument.createElement("br"));
  }
  if (after) lastCopy(row).after(copy);
  else row.before(copy);
}

export function insertColumn(cell: HTMLTableCellElement, after: boolean) {
  const table = cell.closest("table");
  if (!table) return;
  const index = cell.cellIndex;
  for (const row of Array.from(table.rows)) {
    const ref = row.cells[Math.min(index, row.cells.length - 1)];
    if (!ref) continue;
    const fresh = emptyCell(row.ownerDocument, ref);
    if (after) ref.after(fresh);
    else ref.before(fresh);
  }
}

export function deleteRow(cell: HTMLTableCellElement) {
  const row = cell.parentElement as HTMLTableRowElement;
  if (row.hasAttribute("data-each")) {
    while (row.nextElementSibling?.hasAttribute("data-doc-clone")) row.nextElementSibling.remove();
  }
  row.remove();
}

export function deleteColumn(cell: HTMLTableCellElement) {
  const table = cell.closest("table");
  if (!table) return;
  const index = cell.cellIndex;
  for (const row of Array.from(table.rows)) row.cells[index]?.remove();
}

export function mergeRight(cell: HTMLTableCellElement) {
  const next = cell.nextElementSibling as HTMLTableCellElement | null;
  if (!next) return;
  cell.colSpan += next.colSpan;
  if (next.textContent?.trim()) {
    cell.append(" ");
    while (next.firstChild) cell.appendChild(next.firstChild);
  }
  next.remove();
}

export function splitCell(cell: HTMLTableCellElement) {
  if (cell.colSpan <= 1) return;
  cell.colSpan -= 1;
  cell.after(emptyCell(cell.ownerDocument, cell));
}

export function duplicateElement(el: HTMLElement) {
  const copy = el.cloneNode(true) as HTMLElement;
  copy.removeAttribute("data-doc-sel");
  lastCopy(el).after(copy);
  return copy;
}

export function moveElement(el: HTMLElement, up: boolean) {
  if (up) {
    const prev = el.previousElementSibling;
    if (prev && !prev.hasAttribute("data-doc-clone")) prev.before(el);
    return;
  }
  const next = lastCopy(el).nextElementSibling;
  if (!next) return;
  const clones: Element[] = [];
  while (el.nextElementSibling?.hasAttribute("data-doc-clone")) clones.push(el.nextElementSibling);
  lastCopy(next).after(el, ...clones);
}

export function removeElement(el: HTMLElement) {
  if (el.hasAttribute("data-each")) {
    while (el.nextElementSibling?.hasAttribute("data-doc-clone")) el.nextElementSibling.remove();
  }
  el.remove();
}

export function tableHtml(rows: number, cols: number) {
  const cell = '<td style="border: 1px solid #000; padding: 1mm 1.5mm;"><br></td>';
  const row = `<tr>${cell.repeat(cols)}</tr>`;
  return `<table style="width: 100%; border-collapse: collapse; margin: 2mm 0;"><tbody>${row.repeat(rows)}</tbody></table>`;
}

export function escapeAttr(value: string) {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

/** First <style> of the template (the document CSS edited in the side panel). */
export function templateCss(html: string) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  return doc.head.querySelector("style")?.textContent ?? "";
}

export function withTemplateCss(html: string, css: string) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  let style = doc.head.querySelector("style");
  if (!style) {
    style = doc.createElement("style");
    doc.head.appendChild(style);
  }
  style.textContent = css;
  return `<!doctype html>\n${doc.documentElement.outerHTML}`;
}

export function rgbToHex(value: string) {
  const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(value);
  if (!m) return /^#[0-9a-f]{6}$/i.test(value) ? value : "#000000";
  return `#${[m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, "0")).join("")}`;
}
