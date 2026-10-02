"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { DataTable, dataColumns } from "@/components/ui/data-table";
import { RhAlert, RhChip, RhPageHeader, RhPanel } from "@/components/rh/rh-ui";
import { decideDecision, executeDecision, type DecisionDetail } from "@/lib/actions/decisions";
import type {
  AttendanceConflictContext,
  CodeMappingContext,
  DeclarationDecisionContext,
  ImportPolicyContext,
  LegalEntryPathContext,
  LegendCoefficientContext,
  PayrollChainContext,
  PayrollReopenContext,
  TransferDecisionContext,
  UnapprovedRulesContext,
} from "@/lib/decisions/catalog";
import {
  JUSTIFICATION_MAX,
  attendanceConflictNotices,
  decisionStatusLabel,
  decisionStatusTone,
  declarationRiskNotices,
  legalEntryPathNotices,
  legendCoefficientNotices,
  proposalStatusLabel,
  ruleFamilyLabel,
  unapprovedRulesNotices,
  payrollRunStatusLabel,
  payrollSourceLabel,
  periodLabel,
  periodNatureText,
  reopenRiskNotices,
  ruleApplicationSlipNotice,
  transferRiskNotices,
  validateJustification,
} from "@/lib/decisions/catalog";
import { DeclarationExportsTable, ExternalOperationsList } from "@/components/rh/external-registers";
import { declarationKindLabel, declarationReasonLabel, transferReasonLabel } from "@/lib/hr/external-operations";
import { RULE_ACTIONS, RULE_FAMILIES, frMonth, type RuleAction, type RuleFamily } from "@/lib/rules/proposals";
import { RuleDiff } from "@/components/rules/rule-content";
import { CitationsList } from "@/components/rules/legal-citations";
import { applicationPeriodLabel, legalDocLanguageLabel, legalDocTypeLabel } from "@/lib/rules/legal-documents";
import { conflictLabel, existingValueText, natureLabel, provenanceLabel } from "@/lib/hr/attendance-archive";

const asFamily = (v: string): RuleFamily =>
  (RULE_FAMILIES as readonly string[]).includes(v) ? (v as RuleFamily) : "LEGAL_VAR";
const asAction = (v: string): RuleAction => ((RULE_ACTIONS as readonly string[]).includes(v) ? (v as RuleAction) : "SET");

function dateTime(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("fr-DZ", { dateStyle: "short", timeStyle: "short" });
}

function frDate(iso: string) {
  return iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—";
}

function money(n: number) {
  return n.toLocaleString("fr-DZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-foreground/45">{label}</dt>
      <dd className="mt-0.5 text-sm text-foreground/85">{children}</dd>
    </div>
  );
}

const compactTable = { searchable: false, columnToggle: false, pageSize: 0 } as const;
const amountMeta = { align: "right", className: "tabular-nums" } as const;

type DraftSlip = NonNullable<DecisionDetail["assignment"]>["draft_slips"][number];
type RuleSlip = NonNullable<DecisionDetail["rule_application"]>["slips"][number];
type DeclarationMonth = DeclarationDecisionContext["months"][number] & { reasons: string[] };

const draftSlipCol = dataColumns<DraftSlip>();
const draftSlipColumns = [
  draftSlipCol.accessor("period", { header: "Mois" }),
  draftSlipCol.accessor("run_site", { header: "Paie brouillon" }),
  draftSlipCol.accessor("irg_amount", { header: "IRG actuel", meta: amountMeta, cell: (info) => money(info.getValue()) }),
  draftSlipCol.accessor("net_payable", { header: "Net actuel", meta: amountMeta, cell: (info) => money(info.getValue()) }),
];

const ruleSlipCol = dataColumns<RuleSlip>();
const ruleSlipColumns = [
  ruleSlipCol.accessor("period", { header: "Mois" }),
  ruleSlipCol.accessor((s) => payrollRunStatusLabel(s.status), { id: "status", header: "Statut" }),
  ruleSlipCol.accessor("runs", { header: "Paies", meta: amountMeta }),
  ruleSlipCol.accessor("slips", { header: "Bulletins", meta: amountMeta }),
  ruleSlipCol.display({
    id: "effect",
    header: "Effet",
    cell: ({ row: { original: s } }) =>
      s.affected ? (
        <RhChip tone="warning">Signalée, recalcul sur décision D3</RhChip>
      ) : s.status === "DRAFT" ? (
        <RhChip>Mois antérieur, inchangée</RhChip>
      ) : (
        <RhChip>Pour information, jamais modifiée</RhChip>
      ),
  }),
];

const reopenTransferCol = dataColumns<PayrollReopenContext["transfers"][number]>();
const reopenTransferColumns = [
  reopenTransferCol.accessor("batch_no", { header: "Lot" }),
  reopenTransferCol.accessor("mode", { header: "Mode" }),
  reopenTransferCol.accessor((t) => TRANSFER_STATUS[t.status] ?? t.status, {
    id: "status",
    header: "Statut",
    cell: (info) => {
      const status = info.row.original.status;
      return (
        <RhChip tone={status === "EXECUTED" ? "danger" : status === "CANCELLED" ? "neutral" : "warning"}>{info.getValue()}</RhChip>
      );
    },
  }),
  reopenTransferCol.accessor("lines", { header: "Lignes", meta: amountMeta }),
  reopenTransferCol.accessor("amount", { header: "Montant", meta: amountMeta, cell: (info) => money(info.getValue()) }),
  reopenTransferCol.accessor((t) => t.executed_at ?? "", {
    id: "executed_at",
    header: "Exécution",
    cell: (info) => (info.getValue() ? dateTime(info.getValue()) : "—"),
  }),
];

const repriseCol = dataColumns<PayrollChainContext["reprise_months"][number]>();
const repriseColumns = [
  repriseCol.accessor("period", { header: "Mois" }),
  repriseCol.accessor((m) => (m.open ? "Ouverts" : "Figés"), {
    id: "params",
    header: "Paramètres",
    cell: (info) => (info.row.original.open ? <RhChip tone="warning">Ouverts</RhChip> : <RhChip>Figés</RhChip>),
  }),
  repriseCol.accessor("runs", { header: "Paies", meta: amountMeta }),
  repriseCol.accessor("validated", { header: "Validées", meta: amountMeta }),
  repriseCol.accessor("slips", { header: "Bulletins", meta: amountMeta }),
];

const transferSlipCol = dataColumns<TransferDecisionContext["slips"][number]>();
const transferSlipColumns = [
  transferSlipCol.accessor((s) => `${s.matricule} · ${s.employee}`, { id: "employee", header: "Salarié" }),
  transferSlipCol.accessor("net_payable", { header: "Net", meta: amountMeta, cell: (info) => money(info.getValue()) }),
  transferSlipCol.display({
    id: "reasons",
    header: "Motifs",
    cell: ({ row }) => (
      <div className="flex flex-wrap gap-1">
        {row.original.reasons.map((r) => (
          <RhChip key={r} tone="warning">
            {transferReasonLabel(r)}
          </RhChip>
        ))}
      </div>
    ),
  }),
];

const internalTransferCol = dataColumns<TransferDecisionContext["internal_transfers"][number]>();
const internalTransferColumns = [
  internalTransferCol.accessor("batch_no", {
    header: "Lot",
    cell: ({ row: { original: t } }) => (
      <>
        {t.batch_no}
        {t.double_payment_risk ? (
          <span className="ml-1">
            <RhChip tone="danger">Risque de double paiement</RhChip>
          </span>
        ) : null}
      </>
    ),
  }),
  internalTransferCol.accessor((t) => TRANSFER_STATUS[t.status] ?? t.status, { id: "status", header: "Statut" }),
  internalTransferCol.accessor("lines", { header: "Lignes", meta: amountMeta }),
  internalTransferCol.accessor("amount", { header: "Montant", meta: amountMeta, cell: (info) => money(info.getValue()) }),
  internalTransferCol.accessor((t) => t.executed_at ?? "", {
    id: "executed_at",
    header: "Exécution",
    cell: (info) => (info.getValue() ? dateTime(info.getValue()) : "—"),
  }),
];

const conflictCol = dataColumns<AttendanceConflictContext["conflicts"][number]>();
const conflictColumns = [
  conflictCol.accessor((l) => `${l.matricule} · ${l.employee}`, {
    id: "employee",
    header: "Salarié",
    meta: { className: "align-top" },
    cell: (info) => (
      <>
        {info.getValue()}
        <div className="text-xs text-foreground/55">{info.row.original.source_ref}</div>
      </>
    ),
  }),
  conflictCol.accessor("work_date", { header: "Date", meta: { className: "align-top" }, cell: (info) => frDate(info.getValue()) }),
  conflictCol.accessor("imported_code", {
    header: "Import",
    meta: { className: "align-top" },
    cell: ({ row: { original: l } }) => (
      <>
        <b>{l.imported_code}</b> <span className="text-xs text-foreground/60">({l.site_name})</span>
      </>
    ),
  }),
  conflictCol.accessor(
    (l) =>
      l.existing.length
        ? l.existing.map((e) => existingValueText(e, e.site_name)).join(" ; ")
        : "Congé approuvé (aucune présence saisie)",
    { id: "existing", header: "Déjà enregistré", meta: { className: "align-top text-xs" } },
  ),
  conflictCol.display({
    id: "kinds",
    header: "Conflit",
    meta: { className: "align-top" },
    cell: ({ row: { original: l } }) => (
      <div className="flex flex-wrap gap-1">
        {l.kinds.map((k) => (
          <RhChip key={k} tone="warning">
            {conflictLabel(k)}
          </RhChip>
        ))}
        {l.resolution ? (
          <RhChip tone="brand">{l.resolution === "IMPORT" ? "Import retenu" : "Existant conservé"}</RhChip>
        ) : null}
      </div>
    ),
  }),
];

const pairCol = dataColumns<CodeMappingContext["pairs"][number]>();
const pairColumns = [
  pairCol.accessor("source_code", { header: "Code du fichier", meta: { className: "font-mono" } }),
  pairCol.accessor("legend_code", {
    header: "Code du référentiel proposé",
    cell: ({ row: { original: p } }) => (
      <>
        <span className="font-mono">{p.legend_code}</span> — {p.legend_label}
      </>
    ),
  }),
  pairCol.accessor("lines", { header: "Lignes", meta: amountMeta }),
  pairCol.accessor(
    (p) => (p.policy ? `${p.policy.legend_code} (${p.policy.status === "ACTIVE" ? "active" : "à confirmer"})` : "—"),
    { id: "policy", header: "Politique existante", meta: { className: "text-xs" } },
  ),
];

const blockerCol = dataColumns<UnapprovedRulesContext["blockers"][number]>();
const blockerColumns = [
  blockerCol.accessor((b) => b.title || "Proposition", {
    id: "title",
    header: "Règle",
    cell: (info) => (
      <Link className="font-semibold text-brand hover:underline" href={`/rh/legal/propositions?id=${info.row.original.proposal_id}`}>
        {info.getValue()}
      </Link>
    ),
  }),
  blockerCol.accessor((b) => ruleFamilyLabel(b.family), { id: "family", header: "Famille" }),
  blockerCol.accessor((b) => proposalStatusLabel(b.status), { id: "status", header: "Statut" }),
  blockerCol.accessor((b) => b.month ?? "", {
    id: "month",
    header: "Mois concerné",
    cell: (info) => (info.getValue() ? frDate(info.getValue()).slice(3) : "—"),
  }),
];

const versionCol = dataColumns<LegendCoefficientContext["versions"][number]>();
const versionColumns = [
  versionCol.accessor("effective_from", {
    header: "À partir de",
    cell: (info) => (info.getValue() <= "1900-01-01" ? "Origine" : frDate(info.getValue()).slice(3)),
  }),
  versionCol.accessor("coefficient", { header: "Coefficient", meta: { className: "tabular-nums" } }),
  versionCol.accessor((v) => (v.decision_id ? "Décision D14" : "Valeur initiale"), {
    id: "origin",
    header: "Origine",
    cell: (info) =>
      info.row.original.decision_id ? (
        <Link className="text-brand hover:underline" href={`/decisions/${info.row.original.decision_id}`}>
          Décision D14
        </Link>
      ) : (
        "Valeur initiale"
      ),
  }),
];

const declarationMonthCol = dataColumns<DeclarationMonth>();
const declarationMonthColumns = [
  declarationMonthCol.accessor("period", { header: "Mois" }),
  declarationMonthCol.accessor("runs", {
    header: "Paies (validées)",
    meta: amountMeta,
    cell: ({ row: { original: m } }) => `${m.runs} (${m.validated})`,
  }),
  declarationMonthCol.accessor("slips", { header: "Bulletins", meta: amountMeta }),
  declarationMonthCol.accessor("gross", { header: "Brut", meta: amountMeta, cell: (info) => money(info.getValue()) }),
  declarationMonthCol.accessor("irg", { header: "IRG", meta: amountMeta, cell: (info) => money(info.getValue()) }),
  declarationMonthCol.accessor((m) => m.reasons.length, {
    id: "reasons",
    header: "Décision requise",
    cell: ({ row: { original: m } }) =>
      m.reasons.length ? (
        <div className="flex flex-wrap gap-1">
          {m.reasons.map((r) => (
            <RhChip key={r} tone="warning">
              {declarationReasonLabel(r)}
            </RhChip>
          ))}
        </div>
      ) : (
        <span className="text-foreground/55">Non</span>
      ),
  }),
];

export function DecisionDetailView({ decision: d }: { decision: DecisionDetail }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [option, setOption] = useState<string>("");
  const [justification, setJustification] = useState("");
  const [riskAck, setRiskAck] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [invalidated, setInvalidated] = useState<string | null>(null);
  const chosen = d.options.find((o) => o.code === option) ?? null;
  const isPayroll = ["D3", "D4", "D6", "D7", "D9", "D10"].includes(d.type_code);
  const payrollHref =
    d.type_code === "D9"
      ? `/rh/paie/virements${d.period_year && d.period_month ? `?year=${d.period_year}&month=${d.period_month}` : ""}`
      : d.type_code === "D10"
        ? `/rh/paie/declarations${d.period_year ? `?year=${d.period_year}` : ""}`
        : d.period_year && d.period_month
        ? `/rh/paie?year=${d.period_year}&month=${d.period_month}`
        : "/rh/paie";
  const [followUp, setFollowUp] = useState<{ href: string; label: string } | null>(null);
  const nextStep = followUp ?? d.follow_up;

  function submit() {
    setError(null);
    setInfo(null);
    setInvalidated(null);
    if (!chosen) {
      setError("Choisissez une option.");
      return;
    }
    const bad = validateJustification(justification);
    if (bad) {
      setError(bad);
      return;
    }
    if (d.risk_class === "RISKY" && !riskAck) {
      setError("Décision à risque : confirmez avoir pris connaissance des conséquences.");
      return;
    }
    start(async () => {
      const r = await decideDecision({
        id: d.id,
        option: chosen.code,
        justification,
        fingerprint: d.fingerprint,
        risk_ack: riskAck,
      });
      if (!r.ok) {
        setError(r.error);
        router.refresh();
        return;
      }
      if (r.data.execute_error) {
        setError(`Décision enregistrée, mais l'exécution a échoué : ${r.data.execute_error}`);
        setInvalidated(r.data.invalidated);
      } else if (r.data.follow_up) {
        setFollowUp(r.data.follow_up);
        setInfo("Décision enregistrée. Elle s'exécute une seule fois, depuis l'écran opérationnel.");
      } else if (r.data.applied) {
        setInfo("Décision enregistrée et appliquée dans la même opération.");
      } else if (r.data.executed) {
        setInfo(
          [
            d.type_code === "D1"
              ? `Décision enregistrée : simulation « règles non approuvées » calculée pour ${r.data.executed.count} salarié(s). Aucun bulletin créé.`
              : `Décision enregistrée et exécutée : ${r.data.executed.count} bulletin(s) calculé(s).`,
            ...r.data.executed.warnings,
          ].join("\n"),
        );
      } else {
        setInfo("Décision enregistrée. Aucune opération de paie n'a été lancée.");
      }
      router.refresh();
    });
  }

  function retry() {
    setError(null);
    setInfo(null);
    setInvalidated(null);
    start(async () => {
      const r = await executeDecision(d.id);
      if (!r.ok) {
        setError(r.error);
        setInvalidated(r.invalidated ?? null);
      } else {
        setInfo(
          [
            d.type_code === "D1"
              ? `Simulation calculée pour ${r.data.count} salarié(s). Aucun bulletin créé.`
              : `Opération exécutée : ${r.data.count} bulletin(s) calculé(s).`,
            ...r.data.warnings,
          ].join("\n"),
        );
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <RhPageHeader
        title={d.type_label}
        description={d.type_description}
        actions={<RhChip tone={decisionStatusTone(d.status)}>{decisionStatusLabel(d.status)}</RhChip>}
      />
      {error ? (
        <RhAlert tone="danger">
          <span className="whitespace-pre-wrap">{error}</span>
          {invalidated ? (
            <Link href={`/decisions/${invalidated}`} className="ml-2 font-semibold underline">
              Ouvrir la nouvelle demande
            </Link>
          ) : null}
        </RhAlert>
      ) : null}
      {info && !error ? (
        <RhAlert tone="success">
          <span className="whitespace-pre-wrap">{info}</span>
        </RhAlert>
      ) : null}

      <RhPanel>
        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Fact label="Période">{periodLabel(d.period_year, d.period_month)}</Fact>
          <Fact label="Chantier">{d.site_name ?? "—"}</Fact>
          <Fact label="Origine">{payrollSourceLabel(d.request_source)}</Fact>
          <Fact label="Classe">{d.risk_class === "RISKY" ? "À risque" : "Ordinaire"}</Fact>
          <Fact label="Demandée">
            {dateTime(d.requested_at)}
            {d.requested_by_name ? ` · ${d.requested_by_name}` : ""}
          </Fact>
          {d.type_code === "D4" ? (
            <Fact label="Pointages validés du mois">{d.attendance_days ?? "—"}</Fact>
          ) : d.type_code === "D3" ? (
            <Fact label="Bulletins brouillon">{d.slip_count ?? "—"}</Fact>
          ) : null}
          {isPayroll ? (
            <Fact label={d.type_code === "D9" ? "Virements" : d.type_code === "D10" ? "Déclarations" : "Paie"}>
              <Link href={payrollHref} className="font-semibold text-brand hover:underline">
                {d.type_code === "D9"
                  ? "Ouvrir l'écran Virements"
                  : d.type_code === "D10"
                    ? "Ouvrir le registre des déclarations"
                    : "Ouvrir l'écran Paie"}
              </Link>
            </Fact>
          ) : (
            <Fact label="Données">
              <Link
                href={
                  d.type_code === "D1"
                    ? `/rh/paie/preparation?mois=${d.period_year}-${String(d.period_month ?? 1).padStart(2, "0")}`
                    : d.type_code === "D14"
                      ? "/referentiels/legendes"
                      : d.type_code === "D15"
                        ? `/rh/legal/extraction-ia?document=${d.legal_entry_path?.document_id ?? ""}`
                      : d.type_code === "D13"
                    ? "/rh/qualite-donnees"
                    : d.type_code === "D2"
                      ? `/rh/legal/propositions?id=${d.rule_application?.proposal_id ?? ""}`
                      : d.type_code === "D5" || d.type_code === "D11"
                        ? `/rh/presence/imports?lot=${d.attendance_conflict?.batch_id ?? d.code_mapping?.batch_id ?? ""}`
                        : d.type_code === "D12"
                          ? "/rh/presence/imports?vue=politique"
                          : "/rh/documents?onglet=contrats"
                }
                className="font-semibold text-brand hover:underline"
              >
                {d.type_code === "D1"
                  ? "Ouvrir la préparation du mois"
                  : d.type_code === "D14"
                    ? "Ouvrir les codes de présence"
                    : d.type_code === "D15"
                      ? "Ouvrir le document (extraction IA)"
                    : d.type_code === "D13"
                  ? "Rapport de qualité des données"
                  : d.type_code === "D2"
                    ? "Ouvrir la proposition"
                    : d.type_code === "D5" || d.type_code === "D11"
                      ? "Ouvrir le lot d'import"
                      : d.type_code === "D12"
                        ? "Ouvrir l'écran des imports"
                        : "Ouvrir les contrats"}
              </Link>
            </Fact>
          )}
        </dl>
        {isPayroll && d.period_nature ? (
          <p
            className={`mt-4 rounded-xl border px-3 py-2 text-sm ${
              d.period_nature === "EXTERNAL"
                ? "border-amber-200/80 bg-amber-50 text-amber-950 dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-100"
                : "border-border/70 bg-surface-muted/50 text-foreground/75"
            }`}
          >
            {periodNatureText(d.period_nature)}
          </p>
        ) : null}
      </RhPanel>

      {d.type_code === "D3" ? (
        <RhPanel>
          <h3 className="font-display text-base font-semibold">
            Modifications depuis le calcul {d.whole_run ? "· recalcul de toute la paie" : "· recalcul des salariés concernés"}
          </h3>
          {d.changes.length ? (
            <ul className="mt-2 space-y-1 text-sm">
              {d.changes.map((c, i) => (
                <li key={`${c.source}-${c.changed_at}-${i}`} className="flex flex-wrap gap-x-2">
                  <span className="font-semibold">{payrollSourceLabel(c.source)}</span>
                  <span>{c.employee ?? "Toute la paie"}</span>
                  {c.detail ? <span className="text-foreground/60">— {c.detail}</span> : null}
                  <span className="text-xs text-foreground/50">{dateTime(c.changed_at)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-foreground/60">
              Recalcul demandé manuellement, sans modification enregistrée.
            </p>
          )}
        </RhPanel>
      ) : null}

      {d.assignment ? (
        <RhPanel>
          <h3 className="font-display text-base font-semibold">Correction demandée · aperçu</h3>
          <dl className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Fact label="Salarié">{d.assignment.employee}</Fact>
            <Fact label="Période de l'affectation">
              du {frDate(d.assignment.effective_from)}
              {d.assignment.range_end ? ` au ${frDate(d.assignment.range_end)}` : " (en cours)"}
              {d.assignment.kind === "INITIAL" ? " · affectation initiale" : " · changement daté"}
            </Fact>
            <Fact label="Chantier actuel → corrigé">
              {d.assignment.old_site_name} → {d.assignment.new_site_name}
            </Fact>
            <Fact label="Wilaya">
              {d.assignment.old_wilaya ?? "non confirmée"} → {d.assignment.new_wilaya ?? "non confirmée"}
            </Fact>
            <div className="sm:col-span-2 lg:col-span-4">
              <Fact label="Motif de la demande">{d.assignment.reason}</Fact>
            </div>
          </dl>
          <p className="mt-4 rounded-xl border border-border/70 bg-surface-muted/50 px-3 py-2 text-sm text-foreground/80">
            {d.assignment.zone_notice}
          </p>
          {d.assignment.draft_slips.length ? (
            <DataTable
              className="mt-3"
              data={d.assignment.draft_slips}
              columns={draftSlipColumns}
              getRowId={(s) => s.slip_id}
              {...compactTable}
            />
          ) : null}
        </RhPanel>
      ) : null}

      {d.contract_start ? (
        <RhPanel>
          <h3 className="font-display text-base font-semibold">Contrat concerné</h3>
          <dl className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Fact label="Salarié">{d.contract_start.employee}</Fact>
            <Fact label="Début actuel">{frDate(d.contract_start.contract_start)}</Fact>
            <Fact label="Fin">{d.contract_start.contract_end ? frDate(d.contract_start.contract_end) : "—"}</Fact>
            <Fact label="Début corrigé proposé">{frDate(d.contract_start.fix_start)}</Fact>
          </dl>
        </RhPanel>
      ) : null}

      {d.rule_application ? (
        <RhPanel>
          <h3 className="font-display text-base font-semibold">Règle approuvée · {d.rule_application.title}</h3>
          <p className="text-sm text-foreground/60">{d.rule_application.target_label}</p>
          <dl className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Fact label="Application demandée">
              paie de {frMonth(d.rule_application.application_month)}
              {d.rule_application.application_date
                ? ` (date du ${frDate(d.rule_application.application_date)}, mois non découpé)`
                : ""}
            </Fact>
            <Fact label="Date d'effet du texte">
              {d.rule_application.text_effective_date ? frDate(d.rule_application.text_effective_date) : "—"}
            </Fact>
            <Fact label="Approbation">
              {dateTime(d.rule_application.approved_at)}
              {d.rule_application.approved_by ? ` · ${d.rule_application.approved_by}` : ""}
              {d.rule_application.self_approved ? (
                <span className="ml-1">
                  <RhChip tone="danger">Auto-approbation SUPER_ADMIN</RhChip>
                </span>
              ) : null}
            </Fact>
            <Fact label={d.rule_application.chain_mode === "SEPARATE" ? "Premier mois non validé (sa chaîne)" : "Premier mois non validé"}>
              {d.rule_application.first_open_month ? frMonth(d.rule_application.first_open_month) : "Aucune paie validée"}
            </Fact>
            <div className="sm:col-span-2">
              <Fact label="Source légale">{d.rule_application.source_ref || "—"}</Fact>
            </div>
            <div className="sm:col-span-2">
              <Fact label="Contributeurs">{d.rule_application.contributors.join(", ") || "—"}</Fact>
            </div>
          </dl>
          {d.period_nature === "EXTERNAL" ? (
            <p className="mt-3 rounded-xl border border-amber-200/80 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-100">
              {periodNatureText(d.period_nature)}
            </p>
          ) : null}
          {d.rule_application.bounded_to ? (
            <p className="mt-3 rounded-xl border border-border/70 bg-surface-muted/50 px-3 py-2 text-sm text-foreground/80">
              Chaînes de clôture séparées (D6) : la règle s&apos;appliquera de {frMonth(d.rule_application.application_month)}{" "}
              jusqu&apos;au {frDate(d.rule_application.bounded_to)} seulement. La paie opérationnelle, à partir de septembre 2026,
              garde ses paramètres.
            </p>
          ) : null}
          <div className="mt-3">
            <RuleDiff
              family={asFamily(d.rule_application.family)}
              action={asAction(d.rule_application.action)}
              current={d.rule_application.current}
              proposed={d.rule_application.proposed}
            />
          </div>
          <div className="mt-4">
            <CitationsList
              citations={d.rule_application.citations}
              warnings={d.rule_application.citation_warnings}
            />
          </div>
          <h4 className="mt-4 text-sm font-semibold">Bulletins des mois concernés</h4>
          <p className="mt-1 text-sm text-foreground/75">{ruleApplicationSlipNotice(d.rule_application.slips)}</p>
          {d.rule_application.slips.length ? (
            <DataTable
              className="mt-2"
              data={d.rule_application.slips}
              columns={ruleSlipColumns}
              getRowId={(s) => `${s.period_key}-${s.status}`}
              {...compactTable}
            />
          ) : null}
        </RhPanel>
      ) : null}

      {d.payroll_reopen ? <ReopenPanel c={d.payroll_reopen} /> : null}
      {d.payroll_chains ? <ChainPanel c={d.payroll_chains} /> : null}
      {d.transfer ? <TransferPanel c={d.transfer} /> : null}
      {d.declaration ? <DeclarationPanel c={d.declaration} /> : null}
      {d.attendance_conflict ? <AttendanceConflictPanel c={d.attendance_conflict} /> : null}
      {d.code_mapping ? <CodeMappingPanel c={d.code_mapping} /> : null}
      {d.import_policy ? <ImportPolicyPanel c={d.import_policy} /> : null}
      {d.unapproved_rules ? <UnapprovedRulesPanel c={d.unapproved_rules} /> : null}
      {d.legend_coefficient ? <LegendCoefficientPanel c={d.legend_coefficient} /> : null}
      {d.legal_entry_path ? <LegalEntryPathPanel c={d.legal_entry_path} /> : null}

      {d.status === "PENDING" ? (
        <RhPanel>
          <h3 className="font-display text-base font-semibold">Votre décision</h3>
          {d.decide_blocker ? (
            <div className="mt-3">
              <RhAlert tone="info">{d.decide_blocker}</RhAlert>
            </div>
          ) : (
            <div className="mt-3 space-y-4">
              <fieldset className="grid gap-2 sm:grid-cols-2">
                <legend className="sr-only">Options</legend>
                {d.options.map((o) => {
                  const blocked = d.unavailable_options[o.code];
                  return (
                    <label
                      key={o.code}
                      className={`rounded-xl border px-4 py-3 transition ${
                        blocked
                          ? "cursor-not-allowed border-border/50 opacity-60"
                          : option === o.code
                            ? "cursor-pointer border-brand bg-brand-muted"
                            : "cursor-pointer border-border/70 hover:bg-surface-muted/60"
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <input
                          type="radio"
                          name="decision-option"
                          value={o.code}
                          checked={option === o.code}
                          disabled={Boolean(blocked)}
                          onChange={() => setOption(o.code)}
                        />
                        <span className="font-semibold">{o.label_fr}</span>
                      </span>
                      <span className="mt-1 block text-sm text-foreground/70">{o.consequence_fr}</span>
                      {blocked ? (
                        <span className="mt-1 block text-xs font-semibold text-alert-critical">{blocked}</span>
                      ) : null}
                    </label>
                  );
                })}
              </fieldset>
              <label className="block">
                <span className="text-sm font-semibold">Justification (obligatoire, tracée)</span>
                <textarea
                  className="mt-1.5 min-h-24 w-full rounded-xl border border-border/80 bg-surface px-3.5 py-2 text-sm outline-none focus:border-brand focus:ring-4 focus:ring-brand/10"
                  maxLength={JUSTIFICATION_MAX}
                  value={justification}
                  onChange={(e) => setJustification(e.target.value)}
                />
              </label>
              {d.risk_class === "RISKY" ? (
                <label className="flex items-start gap-2 text-sm">
                  <input type="checkbox" checked={riskAck} onChange={(e) => setRiskAck(e.target.checked)} />
                  <span>J&apos;ai pris connaissance des conséquences de cette décision à risque.</span>
                </label>
              ) : null}
              <div className="flex flex-wrap items-center gap-3">
                <Button disabled={pending || !chosen} onClick={submit}>
                  {chosen?.executes ? "Décider et exécuter" : "Enregistrer la décision"}
                </Button>
                <span className="text-xs text-foreground/55">
                  La décision est définitive : elle ne peut être ni modifiée ni supprimée.
                </span>
              </div>
            </div>
          )}
        </RhPanel>
      ) : (
        <RhPanel>
          <h3 className="font-display text-base font-semibold">Décision</h3>
          <dl className="mt-3 grid gap-4 sm:grid-cols-2">
            <Fact label="Choix">{d.chosen_label ?? "—"}</Fact>
            <Fact label="Décidée">
              {dateTime(d.decided_at)}
              {d.decided_by_name ? ` · ${d.decided_by_name}` : ""}
            </Fact>
            {d.justification ? (
              <div className="sm:col-span-2">
                <Fact label="Justification">
                  <span className="whitespace-pre-wrap">{d.justification}</span>
                </Fact>
              </div>
            ) : null}
            {d.executed_at ? (
              <Fact label="Exécutée">
                {dateTime(d.executed_at)}
                {d.executed_by_name ? ` · ${d.executed_by_name}` : ""}
                {typeof d.execution_result?.slips === "number" ? ` · ${d.execution_result.slips} bulletin(s)` : ""}
                {typeof d.execution_result?.versions === "number"
                  ? ` · ${d.execution_result.versions} copie(s) figée(s) conservée(s)`
                  : ""}
                {typeof d.execution_result?.mode === "string" ? ` · politique ${d.execution_result.mode}` : ""}
                {typeof d.execution_result?.batch_no === "string"
                  ? ` · lot ${d.execution_result.batch_no} (risque de double paiement)`
                  : ""}
                {d.execution_result?.operation === "RECONCILIATION_STATEMENT" ? " · état de rapprochement produit" : ""}
                {typeof d.execution_result?.file_name === "string" ? ` · fichier ${d.execution_result.file_name}` : ""}
              </Fact>
            ) : null}
            {d.closed_reason ? (
              <Fact label="Clôture">
                {d.closed_reason} ({dateTime(d.closed_at)})
              </Fact>
            ) : null}
          </dl>
          {d.status === "DECIDED" ? (
            <div className="mt-4 flex flex-wrap items-center gap-3">
              {nextStep ? (
                <Link href={nextStep.href} className="font-semibold text-brand hover:underline">
                  {nextStep.label} (une seule fois)
                </Link>
              ) : d.can_execute ? (
                <Button disabled={pending} onClick={retry}>
                  Exécuter la décision
                </Button>
              ) : (
                <span className="text-sm text-foreground/60">
                  En attente d&apos;exécution par l&apos;auteur de la décision ou le SUPER_ADMIN.
                </span>
              )}
            </div>
          ) : null}
        </RhPanel>
      )}
    </div>
  );
}

const TRANSFER_STATUS: Record<string, string> = {
  GENERATED: "Généré",
  DEPOSITED: "Déposé",
  EXECUTED: "Exécuté",
  CANCELLED: "Annulé",
};

function ReopenPanel({ c }: { c: PayrollReopenContext }) {
  const notices = reopenRiskNotices(c);
  return (
    <RhPanel>
      <h3 className="font-display text-base font-semibold">
        Paie à réouvrir · {c.period} · {c.site_name}
      </h3>
      <dl className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Fact label="Statut actuel">{payrollRunStatusLabel(c.status)}</Fact>
        <Fact label="Bulletins">{c.slip_count}</Fact>
        <Fact label="Brut / IRG / Net">
          {money(c.gross_total)} / {money(c.irg_total)} / {money(c.net_total)}
        </Fact>
        <Fact label="Copies figées déjà conservées">{c.versions}</Fact>
        <Fact label="Validée">
          {dateTime(c.validated_at)}
          {c.validated_by ? ` · ${c.validated_by}` : ""}
        </Fact>
        <Fact label="Clôturée">
          {dateTime(c.locked_at)}
          {c.locked_by ? ` · ${c.locked_by}` : ""}
        </Fact>
        <div className="sm:col-span-2">
          <Fact label="Motif de la demande">{c.reason || "—"}</Fact>
        </div>
      </dl>
      <div className="mt-4 space-y-2">
        {notices.map((n) => (
          <RhAlert key={n} tone={/double paiement|refusée/.test(n) ? "danger" : "warning"}>
            {n}
          </RhAlert>
        ))}
      </div>

      <h4 className="mt-4 text-sm font-semibold">Virements préparés ou exécutés</h4>
      {c.transfers.length ? (
        <DataTable
          className="mt-2"
          data={c.transfers}
          columns={reopenTransferColumns}
          getRowId={(t) => t.batch_no}
          {...compactTable}
        />
      ) : (
        <p className="mt-1 text-sm text-foreground/60">
          Aucun lot de virement enregistré dans l&apos;application pour ces bulletins (ce qui ne prouve pas qu&apos;aucun paiement
          n&apos;a eu lieu hors de l&apos;application).
        </p>
      )}

      {c.declarations_registry ? (
        <>
          <h4 className="mt-4 text-sm font-semibold">Registre des exports de déclaration (ce mois)</h4>
          <div className="mt-1">
            <DeclarationExportsTable exports={c.declaration_exports} emptyLabel="Aucun fichier de déclaration produit dans l'application pour ce mois." />
          </div>
          <h4 className="mt-4 text-sm font-semibold">Opérations externes enregistrées (ce mois)</h4>
          <div className="mt-1">
            <ExternalOperationsList operations={c.external_operations} emptyLabel="Aucun paiement ni aucune déclaration externe enregistré pour ce mois." />
          </div>
        </>
      ) : null}

      {c.certificates.length ? (
        <>
          <h4 className="mt-4 text-sm font-semibold">Documents émis depuis la validation</h4>
          <ul className="mt-1 space-y-0.5 text-sm">
            {c.certificates.map((x) => (
              <li key={x.number}>
                {x.number} · {x.type} · {x.employee} · {dateTime(x.issued_at)}
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {c.later_runs.length ? (
        <>
          <h4 className="mt-4 text-sm font-semibold">Mois suivants déjà validés ou clôturés</h4>
          <ul className="mt-1 space-y-0.5 text-sm">
            {c.later_runs.map((x) => (
              <li key={`${x.period}-${x.site_name}`}>
                {x.period} · {x.site_name} · {payrollRunStatusLabel(x.status)}
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {c.prior_decisions.length ? (
        <>
          <h4 className="mt-4 text-sm font-semibold">Décisions antérieures sur cette paie</h4>
          <ul className="mt-1 space-y-0.5 text-sm">
            {c.prior_decisions.map((x) => (
              <li key={x.id}>
                <Link href={`/decisions/${x.id}`} className="font-semibold text-brand hover:underline">
                  {x.type}
                </Link>{" "}
                · {decisionStatusLabel(x.status)}
                {x.option ? ` · ${x.option}` : ""} · {dateTime(x.at)}
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </RhPanel>
  );
}

function ChainPanel({ c }: { c: PayrollChainContext }) {
  const open = c.reprise_months.filter((m) => m.open);
  return (
    <RhPanel>
      <h3 className="font-display text-base font-semibold">
        Validation demandée · paie {c.run_period} · {c.site_name}
      </h3>
      <p className="mt-2 text-sm text-foreground/75">
        {open.length} mois de reprise (janvier–août 2026) encore ouvert(s) aux changements de paramètres.
        {c.pending_rules ? ` ${c.pending_rules} proposition(s) de règle en cours visent un mois de reprise.` : ""}
      </p>
      <DataTable
        className="mt-3"
        data={c.reprise_months}
        columns={repriseColumns}
        getRowId={(m) => m.month}
        emptyTitle="Aucun mois de reprise"
        {...compactTable}
      />
      <p className="mt-3 rounded-xl border border-amber-200/80 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-100">
        Les mois de reprise ont été payés et déclarés hors de l&apos;application. Ce choix ne modifie aucun bulletin : il fixe
        seulement jusqu&apos;où leurs paramètres restent modifiables. Il est définitif.
      </p>
    </RhPanel>
  );
}

function RiskNotices({ notices }: { notices: string[] }) {
  return (
    <div className="mt-4 space-y-2">
      {notices.map((n) => (
        <RhAlert key={n} tone={/double (paiement|déclaration)|seconde fois/.test(n) ? "danger" : "warning"}>
          {n}
        </RhAlert>
      ))}
    </div>
  );
}

function TransferPanel({ c }: { c: TransferDecisionContext }) {
  return (
    <RhPanel>
      <h3 className="font-display text-base font-semibold">
        Virement bloqué · paie {c.period} · {c.site_name} · {c.mode === "BANK" ? "banque" : "CCP"}
      </h3>
      <dl className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Fact label="Bulletins">{c.slip_count}</Fact>
        <Fact label="Net total">{money(c.net_total)}</Fact>
        <div className="sm:col-span-2">
          <Fact label="Motif de la demande">{c.reason || "—"}</Fact>
        </div>
      </dl>
      <RiskNotices notices={transferRiskNotices(c)} />

      <h4 className="mt-4 text-sm font-semibold">Bulletins demandés et motifs du blocage</h4>
      <DataTable
        className="mt-2"
        data={c.slips}
        columns={transferSlipColumns}
        getRowId={(s) => s.slip_id}
        emptyTitle="Aucun bulletin"
        {...compactTable}
      />

      <h4 className="mt-4 text-sm font-semibold">1 · Virements de l&apos;application (ces salariés, ce mois)</h4>
      {c.internal_transfers.length ? (
        <DataTable
          className="mt-2"
          data={c.internal_transfers}
          columns={internalTransferColumns}
          getRowId={(t) => t.batch_no}
          {...compactTable}
        />
      ) : (
        <p className="mt-1 text-sm text-foreground/60">Aucun lot de virement enregistré dans l&apos;application.</p>
      )}

      <h4 className="mt-4 text-sm font-semibold">2 · Paiements externes enregistrés</h4>
      <div className="mt-1">
        <ExternalOperationsList operations={c.external_operations} emptyLabel="Aucun paiement externe enregistré." />
      </div>

      <h4 className="mt-4 text-sm font-semibold">3 · Nature de la période</h4>
      <p className="mt-1 text-sm text-foreground/75">{periodNatureText(c.period_nature)}</p>
    </RhPanel>
  );
}

function AttendanceConflictPanel({ c }: { c: AttendanceConflictContext }) {
  return (
    <RhPanel>
      <h3 className="font-display text-base font-semibold">
        Conflits d&apos;import · lot {c.batch_no} · {c.period}
      </h3>
      <dl className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Fact label="Année de référence">{c.reference_year || "—"}</Fact>
        <Fact label="Nature">{natureLabel(c.nature)}</Fact>
        <Fact label="Provenance">
          {provenanceLabel(c.provenance_kind)} — {c.provenance_detail}
        </Fact>
        <Fact label="Fichier">
          {c.file_name} · déposé par {c.created_by || "?"}
        </Fact>
        <Fact label="Lignes lues">{c.counts.read ?? 0}</Fact>
        <Fact label="Acceptées sans conflit">{c.counts.ok ?? 0}</Fact>
        <Fact label="Rejetées">{c.counts.error ?? 0}</Fact>
        <Fact label="En conflit">{c.conflict_total}</Fact>
      </dl>
      <RiskNotices notices={attendanceConflictNotices(c)} />
      <h4 className="mt-4 text-sm font-semibold">Données concernées : valeur importée et valeur déjà enregistrée</h4>
      <DataTable
        className="mt-2"
        data={c.conflicts}
        columns={conflictColumns}
        getRowId={(l) => l.line_id}
        searchable={c.conflicts.length > 10}
        searchPlaceholder="Salarié, matricule, code"
        columnToggle={false}
        pageSize={c.conflicts.length > 50 ? 50 : 0}
        emptyTitle="Aucun conflit"
      />
    </RhPanel>
  );
}

function CodeMappingPanel({ c }: { c: CodeMappingContext }) {
  return (
    <RhPanel>
      <h3 className="font-display text-base font-semibold">
        Correspondance de codes · lot {c.batch_no} · {c.period}
      </h3>
      <dl className="mt-3 grid gap-4 sm:grid-cols-2">
        <Fact label="Fichier">{c.file_name}</Fact>
        <Fact label="Provenance">{c.provenance_detail}</Fact>
        <div className="sm:col-span-2">
          <Fact label="Motif de la demande">{c.reason || "—"}</Fact>
        </div>
      </dl>
      <DataTable
        className="mt-4"
        data={c.pairs}
        columns={pairColumns}
        getRowId={(p) => p.source_code}
        emptyTitle="Aucune correspondance"
        {...compactTable}
      />
      <p className="mt-3 text-xs text-foreground/60">
        « Pour ce lot seulement » convertit les codes de ce lot puis l&apos;analyse à nouveau. « Comme politique » propose
        en plus la correspondance pour les prochains lots : elle ne s&apos;appliquera qu&apos;après une seconde confirmation
        sur l&apos;écran des imports. Aucune présence n&apos;est enregistrée par cette décision.
      </p>
    </RhPanel>
  );
}

function ImportPolicyPanel({ c }: { c: ImportPolicyContext }) {
  return (
    <RhPanel>
      <h3 className="font-display text-base font-semibold">Validation d&apos;un import par son auteur</h3>
      <dl className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Fact label="Règle actuelle">
          {c.current === null
            ? "Jamais décidée : l'auteur ne peut pas valider (par défaut)"
            : c.current
              ? "L'auteur peut valider son lot"
              : "L'auteur ne peut pas valider son lot"}
        </Fact>
        <Fact label="Dernière décision">{c.decided_at ? `${dateTime(c.decided_at)} · ${c.decided_by ?? "?"}` : "—"}</Fact>
        <Fact label="Lots en attente de validation">{c.batches_to_validate}</Fact>
        <div className="sm:col-span-2 lg:col-span-3">
          <Fact label="Motif de la demande">{c.reason || "—"}</Fact>
        </div>
      </dl>
      <p className="mt-3 text-xs text-foreground/60">
        Le SUPER_ADMIN peut toujours valider. La politique reste révocable à tout moment par une nouvelle décision.
      </p>
    </RhPanel>
  );
}

function UnapprovedRulesPanel({ c }: { c: UnapprovedRulesContext }) {
  const legacy = [...c.legacy.legal_vars, ...c.legacy.cnas_rates, ...c.legacy.irg_bareme, ...c.legacy.irg_rules];
  return (
    <RhPanel>
      <h3 className="font-display text-base font-semibold">Règles du mois en attente · {c.site_name}</h3>
      <dl className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Fact label="Règles en attente">{c.blockers.length}</Fact>
        <Fact label="Valeurs héritées non vérifiées">{legacy.length}</Fact>
        <Fact label="Présences validées du mois">{c.attendance_days}</Fact>
        <Fact label="Paie du mois">{c.run_status ? payrollRunStatusLabel(c.run_status) : "Aucune"}</Fact>
      </dl>
      <DataTable
        className="mt-4"
        data={c.blockers}
        columns={blockerColumns}
        getRowId={(b) => b.proposal_id}
        emptyTitle="Aucune règle en attente"
        {...compactTable}
      />
      {legacy.length ? (
        <p className="mt-3 text-xs text-foreground/60">
          Héritées (avertissement) : {legacy.map((r) => r.code).join(", ")}.
        </p>
      ) : null}
      <RiskNotices notices={unapprovedRulesNotices(c)} />
    </RhPanel>
  );
}

function LegendCoefficientPanel({ c }: { c: LegendCoefficientContext }) {
  return (
    <RhPanel>
      <h3 className="font-display text-base font-semibold">
        Code {c.code} — {c.label_fr} : {c.current_at_month} → {c.coefficient} à partir de {frDate(c.month).slice(3)}
      </h3>
      <dl className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Fact label="Coefficient en vigueur ce mois-ci">{c.current_today}</Fact>
        <Fact label="Présences avec ce code dès le mois d'effet">{c.attendance_days}</Fact>
        <Fact label="Premier mois modifiable">{c.first_open_month ? frDate(c.first_open_month).slice(3) : "Tous"}</Fact>
        <Fact label="Paies brouillon à partir du mois">{c.draft_runs.length}</Fact>
        <div className="sm:col-span-2 lg:col-span-4">
          <Fact label="Motif de la demande">{c.reason || "—"}</Fact>
        </div>
      </dl>
      <DataTable
        className="mt-4"
        data={c.versions}
        columns={versionColumns}
        getRowId={(v) => v.effective_from}
        emptyTitle="Aucune version"
        {...compactTable}
      />
      <RiskNotices notices={legendCoefficientNotices(c)} />
    </RhPanel>
  );
}

function LegalEntryPathPanel({ c }: { c: LegalEntryPathContext }) {
  return (
    <RhPanel>
      <h3 className="font-display text-base font-semibold">
        {legalDocTypeLabel(c.doc_type)} · {c.reference} — {c.title}
      </h3>
      <dl className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Fact label="Période d'application">{applicationPeriodLabel(c.applies_from, c.applies_to)}</Fact>
        <Fact label="Langue">{legalDocLanguageLabel(c.language)}</Fact>
        <Fact label="Version des informations">{c.version_no}</Fact>
        <Fact label="Analyses IA déjà faites">{c.extractions}</Fact>
      </dl>
      <p className="mt-3 text-sm text-foreground/75">
        Avant 2026, les valeurs se saisissent à la main ; à partir de 2026, une extraction IA peut préparer des
        suggestions. Ce document couvre les deux périodes : choisissez la voie de saisie.
      </p>
      <RiskNotices notices={legalEntryPathNotices(c)} />
    </RhPanel>
  );
}

function DeclarationPanel({ c }: { c: DeclarationDecisionContext }) {
  const months = useMemo(
    () => c.months.map((m) => ({ ...m, reasons: c.month_reasons[String(m.month)] ?? [] })),
    [c.months, c.month_reasons],
  );
  return (
    <RhPanel>
      <h3 className="font-display text-base font-semibold">
        Déclaration bloquée · {declarationKindLabel(c.kind)} · {c.period} · {c.site_name}
      </h3>
      <p className="mt-2 text-sm text-foreground/75">Motif de la demande : {c.reason || "—"}</p>
      <RiskNotices notices={declarationRiskNotices(c)} />

      <h4 className="mt-4 text-sm font-semibold">Mois couverts par le fichier</h4>
      <DataTable
        className="mt-2"
        data={months}
        columns={declarationMonthColumns}
        getRowId={(m) => String(m.month)}
        emptyTitle="Aucun mois couvert"
        {...compactTable}
      />

      <h4 className="mt-4 text-sm font-semibold">1 · Registre des exports de l&apos;application</h4>
      <div className="mt-1">
        <DeclarationExportsTable exports={c.prior_exports} emptyLabel="Aucun fichier de déclaration produit sur cette période." />
      </div>
      <h4 className="mt-4 text-sm font-semibold">2 · Déclarations externes enregistrées</h4>
      <div className="mt-1">
        <ExternalOperationsList operations={c.external_operations} emptyLabel="Aucune déclaration externe enregistrée." />
      </div>
      <h4 className="mt-4 text-sm font-semibold">3 · Nature des mois</h4>
      <p className="mt-1 text-sm text-foreground/75">
        Janvier à août 2026 : paies déclarées hors de l&apos;application. À partir de septembre 2026 : déclarations préparées
        dans l&apos;application.
      </p>
    </RhPanel>
  );
}
