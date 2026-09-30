import type { createClient } from "@/lib/supabase/server";
import type { AssignmentRow } from "@/lib/hr/assignments";

type Supabase = Awaited<ReturnType<typeof createClient>>;

const CHUNK = 150;

/** Dated assignments of the given contracts (chunked to keep request URLs short). */
export async function loadContractAssignments(
  supabase: Supabase,
  contractIds: string[],
): Promise<{ ok: true; data: AssignmentRow[] } | { ok: false; error: string }> {
  const ids = [...new Set(contractIds)];
  const out: AssignmentRow[] = [];
  for (let i = 0; i < ids.length; i += CHUNK) {
    const { data, error } = await supabase
      .from("hr_contract_assignments")
      .select("id, contract_id, site_id, effective_from")
      .in("contract_id", ids.slice(i, i + CHUNK));
    if (error) return { ok: false, error: `Affectations des contrats : ${error.message}` };
    for (const r of data ?? []) {
      out.push({
        id: String(r.id),
        contract_id: String(r.contract_id),
        site_id: String(r.site_id),
        effective_from: String(r.effective_from).slice(0, 10),
      });
    }
  }
  return { ok: true, data: out };
}
