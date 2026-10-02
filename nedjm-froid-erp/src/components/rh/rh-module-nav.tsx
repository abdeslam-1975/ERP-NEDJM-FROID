"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useId, useMemo } from "react";
import { motion } from "motion/react";
import {
  ArrowUpRight,
  CalendarClock,
  FileText,
  LayoutDashboard,
  Scale,
  Settings2,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { SortableStrip } from "@/components/layout/arrange";
import { useArrange, useArrangeableList, useUiLayout } from "@/components/layout/ui-layout-context";
import { RH_SECTIONS_TABSET } from "@/lib/ui/registry";
import { activeItemKey, resolveRhSections, resolveTabset } from "@/lib/ui/resolve";
import { cn } from "@/lib/utils";

export const RH_SECTION_ICONS: Record<string, LucideIcon> = {
  overview: LayoutDashboard,
  people: Users,
  time: CalendarClock,
  payroll: Wallet,
  documents: FileText,
  legal: Scale,
  settings: Settings2,
};

const SPRING = { type: "spring", stiffness: 520, damping: 42 } as const;

export function RhModuleNav() {
  const pathname = usePathname();
  const layout = useUiLayout();
  const { active: arranging } = useArrange();
  const sections = useMemo(() => resolveRhSections(layout), [layout]);
  const tabs = useMemo(() => resolveTabset(layout, "rh"), [layout]);
  const activeKey = useMemo(() => activeItemKey(tabs, pathname), [tabs, pathname]);
  useArrangeableList(
    "rh",
    useMemo(() => tabs.map((t) => ({ id: t.id, label: t.label })), [tabs]),
  );
  useArrangeableList(
    RH_SECTIONS_TABSET,
    useMemo(() => sections.map((s) => ({ id: s.key, label: s.titleFr })), [sections]),
  );
  const current = sections.find((s) => s.items.some((i) => i.key === activeKey)) ?? null;
  const sectionMarker = useId();
  const tabMarker = useId();

  return (
    <nav
      aria-label="Ressources humaines"
      className="sticky top-0 z-20 -mx-1 mb-1 rounded-2xl border border-border/70 bg-surface/95 shadow-[var(--card-shadow)] backdrop-blur-md supports-[backdrop-filter]:bg-surface/85"
    >
      {arranging ? (
        <SortableStrip
          tabset={RH_SECTIONS_TABSET}
          ids={sections.map((s) => s.key)}
          className="flex items-center gap-2 overflow-x-auto p-2 [scrollbar-width:none]"
        >
          {sections.map((section) => {
            const Icon = RH_SECTION_ICONS[section.key] ?? LayoutDashboard;
            return (
              <span
                key={section.key}
                className={cn(
                  "inline-flex h-9 items-center gap-2 rounded-xl px-3.5 text-sm font-semibold whitespace-nowrap",
                  section.key === current?.key ? "bg-brand text-white" : "text-foreground/65",
                )}
              >
                <Icon className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
                {section.titleFr}
              </span>
            );
          })}
        </SortableStrip>
      ) : (
        <ul className="flex items-center gap-1 overflow-x-auto p-1.5 [scrollbar-width:none]">
          {sections.map((section) => {
            const Icon = RH_SECTION_ICONS[section.key] ?? LayoutDashboard;
            const active = section.key === current?.key;
            const first = section.items[0];
            return (
              <li key={section.key} className={section.key === "settings" ? "ml-auto" : undefined}>
                <Link
                  href={first.href ?? "/rh"}
                  title={section.titleAr}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative inline-flex h-9 items-center gap-2 rounded-xl px-3.5 text-sm font-semibold whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-brand/50",
                    active ? "text-white" : "text-foreground/65 hover:bg-surface-muted hover:text-foreground",
                  )}
                >
                  {active ? (
                    <motion.span
                      layoutId={sectionMarker}
                      className="absolute inset-0 rounded-xl bg-brand shadow-sm shadow-brand/30"
                      transition={SPRING}
                    />
                  ) : null}
                  <Icon className="relative h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
                  <span className="relative">{section.titleFr}</span>
                  {section.items.length > 1 ? (
                    <span
                      className={cn(
                        "relative rounded-md px-1.5 text-[10px] font-bold tabular-nums",
                        active ? "bg-white/20 text-white" : "bg-surface-muted text-foreground/45",
                      )}
                    >
                      {section.items.length}
                    </span>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {current && current.items.length > 1 && arranging ? (
        <SortableStrip
          tabset="rh"
          ids={current.items.map((item) => item.id)}
          className="flex items-center gap-2 overflow-x-auto border-t border-border/60 px-2 py-2 [scrollbar-width:none]"
        >
          {current.items.map((item) => (
            <span
              key={item.key}
              className={cn(
                "inline-flex h-8 items-center px-3 text-[13px] whitespace-nowrap",
                item.key === activeKey ? "font-semibold text-brand" : "font-medium text-foreground/60",
              )}
            >
              {item.label}
            </span>
          ))}
        </SortableStrip>
      ) : current && current.items.length > 1 ? (
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
                    active ? "font-semibold text-brand" : "font-medium text-foreground/60 hover:text-foreground",
                  )}
                >
                  {item.label}
                  {item.alias ? <ArrowUpRight className="h-3 w-3 opacity-60" aria-hidden /> : null}
                  {active ? (
                    <motion.span
                      layoutId={tabMarker}
                      className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-brand"
                      transition={SPRING}
                    />
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      ) : null}
    </nav>
  );
}
