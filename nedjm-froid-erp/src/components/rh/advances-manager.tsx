"use client";

import { useMemo, useState, useTransition } from "react";
import { cancelAdvance, createAdvance, listAdvances, type AdvanceRow } from "@/lib/actions/hr-advances";
import { Button } from "@/components/ui/button";
import { DataTable, dataColumns } from "@/components/ui/data-table";
import { RhAlert, RhChip, RhField, bi, rhInput } from "@/components/rh/rh-ui";

function money(n: number) {
  return n.toLocaleString("fr-DZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const KIND_LABEL: Record<AdvanceRow["kind"], string> = {
  ADVANCE: bi("Avance sur salaire", "تسبيق على الأجر"),
  LOAN: bi("Prêt", "قرض"),
};

const col = dataColumns<AdvanceRow>();
const amountMeta = { align: "right", className: "tabular-nums" } as const;

export function AdvancesManager({
  initialRows,
  employees,
  canEdit,
  year,
  month,
  loadError,
}: {
  initialRows: AdvanceRow[];
  employees: { id: string; label: string }[];
  canEdit: boolean;
  year: number;
  month: number;
  loadError?: string;
}) {
  const emptyDraft = {
    employee_id: "",
    kind: "ADVANCE" as AdvanceRow["kind"],
    principal_amount: "",
    installment_amount: "",
    start_year: String(year),
    start_month: String(month),
    granted_on: new Date().toISOString().slice(0, 10),
    reason: "",
  };
  const [rows, setRows] = useState(initialRows);
  const [draft, setDraft] = useState(emptyDraft);
  const [filter, setFilter] = useState<"open" | "all">("open");
  const [error, setError] = useState<string | null>(loadError ?? null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const visible = useMemo(
    () => (filter === "open" ? rows.filter((r) => r.status === "ACTIVE" && r.remaining > 0) : rows),
    [rows, filter],
  );
  const outstanding = useMemo(
    () => rows.filter((r) => r.status === "ACTIVE").reduce((s, r) => s + r.remaining, 0),
    [rows],
  );

  async function reload() {
    const r = await listAdvances();
    if (r.ok) setRows(r.data);
    else setError(r.error);
  }

  function submit() {
    setError(null);
    setNotice(null);
    start(async () => {
      const r = await createAdvance({
        ...draft,
        installment_amount: draft.kind === "ADVANCE" && !draft.installment_amount ? draft.principal_amount : draft.installment_amount,
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setDraft(emptyDraft);
      setNotice(bi("Enregistré : la retenue sera appliquée sur les prochaines paies.", "تم الحفظ: سيُقتطع القسط من الأجور القادمة."));
      await reload();
    });
  }

  function cancel(row: AdvanceRow) {
    if (!window.confirm(bi(`Annuler ${KIND_LABEL[row.kind]} de ${row.employee_label} ? Le reste ne sera plus retenu.`, "إلغاء؟"))) {
      return;
    }
    setError(null);
    start(async () => {
      const r = await cancelAdvance(row.id);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      await reload();
    });
  }

  const principal = Number(draft.principal_amount) || 0;
  const installment = Number(draft.installment_amount) || (draft.kind === "ADVANCE" ? principal : 0);
  const months = principal > 0 && installment > 0 ? Math.ceil(principal / installment) : 0;

  const columns = [
    col.accessor("employee_label", { header: bi("Employé", "العامل") }),
    col.accessor((r) => KIND_LABEL[r.kind], {
      id: "kind",
      header: bi("Type", "النوع"),
      cell: ({ row: { original: row } }) => (
        <>
          {KIND_LABEL[row.kind]}{" "}
          {row.status === "CANCELLED" ? (
            <RhChip tone="danger">{bi("Annulée", "ملغاة")}</RhChip>
          ) : row.remaining <= 0 ? (
            <RhChip tone="success">{bi("Soldée", "مسددة")}</RhChip>
          ) : null}
        </>
      ),
    }),
    col.accessor("principal_amount", { header: bi("Montant", "المبلغ"), meta: amountMeta, cell: (i) => money(i.getValue()) }),
    col.accessor("installment_amount", {
      header: bi("Mensualité", "القسط"),
      meta: amountMeta,
      cell: (i) => money(i.getValue()),
    }),
    col.accessor("deducted", { header: bi("Retenu", "المقتطع"), meta: amountMeta, cell: (i) => money(i.getValue()) }),
    col.accessor("remaining", {
      header: bi("Reste", "المتبقي"),
      meta: { align: "right", className: "font-semibold tabular-nums" },
      cell: (i) => money(i.getValue()),
    }),
    col.accessor((r) => r.start_year * 100 + r.start_month, {
      id: "start",
      header: bi("Début", "البداية"),
      cell: ({ row }) => `${String(row.original.start_month).padStart(2, "0")}/${row.original.start_year}`,
    }),
    col.accessor("reason", {
      header: bi("Motif", "السبب"),
      cell: ({ row: { original: row } }) => (
        <>
          {row.reason}
          {row.author_name ? <span className="text-xs text-foreground/50"> · {row.author_name}</span> : null}
        </>
      ),
    }),
    col.display({
      id: "actions",
      header: "",
      enableSorting: false,
      enableHiding: false,
      meta: { align: "right" },
      cell: ({ row: { original: row } }) =>
        canEdit && row.status === "ACTIVE" && row.remaining > 0 ? (
          <Button variant="secondary" disabled={pending} onClick={() => cancel(row)}>
            {bi("Annuler", "إلغاء")}
          </Button>
        ) : null,
    }),
  ];

  return (
    <div className="space-y-5">
      <RhAlert tone="info">
        {bi(
          "Chaque mois, la paie retient la mensualité (classe 4, hors cotisations et IRG) jusqu'au remboursement complet, sans rendre le net négatif.",
          "كل شهر يُقتطع القسط من الأجر حتى التسديد الكامل دون أن يصبح الصافي سالباً.",
        )}
      </RhAlert>
      {error ? <RhAlert tone="danger">{error}</RhAlert> : null}
      {notice ? <RhAlert tone="success">{notice}</RhAlert> : null}

      {canEdit ? (
        <div className="rounded-2xl border border-border/80 bg-surface p-4 shadow-[var(--card-shadow)]">
          <p className="mb-3 text-sm font-semibold">{bi("Nouvelle avance / prêt", "تسبيق / قرض جديد")}</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <RhField label={bi("Employé", "العامل")}>
              <select
                className={rhInput}
                value={draft.employee_id}
                onChange={(e) => setDraft({ ...draft, employee_id: e.target.value })}
              >
                <option value="">—</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.label}
                  </option>
                ))}
              </select>
            </RhField>
            <RhField label={bi("Type", "النوع")}>
              <select
                className={rhInput}
                value={draft.kind}
                onChange={(e) => setDraft({ ...draft, kind: e.target.value as AdvanceRow["kind"] })}
              >
                <option value="ADVANCE">{KIND_LABEL.ADVANCE}</option>
                <option value="LOAN">{KIND_LABEL.LOAN}</option>
              </select>
            </RhField>
            <RhField label={bi("Montant accordé", "المبلغ الممنوح")}>
              <input
                inputMode="decimal"
                className={rhInput}
                value={draft.principal_amount}
                onChange={(e) => setDraft({ ...draft, principal_amount: e.target.value })}
              />
            </RhField>
            <RhField
              label={bi("Retenue mensuelle", "القسط الشهري")}
              hint={months ? bi(`${months} mois`, `${months} شهر`) : undefined}
            >
              <input
                inputMode="decimal"
                className={rhInput}
                value={draft.installment_amount}
                placeholder={draft.kind === "ADVANCE" ? bi("= montant (1 mois)", "= المبلغ") : ""}
                onChange={(e) => setDraft({ ...draft, installment_amount: e.target.value })}
              />
            </RhField>
            <RhField label={bi("Première retenue (mois)", "أول اقتطاع (الشهر)")}>
              <input
                type="month"
                className={rhInput}
                value={`${draft.start_year}-${draft.start_month.padStart(2, "0")}`}
                onChange={(e) => {
                  const [y, m] = e.target.value.split("-");
                  if (y && m) setDraft({ ...draft, start_year: y, start_month: String(Number(m)) });
                }}
              />
            </RhField>
            <RhField label={bi("Date d'octroi", "تاريخ المنح")}>
              <input
                type="date"
                className={rhInput}
                value={draft.granted_on}
                onChange={(e) => setDraft({ ...draft, granted_on: e.target.value })}
              />
            </RhField>
            <div className="sm:col-span-2">
              <RhField label={bi("Motif", "السبب")}>
                <input
                  className={rhInput}
                  value={draft.reason}
                  onChange={(e) => setDraft({ ...draft, reason: e.target.value })}
                />
              </RhField>
            </div>
          </div>
          <div className="mt-3 flex justify-end">
            <Button
              disabled={pending || !draft.employee_id || !principal || draft.reason.trim().length < 3}
              onClick={submit}
            >
              {bi("Enregistrer", "حفظ")}
            </Button>
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          <Button variant={filter === "open" ? "primary" : "secondary"} onClick={() => setFilter("open")}>
            {bi("En cours", "الجارية")}
          </Button>
          <Button variant={filter === "all" ? "primary" : "secondary"} onClick={() => setFilter("all")}>
            {bi("Toutes", "الكل")}
          </Button>
        </div>
        <p className="text-sm text-foreground/70">
          {bi("Reste à retenir", "المتبقي")} : <strong className="tabular-nums">{money(outstanding)} DA</strong>
        </p>
      </div>

      <DataTable
        data={visible}
        columns={columns}
        getRowId={(r) => r.id}
        searchPlaceholder={bi("Rechercher un employé…", "بحث")}
        searchText={(r) => [r.employee_label, KIND_LABEL[r.kind], r.reason, r.author_name].filter(Boolean).join(" ")}
        emptyTitle={bi("Aucune avance", "لا توجد تسبيقات")}
      />
    </div>
  );
}
