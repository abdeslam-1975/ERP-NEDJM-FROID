/** Pure helpers for the bank sheet ledger (GESTION BANQUES). */

export function roundMoney(value: number): number {
  return Math.round((Number(value) || 0) * 100) / 100;
}

export type BankLineAmounts = {
  debit: number;
  credit: number;
  frais: number;
};

/** Sheet formula: previous + debit − credit − frais. */
export function nextRunningBalance(previous: number, line: BankLineAmounts): number {
  return roundMoney(previous + roundMoney(line.debit) - roundMoney(line.credit) - roundMoney(line.frais));
}

export function lineOutflow(line: BankLineAmounts): number {
  return roundMoney(roundMoney(line.credit) + roundMoney(line.frais));
}

export function canAffordOutflow(
  sheetBalance: number,
  outflow: number,
  excludeOutflow = 0,
): { ok: boolean; available: number } {
  const available = roundMoney(sheetBalance + excludeOutflow);
  return {
    ok: outflow <= available + 0.001,
    available,
  };
}

export function buildBcLabel(num: string, dateIso: string | null | undefined): string {
  const n = num.trim();
  if (!n) return "";
  let label = `BC N° ${n}`;
  if (dateIso && /^\d{4}-\d{2}-\d{2}$/.test(dateIso)) {
    label += ` du ${dateIso.split("-").reverse().join("/")}`;
  }
  return label;
}

export function buildFacLabel(num: string, dateIso: string | null | undefined): string {
  const n = num.trim();
  if (!n) return "";
  let label = `FAC N° ${n}`;
  if (dateIso && /^\d{4}-\d{2}-\d{2}$/.test(dateIso)) {
    label += ` du ${dateIso.split("-").reverse().join("/")}`;
  }
  return label;
}

export function buildModeLabel(mode: string, num: string): string {
  const m = mode.trim();
  if (!m) return "";
  const n = num.trim();
  return n ? `${m} N° ${n}` : m;
}

export function buildCautionLibelle(kind: "S-CAUTION" | "B-CAUTION", expiryIso: string | null | undefined): string {
  let lib = kind;
  if (expiryIso && /^\d{4}-\d{2}-\d{2}$/.test(expiryIso)) {
    lib += ` [EXP: ${expiryIso.split("-").reverse().join("/")}]`;
  }
  return lib;
}

export function parseDocField(text: string | null | undefined, prefix: "BC" | "FAC" | "MODE"): {
  num: string;
  date: string;
  mode: string;
} {
  const result = { num: "", date: "", mode: "" };
  if (!text) return result;
  const clean = String(text).replace(/🔗/g, "").trim();
  if (prefix === "MODE") {
    const parts = clean.split(/\s+N°\s*/);
    result.mode = (parts[0] || "").trim();
    result.num = (parts[1] || "").trim();
    return result;
  }
  const regex = new RegExp(`^${prefix}\\s*N°\\s*(.+?)(?:\\s+du\\s+(\\d{2}/\\d{2}/\\d{4}))?$`, "i");
  const m = clean.match(regex);
  if (m) {
    result.num = m[1].trim();
    result.date = m[2] || "";
  }
  return result;
}

export function formatDateFr(isoOrFr: string | null | undefined): string {
  if (!isoOrFr) return "";
  const s = String(isoOrFr).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const [y, m, d] = s.slice(0, 10).split("-");
    return `${d}/${m}/${y}`;
  }
  const parts = s.replace(/[.\-]/g, "/").split("/");
  if (parts.length !== 3) return s;
  const [a, b, c] = parts;
  if (a.length === 4) return `${c.padStart(2, "0")}/${b.padStart(2, "0")}/${a}`;
  return `${a.padStart(2, "0")}/${b.padStart(2, "0")}/${c}`;
}

export function formatDateIso(frOrIso: string | null | undefined): string {
  if (!frOrIso) return "";
  const s = String(frOrIso).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  if (!s.includes("/")) return s;
  const p = s.split("/");
  if (p.length !== 3) return s;
  return `${p[2]}-${p[1].padStart(2, "0")}-${p[0].padStart(2, "0")}`;
}

export function formatDa(value: number): string {
  return roundMoney(value).toLocaleString("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export type CautionAlert = {
  libelle: string;
  expiry: string;
  days: number;
  expired: boolean;
};

/** Sheet radar: expired or due within 7 days. */
export function cautionAlertsFromLibelles(
  rows: { libelle: string }[],
  todayIso: string,
): CautionAlert[] {
  const today = new Date(`${todayIso}T00:00:00`);
  const alerts: CautionAlert[] = [];
  for (const row of rows) {
    const match = row.libelle.match(/\[EXP:\s*(\d{2}\/\d{2}\/\d{4})\]/);
    if (!match) continue;
    const [d, m, y] = match[1].split("/").map(Number);
    const exp = new Date(y, m - 1, d);
    const days = Math.ceil((exp.getTime() - today.getTime()) / 86400000);
    if (days <= 7) {
      alerts.push({
        libelle: row.libelle.split("[")[0].trim(),
        expiry: match[1],
        days,
        expired: days < 0,
      });
    }
  }
  return alerts;
}

export function sumCautionCredits(
  rows: { libelle: string; credit: number }[],
  token: "S-CAUTION" | "B-CAUTION",
): number {
  return roundMoney(
    rows.reduce((sum, row) => (row.libelle.includes(token) ? sum + roundMoney(row.credit) : sum), 0),
  );
}

export function withRunningBalances<T extends BankLineAmounts>(
  openingBalance: number,
  linesAsc: T[],
): (T & { solde: number })[] {
  let prev = roundMoney(openingBalance);
  return linesAsc.map((line) => {
    prev = nextRunningBalance(prev, line);
    return { ...line, solde: prev };
  });
}

/** Excel serial → ISO date in Africa/Algiers calendar day (no UTC day-shift). */
export function excelSerialToIso(serial: number): string {
  const utc = new Date(Math.round((serial - 25569) * 86400 * 1000));
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Algiers",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(utc);
  const y = parts.find((p) => p.type === "year")?.value ?? "1970";
  const m = parts.find((p) => p.type === "month")?.value ?? "01";
  const d = parts.find((p) => p.type === "day")?.value ?? "01";
  return `${y}-${m}-${d}`;
}
