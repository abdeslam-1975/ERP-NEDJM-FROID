import { BulletinsRegisterView } from "@/components/rh/bulletins-register-view";
import { listBulletinEmployees, listPayslipRegister } from "@/lib/actions/hr-bulletin-register";
import { listAllBulletinArchives } from "@/lib/hr/bulletin-archive";

/** Register of the payslips already produced, shown in the Documents page. */
export async function BulletinsRegister() {
  const [rows, employees, archives] = await Promise.all([
    listPayslipRegister(),
    listBulletinEmployees(),
    listAllBulletinArchives(),
  ]);
  return (
    <BulletinsRegisterView
      rows={rows.ok ? rows.data : []}
      employees={employees.ok ? employees.data : []}
      archives={archives}
      loadError={(!rows.ok && rows.error) || (!employees.ok && employees.error) || undefined}
    />
  );
}
