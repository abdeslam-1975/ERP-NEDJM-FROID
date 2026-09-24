import { RhShell } from "@/components/rh/rh-shell";
import { RhHub } from "@/components/rh/rh-hub";
import { loadHrDashboardStats } from "@/lib/actions/hr-lookups";

export const dynamic = "force-dynamic";

export default async function RhPage() {
  const stats = await loadHrDashboardStats();
  return (
    <RhShell title="Espace RH">
      <RhHub stats={stats} />
    </RhShell>
  );
}
