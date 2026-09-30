import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseFake } from "@/test/supabase-fake";

const h = vi.hoisted(() => ({
  fake: null as null | ReturnType<typeof import("@/test/supabase-fake").createSupabaseFake>,
  execute: vi.fn(),
  simulate: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => h.fake!.client }));
vi.mock("@/lib/auth/get-workspace", () => ({ getWorkspaceProfile: async () => null }));
vi.mock("@/lib/actions/hr-ops", () => ({ executePayrollDecision: h.execute, executePayrollSimulation: h.simulate }));

import { decideDecision, markNotificationsRead } from "./decisions";

const DEC = "77777777-7777-4777-8777-777777777777";
const input = { id: DEC, option: "GENERATE", justification: "Présences de septembre validées", fingerprint: "fp" };

beforeEach(() => {
  h.execute.mockReset();
  h.simulate.mockReset();
});

describe("decideDecision (D1 simulation)", () => {
  it("runs the separate simulation, never the payroll generation", async () => {
    h.fake = createSupabaseFake({
      onRpc: () => ({ data: { ok: true, status: "DECIDED", executes: true }, error: null }),
      onQuery: (q) => (q.table === "sys_decisions" ? { data: { type_code: "D1", chosen_option: "SIMULATE" }, error: null } : undefined),
    });
    h.simulate.mockResolvedValue({ ok: true, data: { simulation_id: "s", count: 7, warnings: ["w"] } });
    const r = await decideDecision({ ...input, option: "SIMULATE" });
    expect(h.simulate).toHaveBeenCalledWith(DEC);
    expect(h.execute).not.toHaveBeenCalled();
    expect(r).toMatchObject({ ok: true, data: { status: "EXECUTED", executed: { count: 7, warnings: ["w"] } } });
  });
});

describe("decideDecision", () => {
  it("rejects a short justification before reaching the database", async () => {
    h.fake = createSupabaseFake({});
    const r = await decideDecision({ ...input, justification: "ok" });
    expect(r.ok).toBe(false);
    expect(h.fake.rpcs).toHaveLength(0);
  });

  it("asks to re-read when the data changed since display", async () => {
    h.fake = createSupabaseFake({ onRpc: () => ({ data: { ok: false, reason: "STALE" }, error: null }) });
    const r = await decideDecision(input);
    expect(r).toMatchObject({ ok: false });
    expect(!r.ok && r.error).toMatch(/Relisez-la/);
    expect(h.execute).not.toHaveBeenCalled();
  });

  it("records a non-executing option without any payroll operation", async () => {
    h.fake = createSupabaseFake({
      onRpc: () => ({ data: { ok: true, status: "EXECUTED", executes: false }, error: null }),
    });
    const r = await decideDecision({ ...input, option: "NOT_NOW" });
    expect(r).toEqual({ ok: true, data: { status: "EXECUTED", executed: null, execute_error: null, invalidated: null, applied: false, follow_up: null } });
    expect(h.execute).not.toHaveBeenCalled();
    expect(h.fake.rpcs[0]).toEqual({
      fn: "sys_decision_decide",
      args: { p_id: DEC, p_option: "NOT_NOW", p_justification: input.justification, p_fingerprint: "fp", p_risk_ack: false },
    });
  });

  it("executes a decided operation once and reports the result", async () => {
    h.fake = createSupabaseFake({
      onRpc: () => ({ data: { ok: true, status: "DECIDED", executes: true }, error: null }),
    });
    h.execute.mockResolvedValue({ ok: true, data: { run_id: "r", count: 12, warnings: [] } });
    const r = await decideDecision(input);
    expect(h.execute).toHaveBeenCalledTimes(1);
    expect(h.execute).toHaveBeenCalledWith(DEC);
    expect(r).toEqual({
      ok: true,
      data: { status: "EXECUTED", executed: { count: 12, warnings: [] }, execute_error: null, invalidated: null, applied: false, follow_up: null },
    });
  });

  it("keeps the decision when execution fails and surfaces the invalidation", async () => {
    h.fake = createSupabaseFake({
      onRpc: () => ({ data: { ok: true, status: "DECIDED", executes: true }, error: null }),
    });
    h.execute.mockResolvedValue({ ok: false, error: "Données modifiées", invalidated: "new-id" });
    const r = await decideDecision(input);
    expect(r).toEqual({
      ok: true,
      data: { status: "DECIDED", executed: null, execute_error: "Données modifiées", invalidated: "new-id", applied: false, follow_up: null },
    });
  });
});

describe("decideDecision (D9 / D10 executed on their own screen)", () => {
  it("records the decision and points to the operational screen without executing anything", async () => {
    h.fake = createSupabaseFake({
      onRpc: () => ({ data: { ok: true, status: "DECIDED", executes: true }, error: null }),
      onQuery: (q) => (q.table === "sys_decisions" ? { data: { type_code: "D9" }, error: null } : undefined),
    });
    const r = await decideDecision({ ...input, option: "REAL_BATCH", risk_ack: true });
    expect(h.execute).not.toHaveBeenCalled();
    expect(r).toMatchObject({
      ok: true,
      data: { status: "DECIDED", executed: null, follow_up: { href: `/rh/paie/virements?decision=${DEC}` } },
    });
  });
});

describe("decideDecision (D8 / D13 applied in the database)", () => {
  it("reports the change as applied without calling the payroll execution", async () => {
    h.fake = createSupabaseFake({
      onRpc: () => ({ data: { ok: true, status: "EXECUTED", executes: false, applied: true }, error: null }),
    });
    const r = await decideDecision({ ...input, option: "APPLY_CORRECTION", risk_ack: true });
    expect(r).toEqual({
      ok: true,
      data: { status: "EXECUTED", applied: true, executed: null, execute_error: null, invalidated: null, follow_up: null },
    });
    expect(h.execute).not.toHaveBeenCalled();
    expect(h.fake.rpcs[0].args).toMatchObject({ p_option: "APPLY_CORRECTION", p_risk_ack: true });
  });

  it("explains that a request closed by a data change did nothing", async () => {
    h.fake = createSupabaseFake({ onRpc: () => ({ data: { ok: false, reason: "CLOSED" }, error: null }) });
    const r = await decideDecision({ ...input, option: "FIX_START" });
    expect(!r.ok && r.error).toMatch(/Aucune opération n'a été faite/);
    expect(h.execute).not.toHaveBeenCalled();
  });
});

describe("markNotificationsRead", () => {
  it("records reads for the current user only", async () => {
    h.fake = createSupabaseFake({ user: { id: "u1" } });
    const r = await markNotificationsRead([DEC]);
    expect(r).toEqual({ ok: true, data: { count: 1 } });
    expect(h.fake.queries[0]).toMatchObject({
      table: "sys_notification_reads",
      op: "upsert",
      payload: [{ notification_id: DEC, user_id: "u1" }],
    });
  });

  it("rejects malformed ids", async () => {
    h.fake = createSupabaseFake({ user: { id: "u1" } });
    const r = await markNotificationsRead(["x"]);
    expect(r.ok).toBe(false);
    expect(h.fake.queries).toHaveLength(0);
  });
});
