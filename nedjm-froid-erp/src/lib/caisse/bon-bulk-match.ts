import { amountsClose } from "@/lib/caisse/bon-check";

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
};

/** Match a bon (date + amount) to ACHAT operations of the month. Prefer ops without photo. */
export function matchBonToOperations(
  targets: BonAttachTarget[],
  detectedDate: string | null,
  detectedAmount: number | null,
): BonMatchResult {
  if (!detectedDate || detectedAmount == null || !Number.isFinite(detectedAmount)) {
    return { status: "unreadable", matches: [] };
  }

  const withoutPhoto = targets.filter(
    (row) => !row.hasPhoto && row.date === detectedDate && amountsClose(row.amount, detectedAmount),
  );
  if (withoutPhoto.length === 1) return { status: "unique", matches: withoutPhoto };
  if (withoutPhoto.length > 1) return { status: "ambiguous", matches: withoutPhoto };

  const withPhoto = targets.filter(
    (row) => row.hasPhoto && row.date === detectedDate && amountsClose(row.amount, detectedAmount),
  );
  if (withPhoto.length === 1) return { status: "already", matches: withPhoto };
  if (withPhoto.length > 1) return { status: "ambiguous", matches: withPhoto };

  return { status: "none", matches: [] };
}
