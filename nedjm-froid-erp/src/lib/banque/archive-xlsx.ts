/**
 * Parse GESTION DES BANQUES Google Workspace / Excel archive workbooks.
 * Pure helpers — no DB writes.
 */

import { nextRunningBalance, roundMoney } from "@/lib/banque/ledger";

export type ArchiveDocCell = {
  label: string;
  url: string | null;
};

export type ArchiveLine = {
  displayNo: number | null;
  opDate: string;
  valueDate: string;
  affectation: string;
  bc: ArchiveDocCell;
  mode: ArchiveDocCell;
  fac: ArchiveDocCell;
  libelle: string;
  debit: number;
  credit: number;
  frais: number;
  sheetSolde: number | null;
  reconciled: boolean;
};

export type ArchiveBankSheet = {
  sheetName: string;
  accountName: string;
  labeledOpening: number | null;
  impliedOpening: number | null;
  /** Opening to use for import (implied when it disagrees with the label). */
  openingBalance: number;
  openingDate: string;
  lines: ArchiveLine[];
  expectedFinal: number;
  sheetFinal: number | null;
  balanceMismatches: number;
  openingMismatch: boolean;
  linkCounts: { bc: number; mode: number; fac: number };
};

export type ArchiveSettings = {
  banks: { name: string; active: boolean }[];
  affectations: string[];
  fournisseurs: string[];
  modes: string[];
};

export type ArchiveParseResult = {
  banks: ArchiveBankSheet[];
  settings: ArchiveSettings | null;
};

const BANK_SHEET_SKIP = new Set([
  "HISTORIQUE",
  "SETTINGS",
  "CAUTIONS",
  "USERS",
  "SPREADSHEET",
  "MASTER_2026_03_04",
  "ARCHIVE_MASTER_2026_03",
]);

/** Map noisy Workspace sheet titles → ERP fin_accounts.name */
export function normalizeBankSheetName(raw: string): string | null {
  const n = raw.replace(/\s+/g, " ").trim().toUpperCase();
  if (!n || BANK_SHEET_SKIP.has(n) || n.startsWith("ARCHIVE_")) return null;
  if (n.includes("BARAKA")) return "AL BARAKA";
  if (n.includes("SALAM")) return "AL SALAM";
  if (n.includes("SETIF")) return "BEA SETIF 053";
  if (/(035\s*\/?\s*02|03502)/.test(n)) return "BEA HMD 035/02";
  if (/(035\s*\/?\s*01|03501)/.test(n)) return "BEA HMD 035/01";
  if (n.includes("033")) return "BEA HMD 033";
  return null;
}

export function parseArchiveMoney(value: unknown): number | null {
  if (value == null || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) return roundMoney(value);
  let s = String(value).trim();
  if (!s) return null;
  s = s.replace(/^"+|"+$/g, "").replace(/DA/gi, "").replace(/\u00a0/g, " ").trim();
  // French: 1 234,56 or 86 399,13
  if (/^-?\d{1,3}(\s\d{3})+(,\d+)?$/.test(s) || /^-?\d+,\d+$/.test(s)) {
    s = s.replace(/\s/g, "").replace(",", ".");
  } else {
    s = s.replace(/\s/g, "").replace(/,(?=\d{3}(\D|$))/g, "").replace(",", ".");
  }
  const n = Number(s);
  return Number.isFinite(n) ? roundMoney(n) : null;
}

export function parseArchiveDate(value: unknown): string | null {
  if (value == null || value === "") return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const y = value.getUTCFullYear();
    const m = String(value.getUTCMonth() + 1).padStart(2, "0");
    const d = String(value.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    // Excel serial — Africa/Algiers calendar day
    const utc = new Date(Math.round((value - 25569) * 86400 * 1000));
    const y = utc.getUTCFullYear();
    const m = String(utc.getUTCMonth() + 1).padStart(2, "0");
    const d = String(utc.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  let s = String(value).trim().replace(/^"+|"+$/g, "").trim();
  if (!s) return null;
  const iso = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];
  const fr = s.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{4})/);
  if (fr) {
    return `${fr[3]}-${fr[2].padStart(2, "0")}-${fr[1].padStart(2, "0")}`;
  }
  const asDate = new Date(s);
  if (!Number.isNaN(asDate.getTime()) && /\d{4}/.test(s)) {
    return parseArchiveDate(asDate);
  }
  return null;
}

const HYPERLINK_RE = /^HYPERLINK\(\s*"([^"]+)"\s*,\s*"([\s\S]*)"\s*\)$/i;

export function extractHyperlinkCell(raw: unknown): ArchiveDocCell {
  if (raw == null || raw === "") return { label: "", url: null };

  if (typeof raw === "object" && raw !== null) {
    const obj = raw as {
      text?: string;
      hyperlink?: string;
      formula?: string;
      result?: unknown;
      richText?: { text: string }[];
    };
    if (obj.formula) {
      const m = String(obj.formula).match(HYPERLINK_RE);
      if (m) {
        return {
          label: String(m[2]).replace(/🔗/g, "").trim(),
          url: m[1].trim() || null,
        };
      }
      const resultLabel =
        obj.result != null
          ? String(obj.result).replace(/🔗/g, "").trim()
          : "";
      return { label: resultLabel, url: null };
    }
    if (obj.hyperlink) {
      const label = obj.text
        ? String(obj.text)
        : obj.richText
          ? obj.richText.map((t) => t.text).join("")
          : "";
      return { label: label.replace(/🔗/g, "").trim(), url: String(obj.hyperlink) };
    }
    if (obj.richText) {
      return { label: obj.richText.map((t) => t.text).join("").replace(/🔗/g, "").trim(), url: null };
    }
    if (obj.text != null) {
      return { label: String(obj.text).replace(/🔗/g, "").trim(), url: null };
    }
    if (obj.result != null) {
      return { label: String(obj.result).replace(/🔗/g, "").trim(), url: null };
    }
  }

  const label = String(raw).replace(/🔗/g, "").trim();
  return { label, url: null };
}

type HeaderMap = {
  no: number;
  opDate: number;
  valueDate: number;
  affectation: number;
  bc: number;
  mode: number;
  fac: number;
  libelle: number;
  debit: number;
  credit: number;
  frais: number;
  solde: number;
  rapp: number | null;
};

function classifyHeader(text: string): keyof HeaderMap | null {
  const t = text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
  if (!t) return null;
  if (/^N[°ºO]/.test(t) || t === "N") return "no";
  if (t.includes("DATE") && (t.includes("OPER") || t.includes("DATE OP"))) return "opDate";
  if (t.includes("DATE") && (t.includes("VALEUR") || t.includes("DATE VAL"))) return "valueDate";
  if (t.includes("AFFECT") || t === "AFF") return "affectation";
  if (t.includes("BON DE COMMANDE") || t === "BC") return "bc";
  if (t.includes("MODE")) return "mode";
  if (t.includes("FACT")) return "fac";
  if (t.includes("LIBELLE") || t.includes("LIBELL")) return "libelle";
  if (t.includes("DE+") || t.includes("DEBIT") || t === "DE") return "debit";
  if (t.includes("CR-") || t.includes("CREDIT") || t === "CR") return "credit";
  if (t.includes("FR") || t.includes("FRAIS")) return "frais";
  if (t.includes("SOLDE")) return "solde";
  if (t.includes("RAPPRO") || t.includes("RAPP")) return "rapp";
  return null;
}

function cellRaw(row: unknown[], col: number): unknown {
  return row[col - 1];
}

function rowTexts(row: unknown[]): string[] {
  return row.map((v) => {
    if (v == null) return "";
    if (typeof v === "object") {
      const o = v as { text?: string; result?: unknown; richText?: { text: string }[] };
      if (o.text != null) return String(o.text);
      if (o.result != null) return String(o.result);
      if (o.richText) return o.richText.map((t) => t.text).join("");
    }
    return String(v);
  });
}

/** Rows are 1-indexed column values as ExcelJS-like cell values (array index 0 = col A). */
export function parseArchiveBankSheet(
  sheetName: string,
  rows: unknown[][],
): ArchiveBankSheet | null {
  const accountName = normalizeBankSheetName(sheetName);
  if (!accountName) return null;

  let headerIdx = -1;
  let headers: HeaderMap | null = null;

  for (let i = 0; i < Math.min(rows.length, 25); i++) {
    const texts = rowTexts(rows[i] ?? []);
    const map: Partial<HeaderMap> = {};
    texts.forEach((t, idx) => {
      const key = classifyHeader(t);
      if (key && map[key] == null) map[key] = idx + 1;
    });
    if (map.no && map.debit && map.credit && map.libelle) {
      headerIdx = i;
      headers = {
        no: map.no,
        opDate: map.opDate ?? map.no + 1,
        valueDate: map.valueDate ?? map.opDate ?? map.no + 2,
        affectation: map.affectation ?? map.no + 3,
        bc: map.bc ?? map.no + 4,
        mode: map.mode ?? map.no + 5,
        fac: map.fac ?? map.no + 6,
        libelle: map.libelle,
        debit: map.debit,
        credit: map.credit,
        frais: map.frais ?? map.credit + 1,
        solde: map.solde ?? (map.frais ?? map.credit + 1) + 1,
        rapp: map.rapp ?? null,
      };
      // Workspace often puts FAC in the column after MODE even when header is blank.
      if (map.fac == null && map.mode != null) {
        headers.fac = map.mode + 1;
      }
      break;
    }
  }

  if (!headers || headerIdx < 0) {
    return {
      sheetName,
      accountName,
      labeledOpening: null,
      impliedOpening: null,
      openingBalance: 0,
      openingDate: "2025-12-31",
      lines: [],
      expectedFinal: 0,
      sheetFinal: null,
      balanceMismatches: 0,
      openingMismatch: false,
      linkCounts: { bc: 0, mode: 0, fac: 0 },
    };
  }

  let cursor = headerIdx + 1;
  let labeledOpening: number | null = null;
  const openRow = rows[cursor] ?? [];
  const openText = String(cellRaw(openRow, headers.no) ?? "");
  if (/SOLDE/i.test(openText)) {
    labeledOpening = parseArchiveMoney(cellRaw(openRow, headers.solde));
    cursor += 1;
  }

  const lines: ArchiveLine[] = [];
  const linkCounts = { bc: 0, mode: 0, fac: 0 };

  for (let i = cursor; i < rows.length; i++) {
    const row = rows[i] ?? [];
    const noRaw = cellRaw(row, headers.no);
    const libelleCell = extractHyperlinkCell(cellRaw(row, headers.libelle));
    const debit = parseArchiveMoney(cellRaw(row, headers.debit)) ?? 0;
    const credit = parseArchiveMoney(cellRaw(row, headers.credit)) ?? 0;
    const frais = parseArchiveMoney(cellRaw(row, headers.frais)) ?? 0;
    const libelle = libelleCell.label.trim();

    if (
      (noRaw == null || noRaw === "") &&
      !libelle &&
      debit === 0 &&
      credit === 0 &&
      frais === 0
    ) {
      continue;
    }
    if (typeof noRaw === "string" && /SOLDE/i.test(noRaw)) continue;
    if (!libelle && debit === 0 && credit === 0 && frais === 0) continue;

    const opDate =
      parseArchiveDate(cellRaw(row, headers.opDate)) ??
      parseArchiveDate(cellRaw(row, headers.valueDate));
    const valueDate =
      parseArchiveDate(cellRaw(row, headers.valueDate)) ?? opDate;
    if (!opDate || !valueDate) continue;

    const bc = extractHyperlinkCell(cellRaw(row, headers.bc));
    const mode = extractHyperlinkCell(cellRaw(row, headers.mode));
    const fac = extractHyperlinkCell(cellRaw(row, headers.fac));
    if (bc.url) linkCounts.bc += 1;
    if (mode.url) linkCounts.mode += 1;
    if (fac.url) linkCounts.fac += 1;

    let reconciled = false;
    if (headers.rapp != null) {
      const rv = cellRaw(row, headers.rapp);
      reconciled = rv != null && String(rv).trim() !== "" && String(rv) !== "0" && rv !== false;
    }

    const displayNo =
      typeof noRaw === "number"
        ? noRaw
        : noRaw != null && String(noRaw).trim() !== "" && Number.isFinite(Number(noRaw))
          ? Number(noRaw)
          : null;

    lines.push({
      displayNo,
      opDate,
      valueDate,
      affectation: String(cellRaw(row, headers.affectation) ?? "")
        .replace(/^"+|"+$/g, "")
        .trim(),
      bc: { label: bc.label.slice(0, 200), url: bc.url },
      mode: { label: mode.label.slice(0, 200), url: mode.url },
      fac: { label: fac.label.slice(0, 200), url: fac.url },
      libelle: (libelle || "IMPORT ARCHIVE").slice(0, 500),
      debit,
      credit,
      frais,
      sheetSolde: parseArchiveMoney(cellRaw(row, headers.solde)),
      reconciled,
    });
  }

  let impliedOpening: number | null = null;
  if (lines.length > 0) {
    const first = lines[0];
    const firstSolde = first.sheetSolde;
    if (firstSolde != null) {
      impliedOpening = roundMoney(firstSolde - first.debit + first.credit + first.frais);
    }
  }

  const openingMismatch =
    labeledOpening != null &&
    impliedOpening != null &&
    Math.abs(labeledOpening - impliedOpening) > 0.02;

  const openingBalance =
    openingMismatch && impliedOpening != null
      ? impliedOpening
      : (labeledOpening ?? impliedOpening ?? 0);

  let running = openingBalance;
  let balanceMismatches = 0;
  let sheetFinal: number | null = null;
  for (const line of lines) {
    running = nextRunningBalance(running, line);
    if (line.sheetSolde != null) {
      sheetFinal = line.sheetSolde;
      if (Math.abs(line.sheetSolde - running) > 0.02) balanceMismatches += 1;
    }
  }

  return {
    sheetName,
    accountName,
    labeledOpening,
    impliedOpening,
    openingBalance,
    openingDate: "2025-12-31",
    lines,
    expectedFinal: running,
    sheetFinal,
    balanceMismatches,
    openingMismatch,
    linkCounts,
  };
}

export function parseArchiveSettingsSheet(rows: unknown[][]): ArchiveSettings {
  const banks: { name: string; active: boolean }[] = [];
  const affectations: string[] = [];
  const fournisseurs: string[] = [];
  const modes: string[] = [];
  const seenA = new Set<string>();
  const seenF = new Set<string>();
  const seenM = new Set<string>();

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] ?? [];
    const bank = row[0] != null ? String(row[0]).trim() : "";
    const status = row[1] != null ? String(row[1]).trim() : "";
    if (bank) {
      const name = normalizeBankSheetName(bank) ?? bank.replace(/\s+/g, " ").trim();
      banks.push({ name, active: !/^off|inactif|disabled/i.test(status) });
    }
    const aff = row[3] != null ? String(row[3]).trim() : "";
    const fourn = row[4] != null ? String(row[4]).trim() : "";
    const mode = row[5] != null ? String(row[5]).trim() : "";
    if (aff && !seenA.has(aff)) {
      seenA.add(aff);
      affectations.push(aff);
    }
    if (fourn && !seenF.has(fourn) && !/^SOLDE DE/i.test(fourn)) {
      seenF.add(fourn);
      fournisseurs.push(fourn);
    }
    if (mode && mode !== "-" && !seenM.has(mode) && !/^SOLDE DE/i.test(mode)) {
      seenM.add(mode);
      modes.push(mode);
    }
  }

  return { banks, affectations, fournisseurs, modes };
}

/** Convert ExcelJS worksheet rows into plain value matrix. */
export function excelJsSheetToRows(ws: {
  rowCount: number;
  columnCount: number;
  getRow: (r: number) => { getCell: (c: number) => { value: unknown } };
}): unknown[][] {
  const rows: unknown[][] = [];
  const maxCol = Math.max(ws.columnCount || 0, 14);
  for (let r = 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const vals: unknown[] = [];
    for (let c = 1; c <= maxCol; c++) {
      vals.push(row.getCell(c).value);
    }
    rows.push(vals);
  }
  return rows;
}

export async function parseArchiveWorkbookFromExcelJs(wb: {
  worksheets: { name: string; rowCount: number; columnCount: number; getRow: (r: number) => { getCell: (c: number) => { value: unknown } } }[];
}): Promise<ArchiveParseResult> {
  const banks: ArchiveBankSheet[] = [];
  let settings: ArchiveSettings | null = null;

  for (const ws of wb.worksheets) {
    const rows = excelJsSheetToRows(ws);
    if (/^settings$/i.test(ws.name.trim())) {
      settings = parseArchiveSettingsSheet(rows);
      continue;
    }
    const parsed = parseArchiveBankSheet(ws.name, rows);
    if (parsed) banks.push(parsed);
  }

  banks.sort((a, b) => a.accountName.localeCompare(b.accountName, "fr"));
  return { banks, settings };
}

export function archiveSheetToRpcRows(sheet: ArchiveBankSheet) {
  return sheet.lines.map((l, index) => ({
    display_no: l.displayNo && l.displayNo > 0 ? l.displayNo : index + 1,
    op_date: l.opDate,
    value_date: l.valueDate,
    affectation: l.affectation,
    bc_label: l.bc.label,
    bc_url: l.bc.url,
    mode_label: l.mode.label,
    mode_url: l.mode.url,
    fac_label: l.fac.label,
    fac_url: l.fac.url,
    libelle: l.libelle,
    debit: l.debit,
    credit: l.credit,
    frais: l.frais,
    reconciled: l.reconciled,
  }));
}
