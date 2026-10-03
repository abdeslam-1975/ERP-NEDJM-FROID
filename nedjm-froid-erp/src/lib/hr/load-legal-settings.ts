import "server-only";
import type { ComponentProps } from "react";
import type { LegalSettings } from "@/components/rh/legal-settings";
import { getLegalPeriod, listCnasRegimes, listLegalVars } from "@/lib/actions/hr-legal-vars";
import { listIrgCatalog } from "@/lib/actions/hr-irg";
import { listZoneScopes } from "@/lib/actions/rule-proposals";
import { getComplianceAccess } from "@/lib/auth/compliance-access";

/** Cotisations & impôts data; null when the user may not read the legal settings. */
export async function loadLegalSettings(): Promise<ComponentProps<typeof LegalSettings> | null> {
  const access = await getComplianceAccess();
  if (!access.canRead) return null;
  const [vars, irg, regimes, period, zones] = await Promise.all([
    listLegalVars(),
    listIrgCatalog(),
    listCnasRegimes(),
    getLegalPeriod(),
    listZoneScopes(),
  ]);
  return {
    vars: vars.ok ? vars.data : [],
    regimes: regimes.ok ? regimes.data : [],
    period,
    irgCatalog: irg.ok ? irg.data : { versions: [], brackets: [], ruleSets: [], rules: [] },
    zoneScopes: zones.ok ? zones.data : null,
    canEdit: access.canWrite,
    loadError:
      (!vars.ok && vars.error) ||
      (!irg.ok && irg.error) ||
      (!regimes.ok && regimes.error) ||
      (!zones.ok && zones.error) ||
      undefined,
  };
}
