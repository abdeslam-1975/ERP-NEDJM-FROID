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

  it("keeps imported keys such as daily_rate_ht used by the penalty SQL", () => {
    const normalized = normalizeContractAttributes({
      financial: { total_mode: "AUTO" },
      daily_rate_ht: 232600,
      source_annexe: "Annexe 1",
    });
    expect(normalized.daily_rate_ht).toBe(232600);
    expect(normalized.source_annexe).toBe("Annexe 1");
  });

  it("starts with empty clauses and keeps saved termination and clauses", () => {
    const empty = normalizeContractAttributes({ financial: {} });
    expect(empty.clauses.termination.notice_days).toBeNull();
    expect(empty.clauses.termination.caution_effect).toBe("NON_PRECISE");
    expect(empty.clauses.items).toEqual([]);

    const saved = normalizeContractAttributes({
      financial: {},
      clauses: {
        termination: {
          article_ref: "Art. 25",
          notice_days: 30,
          cure_days: 8,
          grounds: ["Manquement grave aux obligations"],
          caution_effect: "CONFISQUEE",
        },
        items: [
          {
            id: "c1",
            category: "FORCE_MAJEURE",
            article_ref: "Art. 27",
            title: "Force majeure",
            content: "Notification sous 48 heures.",
          },
        ],
      },
    });
    expect(saved.clauses.termination.notice_days).toBe(30);
    expect(saved.clauses.termination.cure_days).toBe(8);
    expect(saved.clauses.termination.client_convenience).toBe(false);
    expect(saved.clauses.termination.grounds).toEqual(["Manquement grave aux obligations"]);
    expect(saved.clauses.items[0]).toMatchObject({
      category: "FORCE_MAJEURE",
      title: "Force majeure",
      source_document_id: null,
      source_page: null,
    });
    expect(saved.penalties.presets.length).toBeGreaterThan(0);
  });
});
