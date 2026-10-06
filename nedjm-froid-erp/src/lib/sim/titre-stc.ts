import { printFromKit, type PrintKit } from "@/lib/doc/print-kit";
import { companyLetterheadUrl } from "@/lib/hr/company-letterhead";
import { activeOptions, isAnnualLeave } from "@/lib/hr/hr-lists";
import { calendarDays, returnDate, suggestSettlement, type SettlementLine } from "@/lib/hr/leave";
import {
  LEAVE_TITLE_FIELD_KEYS,
  leaveTitleDocData,
  type LeaveTitleFieldKey,
  type LeaveTitleFields,
} from "@/lib/hr/leave-title";
import type { SimulatorData } from "@/lib/hr/payroll-simulator-load";
import type { SimContext, SimEnv, SimFigure, SimOutput, SimVarDef } from "@/lib/sim/core";
import { A4_PAGE_WIDTH } from "@/lib/sim/documents";
import { leaveBalanceFromCtx, leaveKindSimOptions, type LeaveSimData } from "@/lib/sim/leave";
import { runPaie } from "@/lib/sim/paie";

// ---------------------------------------------------------------------------
// Titre de congé
// ---------------------------------------------------------------------------

export type TitreSimData = {
  leave: LeaveSimData;
  /** Print fields of the title (saved on the LEAVE correspondence, or taken from the employee). */
  fields: Record<LeaveTitleFieldKey, string>;
  numero: string;
  letterhead_url: string | null;
  kit: PrintKit;
  request: { id: string; kind: string; start_date: string; end_date: string; days: number } | null;
};

const G_TITRE = "Titre de congé";
const G_TITRE_PRINT = "Titre de congé · impression";

const TITRE_PRINT_FIELDS: { key: LeaveTitleFieldKey; label: string; kind?: SimVarDef["kind"] }[] = [
  { key: "matricule", label: "Matricule" },
  { key: "nom", label: "Nom" },
  { key: "prenom", label: "Prénom" },
  { key: "affectation", label: "Affectation" },
  { key: "poste", label: "Fonction" },
  { key: "moyen", label: "Moyen de transport" },
  { key: "pieceType", label: "Pièce d'identité · type" },
  { key: "pieceNum", label: "Pièce d'identité · numéro" },
  { key: "donneur", label: "Établi par" },
  { key: "faitA", label: "Fait à" },
  { key: "dateDoc", label: "Date du document", kind: "date" },
];

export function titreDefaults(d: TitreSimData) {
  const start = d.request?.start_date ?? d.leave.as_of;
  const end = d.request?.end_date ?? start;
  const kind = d.request?.kind ?? activeOptions(d.leave.kinds)[0]?.code ?? "";
  return { kind, start, end, days: d.request?.days ?? calendarDays(start, end) };
}

export function titreVariables(d: TitreSimData): SimVarDef[] {
  const def = titreDefaults(d);
  return [
    { id: "titre.type", label: "Type de congé", group: G_TITRE, kind: "select", base: def.kind, options: leaveKindSimOptions(d.leave.kinds) },
    { id: "titre.du", label: "Du", group: G_TITRE, kind: "date", base: def.start },
    { id: "titre.au", label: "Au", group: G_TITRE, kind: "date", base: def.end },
    { id: "titre.jours", label: "Nombre de jours", group: G_TITRE, kind: "days", base: def.days, derived: true },
    { id: "titre.reprise", label: "Date de reprise", group: G_TITRE, kind: "date", base: returnDate(def.end), derived: true },
    { id: "titre.solde", label: "Solde de congé à la fin", group: G_TITRE, kind: "days", base: 0, derived: true, hint: "congé annuel uniquement" },
    { id: "titre.numero", label: "Numéro du titre", group: G_TITRE_PRINT, kind: "text", base: d.numero },
    ...TITRE_PRINT_FIELDS.map(
      (f): SimVarDef => ({ id: `titre.${f.key}`, label: f.label, group: G_TITRE_PRINT, kind: f.kind ?? "text", base: d.fields[f.key] ?? "" }),
    ),
  ];
}

export function titreOutput(d: TitreSimData, ctx: SimContext, env: SimEnv): SimOutput {
  const def = titreDefaults(d);
  const kind = ctx.str("titre.type", def.kind);
  const from = ctx.str("titre.du", def.start);
  const to = ctx.str("titre.au", def.end);
  const days = ctx.deriveNum("titre.jours", () =>
    d.request && from === d.request.start_date && to === d.request.end_date ? d.request.days : calendarDays(from, to),
  );
  ctx.deriveStr("titre.reprise", () => (to ? returnDate(to) : ""));
  const warnings: string[] = [];
  if (!from || !to || to < from) warnings.push("Dates du congé incohérentes : « au » doit suivre « du ».");

  let balance: number | null = null;
  if (isAnnualLeave(d.leave.kinds, kind) && to) {
    balance = ctx.deriveNum("titre.solde", () =>
      leaveBalanceFromCtx(ctx, d.leave, to, {
        exclude: d.request?.id ?? null,
        extra: { kind, status: "APPROVED", days, start_date: from },
      }).balance,
    );
    if (balance < 0) warnings.push(`Solde négatif après ce congé : ${balance} j.`);
  }

  const raw = { ...d.fields };
  for (const f of TITRE_PRINT_FIELDS) raw[f.key] = ctx.str(`titre.${f.key}`, d.fields[f.key] ?? "");
  if (!raw.matricule.trim() || !raw.nom.trim()) warnings.push("Le matricule et le nom sont obligatoires.");
  const fields = Object.fromEntries(
    LEAVE_TITLE_FIELD_KEYS.map((k) => [k, raw[k]?.trim() ? raw[k].trim() : null]),
  ) as LeaveTitleFields;
  const data = leaveTitleDocData(
    { ...fields, matricule: raw.matricule, nom: raw.nom },
    { kind, dateDebut: from, dateFin: to, jours: days },
    ctx.str("titre.numero", d.numero),
    d.kit.company,
    companyLetterheadUrl(d.letterhead_url, env.origin),
    d.kit.lists,
  );
  const printed = printFromKit(d.kit, "titre_conge", data, env.origin);
  if (!printed.ok) warnings.push(printed.error);

  const figures: SimFigure[] = [{ key: "days", label: "Jours de congé", value: days, format: "days", emphasis: true }];
  if (balance != null) figures.push({ key: "balance", label: "Solde restant", value: balance, format: "days", goodWhenUp: true });
  return {
    html: printed.ok ? printed.data : null,
    doc: { type: "titre_conge", data },
    pageWidth: A4_PAGE_WIDTH,
    figures,
    warnings,
  };
}

// ---------------------------------------------------------------------------
// Solde de tout compte
// ---------------------------------------------------------------------------

export type StcSimData = {
  leave: LeaveSimData;
  exit: { date: string; status: string; lines: SettlementLine[] } | null;
  base_monthly: number;
  /** Payroll inputs of the exit month (null when the employee has no payable contract then). */
  paie: SimulatorData | null;
};

const G_STC = "Solde de tout compte";

function storedOtherLines(d: StcSimData) {
  return (d.exit?.lines ?? []).filter((l) => l.code !== "ICP");
}

export function stcVariables(d: StcSimData): SimVarDef[] {
  const date = d.exit?.date ?? d.leave.as_of;
  const defs: SimVarDef[] = [
    { id: "stc.date_sortie", label: "Date de sortie", group: G_STC, kind: "date", base: date },
    { id: "stc.salaire_base", label: "Salaire de base à la sortie", group: G_STC, kind: "money", base: d.base_monthly },
    { id: "stc.solde_conge", label: "Solde de congé à la sortie", group: G_STC, kind: "days", base: 0, derived: true },
    { id: "stc.icp", label: "Indemnité compensatrice de congé (ICP)", group: G_STC, kind: "money", base: 0, derived: true, hint: "base / 30 × jours restants" },
  ];
  storedOtherLines(d).forEach((l, i) => {
    defs.push(
      { id: `stc.ligne.${i}.actif`, label: `${l.label_fr || l.code} · incluse`, group: G_STC, kind: "toggle", base: true },
      { id: `stc.ligne.${i}.montant`, label: `${l.label_fr || l.code} · montant`, group: G_STC, kind: "money", base: l.amount },
    );
  });
  if (d.paie?.subject) {
    defs.push({ id: "stc.net_mois", label: "Net du bulletin du mois de sortie", group: G_STC, kind: "money", base: 0, derived: true });
  }
  defs.push({ id: "stc.montant", label: "Montant du solde de tout compte", group: G_STC, kind: "money", base: 0, derived: true });
  return defs;
}

export function stcOutput(d: StcSimData, ctx: SimContext): SimOutput {
  const date = ctx.str("stc.date_sortie", d.exit?.date ?? d.leave.as_of);
  const base = ctx.num("stc.salaire_base", d.base_monthly);
  const warnings: string[] = [];
  const balance = ctx.deriveNum("stc.solde_conge", () => (date ? leaveBalanceFromCtx(ctx, d.leave, date).balance : 0));
  const icp = ctx.deriveNum(
    "stc.icp",
    () => suggestSettlement({ leaveBalanceDays: balance, baseMonthly: base })[0]?.amount ?? 0,
  );
  const storedIcp = d.exit?.lines.find((l) => l.code === "ICP");
  if (storedIcp && Math.abs(storedIcp.amount - icp) >= 0.01) {
    warnings.push(`ICP enregistrée sur la sortie : ${storedIcp.amount.toFixed(2)} DA (simulée : ${icp.toFixed(2)} DA).`);
  }
  const days = Math.max(0, balance);
  const lines: SettlementLine[] = [];
  if (icp > 0) {
    lines.push({
      code: "ICP",
      label_fr: `Indemnité compensatrice de congé (${days} j)`,
      label_ar: `تعويض العطلة غير المستهلكة (${days} يوم)`,
      category: "1",
      amount: icp,
    });
  }
  storedOtherLines(d).forEach((l, i) => {
    if (ctx.bool(`stc.ligne.${i}.actif`, true)) lines.push({ ...l, amount: ctx.num(`stc.ligne.${i}.montant`, l.amount) });
  });
  const linesTotal = Math.round(lines.reduce((s, l) => s + l.amount, 0) * 100) / 100;

  let net: number | null = null;
  if (d.paie?.subject) {
    const paie = d.paie;
    net = ctx.deriveNum("stc.net_mois", () => runPaie(paie, ctx, { exitLines: lines }).out.slip.summary.net_payable);
    const month = `${paie.year}-${String(paie.month).padStart(2, "0")}`;
    if (date && date.slice(0, 7) !== month) {
      warnings.push(`Le bulletin est simulé sur ${month} : rechargez l'élément pour un autre mois de sortie.`);
    }
  } else {
    warnings.push("Aucun bulletin simulable pour le mois de sortie : le montant = total des lignes.");
  }
  const amount = ctx.deriveNum("stc.montant", () => (net != null && net !== 0 ? net : linesTotal));
  if (!d.exit) warnings.push("Aucune sortie enregistrée : simulation d'une sortie à la date choisie.");

  const figures: SimFigure[] = [
    { key: "balance", label: "Solde de congé", value: balance, format: "days" },
    { key: "icp", label: "ICP", value: icp, format: "money" },
    { key: "lines", label: "Total des lignes", value: linesTotal, format: "money" },
  ];
  if (net != null) figures.push({ key: "net", label: "Net du mois", value: net, format: "money" });
  figures.push({ key: "amount", label: "Solde de tout compte", value: amount, format: "money", emphasis: true, goodWhenUp: true });
  return { html: null, pageWidth: A4_PAGE_WIDTH, figures, warnings };
}
