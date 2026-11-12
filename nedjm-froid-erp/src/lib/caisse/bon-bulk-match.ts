import { amountsClose, textMentionsAmount, textMentionsDate } from "@/lib/caisse/bon-check";

export type BonAttachTarget = {
  operationId: string;
  op: number;
  date: string;
  amount: number;
  buyer: string;
  hasPhoto: boolean;
};

export type BonMatchKind = "unique" | "ambiguous" | "already" | "none" | "unreadable";

export type BonMatchResult = {
  status: BonMatchKind;
  matches: BonAttachTarget[];
  /** Stratégie utilisée (debug / message UI) */
  strategy?: "date+amount" | "amount-only" | "text-amount+date" | "text-amount";
};

function uniqById(rows: BonAttachTarget[]): BonAttachTarget[] {
  const seen = new Set<string>();
  const out: BonAttachTarget[] = [];
  for (const row of rows) {
    if (seen.has(row.operationId)) continue;
    seen.add(row.operationId);
    out.push(row);
  }
  return out;
}

function classify(matches: BonAttachTarget[], strategy: BonMatchResult["strategy"]): BonMatchResult {
  const open = matches.filter((row) => !row.hasPhoto);
  if (open.length === 1) return { status: "unique", matches: open, strategy };
  if (open.length > 1) return { status: "ambiguous", matches: open, strategy };
  const closed = matches.filter((row) => row.hasPhoto);
  if (closed.length === 1) return { status: "already", matches: closed, strategy };
  if (closed.length > 1) return { status: "ambiguous", matches: closed, strategy };
  return { status: "none", matches: [], strategy };
}

/**
 * Match un bon aux achats du mois.
 *
 * Auto-lien sûr uniquement si date ET montant correspondent (1 op).
 * Montant seul / texte partiel → suggestions manuelles (ambiguous), jamais d’auto-lien
 * (évite d’attacher le même bon sur plusieurs opérations).
 */
export function matchBonToOperations(
  targets: BonAttachTarget[],
  detectedDate: string | null,
  detectedAmount: number | null,
  options?: {
    candidateDates?: string[];
    candidateAmounts?: number[];
    rawText?: string;
  },
): BonMatchResult {
  const dates = [
    ...new Set(
      [detectedDate, ...(options?.candidateDates || [])].filter((value): value is string => !!value),
    ),
  ];
  const amounts = [
    ...new Set(
      [detectedAmount, ...(options?.candidateAmounts || [])].filter(
        (value): value is number => value != null && Number.isFinite(value) && value > 0,
      ),
    ),
  ];
  const rawText = options?.rawText?.trim() || "";

  if (!dates.length && !amounts.length && !rawText) {
    return { status: "unreadable", matches: [] };
  }

  // 1) Date + montant — seul chemin d’auto-lien
  if (dates.length && amounts.length) {
    const hits = targets.filter(
      (row) => dates.includes(row.date) && amounts.some((amount) => amountsClose(row.amount, amount)),
    );
    const result = classify(hits, "date+amount");
    if (result.status === "unique" || result.status === "ambiguous" || result.status === "already") {
      return result;
    }
  }

  // 2) Texte OCR : date + montant de l’op présents ensemble → auto-lien si unique
  if (rawText) {
    const openTargets = targets.filter((row) => !row.hasPhoto);
    const withAmountAndDate = openTargets.filter(
      (row) => textMentionsAmount(rawText, row.amount) && textMentionsDate(rawText, row.date),
    );
    if (withAmountAndDate.length === 1) {
      return { status: "unique", matches: withAmountAndDate, strategy: "text-amount+date" };
    }
    if (withAmountAndDate.length > 1) {
      return { status: "ambiguous", matches: withAmountAndDate, strategy: "text-amount+date" };
    }
  }

  // 3) Suggestions montant seul (jamais auto-lien)
  const suggestions: BonAttachTarget[] = [];
  if (amounts.length) {
    suggestions.push(
      ...targets.filter(
        (row) => !row.hasPhoto && amounts.some((amount) => amountsClose(row.amount, amount)),
      ),
    );
  }
  if (rawText) {
    suggestions.push(
      ...targets.filter((row) => !row.hasPhoto && textMentionsAmount(rawText, row.amount)),
    );
  }
  const openSuggestions = uniqById(suggestions);
  if (openSuggestions.length === 1) {
    return { status: "ambiguous", matches: openSuggestions, strategy: "amount-only" };
  }
  if (openSuggestions.length > 1) {
    return { status: "ambiguous", matches: openSuggestions, strategy: "amount-only" };
  }

  if (amounts.length) {
    const closed = targets.filter(
      (row) => row.hasPhoto && amounts.some((amount) => amountsClose(row.amount, amount)),
    );
    if (closed.length === 1) return { status: "already", matches: closed, strategy: "amount-only" };
  }

  if (!amounts.length && !dates.length) {
    return { status: "unreadable", matches: [] };
  }
  return { status: "none", matches: [] };
}
