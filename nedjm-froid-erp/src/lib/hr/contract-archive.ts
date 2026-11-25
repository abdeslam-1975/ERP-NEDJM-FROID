import { createClient } from "@/lib/supabase/server";
import { HR_DOCS_BUCKET, hrFileDisplayUrl } from "@/lib/hr/hr-file-url";

const PREFIX = "CONTRAT_";

/** One archived contract per contract: the file row is keyed by this document type (40 characters). */
export function contractArchiveType(contractId: string) {
  return `${PREFIX}${contractId.replace(/-/g, "").toLowerCase()}`;
}

function contractIdOfType(docType: string) {
  const hex = docType.slice(PREFIX.length);
  if (!/^[0-9a-f]{32}$/.test(hex)) return null;
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Archived contract PDFs, by contract id. */
export async function listContractArchives(): Promise<Record<string, string>> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("hr_employee_files")
    .select("doc_type_code, file_url, storage_path")
    .like("doc_type_code", `${PREFIX}%`);
  const out: Record<string, string> = {};
  for (const row of data ?? []) {
    const id = contractIdOfType(row.doc_type_code);
    const url = hrFileDisplayUrl(row.storage_path, row.file_url);
    if (id && url) out[id] = url;
  }
  return out;
}

/** Removes the signed archive of a contract so a changed text has to be printed and signed again. */
export async function withdrawContractArchive(
  supabase: Awaited<ReturnType<typeof createClient>>,
  contractId: string,
): Promise<{ ok: true; removed: boolean } | { ok: false; error: string }> {
  const { data, error } = await supabase
    .from("hr_employee_files")
    .select("id, storage_path")
    .eq("doc_type_code", contractArchiveType(contractId));
  if (error) return { ok: false, error: error.message };
  const rows = data ?? [];
  if (!rows.length) return { ok: true, removed: false };
  const paths = rows
    .map((row) => row.storage_path)
    .filter((path): path is string => typeof path === "string" && path.length > 0);
  if (paths.length) await supabase.storage.from(HR_DOCS_BUCKET).remove(paths);
  const { error: deleted } = await supabase
    .from("hr_employee_files")
    .delete()
    .in(
      "id",
      rows.map((row) => row.id),
    );
  if (deleted) return { ok: false, error: deleted.message };
  return { ok: true, removed: true };
}
