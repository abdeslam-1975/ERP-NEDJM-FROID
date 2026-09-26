import { RhShell } from "@/components/rh/rh-shell";
import { LettersManager } from "@/components/rh/letters-manager";
import { listLetters } from "@/lib/actions/hr-letters";
import { listLeaveEmployees } from "@/lib/actions/hr-leave";

export const dynamic = "force-dynamic";

export default async function LettersPage() {
  const [history, employees] = await Promise.all([listLetters(), listLeaveEmployees()]);
  return (
    <RhShell title="Attestations & courriers">
      <LettersManager
        history={history.ok ? history.data : []}
        employees={employees.ok ? employees.data : []}
        loadError={(!history.ok && history.error) || (!employees.ok && employees.error) || undefined}
      />
    </RhShell>
  );
}
