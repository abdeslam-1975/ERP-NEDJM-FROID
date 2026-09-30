import { describe, expect, it } from "vitest";
import { createSupabaseFake } from "@/test/supabase-fake";
import { signalPayrollInputChange } from "./payroll-input-signal";

type Client = Parameters<typeof signalPayrollInputChange>[0];

const EMP = "44444444-4444-4444-8444-444444444444";
const CTR = "33333333-3333-4333-8333-333333333333";
const SITE = "55555555-5555-4555-8555-555555555555";

describe("signalPayrollInputChange", () => {
  it("only flags through the RPC and returns its counts (no recalculation call)", async () => {
    const fake = createSupabaseFake({
      onRpc: () => ({ data: { flagged_runs: 2, generation_decision: null }, error: null }),
    });
    const r = await signalPayrollInputChange(fake.client as unknown as Client, {
      source: "CONTRACT",
      employeeId: EMP,
      contractIds: [CTR, "not-a-uuid"],
      siteId: SITE,
    });
    expect(r).toEqual({ ok: true, data: { flagged_runs: 2, generation_decision: null } });
    expect(fake.rpcs).toEqual([
      {
        fn: "hr_payroll_signal_input_change",
        args: {
          p_source: "CONTRACT",
          p_employee: EMP,
          p_contracts: [CTR],
          p_site: SITE,
          p_year: null,
          p_month: null,
          p_detail: null,
        },
      },
    ]);
    expect(fake.queries).toHaveLength(0);
  });

  it("does nothing without a target", async () => {
    const fake = createSupabaseFake({});
    const r = await signalPayrollInputChange(fake.client as unknown as Client, { source: "SALARY", contractIds: [] });
    expect(r).toEqual({ ok: true, data: { flagged_runs: 0, generation_decision: null } });
    expect(fake.rpcs).toHaveLength(0);
  });

  it("reports the database error", async () => {
    const fake = createSupabaseFake({ onRpc: () => ({ data: null, error: { message: "Accès refusé." } }) });
    const r = await signalPayrollInputChange(fake.client as unknown as Client, { source: "ADVANCE", employeeId: EMP });
    expect(r).toEqual({ ok: false, error: "Accès refusé." });
  });
});
