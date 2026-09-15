import { AppShell } from "@/components/layout/app-shell";
import { EmployeesManager } from "@/components/rh/employees-manager";
import { listHrEmployeeRows } from "@/lib/actions/hr-employees";

export const dynamic = "force-dynamic";

export default async function EmployesPage() {
  const result = await listHrEmployeeRows();

  return (
    <AppShell title="Employés RH">
      <EmployeesManager
        initialEmployees={result.ok ? result.data : []}
        loadError={result.ok ? undefined : result.error}
      />
    </AppShell>
  );
}
