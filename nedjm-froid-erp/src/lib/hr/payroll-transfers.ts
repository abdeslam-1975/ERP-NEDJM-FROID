import { normalizePaymentMode } from "./payroll-declarations";

export type TransferMode = "CCP" | "BANK";

export type TransferSlip = {
  id: string;
  employee_id: string;
  site_id: string | null;
  matricule: string;
  employee_name: string;
  status_code: string;
  net_payable: number;
  payment_mode_code: string | null;
  account_no: string | null;
  account_key: string | null;
};

export type TransferLine = {
  slip_id: string;
  employee_id: string;
  matricule: string;
  employee_name: string;
  account: string;
  amount: number;
};

export type TransferIssue = { matricule: string; employee_name: string; reason: string };

const digits = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");

/** CCP: 1-10 digit account + 2-digit key; bank: 20-digit RIB (key may be embedded or separate). */
export function transferAccount(
  mode: TransferMode,
  accountNo: string | null | undefined,
  accountKey: string | null | undefined,
): { ok: true; account: string } | { ok: false; reason: string } {
  const no = digits(accountNo);
  const key = digits(accountKey);
  if (mode === "CCP") {
    if (!no) return { ok: false, reason: "Compte CCP manquant" };
    if (no.length > 10) return { ok: false, reason: "Compte CCP > 10 chiffres" };
    if (key.length !== 2) return { ok: false, reason: "Clé CCP (2 chiffres) manquante" };
    return { ok: true, account: `${no.padStart(10, "0")}${key}` };
  }
  const rib = no.length === 20 ? no : `${no}${key}`;
  if (rib.length !== 20) return { ok: false, reason: "RIB bancaire incomplet (20 chiffres attendus)" };
  return { ok: true, account: rib };
}

/** Slips payable by transfer: validated / closed, net > 0, same mode, not already in a live batch. */
export function selectTransferLines(
  slips: readonly TransferSlip[],
  mode: TransferMode,
  alreadyInBatch: ReadonlySet<string>,
) {
  const lines: TransferLine[] = [];
  const issues: TransferIssue[] = [];
  let skippedDraft = 0;
  let skippedBatched = 0;
  const sorted = [...slips].sort((a, b) => a.matricule.localeCompare(b.matricule, "fr", { numeric: true }));
  for (const s of sorted) {
    if (normalizePaymentMode(s.payment_mode_code) !== mode || s.net_payable <= 0) continue;
    if (s.status_code === "DRAFT") {
      skippedDraft += 1;
      continue;
    }
    if (alreadyInBatch.has(s.id)) {
      skippedBatched += 1;
      continue;
    }
    const acc = transferAccount(mode, s.account_no, s.account_key);
    if (!acc.ok) {
      issues.push({ matricule: s.matricule, employee_name: s.employee_name, reason: acc.reason });
      continue;
    }
    lines.push({
      slip_id: s.id,
      employee_id: s.employee_id,
      matricule: s.matricule,
      employee_name: s.employee_name,
      account: acc.account,
      amount: Math.round(s.net_payable * 100) / 100,
    });
  }
  const total = Math.round(lines.reduce((sum, l) => sum + l.amount, 0) * 100) / 100;
  return { lines, issues, total, skippedDraft, skippedBatched };
}

/** Upper-case ASCII, as expected by bank / Algérie Poste bulk-transfer systems. */
export function asciiName(name: string, width: number) {
  const clean = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9 '-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
  return clean.slice(0, width).padEnd(width, " ");
}

const centimes = (amount: number, width: number) => String(Math.round(amount * 100)).padStart(width, "0");

export type TransferFileInput = {
  mode: TransferMode;
  batchNo: string;
  employerName: string;
  debitAccount: string;
  valueDate: string;
  label: string;
  lines: readonly TransferLine[];
};

export const TRANSFER_FORMATS: Record<TransferMode, { code: string; ext: string; label: string }> = {
  CCP: { code: "CCP_TXT_V1", ext: "txt", label: "CCP · texte à positions fixes" },
  BANK: { code: "BANK_CSV_V1", ext: "csv", label: "Banque · CSV (;)" },
};

/**
 * CCP_TXT_V1 (fixed width, CRLF):
 *  H | debit account (12) | value date YYYYMMDD | line count (6) | total centimes (15) | employer (35) | batch no (12)
 *  D | account+key (12) | beneficiary (35) | amount centimes (15) | label (30) | matricule (10)
 *  T | line count (6) | total centimes (15)
 * BANK_CSV_V1: header row then RIB;Beneficiaire;Montant;Libelle;Matricule (amount with 2 decimals, dot).
 */
export function buildTransferFile(input: TransferFileInput) {
  const date = input.valueDate.replace(/-/g, "");
  const total = input.lines.reduce((s, l) => s + Math.round(l.amount * 100), 0) / 100;
  const count = input.lines.length;
  let content: string;
  if (input.mode === "CCP") {
    const rows = [
      [
        "H",
        digits(input.debitAccount).padStart(12, "0").slice(-12),
        date,
        String(count).padStart(6, "0"),
        centimes(total, 15),
        asciiName(input.employerName, 35),
        input.batchNo.replace(/[^A-Za-z0-9]/g, "").padEnd(12, " ").slice(0, 12),
      ].join(""),
      ...input.lines.map((l) =>
        [
          "D",
          l.account.padStart(12, "0"),
          asciiName(l.employee_name, 35),
          centimes(l.amount, 15),
          asciiName(input.label, 30),
          asciiName(l.matricule, 10),
        ].join(""),
      ),
      ["T", String(count).padStart(6, "0"), centimes(total, 15)].join(""),
    ];
    content = rows.join("\r\n") + "\r\n";
  } else {
    const esc = (v: string) => (/[;"\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
    const rows = [
      "RIB;Beneficiaire;Montant;Libelle;Matricule",
      ...input.lines.map((l) =>
        [l.account, asciiName(l.employee_name, 60).trim(), l.amount.toFixed(2), asciiName(input.label, 60).trim(), l.matricule]
          .map(esc)
          .join(";"),
      ),
    ];
    content = rows.join("\r\n") + "\r\n";
  }
  const fmt = TRANSFER_FORMATS[input.mode];
  return {
    content,
    format: fmt.code,
    fileName: `VIR_${input.mode}_${input.batchNo.replace(/[^A-Za-z0-9]/g, "")}_${date}.${fmt.ext}`,
    count,
    total: Math.round(total * 100) / 100,
  };
}
