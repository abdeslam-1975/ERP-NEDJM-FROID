"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceProfile } from "@/lib/auth/get-workspace";
import { UI_NAV_GROUPS } from "@/lib/ui/registry";

export type CustomScreenRow = {
  code: string;
  label_fr: string;
  label_ar: string;
  group_key: string;
  icon: string;
  body: string;
};

const screenSchema = z.object({
  code: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z][a-z0-9_]{1,30}$/, "Code : lettres minuscules, chiffres et _."),
  label_fr: z.string().trim().min(1, "Nom français requis.").max(80),
  label_ar: z.string().trim().max(80).default(""),
  group_key: z.string().refine((key) => UI_NAV_GROUPS.some((group) => group.key === key), "Groupe inconnu."),
  body: z.string().max(8000).default(""),
});

async function superAdmin() {
  const workspace = await getWorkspaceProfile();
  if (!workspace?.isSuperAdmin) return null;
  return workspace;
}

export async function listCustomScreens(): Promise<CustomScreenRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sys_ui_custom_screens")
    .select("code, label_fr, label_ar, group_key, icon, body")
    .order("created_at");
  if (error) return [];
  return (data ?? []) as CustomScreenRow[];
}

export async function saveCustomScreen(input: unknown): Promise<{ ok: true } | { ok: false; error: string }> {
  const workspace = await superAdmin();
  if (!workspace) return { ok: false, error: "Réservé au super administrateur." };
  const parsed = screenSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Données invalides" };
  const supabase = await createClient();
  const { error } = await supabase.from("sys_ui_custom_screens").upsert(
    {
      code: parsed.data.code,
      label_fr: parsed.data.label_fr,
      label_ar: parsed.data.label_ar,
      group_key: parsed.data.group_key,
      body: parsed.data.body,
      created_by: workspace.id,
    },
    { onConflict: "code" },
  );
  if (error) return { ok: false, error: error.message };
  revalidatePath("/", "layout");
  revalidatePath(`/e/${parsed.data.code}`);
  revalidatePath("/parametres/interface");
  return { ok: true };
}

export async function deleteCustomScreen(code: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await superAdmin())) return { ok: false, error: "Réservé au super administrateur." };
  if (!/^[a-z][a-z0-9_]{1,30}$/.test(code)) return { ok: false, error: "Code invalide." };
  const supabase = await createClient();
  const { error } = await supabase.from("sys_ui_custom_screens").delete().eq("code", code);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/", "layout");
  revalidatePath("/parametres/interface");
  return { ok: true };
}
