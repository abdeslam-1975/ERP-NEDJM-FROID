"use server";

import { createClient } from "@/lib/supabase/server";
import { getWorkspaceProfile } from "@/lib/auth/get-workspace";
import type { FilterChip, FilterSnapshot } from "@/lib/hr/screen-filter";

type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

const SCREEN = /^[a-z][a-z0-9_.]+$/;

export type FilterAction = "personal" | "publish" | "dismiss" | "clear-personal" | "clear-shared";

function cleanChips(raw: unknown): FilterChip[] {
  if (!Array.isArray(raw)) return [];
  const chips: FilterChip[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const kind = row.kind === "text" || row.kind === "value" ? row.kind : null;
    if (!kind) continue;
    const label = String(row.label ?? "").trim().slice(0, 80);
    const value = String(row.value ?? "").trim().slice(0, 80);
    const field = String(row.field ?? "").trim().slice(0, 40);
    const id = String(row.id ?? "").trim().slice(0, 40) || `c${chips.length + 1}`;
    if (!label || !value) continue;
    if (kind === "value" && !/^[a-z][a-z0-9_]*$/.test(field)) continue;
    chips.push(kind === "text" ? { id, kind, label, value } : { id, kind, field, label, value });
    if (chips.length >= 12) break;
  }
  return chips;
}

async function readSnapshot(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  screen: string,
  isSuperAdmin: boolean,
): Promise<ActionResult<FilterSnapshot>> {
  const [personal, shared] = await Promise.all([
    supabase
      .from("sys_screen_filters")
      .select("chips, chips_at, dismissed_shared_at")
      .eq("user_id", userId)
      .eq("screen_key", screen)
      .maybeSingle(),
    supabase.from("sys_screen_filter_shared").select("chips, chips_at").eq("screen_key", screen).maybeSingle(),
  ]);
  if (personal.error) return { ok: false, error: personal.error.message };
  if (shared.error) return { ok: false, error: shared.error.message };
  return {
    ok: true,
    data: {
      personalChips: cleanChips(personal.data?.chips),
      personalAt: personal.data?.chips_at ?? null,
      dismissedSharedAt: personal.data?.dismissed_shared_at ?? null,
      sharedChips: shared.data ? cleanChips(shared.data.chips) : null,
      sharedAt: shared.data?.chips_at ?? null,
      isSuperAdmin,
    },
  };
}

export async function loadScreenFilter(screen: string): Promise<ActionResult<FilterSnapshot>> {
  if (!SCREEN.test(screen)) return { ok: false, error: "Écran inconnu." };
  const workspace = await getWorkspaceProfile();
  if (!workspace) return { ok: false, error: "Session expirée." };
  const supabase = await createClient();
  return readSnapshot(supabase, workspace.id, screen, workspace.isSuperAdmin);
}

export async function applyScreenFilter(input: {
  screen: string;
  action: FilterAction;
  chips?: FilterChip[];
}): Promise<ActionResult<FilterSnapshot>> {
  if (!SCREEN.test(input.screen)) return { ok: false, error: "Écran inconnu." };
  const workspace = await getWorkspaceProfile();
  if (!workspace) return { ok: false, error: "Session expirée." };
  const supabase = await createClient();
  const chips = cleanChips(input.chips ?? []);
  const now = new Date().toISOString();

  if (input.action === "publish" || input.action === "clear-shared") {
    if (!workspace.isSuperAdmin) return { ok: false, error: "Réservé à SUPER_ADMIN." };
  }

  if (input.action === "personal") {
    const { error } = await supabase.from("sys_screen_filters").upsert(
      { user_id: workspace.id, screen_key: input.screen, chips, chips_at: now },
      { onConflict: "user_id,screen_key" },
    );
    if (error) return { ok: false, error: error.message };
  }

  if (input.action === "clear-personal") {
    const { error } = await supabase.from("sys_screen_filters").upsert(
      {
        user_id: workspace.id,
        screen_key: input.screen,
        chips: [],
        chips_at: now,
        dismissed_shared_at: now,
      },
      { onConflict: "user_id,screen_key" },
    );
    if (error) return { ok: false, error: error.message };
  }

  if (input.action === "dismiss") {
    const existing = await supabase
      .from("sys_screen_filters")
      .select("chips, chips_at")
      .eq("user_id", workspace.id)
      .eq("screen_key", input.screen)
      .maybeSingle();
    if (existing.error) return { ok: false, error: existing.error.message };
    const { error } = await supabase.from("sys_screen_filters").upsert(
      {
        user_id: workspace.id,
        screen_key: input.screen,
        chips: cleanChips(existing.data?.chips),
        chips_at: existing.data?.chips_at ?? now,
        dismissed_shared_at: now,
      },
      { onConflict: "user_id,screen_key" },
    );
    if (error) return { ok: false, error: error.message };
  }

  if (input.action === "publish") {
    const { error } = await supabase.from("sys_screen_filter_shared").upsert(
      { screen_key: input.screen, chips, chips_at: now, updated_by: workspace.id },
      { onConflict: "screen_key" },
    );
    if (error) return { ok: false, error: error.message };
    const saved = await supabase
      .from("sys_screen_filter_shared")
      .select("chips_at")
      .eq("screen_key", input.screen)
      .maybeSingle();
    const sharedAt = saved.data?.chips_at ? Date.parse(saved.data.chips_at) : Date.parse(now);
    if (Number.isFinite(sharedAt)) {
      await supabase
        .from("sys_screen_filters")
        .update({ chips_at: new Date(sharedAt - 1000).toISOString() })
        .eq("user_id", workspace.id)
        .eq("screen_key", input.screen);
    }
  }

  if (input.action === "clear-shared") {
    const { error } = await supabase.from("sys_screen_filter_shared").delete().eq("screen_key", input.screen);
    if (error) return { ok: false, error: error.message };
  }

  return readSnapshot(supabase, workspace.id, input.screen, workspace.isSuperAdmin);
}
