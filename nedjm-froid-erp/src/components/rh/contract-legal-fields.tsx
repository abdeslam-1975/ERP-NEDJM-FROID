"use client";

import {
  endComplianceOverride,
  saveComplianceOverride,
  type ContractCompliance,
  type ContractComplianceOptions,
} from "@/lib/actions/hr-compliance";
import { FIXED_IRG_RATES, type ComplianceOverride } from "@/lib/hr/compliance";
import { RhField, rhInput } from "@/components/rh/rh-ui";

export type LegalChoice = {
  /** "" = automatic (site zone and employee category). */
  irg_option: string;
  irg_zone: string;
  irg_rate: string;
  /** "" = automatic (activity of the contract). */
  caco_option: "" | "BOTH" | "CONGES" | "INTEMPERIES" | "NONE";
};

export type LegalOverrides = { IRG: ComplianceOverride | null; CACOBATPH: ComplianceOverride | null };

export const emptyLegalChoice = (): LegalChoice => ({
  irg_option: "",
  irg_zone: "",
  irg_rate: String(FIXED_IRG_RATES[0]),
  caco_option: "",
});

const IRG_OPTIONS = [
  { code: "BAREME", label: "Barème général" },
  { code: "ZONE", label: "Zone Sud / Extrême Sud" },
  { code: "HANDICAP", label: "Handicapé / retraité (lissage étendu)" },
  { code: "EXEMPT", label: "Exonération totale" },
  { code: "FIXED_RATE", label: "Taux libératoire fixe" },
];

const CACO_OPTIONS: { code: LegalChoice["caco_option"]; label: string; conges: boolean; intemperies: boolean }[] = [
  { code: "BOTH", label: "Congés payés + intempéries", conges: true, intemperies: true },
  { code: "CONGES", label: "Congés payés seulement", conges: true, intemperies: false },
  { code: "INTEMPERIES", label: "Intempéries seulement", conges: false, intemperies: true },
  { code: "NONE", label: "Non assujetti", conges: false, intemperies: false },
];

const REASON = "Choix de la fiche contrat";

function rate(v: number) {
  return String(Math.round(v * 100) / 100);
}

function activeOverride(info: ContractCompliance, domain: "IRG" | "CACOBATPH") {
  return (
    info.overrides.find(
      (o) => o.domain === domain && o.effective_from <= info.as_of && (!o.effective_to || o.effective_to >= info.as_of),
    ) ??
    info.overrides.find((o) => o.domain === domain && o.effective_from > info.as_of) ??
    null
  );
}

export function legalChoiceFromCompliance(info: ContractCompliance): { choice: LegalChoice; overrides: LegalOverrides } {
  const irg = activeOverride(info, "IRG");
  const caco = activeOverride(info, "CACOBATPH");
  const choice = emptyLegalChoice();
  if (irg) {
    choice.irg_option = irg.option_code;
    if (typeof irg.params.zone_code === "string") choice.irg_zone = irg.params.zone_code;
    if (irg.params.rate != null) choice.irg_rate = String(irg.params.rate);
  }
  if (caco) {
    const conges = caco.params.conges === true;
    const intemperies = caco.params.intemperies === true;
    choice.caco_option = CACO_OPTIONS.find((o) => o.conges === conges && o.intemperies === intemperies)?.code ?? "NONE";
  }
  return { choice, overrides: { IRG: irg, CACOBATPH: caco } };
}

function irgOverride(c: LegalChoice) {
  if (!c.irg_option) return null;
  const params =
    c.irg_option === "ZONE"
      ? { zone_code: c.irg_zone }
      : c.irg_option === "FIXED_RATE"
        ? { rate: Number(c.irg_rate) }
        : {};
  return { option_code: c.irg_option, params };
}

function cacoOverride(c: LegalChoice) {
  const opt = CACO_OPTIONS.find((o) => o.code === c.caco_option);
  return opt ? { option_code: "CUSTOM", params: { conges: opt.conges, intemperies: opt.intemperies } } : null;
}

/**
 * Writes the IRG / CACOBATPH choices of the form as dated overrides from `effectiveFrom`.
 * Returns the error messages (the contract itself is already saved).
 */
export async function saveLegalChoice(input: {
  contractId: string;
  effectiveFrom: string;
  initial: LegalChoice;
  next: LegalChoice;
  overrides: LegalOverrides;
  includeCacobatph: boolean;
}): Promise<string[]> {
  const errors: string[] = [];
  const domains = [
    { domain: "IRG" as const, build: irgOverride },
    ...(input.includeCacobatph ? [{ domain: "CACOBATPH" as const, build: cacoOverride }] : []),
  ];
  for (const { domain, build } of domains) {
    const desired = build(input.next);
    if (JSON.stringify(desired) === JSON.stringify(build(input.initial))) continue;
    const active = input.overrides[domain];
    if (active && (!desired || active.effective_from >= input.effectiveFrom)) {
      const ended = await endComplianceOverride({ id: active.id, auto_from: input.effectiveFrom });
      if (!ended.ok) {
        errors.push(`${domain} : ${ended.error}`);
        continue;
      }
    }
    if (!desired) continue;
    const saved = await saveComplianceOverride({
      contract_id: input.contractId,
      domain,
      ...desired,
      reason: REASON,
      effective_from: input.effectiveFrom,
    });
    if (!saved.ok) errors.push(`${domain} : ${saved.error}`);
  }
  return errors;
}

export function ContractLegalFields({
  options,
  cnasCode,
  onCnasChange,
  choice,
  onChoiceChange,
  showCacobatph,
  allowsFixedIrg,
  canEdit,
  loading,
}: {
  options: ContractComplianceOptions;
  cnasCode: string;
  onCnasChange: (code: string) => void;
  choice: LegalChoice;
  onChoiceChange: (next: LegalChoice) => void;
  showCacobatph: boolean;
  allowsFixedIrg: boolean;
  canEdit: boolean;
  loading: boolean;
}) {
  const knownCnas = options.regimes.some((r) => r.code === cnasCode);
  const lockedHint = !canEdit ? "Réservé aux droits « Cotisations & impôts »" : loading ? "Chargement…" : undefined;
  return (
    <>
      <RhField label="CNAS" hint="Taux salarié / patronal / œuvres sociales (%)">
        <select className={rhInput} value={cnasCode} onChange={(e) => onCnasChange(e.target.value)}>
          <option value="">Automatique (profil de la fiche employé)</option>
          {cnasCode && !knownCnas ? <option value={cnasCode}>{cnasCode}</option> : null}
          {options.regimes.map((r) => (
            <option key={r.code} value={r.code} title={r.label_fr}>
              {r.code} : {rate(r.employee_pct)}/{rate(r.employer_pct)}/{rate(r.fos_pct)}
            </option>
          ))}
        </select>
      </RhField>

      <RhField label="IRG" hint={lockedHint}>
        <div className="flex gap-2">
          <select
            className={rhInput}
            disabled={!canEdit || loading}
            value={choice.irg_option}
            onChange={(e) =>
              onChoiceChange({
                ...choice,
                irg_option: e.target.value,
                irg_zone: choice.irg_zone || (options.zones.find((z) => z.code !== "NORMAL")?.code ?? ""),
              })
            }
          >
            <option value="">Automatique (zone du chantier)</option>
            {IRG_OPTIONS.filter((o) => o.code !== "FIXED_RATE" || allowsFixedIrg || choice.irg_option === o.code).map(
              (o) => (
                <option key={o.code} value={o.code}>
                  {o.label}
                </option>
              ),
            )}
          </select>
          {choice.irg_option === "ZONE" ? (
            <select
              aria-label="Zone IRG"
              className={rhInput}
              disabled={!canEdit || loading}
              value={choice.irg_zone}
              onChange={(e) => onChoiceChange({ ...choice, irg_zone: e.target.value })}
            >
              {options.zones.map((z) => (
                <option key={z.code} value={z.code}>
                  {z.label_fr}
                </option>
              ))}
            </select>
          ) : null}
          {choice.irg_option === "FIXED_RATE" ? (
            <select
              aria-label="Taux libératoire"
              className={`${rhInput} w-28`}
              disabled={!canEdit || loading}
              value={choice.irg_rate}
              onChange={(e) => onChoiceChange({ ...choice, irg_rate: e.target.value })}
            >
              {FIXED_IRG_RATES.map((r) => (
                <option key={r} value={String(r)}>
                  {rate(r * 100)} %
                </option>
              ))}
            </select>
          ) : null}
        </div>
      </RhField>

      {showCacobatph ? (
        <RhField label="CACOBATPH" hint={lockedHint}>
          <select
            className={rhInput}
            disabled={!canEdit || loading}
            value={choice.caco_option}
            onChange={(e) => onChoiceChange({ ...choice, caco_option: e.target.value as LegalChoice["caco_option"] })}
          >
            <option value="">Automatique (selon l&apos;activité)</option>
            {CACO_OPTIONS.map((o) => (
              <option key={o.code} value={o.code}>
                {o.label}
              </option>
            ))}
          </select>
        </RhField>
      ) : null}
    </>
  );
}
