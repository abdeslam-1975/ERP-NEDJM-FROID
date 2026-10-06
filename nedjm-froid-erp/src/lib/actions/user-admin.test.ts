import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseFake, type FakeQuery, type FakeRpc } from "@/test/supabase-fake";

type Ws = {
  id: string;
  email: string;
  isSuperAdmin: boolean;
  roles: { roleCode: string; siteId: string | null }[];
};

const h = vi.hoisted(() => ({
  ws: null as null | Ws,
  fake: null as null | ReturnType<typeof import("@/test/supabase-fake").createSupabaseFake>,
}));

vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => h.fake!.client }));
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    ...h.fake!.client,
    auth: { admin: { updateUserById: async () => ({ data: null, error: null }) } },
  }),
}));
vi.mock("@/lib/auth/get-workspace", () => ({ getWorkspaceProfile: async () => h.ws }));

import { assignUserRole, deleteUser, removeUserRole, updateUserProfile } from "./user-admin";

const USER = "11111111-1111-4111-8111-111111111111";
const ROLE = "22222222-2222-4222-8222-222222222222";
const SITE = "33333333-3333-4333-8333-333333333333";
const ASSIGN = "44444444-4444-4444-8444-444444444444";

const SUPER: Ws = { id: "u-super", email: "s@x.dz", isSuperAdmin: true, roles: [{ roleCode: "SUPER_ADMIN", siteId: null }] };
const ADMIN_RH: Ws = { id: "u-rh", email: "rh@x.dz", isSuperAdmin: false, roles: [{ roleCode: "ADMIN_RH", siteId: null }] };

type Answer = { data: unknown; error: null | { message: string }; count?: number };
type RpcAnswer = { data: unknown; error: null | { message: string; code?: string } };

function installFake(onQuery?: (q: FakeQuery) => Answer | undefined, onRpc?: (r: FakeRpc) => RpcAnswer | undefined) {
  h.fake = createSupabaseFake({
    onQuery: onQuery as (q: FakeQuery) => { data: unknown; error: null },
    onRpc: onRpc as (r: FakeRpc) => { data: unknown; error: null },
  });
  return h.fake;
}

const role = (over: Record<string, unknown> = {}) => ({
  id: ROLE,
  code: "CHEF_CHANTIER",
  hierarchy_level: 40,
  site_scoped_allowed: true,
  is_active: true,
  ...over,
});

beforeEach(() => {
  h.ws = SUPER;
  installFake();
});

describe("assignUserRole", () => {
  it("refuses a level ≥ 80 role to a non SUPER_ADMIN", async () => {
    h.ws = ADMIN_RH;
    const fake = installFake((q) => {
      if (q.table === "sys_roles") return { data: role({ code: "ADMIN_FINANCE", hierarchy_level: 80 }), error: null };
      if (q.table === "sys_user_site_roles" && q.op === "select") return { data: [], error: null };
      return undefined;
    });
    const r = await assignUserRole({ user_id: USER, role_id: ROLE, site_id: null });
    expect(r).toEqual({ ok: false, error: "Seul SUPER_ADMIN peut attribuer un rôle de niveau ≥ 80." });
    expect(fake.queries.some((q) => q.op === "insert")).toBe(false);
  });

  it("keeps SUPER_ADMIN global", async () => {
    installFake((q) => (q.table === "sys_roles" ? { data: role({ code: "SUPER_ADMIN", hierarchy_level: 100 }), error: null } : undefined));
    const r = await assignUserRole({ user_id: USER, role_id: ROLE, site_id: SITE });
    expect(r).toEqual({ ok: false, error: "SUPER_ADMIN doit être global (sans site)." });
  });

  it("inserts the grant and returns it with labels", async () => {
    const fake = installFake((q) => {
      if (q.table === "sys_roles") return { data: role(), error: null };
      if (q.table === "sys_user_site_roles" && q.op === "insert") {
        return {
          data: { id: ASSIGN, role_id: ROLE, site_id: SITE, role: { code: "CHEF_CHANTIER", label_fr: "Chef de chantier" }, site: { name_fr: "Hassi" } },
          error: null,
        };
      }
      return undefined;
    });
    const r = await assignUserRole({ user_id: USER, role_id: ROLE, site_id: SITE });
    expect(r).toEqual({
      ok: true,
      data: { id: ASSIGN, role_id: ROLE, role_code: "CHEF_CHANTIER", role_label: "Chef de chantier", site_id: SITE, site_name: "Hassi" },
    });
    expect(fake.queries.find((q) => q.op === "insert")).toMatchObject({
      table: "sys_user_site_roles",
      payload: { user_id: USER, role_id: ROLE, site_id: SITE, created_by: "u-super" },
    });
    expect(fake.rpcs.map((x) => x.fn)).toContain("sys_audit_write");
  });

  it("explains a duplicate grant", async () => {
    installFake((q) => {
      if (q.table === "sys_roles") return { data: role(), error: null };
      if (q.op === "insert") return { data: null, error: { message: "duplicate key value violates unique constraint" } };
      return undefined;
    });
    const r = await assignUserRole({ user_id: USER, role_id: ROLE, site_id: "" });
    expect(r).toEqual({ ok: false, error: "Ce compte a déjà ce rôle sur ce périmètre." });
  });
});

describe("removeUserRole", () => {
  const assignment = (userId = USER) => ({ id: ASSIGN, user_id: userId, role_id: ROLE, site_id: null, role: { code: "CHEF_CHANTIER" } });

  it("never removes the caller's own roles", async () => {
    const fake = installFake((q) => (q.table === "sys_user_site_roles" && q.single ? { data: assignment("u-super"), error: null } : undefined));
    const r = await removeUserRole({ assignment_id: ASSIGN });
    expect(r).toEqual({ ok: false, error: "Vous ne pouvez pas retirer vos propres rôles." });
    expect(fake.queries.some((q) => q.op === "delete")).toBe(false);
  });

  it("keeps at least one role on the account", async () => {
    const fake = installFake((q) => {
      if (q.single) return { data: assignment(), error: null };
      if (q.op === "select") return { data: null, error: null, count: 1 };
      return undefined;
    });
    const r = await removeUserRole({ assignment_id: ASSIGN });
    expect(r.ok).toBe(false);
    expect(fake.queries.some((q) => q.op === "delete")).toBe(false);
  });

  it("deletes the grant through the admin session", async () => {
    const fake = installFake((q) => {
      if (q.single) return { data: assignment(), error: null };
      if (q.op === "delete") return { data: [{ id: ASSIGN }], error: null };
      if (q.op === "select") return { data: null, error: null, count: 2 };
      return undefined;
    });
    expect(await removeUserRole({ assignment_id: ASSIGN })).toEqual({ ok: true, data: { id: ASSIGN } });
    expect(fake.queries.find((q) => q.op === "delete")?.filters).toContainEqual(["eq", "id", ASSIGN]);
  });

  it("translates the last SUPER_ADMIN guard", async () => {
    installFake((q) => {
      if (q.single) return { data: assignment(), error: null };
      if (q.op === "delete") return { data: null, error: { message: "Cannot remove the last SUPER_ADMIN" } };
      if (q.op === "select") return { data: null, error: null, count: 2 };
      return undefined;
    });
    expect(await removeUserRole({ assignment_id: ASSIGN })).toEqual({
      ok: false,
      error: "Impossible de retirer le dernier SUPER_ADMIN actif.",
    });
  });
});

describe("updateUserProfile", () => {
  it("stores a blank phone as null", async () => {
    const fake = installFake((q) =>
      q.table === "sys_users" ? { data: { id: USER, full_name: "Ali Benali", phone: null }, error: null } : undefined,
    );
    const r = await updateUserProfile({ user_id: USER, full_name: "  Ali Benali ", phone: "  " });
    expect(r).toEqual({ ok: true, data: { id: USER, full_name: "Ali Benali", phone: null } });
    expect(fake.queries[0]).toMatchObject({ op: "update", payload: { full_name: "Ali Benali", phone: null } });
  });

  it("is reserved to SUPER_ADMIN and ADMIN_RH", async () => {
    h.ws = { ...ADMIN_RH, roles: [{ roleCode: "GERANT", siteId: null }] };
    const r = await updateUserProfile({ user_id: USER, full_name: "Ali", phone: null });
    expect(r.ok).toBe(false);
  });
});

describe("deleteUser", () => {
  const profile = (q: FakeQuery) =>
    q.table === "sys_users" ? { data: { id: USER, email: "ali@x.dz", full_name: "Ali" }, error: null } : undefined;

  it("never deletes the caller's own account", async () => {
    h.ws = { ...SUPER, id: USER };
    const fake = installFake(profile);
    expect(await deleteUser({ user_id: USER })).toEqual({
      ok: false,
      error: "Vous ne pouvez pas supprimer votre propre compte.",
    });
    expect(fake.rpcs.some((r) => r.fn === "erp_delete_user")).toBe(false);
  });

  it("keeps accounts of level ≥ 80 for SUPER_ADMIN", async () => {
    h.ws = ADMIN_RH;
    const fake = installFake((q) =>
      q.table === "sys_user_site_roles"
        ? { data: [{ site_id: null, role: { code: "ADMIN_FINANCE", hierarchy_level: 80 } }], error: null }
        : profile(q),
    );
    const r = await deleteUser({ user_id: USER });
    expect(r).toEqual({ ok: false, error: "Seul un SUPER_ADMIN peut gérer un compte de niveau ≥ 80." });
    expect(fake.rpcs.some((x) => x.fn === "erp_delete_user")).toBe(false);
  });

  it("deletes the account in one call and audits it", async () => {
    const fake = installFake(profile);
    expect(await deleteUser({ user_id: USER })).toEqual({ ok: true, data: { id: USER } });
    expect(fake.rpcs.find((r) => r.fn === "erp_delete_user")?.args).toEqual({ p_user_id: USER });
    expect(fake.rpcs.find((r) => r.fn === "sys_audit_write")?.args).toMatchObject({
      p_action: "DELETE",
      p_table_name: "sys_users",
      p_target_id: USER,
      p_old: { email: "ali@x.dz", full_name: "Ali" },
    });
  });

  it("asks to deactivate an account that was already used", async () => {
    const fake = installFake(profile, (r) =>
      r.fn === "erp_delete_user"
        ? { data: null, error: { code: "23503", message: 'violates foreign key constraint "sys_audit_logs_user_id_fkey"' } }
        : undefined,
    );
    const r = await deleteUser({ user_id: USER });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("Désactivez-le");
    expect(fake.rpcs.some((x) => x.fn === "sys_audit_write")).toBe(false);
  });
});
