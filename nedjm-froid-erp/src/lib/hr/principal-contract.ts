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

function shown(iso: string) {
  return iso.split("-").reverse().join("/");
}

/**
 * A new principal contract is refused while another principal is still open.
 * After the previous one is ended, the new start must fall after its end date.
 * The previous contract is never closed by the new save.
 */
export function planPrincipalClose(
  others: PrincipalContractSpan[],
  next: { id?: string; start_date: string; end_date: string | null; status: string },
):
  | { ok: true; close: { id: string; end_date: string }[] }
  | { ok: false; error: string } {
  if (!OPEN_PRINCIPAL_STATUSES.includes(next.status as (typeof OPEN_PRINCIPAL_STATUSES)[number])) {
    return { ok: true, close: [] };
  }
  for (const other of others) {
    if (other.id === next.id) continue;
    if (OPEN_PRINCIPAL_STATUSES.includes(other.status as (typeof OPEN_PRINCIPAL_STATUSES)[number])) {
      const since = shown(other.start_date);
      return {
        ok: false,
        error: `Ce salarié a un contrat principal encore ouvert (début ${since}). Clôturez-le avant d'en créer un autre. · لهذا العامل عقد رئيسي ما زال مفتوحاً (بداية ${since}). أقفلوه قبل إنشاء عقد جديد.`,
      };
    }
    if (other.status !== "ENDED") continue;
    if (!other.end_date) {
      return {
        ok: false,
        error:
          "Le contrat principal précédent est clôturé sans date de fin. Indiquez sa fin avant le nouveau contrat. · العقد السابق مقفل دون تاريخ نهاية. حدّدوا نهايته قبل العقد الجديد.",
      };
    }
    if (next.start_date <= other.end_date) {
      const end = shown(other.end_date);
      return {
        ok: false,
        error: `Le nouveau contrat doit commencer après la fin du précédent (${end}). · يجب أن يبدأ العقد الجديد بعد نهاية العقد السابق (${end}).`,
      };
    }
  }
  return { ok: true, close: [] };
}

export function isPrincipalExclusionError(message: string) {
  return message.includes("hr_contracts_one_principale_excl");
}
