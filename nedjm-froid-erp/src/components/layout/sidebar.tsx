"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useSyncExternalStore, useTransition } from "react";
import { motion } from "motion/react";
import { useTheme } from "next-themes";
import {
  Banknote,
  CalendarDays,
  FilePenLine,
  FileText,
  HardHat,
  LayoutGrid,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Settings2,
  ShieldCheck,
  ShoppingCart,
  Snowflake,
  Sun,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { LogoutButton } from "@/components/layout/logout-button";
import { NavArrange } from "@/components/layout/arrange";
import { SiteSwitcher } from "@/components/layout/site-switcher";
import { useArrange, useUiLayout } from "@/components/layout/ui-layout-context";
import { toast } from "@/components/ui/sonner";
import { saveMyDisplayPrefs } from "@/lib/actions/ui-prefs";
import type { WorkspaceSite } from "@/lib/auth/types";
import type { UiIcon } from "@/lib/ui/registry";
import { resolveNav } from "@/lib/ui/resolve";
import { cn } from "@/lib/utils";

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

const COLLAPSED_KEY = "nf-sidebar-collapsed";
const COLLAPSED_EVENT = "nf-sidebar-collapsed";

function subscribeCollapsed(onChange: () => void) {
  window.addEventListener(COLLAPSED_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(COLLAPSED_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

function subscribeNothing() {
  return () => {};
}

export type SidebarUser = { name: string; role: string; initials: string };

export function Sidebar({
  user,
  sites,
  activeSiteId,
}: {
  user: SidebarUser;
  sites: WorkspaceSite[];
  activeSiteId: string | null;
}) {
  const pathname = usePathname();
  const layout = useUiLayout();
  const { active: arranging } = useArrange();
  const navGroups = useMemo(() => resolveNav(layout), [layout]);
  const appName = layout.theme.app_name ?? "Nedjm Froid";
  const appSubtitle = layout.theme.app_subtitle ?? "ERP";

  const storedCollapsed = useSyncExternalStore(
    subscribeCollapsed,
    () => window.localStorage.getItem(COLLAPSED_KEY) === "1",
    () => false,
  );
  const collapsed = storedCollapsed && !arranging;
  function toggleCollapsed() {
    window.localStorage.setItem(COLLAPSED_KEY, storedCollapsed ? "0" : "1");
    window.dispatchEvent(new Event(COLLAPSED_EVENT));
  }

  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(subscribeNothing, () => true, () => false);
  const dark = mounted && resolvedTheme === "dark";
  const [, startTransition] = useTransition();
  function toggleTheme() {
    const next = dark ? "light" : "dark";
    setTheme(next);
    startTransition(async () => {
      const res = await saveMyDisplayPrefs({ mode: next, density: layout.prefs.density });
      if (!res.ok) toast.error(res.error);
    });
  }

  const footButton =
    "flex h-10 flex-1 items-center justify-center gap-2 rounded-xl text-[13px] font-medium text-white/70 transition hover:bg-white/[0.08] hover:text-white";

  return (
    <aside
      className={cn(
        "ui-sidebar sticky top-3 m-3 mr-0 flex h-[calc(100dvh-1.5rem)] shrink-0 flex-col overflow-hidden rounded-[1.75rem] p-4 text-sidebar-fg transition-[width] duration-300 ease-[cubic-bezier(.2,.8,.2,1)] print:hidden",
        collapsed ? "w-[5.25rem]" : "w-[15.5rem]",
      )}
    >
      <div className={cn("mb-6 flex h-12 items-center gap-3", collapsed ? "justify-center" : "px-1")}>
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white/15 text-white ring-1 ring-white/20">
          <Snowflake className="h-5 w-5" strokeWidth={1.8} aria-hidden />
        </span>
        {!collapsed ? (
          <div className="min-w-0 leading-tight">
            <p className="truncate text-[17px] font-semibold tracking-tight text-white">{appName}</p>
            <p className="truncate text-xs text-white/55">{appSubtitle}</p>
          </div>
        ) : null}
      </div>

      {arranging ? (
        <div className="-mx-1 flex-1 overflow-y-auto px-1 pb-4">
          <NavArrange tone="sidebar" />
        </div>
      ) : (
        <nav className="-mx-1 flex-1 overflow-y-auto px-1 pb-4 [scrollbar-width:none]">
          {navGroups.map((group, index) => (
            <ul key={group.key} className={cn("space-y-1", index > 0 && "mt-1")}>
              {group.items.map((item) => {
                const active =
                  item.activeHref === "/"
                    ? pathname === "/"
                    : pathname === item.activeHref || pathname.startsWith(`${item.activeHref}/`);
                return (
                  <li key={item.key}>
                    <Link
                      href={item.href}
                      title={collapsed ? item.label : item.labelAr}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "group relative flex h-11 items-center gap-3 rounded-[0.875rem] text-sm font-medium transition-colors",
                        collapsed ? "justify-center" : "px-3.5",
                        active ? "text-white" : "text-white/70 hover:bg-white/[0.08] hover:text-white",
                      )}
                    >
                      {active ? (
                        <motion.span
                          layoutId="sidebar-active"
                          className="absolute inset-0 rounded-[0.875rem] bg-white/[0.14] ring-1 ring-inset ring-white/15"
                          transition={{ type: "spring", stiffness: 480, damping: 38 }}
                        />
                      ) : null}
                      <span className="relative transition-transform duration-300 group-hover:scale-110">
                        <NavIcon name={item.icon} />
                      </span>
                      {!collapsed ? <span className="relative min-w-0 truncate">{item.label}</span> : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          ))}
        </nav>
      )}

      <div className="mt-auto space-y-2">
        {!collapsed ? <SiteSwitcher sites={sites} activeSiteId={activeSiteId} variant="sidebar" /> : null}
        <div className={cn("flex gap-1", collapsed && "flex-col")}>
          <button type="button" onClick={toggleTheme} title="Thème clair / sombre" className={footButton}>
            {dark ? <Sun className="h-[18px] w-[18px]" aria-hidden /> : <Moon className="h-[18px] w-[18px]" aria-hidden />}
            {!collapsed ? "Thème" : null}
          </button>
          <button
            type="button"
            onClick={toggleCollapsed}
            title={collapsed ? "Agrandir le menu" : "Réduire le menu"}
            className={footButton}
          >
            {collapsed ? (
              <PanelLeftOpen className="h-[18px] w-[18px]" aria-hidden />
            ) : (
              <PanelLeftClose className="h-[18px] w-[18px]" aria-hidden />
            )}
            {!collapsed ? "Réduire" : null}
          </button>
        </div>
        <div
          className={cn(
            "flex items-center gap-3 rounded-2xl bg-white/[0.07] p-2 ring-1 ring-white/10",
            collapsed && "flex-col",
          )}
        >
          <span
            title={collapsed ? `${user.name} · ${user.role}` : undefined}
            className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-sky-300 to-indigo-400 text-sm font-semibold text-indigo-950"
          >
            {user.initials}
            <span className="absolute -right-0.5 -bottom-0.5 h-3 w-3 rounded-full bg-emerald-400 ring-2 ring-[color:var(--sidebar)]" />
          </span>
          {!collapsed ? (
            <div className="min-w-0 flex-1 leading-tight">
              <p className="truncate text-sm font-medium text-white">{user.name}</p>
              <p className="truncate text-xs text-white/55">{user.role}</p>
            </div>
          ) : null}
          <LogoutButton variant="icon" />
        </div>
      </div>
    </aside>
  );
}
