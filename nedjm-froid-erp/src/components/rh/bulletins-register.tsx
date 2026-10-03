import { BulletinsRegisterView } from "@/components/rh/bulletins-register-view";
import { listPayslipRegister } from "@/lib/actions/hr-bulletin-register";
import { listSites } from "@/lib/actions/sites";
import { listAllBulletinArchives } from "@/lib/hr/bulletin-archive";

/** Register of the payslips already produced, shown in the Documents page. */
export async function BulletinsRegister() {
  const [rows, sites, archives] = await Promise.all([listPayslipRegister(), listSites(), listAllBulletinArchives()]);
  return (
    <BulletinsRegisterView
      rows={rows.ok ? rows.data : []}
      sites={sites.ok ? sites.data.filter((s) => s.is_active) : []}
      archives={archives}
      loadError={(!rows.ok && rows.error) || (!sites.ok && sites.error) || undefined}
    />
  );
}
