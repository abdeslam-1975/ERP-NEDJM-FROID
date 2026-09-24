"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogoutButton } from "@/components/layout/logout-button";

type NavItem = {
  href: string;
  labelFr: string;
  labelAr: string;
  icon: "home" | "users" | "contract" | "calendar" | "pay" | "docs" | "settings" | "site" | "finance" | "cart" | "shield";
};

type NavGroup = {
  titleFr: string;
  titleAr: string;
  items: NavItem[];
};

const navGroups: NavGroup[] = [
  {
    titleFr: "Pilotage",
    titleAr: "القيادة",
    items: [
      { href: "/", labelFr: "Tableau de Bord", labelAr: "لوحة القيادة", icon: "home" },
    ],
  },
  {
    titleFr: "Ressources Humaines",
    titleAr: "الموارد البشرية",
    items: [
      {
        href: "/rh",
        labelFr: "Ressources Humaines",
        labelAr: "الموارد البشرية",
        icon: "users",
      },
    ],
  },
  {
    titleFr: "Sites & activités",
    titleAr: "الورشات",
    items: [
      { href: "/referentiels/chantiers", labelFr: "Chantiers", labelAr: "الورشات", icon: "site" },
      { href: "/referentiels/activites", labelFr: "Codes d'activité", labelAr: "رموز النشاط", icon: "site" },
    ],
  },
  {
    titleFr: "Finance & Achats",
    titleAr: "المالية والمشتريات",
    items: [
      { href: "/finance", labelFr: "Banque & Caisse", labelAr: "البنك والصندوق", icon: "finance" },
      { href: "/achats", labelFr: "Achats", labelAr: "المشتريات", icon: "cart" },
    ],
  },
  {
    titleFr: "Administration",
    titleAr: "الإدارة",
    items: [
      { href: "/parametres/utilisateurs", labelFr: "Utilisateurs", labelAr: "المستخدمون", icon: "users" },
      { href: "/administration/roles", labelFr: "Rôles & droits", labelAr: "الأدوار", icon: "shield" },
      { href: "/parametres", labelFr: "Paramètres", labelAr: "إعدادات عامة", icon: "settings" },
    ],
  },
];

function NavIcon({ name }: { name: NavItem["icon"] }) {
  const common = {
    width: 18,
    height: 18,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  switch (name) {
    case "home":
      return (
        <svg {...common}>
          <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9.5Z" />
        </svg>
      );
    case "users":
      return (
        <svg {...common}>
          <path d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" />
          <circle cx="9.5" cy="7" r="3.5" />
          <path d="M20 21v-2a3.5 3.5 0 0 0-2.5-3.35" />
          <path d="M16 3.65A3.5 3.5 0 0 1 16 10.5" />
        </svg>
      );
    case "contract":
      return (
        <svg {...common}>
          <path d="M8 3h6l4 4v14a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" />
          <path d="M14 3v5h5M9 13h6M9 17h4" />
        </svg>
      );
    case "calendar":
      return (
        <svg {...common}>
          <rect x="3.5" y="5" width="17" height="15.5" rx="2" />
          <path d="M8 3.5V7M16 3.5V7M3.5 10h17" />
        </svg>
      );
    case "pay":
      return (
        <svg {...common}>
          <rect x="3" y="6" width="18" height="12" rx="2" />
          <path d="M3 10h18M8 14h3" />
        </svg>
      );
    case "docs":
      return (
        <svg {...common}>
          <path d="M7 3h7l4 4v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" />
          <path d="M14 3v4h4M9 12h6M9 16h4" />
        </svg>
      );
    case "settings":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="3" />
          <path d="M12 3.5v2.2M12 18.3V20.5M4.9 7.5l1.9 1.1M17.2 15.4l1.9 1.1M4.9 16.5l1.9-1.1M17.2 8.6l1.9-1.1" />
        </svg>
      );
    case "site":
      return (
        <svg {...common}>
          <path d="M4 20h16M6 20V9l6-4 6 4v11" />
          <path d="M10 20v-5h4v5" />
        </svg>
      );
    case "finance":
      return (
        <svg {...common}>
          <path d="M12 3v18M16.5 7.5c0-1.7-2-3-4.5-3s-4.5 1.3-4.5 3 2 3 4.5 3 4.5 1.3 4.5 3-2 3-4.5 3-4.5-1.3-4.5-3" />
        </svg>
      );
    case "cart":
      return (
        <svg {...common}>
          <path d="M4 5h2l2.2 10.2a1.5 1.5 0 0 0 1.5 1.2h7.6a1.5 1.5 0 0 0 1.5-1.2L20 8H8" />
          <circle cx="10" cy="20" r="1.2" />
          <circle cx="17" cy="20" r="1.2" />
        </svg>
      );
    case "shield":
      return (
        <svg {...common}>
          <path d="M12 3 5 6.5v5.2c0 4.2 2.8 7.4 7 8.8 4.2-1.4 7-4.6 7-8.8V6.5L12 3Z" />
        </svg>
      );
    default:
      return null;
  }
}

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex w-[15.5rem] shrink-0 flex-col bg-sidebar text-sidebar-fg">
      <div className="flex items-center gap-3 px-5 pb-2 pt-6">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15 text-white shadow-inner">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M4 18V8.5L12 4l8 4.5V18a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1Z"
              stroke="currentColor"
              strokeWidth="1.7"
            />
            <path d="M9 19v-5h6v5" stroke="currentColor" strokeWidth="1.7" />
          </svg>
        </div>
        <div>
          <p className="font-display text-[15px] font-bold tracking-tight text-white">
            NEDJM FROID
          </p>
          <p className="text-[11px] text-[color:var(--sidebar-muted)]">ERP · نجم فرويد</p>
        </div>
      </div>

      <nav className="mt-4 flex-1 space-y-5 overflow-y-auto px-3 pb-4">
        {navGroups.map((group) => (
          <div key={group.titleFr}>
            <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-[color:var(--sidebar-muted)]">
              {group.titleFr}
            </p>
            <ul className="space-y-1">
              {group.items.map((item) => {
                const active =
                  item.href === "/"
                    ? pathname === "/"
                    : item.href === "/rh"
                      ? pathname === "/rh" || pathname.startsWith("/rh/")
                      : pathname === item.href ||
                        pathname.startsWith(`${item.href}/`);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={`flex items-center gap-3 rounded-xl px-3 py-2.5 transition ${
                        active
                          ? "bg-brand text-white shadow-md shadow-black/20"
                          : "text-white/80 hover:bg-white/10 hover:text-white"
                      }`}
                    >
                      <span className={active ? "text-white" : "text-white/70"}>
                        <NavIcon name={item.icon} />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-[13px] font-semibold leading-tight">
                          {item.labelFr}
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
