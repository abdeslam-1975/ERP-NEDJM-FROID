import { describe, expect, it } from "vitest";
import { buildBulletinHtml, buildBulletinLines, formatDa, formatDateDot, slipToBulletin } from "@/components/rh/bulletin-print";
import { DEFAULT_BULLETIN_SETTINGS } from "@/lib/hr/bulletin-settings";

describe("bulletin GAS layout helpers", () => {
  it("formats amounts like 21.000,00", () => {
    expect(formatDa(21000)).toBe("21.000,00");
    expect(formatDa(2457)).toBe("2.457,00");
  });

  it("formats dates as dd.mm.yyyy", () => {
    expect(formatDateDot("1991-12-28")).toBe("28.12.1991");
  });

  it("puts SS and IRG from the modèle, not hardcoded codes", () => {
    const rows = buildBulletinLines({
      lines: [
        {
          code: "BASE",
          label_fr: "Salaire de base",
          nature: "indemnite",
          unit: "month",
          quantity: 1,
          unit_amount: 21000,
          amount: 21000,
        },
      ],
      daysPaid: 31,
      periodYear: 2026,
      periodMonth: 1,
      grossCotisable: 27300,
      employeeSs: 2457,
      irgBase: 30000,
      irgAmount: 0,
      ssRatePct: 9,
      settings: DEFAULT_BULLETIN_SETTINGS,
    });
    expect(rows[0]?.code).toBe(DEFAULT_BULLETIN_SETTINGS.base_code);
    expect(rows[0]?.nombre).toBe(31);
    expect(rows[0]?.taux).toBeCloseTo(21000 / 31, 2);
    expect(rows[0]?.tauxSuffix).toBe(" DA/j");
    expect(rows.find((r) => r.code === DEFAULT_BULLETIN_SETTINGS.ss_code)?.retenue).toBe(2457);
    expect(rows.find((r) => r.code === DEFAULT_BULLETIN_SETTINGS.irg_code)).toBeUndefined();
  });

  it("builds net and charges from the slip", () => {
    const model = slipToBulletin(
      {
        employee_name: "Chine Aboubakr",
        matricule: "031",
        period_year: 2026,
        period_month: 1,
        days_worked: 31,
        days_paid: 31,
        gross_amount: 27300,
        employee_ss: 2457,
        employer_ss: 7098,
        cacobatph: 0,
        irg_amount: 0,
        net_payable: 120000,
        lines: [
          {
            code: "BASE",
            label_fr: "Salaire de base",
            nature: "indemnite",
            unit: "month",
            quantity: 1,
            unit_amount: 21000,
            amount: 21000,
            taxable: true,
          },
        ],
      },
      DEFAULT_BULLETIN_SETTINGS,
      { ss_pct: 9, pat_pct: 26, caco_pct: 12.21 },
    );
    expect(model.period_text).toBe("Janvier / 2026");
    expect(model.charges_totales).toBe(9555);
    expect(model.cout_global).toBe(129555);
    expect(model.values.employee_name).toBe("CHINE ABOUBAKR");
  });

  it("drops extra zero lines and prints on the company letterhead", () => {
    const rows = buildBulletinLines({
      lines: [
        {
          code: "BASE",
          label_fr: "Salaire de base",
          nature: "indemnite",
          unit: "month",
          quantity: 1,
          unit_amount: 21000,
          amount: 21000,
        },
        {
          code: "PANIER",
          label_fr: "Panier",
          nature: "indemnite",
          unit: "day",
          quantity: 0,
          unit_amount: 0,
          amount: 0,
        },
      ],
      daysPaid: 31,
      periodYear: 2026,
      periodMonth: 1,
      grossCotisable: 21000,
      employeeSs: 1890,
      irgBase: 0,
      irgAmount: 0,
      ssRatePct: 9,
      settings: DEFAULT_BULLETIN_SETTINGS,
    });
    expect(rows.some((r) => r.code === "PANIER")).toBe(false);
    const html = buildBulletinHtml(
      [
        slipToBulletin(
          {
            employee_name: "Test",
            matricule: "001",
            period_year: 2026,
            period_month: 1,
            days_worked: 20,
            days_paid: 20,
            gross_amount: 21000,
            employee_ss: 1890,
            employer_ss: 0,
            cacobatph: 0,
            irg_amount: 0,
            net_payable: 19110,
            lines: [
              {
                code: "BASE",
                label_fr: "Salaire de base",
                nature: "indemnite",
                unit: "month",
                quantity: 1,
                unit_amount: 21000,
                amount: 21000,
              },
            ],
          },
          DEFAULT_BULLETIN_SETTINGS,
          { ss_pct: 9, pat_pct: 26, caco_pct: null },
        ),
      ],
      "https://nedjm-froid-erp.vercel.app",
    );
    expect(html).toContain('class="letterhead-img"');
    expect(html).toContain("/hr-letterhead.png");
    expect(html).toContain("@page { size: A4; margin: 0; }");
  });

  it("sorts print lines by class and writes DA / % / DA/j", () => {
    const rows = buildBulletinLines({
      lines: [
        {
          code: "302",
          label_fr: "Panier",
          nature: "prime",
          unit: "day",
          category: "3",
          quantity: 20,
          unit_amount: 400,
          amount: 8000,
        },
        {
          code: "111",
          label_fr: "IEP",
          nature: "indemnite",
          unit: "percent",
          category: "1",
          quantity: 1,
          unit_amount: 10,
          amount: 4000,
        },
        {
          code: "BASE",
          label_fr: "Salaire de base",
          nature: "indemnite",
          unit: "month",
          category: "1",
          quantity: 1,
          unit_amount: 40000,
          amount: 40000,
        },
      ],
      daysPaid: 20,
      periodYear: 2026,
      periodMonth: 1,
      grossCotisable: 48000,
      employeeSs: 4320,
      irgBase: 0,
      irgAmount: 0,
      ssRatePct: 9,
      settings: DEFAULT_BULLETIN_SETTINGS,
    });
    expect(rows.map((r) => r.code).slice(0, 3)).toEqual(["100", "111", "302"]);
    const base = rows.find((r) => r.code === "100");
    expect(base?.nombre).toBe(20);
    expect(base?.taux).toBeCloseTo(40000 / 31, 2);
    expect(base?.tauxSuffix).toBe(" DA/j");
    const panier = rows.find((r) => r.code === "302");
    expect(panier?.nombre).toBe(20);
    expect(panier?.taux).toBe(400);
    expect(panier?.tauxSuffix).toBe(" DA/j");
    const iep = rows.find((r) => r.code === "111");
    expect(iep?.tauxSuffix).toBe(" %");
    const html = buildBulletinHtml(
      [
        slipToBulletin(
          {
            employee_name: "Test",
            matricule: "001",
            period_year: 2026,
            period_month: 1,
            days_worked: 20,
            days_paid: 20,
            gross_amount: 48000,
            employee_ss: 4320,
            employer_ss: 0,
            cacobatph: 0,
            irg_amount: 0,
            net_payable: 43680,
            lines: [
              {
                code: "BASE",
                label_fr: "Salaire de base",
                nature: "indemnite",
                unit: "month",
                quantity: 1,
                unit_amount: 40000,
                amount: 40000,
              },
            ],
          },
          DEFAULT_BULLETIN_SETTINGS,
          { ss_pct: 9, pat_pct: 26, caco_pct: null },
        ),
      ],
      "https://nedjm-froid-erp.vercel.app",
    );
    expect(html).toContain(" DA");
    expect(html).toContain(" %");
  });

  it("prints intempéries on the bulletin when the CACOBATPH activity applies", () => {
    const rows = buildBulletinLines({
      lines: [
        {
          code: "BASE",
          label_fr: "Salaire de base",
          nature: "indemnite",
          unit: "month",
          quantity: 1,
          unit_amount: 40000,
          amount: 40000,
        },
      ],
      daysPaid: 30,
      periodYear: 2026,
      periodMonth: 1,
      grossCotisable: 40000,
      employeeSs: 3600,
      irgBase: 36400,
      irgAmount: 1500,
      ssRatePct: 9,
      intemperiesEmployee: 150,
      intemperiesRatePct: 0.375,
      settings: DEFAULT_BULLETIN_SETTINGS,
    });
    const intemp = rows.find((r) => r.code === DEFAULT_BULLETIN_SETTINGS.intemp_code);
    expect(intemp?.retenue).toBe(150);
    expect(intemp?.nombre).toBe(40000);
    expect(intemp?.taux).toBe(0.375);
    const irg = rows.find((r) => r.code === DEFAULT_BULLETIN_SETTINGS.irg_code);
    expect(irg?.nombre).toBe(36400);
    expect(irg?.retenue).toBe(1500);
    const html = buildBulletinHtml(
      [
        slipToBulletin(
          {
            employee_name: "Test",
            matricule: "001",
            period_year: 2026,
            period_month: 1,
            days_worked: 26,
            days_paid: 30,
            gross_amount: 40000,
            employee_ss: 3600,
            employer_ss: 10200,
            cacobatph: 4884,
            intemperies_employee: 150,
            intemperies_employer: 150,
            irg_base: 36400,
            irg_amount: 1500,
            net_payable: 34750,
            lines: [
              {
                code: "BASE",
                label_fr: "Salaire de base",
                nature: "indemnite",
                unit: "month",
                quantity: 1,
                unit_amount: 40000,
                amount: 40000,
                taxable: true,
              },
            ],
          },
          DEFAULT_BULLETIN_SETTINGS,
          { ss_pct: 9, pat_pct: 25.5, caco_pct: 12.21, intemp_sal_pct: 0.375, intemp_pat_pct: 0.375 },
        ),
      ],
      "https://nedjm-froid-erp.vercel.app",
    );
    expect(html).toContain("RET. INTEMPERIES");
    expect(html).toContain("Intempéries sal.");
    expect(html).toContain("Congés Annuels");
  });
});
