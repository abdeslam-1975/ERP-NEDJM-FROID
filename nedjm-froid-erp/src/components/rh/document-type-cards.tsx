import Link from "next/link";
import { ArrowUpRight, type LucideIcon } from "lucide-react";

export type DocumentTypeCard = {
  key: string;
  title: string;
  icon: LucideIcon;
  color: string;
  summary: string;
  /** Cards with a register select it in place; the others link to their own page. */
  href?: string;
  selected?: boolean;
  onSelect?: () => void;
};

/** The HR documents, one compact card each: selecting a card shows its register below. */
export function DocumentTypeCards({ cards }: { cards: DocumentTypeCard[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
      {cards.map(({ key, title, icon: Icon, color, summary, href, selected, onSelect }) => {
        const body = (
          <>
            <span
              className="flex size-11 shrink-0 items-center justify-center rounded-2xl"
              style={{ background: `${color}17`, color }}
            >
              <Icon className="size-5" strokeWidth={1.8} aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold leading-snug text-foreground">{title}</span>
              <span className="block truncate text-xs text-foreground/50">{summary}</span>
            </span>
            {href ? (
              <ArrowUpRight
                className="size-4 shrink-0 text-foreground/30 transition group-hover:text-brand"
                aria-hidden
              />
            ) : null}
          </>
        );
        const className =
          "group flex items-center gap-3.5 rounded-2xl border-2 bg-[var(--card-bg,var(--surface))] p-4 text-left shadow-[var(--card-shadow)] transition hover:-translate-y-0.5";
        const style = {
          borderColor: color,
          background: selected ? `${color}14` : undefined,
        };
        return href ? (
          <Link key={key} href={href} className={className} style={style}>
            {body}
          </Link>
        ) : (
          <button key={key} type="button" className={className} style={style} aria-pressed={selected} onClick={onSelect}>
            {body}
          </button>
        );
      })}
    </div>
  );
}
