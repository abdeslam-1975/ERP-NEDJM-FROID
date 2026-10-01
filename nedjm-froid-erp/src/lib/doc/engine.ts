import { HTMLElement, TextNode, parse, type Node } from "node-html-parser";
import { bindMovementLabels } from "@/lib/doc/movement-labels";

/**
 * Document templates are plain HTML documents whose dynamic parts are declared with attributes, so that
 * a template survives browser parsing and contentEditable round-trips:
 *
 * - `data-field="expr"` (+ `data-format`) replaces the element content with the value;
 * - `data-if="expr"` keeps the element only when the expression is truthy;
 * - `data-each="expr"` repeats the element for every item (item keys, `$index`, `$first`, `$last`, `$item`);
 * - `data-attr-<name>="expr"` sets the attribute `<name>`;
 * - `data-bare` drops the element itself and keeps its content in the final output.
 */

export type DocData = Record<string, unknown>;

export const DOC_DIRECTIVES = ["data-field", "data-format", "data-if", "data-each", "data-bare"] as const;
export const DOC_ATTR_PREFIX = "data-attr-";
/** Editor-only markers (never stored in a template). */
export const DOC_EDITOR_MARKERS = ["data-doc-clone", "data-doc-empty", "data-doc-off", "data-doc-sel", "data-doc-chip"] as const;

export const DOC_FORMATS = [
  { id: "", label: "Texte" },
  { id: "da", label: "Montant (1.234,56)" },
  { id: "da0", label: "Montant sans ,00" },
  { id: "dec", label: "Montant sans séparateur (1234,56)" },
  { id: "rate", label: "Taux (9,00 · 0,375)" },
  { id: "num", label: "Nombre brut" },
  { id: "days", label: "Jours (vide si 0)" },
  { id: "date", label: "Date (jj.mm.aaaa)" },
  { id: "date_slash", label: "Date (jj/mm/aaaa)" },
  { id: "upper", label: "MAJUSCULES" },
] as const;

export function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function formatDa(n: number) {
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  const [int, dec] = abs.toFixed(2).split(".");
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${sign}${grouped},${dec}`;
}

function isoParts(value: unknown) {
  const s = String(value ?? "").slice(0, 10);
  const [y, m, d] = s.split("-");
  return y && m && d ? { y, m, d } : null;
}

export function formatValue(value: unknown, format = ""): string {
  if (value == null) return "";
  switch (format) {
    case "da":
    case "da0": {
      const n = Number(value);
      if (!Number.isFinite(n)) return "";
      const s = formatDa(n);
      return format === "da0" ? s.replace(",00", "") : s;
    }
    case "dec": {
      const n = Number(value);
      return Number.isFinite(n) ? n.toFixed(2).replace(".", ",") : "";
    }
    case "rate": {
      const n = Number(value);
      if (!Number.isFinite(n)) return "";
      const fine = n.toFixed(4).replace(/0+$/, "");
      return (fine.split(".")[1]?.length > 2 ? fine : n.toFixed(2)).replace(".", ",");
    }
    case "num":
      return typeof value === "number" && !Number.isFinite(value) ? "" : String(value);
    case "days": {
      const n = Number(value);
      return Number.isFinite(n) && n !== 0 ? formatDa(n).replace(/,00$/, "").replace(/(,\d)0$/, "$1") : "";
    }
    case "date":
    case "date_slash": {
      const p = isoParts(value);
      if (!p) return String(value);
      return format === "date" ? `${p.d}.${p.m}.${p.y}` : `${p.d}/${p.m}/${p.y}`;
    }
    case "upper":
      return String(value).toUpperCase();
    default:
      return String(value);
  }
}

// ---------------------------------------------------------------- expressions

type Tok = { t: "num" | "str" | "id" | "op"; v: string };
type Expr =
  | { k: "lit"; v: unknown }
  | { k: "path"; p: string[] }
  | { k: "not"; e: Expr }
  | { k: "bin"; op: string; a: Expr; b: Expr };

function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) {
      i += 1;
      continue;
    }
    const two = src.slice(i, i + 2);
    if (["==", "!=", ">=", "<=", "&&", "||"].includes(two)) {
      out.push({ t: "op", v: two });
      i += 2;
      continue;
    }
    if ("!<>()+".includes(c)) {
      out.push({ t: "op", v: c });
      i += 1;
      continue;
    }
    if (c === "'" || c === '"') {
      const end = src.indexOf(c, i + 1);
      if (end < 0) throw new Error("Chaîne non terminée");
      out.push({ t: "str", v: src.slice(i + 1, end) });
      i = end + 1;
      continue;
    }
    const num = /^-?\d+(\.\d+)?/.exec(src.slice(i));
    const prev = out[out.length - 1];
    if (num && (c !== "-" || !prev || (prev.t === "op" && prev.v !== ")"))) {
      out.push({ t: "num", v: num[0] });
      i += num[0].length;
      continue;
    }
    if (c === "-") {
      out.push({ t: "op", v: c });
      i += 1;
      continue;
    }
    const id = /^[A-Za-z_$][\w$]*(\.[\w$]+)*/.exec(src.slice(i));
    if (id) {
      out.push({ t: "id", v: id[0] });
      i += id[0].length;
      continue;
    }
    throw new Error(`Caractère inattendu « ${c} »`);
  }
  return out;
}

function parseExpr(src: string): Expr {
  const toks = tokenize(src);
  let pos = 0;
  const peek = () => toks[pos];
  const eat = (v: string) => {
    if (peek()?.t === "op" && peek().v === v) {
      pos += 1;
      return true;
    }
    return false;
  };
  const primary = (): Expr => {
    const tok = toks[pos++];
    if (!tok) throw new Error("Expression incomplète");
    if (tok.t === "num") return { k: "lit", v: Number(tok.v) };
    if (tok.t === "str") return { k: "lit", v: tok.v };
    if (tok.t === "id") {
      if (tok.v === "true" || tok.v === "false") return { k: "lit", v: tok.v === "true" };
      if (tok.v === "null") return { k: "lit", v: null };
      return { k: "path", p: tok.v.split(".") };
    }
    if (tok.v === "(") {
      const e = or();
      if (!eat(")")) throw new Error("Parenthèse manquante");
      return e;
    }
    throw new Error(`Symbole inattendu « ${tok.v} »`);
  };
  const unary = (): Expr => (eat("!") ? { k: "not", e: unary() } : cmp());
  const additive = (): Expr => {
    let e = primary();
    while (peek()?.t === "op" && (peek().v === "+" || peek().v === "-")) {
      const op = toks[pos++].v;
      e = { k: "bin", op, a: e, b: primary() };
    }
    return e;
  };
  const cmp = (): Expr => {
    const a = additive();
    const tok = peek();
    if (tok?.t === "op" && ["==", "!=", ">", "<", ">=", "<="].includes(tok.v)) {
      pos += 1;
      return { k: "bin", op: tok.v, a, b: additive() };
    }
    return a;
  };
  const and = (): Expr => {
    let e = unary();
    while (eat("&&")) e = { k: "bin", op: "&&", a: e, b: unary() };
    return e;
  };
  const or = (): Expr => {
    let e = and();
    while (eat("||")) e = { k: "bin", op: "||", a: e, b: and() };
    return e;
  };
  const e = or();
  if (pos < toks.length) throw new Error(`Symbole inattendu « ${toks[pos].v} »`);
  return e;
}

const exprCache = new Map<string, Expr>();

function compiled(src: string): Expr {
  let e = exprCache.get(src);
  if (!e) {
    e = parseExpr(src);
    exprCache.set(src, e);
  }
  return e;
}

/** Throws a readable message when the expression is malformed. */
export function checkExpr(src: string) {
  parseExpr(src);
}

type Scopes = readonly DocData[];

function lookup(path: string[], scopes: Scopes): unknown {
  const [head, ...rest] = path;
  let cur: unknown;
  let found = false;
  for (let i = scopes.length - 1; i >= 0; i -= 1) {
    const scope = scopes[i];
    if (scope && Object.prototype.hasOwnProperty.call(scope, head)) {
      cur = scope[head];
      found = true;
      break;
    }
  }
  if (!found) return undefined;
  for (const key of rest) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

/** Missing values count as 0 in `+` / `-`, so an unused pointage code does not blank a sum. */
function amount(v: unknown) {
  return v == null || v === "" ? 0 : Number(v);
}

export function truthy(v: unknown) {
  if (Array.isArray(v)) return v.length > 0;
  return Boolean(v);
}

function evaluate(e: Expr, scopes: Scopes): unknown {
  switch (e.k) {
    case "lit":
      return e.v;
    case "path":
      return lookup(e.p, scopes);
    case "not":
      return !truthy(evaluate(e.e, scopes));
    case "bin": {
      if (e.op === "&&") return truthy(evaluate(e.a, scopes)) && truthy(evaluate(e.b, scopes));
      if (e.op === "||") return truthy(evaluate(e.a, scopes)) || truthy(evaluate(e.b, scopes));
      if (e.op === "+" || e.op === "-") {
        const x = amount(evaluate(e.a, scopes));
        const y = amount(evaluate(e.b, scopes));
        return e.op === "+" ? x + y : x - y;
      }
      const a = evaluate(e.a, scopes) as number;
      const b = evaluate(e.b, scopes) as number;
      switch (e.op) {
        case "==":
          return a == b;
        case "!=":
          return a != b;
        case ">":
          return a > b;
        case "<":
          return a < b;
        case ">=":
          return a >= b;
        default:
          return a <= b;
      }
    }
  }
}

export function evalExpr(src: string, scopes: Scopes): unknown {
  try {
    return evaluate(compiled(src), scopes);
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------- attributes

type RawAttrs = [string, string | null][];

function readAttrs(el: HTMLElement): RawAttrs {
  return Object.entries(el.rawAttributes as Record<string, string | null>);
}

function decodeAttr(raw: string | null) {
  if (raw == null) return "";
  return raw
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function writeAttrs(el: HTMLElement, attrs: RawAttrs) {
  el.rawAttrs = attrs.map(([k, v]) => (v == null ? k : `${k}="${v}"`)).join(" ");
  const cache = el as unknown as { _rawAttrs?: unknown; _attrs?: unknown };
  cache._rawAttrs = undefined;
  cache._attrs = undefined;
}

function attrValue(attrs: RawAttrs, key: string) {
  const hit = attrs.find(([k]) => k.toLowerCase() === key);
  return hit ? decodeAttr(hit[1]) : null;
}

// ---------------------------------------------------------------- sanitizing

const BLOCKED_TAGS = new Set(["script", "iframe", "object", "embed", "frame", "frameset", "base", "applet"]);
const FONT_HOSTS = ["https://fonts.googleapis.com/", "https://fonts.gstatic.com/"];

function unsafeUrl(value: string) {
  const v = value.replace(/[\s\u0000-\u001f]/g, "").toLowerCase();
  return v.startsWith("javascript:") || v.startsWith("vbscript:") || v.startsWith("data:text/html");
}

function sanitizeNode(el: HTMLElement) {
  el.childNodes = el.childNodes.filter((child) => {
    if (!(child instanceof HTMLElement)) return true;
    const tag = child.rawTagName?.toLowerCase() ?? "";
    if (BLOCKED_TAGS.has(tag)) return false;
    if (tag === "meta" && attrValue(readAttrs(child), "http-equiv")) return false;
    if (tag === "link") {
      const href = attrValue(readAttrs(child), "href") ?? "";
      if (!FONT_HOSTS.some((h) => href.startsWith(h))) return false;
    }
    return true;
  });
  for (const child of el.childNodes) {
    if (!(child instanceof HTMLElement)) continue;
    const attrs = readAttrs(child);
    const kept = attrs.filter(([k, v]) => {
      const key = k.toLowerCase();
      if (key.startsWith("on")) return false;
      if ((key === "href" || key === "src" || key === "xlink:href" || key === "action") && unsafeUrl(decodeAttr(v))) return false;
      if (key === "style" && /expression\s*\(|javascript:/i.test(decodeAttr(v))) return false;
      return true;
    });
    if (kept.length !== attrs.length) writeAttrs(child, kept);
    if (child.rawTagName?.toLowerCase() === "style") {
      const css = child.rawText;
      if (/@import|javascript:|expression\s*\(/i.test(css)) {
        child.childNodes = [new TextNode(css.replace(/@import[^;]*;?/gi, "").replace(/javascript:|expression\s*\(/gi, ""), child)];
      }
    }
    sanitizeNode(child);
  }
}

const PARSE_OPTIONS = { comment: true, voidTag: { closingSlash: false } } as const;

export function parseTemplate(html: string) {
  return parse(html, PARSE_OPTIONS);
}

export function sanitizeTemplate(html: string) {
  const root = parseTemplate(html);
  sanitizeNode(root);
  return root.toString();
}

// ---------------------------------------------------------------- rendering

export type RenderOptions = {
  /** Keeps directives and marks repeated / hidden parts so the editor can map edits back to the template. */
  design?: boolean;
};

function withMarker(attrs: RawAttrs, marker: string, value: string | null = ""): RawAttrs {
  const at = attrs.findIndex(([k]) => k.toLowerCase() === marker);
  if (at < 0) return [...attrs, [marker, value]];
  const next = [...attrs];
  next[at] = [next[at][0], value];
  return next;
}

function renderChildren(parent: HTMLElement, scopes: Scopes, design: boolean) {
  const out: Node[] = [];
  for (const child of parent.childNodes) {
    if (child instanceof HTMLElement) out.push(...renderElement(child, scopes, design));
    else out.push(child);
  }
  for (const node of out) node.parentNode = parent;
  parent.childNodes = out;
}

function renderElement(el: HTMLElement, scopes: Scopes, design: boolean): Node[] {
  const attrs = readAttrs(el);
  const each = attrValue(attrs, "data-each");
  if (each == null) return renderNode(el, attrs, scopes, design);

  const raw = evalExpr(each, scopes);
  const list = Array.isArray(raw) ? raw : [];
  const source = el.toString();
  const fresh = () => parseTemplate(source).firstChild as HTMLElement;
  const scopeOf = (item: unknown, i: number): DocData => ({
    ...(item && typeof item === "object" && !Array.isArray(item) ? (item as DocData) : {}),
    $item: item,
    $index: i,
    $first: i === 0,
    $last: i === list.length - 1,
  });
  if (!list.length) {
    if (!design) return [];
    const empty = fresh();
    return renderNode(empty, withMarker(readAttrs(empty), "data-doc-empty"), [...scopes, scopeOf({}, 0)], true);
  }
  return list.flatMap((item, i) => {
    const copy = fresh();
    let copyAttrs = readAttrs(copy);
    if (!design) copyAttrs = copyAttrs.filter(([k]) => k.toLowerCase() !== "data-each");
    else if (i > 0) copyAttrs = withMarker(withMarker(copyAttrs, "data-doc-clone"), "contenteditable", "false");
    return renderNode(copy, copyAttrs, [...scopes, scopeOf(item, i)], design);
  });
}

function renderNode(node: HTMLElement, attrs: RawAttrs, scopes: Scopes, design: boolean): Node[] {
  let current = attrs;
  const cond = attrValue(current, "data-if");
  if (cond != null && !truthy(evalExpr(cond, scopes))) {
    if (!design) return [];
    current = withMarker(current, "data-doc-off");
  }
  const out: RawAttrs = [];
  const dynamic: [string, string][] = [];
  for (const [k, v] of current) {
    const key = k.toLowerCase();
    if (key.startsWith(DOC_ATTR_PREFIX)) {
      dynamic.push([key.slice(DOC_ATTR_PREFIX.length), escapeHtml(formatValue(evalExpr(decodeAttr(v), scopes)))]);
      if (design) out.push([k, v]);
      continue;
    }
    if (!design && (DOC_DIRECTIVES as readonly string[]).includes(key)) continue;
    out.push([k, v]);
  }
  for (const [name, value] of dynamic) {
    const at = out.findIndex(([k]) => k.toLowerCase() === name);
    if (at >= 0) out[at] = [out[at][0], value];
    else out.push([name, value]);
  }
  const field = attrValue(current, "data-field");
  if (field != null) {
    const format = attrValue(current, "data-format") ?? "";
    node.childNodes = [new TextNode(escapeHtml(formatValue(evalExpr(field, scopes), format)), node)];
    writeAttrs(node, design ? withMarker(out, "contenteditable", "false") : out);
  } else {
    writeAttrs(node, out);
    renderChildren(node, scopes, design);
  }
  if (!design && current.some(([k]) => k.toLowerCase() === "data-bare")) return node.childNodes;
  return [node];
}

/** Renders a template for print (`design` keeps the editing markers). */
export function renderTemplate(html: string, data: DocData, options: RenderOptions = {}) {
  const root = parseTemplate(html);
  sanitizeNode(root);
  bindMovementLabels(root);
  renderChildren(root, [data], Boolean(options.design));
  return root.toString();
}

