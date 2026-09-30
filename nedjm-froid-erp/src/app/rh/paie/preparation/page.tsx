import { RhShell } from "@/components/rh/rh-shell";
import { RhAlert } from "@/components/rh/rh-ui";
import { PayrollPreparationManager } from "@/components/rh/payroll-preparation-manager";
import { loadMonthPreparation } from "@/lib/actions/hr-payroll-preparation";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function PayrollPreparationPage({
  searchParams,
}: {
  searchParams: Promise<{ mois?: string; chantier?: string }>;
}) {
  const sp = await searchParams;
  const now = new Date();
  const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(sp.mois ?? "");
  const year = m ? Number(m[1]) : now.getFullYear();
  const month = m ? Number(m[2]) : now.getMonth() + 1;
  const siteId = sp.chantier && UUID_RE.test(sp.chantier) ? sp.chantier : null;
  const r = await loadMonthPreparation({ period_year: year, period_month: month, site_id: siteId });

  return (
    <RhShell title="Préparation de la paie">
      {r.ok ? (
        <PayrollPreparationManager
          key={`${year}-${month}-${siteId ?? ""}`}
          preparation={r.data.preparation}
          sites={r.data.sites}
          year={year}
          month={month}
          siteId={siteId}
        />
      ) : (
        <RhAlert tone="danger">{r.error}</RhAlert>
      )}
    </RhShell>
  );
}
