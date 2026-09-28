// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { bulletinDocData, renderBulletinHtml, slipToBulletin, type BulletinSlipInput } from "@/components/rh/bulletin-print";
import { DEFAULT_BULLETIN_SETTINGS } from "@/lib/hr/bulletin-settings";
import { renderTemplate } from "@/lib/doc/engine";
import { seededTemplate } from "@/lib/doc/migration-templates";
import { insertRow, installEditorStyle, serializeDesign } from "@/lib/doc/design-dom";

const slip: BulletinSlipInput = {
  employee_name: "Ben Ali <Test> & \"Fils\"",
  poste_fr: "Soudeur",
  site_name: "Chantier d'Oran",
  hired_at: "2024-03-01",
  matricule: "0042",
  period_year: 2026,
  period_month: 9,
  days_worked: 22,
  days_paid: 30,
  gross_amount: 52340.5,
  employee_ss: 4710.65,
  employer_ss: 13346.83,
  cacobatph: 6390.8,
  irg_base: 47629.85,
  irg_amount: 4210,
  net_payable: 43419.85,
  compliance: {
    labels: { irg: "Barème", cnas: "Standard", cacobatph: "BTPH" },
    irg: { option: "STANDARD", category: "STANDARD", zone_rate: 0, zone_applies_to: "BASE", fixed_rate: null },
  },
  lines: [
    { code: "BASE", label_fr: "Salaire de base", nature: "indemnite", unit: "month", category: "1", quantity: 1, unit_amount: 40000, amount: 40000, cotisable: true, taxable: true },
    { code: "302", label_fr: "Panier", nature: "prime", unit: "day", category: "3", quantity: 22, unit_amount: 400, amount: 8800, taxable: true },
    { code: "405", label_fr: "Avance", nature: "retenue", unit: "month", category: "4", quantity: 1, unit_amount: 3000, amount: -3000 },
  ],
};
const rates = { ss_pct: 9, pat_pct: 25.5, caco_pct: 12.21 };
const models = [
  slipToBulletin(slip, DEFAULT_BULLETIN_SETTINGS, rates),
  slipToBulletin({ ...slip, compliance: null, lines: [] }, DEFAULT_BULLETIN_SETTINGS, { ss_pct: null, pat_pct: null, caco_pct: null }),
];

/** What the editor's design view holds once the browser has parsed it. */
function openInEditor(tpl: string, data: Record<string, unknown>) {
  const doc = new DOMParser().parseFromString(renderTemplate(tpl, data, { design: true }), "text/html");
  installEditorStyle(doc);
  doc.body.setAttribute("contenteditable", "true");
  return doc;
}

/** Normalizes markup the way a browser displays it. */
function displayed(html: string) {
  return new DOMParser().parseFromString(html, "text/html").documentElement.outerHTML;
}

describe("editor round trip", () => {
  const tpl = seededTemplate("bulletin_paie");

  models.forEach((model, i) => {
    it(`saving without changes keeps the print identical (model ${i + 1})`, () => {
      const saved = serializeDesign(openInEditor(tpl, bulletinDocData([model], "")));
      expect(saved).not.toMatch(/data-doc-|contenteditable|nf-doc-editor-style/);
      expect(displayed(renderBulletinHtml(saved, models, ""))).toBe(displayed(renderBulletinHtml(tpl, models, "")));
      expect(serializeDesign(openInEditor(saved, bulletinDocData([model], "")))).toBe(saved);
    });
  });

  it("keeps a text edit and drops rendered values and repeated copies", () => {
    const doc = openInEditor(tpl, bulletinDocData(models, ""));
    const title = doc.querySelector("h1") as HTMLElement;
    title.textContent = "BULLETIN DE SALAIRE";
    const saved = serializeDesign(doc);
    expect(saved).toContain("BULLETIN DE SALAIRE");
    expect(saved).not.toContain("BEN ALI");
    expect(saved.match(/data-each="pages"/g)).toHaveLength(1);
    expect(saved.match(/data-each="lines"/g)).toHaveLength(1);
    const printed = renderBulletinHtml(saved, models, "");
    expect(printed.match(/BULLETIN DE SALAIRE/g)).toHaveLength(2);
    expect(printed).toContain("BEN ALI &lt;TEST&gt; &amp; &quot;FILS&quot;");
  });

  it("adds a static table row after all repeated lines", () => {
    const doc = openInEditor(tpl, bulletinDocData([models[0]], ""));
    const cell = doc.querySelector('tr[data-each="lines"] td') as HTMLTableCellElement;
    insertRow(cell, true);
    const saved = serializeDesign(doc);
    const lines = saved.slice(saved.indexOf('data-each="lines"'));
    expect(lines.indexOf("</tr>")).toBeLessThan(lines.indexOf("<tr><td"));
    const printed = renderBulletinHtml(saved, [models[0]], "");
    expect(printed.indexOf("Avance")).toBeLessThan(printed.lastIndexOf("<br></td>"));
  });
});
