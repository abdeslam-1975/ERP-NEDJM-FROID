import { RhShell } from "@/components/rh/rh-shell";
import { RhAlert } from "@/components/rh/rh-ui";
import { DataQualityReportView } from "@/components/rh/data-quality-report";
import { getDataQualityReport } from "@/lib/actions/data-quality";

export const dynamic = "force-dynamic";

export default async function QualiteDonneesPage() {
  const report = await getDataQualityReport();
  return (
    <RhShell title="Qualité des données">
      {report.ok ? <DataQualityReportView report={report.data} /> : <RhAlert tone="danger">{report.error}</RhAlert>}
    </RhShell>
  );
}
