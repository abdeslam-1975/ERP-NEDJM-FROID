import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Fragment } from "react";

/* —— tokens (Tailwind) —— */
export const rhInput =
  "mt-1.5 h-10 w-full rounded-xl border border-border/80 bg-surface px-3.5 text-sm text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] outline-none transition placeholder:text-foreground/35 focus:border-brand focus:ring-4 focus:ring-brand/10";

export const rhSelect = rhInput;

export function bi(fr: string, _ar?: string) {
  // UI RH : libellés d'action / chrome en français uniquement
  return fr;
}

export function RhField({
  label,
  children,
  hint,
  required,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
  required?: boolean;
}) {
  return (
    <label className="block text-[11px] font-semibold uppercase tracking-[0.06em] text-foreground/55">
      <span className="inline-flex items-center gap-1 normal-case tracking-normal text-xs font-medium text-foreground/75">
        {label}
        {required ? <span className="text-alert-critical">*</span> : null}
      </span>
      {children}
      {hint ? <span className="mt-1 block text-[11px] font-normal normal-case tracking-normal text-foreground/45">{hint}</span> : null}
    </label>
  );
}

export type CatalogOption = {
  kind: string;
  code: string;
  label_fr: string;
  label_ar: string;
  is_active: boolean;
  extra?: Record<string, unknown> | null;
  sort_order?: number;
};

/** Affiche FR — AR sans doublon (ex. A+ A+ → A+). */
export function catalogOptionLabel(o: Pick<CatalogOption, "label_fr" | "label_ar">) {
  const fr = (o.label_fr ?? "").trim();
  const ar = (o.label_ar ?? "").trim();
  if (!fr) return ar || "—";
  if (!ar || ar === fr) return fr;
  return `${fr} — ${ar}`;
}

export function catalogOptions<T extends CatalogOption>(items: T[], kind: string) {
  return items
    .filter((i) => i.kind === kind && i.is_active)
    .slice()
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.label_fr.localeCompare(b.label_fr, "fr"));
}

export function CatalogSelect<T extends CatalogOption>({
  items,
  kind,
  value,
  onChange,
  allowEmpty = true,
  className,
}: {
  items: T[];
  kind: string;
  value: string;
  onChange: (value: string) => void;
  allowEmpty?: boolean;
  className?: string;
}) {
  const opts = catalogOptions(items, kind);
  const known = opts.some((o) => o.code === value);

  const grouped = new Map<string, T[]>();
  let hasGroups = false;
  for (const o of opts) {
    const cat = String(o.extra?.category_fr ?? "").trim();
    if (cat) hasGroups = true;
    const key = cat || "";
    const list = grouped.get(key) ?? [];
    list.push(o);
    grouped.set(key, list);
  }

  function renderOptions(list: T[]) {
    return list.map((o) => (
      <option key={o.code} value={o.code}>
        {catalogOptionLabel(o)}
      </option>
    ));
  }

  return (
    <select
      className={className ?? rhInput}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      {allowEmpty ? <option value="">—</option> : null}
      {value && !known ? <option value={value}>{value}</option> : null}
      {hasGroups
        ? [...grouped.entries()].map(([cat, list]) =>
            cat ? (
              <optgroup key={cat} label={cat}>
                {renderOptions(list)}
              </optgroup>
            ) : (
              <Fragment key="__ungrouped">{renderOptions(list)}</Fragment>
            ),
          )
        : renderOptions(opts)}
    </select>
  );
}

/* —— layout primitives —— */

export function RhPage({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rh-scope space-y-5 ${className}`}>{children}</div>;
}

export function RhPageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0 space-y-1.5">
        {eyebrow ? (
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-brand">
            {eyebrow}
          </p>
        ) : null}
        <h2 className="font-display text-2xl font-semibold tracking-tight text-foreground sm:text-[1.7rem]">
          {title}
        </h2>
        {description ? (
          <div className="max-w-2xl text-sm leading-relaxed text-foreground/60">{description}</div>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function RhPanel({
  children,
  className = "",
  padded = true,
}: {
  children: ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return (
    <div
      className={`overflow-hidden rounded-2xl border border-border/80 bg-surface shadow-[var(--card-shadow)] ${
        padded ? "p-4 sm:p-5" : ""
      } ${className}`}
    >
      {children}
    </div>
  );
}

export function RhToolbar({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border/60 bg-surface/80 p-2.5 backdrop-blur-sm">
      {children}
    </div>
  );
}

export function RhTabs({
  items,
  value,
  onChange,
}: {
  items: { id: string; label: string }[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <div
      role="tablist"
      className="flex flex-wrap gap-1 rounded-2xl border border-border/60 bg-surface-muted/60 p-1"
    >
      {items.map((item) => {
        const active = item.id === value;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={active}
            className={`rounded-xl px-3.5 py-2 text-sm font-semibold transition ${
              active
                ? "bg-brand text-white shadow-sm shadow-brand/25"
                : "text-foreground/65 hover:bg-surface hover:text-foreground"
            }`}
            onClick={() => onChange(item.id)}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

export function RhAlert({
  tone = "danger",
  children,
}: {
  tone?: "danger" | "success" | "warning" | "info";
  children: ReactNode;
}) {
  const styles = {
    danger: "border-red-200/80 bg-red-50 text-red-900 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-100",
    success:
      "border-emerald-200/80 bg-emerald-50 text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/40 dark:text-emerald-100",
    warning:
      "border-amber-200/80 bg-amber-50 text-amber-950 dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-100",
    info: "border-sky-200/80 bg-sky-50 text-sky-950 dark:border-sky-900/40 dark:bg-sky-950/40 dark:text-sky-100",
  }[tone];
  return (
    <div className={`rounded-xl border px-4 py-3 text-sm leading-relaxed ${styles}`}>{children}</div>
  );
}

export function RhEmpty({ title, body }: { title: string; body?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-muted text-brand">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M7 8h10M7 12h7M5 4h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
      </div>
      <p className="font-display text-base font-semibold text-foreground">{title}</p>
      {body ? <p className="max-w-sm text-sm text-foreground/55">{body}</p> : null}
    </div>
  );
}

export function RhTableWrap({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-border/70 bg-surface">
      {children}
    </div>
  );
}

export function rhTh() {
  return "px-3.5 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-foreground/45";
}

export function rhTd() {
  return "px-3.5 py-3 align-middle text-sm text-foreground/85";
}

export function RhModal({
  title,
  subtitle,
  tabs,
  children,
  footer,
  onClose,
  wide = false,
  size,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  tabs?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
  wide?: boolean;
  /** xl = fiche employé / large forms */
  size?: "md" | "lg" | "xl";
}) {
  const maxW =
    size === "xl" || (wide && !size)
      ? "sm:max-w-[min(100rem,98vw)]"
      : size === "lg"
        ? "sm:max-w-5xl"
        : wide
          ? "sm:max-w-5xl"
          : "sm:max-w-3xl";

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center bg-slate-950/50 p-0 backdrop-blur-md sm:items-stretch sm:p-2 lg:p-3">
      <div
        role="dialog"
        aria-modal="true"
        className={`flex h-[100dvh] w-full flex-col overflow-hidden border border-white/40 bg-surface shadow-[0_24px_80px_-20px_rgba(15,23,42,0.45)] ring-1 ring-black/5 sm:h-[calc(100dvh-1rem)] sm:rounded-[1.15rem] lg:h-[calc(100dvh-1.5rem)] ${maxW}`}
      >
        <div className="h-1 w-full shrink-0 bg-gradient-to-r from-brand via-[#5b8aff] to-brand/40" />
        <div className="shrink-0 border-b border-border/50 bg-[linear-gradient(180deg,color-mix(in_oklab,var(--surface)_92%,white)_0%,var(--surface-muted)_100%)] px-4 pb-2.5 pt-3 sm:px-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h3 className="font-display text-base font-semibold tracking-tight text-foreground sm:text-lg">
                {title}
              </h3>
              {subtitle ? (
                <div className="mt-1 text-sm text-foreground/55">{subtitle}</div>
              ) : null}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-border/70 bg-surface/80 text-foreground/60 shadow-sm transition hover:bg-surface-muted hover:text-foreground"
              aria-label="Fermer"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
                <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            </button>
          </div>
          {tabs ? <div className="mt-3.5">{tabs}</div> : null}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-[radial-gradient(1200px_400px_at_50%_-10%,color-mix(in_oklab,var(--color-brand-muted)_70%,transparent),transparent)] px-2 py-2 sm:px-4 sm:py-2.5">
          {children}
        </div>
        {footer ? (
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-border/50 bg-surface/90 px-3 py-2 backdrop-blur-md sm:px-4">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function RhChip({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "brand" | "success" | "warning" | "danger";
}) {
  const map = {
    neutral: "bg-surface-muted text-foreground/70",
    brand: "bg-brand-muted text-brand",
    success: "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200",
    warning: "bg-amber-50 text-amber-900 dark:bg-amber-950/50 dark:text-amber-100",
    danger: "bg-red-50 text-red-800 dark:bg-red-950/50 dark:text-red-100",
  }[tone];
  return (
    <span className={`inline-flex items-center rounded-lg px-2 py-0.5 text-xs font-semibold ${map}`}>
      {children}
    </span>
  );
}

export function RhIconButton(props: ButtonHTMLAttributes<HTMLButtonElement>) {
  const { className = "", children, ...rest } = props;
  return (
    <button
      type="button"
      className={`inline-flex h-10 w-10 items-center justify-center rounded-xl border border-border/70 bg-surface text-foreground/70 transition hover:bg-surface-muted hover:text-foreground disabled:opacity-50 ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

export function RhSectionTitle({ children }: { children: ReactNode }) {
  return (
    <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
      <span className="h-4 w-1 rounded-full bg-brand" />
      {children}
    </h4>
  );
}

export function RhStat({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border/60 bg-surface px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-foreground/45">
        {label}
      </p>
      <p className="mt-1 font-display text-2xl font-semibold tabular-nums text-foreground">{value}</p>
    </div>
  );
}
