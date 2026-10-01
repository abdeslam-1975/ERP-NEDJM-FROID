import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseFake } from "@/test/supabase-fake";

const h = vi.hoisted(() => ({
  fake: null as null | ReturnType<typeof import("@/test/supabase-fake").createSupabaseFake>,
}));

vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => h.fake!.client }));
vi.mock("@/lib/actions/hr-salary", () => ({ replaceContractSalaryLines: async () => ({ ok: true, data: undefined }) }));
vi.mock("@/lib/hr/payroll-input-signal", () => ({
  signalPayrollInputChange: async () => ({ ok: true, data: { flagged_runs: 0, generation_decision: null } }),
}));

import { upsertHrContract } from "./hr-contracts";

const ID = "33333333-3333-4333-8333-333333333333";
const AGENCY = "11111111-1111-4111-8111-111111111111";
const PREVIOUS = "77777777-7777-4777-8777-777777777777";

const base = {
  employee_id: "44444444-4444-4444-8444-444444444444",
  site_id: "55555555-5555-4555-8555-555555555555",
  activity_code_id: "66666666-6666-4666-8666-666666666666",
  affectation_principale: false,
  salaire_base_monthly: 0,
  salaire_net_ref_monthly: 0,
  start_date: "2026-09-01",
  status: "ACTIVE",
};

type SaveArgs = { p_close: { id: string; end_date: string }[]; p_id: string | null; p_payload: Record<string, unknown> };
const saveArgs = () => h.fake!.rpcs.find((r) => r.fn === "hr_contract_save")?.args as SaveArgs;

beforeEach(() => {
  h.fake = createSupabaseFake({
    onQuery: () => ({ data: [], error: null }),
    onRpc: () => ({ data: ID, error: null }),
  });
});

describe("upsertHrContract — interim", () => {
  it("requires an agency for INTERIM contracts", async () => {
    const r = await upsertHrContract({ ...base, contract_type_code: "INTERIM", agency_id: "" });
    expect(r).toEqual({ ok: false, error: "Contrat d'intérim : choisissez l'agence." });
    expect(h.fake!.rpcs).toHaveLength(0);
  });

  it("stores the agency and billed daily rate for INTERIM contracts", async () => {
    const r = await upsertHrContract({ ...base, contract_type_code: "INTERIM", agency_id: AGENCY, interim_daily_rate: 3200 });
    expect(r.ok).toBe(true);
    expect(saveArgs()).toMatchObject({ p_id: null, p_close: [] });
    expect(saveArgs().p_payload).toMatchObject({ agency_id: AGENCY, interim_daily_rate: 3200 });
  });

  it("drops interim fields on other contract types", async () => {
    await upsertHrContract({ ...base, contract_type_code: "CDD", agency_id: AGENCY, interim_daily_rate: 3200 });
    expect(saveArgs().p_payload).toMatchObject({ agency_id: null, interim_daily_rate: null });
  });

  it("keeps the agency default when no contract rate is given", async () => {
    await upsertHrContract({ ...base, contract_type_code: "INTERIM", agency_id: AGENCY, interim_daily_rate: null });
    expect(saveArgs().p_payload).toMatchObject({ interim_daily_rate: null });
  });
});

describe("upsertHrContract — dated assignments", () => {
  it("refuses a new contract starting mid-month", async () => {
    const r = await upsertHrContract({ ...base, contract_type_code: "CDD", start_date: "2026-09-15" });
    expect(r.ok).toBe(false);
    expect(h.fake!.rpcs).toHaveLength(0);
  });

  it("never sends the site on update: it changes only through dated assignments", async () => {
    const r = await upsertHrContract({ ...base, id: ID, contract_type_code: "CDD" });
    expect(r.ok).toBe(true);
    expect(saveArgs().p_id).toBe(ID);
    expect(saveArgs().p_payload).not.toHaveProperty("site_id");
  });
});

describe("upsertHrContract — principal contract", () => {
  it("ends the previous principal contract in the same save as the new one", async () => {
    h.fake = createSupabaseFake({
      onQuery: () => ({
        data: [{ id: PREVIOUS, start_date: "2026-01-01", end_date: null, status: "ACTIVE" }],
        error: null,
      }),
      onRpc: () => ({ data: ID, error: null }),
    });
    const r = await upsertHrContract({ ...base, affectation_principale: true, contract_type_code: "CDD" });
    expect(r).toMatchObject({ ok: true, data: { id: ID, closed_previous: 1 } });
    expect(saveArgs().p_close).toEqual([{ id: PREVIOUS, end_date: "2026-08-31" }]);
    expect(h.fake!.queries.some((q) => q.op !== "select")).toBe(false);
  });

  it("maps the principal overlap error", async () => {
    h.fake = createSupabaseFake({
      onQuery: () => ({ data: [], error: null }),
      onRpc: () => ({
        data: null,
        error: { message: 'conflicting key value violates exclusion constraint "hr_contracts_one_principale_excl"' },
      }),
    });
    const r = await upsertHrContract({ ...base, affectation_principale: true, contract_type_code: "CDD" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/Un seul contrat principal/);
  });
});
