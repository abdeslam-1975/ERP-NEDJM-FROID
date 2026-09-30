"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { RhAlert, RhChip, RhPageHeader, RhPanel } from "@/components/rh/rh-ui";
import { decideDecision, executeDecision, type DecisionDetail } from "@/lib/actions/decisions";
import type {
  DeclarationDecisionContext,
  PayrollChainContext,
  PayrollReopenContext,
  TransferDecisionContext,
} from "@/lib/decisions/catalog";
import {
  JUSTIFICATION_MAX,
  decisionStatusLabel,
  decisionStatusTone,
  declarationRiskNotices,
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
          [`Décision enregistrée et exécutée : ${r.data.executed.count} bulletin(s) calculé(s).`, ...r.data.executed.warnings].join(
            "\n",
          ),
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
        setInfo([`Opération exécutée : ${r.data.count} bulletin(s) calculé(s).`, ...r.data.warnings].join("\n"));
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
                  d.type_code === "D13"
                    ? "/rh/qualite-donnees"
                    : d.type_code === "D2"
                      ? `/rh/legal/propositions?id=${d.rule_application?.proposal_id ?? ""}`
                      : "/rh/contrats"
                }
                className="font-semibold text-brand hover:underline"
              >
                {d.type_code === "D13"
                  ? "Rapport de qualité des données"
                  : d.type_code === "D2"
                    ? "Ouvrir la proposition"
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
            <table className="mt-3 min-w-full text-sm">
              <thead className="text-left text-xs uppercase text-foreground/55">
                <tr>
                  <th className="py-1 pr-4">Mois</th>
                  <th className="py-1 pr-4">Paie brouillon</th>
                  <th className="py-1 pr-4 text-right">IRG actuel</th>
                  <th className="py-1 text-right">Net actuel</th>
                </tr>
              </thead>
              <tbody>
                {d.assignment.draft_slips.map((s) => (
                  <tr key={s.slip_id} className="border-t border-border/60">
                    <td className="py-1 pr-4">{s.period}</td>
                    <td className="py-1 pr-4">{s.run_site}</td>
                    <td className="py-1 pr-4 text-right tabular-nums">{money(s.irg_amount)}</td>
                    <td className="py-1 text-right tabular-nums">{money(s.net_payable)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
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
            <table className="mt-2 min-w-full text-sm">
              <thead className="text-left text-xs uppercase text-foreground/55">
                <tr>
                  <th className="py-1 pr-4">Mois</th>
                  <th className="py-1 pr-4">Statut</th>
                  <th className="py-1 pr-4 text-right">Paies</th>
                  <th className="py-1 pr-4 text-right">Bulletins</th>
                  <th className="py-1">Effet</th>
                </tr>
              </thead>
              <tbody>
                {d.rule_application.slips.map((s) => (
                  <tr key={`${s.period_key}-${s.status}`} className="border-t border-border/60">
                    <td className="py-1 pr-4">{s.period}</td>
                    <td className="py-1 pr-4">{payrollRunStatusLabel(s.status)}</td>
                    <td className="py-1 pr-4 text-right tabular-nums">{s.runs}</td>
                    <td className="py-1 pr-4 text-right tabular-nums">{s.slips}</td>
                    <td className="py-1">
                      {s.affected ? (
                        <RhChip tone="warning">Signalée, recalcul sur décision D3</RhChip>
                      ) : s.status === "DRAFT" ? (
                        <RhChip>Mois antérieur, inchangée</RhChip>
                      ) : (
                        <RhChip>Pour information, jamais modifiée</RhChip>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
        </RhPanel>
      ) : null}

      {d.payroll_reopen ? <ReopenPanel c={d.payroll_reopen} /> : null}
      {d.payroll_chains ? <ChainPanel c={d.payroll_chains} /> : null}
      {d.transfer ? <TransferPanel c={d.transfer} /> : null}
      {d.declaration ? <DeclarationPanel c={d.declaration} /> : null}

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
        <table className="mt-2 min-w-full text-sm">
          <thead className="text-left text-xs uppercase text-foreground/55">
            <tr>
              <th className="py-1 pr-4">Lot</th>
              <th className="py-1 pr-4">Mode</th>
              <th className="py-1 pr-4">Statut</th>
              <th className="py-1 pr-4 text-right">Lignes</th>
              <th className="py-1 pr-4 text-right">Montant</th>
              <th className="py-1">Exécution</th>
            </tr>
          </thead>
          <tbody>
            {c.transfers.map((t) => (
              <tr key={t.batch_no} className="border-t border-border/60">
                <td className="py-1 pr-4">{t.batch_no}</td>
                <td className="py-1 pr-4">{t.mode}</td>
                <td className="py-1 pr-4">
                  <RhChip tone={t.status === "EXECUTED" ? "danger" : t.status === "CANCELLED" ? "neutral" : "warning"}>
                    {TRANSFER_STATUS[t.status] ?? t.status}
                  </RhChip>
                </td>
                <td className="py-1 pr-4 text-right tabular-nums">{t.lines}</td>
                <td className="py-1 pr-4 text-right tabular-nums">{money(t.amount)}</td>
                <td className="py-1">{t.executed_at ? dateTime(t.executed_at) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
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
      <table className="mt-3 min-w-full text-sm">
        <thead className="text-left text-xs uppercase text-foreground/55">
          <tr>
            <th className="py-1 pr-4">Mois</th>
            <th className="py-1 pr-4">Paramètres</th>
            <th className="py-1 pr-4 text-right">Paies</th>
            <th className="py-1 pr-4 text-right">Validées</th>
            <th className="py-1 text-right">Bulletins</th>
          </tr>
        </thead>
        <tbody>
          {c.reprise_months.map((m) => (
            <tr key={m.month} className="border-t border-border/60">
              <td className="py-1 pr-4">{m.period}</td>
              <td className="py-1 pr-4">
                {m.open ? <RhChip tone="warning">Ouverts</RhChip> : <RhChip>Figés</RhChip>}
              </td>
              <td className="py-1 pr-4 text-right tabular-nums">{m.runs}</td>
              <td className="py-1 pr-4 text-right tabular-nums">{m.validated}</td>
              <td className="py-1 text-right tabular-nums">{m.slips}</td>
            </tr>
          ))}
        </tbody>
      </table>
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
      <table className="mt-2 min-w-full text-sm">
        <thead className="text-left text-xs uppercase text-foreground/55">
          <tr>
            <th className="py-1 pr-4">Salarié</th>
            <th className="py-1 pr-4 text-right">Net</th>
            <th className="py-1">Motifs</th>
          </tr>
        </thead>
        <tbody>
          {c.slips.map((s) => (
            <tr key={s.slip_id} className="border-t border-border/60">
              <td className="py-1 pr-4">
                {s.matricule} · {s.employee}
              </td>
              <td className="py-1 pr-4 text-right tabular-nums">{money(s.net_payable)}</td>
              <td className="py-1">
                <div className="flex flex-wrap gap-1">
                  {s.reasons.map((r) => (
                    <RhChip key={r} tone="warning">
                      {transferReasonLabel(r)}
                    </RhChip>
                  ))}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h4 className="mt-4 text-sm font-semibold">1 · Virements de l&apos;application (ces salariés, ce mois)</h4>
      {c.internal_transfers.length ? (
        <table className="mt-2 min-w-full text-sm">
          <thead className="text-left text-xs uppercase text-foreground/55">
            <tr>
              <th className="py-1 pr-4">Lot</th>
              <th className="py-1 pr-4">Statut</th>
              <th className="py-1 pr-4 text-right">Lignes</th>
              <th className="py-1 pr-4 text-right">Montant</th>
              <th className="py-1">Exécution</th>
            </tr>
          </thead>
          <tbody>
            {c.internal_transfers.map((t) => (
              <tr key={t.batch_no} className="border-t border-border/60">
                <td className="py-1 pr-4">
                  {t.batch_no}
                  {t.double_payment_risk ? (
                    <span className="ml-1">
                      <RhChip tone="danger">Risque de double paiement</RhChip>
                    </span>
                  ) : null}
                </td>
                <td className="py-1 pr-4">{TRANSFER_STATUS[t.status] ?? t.status}</td>
                <td className="py-1 pr-4 text-right tabular-nums">{t.lines}</td>
                <td className="py-1 pr-4 text-right tabular-nums">{money(t.amount)}</td>
                <td className="py-1">{t.executed_at ? dateTime(t.executed_at) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
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

function DeclarationPanel({ c }: { c: DeclarationDecisionContext }) {
  return (
    <RhPanel>
      <h3 className="font-display text-base font-semibold">
        Déclaration bloquée · {declarationKindLabel(c.kind)} · {c.period} · {c.site_name}
      </h3>
      <p className="mt-2 text-sm text-foreground/75">Motif de la demande : {c.reason || "—"}</p>
      <RiskNotices notices={declarationRiskNotices(c)} />

      <h4 className="mt-4 text-sm font-semibold">Mois couverts par le fichier</h4>
      <table className="mt-2 min-w-full text-sm">
        <thead className="text-left text-xs uppercase text-foreground/55">
          <tr>
            <th className="py-1 pr-4">Mois</th>
            <th className="py-1 pr-4 text-right">Paies (validées)</th>
            <th className="py-1 pr-4 text-right">Bulletins</th>
            <th className="py-1 pr-4 text-right">Brut</th>
            <th className="py-1 pr-4 text-right">IRG</th>
            <th className="py-1">Décision requise</th>
          </tr>
        </thead>
        <tbody>
          {c.months.map((m) => {
            const reasons = c.month_reasons[String(m.month)] ?? [];
            return (
              <tr key={m.month} className="border-t border-border/60">
                <td className="py-1 pr-4">{m.period}</td>
                <td className="py-1 pr-4 text-right tabular-nums">
                  {m.runs} ({m.validated})
                </td>
                <td className="py-1 pr-4 text-right tabular-nums">{m.slips}</td>
                <td className="py-1 pr-4 text-right tabular-nums">{money(m.gross)}</td>
                <td className="py-1 pr-4 text-right tabular-nums">{money(m.irg)}</td>
                <td className="py-1">
                  {reasons.length ? (
                    <div className="flex flex-wrap gap-1">
                      {reasons.map((r) => (
                        <RhChip key={r} tone="warning">
                          {declarationReasonLabel(r)}
                        </RhChip>
                      ))}
                    </div>
                  ) : (
                    <span className="text-foreground/55">Non</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

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
