"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useId, useMemo } from "react";
import { motion } from "motion/react";
import {
  ArrowUpRight,
  CalendarClock,
  Ellipsis,
  FileText,
  FolderOpen,
  LayoutDashboard,
  Scale,
  Settings2,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { RhArrange } from "@/components/layout/arrange";
import { useArrange, useArrangeableList, useUiLayout } from "@/components/layout/ui-layout-context";
import { RH_OTHERS_SECTION, RH_SECTIONS_TABSET } from "@/lib/ui/registry";
import { activeItemKey, resolveRhSections, resolveTabset } from "@/lib/ui/resolve";
import { cn } from "@/lib/utils";

export const RH_SECTION_ICONS: Record<string, LucideIcon> = {
  overview: LayoutDashboard,
  people: Users,
  time: CalendarClock,
  payroll: Wallet,
  documents: FileText,
  legal: Scale,
  others: Ellipsis,
  settings: Settings2,
};

const SPRING = { type: "spring", stiffness: 520, damping: 42 } as const;

function useRhNav() {
  const pathname = usePathname();
  const layout = useUiLayout();
  // « Autres » stays in sight even when empty: it is where tabs are put away.
  const sections = useMemo(
    () => resolveRhSections(layout, { includeEmpty: true }).filter((s) => s.items.length || s.key === RH_OTHERS_SECTION),
    [layout],
  );
  const tabs = useMemo(() => resolveTabset(layout, "rh"), [layout]);
  const activeKey = useMemo(() => activeItemKey(tabs, pathname), [tabs, pathname]);
  const current = sections.find((s) => s.items.some((i) => i.key === activeKey)) ?? null;
  return { sections, tabs, activeKey, current };
}

/** Sections of the HR module, shown in the top bar. */
export function RhSectionTabs() {
  const { sections, tabs, current } = useRhNav();
  const { start } = useArrange();
  useArrangeableList(
    "rh",
    useMemo(() => tabs.map((t) => ({ id: t.id, label: t.label })), [tabs]),
  );
  useArrangeableList(
    RH_SECTIONS_TABSET,
    useMemo(() => sections.map((s) => ({ id: s.key, label: s.titleFr })), [sections]),
  );
  const marker = useId();

  return (
    <nav aria-label="Ressources humaines" className="min-w-0 flex-1">
      <ul className="flex items-center gap-0.5 overflow-x-auto [scrollbar-width:none]">
        {sections.map((section) => {
          const Icon = RH_SECTION_ICONS[section.key] ?? (section.custom ? FolderOpen : LayoutDashboard);
          const active = section.key === current?.key;
          const first = section.items[0];
          if (!first) {
            return (
              <li key={section.key}>
                <button
                  type="button"
                  onClick={start}
                  title="Vide : cliquez pour y ranger des onglets (Réorganiser) · فارغ، اضغط لنقل تبويبات إليه"
                  className="inline-flex h-10 items-center gap-2 rounded-xl px-3.5 text-sm font-medium whitespace-nowrap text-foreground/40 transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-brand/50"
                >
                  <Icon className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
                  {section.titleFr}
                </button>
              </li>
            );
          }
          return (
            <li key={section.key}>
              <Link
                href={first.href ?? "/rh"}
                title={section.titleAr}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "group relative inline-flex h-10 items-center gap-2 rounded-xl px-3.5 text-sm font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-brand/50",
                  active ? "text-white" : "text-foreground/60 hover:text-foreground",
                )}
              >
                {active ? (
                  <motion.span
                    layoutId={marker}
                    className="absolute inset-0 rounded-xl bg-brand shadow-[0_8px_20px_-8px_var(--color-brand),inset_0_1px_0_rgba(255,255,255,0.25)]"
                    transition={SPRING}
                  />
                ) : null}
                <Icon
                  className="relative h-4 w-4 shrink-0 transition-transform duration-300 group-hover:scale-110"
                  strokeWidth={2}
                  aria-hidden
                />
                <span className="relative">{section.titleFr}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Pages of the current section, as a second row under the top bar (or the arrange editor while arranging). */
export function RhSubTabs() {
  const { activeKey, current } = useRhNav();
  const { active: arranging } = useArrange();
  const marker = useId();

  if (arranging) {
    return (
      <div className="border-t border-border/60">
        <RhArrange />
      </div>
    );
  }
  if (!current || current.items.length < 2) return null;

  return (
    <ul className="flex items-center gap-0.5 overflow-x-auto border-t border-border/60 px-2 [scrollbar-width:none]">
      {current.items.map((item) => {
        const active = item.key === activeKey;
        return (
          <li key={item.key}>
            <Link
              href={item.href ?? "/rh"}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative inline-flex h-10 items-center gap-1 px-3 text-[13px] whitespace-nowrap transition-colors outline-none focus-visible:text-brand",
                active ? "font-semibold text-brand" : "font-medium text-foreground/55 hover:text-foreground",
              )}
            >
              {item.label}
              {item.alias ? <ArrowUpRight className="h-3 w-3 opacity-60" aria-hidden /> : null}
              {active ? (
                <motion.span
                  layoutId={marker}
                  className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-brand"
                  transition={SPRING}
                />
              ) : null}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
