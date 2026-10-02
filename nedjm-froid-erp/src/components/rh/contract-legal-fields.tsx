"use client";

import {
  endComplianceOverride,
  saveComplianceOverride,
  type ContractCompliance,
  type ContractComplianceOptions,
} from "@/lib/actions/hr-compliance";
import { DEFAULT_CNAS_REGIME, DISABLED_IRG_CATEGORY, FIXED_IRG_RATES, type ComplianceOverride } from "@/lib/hr/compliance";
import { Check, ChevronsUpDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  { code: "HANDICAP", label: "Handicapé / retraité" },
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
  return String(Math.round(v * 1000) / 1000);
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

type Zone = ContractComplianceOptions["zones"][number];

function zoneRate(z: Zone) {
  return z.rate_pct > 0 ? `−${rate(z.rate_pct)} % ${z.applies_to === "BASE" ? "de la base" : "de l'impôt"}` : "0 %";
}

function cacoSplit(o: ContractComplianceOptions, conges: boolean, intemperies: boolean) {
  const c = o.cacobatph;
  return {
    employee: intemperies ? c.intemperies_employee_pct : 0,
    employer: (conges ? c.conges_employer_pct : 0) + (intemperies ? c.intemperies_employer_pct : 0),
  };
}

function cacoRates(o: ContractComplianceOptions, conges: boolean, intemperies: boolean) {
  const { employee, employer } = cacoSplit(o, conges, intemperies);
  return `${rate(employee)}/${rate(employer)}`;
}

type Chip = { label: string; value: string };

function RateChips({ items }: { items: Chip[] }) {
  if (!items.length) return null;
  return (
    <div className="mt-2.5 flex flex-wrap gap-2">
      {items.map((c) => (
        <span
          key={c.label}
          className="inline-flex items-baseline gap-2 rounded-lg border border-border/70 bg-surface-muted/70 px-2.5 py-1.5 text-xs font-medium text-foreground/70"
        >
          {c.label}
          <span className="text-sm font-semibold tabular-nums text-foreground">{c.value}</span>
        </span>
      ))}
    </div>
  );
}

function RateTiles({ items }: { items: Chip[] }) {
  return (
    <div className="mt-3 grid gap-2" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
      {items.map((c) => (
        <div key={c.label} className="rounded-xl border border-border/70 bg-surface-muted/60 px-3 py-2.5 text-center">
          <div className="text-xs font-medium text-foreground/65">{c.label}</div>
          <div className="mt-0.5 font-display text-xl font-semibold tabular-nums text-foreground">{c.value}</div>
        </div>
      ))}
    </div>
  );
}

type Regime = ContractComplianceOptions["regimes"][number];

const cnasGrid = "grid grid-cols-[4.5rem_minmax(0,1fr)_4.5rem_4.5rem_5.5rem] items-center gap-2";

function CnasPicker({
  regimes,
  value,
  autoRegime,
  onChange,
}: {
  regimes: Regime[];
  value: string;
  autoRegime: Regime | undefined;
  onChange: (code: string) => void;
}) {
  const picked = value ? regimes.find((r) => r.code === value) : undefined;
  const pct = (v: number) => `${rate(v)} %`;
  const row = (key: string, code: string, label: string, r: Regime | undefined, selected: boolean) => (
    <DropdownMenuItem key={key} className={`${cnasGrid} py-2.5`} onSelect={() => onChange(code)}>
      <span className="flex items-center gap-1.5 font-semibold">
        {selected ? <Check className="text-brand" aria-hidden /> : <span className="size-4" />}
        {code || "Auto"}
      </span>
      <span className="truncate text-foreground/80">{label}</span>
      <span className="text-right tabular-nums">{r ? pct(r.employee_pct) : "—"}</span>
      <span className="text-right tabular-nums">{r ? pct(r.employer_pct) : "—"}</span>
      <span className="text-right tabular-nums">{r ? pct(r.fos_pct) : "—"}</span>
    </DropdownMenuItem>
  );
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="mt-1.5 flex h-11 w-full items-center gap-3 rounded-xl border border-border/80 bg-surface px-3.5 text-left text-sm text-foreground outline-none transition focus-visible:border-brand focus-visible:ring-4 focus-visible:ring-brand/10"
        >
          <span className="rounded-md bg-brand-muted px-2 py-0.5 text-xs font-bold text-brand">
            {picked?.code ?? (value || "Auto")}
          </span>
          <span className="min-w-0 flex-1 truncate font-medium">
            {picked
              ? picked.label_fr
              : value
                ? value
                : `Automatique (fiche employé)${autoRegime ? ` : ${autoRegime.code}` : ""}`}
          </span>
          <ChevronsUpDown className="size-4 shrink-0 text-foreground/45" aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-(--radix-dropdown-menu-trigger-width) min-w-[34rem] p-1.5">
        <div className={`${cnasGrid} border-b border-border/60 px-2.5 pb-2 pt-1 text-xs font-semibold text-foreground/60`}>
          <span className="pl-5">Code</span>
          <span>Régime</span>
          <span className="text-right">Salarié</span>
          <span className="text-right">Patronal</span>
          <span className="text-right">Œuvres soc.</span>
        </div>
        <div className="max-h-80 overflow-y-auto pt-1">
          {row("auto", "", "Automatique (fiche employé)", autoRegime, !value)}
          {regimes.map((r) => row(r.code, r.code, r.label_fr, r, r.code === value))}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function ContractLegalFields({
  options,
  cnasCode,
  onCnasChange,
  choice,
  onChoiceChange,
  employeeId,
  employeeIrgCategory,
  siteId,
  activityId,
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
  employeeId: string;
  employeeIrgCategory: string | null;
  siteId: string;
  activityId: string;
  showCacobatph: boolean;
  allowsFixedIrg: boolean;
  canEdit: boolean;
  loading: boolean;
}) {
  const lockedHint = !canEdit ? "Réservé aux droits « Cotisations & impôts »" : loading ? "Chargement…" : undefined;

  const autoRegimeCode = (employeeId && options.employee_social_profile[employeeId]) || DEFAULT_CNAS_REGIME;
  const autoRegime = options.regimes.find((r) => r.code === autoRegimeCode);

  const bareme = options.bareme_pcts.length ? `${options.bareme_pcts.map(rate).join("/")} %` : "";
  const scale = options.bareme_pcts.length
    ? `barème ${rate(options.bareme_pcts[0])}–${rate(options.bareme_pcts[options.bareme_pcts.length - 1])} %`
    : "barème";
  const southZones = options.zones.filter((z) => z.rate_pct > 0);
  const disabledLissage = options.lissage_max[DISABLED_IRG_CATEGORY];
  const irgLabel = (code: string) => {
    switch (code) {
      case "BAREME":
        return bareme ? `Barème général : ${bareme}` : "Barème général";
      case "ZONE":
        return southZones.length
          ? `Zone Sud / Extrême Sud : ${southZones.map((z) => `−${rate(z.rate_pct)} %`).join(" / ")}`
          : "Zone Sud / Extrême Sud";
      case "HANDICAP":
        return `Handicapé / retraité : ${scale}${
          disabledLissage ? `, lissage jusqu'à ${disabledLissage.toLocaleString("fr-FR")} DA` : ", lissage étendu"
        }`;
      case "EXEMPT":
        return "Exonération totale : 0 %";
      case "FIXED_RATE":
        return `Taux libératoire : ${FIXED_IRG_RATES.map((r) => `${rate(r * 100)} %`).join(" / ")}`;
      default:
        return code;
    }
  };
  const siteZone = siteId ? options.zones.find((z) => z.code === options.site_zone[siteId]) : undefined;
  const irgAuto = siteId
    ? [
        `Automatique : ${scale}`,
        siteZone && siteZone.rate_pct > 0 ? `${siteZone.label_fr} −${rate(siteZone.rate_pct)} %` : null,
        employeeIrgCategory === DISABLED_IRG_CATEGORY ? "handicapé / retraité" : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : `Automatique (zone du chantier) : ${scale}`;

  const activityCaco = options.activity_cacobatph[activityId] ?? { conges: false, intemperies: false };
  const cacoAuto = `Automatique (selon l'activité) : ${cacoRates(options, activityCaco.conges, activityCaco.intemperies)}`;

  const cnasShown = cnasCode ? options.regimes.find((r) => r.code === cnasCode) : autoRegime;
  const cnasChips: Chip[] = cnasShown
    ? [
        { label: "Salarié", value: `${rate(cnasShown.employee_pct)} %` },
        { label: "Patronal", value: `${rate(cnasShown.employer_pct)} %` },
        { label: "Œuvres sociales", value: `${rate(cnasShown.fos_pct)} %` },
      ]
    : [];

  const scaleChip: Chip[] = options.bareme_pcts.length ? [{ label: "Barème", value: bareme }] : [];
  const lissageChip: Chip[] = disabledLissage
    ? [{ label: "Lissage jusqu'à", value: `${disabledLissage.toLocaleString("fr-FR")} DA` }]
    : [];
  const pickedZone = options.zones.find((z) => z.code === choice.irg_zone);
  const irgChips: Chip[] = (() => {
    switch (choice.irg_option) {
      case "":
        return [
          ...scaleChip,
          ...(siteZone && siteZone.rate_pct > 0 ? [{ label: siteZone.label_fr, value: `−${rate(siteZone.rate_pct)} %` }] : []),
          ...(employeeIrgCategory === DISABLED_IRG_CATEGORY ? lissageChip : []),
        ];
      case "BAREME":
        return scaleChip;
      case "ZONE":
        return [...scaleChip, ...(pickedZone ? [{ label: pickedZone.label_fr, value: zoneRate(pickedZone) }] : [])];
      case "HANDICAP":
        return [...scaleChip, ...lissageChip];
      case "EXEMPT":
        return [{ label: "Taux", value: "0 %" }];
      case "FIXED_RATE":
        return [{ label: "Taux libératoire", value: `${rate(Number(choice.irg_rate) * 100)} %` }];
      default:
        return [];
    }
  })();

  const cacoPicked = CACO_OPTIONS.find((o) => o.code === choice.caco_option);
  const cacoSplitShown = cacoPicked
    ? cacoSplit(options, cacoPicked.conges, cacoPicked.intemperies)
    : cacoSplit(options, activityCaco.conges, activityCaco.intemperies);
  const cacoChips: Chip[] = [
    { label: "Salarié", value: `${rate(cacoSplitShown.employee)} %` },
    { label: "Employeur", value: `${rate(cacoSplitShown.employer)} %` },
  ];

  return (
    <div className="grid gap-5">
      <div>
        <span className="text-[13px] font-semibold text-foreground/85">CNAS</span>
        <CnasPicker regimes={options.regimes} value={cnasCode} autoRegime={autoRegime} onChange={onCnasChange} />
        {cnasChips.length ? (
          <RateTiles items={cnasChips} />
        ) : (
          <p className="mt-2 text-xs text-foreground/60">Taux de ce régime non renseignés dans les paramètres.</p>
        )}
      </div>

      <div>
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
                  irg_zone: choice.irg_zone || (southZones[0]?.code ?? ""),
                })
              }
            >
              <option value="">{irgAuto}</option>
              {IRG_OPTIONS.filter((o) => o.code !== "FIXED_RATE" || allowsFixedIrg || choice.irg_option === o.code).map(
                (o) => (
                  <option key={o.code} value={o.code}>
                    {irgLabel(o.code)}
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
                    {z.label_fr} : {zoneRate(z)}
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
        <RateChips items={irgChips} />
      </div>

      {showCacobatph ? (
        <div>
          <RhField label="CACOBATPH" hint={lockedHint}>
            <select
              className={rhInput}
              disabled={!canEdit || loading}
              value={choice.caco_option}
              onChange={(e) => onChoiceChange({ ...choice, caco_option: e.target.value as LegalChoice["caco_option"] })}
            >
              <option value="">{cacoAuto}</option>
              {CACO_OPTIONS.map((o) => (
                <option key={o.code} value={o.code}>
                  {o.label} : {cacoRates(options, o.conges, o.intemperies)}
                </option>
              ))}
            </select>
          </RhField>
          <RateTiles items={cacoChips} />
        </div>
      ) : null}
    </div>
  );
}
