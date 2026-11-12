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

/** Parmi plusieurs ops dont le montant apparaît sur le bon, garder le groupe au montant le plus élevé (souvent le total). */
function pickLargestAmountGroup(rows: BonAttachTarget[]): BonAttachTarget[] {
  if (rows.length <= 1) return rows;
  let best = rows[0]!.amount;
  for (const row of rows) {
    if (row.amount > best) best = row.amount;
  }
  return rows.filter((row) => amountsClose(row.amount, best));
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
 * Ordre : date+montant (tous candidats) → montant seul s’il est unique →
 * présence du montant (et date) dans le texte OCR brut.
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

  // 1) Date + montant exacts (tous les couples candidats)
  if (dates.length && amounts.length) {
    const hits = targets.filter(
      (row) => dates.includes(row.date) && amounts.some((amount) => amountsClose(row.amount, amount)),
    );
    const result = classify(hits, "date+amount");
    if (result.status === "unique" || result.status === "ambiguous" || result.status === "already") {
      return result;
    }
  }

  // 2) Montant seul s’il ne pointe qu’une opération sans photo
  //    Si l’OCR a une date qui contredit l’op → pas d’auto-lien (évite faux positifs).
  if (amounts.length) {
    const byAmount = targets.filter((row) => amounts.some((amount) => amountsClose(row.amount, amount)));
    const open = byAmount.filter((row) => !row.hasPhoto);
    if (open.length === 1) {
      const only = open[0]!;
      if (dates.length && !dates.includes(only.date)) {
        return { status: "ambiguous", matches: open, strategy: "amount-only" };
      }
      return { status: "unique", matches: open, strategy: "amount-only" };
    }
    if (open.length > 1) {
      const dated = dates.length ? open.filter((row) => dates.includes(row.date)) : [];
      if (dated.length === 1) return { status: "unique", matches: dated, strategy: "date+amount" };
      if (dated.length > 1) return { status: "ambiguous", matches: dated, strategy: "date+amount" };
      // Dates OCR incorrectes / absentes : choix manuel sur le montant
      return { status: "ambiguous", matches: open, strategy: "amount-only" };
    }
    if (!open.length) {
      const closed = byAmount.filter((row) => row.hasPhoto);
      if (closed.length === 1) return { status: "already", matches: closed, strategy: "amount-only" };
    }
  }

  // 3) Texte OCR : le montant de l’opération apparaît clairement
  //    (plusieurs montants de lignes peuvent apparaître → on préfère total / plus grand)
  if (rawText) {
    const openTargets = targets.filter((row) => !row.hasPhoto);
    const withAmountAndDate = openTargets.filter(
      (row) => textMentionsAmount(rawText, row.amount) && textMentionsDate(rawText, row.date),
    );
    if (withAmountAndDate.length === 1) {
      return { status: "unique", matches: withAmountAndDate, strategy: "text-amount+date" };
    }
    if (withAmountAndDate.length > 1) {
      const preferred =
        detectedAmount != null
          ? withAmountAndDate.filter((row) => amountsClose(row.amount, detectedAmount))
          : amounts.length
            ? withAmountAndDate.filter((row) => amounts.some((amount) => amountsClose(row.amount, amount)))
            : [];
      const narrowed = preferred.length ? preferred : pickLargestAmountGroup(withAmountAndDate);
      const result = classify(narrowed, "text-amount+date");
      if (result.status !== "none") return result;
    }

    const withAmount = openTargets.filter((row) => textMentionsAmount(rawText, row.amount));
    const uniqueRows = uniqById(withAmount);
    if (!uniqueRows.length) {
      // no-op
    } else {
      const preferredHits =
        detectedAmount != null
          ? uniqueRows.filter((row) => amountsClose(row.amount, detectedAmount))
          : amounts.length
            ? uniqueRows.filter((row) => amounts.some((amount) => amountsClose(row.amount, amount)))
            : [];
      const narrowed = preferredHits.length ? preferredHits : pickLargestAmountGroup(uniqueRows);
      const amountKeys = [...new Set(narrowed.map((row) => row.amount.toFixed(2)))];
      if (amountKeys.length === 1 && narrowed.length === 1) {
        return { status: "unique", matches: narrowed, strategy: "text-amount" };
      }
      if (narrowed.length > 1 && amountKeys.length === 1) {
        return { status: "ambiguous", matches: narrowed, strategy: "text-amount" };
      }
      if (narrowed.length === 1) {
        return { status: "unique", matches: narrowed, strategy: "text-amount" };
      }
    }
  }

  if (!amounts.length && !dates.length) {
    return { status: "unreadable", matches: [] };
  }
  return { status: "none", matches: [] };
}
