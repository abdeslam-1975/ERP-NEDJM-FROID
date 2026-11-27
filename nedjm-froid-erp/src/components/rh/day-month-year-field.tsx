"use client";

import { useState } from "react";
import { rhInput } from "@/components/rh/rh-ui";
import { dayFirstToIso, isoToDayFirst, maskDayFirst } from "@/lib/hr/day-first-date";

/** Date written and shown as day / month / year. The stored value stays AAAA-MM-JJ. */
export function DayMonthYearField({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (iso: string) => void;
  className?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);

  return (
    <input
      className={className ? `${rhInput} ${className}` : rhInput}
      dir="ltr"
      inputMode="numeric"
      autoComplete="off"
      placeholder="jj/mm/aaaa"
      value={draft ?? isoToDayFirst(value)}
      onFocus={() => setDraft(isoToDayFirst(value))}
      onBlur={() => setDraft(null)}
      onChange={(event) => {
        const next = maskDayFirst(event.target.value);
        setDraft(next);
        if (!next) {
          onChange("");
          return;
        }
        const iso = dayFirstToIso(next);
        if (iso) onChange(iso);
      }}
    />
  );
}
