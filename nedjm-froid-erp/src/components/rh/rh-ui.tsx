import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Fragment } from "react";
import { Inbox, type LucideIcon } from "lucide-react";
import { UiToolbar } from "@/components/layout/arrange";
export { RhModal, RhTabs } from "@/components/rh/rh-ui-client";

/* —— tokens (Tailwind) —— */
export const rhInput =
  "mt-1.5 h-10 w-full rounded-xl border border-border/80 bg-surface px-3.5 text-sm text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] outline-none transition placeholder:text-foreground/45 focus:border-brand focus:ring-4 focus:ring-brand/10 disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-foreground/75";

export const rhSelect = rhInput;

export function bi(fr: string, ar?: string) {
  // UI RH : libellés d'action / chrome en français uniquement
  void ar;
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
      <span className="inline-flex items-center gap-1 normal-case tracking-normal text-[13px] font-semibold text-foreground/85">
        {label}
        {required ? <span className="text-alert-critical">*</span> : null}
      </span>
      {children}
      {hint ? <span className="mt-1 block text-xs font-normal normal-case tracking-normal text-foreground/60">{hint}</span> : null}
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

export const RH_CARD =
  "rounded-[1.5rem] border border-border/70 bg-[var(--card-bg,var(--surface))] shadow-[var(--card-shadow)]";

export function RhPage({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rh-scope space-y-5 ${className}`}>{children}</div>;
}

export function RhPageHeader({
  eyebrow,
  title,
  description,
  actions,
  actionsTabset,
}: {
  eyebrow?: string;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  /** Level E list of the interface catalogue: the ToolbarSlot buttons of `actions` follow its order. */
  actionsTabset?: string;
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0 space-y-1">
        {eyebrow ? <p className="text-sm font-medium text-foreground/50">{eyebrow}</p> : null}
        <h2 className="font-display text-[1.65rem] leading-tight font-semibold tracking-tight text-foreground sm:text-[1.9rem]">
          {title}
        </h2>
        {description ? (
          <div className="max-w-2xl text-sm leading-relaxed text-foreground/60">{description}</div>
        ) : null}
      </div>
      {actions && actionsTabset ? (
        <UiToolbar tabset={actionsTabset} className="flex flex-wrap items-center gap-2">
          {actions}
        </UiToolbar>
      ) : actions ? (
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      ) : null}
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
      className={`ui-panel overflow-hidden rounded-[calc(var(--radius-2xl)+0.5rem)] border ${padded ? "p-4 sm:p-6" : ""} ${className}`}
    >
      {children}
    </div>
  );
}

export function RhToolbar({ children, tabset }: { children: ReactNode; tabset?: string }) {
  const className = "ui-glass flex flex-wrap items-center gap-2 rounded-2xl p-2.5";
  return tabset ? (
    <UiToolbar tabset={tabset} className={className}>
      {children}
    </UiToolbar>
  ) : (
    <div className={className}>{children}</div>
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
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-muted text-brand ring-8 ring-brand-muted/40">
        <Inbox className="h-6 w-6" strokeWidth={1.7} aria-hidden />
      </div>
      <p className="font-display text-base font-semibold text-foreground">{title}</p>
      {body ? <p className="max-w-sm text-sm text-foreground/55">{body}</p> : null}
    </div>
  );
}

export function RhTableWrap({ children }: { children: ReactNode }) {
  return (
    <div className="ui-table-wrap overflow-x-auto rounded-[calc(var(--radius-2xl)+0.5rem)] border shadow-[var(--card-shadow)]">
      {children}
    </div>
  );
}

export function rhTh() {
  return "px-4 py-3.5 text-left text-xs font-medium text-foreground/50";
}

export function rhTd() {
  return "px-4 py-3.5 align-middle text-sm text-foreground/85";
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
    success: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300",
    warning: "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300",
    danger: "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300",
  }[tone];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${map}`}>
      {children}
    </span>
  );
}

export function RhIconButton(props: ButtonHTMLAttributes<HTMLButtonElement>) {
  const { className = "", children, ...rest } = props;
  return (
    <button
      type="button"
      className={`ui-btn inline-flex h-10 w-10 items-center justify-center border border-border/70 bg-surface text-foreground/70 transition hover:bg-surface-muted hover:text-foreground disabled:opacity-50 ${className}`}
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
  icon: Icon,
}: {
  label: string;
  value: ReactNode;
  icon?: LucideIcon;
}) {
  return (
    <div className="ui-stat ui-lift flex items-center gap-3.5 rounded-[calc(var(--radius-2xl)+0.25rem)] border px-4 py-3.5">
      {Icon ? (
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-muted text-brand">
          <Icon className="h-[18px] w-[18px]" strokeWidth={1.8} aria-hidden />
        </span>
      ) : null}
      <div className="min-w-0">
        <p className="truncate text-xs font-medium text-foreground/50">{label}</p>
        <p className="mt-0.5 font-display text-2xl font-semibold tracking-tight tabular-nums text-foreground">{value}</p>
      </div>
    </div>
  );
}
