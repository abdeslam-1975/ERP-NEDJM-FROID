import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseFake } from "@/test/supabase-fake";

const h = vi.hoisted(() => ({
  fake: null as null | ReturnType<typeof import("@/test/supabase-fake").createSupabaseFake>,
}));

vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => h.fake!.client }));
vi.mock("@/lib/actions/hr-salary", () => ({ replaceContractSalaryLines: async () => ({ ok: true, data: undefined }) }));
vi.mock("@/lib/actions/hr-ops", () => ({ refreshDraftPayroll: async () => ({ ok: true, data: { count: 0 } }) }));

import { upsertHrContract } from "./hr-contracts";

const ID = "33333333-3333-4333-8333-333333333333";
const AGENCY = "11111111-1111-4111-8111-111111111111";

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

beforeEach(() => {
  h.fake = createSupabaseFake({ onQuery: () => ({ data: { id: ID }, error: null }) });
});

describe("upsertHrContract — interim", () => {
  it("requires an agency for INTERIM contracts", async () => {
    const r = await upsertHrContract({ ...base, contract_type_code: "INTERIM", agency_id: "" });
    expect(r).toEqual({ ok: false, error: "Contrat d'intérim : choisissez l'agence." });
    expect(h.fake!.queries).toHaveLength(0);
  });

  it("stores the agency and billed daily rate for INTERIM contracts", async () => {
    const r = await upsertHrContract({ ...base, contract_type_code: "INTERIM", agency_id: AGENCY, interim_daily_rate: 3200 });
    expect(r.ok).toBe(true);
    expect(h.fake!.queries[0]).toMatchObject({ table: "hr_contracts", op: "insert" });
    expect(h.fake!.queries[0].payload).toMatchObject({ agency_id: AGENCY, interim_daily_rate: 3200 });
  });

  it("drops interim fields on other contract types", async () => {
    await upsertHrContract({ ...base, contract_type_code: "CDD", agency_id: AGENCY, interim_daily_rate: 3200 });
    expect(h.fake!.queries[0].payload).toMatchObject({ agency_id: null, interim_daily_rate: null });
  });

  it("keeps the agency default when no contract rate is given", async () => {
    await upsertHrContract({ ...base, contract_type_code: "INTERIM", agency_id: AGENCY, interim_daily_rate: null });
    expect(h.fake!.queries[0].payload).toMatchObject({ interim_daily_rate: null });
  });
});
