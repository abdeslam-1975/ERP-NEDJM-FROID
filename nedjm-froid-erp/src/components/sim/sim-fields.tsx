"use client";

import { useState } from "react";

const inputClass =
  "h-8 w-full rounded-lg border border-border/80 bg-surface px-2.5 text-right text-sm tabular-nums outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/15";

export const simSelectClass =
  "h-8 w-full rounded-lg border border-border/80 bg-surface px-2 text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/15";

function parseNumber(text: string) {
  const n = Number(text.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function display(value: number, decimals: number) {
  return String(Math.round(value * 10 ** decimals) / 10 ** decimals);
}

/** Number input that keeps what the user types ("12," …) and follows external resets. */
export function NumInput({
  value,
  onChange,
  decimals = 2,
  min,
  className = "",
  ariaLabel,
}: {
  value: number;
  onChange: (value: number) => void;
  decimals?: number;
  min?: number;
  className?: string;
  ariaLabel?: string;
}) {
  const [text, setText] = useState(display(value, decimals));
  const [synced, setSynced] = useState(value);
  if (synced !== value) {
    setSynced(value);
    if (parseNumber(text) !== value) setText(display(value, decimals));
  }
  return (
    <input
      inputMode="decimal"
      aria-label={ariaLabel}
      className={`${inputClass} ${className}`}
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        const n = parseNumber(e.target.value);
        if (n == null || (min != null && n < min)) return;
        setSynced(n);
        onChange(n);
      }}
      onBlur={() => setText(display(value, decimals))}
    />
  );
}

export function ResetButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={`Rétablir ${label}`}
      aria-label={`Rétablir ${label}`}
      className="inline-flex h-5 w-5 items-center justify-center rounded-md text-[13px] leading-none text-brand hover:bg-brand-muted"
    >
      ↺
    </button>
  );
}
