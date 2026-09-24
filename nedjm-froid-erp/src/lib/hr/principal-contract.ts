export const OPEN_PRINCIPAL_STATUSES = ["DRAFT", "ACTIVE", "SUSPENDED"] as const;

export type PrincipalContractSpan = {
  id: string;
  start_date: string;
  end_date: string | null;
  status: string;
};

export function dayBefore(iso: string) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export function rangesOverlap(
  aStart: string,
  aEnd: string | null,
  bStart: string,
  bEnd: string | null,
) {
  const aStop = aEnd ?? "9999-12-31";
  const bStop = bEnd ?? "9999-12-31";
  return aStart <= bStop && bStart <= aStop;
}

export function planPrincipalClose(
  others: PrincipalContractSpan[],
  next: { id?: string; start_date: string; end_date: string | null; status: string },
):
  | { ok: true; close: { id: string; end_date: string }[] }
  | { ok: false; error: string } {
  if (!OPEN_PRINCIPAL_STATUSES.includes(next.status as (typeof OPEN_PRINCIPAL_STATUSES)[number])) {
    return { ok: true, close: [] };
  }
  const close: { id: string; end_date: string }[] = [];
  for (const other of others) {
    if (other.id === next.id) continue;
    if (!OPEN_PRINCIPAL_STATUSES.includes(other.status as (typeof OPEN_PRINCIPAL_STATUSES)[number])) {
      continue;
    }
    if (!rangesOverlap(other.start_date, other.end_date, next.start_date, next.end_date)) {
      continue;
    }
    if (other.start_date >= next.start_date) {
      return {
        ok: false,
        error:
          "Un contrat principal est déjà ouvert sur cette période. Modifiez-le ou terminez-le avant d'en créer un autre. · يوجد عقد رئيسي مفتوح في نفس الفترة. عدّله أو أنهِه قبل إنشاء عقد جديد.",
      };
    }
    const end = dayBefore(next.start_date);
    if (end < other.start_date) {
      return {
        ok: false,
        error:
          "Un contrat principal est déjà ouvert sur cette période. Modifiez-le ou terminez-le avant d'en créer un autre. · يوجد عقد رئيسي مفتوح في نفس الفترة. عدّله أو أنهِه قبل إنشاء عقد جديد.",
      };
    }
    close.push({ id: other.id, end_date: end });
  }
  return { ok: true, close };
}

export function isPrincipalExclusionError(message: string) {
  return message.includes("hr_contracts_one_principale_excl");
}
