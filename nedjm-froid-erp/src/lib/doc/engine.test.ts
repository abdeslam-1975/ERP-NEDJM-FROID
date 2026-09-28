import { describe, expect, it } from "vitest";
import { checkExpr, evalExpr, formatDa, formatValue, renderTemplate, sanitizeTemplate } from "@/lib/doc/engine";

const render = (html: string, data: Record<string, unknown> = {}) => renderTemplate(html, data);

describe("expressions", () => {
  const scope = [{ a: 2, b: { c: "x" }, zero: 0, list: [1], empty: [], nil: null }];

  it("evaluates paths, literals and operators", () => {
    expect(evalExpr("a", scope)).toBe(2);
    expect(evalExpr("b.c", scope)).toBe("x");
    expect(evalExpr("b.c == 'x'", scope)).toBe(true);
    expect(evalExpr("a > 1 && zero == 0", scope)).toBe(true);
    expect(evalExpr("!(a >= 3) || false", scope)).toBe(true);
    expect(evalExpr("missing.path", scope)).toBeUndefined();
    expect(evalExpr("nil > 0", scope)).toBe(false);
  });

  it("rejects malformed expressions", () => {
    expect(() => checkExpr("a >")).toThrow();
    expect(() => checkExpr("(a")).toThrow();
    expect(() => checkExpr("a ; b")).toThrow();
    expect(() => checkExpr("a.b != 'z' && !c")).not.toThrow();
  });
});

describe("formats", () => {
  it("formats amounts, numbers, dates and case", () => {
    expect(formatValue(1234.5, "da")).toBe(formatDa(1234.5));
    expect(formatValue("12", "da")).toBe(formatDa(12));
    expect(formatValue(26, "da0")).not.toContain(",00");
    expect(formatValue(9, "num")).toBe("9");
    expect(formatValue(null, "num")).toBe("");
    expect(formatValue("abc", "upper")).toBe("ABC");
    expect(formatValue(undefined)).toBe("");
  });
});

describe("directives", () => {
  it("fills fields with escaped values", () => {
    expect(render('<p><span data-field="name"></span></p>', { name: "<Ali & Co>" })).toBe("<p><span>&lt;Ali &amp; Co&gt;</span></p>");
  });

  it("drops elements whose condition is false", () => {
    const tpl = '<div><b data-if="show">oui</b><i data-if="!show">non</i></div>';
    expect(render(tpl, { show: true })).toBe("<div><b>oui</b></div>");
    expect(render(tpl, { show: false })).toBe("<div><i>non</i></div>");
  });

  it("repeats elements with item scope layered over the parent", () => {
    const tpl = '<ul><li data-each="rows"><span data-field="label"></span>-<span data-field="unit"></span>-<span data-field="$index"></span></li></ul>';
    expect(render(tpl, { unit: "DA", rows: [{ label: "A" }, { label: "B", unit: "%" }] })).toBe(
      "<ul><li><span>A</span>-<span>DA</span>-<span>0</span></li><li><span>B</span>-<span>%</span>-<span>1</span></li></ul>",
    );
    expect(render(tpl, { rows: [] })).toBe("<ul></ul>");
  });

  it("replaces attributes in place and unwraps bare elements", () => {
    expect(render('<img class="x" src="" data-attr-src="url" alt="">', { url: 'a"b.png' })).toBe('<img class="x" src="a&quot;b.png" alt="">');
    expect(render('<p>x <span data-bare data-field="n" data-format="num"></span>%</p>', { n: 9 })).toBe("<p>x 9%</p>");
  });

  it("keeps directives and marks copies in design mode", () => {
    const out = renderTemplate('<div><p data-each="rows" data-if="$index == 0"><span data-field="v"></span></p></div>', { rows: [{ v: 1 }, { v: 2 }] }, { design: true });
    expect(out).toContain('data-each="rows"');
    expect(out).toContain('data-field="v" contenteditable="false">1</span>');
    expect(out.match(/data-doc-clone/g)).toHaveLength(1);
    expect(out).toContain("data-doc-off");
    const empty = renderTemplate('<p data-each="rows">x</p>', { rows: [] }, { design: true });
    expect(empty).toContain("data-doc-empty");
  });
});

describe("sanitizer", () => {
  it("removes scripts, handlers and dangerous urls", () => {
    const dirty =
      '<div onclick="x()"><script>alert(1)</script><iframe src="//x"></iframe><a href="javascript:alert(1)">l</a>' +
      '<img src="data:text/html,x"><p style="width: expression(alert(1))">t</p></div>' +
      '<link rel="stylesheet" href="https://evil.test/a.css"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Amiri">' +
      '<style>@import url(https://evil.test/x.css); p { color: red; }</style><meta http-equiv="refresh" content="0">';
    const clean = sanitizeTemplate(dirty);
    expect(clean).not.toMatch(/script|iframe|onclick|javascript:|expression\(|evil\.test|http-equiv|data:text\/html/i);
    expect(clean).toContain("fonts.googleapis.com");
    expect(clean).toContain("p { color: red; }");
    expect(render('<p onmouseover="x()">a</p>')).toBe("<p>a</p>");
  });

  it("leaves safe markup byte-identical", () => {
    const safe = '<!doctype html>\n<html><head><style>.a { color: #000; }</style></head><body><p class="a" style="margin: 0">é <b>x</b></p><img src="" alt=""><br></body></html>';
    expect(sanitizeTemplate(safe)).toBe(safe);
  });
});
