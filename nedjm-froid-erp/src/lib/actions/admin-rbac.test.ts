import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseFake, type FakeQuery } from "@/test/supabase-fake";

const h = vi.hoisted(() => ({
  ws: null as null | { id: string; isSuperAdmin: boolean },
  fake: null as null | ReturnType<typeof import("@/test/supabase-fake").createSupabaseFake>,
}));

vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => h.fake!.client }));
vi.mock("@/lib/auth/get-workspace", () => ({ getWorkspaceProfile: async () => h.ws }));

import { saveRole, setPeriodLock, setPermission } from "./admin-rbac";

const ROLE = "77777777-7777-4777-8777-777777777777";
const SCREEN = "88888888-8888-4888-8888-888888888888";
const role = { code: "chef_equipe", label_fr: "Chef d'équipe", hierarchy_level: 20, require_mfa: false, site_scoped_allowed: true, is_active: true };

function installFake(onQuery?: (q: FakeQuery) => { data: unknown; error: null | { message: string; code?: string } } | undefined) {
  h.fake = createSupabaseFake({ onQuery });
  return h.fake;
}

beforeEach(() => {
  h.ws = { id: "u-super", isSuperAdmin: true };
  installFake();
});

describe("saveRole", () => {
  it("is reserved to SUPER_ADMIN", async () => {
    h.ws = { id: "u-rh", isSuperAdmin: false };
    expect(await saveRole(role)).toEqual({ ok: false, error: "Réservé au SUPER_ADMIN." });
    h.ws = null;
    expect(await saveRole(role)).toEqual({ ok: false, error: "Session expirée." });
    expect(h.fake!.queries).toHaveLength(0);
  });

  it("keeps level 100 for SUPER_ADMIN and validates the code", async () => {
    expect((await saveRole({ ...role, hierarchy_level: 100 })).ok).toBe(false);
    expect((await saveRole({ ...role, code: "x" })).ok).toBe(false);
  });

  it("upper-cases the code on insert", async () => {
    const fake = installFake(() => ({ data: { id: ROLE }, error: null }));
    expect(await saveRole(role)).toEqual({ ok: true, data: { id: ROLE } });
    expect(fake.queries[0]).toMatchObject({ table: "sys_roles", op: "insert", payload: { code: "CHEF_EQUIPE", hierarchy_level: 20 } });
  });
});

describe("setPermission", () => {
  it("never edits SUPER_ADMIN rights", async () => {
    const fake = installFake((q) => (q.table === "sys_roles" ? { data: { code: "SUPER_ADMIN" }, error: null } : undefined));
    const r = await setPermission({ role_id: ROLE, screen_id: SCREEN, field: "can_read", value: false });
    expect(r.ok).toBe(false);
    expect(fake.queries.some((q) => q.table === "sys_permissions")).toBe(false);
  });

  it("upserts one permission cell", async () => {
    const fake = installFake((q) => (q.table === "sys_roles" ? { data: { code: "ADMIN_RH" }, error: null } : undefined));
    expect(await setPermission({ role_id: ROLE, screen_id: SCREEN, field: "can_read", value: true })).toEqual({ ok: true, data: undefined });
    const up = fake.queries.find((q) => q.table === "sys_permissions");
    expect(up).toMatchObject({ op: "upsert", payload: { role_id: ROLE, screen_id: SCREEN, can_read: true } });
  });

  it("rejects unknown fields and malformed ids", async () => {
    expect((await setPermission({ role_id: "x", screen_id: SCREEN, field: "can_read", value: true })).ok).toBe(false);
    expect((await setPermission({ role_id: ROLE, screen_id: SCREEN, field: "can_hack" as never, value: true })).ok).toBe(false);
  });
});

describe("setPeriodLock", () => {
  it("validates the period", async () => {
    expect((await setPeriodLock({ year: 2026, month: 13, locked: true })).ok).toBe(false);
  });

  it("reports a missing right when RLS filters the write", async () => {
    installFake((q) => (q.op === "insert" ? { data: [], error: null } : undefined));
    expect(await setPeriodLock({ year: 2026, month: 9, locked: true })).toEqual({
      ok: false,
      error: "Droit « Clôture des périodes » requis.",
    });
  });

  it("unlocks an existing lock with the current user", async () => {
    const fake = installFake((q) =>
      q.op === "select" ? { data: { id: "lock-1" }, error: null } : { data: [{ id: "lock-1" }], error: null },
    );
    expect((await setPeriodLock({ year: 2026, month: 9, locked: false })).ok).toBe(true);
    expect(fake.queries[1]).toMatchObject({ op: "update", payload: { unlocked_by: "u-super" } });
  });
});
