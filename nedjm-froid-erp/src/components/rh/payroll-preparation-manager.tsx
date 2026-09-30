"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { requestPayrollCalculation } from "@/lib/actions/hr-ops";
import { requestUnapprovedRulesDecision, type PreparationSite } from "@/lib/actions/hr-payroll-preparation";
import {
  generationPath,
  preparationChecks,
  type MonthPreparation,
  type PreparationLevel,
} from "@/lib/hr/payroll-preparation";
import { legacyRuleCount, proposalStatusLabel, ruleFamilyLabel } from "@/lib/decisions/catalog";
import { Button } from "@/components/ui/button";
import {
  RhAlert,
  RhChip,
  RhPageHeader,
  RhPanel,
  RhSectionTitle,
  RhStat,
  RhTableWrap,
  rhInput,
  rhTd,
  rhTh,
} from "@/components/rh/rh-ui";

const LEVEL: Record<PreparationLevel, { label: string; tone: "success" | "neutral" | "warning" | "danger" }> = {
  ok: { label: "Conforme", tone: "success" },
  info: { label: "Information", tone: "neutral" },
  warning: { label: "À vérifier", tone: "warning" },
  blocking: { label: "Bloquant", tone: "danger" },
};

const money = (n: number) => n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const monthLabel = (iso: string | null) => (iso ? `${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "—");

export function PayrollPreparationManager({
  preparation: p,
  sites,
  year,
  month,
  siteId,
}: {
  preparation: MonthPreparation;
  sites: PreparationSite[];
  year: number;
  month: number;
  siteId: string | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const checks = preparationChecks(p);
  const path = generationPath(p);
  const legacy = legacyRuleCount(p.legacy);
  const monthValue = `${year}-${String(month).padStart(2, "0")}`;

  function go(next: { mois?: string; chantier?: string | null }) {
    const q = new URLSearchParams();
    q.set("mois", next.mois ?? monthValue);
    const site = next.chantier === undefined ? siteId : next.chantier;
    if (site) q.set("chantier", site);
    router.push(`/rh/paie/preparation?${q.toString()}`);
  }

  function request() {
    setError(null);
    start(async () => {
      const input = { period_year: year, period_month: month, site_id: siteId };
      const r = path.kind === "D1" ? await requestUnapprovedRulesDecision(input) : await requestPayrollCalculation(input);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      router.push(`/decisions/${r.data.decision_id}`);
    });
  }

  return (
    <div className="space-y-4">
      <RhPageHeader
        eyebrow="Paie"
        title={`Préparation — ${p.period.label}`}
        description="Tableau de contrôle du mois, en lecture seule. Le lancement de la paie reste manuel et passe par une décision (D4, ou D1 si des règles sont en attente)."
      />

      <RhPanel>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="text-sm">
            Mois
            <input
              className={rhInput}
              type="month"
              value={monthValue}
              onChange={(e) => e.target.value && go({ mois: e.target.value })}
            />
          </label>
          <label className="text-sm">
            Chantier
            <select
              className={rhInput}
              value={siteId ?? ""}
              onChange={(e) => go({ chantier: e.target.value || null })}
            >
              <option value="">Tous les chantiers</option>
              {sites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-end gap-2">
            <RhChip tone={p.period.nature === "EXTERNAL" ? "warning" : "brand"}>
              {p.period.nature === "EXTERNAL" ? "Mois de reprise" : "Mois opérationnel"}
            </RhChip>
            {p.run ? <RhChip>Paie {p.run.status === "DRAFT" ? "brouillon" : p.run.status.toLowerCase()}</RhChip> : null}
          </div>
        </div>
      </RhPanel>

      <RhAlert tone={path.kind === "D4" ? "success" : path.kind === "D1" ? "danger" : "info"}>{path.message}</RhAlert>
      {error ? <RhAlert>{error}</RhAlert> : null}
      {p.can.request && (path.kind === "D1" || path.kind === "D4") ? (
        <div>
          <Button disabled={pending} onClick={request}>
            {path.kind === "D1" ? "Demander la décision D1" : "Demander la génération (D4)"}
          </Button>
        </div>
      ) : null}

      <RhPanel>
        <RhSectionTitle>Contrôles du mois</RhSectionTitle>
        <ul className="space-y-2">
          {checks.map((c) => (
            <li key={c.key} className="flex flex-wrap items-start gap-3 rounded-xl border border-border/60 px-3 py-2">
              <RhChip tone={LEVEL[c.level].tone}>{LEVEL[c.level].label}</RhChip>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{c.title}</p>
                <p className="text-sm text-foreground/75">{c.detail}</p>
              </div>
              {c.href ? (
                <Link className="text-xs font-semibold text-brand" href={c.href}>
                  Ouvrir
                </Link>
              ) : null}
            </li>
          ))}
        </ul>
      </RhPanel>

      {p.blockers.length ? (
        <RhPanel>
          <RhSectionTitle>Règles en attente (bloquent la paie réelle)</RhSectionTitle>
          <RhTableWrap>
            <table className="min-w-full text-sm">
              <thead>
                <tr>
                  <th className={rhTh()}>Règle</th>
                  <th className={rhTh()}>Famille</th>
                  <th className={rhTh()}>Statut</th>
                  <th className={rhTh()}>Mois concerné</th>
                  <th className={rhTh()} />
                </tr>
              </thead>
              <tbody>
                {p.blockers.map((b) => (
                  <tr key={b.proposal_id} className="border-t border-border/60">
                    <td className={rhTd()}>{b.title}</td>
                    <td className={rhTd()}>{ruleFamilyLabel(b.family)}</td>
                    <td className={rhTd()}>{proposalStatusLabel(b.status)}</td>
                    <td className={rhTd()}>{monthLabel(b.month)}</td>
                    <td className={rhTd()}>
                      <Link
                        className="text-xs font-semibold text-brand"
                        href={b.application_decision_id ? `/decisions/${b.application_decision_id}` : "/rh/legal/propositions"}
                      >
                        {b.application_decision_id ? "Décision D2" : "Proposition"}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </RhTableWrap>
        </RhPanel>
      ) : null}

      {legacy ? (
        <RhPanel>
          <RhSectionTitle>Valeurs héritées non vérifiées (avertissement)</RhSectionTitle>
          <p className="mb-2 text-xs text-foreground/60">
            Valeurs en vigueur saisies avant le circuit des propositions : elles s&apos;appliquent et ne bloquent pas. Une
            proposition « vérifier » permet de les confirmer.
          </p>
          <ul className="grid gap-1 text-sm sm:grid-cols-2">
            {[...p.legacy.legal_vars, ...p.legacy.cnas_rates, ...p.legacy.irg_bareme, ...p.legacy.irg_rules].map((r, i) => (
              <li key={`${r.code}-${i}`}>
                <span className="font-mono text-xs">{r.code}</span> {r.label ? `— ${r.label}` : ""}
              </li>
            ))}
          </ul>
        </RhPanel>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-4">
        <RhStat label="Présences validées" value={p.attendance.validated} />
        <RhStat label="Présences proposées" value={p.attendance.proposed} />
        <RhStat label="Contrats sans présence" value={p.attendance.without_attendance} />
        <RhStat label="Imports en cours" value={p.attendance.imports.length} />
      </div>
      {p.attendance.without_attendance_sample.length ? (
        <p className="text-xs text-foreground/60">
          Sans présence validée : {p.attendance.without_attendance_sample.join(", ")}
          {p.attendance.without_attendance > p.attendance.without_attendance_sample.length ? "…" : ""}
        </p>
      ) : null}

      {p.decisions.length ? (
        <RhPanel>
          <RhSectionTitle>Décisions ouvertes pour ce mois</RhSectionTitle>
          <ul className="space-y-1 text-sm">
            {p.decisions.map((d) => (
              <li key={d.id}>
                <Link className="font-semibold text-brand" href={`/decisions/${d.id}`}>
                  {d.type_code}
                </Link>{" "}
                {d.label} — {d.status === "PENDING" ? "en attente" : "décidée, à exécuter"}
              </li>
            ))}
          </ul>
        </RhPanel>
      ) : null}

      {p.coefficients.pending.length ? (
        <RhPanel>
          <RhSectionTitle>Coefficients en attente de décision (D14)</RhSectionTitle>
          <ul className="space-y-1 text-sm">
            {p.coefficients.pending.map((c) => (
              <li key={c.decision_id}>
                <Link className="font-semibold text-brand" href={`/decisions/${c.decision_id}`}>
                  {c.code}
                </Link>{" "}
                → {c.coefficient} à partir de {monthLabel(c.month)}
              </li>
            ))}
          </ul>
        </RhPanel>
      ) : null}

      <RhPanel>
        <RhSectionTitle>Simulations « règles non approuvées »</RhSectionTitle>
        <p className="mb-2 text-xs text-foreground/60">
          Calculées sur décision D1 avec les règles en vigueur. Jamais un bulletin : ni validées, ni payées, ni virées, ni
          déclarées, ni comptées dans les coûts.
        </p>
        {!p.can.read_salary ? (
          <p className="text-sm text-foreground/60">Montants réservés aux profils autorisés à lire les salaires.</p>
        ) : p.simulations.length ? (
          <RhTableWrap>
            <table className="min-w-full text-sm">
              <thead>
                <tr>
                  <th className={rhTh()}>Calculée le</th>
                  <th className={rhTh()}>Salariés</th>
                  <th className={rhTh()}>Brut</th>
                  <th className={rhTh()}>IRG</th>
                  <th className={rhTh()}>Net simulé</th>
                  <th className={rhTh()}>Règles en attente</th>
                  <th className={rhTh()} />
                </tr>
              </thead>
              <tbody>
                {p.simulations.map((s) => (
                  <tr key={s.id} className="border-t border-border/60">
                    <td className={rhTd()}>{new Date(s.created_at).toLocaleString("fr-FR")}</td>
                    <td className={rhTd()}>{s.slip_count}</td>
                    <td className={rhTd()}>{money(s.totals.gross)}</td>
                    <td className={rhTd()}>{money(s.totals.irg)}</td>
                    <td className={rhTd()}>{money(s.totals.net)}</td>
                    <td className={rhTd()}>{s.blockers}</td>
                    <td className={rhTd()}>
                      <a className="text-xs font-semibold text-brand" href={`/api/rh/paie/simulations?simulation=${s.id}`}>
                        Exporter (Excel)
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </RhTableWrap>
        ) : (
          <p className="text-sm text-foreground/60">Aucune simulation pour ce mois.</p>
        )}
      </RhPanel>
    </div>
  );
}
