import { createClient } from "@/lib/supabase/server";
import { hrFileDisplayUrl } from "@/lib/hr/hr-file-url";

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
