import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Fragment } from "react";
import { FileText } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export { RhModal, RhTabs } from "@/components/rh/rh-ui-client";

/* —— tokens (Tailwind) —— */
export const rhInput =
  "mt-1.5 h-10 w-full rounded-xl border border-border/80 bg-surface px-3.5 text-sm text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] outline-none transition placeholder:text-foreground/35 focus:border-brand focus:ring-4 focus:ring-brand/10";

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
      className={cn(
        "overflow-hidden rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] shadow-[var(--card-shadow)] backdrop-blur-[var(--card-blur)]",
        padded && "p-4 sm:p-5",
        className,
      )}
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

export function RhAlert({
  tone = "danger",
  children,
}: {
  tone?: "danger" | "success" | "warning" | "info";
  children: ReactNode;
}) {
  return <Alert tone={tone}>{children}</Alert>;
}

export function RhEmpty({ title, body }: { title: string; body?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-muted text-brand">
        <FileText className="size-5" aria-hidden />
      </div>
      <p className="font-display text-base font-semibold text-foreground">{title}</p>
      {body ? <p className="max-w-sm text-sm text-foreground/55">{body}</p> : null}
    </div>
  );
}

export function RhTableWrap({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] shadow-[var(--card-shadow)]">
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

export function RhChip({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "brand" | "success" | "warning" | "danger";
}) {
  return <Badge tone={tone}>{children}</Badge>;
}

export function RhIconButton(props: ButtonHTMLAttributes<HTMLButtonElement>) {
  const { className = "", children, ...rest } = props;
  return (
    <button
      type="button"
      className={cn(
        "inline-flex h-10 w-10 items-center justify-center rounded-[var(--btn-radius)] border border-border/70 bg-surface text-foreground/70 transition hover:bg-surface-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-brand/50 focus-visible:outline-none active:scale-95 disabled:opacity-50 [&_svg]:size-4",
        className,
      )}
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
    <div className="rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] px-4 py-3 shadow-[var(--card-shadow)]">
      <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-foreground/45">
        {label}
      </p>
      <p className="mt-1 font-display text-2xl font-semibold tabular-nums text-foreground">{value}</p>
    </div>
  );
}
