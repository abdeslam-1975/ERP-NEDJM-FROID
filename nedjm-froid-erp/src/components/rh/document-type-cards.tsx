import Link from "next/link";
import { ArrowDown, Eye, Sparkles, type LucideIcon } from "lucide-react";
import { RH_CARD } from "@/components/rh/rh-ui";
import { cn } from "@/lib/utils";

export type DocumentTypeCard = {
  key: string;
  title: string;
  icon: LucideIcon;
  color: string;
  count: number | null;
  open?: { href: string; label: string; down?: boolean };
  generate?: string;
};

const secondary =
  "inline-flex h-9 flex-1 items-center justify-center gap-2 rounded-xl border border-border/80 bg-surface text-sm font-medium text-foreground/75 transition hover:border-brand/35 hover:text-brand";
const primary =
  "ui-btn ui-btn-primary inline-flex h-9 flex-1 items-center justify-center gap-2 text-sm font-medium transition hover:-translate-y-px";

/** One card per kind of HR document, with its count and the way to issue one. */
export function DocumentTypeCards({ cards }: { cards: DocumentTypeCard[] }) {
  return (
    <div className="ui-stagger grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {cards.map(({ key, title, icon: Icon, color, count, open, generate }) => (
        <div key={key} className={cn(RH_CARD, "ui-lift group p-5")}>
          <div className="flex items-start justify-between">
            <span
              className="flex h-12 w-12 items-center justify-center rounded-2xl transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-6"
              style={{ background: `${color}17`, color }}
            >
              <Icon className="h-6 w-6" strokeWidth={1.8} aria-hidden />
            </span>
            {count !== null ? (
              <span className="text-xs text-foreground/50">
                {count.toLocaleString("fr-FR")} généré{count > 1 ? "s" : ""}
              </span>
            ) : null}
          </div>
          <h3 className="mt-4 font-semibold text-foreground">{title}</h3>
          <div className="mt-4 flex gap-2">
            {open ? (
              <Link href={open.href} className={secondary}>
                {open.down ? <ArrowDown className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
                {open.label}
              </Link>
            ) : null}
            {generate ? (
              <Link href={generate} className={primary}>
                <Sparkles className="h-4 w-4" aria-hidden />
                Générer
              </Link>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}
