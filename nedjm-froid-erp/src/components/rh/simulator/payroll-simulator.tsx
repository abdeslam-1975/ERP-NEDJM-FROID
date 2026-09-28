"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { RhAlert, RhChip } from "@/components/rh/rh-ui";
import { buildBulletinHtml, formatDa, slipToBulletin } from "@/components/rh/bulletin-print";
import {
  NumField,
  NumInput,
  PctField,
  ResetButton,
  SimGroup,
  SimRow,
  ToggleField,
  simSelectClass,
} from "@/components/rh/simulator/sim-fields";
import { bulletinRatesFromVars, type HrBulletinSettings } from "@/lib/hr/bulletin-settings";
import {
  DISABLED_IRG_CATEGORY,
  FIXED_IRG_RATES,
  IRG_MANUAL_OPTIONS,
  type IrgManualOption,
} from "@/lib/hr/compliance";
import { explainMonthlyIrg, type IrgRule } from "@/lib/hr/irg-calc";
import { coveredDaysInPeriod, RETENUE_CATEGORY, type SalaryUnit } from "@/lib/hr/payroll-calc";
import { OVERTIME_COLUMNS } from "@/lib/hr/attendance-columns";
import {
  cnasForRegime,
  initialScenario,
  newRubricKey,
  periodBounds,
  runScenario,
  scenarioFigures,
  type Scenario,
  type ScenarioFigures,
} from "@/lib/hr/payroll-simulator";
import type { SimulatorData } from "@/lib/hr/payroll-simulator-load";

const BULLETIN_WIDTH = 820;

const IRG_OPTION_LABELS: Record<"AUTO" | IrgManualOption, string> = {
  AUTO: "Automatique (catégorie + zone)",
  BAREME: "Barème général",
  ZONE: "Zone (abattement)",
  HANDICAP: "Handicapé / retraité",
  EXEMPT: "Exonéré",
  FIXED_RATE: "Taux libératoire",
};

const UNIT_LABELS: Record<SalaryUnit, string> = {
  month: "Mensuel",
  day: "/ jour payé",
  presence_day: "/ jour présence",
  percent: "% du base",
};

const CATEGORY_LABELS: Record<string, string> = {
  STANDARD: "Standard",
  [DISABLED_IRG_CATEGORY]: "Handicapé / retraité",
};

const FIGURES: { key: keyof ScenarioFigures; label: string; goodWhenUp?: boolean }[] = [
  { key: "gross", label: "Brut cotisable" },
  { key: "taxable", label: "Imposable" },
  { key: "cnas", label: "CNAS salarié" },
  { key: "irgBase", label: "Base IRG" },
  { key: "irg", label: "IRG" },
  { key: "net", label: "Net à payer", goodWhenUp: true },
  { key: "cost", label: "Coût employeur" },
];

function same(a: unknown, b: unknown) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function signed(n: number) {
  const rounded = Math.round(n * 100) / 100;
  if (rounded === 0) return "±0";
  return `${rounded > 0 ? "+" : "−"}${formatDa(Math.abs(rounded))}`;
}

function ruleOf(rules: IrgRule[] | undefined, kind: string) {
  return (rules ?? []).find((r) => r.kind === kind);
}

function paramNum(rule: IrgRule | undefined, key: string) {
  const n = Number(rule?.params[key]);
  return Number.isFinite(n) ? n : 0;
}

export function PayrollSimulator({
  data,
  bulletin,
  months,
}: {
  data: SimulatorData;
  bulletin: HrBulletinSettings;
  months: string[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const initial = useMemo(() => initialScenario(data), [data]);
  const [scenario, setScenario] = useState<Scenario>(() => structuredClone(initial));
  const deferred = useDeferredValue(scenario);
  const out = useMemo(() => runScenario(data, deferred), [data, deferred]);
  const figures = useMemo(() => scenarioFigures(out), [out]);
  const initialFigures = useMemo(() => scenarioFigures(runScenario(data, initial)), [data, initial]);
  const [reference, setReference] = useState<ScenarioFigures>(initialFigures);
  const [employeeQuery, setEmployeeQuery] = useState("");

  const s = scenario;
  const subject = data.subject;
  const period = periodBounds(data.year, data.month);
  const set = (patch: Partial<Scenario>) => setScenario((prev) => ({ ...prev, ...patch }));
  const setVar = (key: string, value: number) => setScenario((prev) => ({ ...prev, vars: { ...prev.vars, [key]: value } }));

  const unofficial =
    !same(s.vars, initial.vars) ||
    !same(s.brackets, initial.brackets) ||
    !same(s.rules, initial.rules) ||
    !same(s.cnas, initial.cnas);
  const anyChange = !same(s, initial);

  function navigate(next: { year?: number; month?: number; employee?: string | null }) {
    const qs = new URLSearchParams({
      year: String(next.year ?? data.year),
      month: String(next.month ?? data.month),
    });
    const emp = next.employee === undefined ? subject?.employee.id : next.employee;
    if (emp) qs.set("employee", emp);
    router.push(`${pathname}?${qs.toString()}`);
  }

  function pickEmployee(text: string) {
    setEmployeeQuery(text);
    const match = data.employees.find((e) => `${e.matricule} · ${e.name}` === text);
    if (match) navigate({ employee: match.id });
  }

  const model = useMemo(
    () =>
      slipToBulletin(out.bulletin, bulletin, bulletinRatesFromVars(out.bulletinVars, bulletin), {
        brackets: deferred.brackets,
        rulesByCategory: deferred.rules,
      }),
    [out, bulletin, deferred.brackets, deferred.rules],
  );
  const html = useMemo(
    () => buildBulletinHtml([model], typeof window !== "undefined" ? window.location.origin : ""),
    [model],
  );

  const years = Array.from({ length: 7 }, (_, i) => new Date().getFullYear() - 4 + i);

  return (
    <div className="rh-scope space-y-3">
      <div className="flex flex-wrap items-end gap-2 rounded-2xl border border-border/60 bg-surface/80 p-2.5">
        <label className="text-xs text-foreground/60">
          Mois
          <select
            className={`${simSelectClass} mt-1 w-32`}
            value={data.month}
            onChange={(e) => navigate({ month: Number(e.target.value) })}
          >
            {months.map((m, i) => (
              <option key={m} value={i + 1}>
                {m}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-foreground/60">
          Année
          <select
            className={`${simSelectClass} mt-1 w-24`}
            value={data.year}
            onChange={(e) => navigate({ year: Number(e.target.value) })}
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>
        <label className="min-w-64 flex-1 text-xs text-foreground/60">
          Salarié
          <input
            list="sim-employees"
            className={`${simSelectClass} mt-1`}
            placeholder={subject ? `${subject.employee.matricule} · ${subject.employee.name}` : "Matricule ou nom…"}
            value={employeeQuery}
            onChange={(e) => pickEmployee(e.target.value)}
          />
          <datalist id="sim-employees">
            {data.employees.map((e) => (
              <option key={e.id} value={`${e.matricule} · ${e.name}`} />
            ))}
          </datalist>
        </label>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => navigate({ employee: null })} disabled={!subject}>
            Scénario vide
          </Button>
          <Button variant="secondary" onClick={() => setReference(figures)}>
            Figer comme référence
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              setScenario(structuredClone(initial));
              setReference(initialFigures);
            }}
            disabled={!anyChange && same(reference, initialFigures)}
          >
            Tout rétablir
          </Button>
        </div>
      </div>

      <FiguresStrip figures={figures} reference={reference} netRef={s.contract.netRef} />

      {data.notice ? <RhAlert tone="warning">{data.notice}</RhAlert> : null}
      {unofficial ? (
        <RhAlert tone="warning">
          Valeurs légales modifiées dans cette simulation (valeurs non officielles). Rien n&apos;est enregistré.
        </RhAlert>
      ) : null}

      <div className="grid gap-3 xl:h-[calc(100dvh-22rem)] xl:min-h-[34rem] xl:grid-cols-[19rem_minmax(0,1fr)_19rem]">
        <aside className="space-y-2 xl:overflow-y-auto xl:pr-1">
          <ContractGroup data={data} s={s} initial={initial} set={set} period={period} />
          <DaysGroup s={s} initial={initial} set={set} setVar={setVar} />
          <CnasGroup data={data} s={s} initial={initial} set={set} setVar={setVar} />
        </aside>

        <section className="flex min-h-[36rem] flex-col gap-2 xl:min-h-0">
          <BulletinFrame html={html} />
          {out.slip.warnings.length ? (
            <ul className="max-h-20 shrink-0 space-y-0.5 overflow-y-auto rounded-xl border border-amber-200/80 bg-amber-50 px-3 py-2 text-xs text-amber-950 dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-100">
              {out.slip.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          ) : null}
        </section>

        <aside className="space-y-2 xl:overflow-y-auto xl:pr-1">
          <IrgGroup data={data} s={s} initial={initial} set={set} setVar={setVar} out={out} />
          <BaremeGroup s={s} initial={initial} set={set} />
          <RulesGroup s={s} initial={initial} set={set} category={out.compliance.irg.category} />
        </aside>
      </div>

      <RubriquesPanel data={data} s={s} initial={initial} set={set} out={out} />
    </div>
  );
}

function FiguresStrip({
  figures,
  reference,
  netRef,
}: {
  figures: ScenarioFigures;
  reference: ScenarioFigures;
  netRef: number;
}) {
  const gap = figures.net - netRef;
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-8">
      {FIGURES.map((f) => {
        const delta = figures[f.key] - reference[f.key];
        const moved = Math.abs(delta) >= 0.005;
        const tone = !moved
          ? "text-foreground/40"
          : f.goodWhenUp
            ? delta > 0
              ? "text-emerald-600"
              : "text-red-600"
            : "text-foreground/70";
        return (
          <div
            key={f.key}
            className={`rounded-xl border px-3 py-2 transition-colors ${
              moved ? "border-brand/40 bg-brand-muted/40" : "border-border/60 bg-surface"
            }`}
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-foreground/50">{f.label}</p>
            <p className={`font-display tabular-nums ${f.key === "net" ? "text-lg font-semibold" : "text-base font-medium"}`}>
              {formatDa(figures[f.key])}
            </p>
            <p className={`text-[11px] tabular-nums ${tone}`}>{signed(delta)} vs réf.</p>
          </div>
        );
      })}
      <div className="rounded-xl border border-border/60 bg-surface px-3 py-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-foreground/50">Net du contrat</p>
        <p className="font-display text-base font-medium tabular-nums">{netRef > 0 ? formatDa(netRef) : "—"}</p>
        <p className={`text-[11px] tabular-nums ${Math.abs(gap) < 0.005 ? "text-emerald-600" : "text-foreground/70"}`}>
          {netRef > 0 ? `écart ${signed(gap)}` : "non renseigné"}
        </p>
      </div>
    </div>
  );
}

/** Payslip HTML written into an iframe, scaled to the column width, keeping its scroll on refresh. */
function BulletinFrame({ html }: { html: string }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [box, setBox] = useState({ width: BULLETIN_WIDTH, height: 900 });

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setBox({ width: el.clientWidth, height: el.clientHeight }));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const frame = frameRef.current;
    const doc = frame?.contentDocument;
    if (!frame || !doc) return;
    const scroll = frame.contentWindow?.scrollY ?? 0;
    doc.open();
    doc.write(html);
    doc.close();
    frame.contentWindow?.scrollTo(0, scroll);
  }, [html]);

  const scale = Math.min(1, Math.max(0.4, (box.width - 8) / BULLETIN_WIDTH));
  return (
    <div
      ref={wrapRef}
      className="relative min-h-[32rem] flex-1 overflow-hidden rounded-2xl border border-border/70 bg-slate-100 dark:bg-slate-900"
    >
      <iframe
        ref={frameRef}
        title="Fiche de paie simulée"
        className="absolute left-1/2 top-0 origin-top bg-white"
        style={{
          width: BULLETIN_WIDTH,
          height: box.height / scale,
          transform: `translateX(-50%) scale(${scale})`,
        }}
      />
    </div>
  );
}

type GroupProps = {
  s: Scenario;
  initial: Scenario;
  set: (patch: Partial<Scenario>) => void;
};

function ContractGroup({
  data,
  s,
  initial,
  set,
  period,
}: GroupProps & { data: SimulatorData; period: { start: string; end: string; days: number } }) {
  const subject = data.subject;
  const setDates = (startDate: string, endDate: string | null) =>
    set({
      contract: { ...s.contract, startDate, endDate },
      days: { ...s.days, covered: startDate ? coveredDaysInPeriod(startDate, endDate, period.start, period.end) : 0 },
    });
  const datesChanged = s.contract.startDate !== initial.contract.startDate || s.contract.endDate !== initial.contract.endDate;
  return (
    <SimGroup
      title="Contrat de travail"
      badge={subject ? <RhChip tone="brand">{subject.employee.matricule}</RhChip> : <RhChip>Vide</RhChip>}
    >
      {subject ? (
        <div className="mb-2 space-y-0.5 text-xs text-foreground/65">
          <p className="font-semibold text-foreground">{subject.employee.name}</p>
          <p>
            {subject.contract.poste_fr ?? "—"} · {subject.contract.site_name}
          </p>
        </div>
      ) : (
        <p className="mb-2 text-xs text-foreground/60">Scénario libre : saisissez un salaire et ajoutez des rubriques.</p>
      )}
      <NumField
        label="Salaire de base"
        value={s.contract.base}
        initial={initial.contract.base}
        onChange={(v) => set({ contract: { ...s.contract, base: v } })}
        suffix="DA"
      />
      <NumField
        label="Net de référence"
        value={s.contract.netRef}
        initial={initial.contract.netRef}
        onChange={(v) => set({ contract: { ...s.contract, netRef: v } })}
        suffix="DA"
      />
      <SimRow
        label="Début / fin du contrat"
        changed={datesChanged}
        onReset={() =>
          set({ contract: { ...s.contract, startDate: initial.contract.startDate, endDate: initial.contract.endDate }, days: { ...s.days, covered: initial.days.covered } })
        }
      >
        <div className="space-y-1">
          <input
            type="date"
            aria-label="Date de début"
            className={simSelectClass}
            value={s.contract.startDate}
            onChange={(e) => setDates(e.target.value, s.contract.endDate)}
          />
          <input
            type="date"
            aria-label="Date de fin"
            className={simSelectClass}
            value={s.contract.endDate ?? ""}
            onChange={(e) => setDates(s.contract.startDate, e.target.value || null)}
          />
        </div>
      </SimRow>
      <NumField
        label="Jours de contrat dans le mois"
        value={s.days.covered}
        initial={initial.days.covered}
        onChange={(v) => set({ days: { ...s.days, covered: Math.min(period.days, Math.max(0, v)) } })}
        decimals={0}
        hint={`sur ${period.days} jours calendaires`}
      />
      {subject ? (
        <details className="mt-2 rounded-lg bg-surface-muted/50 px-2 py-1.5 text-xs">
          <summary className="cursor-pointer font-medium text-foreground/70">Toutes les données du contrat</summary>
          <dl className="mt-1.5 grid grid-cols-[auto_minmax(0,1fr)] gap-x-2 gap-y-1">
            {[
              ...subject.contract_fields,
              { label: "Chantier", value: subject.contract.site_name },
              { label: "Zone IRG du chantier", value: `${subject.site_zone.code} (${subject.site_zone.source})` },
              { label: "Profil social salarié", value: subject.social_profile_code ?? "—" },
              { label: "CACOBATPH (activité)", value: subject.activity.cacobatph ? "Oui" : "Non" },
              { label: "Intempéries (activité)", value: subject.activity.intemperies ? "Oui" : "Non" },
              { label: "Catégorie IRG salarié", value: subject.employee.irg_category },
              { label: "NSS", value: subject.employee.nss ?? "—" },
              { label: "Régimes manuels", value: subject.overrides.length ? subject.overrides.map((o) => `${o.domain} ${o.option_code}`).join(", ") : "—" },
              {
                label: "Bulletin enregistré",
                value: subject.stored_slip
                  ? `${subject.stored_slip.status} · net ${formatDa(subject.stored_slip.net_payable)}`
                  : "aucun",
              },
            ].map((f) => (
              <div key={f.label} className="contents">
                <dt className="text-foreground/50">{f.label}</dt>
                <dd className="truncate text-right font-medium" title={f.value}>
                  {f.value}
                </dd>
              </div>
            ))}
          </dl>
          {subject.salary_versions.length ? (
            <div className="mt-2">
              <p className="font-medium text-foreground/70">Historique des salaires</p>
              <ul className="mt-1 space-y-0.5">
                {[...subject.salary_versions]
                  .sort((a, b) => b.effective_from.localeCompare(a.effective_from))
                  .map((v) => (
                    <li key={v.effective_from} className="flex justify-between tabular-nums">
                      <span>{v.effective_from}</span>
                      <span>
                        {formatDa(v.salaire_base_monthly)} / net {formatDa(v.salaire_net_ref_monthly)}
                      </span>
                    </li>
                  ))}
              </ul>
            </div>
          ) : null}
        </details>
      ) : null}
    </SimGroup>
  );
}

function DaysGroup({ s, initial, set, setVar }: GroupProps & { setVar: (key: string, value: number) => void }) {
  const rates = OVERTIME_COLUMNS;
  return (
    <SimGroup title="Jours, heures & paramètres">
      <NumField
        label="Jours payés (pointage)"
        value={s.days.paid}
        initial={initial.days.paid}
        onChange={(v) => set({ days: { ...s.days, paid: Math.max(0, v) } })}
      />
      <NumField
        label="Jours de présence"
        value={s.days.presence}
        initial={initial.days.presence}
        onChange={(v) => set({ days: { ...s.days, presence: Math.max(0, v) } })}
      />
      <NumField
        label="Congé annuel (CA)"
        value={s.days.annualLeave}
        initial={initial.days.annualLeave}
        onChange={(v) => set({ days: { ...s.days, annualLeave: Math.max(0, v) } })}
        decimals={0}
        hint="exclus si payés par la CACOBATPH"
      />
      {rates.map((c) => (
        <NumField
          key={c.code}
          label={`Heures ${c.code}`}
          value={s.overtime[c.code] ?? 0}
          initial={initial.overtime[c.code] ?? 0}
          onChange={(v) => set({ overtime: { ...s.overtime, [c.code]: Math.max(0, v) } })}
          suffix="h"
        />
      ))}
      <div className="my-1.5 border-t border-dashed border-border/70" />
      <NumField
        label="SNMG"
        value={s.vars.SNMG ?? 0}
        initial={initial.vars.SNMG ?? 0}
        onChange={(v) => setVar("SNMG", v)}
        suffix="DA"
      />
      <NumField
        label="Diviseur journalier"
        value={s.vars.NJM_DIVISEUR_FIXED ?? 30}
        initial={initial.vars.NJM_DIVISEUR_FIXED ?? 30}
        onChange={(v) => setVar("NJM_DIVISEUR_FIXED", v)}
        decimals={2}
      />
      <NumField
        label="Heures mensuelles"
        value={s.vars.HEURES_MENSUELLES ?? 173.33}
        initial={initial.vars.HEURES_MENSUELLES ?? 173.33}
        onChange={(v) => setVar("HEURES_MENSUELLES", v)}
        suffix="h"
      />
      {rates.map((c) => (
        <PctField
          key={c.rateKey}
          label={`Majoration ${c.code}`}
          value={s.vars[c.rateKey] ?? c.defaultRate}
          initial={initial.vars[c.rateKey] ?? c.defaultRate}
          onChange={(v) => setVar(c.rateKey, v)}
        />
      ))}
    </SimGroup>
  );
}

function CnasGroup({
  data,
  s,
  initial,
  set,
  setVar,
}: GroupProps & { data: SimulatorData; setVar: (key: string, value: number) => void }) {
  const cnasRow = (key: keyof Scenario["cnas"], label: string) => (
    <PctField
      label={label}
      value={s.cnas[key] as number}
      initial={initial.cnas[key] as number}
      onChange={(v) => set({ cnas: { ...s.cnas, [key]: v } })}
    />
  );
  return (
    <SimGroup title="CNAS & cotisations">
      <SimRow
        label="Régime CNAS"
        changed={s.cnas.regime !== initial.cnas.regime}
        onReset={() => set({ cnas: { ...initial.cnas } })}
      >
        <select
          className={simSelectClass}
          value={s.cnas.regime}
          onChange={(e) => set({ cnas: cnasForRegime(data, s.vars, e.target.value) })}
        >
          {!data.regimes.some((r) => r.code === s.cnas.regime) ? <option value={s.cnas.regime}>{s.cnas.regime}</option> : null}
          {data.regimes.map((r) => (
            <option key={r.code} value={r.code}>
              {r.label_fr}
            </option>
          ))}
        </select>
      </SimRow>
      {cnasRow("employee", "Part salariale")}
      {cnasRow("employer", "Part patronale")}
      {cnasRow("fos", "FOS (œuvres sociales)")}
      <div className="my-1.5 border-t border-dashed border-border/70" />
      <ToggleField
        label="CACOBATPH congés"
        value={s.caco.conges}
        initial={initial.caco.conges}
        onChange={(v) => set({ caco: { ...s.caco, conges: v } })}
      />
      <ToggleField
        label="CACOBATPH intempéries"
        value={s.caco.intemperies}
        initial={initial.caco.intemperies}
        onChange={(v) => set({ caco: { ...s.caco, intemperies: v } })}
      />
      <PctField
        label="Taux congés payés"
        value={s.vars.CACOBATPH_CONGES ?? 0}
        initial={initial.vars.CACOBATPH_CONGES ?? 0}
        onChange={(v) => setVar("CACOBATPH_CONGES", v)}
      />
      <PctField
        label="Intempéries salarié"
        value={s.vars.CACOBATPH_INTEMPERIES_SAL ?? 0}
        initial={initial.vars.CACOBATPH_INTEMPERIES_SAL ?? 0}
        onChange={(v) => setVar("CACOBATPH_INTEMPERIES_SAL", v)}
      />
      <PctField
        label="Intempéries employeur"
        value={s.vars.CACOBATPH_INTEMPERIES_EMP ?? 0}
        initial={initial.vars.CACOBATPH_INTEMPERIES_EMP ?? 0}
        onChange={(v) => setVar("CACOBATPH_INTEMPERIES_EMP", v)}
      />
      {data.contribution_defs.length ? (
        <>
          <div className="my-1.5 border-t border-dashed border-border/70" />
          <p className="pb-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-foreground/45">
            Cotisations complémentaires
          </p>
          {data.contribution_defs.map((d) => (
            <PctField
              key={d.key}
              label={`${d.code} · ${d.label_fr}`}
              hint={`${d.part === "EMPLOYEE" ? "salarié" : "employeur"} · base ${d.base === "TAXABLE" ? "imposable" : "cotisable"}`}
              value={s.vars[d.key] ?? 0}
              initial={initial.vars[d.key] ?? 0}
              onChange={(v) => setVar(d.key, v)}
            />
          ))}
        </>
      ) : null}
    </SimGroup>
  );
}

function IrgGroup({
  data,
  s,
  initial,
  set,
  setVar,
  out,
}: GroupProps & { data: SimulatorData; setVar: (key: string, value: number) => void; out: ReturnType<typeof runScenario> }) {
  const categories = [...new Set(["STANDARD", DISABLED_IRG_CATEGORY, ...Object.keys(s.rules)])];
  const zone = data.zones.find((z) => z.code === s.irg.zone);
  const usesZone = s.irg.option === "AUTO" || s.irg.option === "ZONE";
  const irg = out.compliance.irg;
  const base = out.slip.summary.irg_base;
  const rules = s.rules[irg.category] ?? s.rules.STANDARD ?? [];
  const taxedBase = irg.zone_applies_to === "BASE" && irg.zone_rate > 0 ? base * (1 - irg.zone_rate) : base;
  const steps = explainMonthlyIrg({ irgBaseMonthly: taxedBase, brackets: s.brackets, rules });

  const stepRows: [string, string][] =
    irg.option === "EXEMPT"
      ? [["Exonéré", "0,00"]]
      : irg.fixed_rate != null
        ? [
            ["Base IRG", formatDa(base)],
            [`Taux libératoire ${Math.round(irg.fixed_rate * 100)} %`, formatDa(out.slip.summary.irg_amount)],
          ]
        : [
            ["Base IRG", formatDa(base)],
            ...(irg.zone_applies_to === "BASE" && irg.zone_rate > 0
              ? ([[`Base après zone (−${Math.round(irg.zone_rate * 100)} %)`, formatDa(taxedBase)]] as [string, string][])
              : []),
            ...(steps.exempt
              ? ([["Sous le seuil d'exonération", "0,00"]] as [string, string][])
              : ([
                  ["Barème (mensualisé)", formatDa(steps.rawMonthly)],
                  ["Abattement", `−${formatDa(steps.abatement)}`],
                  ["Après abattement", formatDa(steps.afterAbatement)],
                  ...(steps.lissageApplied ? ([["Après lissage", formatDa(steps.final)]] as [string, string][]) : []),
                ] as [string, string][])),
            ...(irg.zone_applies_to === "TAX" && irg.zone_rate > 0
              ? ([[`Réduction zone −${Math.round(irg.zone_rate * 100)} %`, formatDa(out.slip.summary.irg_amount)]] as [string, string][])
              : []),
          ];

  return (
    <SimGroup title="IRG" badge={<RhChip tone="brand">{formatDa(out.slip.summary.irg_amount)}</RhChip>}>
      <SimRow
        label="Option"
        changed={s.irg.option !== initial.irg.option}
        onReset={() => set({ irg: { ...s.irg, option: initial.irg.option } })}
      >
        <select
          className={simSelectClass}
          value={s.irg.option}
          onChange={(e) => set({ irg: { ...s.irg, option: e.target.value as Scenario["irg"]["option"] } })}
        >
          {(["AUTO", ...IRG_MANUAL_OPTIONS] as const).map((o) => (
            <option key={o} value={o}>
              {IRG_OPTION_LABELS[o]}
            </option>
          ))}
        </select>
      </SimRow>
      {usesZone ? (
        <>
          <SimRow
            label="Catégorie du contribuable"
            changed={s.irgCategory !== initial.irgCategory}
            onReset={() => set({ irgCategory: initial.irgCategory })}
          >
            <select className={simSelectClass} value={s.irgCategory} onChange={(e) => set({ irgCategory: e.target.value })}>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABELS[c] ?? c}
                </option>
              ))}
            </select>
          </SimRow>
          <SimRow
            label="Zone"
            changed={s.irg.zone !== initial.irg.zone}
            onReset={() => set({ irg: { ...s.irg, zone: initial.irg.zone } })}
          >
            <select className={simSelectClass} value={s.irg.zone} onChange={(e) => set({ irg: { ...s.irg, zone: e.target.value } })}>
              {!data.zones.some((z) => z.code === s.irg.zone) ? <option value={s.irg.zone}>{s.irg.zone}</option> : null}
              {data.zones.map((z) => (
                <option key={z.code} value={z.code}>
                  {z.label_fr}
                </option>
              ))}
            </select>
          </SimRow>
          {zone?.rate_var_key ? (
            <PctField
              label={`Abattement zone (${zone.applies_to === "BASE" ? "sur la base" : "sur l'impôt"})`}
              value={s.vars[zone.rate_var_key] ?? 0}
              initial={initial.vars[zone.rate_var_key] ?? 0}
              onChange={(v) => setVar(zone.rate_var_key!, v)}
            />
          ) : null}
        </>
      ) : null}
      {s.irg.option === "FIXED_RATE" ? (
        <SimRow
          label="Taux libératoire"
          changed={s.irg.fixedRate !== initial.irg.fixedRate}
          onReset={() => set({ irg: { ...s.irg, fixedRate: initial.irg.fixedRate } })}
        >
          <select
            className={simSelectClass}
            value={s.irg.fixedRate}
            onChange={(e) => set({ irg: { ...s.irg, fixedRate: Number(e.target.value) } })}
          >
            {FIXED_IRG_RATES.map((r) => (
              <option key={r} value={r}>
                {Math.round(r * 100)} %
              </option>
            ))}
          </select>
        </SimRow>
      ) : null}
      <dl className="mt-2 space-y-0.5 rounded-lg bg-surface-muted/60 px-2.5 py-2 text-xs">
        {stepRows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-2 tabular-nums">
            <dt className="text-foreground/60">{k}</dt>
            <dd className="font-medium">{v}</dd>
          </div>
        ))}
        <div className="flex justify-between gap-2 border-t border-border/60 pt-1 font-semibold tabular-nums">
          <dt>IRG retenu</dt>
          <dd>{formatDa(out.slip.summary.irg_amount)}</dd>
        </div>
      </dl>
    </SimGroup>
  );
}

function BaremeGroup({ s, initial, set }: GroupProps) {
  const changed = !same(s.brackets, initial.brackets);
  const update = (index: number, patch: Partial<Scenario["brackets"][number]>) =>
    set({ brackets: s.brackets.map((b, i) => (i === index ? { ...b, ...patch } : b)) });
  return (
    <SimGroup
      title="Barème IRG (annuel)"
      defaultOpen={false}
      badge={changed ? <ResetButton label="le barème" onClick={() => set({ brackets: structuredClone(initial.brackets) })} /> : null}
    >
      <div className="space-y-1">
        <div className="grid grid-cols-[1fr_1fr_4.5rem_1.25rem] gap-1 text-[11px] text-foreground/50">
          <span>De</span>
          <span>À</span>
          <span>Taux %</span>
          <span />
        </div>
        {s.brackets.map((b, i) => (
          <div key={i} className="grid grid-cols-[1fr_1fr_4.5rem_1.25rem] items-center gap-1">
            <NumInput value={b.min_annual} onChange={(v) => update(i, { min_annual: v })} decimals={0} ariaLabel="De" />
            {b.max_annual == null ? (
              <span className="text-center text-xs text-foreground/50">et +</span>
            ) : (
              <NumInput value={b.max_annual} onChange={(v) => update(i, { max_annual: v })} decimals={0} ariaLabel="À" />
            )}
            <NumInput
              value={Math.round(b.rate * 10000) / 100}
              onChange={(v) => update(i, { rate: v / 100 })}
              ariaLabel="Taux"
            />
            <button
              type="button"
              aria-label="Supprimer la tranche"
              className="text-xs text-foreground/40 hover:text-red-600"
              onClick={() => set({ brackets: s.brackets.filter((_, j) => j !== i) })}
            >
              ✕
            </button>
          </div>
        ))}
        <button
          type="button"
          className="mt-1 text-xs font-medium text-brand hover:underline"
          onClick={() => {
            const last = s.brackets[s.brackets.length - 1];
            set({
              brackets: [
                ...s.brackets.map((b, i) =>
                  i === s.brackets.length - 1 && b.max_annual == null ? { ...b, max_annual: b.min_annual + 240000 } : b,
                ),
                { min_annual: last ? (last.max_annual ?? last.min_annual + 240000) + 1 : 0, max_annual: null, rate: last?.rate ?? 0 },
              ],
            });
          }}
        >
          + Ajouter une tranche
        </button>
      </div>
    </SimGroup>
  );
}

function RulesGroup({ s, initial, set, category }: GroupProps & { category: string }) {
  const cat = s.rules[category] ? category : "STANDARD";
  const rules = s.rules[cat] ?? [];
  const initialRules = initial.rules[cat] ?? [];
  const setParam = (kind: string, key: string, value: number) =>
    set({
      rules: {
        ...s.rules,
        [cat]: rules.map((r) => (r.kind === kind ? { ...r, params: { ...r.params, [key]: value } } : r)),
      },
    });
  const field = (kind: string, key: string, label: string, pct = false) => {
    const rule = ruleOf(rules, kind);
    if (!rule) return null;
    const value = paramNum(rule, key);
    const init = paramNum(ruleOf(initialRules, kind), key);
    return pct ? (
      <PctField key={`${kind}.${key}`} label={label} value={value} initial={init} onChange={(v) => setParam(kind, key, v)} />
    ) : (
      <NumField key={`${kind}.${key}`} label={label} value={value} initial={init} onChange={(v) => setParam(kind, key, v)} suffix="DA" />
    );
  };
  const lissage = ruleOf(rules, "LISSAGE");
  return (
    <SimGroup title={`Règles IRG · ${CATEGORY_LABELS[cat] ?? cat}`} defaultOpen={false}>
      {!rules.length ? <p className="text-xs text-foreground/55">Aucune règle pour cette catégorie.</p> : null}
      {field("EXEMPTION_THRESHOLD", "monthly_max", "Exonération jusqu'à")}
      {field("ABATEMENT_ON_TAX", "rate", "Abattement (taux)", true)}
      {field("ABATEMENT_ON_TAX", "min_monthly", "Abattement minimum")}
      {field("ABATEMENT_ON_TAX", "max_monthly", "Abattement maximum")}
      {field("LISSAGE", "monthly_min", "Lissage à partir de")}
      {field("LISSAGE", "monthly_max", "Lissage jusqu'à")}
      {lissage?.formula ? (
        <p className="mt-1 break-all rounded-md bg-surface-muted/60 px-2 py-1 font-mono text-[11px] text-foreground/60">
          {lissage.formula}
        </p>
      ) : null}
    </SimGroup>
  );
}

function RubriquesPanel({
  data,
  s,
  initial,
  set,
  out,
}: GroupProps & { data: SimulatorData; out: ReturnType<typeof runScenario> }) {
  const [open, setOpen] = useState(true);
  const [toAdd, setToAdd] = useState("");
  const byId = new Map(data.rubriques.map((r) => [r.id, r]));
  const amountOf = (rubriqueId: string, exception = false) =>
    out.slip.lines
      .filter((l) => l.rubrique_id === rubriqueId && (exception ? l.exception_id != null : l.exception_id == null))
      .reduce((sum, l) => sum + l.amount, 0);
  const initialByKey = new Map(initial.rubriques.map((r) => [r.key, r]));
  const used = new Set(s.rubriques.map((r) => r.rubrique_id));
  const addable = data.rubriques
    .filter((r) => !used.has(r.id))
    .sort((a, b) => a.code.localeCompare(b.code, "fr", { numeric: true }));
  const updateRub = (key: string, patch: Partial<Scenario["rubriques"][number]>) =>
    set({ rubriques: s.rubriques.map((r) => (r.key === key ? { ...r, ...patch } : r)) });
  const updateExc = (id: string, patch: Partial<Scenario["exceptions"][number]>) =>
    set({ exceptions: s.exceptions.map((e) => (e.id === id ? { ...e, ...patch } : e)) });
  const subject = data.subject;
  const extraLines = out.slip.lines.filter((l) => l.rubrique_id == null && l.source_code !== "base");
  const changed = !same(s.rubriques, initial.rubriques) || !same(s.exceptions, initial.exceptions);

  const row = (key: string, cells: ReactNode) => (
    <tr key={key} className="border-t border-border/50">
      {cells}
    </tr>
  );

  return (
    <section className="rounded-2xl border border-border/70 bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5">
        <button type="button" className="flex items-center gap-2 text-sm font-semibold" onClick={() => setOpen((v) => !v)}>
          <span className="h-3.5 w-1 rounded-full bg-brand" />
          Rubriques
          <span className="text-xs font-normal text-foreground/50">
            {s.rubriques.filter((r) => r.enabled).length} actives · {s.exceptions.filter((e) => e.enabled).length} exceptions
          </span>
          <span className={`text-foreground/40 transition ${open ? "rotate-90" : ""}`}>›</span>
        </button>
        <div className="flex flex-wrap items-center gap-2">
          {changed ? (
            <Button
              variant="ghost"
              className="h-8 px-3 text-xs"
              onClick={() => set({ rubriques: structuredClone(initial.rubriques), exceptions: structuredClone(initial.exceptions) })}
            >
              Rétablir les rubriques
            </Button>
          ) : null}
          <select className={`${simSelectClass} w-64`} value={toAdd} onChange={(e) => setToAdd(e.target.value)}>
            <option value="">Ajouter une rubrique…</option>
            {addable.map((r) => (
              <option key={r.id} value={r.id}>
                {r.code} · {r.label_fr} (classe {r.category})
              </option>
            ))}
          </select>
          <Button
            variant="secondary"
            className="h-8 px-3 text-xs"
            disabled={!toAdd}
            onClick={() => {
              const rub = byId.get(toAdd);
              if (!rub) return;
              set({
                rubriques: [
                  ...s.rubriques,
                  { key: newRubricKey(), rubrique_id: rub.id, amount: 0, unit: rub.unit, source: "added", enabled: true },
                ],
              });
              setToAdd("");
            }}
          >
            Ajouter
          </Button>
        </div>
      </div>
      {open ? (
        <div className="max-h-[18rem] overflow-y-auto border-t border-border/60">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-surface text-[11px] uppercase tracking-[0.06em] text-foreground/45">
              <tr>
                <th className="w-10 px-3 py-2 text-left">Actif</th>
                <th className="px-2 py-2 text-left">Rubrique</th>
                <th className="px-2 py-2 text-left">Classe</th>
                <th className="px-2 py-2 text-left">Source</th>
                <th className="w-36 px-2 py-2 text-left">Mode</th>
                <th className="w-32 px-2 py-2 text-right">Valeur</th>
                <th className="w-32 px-3 py-2 text-right">Montant</th>
              </tr>
            </thead>
            <tbody>
              {s.rubriques.length === 0 && s.exceptions.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-4 text-center text-xs text-foreground/50">
                    Aucune rubrique. Ajoutez-en depuis le catalogue.
                  </td>
                </tr>
              ) : null}
              {s.rubriques.map((r) => {
                const rub = byId.get(r.rubrique_id);
                const init = initialByKey.get(r.key);
                const modified = !init || !same({ ...init }, { ...r });
                return row(
                  r.key,
                  <>
                    <td className="px-3 py-1.5">
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-brand"
                        checked={r.enabled}
                        onChange={(e) => updateRub(r.key, { enabled: e.target.checked })}
                        aria-label={`Activer ${rub?.code ?? ""}`}
                      />
                    </td>
                    <td className={`px-2 py-1.5 ${r.enabled ? "" : "text-foreground/40 line-through"}`}>
                      <span className="flex items-center gap-1.5">
                        {modified ? <span className="h-1.5 w-1.5 rounded-full bg-amber-500" /> : null}
                        <span className="font-mono text-xs text-foreground/60">{rub?.code}</span> {rub?.label_fr}
                        {init && modified ? <ResetButton label={rub?.code ?? ""} onClick={() => updateRub(r.key, init)} /> : null}
                      </span>
                    </td>
                    <td className="px-2 py-1.5 text-xs">{rub?.category === RETENUE_CATEGORY ? "5 · retenue" : rub?.category}</td>
                    <td className="px-2 py-1.5 text-xs text-foreground/60">
                      {r.source === "added" ? (
                        <button
                          type="button"
                          className="text-red-600 hover:underline"
                          onClick={() => set({ rubriques: s.rubriques.filter((x) => x.key !== r.key) })}
                        >
                          ajoutée · retirer
                        </button>
                      ) : (
                        r.source
                      )}
                    </td>
                    <td className="px-2 py-1.5">
                      <select
                        className={simSelectClass}
                        value={r.unit}
                        onChange={(e) => updateRub(r.key, { unit: e.target.value as SalaryUnit })}
                      >
                        {(Object.keys(UNIT_LABELS) as SalaryUnit[]).map((u) => (
                          <option key={u} value={u}>
                            {UNIT_LABELS[u]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-2 py-1.5">
                      <NumInput value={r.amount} onChange={(v) => updateRub(r.key, { amount: v })} ariaLabel="Valeur" />
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{r.enabled ? formatDa(amountOf(r.rubrique_id)) : "—"}</td>
                  </>,
                );
              })}
              {s.exceptions.map((e) => {
                const rub = byId.get(e.rubrique_id);
                return row(
                  `exc-${e.id}`,
                  <>
                    <td className="px-3 py-1.5">
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-brand"
                        checked={e.enabled}
                        onChange={(ev) => updateExc(e.id, { enabled: ev.target.checked })}
                        aria-label="Activer l'exception"
                      />
                    </td>
                    <td className={`px-2 py-1.5 ${e.enabled ? "" : "text-foreground/40 line-through"}`}>
                      <span className="font-mono text-xs text-foreground/60">{rub?.code}</span> {rub?.label_fr}
                    </td>
                    <td className="px-2 py-1.5 text-xs">{rub?.category}</td>
                    <td className="px-2 py-1.5 text-xs text-foreground/60">exception</td>
                    <td className="px-2 py-1.5 text-xs text-foreground/60">{UNIT_LABELS[e.unit ?? rub?.unit ?? "month"]}</td>
                    <td className="px-2 py-1.5">
                      <NumInput value={e.amount} onChange={(v) => updateExc(e.id, { amount: v })} ariaLabel="Valeur" />
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{e.enabled ? formatDa(amountOf(e.rubrique_id, true)) : "—"}</td>
                  </>,
                );
              })}
              {extraLines.map((l, i) =>
                row(
                  `extra-${l.code}-${i}`,
                  <>
                    <td className="px-3 py-1.5" />
                    <td className="px-2 py-1.5">
                      <span className="font-mono text-xs text-foreground/60">{l.code}</span> {l.label_fr}
                    </td>
                    <td className="px-2 py-1.5 text-xs">{l.category}</td>
                    <td className="px-2 py-1.5 text-xs text-foreground/60">{l.source_code}</td>
                    <td className="px-2 py-1.5 text-xs text-foreground/50" colSpan={2}>
                      calculée automatiquement
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{formatDa(l.amount)}</td>
                  </>,
                ),
              )}
            </tbody>
          </table>
          {subject && (subject.advances.length > 0 || subject.exit_lines) ? (
            <div className="flex flex-wrap gap-4 border-t border-border/60 px-3 py-2">
              {subject.advances.length > 0 ? (
                <div className="w-64">
                  <ToggleField
                    label={`Avances / prêts (${subject.advances.length})`}
                    value={s.advances}
                    initial={initial.advances}
                    onChange={(v) => set({ advances: v })}
                  />
                </div>
              ) : null}
              {subject.exit_lines ? (
                <div className="w-64">
                  <ToggleField label="Solde de sortie" value={s.exit} initial={initial.exit} onChange={(v) => set({ exit: v })} />
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
