"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo } from "react";
import { motion } from "motion/react";
import {
  Building2,
  CalendarDays,
  FilePenLine,
  FileText,
  House,
  Landmark,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Snowflake,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { LogoutButton } from "@/components/layout/logout-button";
import { useUiLayout } from "@/components/layout/ui-layout-context";
import type { UiIcon } from "@/lib/ui/registry";
import { resolveNav } from "@/lib/ui/resolve";

const ICONS: Record<UiIcon, LucideIcon> = {
  home: House,
  users: Users,
  contract: FilePenLine,
  calendar: CalendarDays,
  pay: Wallet,
  docs: FileText,
  settings: Settings,
  site: Building2,
  finance: Landmark,
  cart: ShoppingCart,
  shield: ShieldCheck,
};

export function NavIcon({ name }: { name: UiIcon }) {
  const Icon = ICONS[name] ?? FileText;
  return <Icon className="size-[18px]" strokeWidth={1.8} aria-hidden />;
}

export function Sidebar() {
  const pathname = usePathname();
  const layout = useUiLayout();
  const navGroups = useMemo(() => resolveNav(layout), [layout]);
  const appName = layout.theme.app_name ?? "NEDJM FROID";
  const appSubtitle = layout.theme.app_subtitle ?? "ERP · نجم فرويد";

  return (
    <aside className="flex w-[15.5rem] shrink-0 flex-col bg-sidebar text-sidebar-fg">
      <div className="flex items-center gap-3 px-5 pb-2 pt-6">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15 text-white shadow-inner">
          <Snowflake className="size-5" strokeWidth={1.8} aria-hidden />
        </div>
        <div>
          <p className="font-display text-[15px] font-bold tracking-tight text-white">
            {appName}
          </p>
          <p className="text-[11px] text-[color:var(--sidebar-muted)]">{appSubtitle}</p>
        </div>
      </div>

      <nav className="mt-4 flex-1 space-y-5 overflow-y-auto px-3 pb-4">
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
                    : pathname === item.activeHref ||
                      pathname.startsWith(`${item.activeHref}/`);
                return (
                  <li key={item.key}>
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={`relative flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors ${
                        active ? "text-white" : "text-white/80 hover:bg-white/10 hover:text-white"
                      }`}
                    >
                      {active ? (
                        <motion.span
                          layoutId="sidebar-active"
                          className="absolute inset-0 rounded-xl bg-brand shadow-md shadow-black/20"
                          transition={{ type: "spring", stiffness: 480, damping: 38 }}
                        />
                      ) : null}
                      <span className={`relative ${active ? "text-white" : "text-white/70"}`}>
                        <NavIcon name={item.icon} />
                      </span>
                      <span className="relative min-w-0">
                        <span className="block truncate text-[13px] font-semibold leading-tight">
                          {item.label}
                        </span>
                        <span className="block truncate text-[10px] opacity-70" dir="rtl">
                          {item.labelAr}
                        </span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="px-3 pb-5 pt-2">
        <LogoutButton variant="sidebar" />
      </div>
    </aside>
  );
}
