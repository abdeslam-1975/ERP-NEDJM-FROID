"use client";

import { reportEmployeeTable, type TableReportLine } from "@/lib/hr/employee-matricule";
import type { ExistingEmployee } from "@/lib/hr/employee-import";
import { RhAlert, RhModal } from "@/components/rh/rh-ui";
import { Button } from "@/components/ui/button";

const LABEL: Record<TableReportLine["status"], string> = {
  new: "Date absente",
  exists: "Même personne",
  duplicate: "Doublon",
  invalid: "Incomplet",
  confirm: "Nom proche",
  mismatch: "Matricule",
  conflict: "Conflit",
};

/** Permanent check of the staff table: matricules, NSS, NIN and close names. */
export function EmployeeTableReport({
  people,
  onClose,
  onOpen,
}: {
  people: ExistingEmployee[];
  onClose: () => void;
  onOpen: (id: string) => void;
}) {
  const report = reportEmployeeTable(people);
  return (
    <RhModal
      size="xl"
      title="RAPPORT"
      subtitle="Contrôle du tableau des employés : numéro, NSS, NIN et noms proches."
      onClose={onClose}
      footer={
        <Button variant="secondary" onClick={onClose}>
          Fermer
        </Button>
      }
    >
      <div className="space-y-4 p-2">
        {report.lines.length === 0 ? (
          <RhAlert tone="success">
            Les matricules du tableau sont corrects. {report.total} employé{report.total > 1 ? "s" : ""}.
          </RhAlert>
        ) : (
          <RhAlert tone="warning">
            {report.lines.length} ligne{report.lines.length > 1 ? "s" : ""} à revoir sur {report.total}.
          </RhAlert>
        )}
        {report.returns ? (
          <RhAlert tone="info">
            {report.returns} employé{report.returns > 1 ? "s ont" : " a"} gardé le matricule du premier recrutement.
            Un retour en 2015 ou en 2021 ne donne pas un nouveau numéro.
          </RhAlert>
        ) : null}
        {report.lines.length ? (
          <div className="max-h-[60vh] overflow-auto rounded-2xl border border-border/70">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-surface-muted text-left text-xs text-foreground/55">
                <tr>
                  <th className="px-3 py-2 font-medium">Nom</th>
                  <th className="px-3 py-2 font-medium">Matricule</th>
                  <th className="px-3 py-2 font-medium">Attendu</th>
                  <th className="px-3 py-2 font-medium">État</th>
                  <th className="px-3 py-2 font-medium">Détail</th>
                  <th className="px-3 py-2 font-medium" />
                </tr>
              </thead>
              <tbody>
                {report.lines.map((line) => (
                  <tr key={`${line.id}-${line.status}-${line.matricule}`} className="border-t border-border/50 align-top">
                    <td className="px-3 py-2 font-medium">{line.name || "—"}</td>
                    <td className="px-3 py-2 font-mono tabular-nums">{line.matricule || "—"}</td>
                    <td className="px-3 py-2 font-mono tabular-nums">{line.expectedMatricule || "—"}</td>
                    <td className="px-3 py-2">{LABEL[line.status]}</td>
                    <td className="px-3 py-2 text-xs text-foreground/70">{line.message || "—"}</td>
                    <td className="px-3 py-2">
                      {line.id ? (
                        <Button type="button" variant="secondary" className="h-7 px-2 text-xs" onClick={() => onOpen(line.id)}>
                          Ouvrir
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </RhModal>
  );
}
