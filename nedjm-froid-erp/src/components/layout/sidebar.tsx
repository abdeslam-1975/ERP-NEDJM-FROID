"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type NavItem = {
  href: string;
  labelFr: string;
  labelAr: string;
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
      {
        href: "/",
        labelFr: "Tableau de Bord",
        labelAr: "لوحة القيادة",
      },
    ],
  },
  {
    titleFr: "Ressources Humaines",
    titleAr: "الموارد البشرية",
    items: [
      { href: "/rh", labelFr: "Espace RH", labelAr: "فضاء الموارد البشرية" },
      { href: "/rh/employes", labelFr: "Employés", labelAr: "الموظفون" },
      { href: "/rh/contrats", labelFr: "Contrats", labelAr: "العقود" },
    ],
  },
  {
    titleFr: "Gestion des Sites",
    titleAr: "إدارة المواقع",
    items: [
      {
        href: "/referentiels/chantiers",
        labelFr: "Chantiers",
        labelAr: "الورشات",
      },
      {
        href: "/referentiels/activites",
        labelFr: "Codes d'activité",
        labelAr: "رموز النشاط",
      },
    ],
  },
  {
    titleFr: "Finance",
    titleAr: "المالية",
    items: [
      {
        href: "/finance",
        labelFr: "Banque & Caisse",
        labelAr: "البنك والصندوق",
      },
      {
        href: "/finance/parametres",
        labelFr: "Paramètres financiers",
        labelAr: "إعدادات المالية",
      },
    ],
  },
  {
    titleFr: "Achats",
    titleAr: "المشتريات",
    items: [
      {
        href: "/achats",
        labelFr: "Achats & fournisseurs",
        labelAr: "المشتريات والموردون",
      },
      {
        href: "/achats/parametres",
        labelFr: "Paramètres documentaires",
        labelAr: "إعدادات الوثائق",
      },
    ],
  },
  {
    titleFr: "Paramètres",
    titleAr: "الإعدادات",
    items: [
      { href: "/parametres", labelFr: "Paramètres généraux", labelAr: "إعدادات عامة" },
      {
        href: "/parametres/utilisateurs",
        labelFr: "Utilisateurs",
        labelAr: "المستخدمون",
      },
      {
        href: "/administration/roles",
        labelFr: "Rôles & droits",
        labelAr: "الأدوار والصلاحيات",
      },
      {
        href: "/referentiels/variables",
        labelFr: "Variables légales",
        labelAr: "المتغيرات القانونية",
      },
      {
        href: "/referentiels/contrats",
        labelFr: "Contrats clients",
        labelAr: "عقود العملاء",
      },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex w-64 shrink-0 flex-col bg-sidebar text-sidebar-fg">
      <div className="border-b border-white/10 px-5 py-5">
        <p className="font-display text-lg font-bold tracking-tight text-white">
          NEDJM FROID
        </p>
        <p className="mt-1 text-xs text-white/70">نجم فرويد · ERP</p>
      </div>
      <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-4">
        {navGroups.map((group) => (
          <div key={group.titleFr}>
            <p className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-wider text-white/50">
              {group.titleFr}
              <span className="mt-0.5 block normal-case tracking-normal text-white/35">
                {group.titleAr}
              </span>
            </p>
            <ul className="space-y-1">
              {group.items.map((item) => {
                const active =
                  item.href === "/"
                    ? pathname === "/"
                    : pathname === item.href ||
                      pathname.startsWith(`${item.href}/`);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={`block rounded-md px-2 py-2 transition-colors ${
                        active
                          ? "bg-brand text-white"
                          : "text-white/85 hover:bg-white/10 hover:text-white"
                      }`}
                    >
                      <span className="block text-sm font-medium">
                        {item.labelFr}
                      </span>
                      <span className="block text-[11px] opacity-70">
                        {item.labelAr}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
      <div className="border-t border-white/10 px-4 py-3 text-[11px] text-white/45">
        Module 1 · Authentification &amp; espace de travail
      </div>
    </aside>
  );
}
