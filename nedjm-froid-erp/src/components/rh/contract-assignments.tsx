"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import {
  deleteAssignmentChange,
  listContractAssignments,
  requestAssignmentCorrection,
  saveAssignmentChange,
  type AssignmentHistoryRow,
  type AssignmentPanel,
} from "@/lib/actions/hr-assignments";
import { Button } from "@/components/ui/button";
import { DataTable, dataColumns } from "@/components/ui/data-table";
import { RhAlert, RhChip, RhField, bi, rhInput } from "@/components/rh/rh-ui";

type SiteOption = { id: string; name_fr: string };

const col = dataColumns<AssignmentHistoryRow>();

function frDate(iso: string) {
  return iso.slice(0, 10).split("-").reverse().join("/");
}

function nextMonth() {
  const d = new Date();
  const n = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}`;
}

function defaultMonth(firstChangeable: string) {
  const open = firstChangeable.slice(0, 7);
  const next = nextMonth();
  return open > next ? open : next;
}

export function ContractAssignments({
  contractId,
  sites,
  canEdit,
  onCurrentSite,
}: {
  contractId: string;
  sites: readonly SiteOption[];
  canEdit: boolean;
  /** Keeps the contract form in sync with the site in force today. */
  onCurrentSite?: (siteId: string) => void;
}) {
  const [panel, setPanel] = useState<AssignmentPanel | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [draft, setDraft] = useState({ month: nextMonth(), site_id: "", reason: "", document_ref: "" });
  const [correcting, setCorrecting] = useState<AssignmentHistoryRow | null>(null);
  const [fix, setFix] = useState({ site_id: "", reason: "" });
  const [requested, setRequested] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const today = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    let cancelled = false;
    listContractAssignments(contractId).then((r) => {
      if (cancelled) return;
      if (r.ok) {
        setPanel(r.data);
        setDraft((d) => ({ ...d, month: defaultMonth(r.data.first_changeable) }));
      } else setError(r.error);
    });
    return () => {
      cancelled = true;
    };
  }, [contractId]);

  async function reload() {
    const r = await listContractAssignments(contractId);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setPanel(r.data);
    const current = r.data.rows.find((row) => row.effective_from <= today) ?? r.data.rows[r.data.rows.length - 1];
    if (current) onCurrentSite?.(current.site_id);
  }

  function submit() {
    setError(null);
    setNotice(null);
    start(async () => {
      const r = await saveAssignmentChange({
        contract_id: contractId,
        site_id: draft.site_id,
        effective_from: `${draft.month}-01`,
        reason: draft.reason,
        document_ref: draft.document_ref,
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setDraft((d) => ({ ...d, site_id: "", reason: "", document_ref: "" }));
      setNotice(
        [
          bi("Changement d'affectation enregistré. Les mois antérieurs ne changent pas.", "تم حفظ تغيير التعيين. الأشهر السابقة لا تتغير."),
          r.data.payroll_notice,
          r.data.warning,
        ]
          .filter(Boolean)
          .join("\n"),
      );
      await reload();
    });
  }

  function remove(row: AssignmentHistoryRow) {
    if (!window.confirm(bi(`Supprimer le changement d'affectation du ${frDate(row.effective_from)} ?`, "حذف هذا التغيير؟"))) {
      return;
    }
    setError(null);
    setNotice(null);
    start(async () => {
      const r = await deleteAssignmentChange({ id: row.id });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      if (r.data.warning) setNotice(r.data.warning);
      await reload();
    });
  }

  function requestFix() {
    if (!correcting) return;
    setError(null);
    setRequested(null);
    start(async () => {
      const r = await requestAssignmentCorrection({
        assignment_id: correcting.id,
        site_id: fix.site_id,
        reason: fix.reason,
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setRequested(r.data.decision_id);
      setCorrecting(null);
      setFix({ site_id: "", reason: "" });
      await reload();
    });
  }

  if (error && !panel) return <RhAlert tone="danger">{error}</RhAlert>;
  if (!panel) return <p className="text-sm text-foreground/55">{bi("Chargement…", "جارٍ التحميل…")}</p>;

  const rows = panel.rows;
  const current = rows.find((r) => r.effective_from <= today) ?? rows[rows.length - 1] ?? null;
  const open = panel.first_changeable;

  const columns = [
    col.accessor("effective_from", {
      header: bi("À partir du", "ابتداءً من"),
      cell: ({ row: { original: row } }) => (
        <>
          {frDate(row.effective_from)}{" "}
          {current?.id === row.id ? <RhChip tone="success">{bi("En vigueur", "ساري")}</RhChip> : null}
          {row.effective_from > today ? <RhChip tone="warning">{bi("À venir", "قادم")}</RhChip> : null}
          <span className="block text-xs text-foreground/50">
            {row.kind === "INITIAL" ? bi("Affectation initiale", "التعيين الأولي") : bi("Changement daté", "تغيير مؤرخ")}
            {row.corrected ? ` · ${bi("corrigée par décision D8", "مصحح بقرار")}` : ""}
          </span>
        </>
      ),
    }),
    col.accessor("site_name", { header: bi("Chantier", "الورشة") }),
    col.accessor("reason", {
      header: bi("Motif", "السبب"),
      cell: ({ row: { original: row } }) => (
        <>
          {row.reason}
          {row.document_ref ? <span className="text-xs text-foreground/50"> · {row.document_ref}</span> : null}
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
      cell: ({ row: { original: row } }) => {
        const openRequest = panel.open_corrections[row.id];
        return (
          <div className="flex flex-wrap justify-end gap-2">
            {openRequest ? (
              <Link href={`/decisions/${openRequest}`} className="text-xs font-semibold text-brand underline">
                {bi("Correction en attente (D8)", "تصحيح قيد الانتظار")}
              </Link>
            ) : canEdit && row.effective_from >= open ? (
              <Button
                variant="secondary"
                disabled={pending}
                onClick={() => {
                  setCorrecting(row);
                  setFix({ site_id: "", reason: "" });
                }}
              >
                {bi("Erreur de saisie…", "خطأ في الإدخال…")}
              </Button>
            ) : null}
            {canEdit && row.kind === "OFFICIAL" && row.effective_from >= open ? (
              <Button variant="secondary" disabled={pending} onClick={() => remove(row)}>
                {bi("Supprimer", "حذف")}
              </Button>
            ) : null}
          </div>
        );
      },
    }),
  ];

  return (
    <div className="space-y-4">
      <RhAlert tone="info">
        {bi(
          `Le chantier d'un mois est celui de l'affectation en vigueur le 1er (wilaya et zone IRG comprises). Un changement prend effet le 1er d'un mois, sans découpage ni proratisation, et ne touche aucun mois déjà traité : premier mois modifiable ${frDate(open)}. Les ordres de mission ne changent pas l'affectation.`,
          "ورشة الشهر هي ورشة التعيين الساري في اليوم الأول منه. يسري التغيير من أول الشهر ولا يمس الأشهر المعالجة.",
        )}
      </RhAlert>
      {error ? <RhAlert tone="danger">{error}</RhAlert> : null}
      {notice ? (
        <RhAlert tone="success">
          <span className="whitespace-pre-wrap">{notice}</span>
        </RhAlert>
      ) : null}
      {requested ? (
        <RhAlert tone="success">
          {bi("Demande de correction envoyée : rien n'est modifié avant la décision.", "أُرسل طلب التصحيح.")}{" "}
          <Link href={`/decisions/${requested}`} className="font-semibold underline">
            {bi("Ouvrir la décision D8", "فتح القرار")}
          </Link>
        </RhAlert>
      ) : null}

      <DataTable
        data={rows}
        columns={columns}
        getRowId={(r) => r.id}
        searchable={false}
        pageSize={0}
        columnToggle={false}
        emptyTitle={bi("Aucune affectation", "لا توجد تعيينات")}
      />

      {correcting ? (
        <div className="rounded border border-amber-300/70 p-3">
          <p className="mb-1 text-sm font-semibold">
            {bi(
              `Corriger l'affectation du ${frDate(correcting.effective_from)} (${correcting.site_name})`,
              "تصحيح التعيين",
            )}
          </p>
          <p className="mb-3 text-xs text-foreground/60">
            {bi(
              "Pour une erreur de saisie uniquement : le chantier est remplacé sur toute la période de cette affectation, après décision D8 du SUPER_ADMIN. Pour un vrai changement de chantier, utilisez « Nouveau changement d'affectation ».",
              "لخطأ في الإدخال فقط، بعد قرار D8.",
            )}
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <RhField label={bi("Chantier correct", "الورشة الصحيحة")}>
              <select
                className={rhInput}
                value={fix.site_id}
                onChange={(e) => setFix({ ...fix, site_id: e.target.value })}
              >
                <option value="">—</option>
                {sites
                  .filter((s) => s.id !== correcting.site_id)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name_fr}
                    </option>
                  ))}
              </select>
            </RhField>
            <RhField label={bi("Motif (10 caractères min.)", "السبب")}>
              <input
                className={rhInput}
                value={fix.reason}
                onChange={(e) => setFix({ ...fix, reason: e.target.value })}
              />
            </RhField>
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setCorrecting(null)}>
              {bi("Annuler", "إلغاء")}
            </Button>
            <Button disabled={pending || !fix.site_id || fix.reason.trim().length < 10} onClick={requestFix}>
              {bi("Demander la décision D8", "طلب القرار D8")}
            </Button>
          </div>
        </div>
      ) : null}

      {canEdit ? (
        <div className="rounded border border-border p-3">
          <p className="mb-3 text-sm font-semibold">{bi("Nouveau changement d'affectation", "تغيير تعيين جديد")}</p>
          <div className="grid gap-3 sm:grid-cols-4">
            <RhField label={bi("À partir du 1er de", "ابتداءً من أول شهر")}>
              <input
                type="month"
                className={rhInput}
                min={open.slice(0, 7)}
                value={draft.month}
                onChange={(e) => setDraft({ ...draft, month: e.target.value })}
              />
            </RhField>
            <RhField label={bi("Nouveau chantier", "الورشة الجديدة")}>
              <select
                className={rhInput}
                value={draft.site_id}
                onChange={(e) => setDraft({ ...draft, site_id: e.target.value })}
              >
                <option value="">—</option>
                {sites.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name_fr}
                  </option>
                ))}
              </select>
            </RhField>
            <RhField label={bi("Motif", "السبب")}>
              <input
                className={rhInput}
                value={draft.reason}
                placeholder={bi("Mutation, fin de chantier…", "نقل، نهاية ورشة…")}
                onChange={(e) => setDraft({ ...draft, reason: e.target.value })}
              />
            </RhField>
            <RhField label={bi("Document (réf.)", "الوثيقة")}>
              <input
                className={rhInput}
                value={draft.document_ref}
                placeholder={bi("Décision n°…", "مقرر رقم…")}
                onChange={(e) => setDraft({ ...draft, document_ref: e.target.value })}
              />
            </RhField>
          </div>
          <div className="mt-3 flex justify-end">
            <Button
              disabled={pending || !draft.site_id || !draft.month || draft.reason.trim().length < 3}
              onClick={submit}
            >
              {bi("Enregistrer le changement", "حفظ التغيير")}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
