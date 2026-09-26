"use client";

import { useMemo, useState, useTransition } from "react";
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
import { LEAVE_KINDS, calendarDays, leaveKindLabel, type LeaveKind } from "@/lib/hr/leave";
import { slashDateIso } from "@/lib/hr/hr-letters";
import { HrLetterDialog } from "@/components/rh/hr-letter-dialog";
import { Button } from "@/components/ui/button";
import { RhAlert, RhChip, RhField, bi, rhInput } from "@/components/rh/rh-ui";

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
  canDecide,
  canRequest,
  loadError,
}: {
  initialRequests: LeaveRequestRow[];
  initialBalances: LeaveBalanceRow[];
  initialAdjustments: LeaveAdjustmentRow[];
  employees: LeaveEmployee[];
  canDecide: boolean;
  canRequest: boolean;
  loadError?: string;
}) {
  const [tab, setTab] = useState<"requests" | "balances" | "adjustments">("requests");
  const [requests, setRequests] = useState(initialRequests);
  const [balances, setBalances] = useState(initialBalances);
  const [adjustments, setAdjustments] = useState(initialAdjustments);
  const [filter, setFilter] = useState<"pending" | "all">("pending");
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(loadError ?? null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [printRow, setPrintRow] = useState<LeaveRequestRow | null>(null);
  const emptyDraft = {
    employee_id: "",
    kind: "ANNUAL" as LeaveKind,
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
  const q = search.trim().toLowerCase();
  const visible = requests.filter(
    (r) =>
      (filter === "all" || r.status === "SUBMITTED" || (r.status === "APPROVED" && r.end_date >= today())) &&
      (!q || r.employee_label.toLowerCase().includes(q)),
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
    } else if (row.kind === "ANNUAL") {
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
                    onChange={(e) => setDraft({ ...draft, kind: e.target.value as LeaveKind })}
                  >
                    {LEAVE_KINDS.map((k) => (
                      <option key={k.code} value={k.code}>
                        {k.fr} · {k.ar} ({k.legend})
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

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex gap-2">
              <Button variant={filter === "pending" ? "primary" : "secondary"} onClick={() => setFilter("pending")}>
                {bi("À traiter / en cours", "الجارية")}
              </Button>
              <Button variant={filter === "all" ? "primary" : "secondary"} onClick={() => setFilter("all")}>
                {bi("Historique complet", "الكل")}
              </Button>
            </div>
            <input
              className={`${rhInput} mt-0 w-64`}
              placeholder={bi("Rechercher un employé…", "بحث")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="overflow-x-auto rounded-2xl border border-border/80 bg-surface">
            <table className="w-full text-sm">
              <thead className="bg-surface-muted text-xs uppercase text-foreground/60">
                <tr>
                  <th className="px-3 py-2 text-left">{bi("Employé", "العامل")}</th>
                  <th className="px-3 py-2 text-left">{bi("Nature", "النوع")}</th>
                  <th className="px-3 py-2 text-left">{bi("Période", "الفترة")}</th>
                  <th className="px-3 py-2 text-right">{bi("Jours", "الأيام")}</th>
                  <th className="px-3 py-2 text-left">{bi("Statut", "الحالة")}</th>
                  <th className="px-3 py-2 text-left">{bi("Titre", "السند")}</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {visible.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-3 py-6 text-center text-foreground/50">
                      {bi("Aucune demande.", "لا توجد طلبات.")}
                    </td>
                  </tr>
                ) : (
                  visible.map((row) => {
                    const k = leaveKindLabel(row.kind);
                    const st = STATUS[row.status];
                    return (
                      <tr key={row.id} className="border-t border-border/60 align-top">
                        <td className="px-3 py-2">
                          {row.employee_label}
                          {row.reason ? <div className="text-xs text-foreground/55">{row.reason}</div> : null}
                        </td>
                        <td className="px-3 py-2">
                          {k.fr} <span className="text-xs text-foreground/50">({k.legend})</span>
                          {row.cnas_ref ? <div className="text-xs text-foreground/55">CNAS : {row.cnas_ref}</div> : null}
                        </td>
                        <td className="px-3 py-2 tabular-nums">
                          {slashDateIso(row.start_date)} → {slashDateIso(row.end_date)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{row.days}</td>
                        <td className="px-3 py-2">
                          <RhChip tone={st.tone}>{st.label}</RhChip>
                          {row.decided_by_name ? (
                            <div className="text-xs text-foreground/50">
                              {row.decided_by_name}
                              {row.decision_note ? ` · ${row.decision_note}` : ""}
                            </div>
                          ) : null}
                        </td>
                        <td className="px-3 py-2 tabular-nums">{row.correspondence_number ?? "—"}</td>
                        <td className="space-x-1 whitespace-nowrap px-3 py-2 text-right">
                          {row.status === "APPROVED" ? (
                            <Button variant="secondary" onClick={() => setPrintRow(row)}>
                              {bi("Titre de congé", "سند العطلة")}
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
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </>
      ) : null}

      {tab === "balances" ? (
        <div className="overflow-x-auto rounded-2xl border border-border/80 bg-surface">
          <table className="w-full text-sm">
            <thead className="bg-surface-muted text-xs uppercase text-foreground/60">
              <tr>
                <th className="px-3 py-2 text-left">{bi("Employé", "العامل")}</th>
                <th className="px-3 py-2 text-right">{bi("Mois travaillés", "الأشهر")}</th>
                <th className="px-3 py-2 text-right">{bi("Acquis", "المكتسب")}</th>
                <th className="px-3 py-2 text-right">{bi("Ajustements", "التعديلات")}</th>
                <th className="px-3 py-2 text-right">{bi("Pris", "المستهلك")}</th>
                <th className="px-3 py-2 text-right">{bi("En attente", "قيد الانتظار")}</th>
                <th className="px-3 py-2 text-right">{bi("Solde", "الرصيد")}</th>
              </tr>
            </thead>
            <tbody>
              {balances
                .filter((b) => !q || b.employee_label.toLowerCase().includes(q))
                .map((b) => (
                  <tr key={b.employee_id} className="border-t border-border/60">
                    <td className="px-3 py-2">{b.employee_label}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{b.months}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{b.accrued}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{b.adjustments}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{b.taken}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{b.pending || ""}</td>
                    <td
                      className={`px-3 py-2 text-right font-semibold tabular-nums ${b.balance < 0 ? "text-red-600" : ""}`}
                    >
                      {b.balance}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
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
          <div className="overflow-x-auto rounded-2xl border border-border/80 bg-surface">
            <table className="w-full text-sm">
              <thead className="bg-surface-muted text-xs uppercase text-foreground/60">
                <tr>
                  <th className="px-3 py-2 text-left">{bi("Employé", "العامل")}</th>
                  <th className="px-3 py-2 text-right">{bi("Jours", "الأيام")}</th>
                  <th className="px-3 py-2 text-left">{bi("Date", "التاريخ")}</th>
                  <th className="px-3 py-2 text-left">{bi("Motif", "السبب")}</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {adjustments.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-6 text-center text-foreground/50">
                      {bi("Aucun ajustement.", "لا توجد تعديلات.")}
                    </td>
                  </tr>
                ) : (
                  adjustments.map((a) => (
                    <tr key={a.id} className="border-t border-border/60">
                      <td className="px-3 py-2">{a.employee_label}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{a.days > 0 ? `+${a.days}` : a.days}</td>
                      <td className="px-3 py-2 tabular-nums">{slashDateIso(a.as_of)}</td>
                      <td className="px-3 py-2">
                        {a.reason}
                        {a.author_name ? <span className="text-xs text-foreground/50"> · {a.author_name}</span> : null}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {canDecide ? (
                          <Button variant="secondary" disabled={pending} onClick={() => removeAdjustment(a)}>
                            {bi("Supprimer", "حذف")}
                          </Button>
                        ) : null}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
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
