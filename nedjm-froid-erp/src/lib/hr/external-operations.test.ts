import { describe, expect, it } from "vitest";
import {
  EXTERNAL_SUBTYPES,
  NO_TRACE_NOTICE,
  documentIndicatorText,
  externalIndicators,
  externalOperationSummary,
  externalPeriodLabel,
  isDeclarationKind,
  parseDeclarationExports,
  parseDeclarationPlan,
  parseExternalOperations,
  periodNatureOf,
  repriseBanner,
} from "@/lib/hr/external-operations";

const op = (extra: Record<string, unknown> = {}) =>
  parseExternalOperations([
    {
      id: "o1",
      root_id: "o1",
      version_no: 1,
      kind: "PAYMENT",
      subtype: "SALARY",
      period_from: "2026-03-01",
      period_to: "2026-05-01",
      employee_count: 3,
      total_amount: "126000",
      source: "DECLARATIVE",
      description: "Salaires versés en espèces",
      status: "ACTIVE",
      declared_by: "RH Lot",
      declared_at: "2026-10-01T09:00:00Z",
      documents: [],
      ...extra,
    },
  ])[0];

describe("period nature", () => {
  it("treats January–August 2026 and earlier as reprise months", () => {
    expect(periodNatureOf(2026, 8)).toBe("EXTERNAL");
    expect(periodNatureOf(2025, 12)).toBe("EXTERNAL");
    expect(periodNatureOf(2026, 9)).toBe("OPERATIONAL");
    expect(periodNatureOf(2027, 1)).toBe("OPERATIONAL");
  });

  it("words the screen banners around the double-payment and double-declaration risks", () => {
    expect(repriseBanner("transfer")).toMatch(/double paiement.*D9/);
    expect(repriseBanner("declaration")).toMatch(/double déclaration.*D10/);
  });
});

describe("external operations", () => {
  it("parses entries defensively", () => {
    const o = op();
    expect(o).toMatchObject({ kind: "PAYMENT", total_amount: 126000, employee_count: 3, sites: null, site_ids: null });
    expect(parseExternalOperations("x")).toEqual([]);
    expect(externalPeriodLabel(o)).toBe("03/2026 → 05/2026");
    expect(externalOperationSummary(o)).toMatch(/Paiement Salaires · 03\/2026 → 05\/2026 · tous les chantiers · 3 salarié/);
  });

  it("keeps the three indicators independent and never claims the operation is real", () => {
    const declared = externalIndicators(op());
    expect(declared.map((i) => i.label)).toEqual(["Information déclarée", "Enregistrement non confirmé", "Aucune pièce"]);

    const confirmed = externalIndicators(op({ confirmed_by: "Boss", confirmed_at: "2026-10-02T10:00:00Z" }));
    expect(confirmed[1].text).toBe(
      "Confirmation de l'enregistrement par Boss - l'application n'a pas vérifié la réalité du paiement ou de la déclaration.",
    );

    const attached = externalIndicators(op({ documents: [{ id: "d1", file_name: "a.pdf", sha256: "a".repeat(64), is_current: true }] }));
    expect(attached[2].label).toBe("Pièce jointe, non examinée");
    expect(attached[1].label).toBe("Enregistrement non confirmé");

    const examined = externalIndicators(
      op({ documents: [{ id: "d1", file_name: "a.pdf", sha256: "a".repeat(64), is_current: true, examined_by: "Fin" }] }),
    );
    expect(examined[2].text).toBe("Pièce examinée par Fin - l'application ne garantit pas l'authenticité du document.");
  });

  it("ignores replaced documents for the examination indicator", () => {
    const o = op({
      documents: [
        { id: "d1", file_name: "old.pdf", sha256: "a".repeat(64), is_current: false, examined_by: "Fin" },
        { id: "d2", file_name: "new.pdf", sha256: "b".repeat(64), is_current: true },
      ],
    });
    expect(externalIndicators(o)[2].label).toBe("Pièce jointe, non examinée");
    expect(documentIndicatorText(o.documents[1])).toBe("pièce jointe, non examinée");
  });

  it("lists the subtypes per kind", () => {
    expect(EXTERNAL_SUBTYPES.PAYMENT).toEqual(["SALARY", "OTHER"]);
    expect(EXTERNAL_SUBTYPES.DECLARATION).toContain("G50");
  });
});

describe("declaration register and plan", () => {
  it("parses the exports register", () => {
    const [e] = parseDeclarationExports([
      { id: "e1", kind: "das", nature: "CONTROL", period_year: 2026, months: [9, 10], excluded_months: [1, 2], double_declaration_risk: false },
    ]);
    expect(e).toMatchObject({ nature: "CONTROL", period_month: null, months: [9, 10], excluded_months: [1, 2] });
  });

  it("parses a blocked plan and its open decision", () => {
    const p = parseDeclarationPlan({
      kind: "monthly",
      year: 2026,
      month: 3,
      required_months: [3],
      month_reasons: { "3": ["EXTERNAL_PERIOD"] },
      blocked: true,
      message: "Export bloqué",
      nature: "OFFICIAL",
      months: [3],
      open_decision: { id: "d", status: "PENDING", option: null },
    });
    expect(p.blocked).toBe(true);
    expect(p.open_decision).toEqual({ id: "d", status: "PENDING", option: null });
    expect(p.month_reasons["3"]).toEqual(["EXTERNAL_PERIOD"]);
    expect(parseDeclarationPlan(null)).toMatchObject({ blocked: false, nature: "OFFICIAL", open_decision: null });
    expect(isDeclarationKind("g50")).toBe(true);
    expect(isDeclarationKind("xml")).toBe(false);
  });

  it("states that no trace is not a proof", () => {
    expect(NO_TRACE_NOTICE).toBe(
      "Aucune trace enregistrée dans l'application - cela ne prouve pas qu'aucun paiement ou aucune déclaration n'a eu lieu.",
    );
  });
});
