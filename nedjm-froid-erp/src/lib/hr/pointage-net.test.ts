import { describe, expect, it } from "vitest";
import { pointageNet, pointageRatesForSite, unknownPointageCodes } from "@/lib/hr/pointage-net";

describe("pointage net", () => {
  it("pays the handwritten groups and deducts each AN at the P/MS daily rate", () => {
    const net = pointageNet({
      codes: ["P", "p", "MS", "AOP", "BC", "W", "JF", "CRP", "AN", "CA"],
      calendarDays: 30,
      netRefMonthly: 30000,
      netRecupMonthly: 15000,
    });
    expect(net.paidDays).toBe(7);
    expect(net.crpDays).toBe(1);
    expect(net.anDays).toBe(1);
    expect(net.dailyPms).toBe(1000);
    expect(net.dailyCrp).toBe(500);
    expect(net.sanction).toBe(1000);
    expect(net.penalty).toBe(1000);
    expect(net.amount).toBe(6500);
    expect(net.unknown).toEqual(["CA"]);
  });

  it("leaves a code outside the formula out of the amount", () => {
    const net = pointageNet({
      codes: ["P", "P/2", "CM"],
      calendarDays: 31,
      netRefMonthly: 31000,
      netRecupMonthly: null,
    });
    expect(net.amount).toBe(1000);
    expect(net.dailyCrp).toBe(1000);
    expect(net.unknown).toEqual(["CM", "P/2"]);
  });

  it("stays empty when the contract has no net reference", () => {
    const net = pointageNet({
      codes: ["P", "W"],
      calendarDays: 30,
      netRefMonthly: null,
      netRecupMonthly: 9000,
    });
    expect(net.amount).toBeNull();
    expect(net.penalty).toBeNull();
    expect(net.paidDays).toBe(2);
  });

  it("rounds the month to the centime", () => {
    const net = pointageNet({
      codes: ["P"],
      calendarDays: 31,
      netRefMonthly: 45000,
      netRecupMonthly: null,
    });
    expect(net.amount).toBe(1451.61);
  });

  it("pays recovery days at the presence rate when no recovery net is set", () => {
    const net = pointageNet({
      codes: ["CRP", "CRP"],
      calendarDays: 30,
      netRefMonthly: 30000,
      netRecupMonthly: null,
    });
    expect(net.dailyCrp).toBe(1000);
    expect(net.amount).toBe(2000);
  });

  it("lists each unknown code once", () => {
    expect(unknownPointageCodes(["ca", "CA", "P", "", "AP"])).toEqual(["AP", "CA"]);
  });
});

describe("pointage rates for a site", () => {
  const contract = {
    id: "c1",
    employee_id: "e1",
    site_id: "home",
    start_date: "2026-01-01",
    end_date: null,
    net_ref: 20000,
    net_recup: 10000,
  };

  it("uses the salary in force and keeps a worker assigned to the site", () => {
    const rates = pointageRatesForSite({
      contracts: [contract],
      assignments: [{ contract_id: "c1", site_id: "chantier", effective_from: "2026-03-01" }],
      history: [{ contract_id: "c1", effective_from: "2026-06-01", net_ref: 45000 }],
      siteId: "chantier",
      year: 2026,
      month: 11,
    });
    expect(rates.e1).toEqual({ net_ref: 45000, net_recup: 10000 });
  });

  it("ignores a worker whose latest assignment left the site", () => {
    const rates = pointageRatesForSite({
      contracts: [contract],
      assignments: [
        { contract_id: "c1", site_id: "chantier", effective_from: "2026-01-01" },
        { contract_id: "c1", site_id: "autre", effective_from: "2026-08-01" },
      ],
      history: [],
      siteId: "chantier",
      year: 2026,
      month: 11,
    });
    expect(rates.e1).toBeUndefined();
  });
});
