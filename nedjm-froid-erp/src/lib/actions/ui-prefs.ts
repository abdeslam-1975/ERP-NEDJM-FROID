"use server";

import { revalidatePath } from "next/cache";
import { getWorkspaceProfile } from "@/lib/auth/get-workspace";
import { createClient } from "@/lib/supabase/server";
import { isDesignValue, type Density, type DisplayMode } from "@/lib/ui/design";

export type PrefsResult = { ok: true } | { ok: false; error: string };

/** The signed-in user's own display mode and density (null = follow the application default). */
export async function saveMyDisplayPrefs(input: { mode: DisplayMode | null; density: Density | null }): Promise<PrefsResult> {
  const ws = await getWorkspaceProfile();
  if (!ws) return { ok: false, error: "Session expirée." };
  if (input.mode !== null && !isDesignValue("default_mode", input.mode)) return { ok: false, error: "Mode invalide." };
  if (input.density !== null && !isDesignValue("density", input.density)) return { ok: false, error: "Densité invalide." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("sys_ui_user_prefs")
    .upsert({ user_id: ws.id, mode: input.mode, density: input.density }, { onConflict: "user_id" });
  if (error) {
    return {
      ok: false,
      error: /sys_ui_user_prefs/.test(error.message)
        ? "Préférences indisponibles : la migration 20261013090000_ui_design n'est pas encore appliquée."
        : error.message,
    };
  }
  revalidatePath("/", "layout");
  return { ok: true };
}
