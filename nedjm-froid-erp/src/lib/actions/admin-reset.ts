"use server";

import { revalidatePath } from "next/cache";
import { getWorkspaceProfile } from "@/lib/auth/get-workspace";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { RESET_CONFIRM_WORD, resetStorageTargets, type ResetRpcResult } from "@/lib/hr/test-data-reset";

export type ActionResult<T = void> = { ok: true; data: T } | { ok: false; error: string };

type Storage = ReturnType<typeof createServiceClient>["storage"];

async function listFolder(storage: Storage, bucket: string, prefix: string, depth = 0): Promise<string[]> {
  const { data, error } = await storage.from(bucket).list(prefix, { limit: 1000 });
  if (error || !data) return [];
  const paths: string[] = [];
  for (const item of data) {
    const path = `${prefix}/${item.name}`;
    if (item.id) paths.push(path);
    else if (depth < 4) paths.push(...(await listFolder(storage, bucket, path, depth + 1)));
  }
  return paths;
}

async function purgeStorage(result: ResetRpcResult) {
  const storage = createServiceClient().storage;
  let removed = 0;
  const failed: string[] = [];
  for (const [bucket, target] of Object.entries(resetStorageTargets(result))) {
    const paths = new Set(target.files);
    for (const folder of target.folders) {
      for (const path of await listFolder(storage, bucket, folder)) paths.add(path);
    }
    const all = [...paths];
    for (let i = 0; i < all.length; i += 100) {
      const chunk = all.slice(i, i + 100);
      const { error } = await storage.from(bucket).remove(chunk);
      if (error) failed.push(`${bucket}: ${error.message}`);
      else removed += chunk.length;
    }
  }
  return { removed, failed };
}

/** Test phase only: deletes every employee and all linked HR data, keeping the settings. */
export async function resetHrTestData(
  confirm: string,
): Promise<ActionResult<{ counts: Record<string, number>; filesRemoved: number; storageErrors: string[] }>> {
  const workspace = await getWorkspaceProfile();
  if (!workspace?.isSuperAdmin) return { ok: false, error: "Réservé au super administrateur." };
  if (confirm.trim() !== RESET_CONFIRM_WORD) {
    return { ok: false, error: `Tapez ${RESET_CONFIRM_WORD} pour confirmer.` };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("hr_reset_test_data", { p_confirm: RESET_CONFIRM_WORD });
  if (error) return { ok: false, error: error.message };
  const result = data as ResetRpcResult;

  const storage = await purgeStorage(result);
  revalidatePath("/", "layout");
  return {
    ok: true,
    data: { counts: result.counts ?? {}, filesRemoved: storage.removed, storageErrors: storage.failed },
  };
}
