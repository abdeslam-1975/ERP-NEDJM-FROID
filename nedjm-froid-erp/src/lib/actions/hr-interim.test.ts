import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseFake, type FakeQuery, type FakeRpc } from "@/test/supabase-fake";

const h = vi.hoisted(() => ({
  gate: { ok: true } as { ok: true; workspace?: unknown } | { ok: false; error: string },
  fake: null as null | ReturnType<typeof import("@/test/supabase-fake").createSupabaseFake>,
  revalidated: [] as string[],
}));

vi.mock("next/cache", () => ({ revalidatePath: (p: string) => h.revalidated.push(p) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => h.fake!.client }));
vi.mock("@/lib/auth/require-roles", () => ({ requireHrSalaryValues: async () => h.gate }));
vi.mock("@/lib/actions/hr-bulletin", () => ({
  getHrBulletinSettings: async () => ({ ok: true, data: { employer_name: "NEDJM FROID" } }),
}));

import { issueInterimStatement, saveAgency, setInterimStatementStatus } from "./hr-interim";

const AGENCY = "11111111-1111-4111-8111-111111111111";
const STATEMENT = "22222222-2222-4222-8222-222222222222";

const agencyInput = {
  code: " ag-01 ",
  name: " Agence Test ",
  nif: "",
  nis: null,
  rc: "RC1",
  address: "",
  phone: "",
  email: "",
  contact_name: "",
  default_daily_rate: 2500,
  markup_pct: 10,
  vat_pct: 19,
  is_active: true,
  notes: "",
};

function installFake(onQuery?: (q: FakeQuery) => ReturnType<NonNullable<Parameters<typeof createSupabaseFake>[0]["onQuery"]>>, onRpc?: (r: FakeRpc) => { data: unknown; error: null }) {
  h.fake = createSupabaseFake({ onQuery, onRpc });
  return h.fake;
}

function billingWorld(opts: { contractRate: number | null; agencyRate: number; insertError?: { message: string; code: string } }) {
  return installFake(
    (q) => {
      if (q.table === "hr_interim_agencies") {
        return { data: { id: AGENCY, default_daily_rate: opts.agencyRate, markup_pct: 10, vat_pct: 19 }, error: null };
      }
      if (q.table === "hr_contracts") {
        return {
          data: [
            {
              id: "c1",
              employee_id: "e1",
              site_id: "s1",
              start_date: "2026-09-01",
              end_date: null,
              interim_daily_rate: opts.contractRate,
              poste_fr: "Manoeuvre",
              employee: { matricule: "I001", last_name: "BENALI", first_name: "Omar" },
              site: { name_fr: "Chantier A" },
            },
          ],
          error: null,
        };
      }
      if (q.table === "hr_attendance") {
        return {
          data: [
            { employee_id: "e1", site_id: "s1", work_date: "2026-09-01", legend_code: "P" },
            { employee_id: "e1", site_id: "s1", work_date: "2026-09-02", legend_code: "P" },
          ],
          error: null,
        };
      }
      if (q.table === "ref_legendes") {
        return { data: [{ code: "P", label_fr: "Présent", label_ar: null, coefficient: 1, counts_as_presence: true }], error: null };
      }
      if (q.table === "hr_interim_statements" && q.op === "insert") {
        return opts.insertError ? { data: null, error: opts.insertError } : { data: { id: STATEMENT }, error: null };
      }
      return undefined;
    },
    () => ({ data: "000007/26", error: null }),
  );
}

beforeEach(() => {
  h.gate = { ok: true, workspace: {} };
  h.revalidated = [];
  h.fake = null;
});

describe("saveAgency", () => {
  it("refuses users without salary-value rights before touching the database", async () => {
    h.gate = { ok: false, error: "Réservé" };
    const fake = installFake();
    expect(await saveAgency(agencyInput)).toEqual({ ok: false, error: "Réservé" });
    expect(fake.queries).toHaveLength(0);
  });

  it("validates code and percentages", async () => {
    installFake();
    expect((await saveAgency({ ...agencyInput, code: "a" })).ok).toBe(false);
    expect((await saveAgency({ ...agencyInput, markup_pct: 150 })).ok).toBe(false);
    expect((await saveAgency({ ...agencyInput, default_daily_rate: -1 })).ok).toBe(false);
    expect((await saveAgency({ ...agencyInput, name: "  " })).ok).toBe(false);
  });

  it("normalises the payload and revalidates the screens", async () => {
    const fake = installFake(() => ({ data: { id: AGENCY }, error: null }));
    const r = await saveAgency(agencyInput);
    expect(r).toEqual({ ok: true, data: { id: AGENCY } });
    expect(fake.queries[0]).toMatchObject({ table: "hr_interim_agencies", op: "insert" });
    expect(fake.queries[0].payload).toMatchObject({ code: "AG-01", name: "Agence Test", nif: null, rc: "RC1", markup_pct: 10 });
    expect(h.revalidated).toEqual(expect.arrayContaining(["/rh/interim", "/rh/contrats"]));
  });

  it("maps duplicate codes to a readable error", async () => {
    installFake(() => ({ data: null, error: { message: "dup", code: "23505" } }));
    expect(await saveAgency(agencyInput)).toEqual({ ok: false, error: "Ce code d'agence existe déjà." });
  });
});

describe("issueInterimStatement", () => {
  it("issues a numbered statement with frozen amounts", async () => {
    const fake = billingWorld({ contractRate: 3000, agencyRate: 2500 });
    const r = await issueInterimStatement({ agency_id: AGENCY, year: 2026, month: 9 });
    expect(r).toEqual({ ok: true, data: { id: STATEMENT, statement_no: "000007/26" } });
    expect(fake.rpcs).toEqual([{ fn: "hr_next_doc_number", args: { p_prefix: "ITM" } }]);
    const insert = fake.queries.find((q) => q.table === "hr_interim_statements" && q.op === "insert");
    expect(insert?.payload).toMatchObject({
      statement_no: "000007/26",
      period_year: 2026,
      period_month: 9,
      site_id: null,
      days_total: 2,
      amount_ht: 6600,
      amount_vat: 1254,
      amount_ttc: 7854,
    });
    const attendance = fake.queries.find((q) => q.table === "hr_attendance");
    expect(attendance?.filters).toContainEqual(["eq", "status_code", "VALIDATED"]);
  });

  it("blocks the statement when a worker has no daily rate", async () => {
    const fake = billingWorld({ contractRate: null, agencyRate: 0 });
    const r = await issueInterimStatement({ agency_id: AGENCY, year: 2026, month: 9 });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toContain("Taux journalier manquant");
    expect(fake.rpcs).toHaveLength(0);
  });

  it("explains the live-statement uniqueness rule", async () => {
    billingWorld({ contractRate: 3000, agencyRate: 0, insertError: { message: "dup", code: "23505" } });
    const r = await issueInterimStatement({ agency_id: AGENCY, year: 2026, month: 9 });
    expect(!r.ok && r.error).toContain("annulez-le d'abord");
  });

  it("rejects malformed agency ids", async () => {
    const fake = installFake();
    expect((await issueInterimStatement({ agency_id: "x", year: 2026, month: 9 })).ok).toBe(false);
    expect(fake.queries).toHaveLength(0);
  });
});

describe("setInterimStatementStatus", () => {
  it("sends the invoice reference when reconciling and the reason when cancelling", async () => {
    const fake = installFake(() => ({ data: [{ id: STATEMENT }], error: null }));
    await setInterimStatementStatus({ id: STATEMENT, status: "RECONCILED", agency_invoice_ref: " FA-12 ", agency_invoice_amount: 7854 });
    await setInterimStatementStatus({ id: STATEMENT, status: "CANCELLED", reason: " Erreur " });
    expect(fake.queries[0].payload).toEqual({ status_code: "RECONCILED", agency_invoice_ref: "FA-12", agency_invoice_amount: 7854 });
    expect(fake.queries[1].payload).toEqual({ status_code: "CANCELLED", cancelled_reason: "Erreur" });
  });

  it("reports rows filtered out by RLS", async () => {
    installFake(() => ({ data: [], error: null }));
    expect(await setInterimStatementStatus({ id: STATEMENT, status: "ISSUED" })).toEqual({ ok: false, error: "Mise à jour refusée." });
  });
});
