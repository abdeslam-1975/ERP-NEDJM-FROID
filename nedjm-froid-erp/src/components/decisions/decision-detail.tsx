"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { RhAlert, RhChip, RhPageHeader, RhPanel } from "@/components/rh/rh-ui";
import { decideDecision, executeDecision, type DecisionDetail } from "@/lib/actions/decisions";
import {
  JUSTIFICATION_MAX,
  decisionStatusLabel,
  decisionStatusTone,
  payrollSourceLabel,
  periodLabel,
  periodNatureText,
  validateJustification,
} from "@/lib/decisions/catalog";

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
  const isPayroll = d.type_code === "D3" || d.type_code === "D4";
  const payrollHref =
    d.period_year && d.period_month ? `/rh/paie?year=${d.period_year}&month=${d.period_month}` : "/rh/paie";

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
            <Fact label="Paie">
              <Link href={payrollHref} className="font-semibold text-brand hover:underline">
                Ouvrir l&apos;écran Paie
              </Link>
            </Fact>
          ) : (
            <Fact label="Données">
              <Link
                href={d.type_code === "D13" ? "/rh/qualite-donnees" : "/rh/contrats"}
                className="font-semibold text-brand hover:underline"
              >
                {d.type_code === "D13" ? "Rapport de qualité des données" : "Ouvrir les contrats"}
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
              {d.can_execute ? (
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
