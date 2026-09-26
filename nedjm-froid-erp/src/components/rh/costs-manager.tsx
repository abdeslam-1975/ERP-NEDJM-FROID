"use client";

import { useState, useTransition } from "react";
import { saveAccountingSettings, type CostReport } from "@/lib/actions/hr-costs";
import { ACCOUNT_KEYS, DEFAULT_ACCOUNTS } from "@/lib/hr/cost-allocation";
import { Button } from "@/components/ui/button";
import {
  RhAlert,
  RhChip,
  RhField,
  RhModal,
  RhPageHeader,
  RhStat,
  RhTableWrap,
  RhToolbar,
  rhInput,
  rhTd,
  rhTh,
} from "@/components/rh/rh-ui";

function money(n: number) {
  return new Intl.NumberFormat("fr-DZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

export function CostsManager({
  report,
  canEditAccounts,
  loadError,
}: {
  report: CostReport | null;
  canEditAccounts: boolean;
  loadError?: string;
}) {
  const [error, setError] = useState<string | null>(loadError ?? null);
  const [info, setInfo] = useState<string | null>(null);
  const [settings, setSettings] = useState<{ journal_code: string; accounts: CostReport["accounts"] } | null>(null);
  const [pending, start] = useTransition();
  const year = report?.year ?? new Date().getFullYear();
  const month = report?.month ?? new Date().getMonth() + 1;

  function go(y: number, m: number) {
    window.location.search = `?year=${y}&month=${m}`;
  }

  async function download(kind: "journal" | "allocation") {
    setError(null);
    const res = await fetch(`/api/rh/couts?kind=${kind}&year=${year}&month=${month}`);
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      setError(body?.error ?? `Export impossible (${res.status}).`);
      return;
    }
    const name = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? `${kind}.csv`;
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  }

  function saveSettings() {
    if (!settings) return;
    setError(null);
    start(async () => {
      const r = await saveAccountingSettings(settings);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setSettings(null);
      setInfo("Plan de comptes enregistré.");
      window.location.reload();
    });
  }

  return (
    <div className="space-y-5">
      <RhPageHeader
        title="Coûts de la paie par chantier et par contrat"
        description="Coût employeur = brut + charges patronales (CNAS, CACOBATPH, intempéries). Chaque bulletin est imputé au chantier de sa paie, puis réparti entre les contrats clients actifs sur ce chantier au prorata de leurs jours d'activité dans le mois. L'écriture de paie (plan SCF) est ventilée par chantier en analytique."
      />
      {error ? <RhAlert tone="danger">{error}</RhAlert> : null}
      {info && !error ? <RhAlert tone="success">{info}</RhAlert> : null}
      <RhToolbar>
        <RhField label="Année">
          <input className={rhInput} type="number" defaultValue={year} onBlur={(e) => Number(e.target.value) !== year && go(Number(e.target.value), month)} />
        </RhField>
        <RhField label="Mois">
          <select className={rhInput} value={month} onChange={(e) => go(year, Number(e.target.value))}>
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <option key={m} value={m}>
                {String(m).padStart(2, "0")}
              </option>
            ))}
          </select>
        </RhField>
        <Button variant="secondary" disabled={!report?.slips} onClick={() => download("allocation")}>
          Répartition (CSV)
        </Button>
        <Button disabled={!report?.slips || !report.journal.balanced} onClick={() => download("journal")}>
          Écritures comptables (CSV)
        </Button>
        {canEditAccounts && report ? (
          <Button variant="ghost" onClick={() => setSettings({ journal_code: report.journalCode, accounts: report.accounts })}>
            Plan de comptes
          </Button>
        ) : null}
      </RhToolbar>

      {report ? (
        <>
          {report.provisional ? <RhAlert tone="warning">Paie du mois non validée : chiffres provisoires.</RhAlert> : null}
          {!report.contractsVisible ? (
            <RhAlert tone="info">Contrats clients non accessibles avec votre profil : répartition par chantier uniquement.</RhAlert>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-3">
            <RhStat label="Bulletins" value={report.slips} />
            <RhStat label="Coût employeur total (DA)" value={money(report.total)} />
            <RhStat label="Chantiers" value={report.sites.length} />
          </div>

          <RhTableWrap>
            <table className="min-w-full text-sm">
              <thead className="border-b border-border/70 bg-surface-muted/80">
                <tr>
                  <th className={rhTh()}>Chantier</th>
                  <th className={rhTh()}>Effectif</th>
                  <th className={rhTh()}>Brut</th>
                  <th className={rhTh()}>Charges patronales</th>
                  <th className={rhTh()}>Coût employeur</th>
                  <th className={rhTh()}>Part</th>
                </tr>
              </thead>
              <tbody>
                {report.sites.length === 0 ? (
                  <tr>
                    <td colSpan={6} className={`${rhTd()} py-6 text-center text-foreground/55`}>
                      Aucun bulletin pour {String(month).padStart(2, "0")}/{year}.
                    </td>
                  </tr>
                ) : (
                  report.sites.map((s) => (
                    <tr key={s.site_id ?? "none"} className="border-b border-border/60">
                      <td className={rhTd()}>
                        <span className="font-mono text-xs text-foreground/55">{s.site_code}</span> {s.site_name}
                      </td>
                      <td className={`${rhTd()} tabular-nums`}>{s.headcount}</td>
                      <td className={`${rhTd()} font-mono`}>{money(s.brut)}</td>
                      <td className={`${rhTd()} font-mono`}>{money(s.charges)}</td>
                      <td className={`${rhTd()} font-mono font-semibold`}>{money(s.cost)}</td>
                      <td className={`${rhTd()} tabular-nums`}>{report.total ? Math.round((s.cost / report.total) * 1000) / 10 : 0} %</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </RhTableWrap>

          {report.contracts.length ? (
            <RhTableWrap>
              <table className="min-w-full text-sm">
                <thead className="border-b border-border/70 bg-surface-muted/80">
                  <tr>
                    <th className={rhTh()}>Contrat client</th>
                    <th className={rhTh()}>Chantier</th>
                    <th className={rhTh()}>Quote-part du chantier</th>
                    <th className={rhTh()}>Coût imputé</th>
                  </tr>
                </thead>
                <tbody>
                  {report.contracts.map((c, i) => (
                    <tr key={`${c.contract_id ?? "none"}-${i}`} className="border-b border-border/60">
                      <td className={rhTd()}>
                        {c.contract_id ? (
                          <>
                            <span className="font-semibold">{c.reference}</span> · {c.client_name}
                          </>
                        ) : (
                          <RhChip tone="warning">Non affecté</RhChip>
                        )}
                      </td>
                      <td className={rhTd()}>{c.site_name}</td>
                      <td className={`${rhTd()} tabular-nums`}>{Math.round(c.share * 1000) / 10} %</td>
                      <td className={`${rhTd()} font-mono font-semibold`}>{money(c.cost)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </RhTableWrap>
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-display text-lg font-semibold">Écriture de paie · journal {report.journalCode}</h3>
            {report.journal.balanced ? (
              <RhChip tone="success">Équilibrée</RhChip>
            ) : (
              <RhChip tone="danger">
                Déséquilibre {money(report.journal.debit - report.journal.credit)} DA
              </RhChip>
            )}
          </div>
          <RhTableWrap>
            <table className="min-w-full text-sm">
              <thead className="border-b border-border/70 bg-surface-muted/80">
                <tr>
                  <th className={rhTh()}>Compte</th>
                  <th className={rhTh()}>Libellé</th>
                  <th className={rhTh()}>Analytique</th>
                  <th className={rhTh()}>Débit</th>
                  <th className={rhTh()}>Crédit</th>
                </tr>
              </thead>
              <tbody>
                {report.journal.lines.map((l, i) => (
                  <tr key={i} className="border-b border-border/60">
                    <td className={`${rhTd()} font-mono`}>{l.account}</td>
                    <td className={rhTd()}>{l.label}</td>
                    <td className={`${rhTd()} font-mono text-xs`}>{l.analytic}</td>
                    <td className={`${rhTd()} font-mono`}>{l.debit ? money(l.debit) : ""}</td>
                    <td className={`${rhTd()} font-mono`}>{l.credit ? money(l.credit) : ""}</td>
                  </tr>
                ))}
                <tr className="font-semibold">
                  <td className={rhTd()} colSpan={3}>
                    Totaux
                  </td>
                  <td className={`${rhTd()} font-mono`}>{money(report.journal.debit)}</td>
                  <td className={`${rhTd()} font-mono`}>{money(report.journal.credit)}</td>
                </tr>
              </tbody>
            </table>
          </RhTableWrap>
        </>
      ) : null}

      {settings ? (
        <RhModal
          title="Plan de comptes de la paie"
          onClose={() => setSettings(null)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setSettings(null)}>
                Fermer
              </Button>
              <Button disabled={pending} onClick={saveSettings}>
                Enregistrer
              </Button>
            </>
          }
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <RhField label="Code journal">
              <input
                className={rhInput}
                value={settings.journal_code}
                onChange={(e) => setSettings({ ...settings, journal_code: e.target.value.toUpperCase() })}
              />
            </RhField>
            <div />
            {ACCOUNT_KEYS.map((k) => (
              <RhField key={k} label={DEFAULT_ACCOUNTS[k].label} hint={`Défaut ${DEFAULT_ACCOUNTS[k].account}`}>
                <input
                  className={rhInput}
                  value={settings.accounts[k].account}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      accounts: { ...settings.accounts, [k]: { ...settings.accounts[k], account: e.target.value.replace(/\D/g, "") } },
                    })
                  }
                />
              </RhField>
            ))}
          </div>
        </RhModal>
      ) : null}
    </div>
  );
}
