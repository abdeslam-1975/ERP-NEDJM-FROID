import { describe, expect, it } from "vitest";
import {
  flagsForCategory,
  mapObjectRow,
  parseCsvText,
  parseGasStyleMatrix,
  parseRecords,
  previewRubriqueImport,
  type RubriqueDraft,
} from "@/lib/hr/salary-rubrique-import";
import { buildSalaryRubriquesTemplate, parseSalaryImportBuffer } from "@/lib/hr/salary-rubrique-import-file";

const sample: RubriqueDraft = {
  code: "302",
  label_fr: "Prime de panier",
  label_ar: "وجبة العامل",
  nature: "prime",
  unit: "day",
  category: "3",
  cotisable: false,
  taxable: true,
  apply_scope: "site",
  default_amount: 0,
  sort_order: 302,
  is_active: true,
};

describe("salary rubrique import", () => {
  it("maps Arabic aliases and category flags", () => {
    const mapped = mapObjectRow({
      الرمز: "303",
      التسمية: "مستلزمات النظافة",
      nature: "تعويض",
      الصنف: "3",
      يطبق_على: "عقد",
      الوحدة: "شهر",
    });
    expect(mapped.ok).toBe(true);
    if (!mapped.ok) return;
    expect(mapped.data.code).toBe("303");
    expect(mapped.data.apply_scope).toBe("contract");
    expect(mapped.data.unit).toBe("month");
    expect(mapped.data).toMatchObject(flagsForCategory("3"));
  });

  it("previews new / update / unchanged and keeps scope unless asked", () => {
    const drafts = [
      { ...sample, label_ar: "وجبة" },
      { ...sample, code: "999", label_fr: "Nouveau", label_ar: "جديد" },
    ];
    const existing = [{ ...sample, code: "302" }];
    const kept = previewRubriqueImport(drafts, [], existing, false);
    const row302 = kept.find((r) => r.code === "302");
    expect(row302?.status).toBe("update");
    expect(row302?.incoming?.apply_scope).toBe("site");

    const scopeChange = previewRubriqueImport(
      [{ ...sample, apply_scope: "employee", label_ar: "وجبة العامل" }],
      [],
      existing,
      false,
    );
    expect(scopeChange[0]?.keep_scope).toBe(true);
    expect(scopeChange[0]?.incoming?.apply_scope).toBe("site");
    expect(scopeChange[0]?.status).toBe("unchanged");

    const replaced = previewRubriqueImport(
      [{ ...sample, apply_scope: "employee" }],
      [],
      existing,
      true,
    );
    expect(replaced[0]?.status).toBe("update");
    expect(replaced[0]?.incoming?.apply_scope).toBe("employee");
    expect(kept.find((r) => r.code === "999")?.status).toBe("new");
  });

  it("parses CSV and rejects a duplicate code", () => {
    const csv = `code,label_fr,label_ar,nature,unit,category,apply_scope
302,Panier,وجبة,prime,day,3,site
302,Panier 2,وجبة,prime,day,3,site`;
    const parsed = parseRecords(parseCsvText(csv));
    expect(parsed.drafts).toHaveLength(1);
    expect(parsed.rejected[0]?.error).toMatch(/مكرر/);
  });

  it("parses the GAS-style 3-row layout", () => {
    const rows = [
      [
        "Salaire Cotisable/Imposable (1)",
        "Salaire Cotisable/Imposable (1)",
        "Salaire Imposable Non Cotisable (3)",
        "Salaire Imposable Non Cotisable (3)",
      ],
      ["Rappel Salaire", "Indemnité Experience", "Prime de Panier", "Salissure"],
      [101, 105, 302, 303],
    ];
    const gas = parseGasStyleMatrix(rows);
    expect(gas?.map((g) => g.code)).toEqual(["101", "105", "302", "303"]);
    expect(gas?.find((g) => g.code === "302")?.category).toBe("3");
    expect(gas?.find((g) => g.code === "101")?.category).toBe("1");
  });

  it("keeps unnamed class-2 codes from the official GAS grid", () => {
    const rows = [
      [
        "Salaire Cotisable/Imposable (1)",
        "",
        "Salaire Cotisable/Non Imposable (2)",
        "",
        "",
        "",
      ],
      ["Rappel Salaire", "", "", "", "", ""],
      [101, "", 200, 201, 202, 203],
    ];
    const gas = parseGasStyleMatrix(rows);
    expect(gas?.map((g) => g.code)).toEqual(["101", "200", "201", "202", "203"]);
    expect(gas?.find((g) => g.code === "200")).toMatchObject({
      category: "2",
      cotisable: true,
      taxable: false,
      label_fr: "Rubrique 200",
      label_ar: "بند 200",
    });
  });

  it("round-trips the official template workbook", async () => {
    const buffer = await buildSalaryRubriquesTemplate();
    const parsed = await parseSalaryImportBuffer(buffer, "modele.xlsx");
    expect(parsed.rejected).toHaveLength(0);
    expect(parsed.drafts.map((d) => d.code)).toEqual(["302", "303"]);
    expect(parsed.drafts[0]?.apply_scope).toBe("site");
    expect(parsed.drafts[1]?.apply_scope).toBe("contract");
  });
});
