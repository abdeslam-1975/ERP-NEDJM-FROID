/** ok=match · warn=one of date/amount differs · bad=both differ · unknown=unreadable */
export type BonCheckStatus = "idle" | "checking" | "ok" | "warn" | "bad" | "unknown";

export type BonExtract = {
  dates: string[];
  amounts: number[];
  preferredDate: string | null;
  preferredAmount: number | null;
  rawText: string;
};

export type BonCheckResult = {
  status: Exclude<BonCheckStatus, "idle" | "checking">;
  message: string;
  dateMatch: boolean | null;
  amountMatch: boolean | null;
  detectedDate: string | null;
  detectedAmount: number | null;
};

/** Tolérance OCR / arrondi lignes (ex. 1 000 vs 1000,00). */
const AMOUNT_TOLERANCE = 1.01;

/** Corrige O/I/l/S… seulement dans un jeton qui commence par un chiffre (pas la fin de « total »). */
function fixOcrDigitsInNumberTokens(raw: string): string {
  return raw.replace(/\d[0-9OoОοIl|SsBbZz.,\s\u00a0]*/g, (chunk) =>
    chunk
      .replace(/[OoОο]/g, "0")
      .replace(/[Il|！]/g, "1")
      .replace(/[Ss]/g, "5")
      .replace(/[Bb]/g, "8")
      .replace(/[Zz]/g, "2"),
  );
}

function normalizeOcrText(text: string): string {
  return fixOcrDigitsInNumberTokens(text)
    .replace(/\u00a0/g, " ")
    .replace(/[–—−]/g, "-")
    .replace(/[•·]/g, ".")
    // OCR colle parfois "1 2 450,00" → "12 450,00"
    .replace(/(\d)\s(?=\d\s\d{3}\b)/g, "$1")
    .replace(/(\d)\s([.,])\s(\d)/g, "$1$2$3");
}

/** Dates ISO from FR / ISO patterns commonly found on Algerian receipts. */
export function extractIsoDates(text: string): string[] {
  const out: string[] = [];
  const fixed = normalizeOcrText(text);
  for (const m of fixed.matchAll(/\b((?:19|20)\d{2})[.\-/](0[1-9]|1[0-2])[.\-/](0[1-9]|[12]\d|3[01])\b/g)) {
    out.push(`${m[1]}-${m[2]}-${m[3]}`);
  }
  for (const m of fixed.matchAll(/\b(0[1-9]|[12]\d|3[01])[.\-/](0[1-9]|1[0-2])[.\-/]((?:19|20)\d{2})\b/g)) {
    out.push(`${m[3]}-${m[2]}-${m[1]}`);
  }
  return [...new Set(out)];
}

function parseAmountToken(raw: string): number | null {
  let token = raw.trim().replace(/[\s\u00a0]/g, "");
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

/** Long integers without decimals are usually document / invoice numbers, not totals. */
function looksLikeDocumentNumber(token: string, value: number): boolean {
  const compact = token.replace(/[\s\u00a0]/g, "");
  if (/[.,]/.test(compact)) return false;
  if (compact.length >= 6) return true;
  if (value >= 100_000) return true;
  // Années ISO souvent lues comme montants
  if (value >= 1900 && value <= 2100 && Number.isInteger(value)) return true;
  return false;
}

const AMOUNT_TOKEN = String.raw`(\d{1,3}(?:[ .\u00a0]\d{3})*(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?)`;

/** Collect monetary amounts; prefer values near TOTAL / TTC / NET labels. */
export function extractAmounts(text: string): { all: number[]; preferred: number | null } {
  const fixed = normalizeOcrText(text);
  const all: number[] = [];
  const re = new RegExp(String.raw`(?<!\d)${AMOUNT_TOKEN}(?!\d)`, "g");
  for (const m of fixed.matchAll(re)) {
    const token = m[1] || "";
    const value = parseAmountToken(token);
    if (value == null || value < 1) continue;
    if (looksLikeDocumentNumber(token, value)) continue;
    all.push(value);
  }
  const unique = [...new Set(all)];

  const labeled: number[] = [];
  const labelRe = new RegExp(
    String.raw`(?:total\s*ttc|net\s*[àa]\s*payer|montant\s*ttc|montant\s*total|prix\s*bon|total\s*general|total\s*général|total\s*ht|\btotaux\b|\btotal\b|\bttc\b|المبلغ|المجموع)\s*[:\-]?\s*${AMOUNT_TOKEN}?`,
    "gi",
  );
  for (const m of fixed.matchAll(labelRe)) {
    if (m[1]) {
      const value = parseAmountToken(m[1]);
      if (value != null && !looksLikeDocumentNumber(m[1], value)) labeled.push(value);
      continue;
    }
    // Label found but amount on the next line (common on scanned bons).
    const after = fixed.slice(m.index! + m[0].length, m.index! + m[0].length + 80);
    const next = after.match(new RegExp(String.raw`${AMOUNT_TOKEN}`));
    if (next?.[1]) {
      const value = parseAmountToken(next[1]);
      if (value != null && !looksLikeDocumentNumber(next[1], value)) labeled.push(value);
    }
  }

  // Montants suivis de DA / DZD / دج (très fréquent sur bons algériens)
  const currencyRe = new RegExp(
    String.raw`${AMOUNT_TOKEN}\s*(?:DA|DZD|D\.?A\.?|Dinars?|د\.?\s*ج)`,
    "gi",
  );
  for (const m of fixed.matchAll(currencyRe)) {
    const value = parseAmountToken(m[1] || "");
    if (value != null && !looksLikeDocumentNumber(m[1] || "", value)) {
      labeled.push(value);
      if (!unique.includes(value)) unique.push(value);
    }
  }

  const moneyLike = unique.filter((value) => value >= 10 || labeled.includes(value));
  // Le dernier label peut être un faux positif court (« 12 » dans « 12 450 ») → préférer le max labellisé.
  const preferred = labeled.length
    ? Math.max(...labeled)
    : moneyLike.length
      ? Math.max(...moneyLike)
      : unique.length
        ? Math.max(...unique)
        : null;
  return { all: unique, preferred };
}

export function amountVariants(amount: number): string[] {
  const rounded = Math.round(amount * 100) / 100;
  const fixed2 = rounded.toFixed(2);
  const [intPart, dec = "00"] = fixed2.split(".");
  const withSpaces = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  const variants = new Set<string>([
    fixed2,
    fixed2.replace(".", ","),
    `${withSpaces},${dec}`,
    `${withSpaces}.${dec}`,
    intPart,
    withSpaces,
  ]);
  if (dec === "00") {
    variants.add(`${intPart},00`);
    variants.add(`${intPart}.00`);
    variants.add(`${withSpaces},00`);
    variants.add(`${withSpaces}.00`);
  }
  return [...variants];
}

/** True if OCR text clearly contains the operation amount (even when structured parse missed it). */
export function textMentionsAmount(text: string, amount: number): boolean {
  if (!Number.isFinite(amount) || amount <= 0) return false;
  const fixed = normalizeOcrText(text).replace(/\u00a0/g, " ");
  for (const variant of amountVariants(amount)) {
    const escaped = variant.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ /g, String.raw`[\s\u00a0]*`);
    const re = new RegExp(String.raw`(?<!\d)${escaped}(?!\d)`);
    if (re.test(fixed)) return true;
  }
  // Reparse OCR amounts (espaces / virgules bizarres) et comparer numériquement
  const parsed = extractAmounts(fixed);
  if (parsed.all.some((value) => amountsClose(value, amount))) return true;
  // Forme compacte : 1250.5 → "12505" / "125050" dans le flux de chiffres
  const compactText = fixed.replace(/[^\d]/g, "");
  const cents = Math.round(amount * 100);
  const asInt = Math.round(amount);
  const needles = [`${cents}`, `${asInt}00`, `${asInt}`];
  for (const needle of needles) {
    if (needle.length >= 3 && compactText.includes(needle)) return true;
  }
  return false;
}

export function textMentionsDate(text: string, isoDate: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return false;
  const [y, m, d] = isoDate.split("-");
  const fixed = normalizeOcrText(text);
  const patterns = [
    `${d}/${m}/${y}`,
    `${d}-${m}-${y}`,
    `${d}.${m}.${y}`,
    `${y}-${m}-${d}`,
    `${y}/${m}/${d}`,
  ];
  return patterns.some((pattern) => fixed.includes(pattern));
}

function preferredDateFromText(text: string, dates: string[]): string | null {
  if (!dates.length) return null;
  const fixed = normalizeOcrText(text);
  const labeled = fixed.match(
    /date\s*(?:piece|pi[eè]ce|facture|bon)?\s*[:\-]?\s*(0[1-9]|[12]\d|3[01])[.\-/](0[1-9]|1[0-2])[.\-/]((?:19|20)\d{2})/i,
  );
  if (labeled) {
    const iso = `${labeled[3]}-${labeled[2]}-${labeled[1]}`;
    if (dates.includes(iso)) return iso;
  }
  return dates[0] ?? null;
}

export function extractBonFields(text: string): BonExtract {
  const dates = extractIsoDates(text);
  const amounts = extractAmounts(text);
  return {
    dates,
    amounts: amounts.all,
    preferredDate: preferredDateFromText(text, dates),
    preferredAmount: amounts.preferred,
    rawText: text,
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
  rawText?: string;
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
  const rawText = input.rawText || "";

  let dateMatch: boolean | null = dates.length ? dates.includes(input.opDate) : null;
  let amountMatch: boolean | null = amounts.length
    ? amounts.some((value) => amountsClose(value, input.opAmount))
    : null;

  // Fallback: scanned PDF OCR often mangles layout but still shows the exact total/date.
  if (rawText) {
    if (dateMatch !== true && textMentionsDate(rawText, input.opDate)) dateMatch = true;
    if (amountMatch !== true && textMentionsAmount(rawText, input.opAmount)) amountMatch = true;
  }

  const detectedDate =
    (dateMatch ? input.opDate : null) ||
    input.detectedDate ||
    dates[0] ||
    null;
  const detectedAmount =
    (amountMatch
      ? amounts.find((value) => amountsClose(value, input.opAmount)) ??
        (amountMatch ? input.opAmount : null)
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
    const bothWrong = dateMatch === false && amountMatch === false;
    return {
      status: bothWrong ? "bad" : "warn",
      message: bothWrong
        ? `Écart total — date et montant du bon ≠ opération (${problems.join(" · ")})`
        : `Attention admin : ${problems.join(" · ")}`,
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
      status: "unknown",
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
