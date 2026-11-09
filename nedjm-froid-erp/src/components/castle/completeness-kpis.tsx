import type { LucideIcon } from "lucide-react";

type Kpi = {
  label: string;
  labelAr?: string;
  value: string;
  hint: string;
  hintAr?: string;
  tone?: "ok" | "warn" | "critical";
  icon?: LucideIcon;
};

export function CompletenessKpis({ items }: { items: Kpi[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <article
            key={item.label}
            className="flex items-center gap-4 rounded-2xl border border-border/70 bg-surface px-4 py-4 shadow-sm"
          >
            {Icon ? (
              <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-[#0a4db3] text-white">
                <Icon className="size-5" aria-hidden />
              </span>
            ) : null}
            <div className="min-w-0">
              {item.labelAr ? (
                <p dir="rtl" className="text-sm font-semibold text-foreground">
                  {item.labelAr}
                </p>
              ) : null}
              <p className="text-xs text-foreground/45">{item.label}</p>
              <p className="mt-2 truncate font-display text-2xl font-semibold text-foreground">{item.value}</p>
              {item.hintAr ? (
                <p dir="rtl" className="mt-1 truncate text-xs text-foreground/60">
                  {item.hintAr}
                </p>
              ) : null}
              <p className="truncate text-xs text-foreground/40">{item.hint}</p>
            </div>
          </article>
        );
      })}
    </div>
  );
}
