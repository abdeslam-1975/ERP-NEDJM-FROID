import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseFake } from "@/test/supabase-fake";

const h = vi.hoisted(() => ({
  gate: { ok: true } as { ok: true; workspace?: unknown } | { ok: false; error: string },
  fake: null as null | ReturnType<typeof import("@/test/supabase-fake").createSupabaseFake>,
}));

vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => h.fake!.client }));
vi.mock("@/lib/auth/require-roles", () => ({ requireHrSalaryValues: async () => h.gate }));
vi.mock("@/lib/actions/hr-ops", () => ({ listPayrollSlips: async () => ({ ok: true, data: [] }) }));
vi.mock("@/lib/actions/hr-bulletin", () => ({ getHrBulletinSettings: async () => ({ ok: true, data: {} }) }));

import { setTransferBatchStatus } from "./hr-transfers";

const BATCH = "99999999-9999-4999-8999-999999999999";

beforeEach(() => {
  h.gate = { ok: true, workspace: {} };
  h.fake = createSupabaseFake({ onQuery: () => ({ data: [{ id: BATCH }], error: null }) });
});

describe("setTransferBatchStatus", () => {
  it("is gated on salary-value rights", async () => {
    h.gate = { ok: false, error: "Réservé" };
    expect(await setTransferBatchStatus({ id: BATCH, status: "EXECUTED" })).toEqual({ ok: false, error: "Réservé" });
    expect(h.fake!.queries).toHaveLength(0);
  });

  it("records the deposit reference and a valid date only", async () => {
    await setTransferBatchStatus({ id: BATCH, status: "DEPOSITED", deposit_ref: " BRD-9 ", deposit_date: "2026-09-30" });
    await setTransferBatchStatus({ id: BATCH, status: "DEPOSITED", deposit_ref: "BRD-9", deposit_date: "30/09/2026" });
    expect(h.fake!.queries[0].payload).toEqual({ status_code: "DEPOSITED", deposit_ref: "BRD-9", deposit_date: "2026-09-30" });
    expect(h.fake!.queries[1].payload).toMatchObject({ deposit_date: null });
  });

  it("sends the cancellation reason and surfaces database refusals", async () => {
    h.fake = createSupabaseFake({ onQuery: () => ({ data: null, error: { message: "Motif d'annulation obligatoire." } }) });
    const r = await setTransferBatchStatus({ id: BATCH, status: "CANCELLED", reason: "  " });
    expect(h.fake.queries[0].payload).toEqual({ status_code: "CANCELLED", cancelled_reason: null });
    expect(r).toEqual({ ok: false, error: "Motif d'annulation obligatoire." });
  });

  it("rejects malformed ids", async () => {
    expect((await setTransferBatchStatus({ id: "../x", status: "EXECUTED" })).ok).toBe(false);
  });
});
