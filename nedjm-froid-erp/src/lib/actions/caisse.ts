"use server";

import { revalidatePath } from "next/cache";
import { getWorkspaceProfile } from "@/lib/auth/get-workspace";
import { workspaceHasRole } from "@/lib/auth/require-roles";
import { createClient } from "@/lib/supabase/server";
import {
  CAISSE_DEFAULT_BOX_CODE,
  CAISSE_DEFAULT_OPENING_DATE,
  caisseBuyerSchema,
  caisseOpeningDateSchema,
  caisseOpeningsSaveSchema,
} from "@/lib/validations/caisse";

export type ActionResult<T = void> = { ok: true; data: T } | { ok: false; error: string };

export type CaisseBox = {
  id: string;
  code: string;
  name: string;
  currencyCode: string;
};

export type CaisseBuyerOpening = {
  id: string;
  code: string;
  fullName: string;
  amount: number;
};

export type CaisseOpeningsData = {
  box: CaisseBox | null;
  openingDate: string;
  buyers: CaisseBuyerOpening[];
  boxOpening: number | null;
  canWrite: boolean;
};

const FALLBACK_ROLES = ["SUPER_ADMIN", "ADMIN_FINANCE"] as const;

type Supabase = Awaited<ReturnType<typeof createClient>>;

async function perm(supabase: Supabase, action: "read" | "create" | "update") {
  const { data } = await supabase.rpc("erp_has_perm", { p_screen: "caisse", p_action: action });
  return data === true;
}

async function access() {
  const workspace = await getWorkspaceProfile();
  if (!workspace) return { ok: false as const, error: "Session requise." };
  const supabase = await createClient();
  const [read, create, update] = await Promise.all([
    perm(supabase, "read"),
    perm(supabase, "create"),
    perm(supabase, "update"),
  ]);
  const fallback = workspaceHasRole(workspace, FALLBACK_ROLES);
  return {
    ok: true as const,
    supabase,
    canRead: read || fallback,
    canWrite: update || create || fallback,
  };
}

function openingDate(value: string | undefined) {
  const parsed = caisseOpeningDateSchema.safeParse(value ?? CAISSE_DEFAULT_OPENING_DATE);
  return parsed.success ? parsed.data : CAISSE_DEFAULT_OPENING_DATE;
}

async function ensureDefaultBox(supabase: Supabase, canWrite: boolean): Promise<CaisseBox | null> {
  const { data, error } = await supabase
    .from("caisse_boxes")
    .select("id, code, name, currency_code")
    .order("code")
    .limit(1);
  if (error) throw new Error(error.message);
  const existing = data?.[0];
  if (existing) {
    return {
      id: existing.id,
      code: existing.code,
      name: existing.name,
      currencyCode: existing.currency_code,
    };
  }
  if (!canWrite) return null;
  const { data: created, error: insertError } = await supabase
    .from("caisse_boxes")
    .insert({ code: CAISSE_DEFAULT_BOX_CODE, name: "Caisse principale" })
    .select("id, code, name, currency_code")
    .single();
  if (insertError || !created) throw new Error(insertError?.message ?? "Caisse introuvable.");
  return {
    id: created.id,
    code: created.code,
    name: created.name,
    currencyCode: created.currency_code,
  };
}

export async function getCaisseOpenings(date?: string): Promise<ActionResult<CaisseOpeningsData>> {
  const gate = await access();
  if (!gate.ok) return gate;
  if (!gate.canRead) return { ok: false, error: "Accès refusé à la caisse." };
  const openingDateValue = openingDate(date);
  try {
    const box = await ensureDefaultBox(gate.supabase, gate.canWrite);
    if (!box) {
      return {
        ok: true,
        data: {
          box: null,
          openingDate: openingDateValue,
          buyers: [],
          boxOpening: null,
          canWrite: false,
        },
      };
    }
    const [buyersRes, openingsRes] = await Promise.all([
      gate.supabase.from("caisse_buyers").select("id, code, full_name, active").eq("active", true).order("code"),
      gate.supabase
        .from("caisse_openings")
        .select("buyer_id, amount")
        .eq("box_id", box.id)
        .eq("opening_date", openingDateValue),
    ]);
    if (buyersRes.error) return { ok: false, error: buyersRes.error.message };
    if (openingsRes.error) return { ok: false, error: openingsRes.error.message };
    const byBuyer = new Map<string, number>();
    let boxOpening: number | null = null;
    for (const row of openingsRes.data ?? []) {
      if (row.buyer_id == null) boxOpening = Number(row.amount);
      else byBuyer.set(row.buyer_id, Number(row.amount));
    }
    return {
      ok: true,
      data: {
        box,
        openingDate: openingDateValue,
        buyers: (buyersRes.data ?? []).map((buyer) => ({
          id: buyer.id,
          code: buyer.code,
          fullName: buyer.full_name,
          amount: byBuyer.get(buyer.id) ?? 0,
        })),
        boxOpening,
        canWrite: gate.canWrite,
      },
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Lecture impossible." };
  }
}

export async function saveCaisseOpenings(input: unknown): Promise<ActionResult> {
  const gate = await access();
  if (!gate.ok) return gate;
  if (!gate.canWrite) return { ok: false, error: "Accès refusé. Écriture caisse requise." };
  const parsed = caisseOpeningsSaveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Données invalides." };
  const { error } = await gate.supabase.rpc("caisse_save_openings", {
    p_box_id: parsed.data.boxId,
    p_opening_date: parsed.data.openingDate,
    p_buyers: parsed.data.buyers.map((buyer) => ({
      buyer_id: buyer.buyerId,
      amount: buyer.amount,
    })),
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/caisse");
  return { ok: true, data: undefined };
}

export async function createCaisseBuyer(input: unknown): Promise<ActionResult<{ id: string }>> {
  const gate = await access();
  if (!gate.ok) return gate;
  if (!gate.canWrite) return { ok: false, error: "Accès refusé. Écriture caisse requise." };
  const parsed = caisseBuyerSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Données invalides." };
  const { data, error } = await gate.supabase
    .from("caisse_buyers")
    .insert({ code: parsed.data.code, full_name: parsed.data.fullName })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "Acheteur non créé." };
  revalidatePath("/caisse");
  return { ok: true, data: { id: data.id } };
}
