import { describe, expect, it } from "vitest";
import {
  attendanceSnapshot,
  contractAlerts,
  contractInForce,
  contractMix,
  headcountByMonth,
  type DashboardContract,
} from "@/lib/hr/dashboard-stats";

function contract(over: Partial<DashboardContract>): DashboardContract {
  return {
    employee_id: "e1",
    contract_type_code: "CDD",
    salaire_base_monthly: 40000,
    start_date: "2026-01-01",
    end_date: null,
    status: "ACTIVE",
    poste_fr: null,
    site_name: "Site",
    affectation_principale: true,
    employee_name: "Ali Benali",
    ...over,
  };
}

describe("contractInForce", () => {
  it("ignores drafts and ended contracts without end date", () => {
    expect(contractInForce(contract({ status: "DRAFT" }), "2026-03-01")).toBe(false);
    expect(contractInForce(contract({ status: "ENDED" }), "2026-03-01")).toBe(false);
    expect(contractInForce(contract({ status: "ENDED", end_date: "2026-04-01" }), "2026-03-01")).toBe(true);
    expect(contractInForce(contract({ start_date: "2026-05-01" }), "2026-03-01")).toBe(false);
  });
});

describe("headcountByMonth", () => {
  it("counts distinct employees at each month end", () => {
    const rows = [
      contract({ employee_id: "e1", start_date: "2026-01-10" }),
      contract({ employee_id: "e1", start_date: "2026-02-01", affectation_principale: false }),
      contract({ employee_id: "e2", start_date: "2026-03-05", end_date: "2026-03-20", status: "ENDED" }),
    ];
    const points = headcountByMonth(rows, new Date(2026, 3, 15), 4);
    expect(points.map((p) => p.count)).toEqual([1, 1, 1, 1]);
    expect(points.map((p) => p.key)).toEqual(["2026-01", "2026-02", "2026-03", "2026-04"]);
  });
});

describe("contractMix", () => {
  it("groups open contracts by type, largest first", () => {
    const mix = contractMix(
      [contract({}), contract({ employee_id: "e2" }), contract({ contract_type_code: "CDI" }), contract({ status: "ENDED" })],
      { CDD: "Durée déterminée" },
    );
    expect(mix.map((m) => [m.label, m.count])).toEqual([
      ["Durée déterminée", 2],
      ["CDI", 1],
    ]);
  });
});

describe("attendanceSnapshot", () => {
  it("counts the latest marked day by kind", () => {
    const legends = [
      { code: "P", label_fr: "Présent", counts_as_presence: true },
      { code: "A", label_fr: "Absence injustifiée", counts_as_presence: false },
      { code: "C", label_fr: "Congé annuel", counts_as_presence: false },
      { code: "MS", label_fr: "Mission", counts_as_presence: true },
      { code: "R", label_fr: "Repos", counts_as_presence: false },
    ];
    const snap = attendanceSnapshot(
      [
        { employee_id: "e1", work_date: "2026-03-01", legend_code: "P" },
        { employee_id: "e1", work_date: "2026-03-02", legend_code: "P" },
        { employee_id: "e2", work_date: "2026-03-02", legend_code: "A" },
        { employee_id: "e3", work_date: "2026-03-02", legend_code: "C" },
        { employee_id: "e4", work_date: "2026-03-02", legend_code: "MS" },
        { employee_id: "e5", work_date: "2026-03-03", legend_code: "R" },
      ],
      legends,
    );
    expect(snap).toEqual({ date: "2026-03-02", present: 1, absent: 1, leave: 1, mission: 1 });
  });
});

describe("contractAlerts", () => {
  it("reports ending contracts, drafts and uncovered employees", () => {
    const alerts = contractAlerts(
      [contract({ end_date: "2026-03-11" }), contract({ employee_id: "e2", status: "DRAFT" })],
      [
        { id: "e1", name: "Ali" },
        { id: "e3", name: "Karim" },
      ],
      new Date(2026, 2, 1),
    );
    expect(alerts.map((a) => [a.key, a.count, a.when])).toEqual([
      ["ending", 1, "Dans 10 jours"],
      ["draft", 1, "À finaliser"],
      ["uncovered", 1, "À régulariser"],
    ]);
  });
});
