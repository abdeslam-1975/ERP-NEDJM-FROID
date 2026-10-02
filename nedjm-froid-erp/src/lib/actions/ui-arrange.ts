"use server";

import { revalidatePath } from "next/cache";
import { getWorkspaceProfile } from "@/lib/auth/get-workspace";
import { createClient } from "@/lib/supabase/server";
import { findItem, isGroupKey, keysOfTabset, rhSectionFromGroup, rhSectionGroupKey } from "@/lib/ui/registry";

export type ActionResult<T = void> = { ok: true; data: T } | { ok: false; error: string };

/** "me": the user's own order (sys_ui_user_order); "all": the order everyone gets (super admin only). */
export type ArrangeTarget = "me" | "all";

export type ArrangeList = {
  tabset: string;
  /** Every item of the list in its new order; side menu modules carry their group, HR tabs their section. */
  items: { key: string; group_key?: string | null }[];
};

const MISSING_TABLE = "Le rangement personnel n'est pas encore installé : appliquez la migration 20261014090000_ui_user_order.";

type Row = { item_key: string; sort_order: number; group_key: string | null };

function validGroup(tabset: string, group: string | null | undefined): string | null {
  if (!group) return null;
  if (tabset === "nav") return isGroupKey(group) ? group : null;
  if (tabset === "rh") return group.startsWith("group.rh_") && rhSectionFromGroup(group) ? group : null;
  return null;
}

const isGrouped = (key: string) => key.startsWith("nav.") || key.startsWith("rh.");

/** Default group of an item: its side menu group, or its HR section ("group.rh_<section>"). */
function defaultGroup(key: string): string | null {
  const item = findItem(key)?.item;
  if (!item) return null;
  if (key.startsWith("rh.")) return item.section ? rhSectionGroupKey(item.section) : null;
  return item.group ?? null;
}

/** The group to store: null when it is the one the item already gets. */
function groupToStore(key: string, wanted: string | null, following: string | null): string | null {
  if (!wanted || !isGrouped(key)) return null;
  const same = key.startsWith("rh.") ? rhSectionFromGroup(wanted) === rhSectionFromGroup(following) : wanted === following;
  return same ? null : wanted;
}

function validRows(lists: ArrangeList[]): { ok: true; rows: Row[] } | { ok: false; error: string } {
  if (!Array.isArray(lists) || !lists.length || lists.length > 40) return { ok: false, error: "Rien à enregistrer." };
  const seen = new Set<string>();
  const rows: Row[] = [];
  for (const list of lists) {
    const allowed = keysOfTabset(list.tabset);
    if (!allowed) return { ok: false, error: "Liste inconnue." };
    if (!Array.isArray(list.items) || list.items.length > allowed.length) return { ok: false, error: "Liste invalide." };
    list.items.forEach((item, index) => {
      if (!allowed.includes(item.key) || seen.has(item.key)) return;
      seen.add(item.key);
      const group = validGroup(list.tabset, item.group_key);
      rows.push({ item_key: item.key, sort_order: (index + 1) * 10, group_key: group });
    });
    if (list.items.some((item) => !allowed.includes(item.key))) return { ok: false, error: "Élément inconnu dans la liste." };
  }
  return { ok: true, rows };
}

function done() {
  revalidatePath("/", "layout");
}

export async function saveArrangement(input: { target: ArrangeTarget; lists: ArrangeList[] }): Promise<ActionResult<{ count: number }>> {
  const ws = await getWorkspaceProfile();
  if (!ws) return { ok: false, error: "Session expirée." };
  if (input.target !== "me" && input.target !== "all") return { ok: false, error: "Destination invalide." };
  if (input.target === "all" && !ws.isSuperAdmin) return { ok: false, error: "Réservé au SUPER_ADMIN." };
  const checked = validRows(input.lists);
  if (!checked.ok) return checked;
  const supabase = await createClient();
  const keys = checked.rows.map((r) => r.item_key);

  const groupedKeys = keys.filter(isGrouped);
  const adminGroups = new Map<string, string | null>();
  if (groupedKeys.length) {
    const { data, error } = await supabase.from("sys_ui_item_overrides").select("item_key, group_key").in("item_key", groupedKeys);
    if (error) return { ok: false, error: error.message };
    for (const row of data ?? []) adminGroups.set(row.item_key, row.group_key);
  }

  if (input.target === "all") {
    const rows = checked.rows.map((r) => ({
      item_key: r.item_key,
      sort_order: r.sort_order,
      group_key: groupToStore(r.item_key, r.group_key, defaultGroup(r.item_key)),
    }));
    const { error } = await supabase.from("sys_ui_item_overrides").upsert(rows, { onConflict: "item_key" });
    if (error) return { ok: false, error: error.message };
    // The super admin now sees the order everyone gets, without an own order on top of it.
    await supabase.from("sys_ui_user_order").delete().eq("user_id", ws.id).in("item_key", keys);
    done();
    return { ok: true, data: { count: rows.length } };
  }

  const rows = checked.rows.map((r) => {
    const following = adminGroups.get(r.item_key) ?? defaultGroup(r.item_key);
    return {
      user_id: ws.id,
      item_key: r.item_key,
      sort_order: r.sort_order,
      group_key: groupToStore(r.item_key, r.group_key, following),
    };
  });
  const { error } = await supabase.from("sys_ui_user_order").upsert(rows, { onConflict: "user_id,item_key" });
  if (error) return { ok: false, error: /sys_ui_user_order/.test(error.message) ? MISSING_TABLE : error.message };
  done();
  return { ok: true, data: { count: rows.length } };
}

/**
 * Back to the default order of the given lists. "me": drops the user's own order (the super admin's order applies
 * again); "all": clears the super admin's positions and groups, keeping the renamed labels.
 */
export async function resetArrangement(input: { target: ArrangeTarget; tabsets: string[] }): Promise<ActionResult> {
  const ws = await getWorkspaceProfile();
  if (!ws) return { ok: false, error: "Session expirée." };
  if (input.target === "all" && !ws.isSuperAdmin) return { ok: false, error: "Réservé au SUPER_ADMIN." };
  if (!Array.isArray(input.tabsets) || !input.tabsets.length || input.tabsets.length > 40) {
    return { ok: false, error: "Rien à rétablir." };
  }
  const keys: string[] = [];
  for (const tabset of input.tabsets) {
    const list = keysOfTabset(tabset);
    if (!list) return { ok: false, error: "Liste inconnue." };
    keys.push(...list);
  }
  const supabase = await createClient();
  if (input.target === "all") {
    const { error } = await supabase
      .from("sys_ui_item_overrides")
      .update({ sort_order: null, group_key: null })
      .in("item_key", keys);
    if (error) return { ok: false, error: error.message };
  }
  const { error } = await supabase.from("sys_ui_user_order").delete().eq("user_id", ws.id).in("item_key", keys);
  if (error && !/sys_ui_user_order/.test(error.message)) return { ok: false, error: error.message };
  done();
  return { ok: true, data: undefined };
}
