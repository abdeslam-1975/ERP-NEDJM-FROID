import { describe, expect, it } from "vitest";
import {
  elGassiDefaultAttributes,
  normalizeContractAttributes,
} from "@/lib/contracts/attributes-schema";

describe("elGassiDefaultAttributes", () => {
  it("seeds El Gassi financial + contre + penalty presets", () => {
    const attrs = elGassiDefaultAttributes();
    expect(attrs.financial.total_mode).toBe("AUTO");
    expect(attrs.financial.caution_sync).toBe("FROM_RATE");
    expect(attrs.financial.tva_exempt).toBe(true);
    expect(attrs.financial.tva_articles).toEqual(["12", "16"]);
    expect(attrs.contre_facturation.lines.map((l) => l.code)).toEqual([
      "HEBERGEMENT",
      "CARBURANT",
    ]);
    expect(attrs.penalties.presets.length).toBeGreaterThanOrEqual(5);
    expect(attrs.penalties.max_cap_rate).toBe(0.1);
    expect(attrs.rh_an_workflow.enabled).toBe(false);
  });
});

describe("normalizeContractAttributes", () => {
  it("returns defaults for null/invalid input", () => {
    expect(normalizeContractAttributes(null).financial.total_mode).toBe("AUTO");
    expect(normalizeContractAttributes("x").contre_facturation.lines).toHaveLength(
      2,
    );
  });

  it("merges canonical partial financial attrs", () => {
    const normalized = normalizeContractAttributes({
      financial: { total_mode: "MANUAL", caution_sync: "MANUAL" },
    });
    expect(normalized.financial.total_mode).toBe("MANUAL");
    expect(normalized.financial.caution_sync).toBe("MANUAL");
    expect(normalized.financial.tva_standard_rate).toBe(0.19);
    expect(normalized.penalties.presets.length).toBeGreaterThan(0);
  });

  it("migrates Phase 1B legacy flat shape", () => {
    const normalized = normalizeContractAttributes({
      tva_exempt: true,
      tva_articles: ["12", "16"],
      contre_facturation: {
        hebergement_restauration_da_per_day_agent: 6000,
        carburant_da_per_liter: 40,
      },
      penalties: {
        max_cap_rate: 0.08,
        chef_absence: { rate: 0.12, grace_hours: 48 },
        technician_absence: { rate: 0.04, grace_hours: 72 },
        salary_delay: { from_day_11_rate: 0.03, from_day_20_rate: 0.12 },
        equipment_vehicle_failure: { rate: 0.05, grace_hours: 24 },
      },
    });

    const hebergement = normalized.contre_facturation.lines.find(
      (l) => l.code === "HEBERGEMENT",
    );
    const carburant = normalized.contre_facturation.lines.find(
      (l) => l.code === "CARBURANT",
    );
    expect(hebergement?.rate).toBe(6000);
    expect(carburant?.rate).toBe(40);
    expect(normalized.penalties.max_cap_rate).toBe(0.08);

    const chef = normalized.penalties.presets.find(
      (p) => p.code === "CHEF_ABSENCE",
    );
    expect(chef?.rate).toBe(0.12);
    expect(chef?.grace_hours).toBe(48);

    const salary = normalized.penalties.presets.find(
      (p) => p.code === "SALARY_DELAY",
    );
    expect(salary?.brackets).toEqual([
      { from_day: 11, rate: 0.03 },
      { from_day: 20, rate: 0.12 },
    ]);
  });
});
