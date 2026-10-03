// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { bulletinDocData, renderBulletinHtml, slipToBulletin, type BulletinSlipInput } from "@/components/rh/bulletin-print";
import { DEFAULT_BULLETIN_SETTINGS } from "@/lib/hr/bulletin-settings";
import { renderTemplate } from "@/lib/doc/engine";
import { seededTemplate } from "@/lib/doc/migration-templates";
import { installEditorStyle, serializeDesign } from "@/lib/doc/design-dom";

const slip: BulletinSlipInput = {
  employee_name: "Ben Ali",
  poste_fr: "Soudeur",
  site_name: "Chantier d'Oran",
  nss: "901234567890",
  matricule: "0042",
  period_year: 2026,
  period_month: 9,
  days_worked: 22,
  days_paid: 30,
  days_weekend: 4,
  days_by_code: { P: 20, CRP: 2, W: 4, CA: 3, CM: 1 },
  gross_amount: 52340.5,
  employee_ss: 4710.65,
  employer_ss: 13608.53,
  cacobatph: 6390.8,
  intemperies_employee: 196.28,
  intemperies_employer: 196.28,
  irg_base: 47629.85,
  irg_amount: 4210,
  net_payable: 123450.67,
  payment_mode_code: "VIREMENT",
  account_no: "0012345678",
  account_key: "67",
  lines: [
    { code: "BASE", label_fr: "Salaire de base", nature: "indemnite", unit: "month", category: "1", quantity: 1, unit_amount: 40000, amount: 40000, cotisable: true, taxable: true },
    { code: "302", label_fr: "Panier", nature: "prime", unit: "day", category: "3", quantity: 22, unit_amount: 400, amount: 8800, taxable: true },
    { code: "405", label_fr: "Avance", nature: "retenue", unit: "month", category: "4", quantity: 1, unit_amount: 3000, amount: -3000 },
  ],
};
const rates = { ss_pct: 9, pat_pct: 25.5, fos_pct: 0.5, caco_pct: 12.21, intemp_sal_pct: 0.375, intemp_pat_pct: 0.375 };
const model = slipToBulletin(slip, DEFAULT_BULLETIN_SETTINGS, rates);
const tpl = seededTemplate("bulletin_paie", "bulletin_paie_v2");
const printed = renderBulletinHtml(tpl, [model], "");

const cellText = (html: string, label: string) => {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const cell = [...doc.querySelectorAll("td")].find((td) => td.textContent?.trim() === label);
  return (cell?.nextElementSibling as HTMLElement | null)?.textContent?.trim();
};

describe("official payslip template (modèle fiche de paie)", () => {
  it("prints in Arial only", () => {
    expect(tpl.match(/font-family:[^;]+/g)).toEqual(["font-family: Arial, Helvetica, sans-serif"]);
    expect(tpl).not.toMatch(/Times|Georgia/);
  });

  it("fills the identity box, period and payment block", () => {
    expect(printed).toContain("Employé : <b>BEN ALI</b>");
    expect(printed).toContain("N° S.S : <b>901234567890</b>");
    expect(printed).toContain(">01/09/2026<");
    expect(printed).toContain(">30/09/2026<");
    expect(cellText(printed, "Clé :")).toBe("67");
    expect(cellText(printed, "C.C.P\u00a0 N° :")).toBe("0012345678");
  });

  it("splits Nbr, Base and Taux and prints amounts like the model", () => {
    const doc = new DOMParser().parseFromString(printed, "text/html");
    const base = [...doc.querySelectorAll("tr")].find((tr) => tr.textContent?.includes("SALAIRE DE BASE"));
    const cells = [...(base?.querySelectorAll("td") ?? [])].map((td) => td.textContent?.trim());
    expect(cells).toEqual(["100", "SALAIRE DE BASE", "28", "40000,00", "1333,33 DA/j", "40000,00", ""]);
    expect(printed).toContain("123450,67 DA");
  });

  it("shows each pointage code in the movements block", () => {
    expect(cellText(printed, "Travaillés")).toBe("20");
    expect(cellText(printed, 'Congés de Récupération "CRP"')).toBe("2");
    expect(cellText(printed, "WeekEnd et Fériées du Mois")).toBe("4");
    expect(cellText(printed, "Congés Annuel")).toBe("3");
    expect(cellText(printed, "Congés Maladie")).toBe("1");
    expect(cellText(printed, "Absences non Justifiées")).toBe("");
  });

  it("keeps the contribution headers of the model", () => {
    for (const h of ["Cotis. 9%", "Pat. CNAS\u00a0 25.5%", "Œuvres Soc 0.5%", "Congés P 12.21%", "Intemp. Sal 0.375%", "Intemp. Pat 0.375%"]) {
      expect(new DOMParser().parseFromString(printed, "text/html").body.textContent).toContain(h);
    }
  });

  it("prints on the company letterhead and leaves no template directive", () => {
    expect(printed).not.toMatch(/data-(field|each|if|format|bare|attr-)/);
    expect(printed).toContain('src="/hr-letterhead.png"');
  });

  it("survives an editor round trip without changes", () => {
    const doc = new DOMParser().parseFromString(renderTemplate(tpl, bulletinDocData([model], ""), { design: true }), "text/html");
    installEditorStyle(doc);
    doc.body.setAttribute("contenteditable", "true");
    const saved = serializeDesign(doc);
    const displayed = (html: string) => new DOMParser().parseFromString(html, "text/html").documentElement.outerHTML;
    expect(displayed(renderBulletinHtml(saved, [model], ""))).toBe(displayed(printed));
  });

  it("matches the reviewed print", async () => {
    await expect(printed).toMatchFileSnapshot("__snapshots__/bulletin-v2.html");
  });
});
