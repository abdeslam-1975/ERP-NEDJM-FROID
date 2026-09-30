import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseFake } from "@/test/supabase-fake";

const h = vi.hoisted(() => ({
  fake: null as null | ReturnType<typeof import("@/test/supabase-fake").createSupabaseFake>,
}));

vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => h.fake!.client }));
vi.mock("@/lib/auth/get-workspace", () => ({ getWorkspaceProfile: async () => null }));

import { executePayrollDecision, requestPayrollCalculation } from "./hr-ops";

const SITE = "55555555-5555-4555-8555-555555555555";
const RUN = "22222222-2222-4222-8222-222222222222";
const DEC = "77777777-7777-4777-8777-777777777777";
const NEW_DEC = "88888888-8888-4888-8888-888888888888";

describe("requestPayrollCalculation — Générer never calculates", () => {
  it("opens a D4 request when the payroll does not exist", async () => {
    h.fake = createSupabaseFake({ onRpc: () => ({ data: DEC, error: null }) });
    const r = await requestPayrollCalculation({ period_year: 2026, period_month: 9, site_id: SITE });
    expect(r).toEqual({ ok: true, data: { decision_id: DEC, type_code: "D4" } });
    expect(h.fake.rpcs).toEqual([
      {
        fn: "hr_payroll_request_generation",
        args: { p_site: SITE, p_year: 2026, p_month: 9, p_source: "MANUAL" },
      },
    ]);
    expect(h.fake.queries.every((q) => q.op === "select")).toBe(true);
  });

  it("opens a D3 request for a draft payroll", async () => {
    h.fake = createSupabaseFake({
      onQuery: (q) => (q.table === "hr_payroll_runs" ? { data: { id: RUN, status_code: "DRAFT" }, error: null } : undefined),
      onRpc: () => ({ data: DEC, error: null }),
    });
    const r = await requestPayrollCalculation({ period_year: 2026, period_month: 9, site_id: SITE });
    expect(r).toEqual({ ok: true, data: { decision_id: DEC, type_code: "D3" } });
    expect(h.fake.rpcs.map((x) => x.fn)).toEqual(["hr_payroll_request_recalc"]);
  });

  it("refuses a validated payroll without any request", async () => {
    h.fake = createSupabaseFake({
      onQuery: () => ({ data: { id: RUN, status_code: "VALIDATED" }, error: null }),
    });
    const r = await requestPayrollCalculation({ period_year: 2026, period_month: 9, site_id: SITE });
    expect(r.ok).toBe(false);
    expect(h.fake.rpcs).toHaveLength(0);
  });
});

describe("executePayrollDecision", () => {
  beforeEach(() => {
    h.fake = null;
  });

  it("requires a session", async () => {
    h.fake = createSupabaseFake({ user: null });
    const r = await executePayrollDecision(DEC);
    expect(r.ok).toBe(false);
    expect(h.fake.rpcs).toHaveLength(0);
  });

  it("stops and points to the new request when the data changed after the decision", async () => {
    h.fake = createSupabaseFake({
      user: { id: "u1" },
      onRpc: (x) =>
        x.fn === "sys_decision_check"
          ? { data: { ok: false, reason: "INVALIDATED", new_decision_id: NEW_DEC }, error: null }
          : undefined,
    });
    const r = await executePayrollDecision(DEC);
    expect(r).toMatchObject({ ok: false, invalidated: NEW_DEC });
    expect(h.fake.rpcs.map((x) => x.fn)).toEqual(["sys_decision_check"]);
    expect(h.fake.queries).toHaveLength(0);
  });

  it("writes nothing for a decision without an operation", async () => {
    h.fake = createSupabaseFake({
      user: { id: "u1" },
      onRpc: () => ({ data: { ok: false, reason: "NOTHING_TO_EXECUTE" }, error: null }),
    });
    const r = await executePayrollDecision(DEC);
    expect(r.ok).toBe(false);
    expect(h.fake.queries).toHaveLength(0);
  });

  it("refuses a user without payroll update right before any calculation", async () => {
    h.fake = createSupabaseFake({
      user: { id: "u1" },
      onRpc: (x) =>
        x.fn === "sys_decision_check"
          ? {
              data: { ok: true, type_code: "D4", chosen_option: "GENERATE", period_year: 2026, period_month: 9, site_id: SITE },
              error: null,
            }
          : x.fn === "erp_has_perm"
            ? { data: false, error: null }
            : undefined,
    });
    const r = await executePayrollDecision(DEC);
    expect(r.ok).toBe(false);
    expect(h.fake.rpcs.map((x) => x.fn)).toEqual(["sys_decision_check", "erp_has_perm"]);
  });
});
