"use client";

import { useState, useTransition } from "react";
import {
  interimStatementHtml,
  issueInterimStatement,
  previewInterimStatement,
  saveAgency,
  setInterimStatementStatus,
  type AgencyRow,
  type InterimStatementRow,
} from "@/lib/actions/hr-interim";
import type { InterimLine, InterimStatement } from "@/lib/hr/interim-billing";
import { printHtml } from "@/components/rh/print-frame";
import { Button } from "@/components/ui/button";
import { DataTable, dataColumns } from "@/components/ui/data-table";
import {
  RhAlert,
  RhChip,
  RhField,
  RhModal,
  RhPageHeader,
  RhToolbar,
  rhInput,
} from "@/components/rh/rh-ui";

type SiteOpt = { id: string; name_fr: string };
type AgencyForm = Omit<AgencyRow, "workers" | "id" | "default_daily_rate" | "markup_pct" | "vat_pct"> & {
  id?: string;
  default_daily_rate: string;
  markup_pct: string;
  vat_pct: string;
};
type Status = InterimStatementRow["status_code"];

const STATUS: Record<Status, { label: string; tone: "neutral" | "success" | "danger" }> = {
  ISSUED: { label: "Émis", tone: "neutral" },
  RECONCILED: { label: "Rapproché", tone: "success" },
  CANCELLED: { label: "Annulé", tone: "danger" },
};

const emptyAgency = (): AgencyForm => ({
  code: "",
  name: "",
  nif: "",
  nis: "",
  rc: "",
  address: "",
  phone: "",
  email: "",
  contact_name: "",
  default_daily_rate: "",
  markup_pct: "0",
  vat_pct: "19",
  is_active: true,
  notes: "",
});

function money(n: number) {
  return new Intl.NumberFormat("fr-DZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

const agencyCol = dataColumns<AgencyRow>();
const lineCol = dataColumns<InterimLine>();
const statementCol = dataColumns<InterimStatementRow>();

const lineColumns = [
  lineCol.accessor("matricule", { header: "Matricule" }),
  lineCol.accessor("employee_name", { header: "Intérimaire" }),
  lineCol.accessor("site_name", { header: "Chantier" }),
  lineCol.accessor("days_billed", { header: "Jours", meta: { className: "tabular-nums" } }),
  lineCol.accessor("daily_rate", { header: "Taux (DA)", meta: { className: "font-mono" }, cell: (i) => money(i.getValue()) }),
  lineCol.accessor("amount", { header: "Montant (DA)", meta: { className: "font-mono" }, cell: (i) => money(i.getValue()) }),
];

export function InterimManager({
  initialAgencies,
  initialStatements,
  sites,
  year,
  month,
  canEdit,
  loadError,
}: {
  initialAgencies: AgencyRow[];
  initialStatements: InterimStatementRow[];
  sites: SiteOpt[];
  year: number;
  month: number;
  canEdit: boolean;
  loadError?: string;
}) {
  const [agencies, setAgencies] = useState(initialAgencies);
  const [statements, setStatements] = useState(initialStatements);
  const [agencyForm, setAgencyForm] = useState<AgencyForm | null>(null);
  const [agencyId, setAgencyId] = useState(initialAgencies.find((a) => a.is_active)?.id ?? "");
  const [siteId, setSiteId] = useState("");
  const [preview, setPreview] = useState<(InterimStatement & { contracts: number }) | null>(null);
  const [reconcile, setReconcile] = useState<{ row: InterimStatementRow; ref: string; amount: string } | null>(null);
  const [error, setError] = useState<string | null>(loadError ?? null);
  const [info, setInfo] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function goPeriod(y: number, m: number) {
    window.location.search = `?year=${y}&month=${m}`;
  }

  function submitAgency() {
    if (!agencyForm) return;
    setError(null);
    start(async () => {
      const r = await saveAgency({
        ...agencyForm,
        default_daily_rate: Number(agencyForm.default_daily_rate || 0),
        markup_pct: Number(agencyForm.markup_pct || 0),
        vat_pct: Number(agencyForm.vat_pct || 0),
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      const row: AgencyRow = {
        ...agencyForm,
        id: r.data.id,
        code: agencyForm.code.trim().toUpperCase(),
        default_daily_rate: Number(agencyForm.default_daily_rate || 0),
        markup_pct: Number(agencyForm.markup_pct || 0),
        vat_pct: Number(agencyForm.vat_pct || 0),
        workers: agencies.find((a) => a.id === r.data.id)?.workers ?? 0,
      };
      setAgencies((prev) =>
        (prev.some((a) => a.id === row.id) ? prev.map((a) => (a.id === row.id ? row : a)) : [...prev, row]).sort((a, b) =>
          a.name.localeCompare(b.name, "fr"),
        ),
      );
      if (!agencyId) setAgencyId(row.id);
      setAgencyForm(null);
      setInfo(`Agence ${row.code} enregistrée.`);
    });
  }

  function runPreview() {
    if (!agencyId) return;
    setError(null);
    setInfo(null);
    start(async () => {
      const r = await previewInterimStatement({ agency_id: agencyId, year, month, site_id: siteId || null });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setPreview(r.data);
    });
  }

  function issue() {
    if (!preview?.lines.length) return;
    if (!window.confirm(`Émettre le relevé : ${preview.lines.length} intérimaire(s), ${money(preview.amount_ttc)} DA TTC ?`)) return;
    setError(null);
    start(async () => {
      const r = await issueInterimStatement({ agency_id: agencyId, year, month, site_id: siteId || null });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      window.location.reload();
    });
  }

  function print(row: InterimStatementRow) {
    setError(null);
    start(async () => {
      const r = await interimStatementHtml(row.id);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      printHtml(r.data, "hr-interim-print");
    });
  }

  function setStatus(row: InterimStatementRow, status: Status, extra: { ref?: string; amount?: number | null; reason?: string } = {}) {
    setError(null);
    start(async () => {
      const r = await setInterimStatementStatus({
        id: row.id,
        status,
        agency_invoice_ref: extra.ref,
        agency_invoice_amount: extra.amount,
        reason: extra.reason,
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setReconcile(null);
      setStatements((prev) =>
        prev.map((s) =>
          s.id === row.id
            ? {
                ...s,
                status_code: status,
                agency_invoice_ref: status === "RECONCILED" ? extra.ref ?? null : status === "ISSUED" ? null : s.agency_invoice_ref,
                agency_invoice_amount:
                  status === "RECONCILED" ? extra.amount ?? null : status === "ISSUED" ? null : s.agency_invoice_amount,
                reconciled_at: status === "RECONCILED" ? new Date().toISOString() : status === "ISSUED" ? null : s.reconciled_at,
                cancelled_reason: status === "CANCELLED" ? extra.reason ?? null : s.cancelled_reason,
              }
            : s,
        ),
      );
    });
  }

  function cancel(row: InterimStatementRow) {
    const reason = window.prompt("Motif de l'annulation (obligatoire) :", "");
    if (!reason?.trim()) return;
    setStatus(row, "CANCELLED", { reason });
  }

  const live = statements.filter((s) => s.status_code !== "CANCELLED");
  const liveTtc = live.reduce((s, r) => s + r.amount_ttc, 0);
  const reconcileGap =
    reconcile && reconcile.amount.trim() ? Math.round((Number(reconcile.amount) - reconcile.row.amount_ttc) * 100) / 100 : null;

  const agencyColumns = [
    agencyCol.accessor("code", { header: "Code", meta: { className: "font-mono font-semibold" } }),
    agencyCol.accessor("name", {
      header: "Raison sociale",
      cell: ({ row: { original: a } }) => (
        <>
          {a.name} {a.is_active ? null : <RhChip tone="warning">Inactive</RhChip>}
          <span className="block text-[11px] text-foreground/55">
            NIF {a.nif || "—"} · RC {a.rc || "—"}
          </span>
        </>
      ),
    }),
    agencyCol.accessor((a) => a.contact_name ?? "", {
      id: "contact",
      header: "Contact",
      cell: ({ row: { original: a } }) => (
        <>
          {a.contact_name || "—"}
          <span className="block text-[11px] text-foreground/55">{[a.phone, a.email].filter(Boolean).join(" · ")}</span>
        </>
      ),
    }),
    agencyCol.accessor("default_daily_rate", {
      header: "Taux jour (DA)",
      meta: { className: "font-mono" },
      cell: (i) => money(i.getValue()),
    }),
    agencyCol.accessor("markup_pct", {
      header: "Coef. / TVA",
      meta: { className: "tabular-nums" },
      cell: ({ row: { original: a } }) => (
        <>
          {a.markup_pct} % / {a.vat_pct} %
        </>
      ),
    }),
    agencyCol.accessor("workers", { header: "Intérimaires", meta: { className: "tabular-nums" } }),
    agencyCol.display({
      id: "actions",
      header: "",
      enableSorting: false,
      enableHiding: false,
      cell: ({ row: { original: a } }) =>
        canEdit ? (
          <Button
            variant="ghost"
            onClick={() =>
              setAgencyForm({
                ...a,
                default_daily_rate: String(a.default_daily_rate),
                markup_pct: String(a.markup_pct),
                vat_pct: String(a.vat_pct),
              })
            }
          >
            Modifier
          </Button>
        ) : null,
    }),
  ];

  const statementColumns = [
    statementCol.accessor("statement_no", {
      header: "Relevé",
      cell: ({ row: { original: s } }) => (
        <>
          <span className="font-mono font-semibold">{s.statement_no}</span>
          <span className="block text-[11px] text-foreground/55">{new Date(s.created_at).toLocaleString("fr-FR")}</span>
        </>
      ),
    }),
    statementCol.accessor("agency_name", { header: "Agence" }),
    statementCol.accessor((s) => s.site_name ?? "Tous", { id: "site", header: "Chantier" }),
    statementCol.accessor("days_total", { header: "Jours", meta: { className: "tabular-nums" } }),
    statementCol.accessor("amount_ttc", {
      header: "HT / TTC (DA)",
      meta: { className: "font-mono" },
      cell: ({ row: { original: s } }) => (
        <>
          {money(s.amount_ht)}
          <span className="block font-semibold">{money(s.amount_ttc)}</span>
        </>
      ),
    }),
    statementCol.accessor((s) => STATUS[s.status_code].label, {
      id: "status",
      header: "Statut / facture agence",
      cell: ({ row: { original: s } }) => (
        <>
          <RhChip tone={STATUS[s.status_code].tone}>{STATUS[s.status_code].label}</RhChip>
          {s.agency_invoice_ref ? (
            <span className="mt-1 block text-[11px] text-foreground/60">
              Facture {s.agency_invoice_ref}
              {s.agency_invoice_amount != null ? ` · ${money(s.agency_invoice_amount)} DA` : ""}
              {s.agency_invoice_amount != null && Math.abs(s.agency_invoice_amount - s.amount_ttc) >= 0.01 ? (
                <span className="block text-red-700">Écart {money(s.agency_invoice_amount - s.amount_ttc)} DA</span>
              ) : null}
            </span>
          ) : null}
          {s.cancelled_reason ? (
            <span className="block text-[11px] italic text-foreground/60">{s.cancelled_reason}</span>
          ) : null}
        </>
      ),
    }),
    statementCol.display({
      id: "actions",
      header: "",
      enableSorting: false,
      enableHiding: false,
      cell: ({ row: { original: s } }) => (
        <div className="flex flex-wrap gap-1">
          <Button variant="ghost" disabled={pending} onClick={() => print(s)}>
            Imprimer
          </Button>
          {canEdit && s.status_code === "ISSUED" ? (
            <>
              <Button
                variant="secondary"
                disabled={pending}
                onClick={() => setReconcile({ row: s, ref: "", amount: String(s.amount_ttc) })}
              >
                Rapprocher
              </Button>
              <Button variant="ghost" disabled={pending} onClick={() => cancel(s)}>
                Annuler
              </Button>
            </>
          ) : null}
          {canEdit && s.status_code === "RECONCILED" ? (
            <Button variant="ghost" disabled={pending} onClick={() => setStatus(s, "ISSUED")}>
              Annuler le rapprochement
            </Button>
          ) : null}
        </div>
      ),
    }),
  ];

  return (
    <div className="space-y-5">
      <RhPageHeader
        title="Intérim — agences et relevés de prestations"
        description="Les intérimaires ont un contrat de type INTERIM rattaché à une agence : ils sont pointés comme les salariés mais exclus de la paie. Le relevé mensuel facture les jours de présence validés (coefficient de la légende) × taux journalier, majorés du coefficient de l'agence et de la TVA, puis se rapproche de la facture de l'agence."
      />
      {error ? <RhAlert tone="danger">{error}</RhAlert> : null}
      {info && !error ? <RhAlert tone="success">{info}</RhAlert> : null}

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground/80">Agences d&apos;intérim</h2>
          {canEdit ? (
            <Button variant="secondary" onClick={() => setAgencyForm(emptyAgency())}>
              Nouvelle agence
            </Button>
          ) : null}
        </div>
        <DataTable
          data={agencies}
          columns={agencyColumns}
          getRowId={(a) => a.id}
          searchPlaceholder="Code, raison sociale, contact…"
          searchText={(a) => [a.code, a.name, a.nif, a.rc, a.contact_name, a.phone, a.email].filter(Boolean).join(" ")}
          pageSize={0}
          emptyTitle="Aucune agence"
          emptyBody="Créez-en une, puis choisissez-la dans le contrat (type INTERIM)."
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground/80">Relevés mensuels</h2>
        <RhToolbar>
          <RhField label="Année">
            <input
              className={rhInput}
              type="number"
              defaultValue={year}
              onBlur={(e) => Number(e.target.value) !== year && goPeriod(Number(e.target.value), month)}
            />
          </RhField>
          <RhField label="Mois">
            <select className={rhInput} value={month} onChange={(e) => goPeriod(year, Number(e.target.value))}>
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <option key={m} value={m}>
                  {String(m).padStart(2, "0")}
                </option>
              ))}
            </select>
          </RhField>
          <RhField label="Agence">
            <select
              className={rhInput}
              value={agencyId}
              onChange={(e) => {
                setAgencyId(e.target.value);
                setPreview(null);
              }}
            >
              <option value="">—</option>
              {agencies
                .filter((a) => a.is_active)
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.code} · {a.name}
                  </option>
                ))}
            </select>
          </RhField>
          <RhField label="Chantier">
            <select
              className={rhInput}
              value={siteId}
              onChange={(e) => {
                setSiteId(e.target.value);
                setPreview(null);
              }}
            >
              <option value="">Tous les chantiers</option>
              {sites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name_fr}
                </option>
              ))}
            </select>
          </RhField>
          {canEdit ? (
            <Button variant="secondary" disabled={pending || !agencyId} onClick={runPreview}>
              Calculer le relevé
            </Button>
          ) : null}
        </RhToolbar>

        {preview ? (
          <div className="space-y-3 rounded-2xl border border-border/60 bg-surface px-4 py-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold">
                {preview.lines.length} intérimaire(s) · {preview.days_total} jour(s) · {money(preview.amount_ttc)} DA TTC
              </span>
              <RhChip>{preview.contracts} contrat(s) INTERIM sur la période</RhChip>
              {preview.missingRate.length ? <RhChip tone="danger">Taux manquant : {preview.missingRate.join(", ")}</RhChip> : null}
              <div className="ml-auto">
                <Button disabled={pending || !preview.lines.length || preview.missingRate.length > 0} onClick={issue}>
                  Émettre le relevé
                </Button>
              </div>
            </div>
            {preview.lines.length ? (
              <DataTable
                data={preview.lines}
                columns={lineColumns}
                getRowId={(l) => l.contract_id}
                searchPlaceholder="Matricule, intérimaire, chantier…"
                searchText={(l) => [l.matricule, l.employee_name, l.site_name].join(" ")}
                pageSize={0}
                columnToggle={false}
              />
            ) : (
              <p className="text-foreground/60">Aucune présence validée à facturer pour cette agence sur la période.</p>
            )}
            <p className="text-xs text-foreground/60">
              Sous-total {money(preview.subtotal)} · coefficient {money(preview.markup)} · HT {money(preview.amount_ht)} · TVA{" "}
              {money(preview.amount_vat)}
            </p>
          </div>
        ) : null}

        <div className="flex flex-wrap gap-3 text-sm">
          <RhChip tone="brand">
            {live.length} relevé(s) actif(s) · {money(liveTtc)} DA TTC
          </RhChip>
        </div>

        <DataTable
          data={statements}
          columns={statementColumns}
          getRowId={(s) => s.id}
          searchPlaceholder="N° de relevé, agence, chantier…"
          searchText={(s) =>
            [s.statement_no, s.agency_name, s.site_name, s.agency_invoice_ref, STATUS[s.status_code].label]
              .filter(Boolean)
              .join(" ")
          }
          emptyTitle={`Aucun relevé pour ${String(month).padStart(2, "0")}/${year}`}
        />
      </section>

      {agencyForm ? (
        <RhModal
          title={agencyForm.id ? `Agence ${agencyForm.code}` : "Nouvelle agence d'intérim"}
          onClose={() => setAgencyForm(null)}
          size="lg"
          footer={
            <>
              <Button variant="secondary" onClick={() => setAgencyForm(null)}>
                Fermer
              </Button>
              <Button disabled={pending || !agencyForm.code.trim() || !agencyForm.name.trim()} onClick={submitAgency}>
                Enregistrer
              </Button>
            </>
          }
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <RhField label="Code" hint="2 à 20 caractères A-Z, 0-9">
              <input className={rhInput} value={agencyForm.code} onChange={(e) => setAgencyForm({ ...agencyForm, code: e.target.value })} />
            </RhField>
            <RhField label="Raison sociale">
              <input className={rhInput} value={agencyForm.name} onChange={(e) => setAgencyForm({ ...agencyForm, name: e.target.value })} />
            </RhField>
            {(["nif", "nis", "rc", "phone", "email", "contact_name"] as const).map((k) => (
              <RhField
                key={k}
                label={{ nif: "NIF", nis: "NIS", rc: "RC", phone: "Téléphone", email: "E-mail", contact_name: "Contact" }[k]}
              >
                <input
                  className={rhInput}
                  value={agencyForm[k] ?? ""}
                  onChange={(e) => setAgencyForm({ ...agencyForm, [k]: e.target.value })}
                />
              </RhField>
            ))}
            <RhField label="Adresse">
              <input
                className={rhInput}
                value={agencyForm.address ?? ""}
                onChange={(e) => setAgencyForm({ ...agencyForm, address: e.target.value })}
              />
            </RhField>
            <RhField label="Taux journalier par défaut (DA)" hint="Utilisé quand le contrat n'a pas de taux propre">
              <input
                className={rhInput}
                inputMode="decimal"
                value={agencyForm.default_daily_rate}
                onChange={(e) => setAgencyForm({ ...agencyForm, default_daily_rate: e.target.value })}
              />
            </RhField>
            <RhField label="Coefficient agence (%)">
              <input
                className={rhInput}
                inputMode="decimal"
                value={agencyForm.markup_pct}
                onChange={(e) => setAgencyForm({ ...agencyForm, markup_pct: e.target.value })}
              />
            </RhField>
            <RhField label="TVA (%)">
              <input
                className={rhInput}
                inputMode="decimal"
                value={agencyForm.vat_pct}
                onChange={(e) => setAgencyForm({ ...agencyForm, vat_pct: e.target.value })}
              />
            </RhField>
            <RhField label="Notes">
              <input
                className={rhInput}
                value={agencyForm.notes ?? ""}
                onChange={(e) => setAgencyForm({ ...agencyForm, notes: e.target.value })}
              />
            </RhField>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={agencyForm.is_active}
                onChange={(e) => setAgencyForm({ ...agencyForm, is_active: e.target.checked })}
              />
              Active
            </label>
          </div>
        </RhModal>
      ) : null}

      {reconcile ? (
        <RhModal
          title={`Rapprochement du relevé ${reconcile.row.statement_no}`}
          onClose={() => setReconcile(null)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setReconcile(null)}>
                Fermer
              </Button>
              <Button
                disabled={pending || !reconcile.ref.trim()}
                onClick={() =>
                  setStatus(reconcile.row, "RECONCILED", {
                    ref: reconcile.ref,
                    amount: reconcile.amount.trim() ? Number(reconcile.amount) : null,
                  })
                }
              >
                Rapprocher
              </Button>
            </>
          }
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <RhField label="N° de facture de l'agence" hint="Obligatoire">
              <input className={rhInput} value={reconcile.ref} onChange={(e) => setReconcile({ ...reconcile, ref: e.target.value })} />
            </RhField>
            <RhField label="Montant TTC facturé (DA)" hint={`Relevé : ${money(reconcile.row.amount_ttc)} DA`}>
              <input
                className={rhInput}
                inputMode="decimal"
                value={reconcile.amount}
                onChange={(e) => setReconcile({ ...reconcile, amount: e.target.value })}
              />
            </RhField>
          </div>
          {reconcileGap ? (
            <RhAlert tone="warning">Écart de {money(reconcileGap)} DA avec le relevé : vérifiez la facture avant de rapprocher.</RhAlert>
          ) : null}
        </RhModal>
      ) : null}
    </div>
  );
}
