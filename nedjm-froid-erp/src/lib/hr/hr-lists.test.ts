import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SEED_LIST_ITEMS } from "@/lib/doc/hr-docs.fixtures";
import {
  activeOptions,
  annualLeaveCodes,
  exitReasonOptions,
  leaveKindOptions,
  listLabel,
  transportBox,
  transportModeOptions,
  type HrListItem,
} from "@/lib/hr/hr-lists";

const MIGRATION = path.resolve(__dirname, "../../../../supabase/migrations/20261025090000_hr_lists_ui.sql");

describe("HR lists", () => {
  it("reads legend and annual flag of the leave kinds, in list order", () => {
    const kinds = leaveKindOptions(SEED_LIST_ITEMS);
    expect(kinds.map((k) => k.code)).toEqual(["ANNUAL", "RECOVERY", "SICK", "UNPAID", "EXCEPTIONAL"]);
    expect(kinds[0]).toMatchObject({ fr: "Congé annuel", ar: "عطلة سنوية", legend: "CA", annual: true, active: true });
    expect(annualLeaveCodes(kinds)).toEqual(["ANNUAL"]);
  });

  it("keeps archived values readable but out of the choices", () => {
    const items: HrListItem[] = [
      ...SEED_LIST_ITEMS,
      { kind: "exit_reason", code: "OLD", label_fr: "Ancien motif", label_ar: "قديم", extra: {}, is_active: false, sort_order: 99 },
    ];
    const reasons = exitReasonOptions(items);
    expect(activeOptions(reasons).map((r) => r.code)).not.toContain("OLD");
    expect(listLabel(reasons, "OLD")).toEqual({ fr: "Ancien motif", ar: "قديم" });
    expect(listLabel(reasons, "UNKNOWN")).toEqual({ fr: "UNKNOWN", ar: "UNKNOWN" });
    expect(reasons.find((r) => r.code === "ABANDON")?.notice).toBe(true);
  });

  it("ticks the box of the transport mode, « tous moyens » for texts outside the list", () => {
    const modes = transportModeOptions(SEED_LIST_ITEMS);
    expect(transportBox(modes, "Véhicule de service")).toBe("service");
    expect(transportBox(modes, "service")).toBe("service");
    expect(transportBox(modes, "Tous moyens de transport")).toBe("tous");
    expect(transportBox(modes, "Avion")).toBe("tous");
    expect(transportBox(modes, " ")).toBeNull();
  });

  it("matches the seeds of the migration", () => {
    const sql = readFileSync(MIGRATION, "utf8");
    const quote = (s: string) => s.replace(/'/g, "''");
    for (const i of SEED_LIST_ITEMS.filter((x) => x.kind !== "contract_type")) {
      const row = `('${i.kind}', '${i.code}', '${quote(i.label_ar)}', '${quote(i.label_fr)}', '${JSON.stringify(i.extra)}', ${i.sort_order})`;
      expect(sql, row).toContain(row);
    }
    expect(sql).toContain(`'{"essai":"شهرا واحدا","preavis":"ثلاثة أشهر","cdd_reason":5}'`);
  });
});
