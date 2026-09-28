import { describe, expect, it } from "vitest";
import { renderBulletinHtml, slipToBulletin, type BulletinSlipInput } from "@/components/rh/bulletin-print";
import { DEFAULT_BULLETIN_SETTINGS } from "@/lib/hr/bulletin-settings";
import { seededTemplate } from "@/lib/doc/migration-templates";

const ORIGIN = "https://nedjm-froid-erp.vercel.app";

const base: BulletinSlipInput = {
  employee_name: "Ben Ali <Test> & \"Fils\"",
  poste_fr: "Soudeur",
  site_name: "Chantier d'Oran",
  hired_at: "2024-03-01",
  birth_date: "1990-05-12",
  marital_code: "M",
  address_fr: "Cité 20 août",
  commune: "Oran",
  nss: "901234567890",
  qualification_code: "C3",
  matricule: "0042",
  period_year: 2026,
  period_month: 9,
  days_worked: 22,
  days_paid: 30,
  days_leave: 2,
  days_absence: 1,
  days_weekend: 8,
  days_abandon: 0,
  days_rappel: 0.5,
  gross_amount: 52340.5,
  employee_ss: 4710.65,
  employer_ss: 13346.83,
  cacobatph: 6390.8,
  intemperies_employee: 196.28,
  intemperies_employer: 196.28,
  extra_employee: 250,
  extra_employer: 500,
  extra_contributions: [
    { code: "MUT", label_fr: "Mutuelle", part: "EMPLOYEE", rate: 0.005, base_amount: 50000, amount: 250 },
    { code: "MUTP", label_fr: "Mutuelle", part: "EMPLOYER", rate: 0.01, base_amount: 50000, amount: 500 },
  ],
  irg_base: 47629.85,
  irg_amount: 4210,
  net_payable: 43419.85,
  payment_mode_code: "CCP_VIREMENT",
  account_no: "0012345 67",
  compliance: {
    labels: { irg: "Barème", cnas: "Standard", cacobatph: "BTPH" },
    irg: { option: "STANDARD", category: "STANDARD", zone_rate: 0, zone_applies_to: "BASE", fixed_rate: null },
  },
  lines: [
    { code: "BASE", label_fr: "Salaire de base", nature: "indemnite", unit: "month", category: "1", quantity: 1, unit_amount: 40000, amount: 40000, cotisable: true, taxable: true },
    { code: "111", label_fr: "IEP", nature: "indemnite", unit: "percent", category: "1", quantity: 1, unit_amount: 10, amount: 4000, cotisable: true, taxable: true },
    { code: "302", label_fr: "Panier", nature: "prime", unit: "day", category: "3", quantity: 22, unit_amount: 400, amount: 8800, taxable: true },
    { code: "405", label_fr: "Avance", nature: "retenue", unit: "month", category: "4", quantity: 1, unit_amount: 3000, amount: -3000 },
    { code: "150", label_fr: "Prime zéro", nature: "prime", unit: "month", category: "1", quantity: 0, unit_amount: 0, amount: 0 },
  ],
};

const rates = { ss_pct: 9, pat_pct: 25.5, fos_pct: 0.5, caco_pct: 12.21, intemp_sal_pct: 0.375, intemp_pat_pct: 0.375 };

const models = [
  slipToBulletin(base, DEFAULT_BULLETIN_SETTINGS, rates),
  slipToBulletin(
    { ...base, compliance: null, extra_contributions: [], intemperies_employee: 0, intemperies_employer: 0, cacobatph: 0 },
    DEFAULT_BULLETIN_SETTINGS,
    { ss_pct: null, pat_pct: null, caco_pct: null },
  ),
  slipToBulletin(
    { ...base, lines: [] },
    { ...DEFAULT_BULLETIN_SETTINGS, hide_zero_lines: false, letterhead_url: "https://x.test/tête.png" },
    rates,
  ),
];

/** The snapshots were produced by the historical code-built bulletin (byte-identical before it was removed). */
describe("bulletin template v1 prints exactly like the historical bulletin", () => {
  const tpl = seededTemplate("bulletin_paie");
  models.forEach((model, i) => {
    it(`page ${i + 1}`, async () => {
      await expect(renderBulletinHtml(tpl, [model], ORIGIN)).toMatchFileSnapshot(`__snapshots__/bulletin-v1-${i + 1}.html`);
    });
  });
  it("several pages", async () => {
    await expect(renderBulletinHtml(tpl, models, ORIGIN)).toMatchFileSnapshot("__snapshots__/bulletin-v1-pages.html");
  });
});
