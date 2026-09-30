import { AppShell } from "@/components/layout/app-shell";
import { RhAlert } from "@/components/rh/rh-ui";
import { Simulator } from "@/components/sim/simulator";
import { resolvePayrollPeriod } from "@/lib/hr/payroll-calc";
import { loadSimTarget } from "@/lib/sim/load";
import { simTargetMeta } from "@/lib/sim/targets-meta";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function SimulatorPage({
  searchParams,
}: {
  searchParams: Promise<{
    cible?: string;
    avec?: string;
    employe?: string;
    annee?: string;
    mois?: string;
    ref?: string;
    edition?: string;
  }>;
}) {
  const sp = await searchParams;
  const { year, month } = resolvePayrollPeriod(sp.annee, sp.mois);
  const meta = simTargetMeta(sp.cible);
  const withMeta = meta ? simTargetMeta(sp.avec) : null;
  const beside = withMeta && withMeta.id !== meta?.id ? withMeta : null;
  const employeeId = sp.employe && UUID_RE.test(sp.employe) ? sp.employe : null;
  const ref = sp.ref && UUID_RE.test(sp.ref) ? sp.ref : null;

  const supabase = await createClient();
  const { data: allowed } = await supabase.rpc("erp_has_perm", { p_screen: "hr_payroll", p_action: "read" });
  if (allowed !== true) {
    return (
      <AppShell title="Simulateur">
        <RhAlert tone="danger">Accès au simulateur non autorisé pour votre rôle (lecture de la paie requise).</RhAlert>
      </AppShell>
    );
  }

  const [employeeRows, loaded, besideLoaded] = await Promise.all([
    supabase.from("hr_employees").select("id, matricule, last_name, first_name").order("matricule"),
    meta ? loadSimTarget(supabase, { target: meta.id, employeeId, year, month, ref }) : Promise.resolve(null),
    beside ? loadSimTarget(supabase, { target: beside.id, employeeId, year, month, ref: null }) : Promise.resolve(null),
  ]);
  const second = besideLoaded
    ? besideLoaded.ok
      ? { data: besideLoaded.data.data, notice: besideLoaded.data.notice }
      : { data: null, notice: besideLoaded.error }
    : null;
  const employees = (employeeRows.data ?? []).map((e) => ({
    id: e.id,
    matricule: e.matricule,
    name: `${e.last_name} ${e.first_name}`.trim(),
  }));

  return (
    <AppShell title="Simulateur">
      {loaded && !loaded.ok ? (
        <RhAlert tone="danger">{loaded.error}</RhAlert>
      ) : (
        <Simulator
          nav={{
            target: meta?.id ?? null,
            with: beside?.id ?? null,
            employeeId,
            year,
            month,
            ref: loaded?.ok ? loaded.data.ref : ref,
          }}
          data={loaded?.ok ? loaded.data.data : null}
          refs={loaded?.ok ? loaded.data.refs : []}
          notice={loaded?.ok ? loaded.data.notice : null}
          second={second}
          employees={employees}
          startEditing={sp.edition === "1"}
        />
      )}
    </AppShell>
  );
}
