import { loadHrDashboardStats } from "@/lib/actions/hr-lookups";
import { RhSenseStrip } from "@/components/rh/rh-sense-strip";

/** Live meaning cards for every HR screen except the overview, which renders them under its title. */
export async function RhSenseBand() {
  const stats = await loadHrDashboardStats();
  return <RhSenseStrip stats={stats} />;
}
