import { RhShell } from "@/components/rh/rh-shell";
import { LeaveManager } from "@/components/rh/leave-manager";
import {
  listLeaveAdjustments,
  listLeaveBalances,
  listLeaveEmployees,
  listLeaveRequests,
} from "@/lib/actions/hr-leave";
import { getWorkspaceProfile } from "@/lib/auth/get-workspace";
import { HR_SALARY_VALUE_ROLES, workspaceHasRole } from "@/lib/auth/require-roles";

export const dynamic = "force-dynamic";

export default async function LeavePage() {
  const [requests, balances, adjustments, employees, workspace] = await Promise.all([
    listLeaveRequests(),
    listLeaveBalances(),
    listLeaveAdjustments(),
    listLeaveEmployees(),
    getWorkspaceProfile(),
  ]);
  const canDecide = workspace ? workspaceHasRole(workspace, HR_SALARY_VALUE_ROLES) : false;
  const loadError = [requests, balances, adjustments, employees].find((r) => !r.ok);
  return (
    <RhShell title="Congés & absences">
      <LeaveManager
        initialRequests={requests.ok ? requests.data : []}
        initialBalances={balances.ok ? balances.data : []}
        initialAdjustments={adjustments.ok ? adjustments.data : []}
        employees={employees.ok ? employees.data : []}
        canDecide={canDecide}
        canRequest={Boolean(workspace)}
        loadError={loadError && !loadError.ok ? loadError.error : undefined}
      />
    </RhShell>
  );
}
