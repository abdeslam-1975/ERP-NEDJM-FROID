"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createLeaveAdjustment,
  createLeaveRequest,
  decideLeaveRequest,
  deleteLeaveAdjustment,
  listLeaveAdjustments,
  listLeaveBalances,
  listLeaveRequests,
  type LeaveAdjustmentRow,
  type LeaveBalanceRow,
  type LeaveEmployee,
  type LeaveRequestRow,
} from "@/lib/actions/hr-leave";
import { calendarDays } from "@/lib/hr/leave";
import { activeOptions, isAnnualLeave, type LeaveKindOption } from "@/lib/hr/hr-lists";
import { slashDateIso } from "@/lib/hr/hr-letters";
import { HrLetterDialog } from "@/components/rh/hr-letter-dialog";
import { Button } from "@/components/ui/button";
import { DataTable, dataColumns } from "@/components/ui/data-table";
import { RhAlert, RhChip, RhField, bi, rhInput } from "@/components/rh/rh-ui";

const requestCol = dataColumns<LeaveRequestRow>();
const balanceCol = dataColumns<LeaveBalanceRow>();
const adjustmentCol = dataColumns<LeaveAdjustmentRow>();

const balanceColumns = [
  balanceCol.accessor("employee_label", { header: bi("Employé", "العامل") }),
  balanceCol.accessor("months", { header: bi("Mois travaillés", "الأشهر"), meta: { align: "right", className: "tabular-nums" } }),
  balanceCol.accessor("accrued", { header: bi("Acquis", "المكتسب"), meta: { align: "right", className: "tabular-nums" } }),
  balanceCol.accessor("adjustments", {
    header: bi("Ajustements", "التعديلات"),
    meta: { align: "right", className: "tabular-nums" },
  }),
  balanceCol.accessor("taken", { header: bi("Pris", "المستهلك"), meta: { align: "right", className: "tabular-nums" } }),
  balanceCol.accessor("pending", {
    header: bi("En attente", "قيد الانتظار"),
    meta: { align: "right", className: "tabular-nums" },
    cell: (info) => info.getValue() || "",
  }),
  balanceCol.accessor("balance", {
    header: bi("Solde", "الرصيد"),
    meta: { align: "right", className: "font-semibold tabular-nums" },
    cell: (info) => <span className={info.getValue() < 0 ? "text-red-600" : undefined}>{info.getValue()}</span>,
  }),
];

const STATUS: Record<LeaveRequestRow["status"], { label: string; tone: "neutral" | "success" | "warning" | "danger" }> = {
  SUBMITTED: { label: "En attente · قيد الانتظار", tone: "warning" },
  APPROVED: { label: "Approuvé · معتمد", tone: "success" },
  REJECTED: { label: "Refusé · مرفوض", tone: "danger" },
  CANCELLED: { label: "Annulé · ملغى", tone: "neutral" },
};

function today() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Algiers" }).format(new Date());
}

export function LeaveManager({
  initialRequests,
  initialBalances,
  initialAdjustments,
  employees,
  leaveKinds,
  canDecide,
  canRequest,
  loadError,
}: {
  initialRequests: LeaveRequestRow[];
  initialBalances: LeaveBalanceRow[];
  initialAdjustments: LeaveAdjustmentRow[];
  employees: LeaveEmployee[];
  leaveKinds: LeaveKindOption[];
  canDecide: boolean;
  canRequest: boolean;
  loadError?: string;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<"requests" | "balances" | "adjustments">("requests");
  const [requests, setRequests] = useState(initialRequests);
  const [balances, setBalances] = useState(initialBalances);
  const [adjustments, setAdjustments] = useState(initialAdjustments);
  const [filter, setFilter] = useState<"pending" | "all">("pending");
  const [error, setError] = useState<string | null>(loadError ?? null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [printRow, setPrintRow] = useState<LeaveRequestRow | null>(null);
  const kindChoices = activeOptions(leaveKinds);
  const kindOf = (code: string) =>
    leaveKinds.find((k) => k.code === code) ?? { code, fr: code, ar: code, legend: "", annual: false, active: false };
  const emptyDraft = {
    employee_id: "",
    kind: kindChoices[0]?.code ?? "",
    start_date: "",
    end_date: "",
    days: "",
    reason: "",
    cnas_ref: "",
  };
  const [draft, setDraft] = useState(emptyDraft);
  const [adjDraft, setAdjDraft] = useState({ employee_id: "", days: "", as_of: today(), reason: "" });

  const active = employees.filter((e) => e.employment_status !== "EXITED");
  const balanceOf = useMemo(() => new Map(balances.map((b) => [b.employee_id, b])), [balances]);
  const visible = requests.filter(
    (r) => filter === "all" || r.status === "SUBMITTED" || (r.status === "APPROVED" && r.end_date >= today()),
  );
  const draftDays = draft.start_date && draft.end_date ? calendarDays(draft.start_date, draft.end_date) : 0;
  const draftBalance = draft.employee_id ? balanceOf.get(draft.employee_id) : undefined;

  async function reload() {
    const [r, b, a] = await Promise.all([listLeaveRequests(), listLeaveBalances(), listLeaveAdjustments()]);
    if (r.ok) setRequests(r.data);
    if (b.ok) setBalances(b.data);
    if (a.ok) setAdjustments(a.data);
    const failed = [r, b, a].find((x) => !x.ok);
    if (failed && !failed.ok) setError(failed.error);
  }

  function submit() {
    setError(null);
    setNotice(null);
    start(async () => {
      const r = await createLeaveRequest({ ...draft, days: draft.days || undefined });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setDraft(emptyDraft);
      setNotice(bi("Demande enregistrée, en attente de décision.", "تم تسجيل الطلب."));
      await reload();
    });
  }

  function decide(row: LeaveRequestRow, status: "APPROVED" | "REJECTED" | "CANCELLED") {
    let note: string | null = null;
    if (status !== "APPROVED") {
      note = window.prompt(bi("Motif (facultatif)", "السبب"), "") ?? null;
      if (note === null && status === "REJECTED") return;
    } else if (isAnnualLeave(leaveKinds, row.kind)) {
      const bal = balanceOf.get(row.employee_id);
      if (bal && bal.balance < row.days) {
        const ok = window.confirm(
          bi(
            `Solde insuffisant (${bal.balance} j disponibles pour ${row.days} j demandés). Approuver quand même ?`,
            "الرصيد غير كافٍ",
          ),
        );
        if (!ok) return;
      }
    }
    setError(null);
    setNotice(null);
    start(async () => {
      const r = await decideLeaveRequest({ id: row.id, status, note });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setNotice(
        status === "APPROVED"
          ? bi("Congé approuvé : les jours sont proposés sur la feuille de présence.", "تم اعتماد العطلة.")
          : bi("Décision enregistrée.", "تم الحفظ."),
      );
      await reload();
    });
  }

  function addAdjustment() {
    setError(null);
    start(async () => {
      const r = await createLeaveAdjustment(adjDraft);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setAdjDraft({ employee_id: "", days: "", as_of: today(), reason: "" });
      await reload();
    });
  }

  function removeAdjustment(row: LeaveAdjustmentRow) {
    if (!window.confirm(bi(`Supprimer l'ajustement de ${row.days} j ?`, "حذف؟"))) return;
    start(async () => {
      const r = await deleteLeaveAdjustment(row.id);
      if (!r.ok) setError(r.error);
      await reload();
    });
  }

  const requestColumns = [
    requestCol.accessor("employee_label", {
      header: bi("Employé", "العامل"),
      cell: ({ row }) => (
        <>
          {row.original.employee_label}
          {row.original.reason ? <div className="text-xs text-foreground/55">{row.original.reason}</div> : null}
        </>
      ),
    }),
    requestCol.accessor((r) => kindOf(r.kind).fr, {
      id: "kind",
      header: bi("Nature", "النوع"),
      cell: ({ row }) => {
        const k = kindOf(row.original.kind);
        return (
          <>
            {k.fr} {k.legend ? <span className="text-xs text-foreground/50">({k.legend})</span> : null}
            {row.original.cnas_ref ? (
              <div className="text-xs text-foreground/55">CNAS : {row.original.cnas_ref}</div>
            ) : null}
          </>
        );
      },
    }),
    requestCol.accessor("start_date", {
      header: bi("Période", "الفترة"),
      meta: { className: "tabular-nums" },
      cell: ({ row }) => (
        <>
          {slashDateIso(row.original.start_date)} → {slashDateIso(row.original.end_date)}
        </>
      ),
    }),
    requestCol.accessor("days", { header: bi("Jours", "الأيام"), meta: { align: "right", className: "tabular-nums" } }),
    requestCol.accessor((r) => STATUS[r.status].label, {
      id: "status",
      header: bi("Statut", "الحالة"),
      cell: ({ row }) => {
        const st = STATUS[row.original.status];
        return (
          <>
            <RhChip tone={st.tone}>{st.label}</RhChip>
            {row.original.decided_by_name ? (
              <div className="text-xs text-foreground/50">
                {row.original.decided_by_name}
                {row.original.decision_note ? ` · ${row.original.decision_note}` : ""}
              </div>
            ) : null}
          </>
        );
      },
    }),
    requestCol.accessor((r) => r.correspondence_number ?? "", {
      id: "number",
      header: bi("Titre", "السند"),
      meta: { className: "tabular-nums" },
      cell: (info) => info.getValue() || "—",
    }),
    requestCol.display({
      id: "actions",
      header: "",
      enableSorting: false,
      enableHiding: false,
      meta: { align: "right", className: "space-x-1 whitespace-nowrap" },
      cell: ({ row: { original: row } }) => (
        <>
          {row.status === "APPROVED" ? (
            <Button
              variant="secondary"
              onClick={() =>
                row.correspondence_id
                  ? router.push(`/rh/documents?onglet=conges&titre=${row.correspondence_id}`)
                  : setPrintRow(row)
              }
            >
              {bi("Titre de congé", "سند الإجازة")}
            </Button>
          ) : null}
          {canDecide && row.status === "SUBMITTED" ? (
            <>
              <Button disabled={pending} onClick={() => decide(row, "APPROVED")}>
                {bi("Approuver", "اعتماد")}
              </Button>
              <Button variant="secondary" disabled={pending} onClick={() => decide(row, "REJECTED")}>
                {bi("Refuser", "رفض")}
              </Button>
            </>
          ) : null}
          {(canDecide && (row.status === "SUBMITTED" || row.status === "APPROVED")) ||
          (!canDecide && row.status === "SUBMITTED") ? (
            <Button variant="secondary" disabled={pending} onClick={() => decide(row, "CANCELLED")}>
              {bi("Annuler", "إلغاء")}
            </Button>
          ) : null}
        </>
      ),
    }),
  ];

  const adjustmentColumns = [
    adjustmentCol.accessor("employee_label", { header: bi("Employé", "العامل") }),
    adjustmentCol.accessor("days", {
      header: bi("Jours", "الأيام"),
      meta: { align: "right", className: "tabular-nums" },
      cell: (info) => (info.getValue() > 0 ? `+${info.getValue()}` : info.getValue()),
    }),
    adjustmentCol.accessor("as_of", {
      header: bi("Date", "التاريخ"),
      meta: { className: "tabular-nums" },
      cell: (info) => slashDateIso(info.getValue()),
    }),
    adjustmentCol.accessor("reason", {
      header: bi("Motif", "السبب"),
      cell: ({ row }) => (
        <>
          {row.original.reason}
          {row.original.author_name ? (
            <span className="text-xs text-foreground/50"> · {row.original.author_name}</span>
          ) : null}
        </>
      ),
    }),
    adjustmentCol.display({
      id: "actions",
      header: "",
      enableSorting: false,
      enableHiding: false,
      meta: { align: "right" },
      cell: ({ row }) =>
        canDecide ? (
          <Button variant="secondary" disabled={pending} onClick={() => removeAdjustment(row.original)}>
            {bi("Supprimer", "حذف")}
          </Button>
        ) : null,
    }),
  ];

  const tabBtn = (key: typeof tab, label: string) => (
    <Button variant={tab === key ? "primary" : "secondary"} onClick={() => setTab(key)}>
      {label}
    </Button>
  );

  return (
    <div className="space-y-5">
      <RhAlert tone="info">
        {bi(
          "Une demande approuvée génère un titre de congé numéroté et propose les jours (CA, CRP, CM, CSS, AOP) sur la feuille de présence. Le solde annuel = jours acquis (taux mensuel × mois travaillés) + ajustements − congés annuels approuvés.",
          "",
        )}
      </RhAlert>
      {error ? <RhAlert tone="danger">{error}</RhAlert> : null}
      {notice ? <RhAlert tone="success">{notice}</RhAlert> : null}

      <div className="flex flex-wrap gap-2">
        {tabBtn("requests", bi("Demandes", "الطلبات"))}
        {tabBtn("balances", bi("Soldes", "الأرصدة"))}
        {tabBtn("adjustments", bi("Ajustements / reprise de solde", "التعديلات"))}
      </div>

      {tab === "requests" ? (
        <>
          {canRequest ? (
            <div className="rounded-2xl border border-border/80 bg-surface p-4 shadow-[var(--card-shadow)]">
              <p className="mb-3 text-sm font-semibold">{bi("Nouvelle demande de congé", "طلب عطلة جديد")}</p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <RhField
                  label={bi("Employé", "العامل")}
                  hint={draftBalance ? `${bi("Solde annuel", "الرصيد")} : ${draftBalance.balance} j` : undefined}
                >
                  <select
                    className={rhInput}
                    value={draft.employee_id}
                    onChange={(e) => setDraft({ ...draft, employee_id: e.target.value })}
                  >
                    <option value="">—</option>
                    {active.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.label}
                      </option>
                    ))}
                  </select>
                </RhField>
                <RhField label={bi("Nature", "النوع")}>
                  <select
                    className={rhInput}
                    value={draft.kind}
                    onChange={(e) => setDraft({ ...draft, kind: e.target.value })}
                  >
                    {kindChoices.map((k) => (
                      <option key={k.code} value={k.code}>
                        {k.fr} · {k.ar}
                        {k.legend ? ` (${k.legend})` : ""}
                      </option>
                    ))}
                  </select>
                </RhField>
                <RhField label={bi("Du", "من")}>
                  <input
                    type="date"
                    className={rhInput}
                    value={draft.start_date}
                    onChange={(e) => setDraft({ ...draft, start_date: e.target.value })}
                  />
                </RhField>
                <RhField label={bi("Au (inclus)", "إلى")}>
                  <input
                    type="date"
                    className={rhInput}
                    min={draft.start_date || undefined}
                    value={draft.end_date}
                    onChange={(e) => setDraft({ ...draft, end_date: e.target.value })}
                  />
                </RhField>
                <RhField label={bi("Jours décomptés", "عدد الأيام")} hint={draftDays ? `${draftDays} j calendaires` : undefined}>
                  <input
                    inputMode="decimal"
                    className={rhInput}
                    placeholder={draftDays ? String(draftDays) : ""}
                    value={draft.days}
                    onChange={(e) => setDraft({ ...draft, days: e.target.value })}
                  />
                </RhField>
                {draft.kind === "SICK" ? (
                  <RhField label={bi("Réf. arrêt / CNAS", "مرجع الشهادة الطبية")}>
                    <input
                      className={rhInput}
                      value={draft.cnas_ref}
                      onChange={(e) => setDraft({ ...draft, cnas_ref: e.target.value })}
                    />
                  </RhField>
                ) : null}
                <div className="sm:col-span-2">
                  <RhField label={bi("Motif / observation", "السبب")}>
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
                  disabled={pending || !draft.employee_id || !draft.start_date || !draft.end_date}
                  onClick={submit}
                >
                  {bi("Soumettre", "إرسال")}
                </Button>
              </div>
            </div>
          ) : null}

          <DataTable
            data={visible}
            columns={requestColumns}
            getRowId={(r) => r.id}
            searchPlaceholder={bi("Rechercher un employé…", "بحث")}
            searchText={(r) => r.employee_label}
            toolbar={
              <div className="flex gap-2">
                <Button variant={filter === "pending" ? "primary" : "secondary"} onClick={() => setFilter("pending")}>
                  {bi("À traiter / en cours", "الجارية")}
                </Button>
                <Button variant={filter === "all" ? "primary" : "secondary"} onClick={() => setFilter("all")}>
                  {bi("Historique complet", "الكل")}
                </Button>
              </div>
            }
            emptyTitle={bi("Aucune demande", "لا توجد طلبات")}
          />
        </>
      ) : null}

      {tab === "balances" ? (
        <div className="space-y-1">
          <DataTable
            data={balances}
            columns={balanceColumns}
            getRowId={(b) => b.employee_id}
            searchPlaceholder={bi("Rechercher un employé…", "بحث")}
            searchText={(b) => b.employee_label}
            emptyTitle={bi("Aucun solde", "لا توجد أرصدة")}
          />
          <p className="px-3 py-2 text-xs text-foreground/55">
            {bi(
              `Taux : ${balances[0]?.rate ?? 2.5} j / mois (variable légale CONGE_JOURS_MOIS, modifiable dans Paramètres RH).`,
              "",
            )}
          </p>
        </div>
      ) : null}

      {tab === "adjustments" ? (
        <>
          {canDecide ? (
            <div className="rounded-2xl border border-border/80 bg-surface p-4 shadow-[var(--card-shadow)]">
              <p className="mb-3 text-sm font-semibold">
                {bi("Ajustement (reprise du solde antérieur, correction…)", "تعديل الرصيد")}
              </p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <RhField label={bi("Employé", "العامل")}>
                  <select
                    className={rhInput}
                    value={adjDraft.employee_id}
                    onChange={(e) => setAdjDraft({ ...adjDraft, employee_id: e.target.value })}
                  >
                    <option value="">—</option>
                    {employees.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.label}
                      </option>
                    ))}
                  </select>
                </RhField>
                <RhField label={bi("Jours (+ ou −)", "الأيام")}>
                  <input
                    inputMode="decimal"
                    className={rhInput}
                    value={adjDraft.days}
                    onChange={(e) => setAdjDraft({ ...adjDraft, days: e.target.value })}
                  />
                </RhField>
                <RhField label={bi("Date d'effet", "التاريخ")}>
                  <input
                    type="date"
                    className={rhInput}
                    value={adjDraft.as_of}
                    onChange={(e) => setAdjDraft({ ...adjDraft, as_of: e.target.value })}
                  />
                </RhField>
                <RhField label={bi("Motif", "السبب")}>
                  <input
                    className={rhInput}
                    value={adjDraft.reason}
                    onChange={(e) => setAdjDraft({ ...adjDraft, reason: e.target.value })}
                  />
                </RhField>
              </div>
              <div className="mt-3 flex justify-end">
                <Button
                  disabled={pending || !adjDraft.employee_id || !Number(adjDraft.days) || adjDraft.reason.trim().length < 3}
                  onClick={addAdjustment}
                >
                  {bi("Ajouter", "إضافة")}
                </Button>
              </div>
            </div>
          ) : null}
          <DataTable
            data={adjustments}
            columns={adjustmentColumns}
            getRowId={(a) => a.id}
            searchPlaceholder={bi("Rechercher un employé…", "بحث")}
            searchText={(a) => [a.employee_label, a.reason, a.author_name].filter(Boolean).join(" ")}
            emptyTitle={bi("Aucun ajustement", "لا توجد تعديلات")}
          />
        </>
      ) : null}

      {printRow ? (
        <HrLetterDialog
          employeeId={printRow.employee_id}
          kind="LEAVE"
          leaveRequestId={printRow.id}
          onClose={() => setPrintRow(null)}
        />
      ) : null}
    </div>
  );
}
