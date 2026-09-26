import ExcelJS from "exceljs";
import {
  PAYMENT_MODE_LABELS,
  slipGrossTotal,
  summarizeAnnualDas,
  summarizeMonthlyDeclarations,
  type DeclarationSlip,
  type DeclarationStatus,
} from "@/lib/hr/payroll-declarations";

export type EmployerIdentity = {
  name: string;
  address: string;
  nif: string;
  nis: string;
  cnas_no: string;
  cacobatph_no: string;
};

const MONTHS_FR = [
  "Janvier",
  "Février",
  "Mars",
  "Avril",
  "Mai",
  "Juin",
  "Juillet",
  "Août",
  "Septembre",
  "Octobre",
  "Novembre",
  "Décembre",
];

const MONEY = "#,##0.00";
const HEADER_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8EEF9" } };

type Column = { header: string; width?: number; money?: boolean };

function addTitle(ws: ExcelJS.Worksheet, lines: string[]) {
  lines.forEach((text, i) => {
    const row = ws.addRow([text]);
    if (i === 0) row.font = { bold: true, size: 14 };
  });
  ws.addRow([]);
}

function addTable(
  ws: ExcelJS.Worksheet,
  columns: Column[],
  rows: (string | number | null)[][],
  totals?: (string | number | null)[],
) {
  const header = ws.addRow(columns.map((c) => c.header));
  header.font = { bold: true };
  header.eachCell((cell) => {
    cell.fill = HEADER_FILL;
    cell.border = { bottom: { style: "thin" } };
  });
  for (const values of rows) ws.addRow(values);
  if (totals) {
    const row = ws.addRow(totals);
    row.font = { bold: true };
    row.eachCell((cell) => {
      cell.border = { top: { style: "thin" } };
    });
  }
  columns.forEach((c, i) => {
    const col = ws.getColumn(i + 1);
    col.width = Math.max(col.width ?? 0, c.width ?? 14);
    if (c.money) col.numFmt = MONEY;
  });
}

function identityLines(employer: EmployerIdentity) {
  return [
    employer.name,
    employer.address,
    [employer.nif && `NIF : ${employer.nif}`, employer.nis && `NIS : ${employer.nis}`].filter(Boolean).join("   "),
  ].filter(Boolean);
}

function statusLine(status: DeclarationStatus) {
  return status === "FINAL"
    ? "Statut : paie validée / clôturée"
    : "Statut : PROVISOIRE — paie non validée pour tous les chantiers";
}

export function monthlyDeclarationsFilename(year: number, month: number) {
  return `Declarations_paie_${year}-${String(month).padStart(2, "0")}.xlsx`;
}

export function annualDasFilename(year: number) {
  return `DAS_CNAS_${year}.xlsx`;
}

export async function buildMonthlyDeclarationsWorkbook(input: {
  year: number;
  month: number;
  status: DeclarationStatus;
  employer: EmployerIdentity;
  scopeLabel: string;
  slips: readonly DeclarationSlip[];
}): Promise<ArrayBuffer> {
  const { employer } = input;
  const period = `${MONTHS_FR[input.month - 1]} ${input.year}`;
  const d = summarizeMonthlyDeclarations(input.slips);
  const slips = [...input.slips].sort((a, b) => a.matricule.localeCompare(b.matricule, "fr", { numeric: true }));
  const wb = new ExcelJS.Workbook();
  wb.creator = employer.name || "ERP";

  const recap = wb.addWorksheet("Récapitulatif");
  addTitle(recap, [
    `Déclarations de paie — ${period}`,
    ...identityLines(employer),
    `Périmètre : ${input.scopeLabel}`,
    statusLine(input.status),
  ]);
  addTable(
    recap,
    [
      { header: "Déclaration", width: 42 },
      { header: "Base", width: 18, money: true },
      { header: "Montant", width: 18, money: true },
    ],
    [
      [`CNAS — part salariale (N° employeur ${employer.cnas_no || "—"})`, d.cnas.totals.assiette, d.cnas.totals.part_salariale],
      ["CNAS — part patronale", d.cnas.totals.assiette, d.cnas.totals.part_patronale],
      ["CNAS — total à verser", d.cnas.totals.assiette, d.cnas.totals.total],
      ...(d.irg.by_line.length > 1
        ? d.irg.by_line.map((l) => [`G50 — ${l.line}`, l.irg_base, l.irg_amount] as (string | number | null)[])
        : [["G50 — IRG salaires", d.irg.totals.irg_base, d.irg.totals.irg_amount]]),
      [`CACOBATPH — congés payés (N° ${employer.cacobatph_no || "—"})`, d.cacobatph.totals.assiette, d.cacobatph.totals.conges],
      ["CACOBATPH — intempéries salarié", d.cacobatph.totals.assiette, d.cacobatph.totals.intemperies_employee],
      ["CACOBATPH — intempéries employeur", d.cacobatph.totals.assiette, d.cacobatph.totals.intemperies_employer],
      ["CACOBATPH — total à verser", d.cacobatph.totals.assiette, d.cacobatph.totals.total],
      ["Net à payer (virements + caisse)", null, d.transfers.total],
      ["Coût global employeur", null, d.journal.employer_cost],
    ],
  );
  recap.addRow([]);
  recap.addRow([`Effectif payé : ${d.employees}`]);
  recap.addRow([`Salariés soumis à l'IRG : ${d.irg.totals.taxed_employees}`]);
  const warnings = [
    ...d.cnas.missing_nss.map((n) => `N° SS manquant : ${n}`),
    ...d.transfers.missing_account.map((n) => `Compte de paiement manquant : ${n}`),
  ];
  if (warnings.length) {
    recap.addRow([]);
    recap.addRow(["À corriger avant dépôt"]).font = { bold: true, color: { argb: "FFB45309" } };
    for (const w of warnings) recap.addRow([w]);
  }

  const journal = wb.addWorksheet("Livre de paie");
  addTitle(journal, [`Livre de paie — ${period}`, employer.name, statusLine(input.status)]);
  addTable(
    journal,
    [
      { header: "Matricule", width: 12 },
      { header: "Nom et prénom", width: 30 },
      { header: "Chantier", width: 22 },
      { header: "Jours payés", width: 11 },
      { header: "Brut", money: true },
      { header: "Assiette CNAS", money: true },
      { header: "CNAS salarié", money: true },
      { header: "Intempéries sal.", money: true },
      { header: "Base IRG", money: true },
      { header: "IRG", money: true },
      { header: "Net à payer", money: true },
      { header: "CNAS employeur", money: true },
      { header: "CACOBATPH congés", money: true },
      { header: "Intempéries pat.", money: true },
    ],
    slips.map((s) => [
      s.matricule,
      s.employee_name,
      s.site_name ?? "",
      s.days_paid,
      slipGrossTotal(s),
      s.gross_amount,
      s.employee_ss,
      s.intemperies_employee,
      s.irg_base,
      s.irg_amount,
      s.net_payable,
      s.employer_ss,
      s.cacobatph,
      s.intemperies_employer,
    ]),
    [
      "TOTAL",
      `${d.employees} salarié(s)`,
      "",
      null,
      d.journal.gross_total,
      d.journal.assiette_cnas,
      d.journal.employee_ss,
      d.journal.intemperies_employee,
      d.journal.irg_base,
      d.journal.irg_amount,
      d.journal.net_payable,
      d.journal.employer_ss,
      d.journal.cacobatph,
      d.journal.intemperies_employer,
    ],
  );

  const cnas = wb.addWorksheet("CNAS");
  addTitle(cnas, [
    `Déclaration mensuelle des salaires et cotisations — ${period}`,
    employer.name,
    `N° employeur CNAS : ${employer.cnas_no || "à renseigner (Paramètres RH › Bulletin)"}`,
    statusLine(input.status),
  ]);
  addTable(
    cnas,
    [
      { header: "N°", width: 6 },
      { header: "N° SS", width: 18 },
      { header: "Nom et prénom", width: 30 },
      { header: "Matricule", width: 12 },
      { header: "Jours", width: 8 },
      { header: "Assiette", money: true },
      { header: "Part salariale", money: true },
      { header: "Part patronale", money: true },
      { header: "Total", money: true },
    ],
    d.cnas.rows.map((r, i) => [
      i + 1,
      r.nss || "MANQUANT",
      r.employee_name,
      r.matricule,
      r.days_paid,
      r.assiette,
      r.part_salariale,
      r.part_patronale,
      r.total,
    ]),
    ["", "", "TOTAL", "", null, d.cnas.totals.assiette, d.cnas.totals.part_salariale, d.cnas.totals.part_patronale, d.cnas.totals.total],
  );

  const irg = wb.addWorksheet("IRG (G50)");
  addTitle(irg, [
    `État des retenues IRG sur salaires — ${period}`,
    employer.name,
    ...(d.irg.by_line.length
      ? d.irg.by_line.map((l) => `À reporter sur la G50 : ${l.line} = ${l.irg_amount.toFixed(2)} DA`)
      : [`À reporter sur la G50 : IRG salaires = ${d.irg.totals.irg_amount.toFixed(2)} DA`]),
    statusLine(input.status),
  ]);
  addTable(
    irg,
    [
      { header: "Matricule", width: 12 },
      { header: "Nom et prénom", width: 30 },
      { header: "Régime IRG", width: 34 },
      { header: "Base imposable", money: true, width: 18 },
      { header: "IRG retenu", money: true, width: 18 },
    ],
    d.irg.rows.map((r) => [r.matricule, r.employee_name, r.regime, r.irg_base, r.irg_amount]),
    ["TOTAL", `${d.irg.totals.taxed_employees} imposé(s)`, "", d.irg.totals.irg_base, d.irg.totals.irg_amount],
  );

  const caco = wb.addWorksheet("CACOBATPH");
  addTitle(caco, [
    `Déclaration CACOBATPH — ${period}`,
    employer.name,
    `N° adhérent CACOBATPH : ${employer.cacobatph_no || "à renseigner (Paramètres RH › Bulletin)"}`,
    statusLine(input.status),
  ]);
  addTable(
    caco,
    [
      { header: "Matricule", width: 12 },
      { header: "Nom et prénom", width: 30 },
      { header: "Assiette", money: true },
      { header: "Congés payés", money: true },
      { header: "Intempéries sal.", money: true },
      { header: "Intempéries pat.", money: true },
    ],
    d.cacobatph.rows.map((r) => [
      r.matricule,
      r.employee_name,
      r.assiette,
      r.conges,
      r.intemperies_employee,
      r.intemperies_employer,
    ]),
    [
      "TOTAL",
      "",
      d.cacobatph.totals.assiette,
      d.cacobatph.totals.conges,
      d.cacobatph.totals.intemperies_employee,
      d.cacobatph.totals.intemperies_employer,
    ],
  );

  const transfers = wb.addWorksheet("Virements");
  addTitle(transfers, [`Ordre de virement des salaires — ${period}`, employer.name, statusLine(input.status)]);
  addTable(
    transfers,
    [
      { header: "Mode", width: 14 },
      { header: "Matricule", width: 12 },
      { header: "Nom et prénom", width: 30 },
      { header: "Compte", width: 28 },
      { header: "Net à payer", money: true, width: 18 },
    ],
    d.transfers.groups.flatMap((g) => [
      ...g.rows.map((r) => [PAYMENT_MODE_LABELS[g.mode], r.matricule, r.employee_name, r.account || "MANQUANT", r.net]),
      [`Sous-total ${PAYMENT_MODE_LABELS[g.mode]}`, "", `${g.rows.length} salarié(s)`, "", g.total],
    ]),
    ["TOTAL", "", "", "", d.transfers.total],
  );

  return toArrayBuffer(await wb.xlsx.writeBuffer());
}

export async function buildAnnualDasWorkbook(input: {
  year: number;
  status: DeclarationStatus;
  employer: EmployerIdentity;
  slips: readonly DeclarationSlip[];
}): Promise<ArrayBuffer> {
  const { employer } = input;
  const das = summarizeAnnualDas(input.slips);
  const wb = new ExcelJS.Workbook();
  wb.creator = employer.name || "ERP";
  const ws = wb.addWorksheet(`DAS ${input.year}`);
  addTitle(ws, [
    `Déclaration annuelle des salaires (DAS) — ${input.year}`,
    ...identityLines(employer),
    `N° employeur CNAS : ${employer.cnas_no || "à renseigner (Paramètres RH › Bulletin)"}`,
    input.status === "FINAL"
      ? "Statut : tous les mois payés sont validés / clôturés"
      : "Statut : PROVISOIRE — certains mois ne sont pas validés",
  ]);
  const month = (m: number) => MONTHS_FR[m - 1] ?? "";
  addTable(
    ws,
    [
      { header: "N°", width: 6 },
      { header: "N° SS", width: 18 },
      { header: "Nom et prénom", width: 30 },
      { header: "Matricule", width: 12 },
      { header: "Date naissance", width: 14 },
      { header: "Date entrée", width: 14 },
      { header: "Période", width: 22 },
      { header: "Jours T1", width: 9 },
      { header: "Assiette T1", money: true },
      { header: "Jours T2", width: 9 },
      { header: "Assiette T2", money: true },
      { header: "Jours T3", width: 9 },
      { header: "Assiette T3", money: true },
      { header: "Jours T4", width: 9 },
      { header: "Assiette T4", money: true },
      { header: "Jours total", width: 11 },
      { header: "Assiette annuelle", money: true, width: 18 },
      { header: "CNAS salarié", money: true },
      { header: "CNAS employeur", money: true },
    ],
    das.rows.map((r, i) => [
      i + 1,
      r.nss || "MANQUANT",
      r.employee_name,
      r.matricule,
      r.birth_date ?? "",
      r.hired_at ?? "",
      r.first_month === r.last_month ? month(r.first_month) : `${month(r.first_month)} – ${month(r.last_month)}`,
      ...r.quarters.flatMap((q) => [q.days, q.assiette]),
      r.days_total,
      r.assiette_total,
      r.employee_ss,
      r.employer_ss,
    ]),
    [
      "",
      "",
      `TOTAL (${das.rows.length} salarié(s))`,
      "",
      "",
      "",
      "",
      ...das.totals.quarters.flatMap((q) => [null, q]),
      null,
      das.totals.assiette,
      das.totals.employee_ss,
      das.totals.employer_ss,
    ],
  );
  if (das.missing_nss.length) {
    ws.addRow([]);
    ws.addRow(["À corriger avant dépôt"]).font = { bold: true, color: { argb: "FFB45309" } };
    for (const n of das.missing_nss) ws.addRow([`N° SS manquant : ${n}`]);
  }
  return toArrayBuffer(await wb.xlsx.writeBuffer());
}

function toArrayBuffer(data: ExcelJS.Buffer | ArrayBuffer | Uint8Array): ArrayBuffer {
  if (data instanceof ArrayBuffer) return data;
  const view = data instanceof Uint8Array ? data : new Uint8Array(data as ArrayLike<number>);
  return view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength) as ArrayBuffer;
}
