import { RhShell } from "@/components/rh/rh-shell";
import { RhAlert } from "@/components/rh/rh-ui";
import { PayrollSimulator } from "@/components/rh/simulator/payroll-simulator";
import { loadPayrollBulletinContext } from "@/lib/actions/hr-bulletin";
import { resolvePayrollPeriod } from "@/lib/hr/payroll-calc";
import { loadPayrollSimulator } from "@/lib/hr/payroll-simulator-load";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function PayrollSimulatorPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string; employee?: string }>;
}) {
  const sp = await searchParams;
  const { year, month } = resolvePayrollPeriod(sp.year, sp.month);
  const employeeId = sp.employee && UUID_RE.test(sp.employee) ? sp.employee : null;

  const supabase = await createClient();
  const { data: allowed } = await supabase.rpc("erp_has_perm", { p_screen: "hr_payroll", p_action: "read" });
  if (allowed !== true) {
    return (
      <RhShell title="Simulateur de paie">
        <RhAlert tone="danger">Accès à la paie non autorisé pour votre rôle.</RhAlert>
      </RhShell>
    );
  }

  const [sim, bulletin] = await Promise.all([
    loadPayrollSimulator(supabase, { year, month, employeeId }),
    loadPayrollBulletinContext(),
  ]);

  return (
    <RhShell title="Simulateur de paie">
      {!sim.ok ? (
        <RhAlert tone="danger">{sim.error}</RhAlert>
      ) : (
        <PayrollSimulator
          key={`${year}-${month}-${employeeId ?? "blank"}`}
          data={sim.data}
          bulletin={bulletin.bulletin}
          months={bulletin.bulletin.months}
        />
      )}
    </RhShell>
  );
}
