export type BonCheckStatus = "idle" | "checking" | "ok" | "warn" | "unknown";

export type BonExtract = {
  dates: string[];
  amounts: number[];
  preferredDate: string | null;
  preferredAmount: number | null;
};

export type BonCheckResult = {
  status: Exclude<BonCheckStatus, "idle" | "checking">;
  message: string;
  dateMatch: boolean | null;
  amountMatch: boolean | null;
  detectedDate: string | null;
  detectedAmount: number | null;
};

const AMOUNT_TOLERANCE = 0.05;

function fixOcrDigits(raw: string): string {
  return raw
    .replace(/[OoО]/g, "0")
    .replace(/[Il|]/g, "1")
    .replace(/[Ss]/g, "5")
    .replace(/[Bb]/g, "8");
}

/** Dates ISO from FR / ISO patterns commonly found on Algerian receipts. */
export function extractIsoDates(text: string): string[] {
  const out: string[] = [];
  const fixed = fixOcrDigits(text);
  for (const m of fixed.matchAll(/\b((?:19|20)\d{2})[.\-/](0[1-9]|1[0-2])[.\-/](0[1-9]|[12]\d|3[01])\b/g)) {
    out.push(`${m[1]}-${m[2]}-${m[3]}`);
  }
  for (const m of fixed.matchAll(/\b(0[1-9]|[12]\d|3[01])[.\-/](0[1-9]|1[0-2])[.\-/]((?:19|20)\d{2})\b/g)) {
    out.push(`${m[3]}-${m[2]}-${m[1]}`);
  }
  return [...new Set(out)];
}

function parseAmountToken(raw: string): number | null {
  let token = raw.trim().replace(/\s/g, "");
  if (!token) return null;
  if (token.includes(",") && token.includes(".")) {
    // 1.178,50 or 1,178.50
    if (/,(\d{2})$/.test(token)) token = token.replace(/\./g, "").replace(",", ".");
    else token = token.replace(/,/g, "");
  } else if (token.includes(",")) {
    token = token.replace(",", ".");
  }
  const value = Number(token);
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.round(value * 100) / 100;
}

/** Collect monetary amounts; prefer values near TOTAL / TTC / NET labels. */
export function extractAmounts(text: string): { all: number[]; preferred: number | null } {
  const fixed = fixOcrDigits(text);
  const all: number[] = [];
  const re = /(?<!\d)(\d{1,3}(?:[ .\u00a0]\d{3})*(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?)(?!\d)/g;
  for (const m of fixed.matchAll(re)) {
    const value = parseAmountToken(m[1] || "");
    if (value != null && value >= 1) all.push(value);
  }
  const unique = [...new Set(all)];

  const labelRe =
    /(?:total\s*ttc|net\s*[àa]\s*payer|montant\s*ttc|montant\s*total|prix\s*bon|total\s*general|total\s*général|\btotal\b|\bttc\b|المبلغ|المجموع)\s*[:\-]?\s*(\d{1,3}(?:[ .\u00a0]\d{3})*(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?)/gi;
  const labeled: number[] = [];
  for (const m of fixed.matchAll(labelRe)) {
    const value = parseAmountToken(m[1] || "");
    if (value != null) labeled.push(value);
  }

  const preferred = labeled.at(-1) ?? (unique.length ? Math.max(...unique) : null);
  return { all: unique, preferred };
}

export function extractBonFields(text: string): BonExtract {
  const dates = extractIsoDates(text);
  const amounts = extractAmounts(text);
  return {
    dates,
    amounts: amounts.all,
    preferredDate: dates[0] ?? null,
    preferredAmount: amounts.preferred,
  };
}

export function amountsClose(a: number, b: number, tolerance = AMOUNT_TOLERANCE): boolean {
  return Math.abs(a - b) <= tolerance;
}

export function evaluateBonMatch(input: {
  opDate: string;
  opAmount: number;
  detectedDate: string | null;
  detectedAmount: number | null;
  candidateDates?: string[];
  candidateAmounts?: number[];
}): BonCheckResult {
  const dates = input.candidateDates?.length
    ? input.candidateDates
    : input.detectedDate
      ? [input.detectedDate]
      : [];
  const amounts = input.candidateAmounts?.length
    ? input.candidateAmounts
    : input.detectedAmount != null
      ? [input.detectedAmount]
      : [];

  const dateMatch = dates.length ? dates.includes(input.opDate) : null;
  const amountMatch = amounts.length
    ? amounts.some((value) => amountsClose(value, input.opAmount))
    : null;

  const detectedDate =
    (dateMatch ? input.opDate : null) ||
    input.detectedDate ||
    dates[0] ||
    null;
  const detectedAmount =
    (amountMatch
      ? amounts.find((value) => amountsClose(value, input.opAmount)) ?? null
      : null) ||
    input.detectedAmount ||
    amounts[0] ||
    null;

  if (dateMatch === null && amountMatch === null) {
    return {
      status: "unknown",
      message: "Bon lu, mais date/montant non détectés — vérifiez manuellement.",
      dateMatch,
      amountMatch,
      detectedDate,
      detectedAmount,
    };
  }

  const problems: string[] = [];
  if (dateMatch === false) {
    problems.push(
      `date bon ${detectedDate ? formatFr(detectedDate) : "?"} ≠ ${input.opDate ? formatFr(input.opDate) : "?"}`,
    );
  }
  if (amountMatch === false) {
    problems.push(
      `montant bon ${detectedAmount != null ? detectedAmount.toFixed(2) : "?"} ≠ ${input.opAmount.toFixed(2)} DA`,
    );
  }

  if (problems.length) {
    return {
      status: "warn",
      message: `Attention admin : ${problems.join(" · ")}`,
      dateMatch,
      amountMatch,
      detectedDate,
      detectedAmount,
    };
  }

  const partialUnknown =
    (dateMatch === null && amountMatch === true) || (dateMatch === true && amountMatch === null);
  if (partialUnknown) {
    return {
      status: "warn",
      message:
        dateMatch === null
          ? "Montant OK, date non lue sur le bon — vérifiez la date."
          : "Date OK, montant non lu sur le bon — vérifiez le total.",
      dateMatch,
      amountMatch,
      detectedDate,
      detectedAmount,
    };
  }

  return {
    status: "ok",
    message: "Date et montant du bon correspondent à l’opération.",
    dateMatch: true,
    amountMatch: true,
    detectedDate,
    detectedAmount,
  };
}

function formatFr(iso: string): string {
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}
