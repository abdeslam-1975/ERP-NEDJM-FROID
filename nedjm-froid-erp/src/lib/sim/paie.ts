import { bulletinDocData, slipToBulletin } from "@/components/rh/bulletin-print";
import { renderTemplate } from "@/lib/doc/engine";
import { OVERTIME_COLUMNS } from "@/lib/hr/attendance-columns";
import {
  accumulateAttendanceMovements,
  emptyMovements,
  type AttendanceMovements,
} from "@/lib/hr/attendance-movements";
import { bulletinRatesFromVars, type HrBulletinSettings } from "@/lib/hr/bulletin-settings";
import { DISABLED_IRG_CATEGORY, FIXED_IRG_RATES, IRG_MANUAL_OPTIONS } from "@/lib/hr/compliance";
import type { IrgRule } from "@/lib/hr/irg-calc";
import type { SettlementLine } from "@/lib/hr/leave";
import { coveredDaysInPeriod } from "@/lib/hr/payroll-calc";
import {
  cnasForRegime,
  initialScenario,
  newRubricKey,
  periodBounds,
  runScenario,
  scenarioFigures,
  type Scenario,
  type ScenarioOutput,
} from "@/lib/hr/payroll-simulator";
import type { SimulatorData } from "@/lib/hr/payroll-simulator-load";
import {
  trackedRecord,
  type SimContext,
  type SimEnv,
  type SimFigure,
  type SimOption,
  type SimOutput,
  type SimVarDef,
} from "@/lib/sim/core";

export const BULLETIN_PAGE_WIDTH = 820;

const G = {
  contract: "Contrat de travail",
  days: "Jours & pointage",
  pointage: "Pointage (jours du mois)",
  overtime: "Heures supplémentaires",
  cnas: "CNAS & cotisations",
  irg: "IRG",
  bareme: "Barème IRG",
  rules: "Règles IRG",
  rubriques: "Rubriques",
  exceptions: "Exceptions de paie",
  other: "Avances & sortie",
  legal: "Variables légales",
};

const UNIT_OPTIONS: SimOption[] = [
  { value: "month", label: "Mensuel" },
  { value: "day", label: "/ jour payé" },
  { value: "presence_day", label: "/ jour présence" },
  { value: "month_days", label: "Mensuel ÷ jours du mois" },
  { value: "percent", label: "% du base" },
];

const IRG_OPTION_LABELS: Record<string, string> = {
  AUTO: "Automatique (catégorie + zone)",
  BAREME: "Barème général",
  ZONE: "Zone (abattement)",
  HANDICAP: "Handicapé / retraité",
  EXEMPT: "Exonéré",
  FIXED_RATE: "Taux libératoire",
};

const CATEGORY_LABELS: Record<string, string> = {
  STANDARD: "Standard",
  [DISABLED_IRG_CATEGORY]: "Handicapé / retraité",
};

const RULE_PARAM_LABELS: Record<string, string> = {
  "EXEMPTION_THRESHOLD.monthly_max": "Exonération jusqu'à",
  "ABATEMENT_ON_TAX.rate": "Abattement (taux)",
  "ABATEMENT_ON_TAX.min_monthly": "Abattement minimum",
  "ABATEMENT_ON_TAX.max_monthly": "Abattement maximum",
  "LISSAGE.monthly_min": "Lissage à partir de",
  "LISSAGE.monthly_max": "Lissage jusqu'à",
};

const LEGAL_LABELS: Record<string, string> = {
  SNMG: "SNMG",
  NJM_DIVISEUR_FIXED: "Diviseur journalier",
  HEURES_MENSUELLES: "Heures mensuelles",
  CACOBATPH_CONGES: "CACOBATPH congés payés",
  CACOBATPH_INTEMPERIES_SAL: "Intempéries salarié",
  CACOBATPH_INTEMPERIES_EMP: "Intempéries employeur",
  CNAS_EMPLOYEE: "CNAS part salariale (légale)",
  CNAS_EMPLOYER_BASE: "CNAS part patronale (légale)",
  CNAS_FOS: "FOS œuvres sociales (légal)",
  CONGE_JOURS_MOIS: "Congé acquis par mois (jours)",
};

const MOVEMENT_VARS: { key: Exclude<keyof AttendanceMovements, "days_by_code">; id: string; label: string }[] = [
  { key: "days_paid", id: "pointage.jours_payes", label: "Jours payés (pointage)" },
  { key: "days_presence_qty", id: "pointage.jours_presence", label: "Jours de présence" },
  { key: "days_worked", id: "pointage.jours_travailles", label: "Jours travaillés" },
  { key: "days_leave", id: "pointage.jours_conge", label: "Jours de congé" },
  { key: "days_absence", id: "pointage.jours_absence", label: "Jours d'absence" },
  { key: "days_weekend", id: "pointage.jours_weekend", label: "Week-ends / fériés" },
  { key: "days_abandon", id: "pointage.jours_abandon", label: "Abandon de poste" },
  { key: "days_rappel", id: "pointage.jours_rappel", label: "Rappels" },
];

const ANNUAL_LEAVE_ID = "pointage.conge_annuel";
const COVERED_ID = "paie.jours_couverts";

function legalKind(data: SimulatorData, key: string): SimVarDef["kind"] {
  const rateKeys = new Set<string>([
    ...OVERTIME_COLUMNS.map((c) => c.rateKey),
    ...data.contribution_defs.map((d) => d.key),
    ...data.zones.flatMap((z) => (z.rate_var_key ? [z.rate_var_key] : [])),
  ]);
  if (rateKeys.has(key) || /^(CNAS_|CACOBATPH_)|(_TAUX|_RATE|_PCT)$/.test(key)) return "percent";
  return key === "SNMG" ? "money" : "number";
}

function legalLabel(data: SimulatorData, key: string) {
  const def = data.contribution_defs.find((d) => d.key === key);
  if (def) return `${def.code} · ${def.label_fr}`;
  const ot = OVERTIME_COLUMNS.find((c) => c.rateKey === key);
  if (ot) return `Majoration ${ot.code}`;
  return LEGAL_LABELS[key] ?? key;
}

export function contractKey(data: SimulatorData) {
  return data.subject?.contract.id ?? "sim";
}

type DayVar = { id: string; date: string; base: string; site_id: string | null };

function dayVars(data: SimulatorData): DayVar[] {
  const subject = data.subject;
  if (!subject) return [];
  const { start, days } = periodBounds(data.year, data.month);
  const prefix = start.slice(0, 8);
  const byDate = new Map<string, typeof subject.attendance_days>();
  for (const cell of subject.attendance_days) {
    const list = byDate.get(cell.work_date) ?? [];
    list.push(cell);
    byDate.set(cell.work_date, list);
  }
  const out: DayVar[] = [];
  for (let d = 1; d <= days; d += 1) {
    const date = `${prefix}${String(d).padStart(2, "0")}`;
    const cells = byDate.get(date) ?? [];
    if (!cells.length) out.push({ id: `pointage.${date}`, date, base: "", site_id: null });
    cells.forEach((cell, i) =>
      out.push({
        id: i === 0 ? `pointage.${date}` : `pointage.${date}~${i + 1}`,
        date,
        base: cell.legend_code,
        site_id: cell.site_id,
      }),
    );
  }
  return out;
}

export function legendOptions(data: SimulatorData): SimOption[] {
  return [
    { value: "", label: "— non pointé" },
    ...[...data.legends]
      .sort((a, b) => a.code.localeCompare(b.code))
      .map((l) => ({ value: l.code, label: `${l.code} · ${l.label_fr} (×${l.coefficient})` })),
  ];
}

function frDate(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

/** Every value the payslip depends on, with the ERP value as base. */
export function paieVariables(data: SimulatorData): SimVarDef[] {
  const init = initialScenario(data);
  const subject = data.subject;
  const k = contractKey(data);
  const { days } = periodBounds(data.year, data.month);
  const defs: SimVarDef[] = [];
  const add = (d: SimVarDef) => defs.push(d);

  add({ id: `contrat.${k}.salaire_base`, label: "Salaire de base", group: G.contract, kind: "money", base: init.contract.base, keywords: "base salaire mensuel" });
  add({ id: `contrat.${k}.net_reference`, label: "Net de référence du contrat", group: G.contract, kind: "money", base: init.contract.netRef });
  add({ id: `contrat.${k}.date_debut`, label: "Date de début du contrat", group: G.contract, kind: "date", base: init.contract.startDate });
  add({ id: `contrat.${k}.date_fin`, label: "Date de fin du contrat", group: G.contract, kind: "date", base: init.contract.endDate ?? "" });
  add({
    id: COVERED_ID,
    label: "Jours de contrat dans le mois",
    group: G.days,
    kind: "days",
    base: init.days.covered,
    derived: Boolean(subject),
    hint: `sur ${days} jours calendaires`,
  });

  if (subject) {
    const mov = subject.movements;
    for (const m of MOVEMENT_VARS) {
      add({ id: m.id, label: m.label, group: G.days, kind: "days", base: mov[m.key], derived: true });
    }
    add({ id: ANNUAL_LEAVE_ID, label: "Congé annuel (CA) pointé", group: G.days, kind: "days", base: init.days.annualLeave, derived: true, hint: "exclu si payé par la CACOBATPH" });
    const options = legendOptions(data);
    for (const v of dayVars(data)) {
      add({
        id: v.id,
        label: `Pointage du ${frDate(v.date)}${v.id.includes("~") ? ` (${v.id.split("~")[1]})` : ""}`,
        group: G.pointage,
        kind: "select",
        base: v.base,
        options,
        keywords: `jour ${v.date}`,
      });
    }
  } else {
    add({ id: "pointage.jours_payes", label: "Jours payés", group: G.days, kind: "days", base: init.days.paid });
    add({ id: "pointage.jours_presence", label: "Jours de présence", group: G.days, kind: "days", base: init.days.presence });
    add({ id: ANNUAL_LEAVE_ID, label: "Congé annuel (CA)", group: G.days, kind: "days", base: init.days.annualLeave });
  }

  for (const c of OVERTIME_COLUMNS) {
    add({ id: `hs.${c.code}`, label: `Heures ${c.code}`, group: G.overtime, kind: "hours", base: init.overtime[c.code] ?? 0 });
  }

  const regimeOptions = data.regimes.map((r) => ({ value: r.code, label: r.label_fr }));
  if (!regimeOptions.some((o) => o.value === init.cnas.regime)) regimeOptions.unshift({ value: init.cnas.regime, label: init.cnas.regime });
  add({ id: "cnas.regime", label: "Régime CNAS", group: G.cnas, kind: "select", base: init.cnas.regime, options: regimeOptions });
  add({ id: "cnas.part_salariale", label: "CNAS part salariale", group: G.cnas, kind: "percent", base: init.cnas.employee, derived: true });
  add({ id: "cnas.part_patronale", label: "CNAS part patronale", group: G.cnas, kind: "percent", base: init.cnas.employer, derived: true });
  add({ id: "cnas.fos", label: "FOS (œuvres sociales)", group: G.cnas, kind: "percent", base: init.cnas.fos, derived: true });
  add({ id: "caco.conges", label: "CACOBATPH congés applicable", group: G.cnas, kind: "toggle", base: init.caco.conges });
  add({ id: "caco.intemperies", label: "CACOBATPH intempéries applicable", group: G.cnas, kind: "toggle", base: init.caco.intemperies });

  add({
    id: "irg.option",
    label: "Option IRG",
    group: G.irg,
    kind: "select",
    base: init.irg.option,
    options: (["AUTO", ...IRG_MANUAL_OPTIONS] as string[]).map((o) => ({ value: o, label: IRG_OPTION_LABELS[o] ?? o })),
  });
  const categories = [...new Set(["STANDARD", DISABLED_IRG_CATEGORY, init.irgCategory, ...Object.keys(data.rules_by_category)])];
  add({
    id: "irg.categorie",
    label: "Catégorie du contribuable",
    group: G.irg,
    kind: "select",
    base: init.irgCategory,
    options: categories.map((c) => ({ value: c, label: CATEGORY_LABELS[c] ?? c })),
  });
  const zoneOptions = data.zones.map((z) => ({ value: z.code, label: z.label_fr }));
  if (!zoneOptions.some((o) => o.value === init.irg.zone)) zoneOptions.unshift({ value: init.irg.zone, label: init.irg.zone });
  add({ id: "irg.zone", label: "Zone IRG", group: G.irg, kind: "select", base: init.irg.zone, options: zoneOptions });
  const rates = [...new Set([...FIXED_IRG_RATES, init.irg.fixedRate])];
  add({
    id: "irg.taux_liberatoire",
    label: "Taux libératoire",
    group: G.irg,
    kind: "select",
    base: String(init.irg.fixedRate),
    options: rates.map((r) => ({ value: String(r), label: `${Math.round(r * 100)} %` })),
  });

  init.brackets.forEach((b, i) => {
    const n = i + 1;
    add({ id: `irg.bareme.${i}.de`, label: `Tranche ${n} · de (annuel)`, group: G.bareme, kind: "money", base: b.min_annual, official: true });
    if (b.max_annual != null) {
      add({ id: `irg.bareme.${i}.a`, label: `Tranche ${n} · à (annuel)`, group: G.bareme, kind: "money", base: b.max_annual, official: true });
    }
    add({ id: `irg.bareme.${i}.taux`, label: `Tranche ${n} · taux`, group: G.bareme, kind: "percent", base: b.rate, official: true });
  });

  for (const [cat, rules] of Object.entries(data.rules_by_category)) {
    for (const rule of rules) {
      for (const [param, raw] of Object.entries(rule.params)) {
        const n = typeof raw === "number" ? raw : Number(raw);
        if (!Number.isFinite(n)) continue;
        add({
          id: `irg.regle.${cat}.${rule.kind}.${param}`,
          label: `${CATEGORY_LABELS[cat] ?? cat} · ${RULE_PARAM_LABELS[`${rule.kind}.${param}`] ?? `${rule.kind} ${param}`}`,
          group: G.rules,
          kind: param === "rate" ? "percent" : "money",
          base: n,
          official: true,
        });
      }
    }
  }

  const initialByRub = new Map(init.rubriques.map((r) => [r.rubrique_id, r]));
  for (const rub of [...data.rubriques].sort((a, b) => a.code.localeCompare(b.code, "fr", { numeric: true }))) {
    const line = initialByRub.get(rub.id);
    const name = `${rub.code} · ${rub.label_fr}`;
    const keywords = `${rub.label_ar} ${rub.nature} classe ${rub.category}`;
    add({ id: `rubrique.${rub.id}.actif`, label: `${name} · active`, group: G.rubriques, kind: "toggle", base: Boolean(line), keywords, hint: line ? `source : ${line.source}` : "non affectée" });
    add({ id: `rubrique.${rub.id}.valeur`, label: `${name} · valeur`, group: G.rubriques, kind: "number", base: line?.amount ?? 0, keywords });
    add({ id: `rubrique.${rub.id}.mode`, label: `${name} · mode`, group: G.rubriques, kind: "select", base: line?.unit ?? rub.unit, options: UNIT_OPTIONS, keywords });
  }

  const rubById = new Map(data.rubriques.map((r) => [r.id, r]));
  for (const e of init.exceptions) {
    const rub = rubById.get(e.rubrique_id);
    const name = `Exception ${rub?.code ?? ""} · ${rub?.label_fr ?? ""}`.trim();
    add({ id: `exception.${e.id}.actif`, label: `${name} · active`, group: G.exceptions, kind: "toggle", base: true });
    add({ id: `exception.${e.id}.valeur`, label: `${name} · valeur`, group: G.exceptions, kind: "number", base: e.amount });
  }

  if (subject?.advances.length) {
    add({ id: "paie.avances", label: `Retenues d'avances / prêts (${subject.advances.length})`, group: G.other, kind: "toggle", base: init.advances });
  }
  if (subject?.exit_lines) {
    add({ id: "paie.solde_sortie", label: "Solde de sortie du mois", group: G.other, kind: "toggle", base: init.exit });
  }

  for (const key of Object.keys(data.legal_vars).sort()) {
    add({
      id: `legal.${key}`,
      label: legalLabel(data, key),
      group: G.legal,
      kind: legalKind(data, key),
      base: data.legal_vars[key],
      official: true,
      keywords: key,
    });
  }
  return defs;
}

function movementsFromCtx(data: SimulatorData, ctx: SimContext, days: DayVar[]): AttendanceMovements {
  const cells = days.flatMap((d) => {
    const code = ctx.str(d.id).trim();
    return code ? [{ employee_id: "sim", legend_code: code, site_id: d.site_id }] : [];
  });
  return accumulateAttendanceMovements(cells, data.legends).get("sim") ?? emptyMovements();
}

function annualLeaveFromCtx(ctx: SimContext, days: DayVar[]) {
  return days.filter((d) => ctx.str(d.id).trim().toUpperCase() === "CA").length;
}

/** Contract days and pointage counts of the month, from the day codes unless forced. */
export function paieDaysFromCtx(data: SimulatorData, ctx: SimContext, init: Scenario = initialScenario(data)) {
  const subject = data.subject;
  const k = contractKey(data);
  const period = periodBounds(data.year, data.month);
  const covered = subject
    ? ctx.deriveNum(COVERED_ID, () => {
        const start = ctx.str(`contrat.${k}.date_debut`);
        const end = ctx.str(`contrat.${k}.date_fin`) || null;
        if (start === init.contract.startDate && end === init.contract.endDate) return init.days.covered;
        return start ? coveredDaysInPeriod(start, end, period.start, period.end) : 0;
      })
    : ctx.num(COVERED_ID);

  let movements: AttendanceMovements | undefined;
  let paid: number;
  let presence: number;
  let annualLeave: number;
  if (subject) {
    const days = dayVars(data);
    const counts = { days_by_code: movementsFromCtx(data, ctx, days).days_by_code } as AttendanceMovements;
    for (const m of MOVEMENT_VARS) {
      counts[m.key] = ctx.deriveNum(m.id, () => movementsFromCtx(data, ctx, days)[m.key]);
    }
    movements = counts;
    paid = counts.days_paid;
    presence = counts.days_presence_qty;
    annualLeave = ctx.deriveNum(ANNUAL_LEAVE_ID, () => annualLeaveFromCtx(ctx, days));
  } else {
    paid = ctx.num("pointage.jours_payes");
    presence = ctx.num("pointage.jours_presence");
    annualLeave = ctx.num(ANNUAL_LEAVE_ID);
  }
  return { covered, paid, presence, annualLeave, movements };
}

/** Payroll scenario rebuilt from the variables (same shape the payroll run computes). */
export function paieScenarioFromCtx(
  data: SimulatorData,
  ctx: SimContext,
  opts: { exitLines?: SettlementLine[] } = {},
): { scenario: Scenario; data: SimulatorData } {
  const init = initialScenario(data);
  const subject = data.subject;
  const k = contractKey(data);
  const legal = trackedRecord(ctx, "legal.", Object.keys(data.legal_vars));
  const { covered, paid, presence, annualLeave, movements } = paieDaysFromCtx(data, ctx, init);

  const regime = ctx.str("cnas.regime", init.cnas.regime);
  const cnasRate = (id: string, key: "employee" | "employer" | "fos") =>
    ctx.deriveNum(id, () => cnasForRegime(data, legal as Record<string, number>, regime)[key]);

  const brackets = init.brackets.map((b, i) => ({
    min_annual: ctx.num(`irg.bareme.${i}.de`),
    max_annual: b.max_annual == null ? null : ctx.num(`irg.bareme.${i}.a`),
    rate: ctx.num(`irg.bareme.${i}.taux`),
  }));

  const ruleCache = new Map<string, IrgRule[]>();
  const rulesFor = (cat: string) => {
    const cached = ruleCache.get(cat);
    if (cached) return cached;
    const built = (data.rules_by_category[cat] ?? []).map((rule) => {
      const params: Record<string, unknown> = { ...rule.params };
      for (const [param, raw] of Object.entries(rule.params)) {
        const n = typeof raw === "number" ? raw : Number(raw);
        if (Number.isFinite(n)) params[param] = ctx.num(`irg.regle.${cat}.${rule.kind}.${param}`, n);
      }
      return { ...rule, params };
    });
    ruleCache.set(cat, built);
    return built;
  };
  const rules = new Proxy({} as Record<string, IrgRule[]>, {
    get: (_t, prop) => (typeof prop === "string" && Object.hasOwn(data.rules_by_category, prop) ? rulesFor(prop) : undefined),
    has: (_t, prop) => typeof prop === "string" && Object.hasOwn(data.rules_by_category, prop),
    ownKeys: () => Object.keys(data.rules_by_category),
    getOwnPropertyDescriptor: (_t, prop) =>
      typeof prop === "string" && Object.hasOwn(data.rules_by_category, prop)
        ? { enumerable: true, configurable: true, writable: false, value: rulesFor(prop) }
        : undefined,
  });

  const initialByRub = new Map(init.rubriques.map((r) => [r.rubrique_id, r]));
  const ordered = [
    ...init.rubriques.map((r) => r.rubrique_id),
    ...data.rubriques.filter((r) => !initialByRub.has(r.id)).map((r) => r.id),
  ];
  const rubById = new Map(data.rubriques.map((r) => [r.id, r]));
  const rubriques: Scenario["rubriques"] = [];
  for (const id of ordered) {
    if (!ctx.bool(`rubrique.${id}.actif`)) continue;
    const line = initialByRub.get(id);
    rubriques.push({
      key: line?.key ?? newRubricKey(),
      rubrique_id: id,
      amount: ctx.num(`rubrique.${id}.valeur`),
      unit: ctx.str(`rubrique.${id}.mode`, line?.unit ?? rubById.get(id)?.unit ?? "month") as Scenario["rubriques"][number]["unit"],
      source: line?.source ?? "added",
      enabled: true,
    });
  }

  const exceptions = init.exceptions.map((e) => {
    const enabled = ctx.bool(`exception.${e.id}.actif`, true);
    return { ...e, enabled, amount: enabled ? ctx.num(`exception.${e.id}.valeur`, e.amount) : e.amount };
  });

  const fixedRate = Number(ctx.str("irg.taux_liberatoire", String(init.irg.fixedRate)));
  const hasExit = opts.exitLines !== undefined;
  const effective: SimulatorData =
    hasExit && subject ? { ...data, subject: { ...subject, exit_lines: opts.exitLines ?? null } } : data;

  const scenario: Scenario = {
    vars: legal as Record<string, number>,
    brackets,
    rules,
    irg: {
      option: ctx.str("irg.option", init.irg.option) as Scenario["irg"]["option"],
      category: init.irg.category,
      zone: ctx.str("irg.zone", init.irg.zone),
      fixedRate: Number.isFinite(fixedRate) ? fixedRate : init.irg.fixedRate,
    },
    cnas: {
      regime,
      employee: cnasRate("cnas.part_salariale", "employee"),
      employer: cnasRate("cnas.part_patronale", "employer"),
      fos: cnasRate("cnas.fos", "fos"),
    },
    caco: { conges: ctx.bool("caco.conges", init.caco.conges), intemperies: ctx.bool("caco.intemperies", init.caco.intemperies) },
    contract: {
      base: ctx.num(`contrat.${k}.salaire_base`),
      netRef: ctx.num(`contrat.${k}.net_reference`),
      startDate: init.contract.startDate,
      endDate: init.contract.endDate,
    },
    days: { covered, paid, presence, annualLeave },
    irgCategory: ctx.str("irg.categorie", init.irgCategory),
    rubriques,
    exceptions,
    overtime: Object.fromEntries(OVERTIME_COLUMNS.map((c) => [c.code, ctx.num(`hs.${c.code}`)])),
    advances: subject?.advances.length ? ctx.bool("paie.avances", init.advances) : false,
    exit: hasExit ? Boolean(opts.exitLines) : subject?.exit_lines ? ctx.bool("paie.solde_sortie", init.exit) : false,
    movements,
  };
  return { scenario, data: effective };
}

export function paieFigures(out: ScenarioOutput, netRef: number): SimFigure[] {
  const f = scenarioFigures(out);
  return [
    { key: "gross", label: "Brut cotisable", value: f.gross, format: "money" },
    { key: "taxable", label: "Imposable", value: f.taxable, format: "money" },
    { key: "cnas", label: "CNAS salarié", value: f.cnas, format: "money" },
    { key: "irgBase", label: "Base IRG", value: f.irgBase, format: "money" },
    { key: "irg", label: "IRG", value: f.irg, format: "money" },
    { key: "net", label: "Net à payer", value: f.net, format: "money", emphasis: true, goodWhenUp: true },
    { key: "cost", label: "Coût employeur", value: f.cost, format: "money" },
    { key: "netGap", label: "Écart net / contrat", value: netRef > 0 ? f.net - netRef : 0, format: "money" },
  ];
}

export function runPaie(
  data: SimulatorData,
  ctx: SimContext,
  opts: { exitLines?: SettlementLine[] } = {},
): { out: ScenarioOutput; scenario: Scenario } {
  const built = paieScenarioFromCtx(data, ctx, opts);
  return { out: runScenario(built.data, built.scenario), scenario: built.scenario };
}

export function paieOutput(
  data: SimulatorData,
  settings: HrBulletinSettings,
  template: string,
  ctx: SimContext,
  env: SimEnv,
): SimOutput {
  const { out, scenario } = runPaie(data, ctx);
  const model = slipToBulletin(out.bulletin, settings, bulletinRatesFromVars(out.bulletinVars, settings), {
    brackets: scenario.brackets,
    rulesByCategory: scenario.rules,
  });
  const docData = bulletinDocData([model], env.origin);
  return {
    html: renderTemplate(template, docData),
    pageWidth: BULLETIN_PAGE_WIDTH,
    figures: paieFigures(out, scenario.contract.netRef),
    warnings: out.slip.warnings,
    doc: { type: "bulletin_paie", data: docData },
  };
}
