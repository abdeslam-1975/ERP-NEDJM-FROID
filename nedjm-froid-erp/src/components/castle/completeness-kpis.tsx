type Kpi = {
  label: string;
  value: string;
  hint: string;
  tone?: "ok" | "warn" | "critical";
};

const toneClass = {
  ok: "border-alert-success/40",
  warn: "border-alert-warning/40",
  critical: "border-alert-critical/40",
};

export function CompletenessKpis({ items }: { items: Kpi[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => (
        <article
          key={item.label}
          className={`rounded-lg border bg-surface p-4 shadow-sm ${toneClass[item.tone ?? "ok"]}`}
        >
          <p className="text-xs font-medium uppercase tracking-wide text-foreground/60">
            {item.label}
          </p>
          <p className="mt-2 font-display text-2xl font-semibold text-foreground">
            {item.value}
          </p>
          <p className="mt-1 text-sm text-foreground/70">{item.hint}</p>
        </article>
      ))}
    </div>
  );
}
