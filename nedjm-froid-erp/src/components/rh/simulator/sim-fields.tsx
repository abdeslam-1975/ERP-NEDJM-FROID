"use client";

import { useState, type ReactNode } from "react";

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

/** Label row with a modified marker and a reset button. */
export function SimRow({
  label,
  changed,
  onReset,
  hint,
  children,
}: {
  label: string;
  changed?: boolean;
  onReset?: () => void;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_7.5rem] items-center gap-2 py-1">
      <div className="min-w-0">
        <div className="flex items-center gap-1.5 text-xs text-foreground/75">
          {changed ? <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" aria-label="modifié" /> : null}
          <span className="truncate" title={label}>
            {label}
          </span>
          {changed && onReset ? <ResetButton onClick={onReset} label={label} /> : null}
        </div>
        {hint ? <p className="truncate text-[11px] text-foreground/45">{hint}</p> : null}
      </div>
      <div>{children}</div>
    </div>
  );
}

export function NumField({
  label,
  value,
  initial,
  onChange,
  suffix,
  decimals = 2,
  hint,
}: {
  label: string;
  value: number;
  initial: number;
  onChange: (value: number) => void;
  suffix?: string;
  decimals?: number;
  hint?: string;
}) {
  return (
    <SimRow label={label} hint={hint} changed={Math.abs(value - initial) > 1e-9} onReset={() => onChange(initial)}>
      <div className="flex items-center gap-1">
        <NumInput value={value} onChange={onChange} decimals={decimals} ariaLabel={label} />
        {suffix ? <span className="w-6 shrink-0 text-[11px] text-foreground/50">{suffix}</span> : null}
      </div>
    </SimRow>
  );
}

/** Decimal rate edited as a percentage (0.09 ↔ 9 %). */
export function PctField(props: {
  label: string;
  value: number;
  initial: number;
  onChange: (value: number) => void;
  hint?: string;
}) {
  const toPct = (v: number) => Math.round(v * 1_000_000) / 10_000;
  return (
    <NumField
      label={props.label}
      hint={props.hint}
      value={toPct(props.value)}
      initial={toPct(props.initial)}
      onChange={(pct) => props.onChange(Math.round(pct * 10_000) / 1_000_000)}
      suffix="%"
      decimals={4}
    />
  );
}

export function ToggleField({
  label,
  value,
  initial,
  onChange,
}: {
  label: string;
  value: boolean;
  initial: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <SimRow label={label} changed={value !== initial} onReset={() => onChange(initial)}>
      <label className="flex h-8 items-center justify-end gap-2 text-xs text-foreground/70">
        {value ? "Oui" : "Non"}
        <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 accent-brand" />
      </label>
    </SimRow>
  );
}

export function SimGroup({
  title,
  badge,
  defaultOpen = true,
  children,
}: {
  title: string;
  badge?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  return (
    <details open={defaultOpen} className="group rounded-xl border border-border/70 bg-surface">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5 text-sm font-semibold">
        <span className="flex items-center gap-2">
          <span className="h-3.5 w-1 rounded-full bg-brand" />
          {title}
        </span>
        <span className="flex items-center gap-2">
          {badge}
          <span className="text-foreground/40 transition group-open:rotate-90">›</span>
        </span>
      </summary>
      <div className="border-t border-border/60 px-3 py-2">{children}</div>
    </details>
  );
}
