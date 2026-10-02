"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo } from "react";
import { motion } from "motion/react";
import {
  Banknote,
  CalendarDays,
  FilePenLine,
  FileText,
  HardHat,
  LayoutGrid,
  Settings2,
  ShieldCheck,
  ShoppingCart,
  Snowflake,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { LogoutButton } from "@/components/layout/logout-button";
import { NavArrange } from "@/components/layout/arrange";
import { useArrange, useUiLayout } from "@/components/layout/ui-layout-context";
import type { UiIcon } from "@/lib/ui/registry";
import { resolveNav } from "@/lib/ui/resolve";

const NAV_ICONS: Record<UiIcon, LucideIcon> = {
  home: LayoutGrid,
  users: Users,
  contract: FilePenLine,
  calendar: CalendarDays,
  pay: Wallet,
  docs: FileText,
  settings: Settings2,
  site: HardHat,
  finance: Banknote,
  cart: ShoppingCart,
  shield: ShieldCheck,
};

export function NavIcon({ name }: { name: UiIcon }) {
  const Icon = NAV_ICONS[name];
  return Icon ? <Icon className="h-[18px] w-[18px]" strokeWidth={1.8} aria-hidden /> : null;
}

export function Sidebar() {
  const pathname = usePathname();
  const layout = useUiLayout();
  const { active: arranging } = useArrange();
  const navGroups = useMemo(() => resolveNav(layout), [layout]);
  const appName = layout.theme.app_name ?? "NEDJM FROID";
  const appSubtitle = layout.theme.app_subtitle ?? "ERP · نجم فرويد";

  return (
    <aside className="ui-sidebar sticky top-3 m-3 mr-0 flex h-[calc(100dvh-1.5rem)] w-[15.5rem] shrink-0 flex-col overflow-hidden rounded-[1.75rem] text-sidebar-fg print:hidden">
      <div className="flex items-center gap-3 px-5 pb-2 pt-5">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/15 text-white ring-1 ring-white/20">
          <Snowflake className="h-5 w-5" strokeWidth={1.8} aria-hidden />
        </div>
        <div className="min-w-0">
          <p className="truncate font-display text-[15px] font-bold tracking-tight text-white">{appName}</p>
          <p className="truncate text-[11px] text-[color:var(--sidebar-muted)]">{appSubtitle}</p>
        </div>
      </div>

      {arranging ? (
        <div className="mt-4 flex-1 overflow-y-auto px-3 pb-4">
          <NavArrange tone="sidebar" />
        </div>
      ) : (
        <nav className="mt-4 flex-1 space-y-5 overflow-y-auto px-3 pb-4 [scrollbar-width:none]">
          {navGroups.map((group) => (
            <div key={group.key}>
              <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-[color:var(--sidebar-muted)]">
                {group.titleFr}
              </p>
              <ul className="space-y-1">
                {group.items.map((item) => {
                  const active =
                    item.activeHref === "/"
                      ? pathname === "/"
                      : pathname === item.activeHref || pathname.startsWith(`${item.activeHref}/`);
                  return (
                    <li key={item.key}>
                      <Link
                        href={item.href}
                        aria-current={active ? "page" : undefined}
                        className={`group relative flex items-center gap-3 rounded-2xl px-3 py-2.5 transition-colors ${
                          active ? "text-white" : "text-white/75 hover:bg-white/[0.08] hover:text-white"
                        }`}
                      >
                        {active ? (
                          <motion.span
                            layoutId="sidebar-active"
                            className="absolute inset-0 rounded-2xl bg-white/[0.14] ring-1 ring-inset ring-white/15"
                            transition={{ type: "spring", stiffness: 480, damping: 38 }}
                          />
                        ) : null}
                        <span
                          className={`relative transition-transform duration-300 group-hover:scale-110 ${
                            active ? "text-white" : "text-white/70"
                          }`}
                        >
                          <NavIcon name={item.icon} />
                        </span>
                        <span className="relative min-w-0">
                          <span className="block truncate text-[13px] font-semibold leading-tight">{item.label}</span>
                          <span className="block truncate text-[10px] opacity-60" dir="rtl">
                            {item.labelAr}
                          </span>
                        </span>
                        {active ? (
                          <span className="relative ml-auto h-1.5 w-1.5 rounded-full bg-white shadow-[0_0_10px_rgba(255,255,255,0.8)]" />
                        ) : null}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
      )}

      <div className="px-3 pb-4 pt-2">
        <LogoutButton variant="sidebar" />
      </div>
    </aside>
  );
}
