"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { signalPayrollInputChange } from "@/lib/hr/payroll-input-signal";
import { payrollSignalNotice } from "@/lib/decisions/catalog";
import { isFirstOfMonth } from "@/lib/hr/assignments";

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export type SiteWilayaVersion = {
  id: string;
  effective_from: string;
  wilaya_code: string;
  wilaya_name: string;
  reason: string;
  document_ref: string | null;
  author_name: string | null;
};

export type SiteWilayaPanel = {
  rows: SiteWilayaVersion[];
  first_changeable: string;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uuid = z.string().regex(UUID_RE, "Identifiant invalide.");
const code = z.string().regex(/^\d{2}$/, "Wilaya invalide.");

const confirmSchema = z.object({
  site_id: uuid,
  wilaya_code: code,
  reason: z.string().trim().min(3, "Motif requis (3 caractères min.)").max(300),
});

const changeSchema = z.object({
  site_id: uuid,
  wilaya_code: code,
  effective_from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date d'effet invalide")
    .refine(isFirstOfMonth, "Un changement de wilaya prend effet le 1er d'un mois."),
  reason: z.string().trim().min(3, "Motif requis (3 caractères min.)").max(300),
  document_ref: z.string().trim().max(200).optional().default(""),
});

type Join<T> = T | T[] | null;
const one = <T,>(v: Join<T>): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

function revalidate() {
  revalidatePath("/referentiels/chantiers");
  revalidatePath("/rh/qualite-donnees");
  revalidatePath("/rh/paie");
}

export async function listSiteWilayaHistory(siteId: string): Promise<ActionResult<SiteWilayaPanel>> {
  if (!UUID_RE.test(siteId)) return { ok: false, error: "Chantier invalide." };
  const supabase = await createClient();
  const [rows, open] = await Promise.all([
    supabase
      .from("ref_site_wilaya_history")
      .select(
        "id, effective_from, wilaya_code, reason, document_ref, wilaya:ref_wilayas ( name_fr ), author:sys_users!created_by ( full_name )",
      )
      .eq("site_id", siteId)
      .order("effective_from", { ascending: false }),
    supabase.rpc("hr_first_changeable_month"),
  ]);
  if (rows.error) return { ok: false, error: rows.error.message };
  if (open.error) return { ok: false, error: open.error.message };
  return {
    ok: true,
    data: {
      rows: (rows.data ?? []).map((r) => ({
        id: String(r.id),
        effective_from: String(r.effective_from).slice(0, 10),
        wilaya_code: String(r.wilaya_code),
        wilaya_name: one(r.wilaya as Join<{ name_fr: string }>)?.name_fr ?? String(r.wilaya_code),
        reason: String(r.reason ?? ""),
        document_ref: r.document_ref ?? null,
        author_name: one(r.author as Join<{ full_name: string | null }>)?.full_name ?? null,
      })),
      first_changeable: String(open.data ?? "").slice(0, 10),
    },
  };
}

/** Existing site: the coded wilaya it has always been in (dated from the origin). */
export async function confirmSiteWilaya(input: unknown): Promise<ActionResult<{ warning: string | null }>> {
  const parsed = confirmSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Données invalides" };
  const p = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("ref_site_wilaya_confirm", {
    p_site: p.site_id,
    p_code: p.wilaya_code,
    p_reason: p.reason,
  });
  if (error) return { ok: false, error: error.message };
  const signal = await signalPayrollInputChange(supabase, {
    source: "SITE_WILAYA",
    siteId: p.site_id,
    detail: "Wilaya du chantier confirmée",
  });
  revalidate();
  return { ok: true, data: { warning: signal.ok ? null : `Paie brouillon non signalée : ${signal.error}` } };
}

export async function changeSiteWilaya(
  input: unknown,
): Promise<ActionResult<{ payroll_notice: string | null; warning: string | null }>> {
  const parsed = changeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Données invalides" };
  const p = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("ref_site_wilaya_change", {
    p_site: p.site_id,
    p_code: p.wilaya_code,
    p_from: p.effective_from,
    p_reason: p.reason,
    p_document: p.document_ref || null,
  });
  if (error) return { ok: false, error: error.message };
  const signal = await signalPayrollInputChange(supabase, {
    source: "SITE_WILAYA",
    siteId: p.site_id,
    detail: `Wilaya du chantier modifiée au ${p.effective_from.split("-").reverse().join("/")}`,
  });
  revalidate();
  return {
    ok: true,
    data: {
      payroll_notice: signal.ok ? payrollSignalNotice(signal.data) : null,
      warning: signal.ok ? null : `Paie brouillon non signalée : ${signal.error}`,
    },
  };
}

export async function deleteSiteWilayaChange(input: unknown): Promise<ActionResult<{ warning: string | null }>> {
  const parsed = z.object({ id: uuid }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Changement invalide." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("ref_site_wilaya_delete", { p_id: parsed.data.id });
  if (error) return { ok: false, error: error.message };
  const signal = await signalPayrollInputChange(supabase, {
    source: "SITE_WILAYA",
    siteId: String(data),
    detail: "Changement de wilaya supprimé",
  });
  revalidate();
  return { ok: true, data: { warning: signal.ok ? null : `Paie brouillon non signalée : ${signal.error}` } };
}
