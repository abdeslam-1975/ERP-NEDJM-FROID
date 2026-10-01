"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { LetterHistoryRow } from "@/lib/actions/hr-letters";
import type { LeaveEmployee } from "@/lib/actions/hr-leave";
import { LETTER_KINDS, letterKindLabel, type LetterKind } from "@/lib/hr/hr-letters";
import { HrLetterDialog } from "@/components/rh/hr-letter-dialog";
import { Button } from "@/components/ui/button";
import { DataTable, dataColumns } from "@/components/ui/data-table";
import { RhAlert, RhField, bi, rhInput } from "@/components/rh/rh-ui";

const ISSUABLE = LETTER_KINDS.filter((k) => k.code !== "LEAVE");

const col = dataColumns<LetterHistoryRow>();

export function LettersManager({
  history,
  employees,
  loadError,
}: {
  history: LetterHistoryRow[];
  employees: LeaveEmployee[];
  loadError?: string;
}) {
  const router = useRouter();
  const [employeeId, setEmployeeId] = useState("");
  const [kind, setKind] = useState<LetterKind>("ATTEST");
  const [open, setOpen] = useState<{ employeeId: string; kind: LetterKind; correspondenceId?: string } | null>(null);

  const columns = [
    col.accessor("number", { header: "N°", meta: { className: "tabular-nums" } }),
    col.accessor((r) => letterKindLabel(r.type_code).fr, {
      id: "kind",
      header: bi("Document", "الوثيقة"),
      cell: ({ row: { original: r } }) => (
        <>
          {letterKindLabel(r.type_code).fr}{" "}
          <span className="text-xs text-foreground/50">({r.lang.toUpperCase()})</span>
        </>
      ),
    }),
    col.accessor("employee_label", { header: bi("Employé", "العامل") }),
    col.accessor("created_at", {
      header: bi("Établi le", "بتاريخ"),
      meta: { className: "tabular-nums" },
      cell: (info) => new Date(info.getValue()).toLocaleDateString("fr-DZ", { timeZone: "Africa/Algiers" }),
    }),
    col.display({
      id: "actions",
      header: "",
      enableSorting: false,
      enableHiding: false,
      meta: { align: "right" },
      cell: ({ row: { original: r } }) => (
        <Button
          variant="secondary"
          onClick={() => setOpen({ employeeId: r.employee_id, kind: r.type_code as LetterKind, correspondenceId: r.id })}
        >
          {bi("Réimprimer", "إعادة الطباعة")}
        </Button>
      ),
    }),
  ];

  return (
    <div className="space-y-5">
      {loadError ? <RhAlert tone="danger">{loadError}</RhAlert> : null}
      <div className="rounded-2xl border border-border/80 bg-surface p-4 shadow-[var(--card-shadow)]">
        <p className="mb-3 text-sm font-semibold">{bi("Établir un document", "إعداد وثيقة")}</p>
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <RhField label={bi("Employé", "العامل")}>
            <select className={rhInput} value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
              <option value="">—</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.label}
                  {e.employment_status === "EXITED" ? " (sorti)" : ""}
                </option>
              ))}
            </select>
          </RhField>
          <RhField label={bi("Document", "الوثيقة")}>
            <select className={rhInput} value={kind} onChange={(e) => setKind(e.target.value as LetterKind)}>
              {ISSUABLE.map((k) => (
                <option key={k.code} value={k.code}>
                  {k.fr} · {k.ar}
                </option>
              ))}
            </select>
          </RhField>
          <Button disabled={!employeeId} onClick={() => setOpen({ employeeId, kind })}>
            {bi("Préparer", "تحضير")}
          </Button>
        </div>
        <p className="mt-2 text-xs text-foreground/55">
          {bi(
            "Les titres de congé s'impriment depuis Congés ; certificat et solde de tout compte sont aussi accessibles depuis Sorties.",
            "",
          )}
        </p>
      </div>

      <DataTable
        data={history}
        columns={columns}
        getRowId={(r) => r.id}
        searchPlaceholder={bi("Rechercher…", "بحث")}
        searchText={(r) => [r.employee_label, r.number].join(" ")}
        emptyTitle={bi("Aucun document", "لا توجد وثائق")}
      />

      {open ? (
        <HrLetterDialog
          employeeId={open.employeeId}
          kind={open.kind}
          correspondenceId={open.correspondenceId}
          onClose={() => setOpen(null)}
          onIssued={() => router.refresh()}
        />
      ) : null}
    </div>
  );
}
