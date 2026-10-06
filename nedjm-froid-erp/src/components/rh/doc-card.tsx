import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const LINES = ["92%", "78%", "86%", "64%", "80%", "48%"];

/** Small sheet of paper drawn in the card: coloured heading bar and text lines (right-aligned for Arabic). */
function PaperSheet({ color, rtl, landscape }: { color: string; rtl?: boolean; landscape?: boolean }) {
  return (
    <div
      className={cn(
        "absolute left-1/2 top-5 -translate-x-1/2 rotate-[-4deg] rounded-[5px] bg-white p-2 shadow-[0_6px_18px_-6px_rgba(15,23,42,0.35)] ring-1 ring-black/5 transition-all duration-300 group-hover:-translate-y-1.5 group-hover:rotate-0",
        landscape ? "h-[76px] w-[104px]" : "h-[104px] w-[80px]",
      )}
    >
      <div className={cn("mb-1.5 flex gap-1", rtl ? "flex-row-reverse" : "")}>
        <span className="h-2.5 w-2.5 rounded-sm" style={{ background: color }} />
        <span className="h-2.5 flex-1 rounded-sm" style={{ background: `${color}55` }} />
      </div>
      <div className={cn("flex flex-col gap-[5px]", rtl ? "items-end" : "items-start")}>
        {LINES.slice(0, landscape ? 4 : 6).map((w, i) => (
          <span key={i} className="h-[3px] rounded-full bg-slate-200" style={{ width: w }} />
        ))}
      </div>
      <span
        className={cn("absolute bottom-2 h-[5px] w-6 rounded-full", rtl ? "left-2" : "right-2")}
        style={{ background: `${color}88` }}
      />
    </div>
  );
}

/**
 * Card of a document: coloured stage with a paper sheet (opens the document), title, subtitle and actions.
 */
export function DocCard({
  title,
  subtitle,
  icon: Icon,
  color,
  badge,
  meta,
  onOpen,
  openLabel,
  actions,
  rtl,
  landscape,
  dimmed,
}: {
  title: string;
  subtitle?: string;
  icon: LucideIcon;
  color: string;
  badge?: ReactNode;
  meta?: ReactNode;
  onOpen?: () => void;
  openLabel?: string;
  actions?: ReactNode;
  rtl?: boolean;
  landscape?: boolean;
  dimmed?: boolean;
}) {
  return (
    <li
      className={cn(
        "group flex flex-col overflow-hidden rounded-2xl border border-border/70 bg-surface shadow-[var(--card-shadow)] transition duration-300 hover:-translate-y-0.5 hover:border-transparent hover:shadow-[0_14px_34px_-14px_rgba(15,23,42,0.35)]",
        dimmed ? "opacity-60" : "",
      )}
      style={{ ["--doc-color" as string]: color }}
    >
      <button
        type="button"
        onClick={onOpen}
        aria-label={openLabel ?? title}
        title={openLabel}
        className="relative h-36 overflow-hidden text-left outline-none focus-visible:ring-2 focus-visible:ring-inset"
        style={{ background: `linear-gradient(140deg, ${color}26 0%, ${color}0a 70%)` }}
      >
        <span className="absolute -right-6 -top-8 size-24 rounded-full" style={{ background: `${color}1a` }} />
        <span className="absolute -bottom-10 -left-6 size-24 rounded-full" style={{ background: `${color}12` }} />
        <span
          className="absolute left-3 top-3 z-10 flex size-9 items-center justify-center rounded-xl text-white shadow-sm"
          style={{ background: color }}
        >
          <Icon className="size-[18px]" strokeWidth={2} aria-hidden />
        </span>
        {badge ? <span className="absolute right-3 top-3 z-10">{badge}</span> : null}
        <PaperSheet color={color} rtl={rtl} landscape={landscape} />
      </button>
      <div className="flex flex-1 flex-col gap-1 px-3.5 pb-3 pt-2.5">
        <span className="line-clamp-2 text-sm font-semibold leading-snug text-foreground">{title}</span>
        {subtitle ? (
          <span className="truncate text-xs text-foreground/55" dir="rtl">
            {subtitle}
          </span>
        ) : null}
        {meta ? <span className="text-[11px] text-foreground/50">{meta}</span> : null}
        {actions ? <div className="mt-auto flex flex-wrap gap-1.5 pt-2">{actions}</div> : null}
      </div>
    </li>
  );
}

/** Large selectable tile of a section (replaces plain tabs). */
export function SectionTile({
  title,
  description,
  icon: Icon,
  color,
  count,
  selected,
  onSelect,
}: {
  title: string;
  description: string;
  icon: LucideIcon;
  color: string;
  count?: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "group relative flex items-center gap-3.5 overflow-hidden rounded-2xl border p-4 text-left transition duration-300",
        selected ? "border-transparent" : "border-border/70 bg-surface hover:-translate-y-px hover:border-transparent hover:shadow-md",
      )}
      style={
        selected
          ? { boxShadow: `0 0 0 2px ${color}`, background: `linear-gradient(135deg, ${color}1f, ${color}08)` }
          : undefined
      }
    >
      <span className="absolute -right-8 -top-10 size-28 rounded-full transition group-hover:scale-110" style={{ background: `${color}14` }} />
      <span
        className="relative flex size-12 shrink-0 items-center justify-center rounded-2xl text-white shadow-sm"
        style={{ background: color }}
      >
        <Icon className="size-6" strokeWidth={1.9} aria-hidden />
      </span>
      <span className="relative min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className="font-display text-[15px] font-semibold text-foreground">{title}</span>
          {count ? (
            <span className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: `${color}1f`, color }}>
              {count}
            </span>
          ) : null}
        </span>
        <span className="mt-0.5 block text-xs leading-snug text-foreground/55">{description}</span>
      </span>
    </button>
  );
}
