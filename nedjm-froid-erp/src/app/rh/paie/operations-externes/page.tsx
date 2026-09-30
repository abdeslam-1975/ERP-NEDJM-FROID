import { redirect } from "next/navigation";
import { RhShell } from "@/components/rh/rh-shell";
import { ExternalOperationsManager } from "@/components/rh/external-operations-manager";
import { getExternalAccess, listExternalOperations } from "@/lib/actions/hr-external-ops";
import { loadHrLookups } from "@/lib/actions/hr-lookups";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function ExternalOperationsPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const sp = await searchParams;
  const access = await getExternalAccess();
  if (!access.ok) redirect("/login");
  if (!access.data.read) redirect("/?error=forbidden");
  const y = Number(sp.year);
  const year = Number.isInteger(y) && y >= 2000 && y <= 2100 ? y : 2026;
  const supabase = await createClient();
  const [operations, lookups, employees] = await Promise.all([
    listExternalOperations({ year }),
    loadHrLookups(),
    access.data.enter
      ? supabase.from("hr_employees").select("id, matricule, last_name, first_name").order("matricule").limit(5000)
      : Promise.resolve({ data: [] as { id: string; matricule: string | null; last_name: string | null; first_name: string | null }[] }),
  ]);
  return (
    <RhShell title="Opérations externes">
      <ExternalOperationsManager
        operations={operations.ok ? operations.data : []}
        access={access.data}
        sites={lookups.sites}
        employees={(employees.data ?? []).map((e) => ({
          id: e.id,
          label: [e.matricule, e.last_name, e.first_name].filter(Boolean).join(" "),
        }))}
        year={year}
        loadError={(!operations.ok && operations.error) || lookups.error || undefined}
      />
    </RhShell>
  );
}
