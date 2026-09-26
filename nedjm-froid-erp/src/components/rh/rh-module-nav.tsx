"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/rh", label: "Tableau de bord", exact: true },
  { href: "/rh/employes", label: "Employés" },
  { href: "/rh/contrats", label: "Contrats" },
  { href: "/rh/postes", label: "Postes & grille" },
  { href: "/rh/presence", label: "Présence" },
  { href: "/rh/conges", label: "Congés" },
  { href: "/rh/paie", label: "Paie" },
  { href: "/rh/paie/exceptions", label: "Exceptions" },
  { href: "/rh/paie/avances", label: "Avances" },
  { href: "/rh/sorties", label: "Sorties" },
  { href: "/rh/documents", label: "Documents" },
  { href: "/rh/attestations", label: "Attestations" },
  { href: "/rh/legal", label: "Cotisations & impôts" },
  { href: "/rh/parametres", label: "Paramètres" },
];

export function RhModuleNav() {
  const pathname = usePathname();

  return (
    <nav className="sticky top-0 z-20 -mx-1 mb-1 overflow-x-auto rounded-2xl border border-border/80 bg-surface px-2 py-2 shadow-[var(--card-shadow)]">
      <ul className="flex min-w-max items-center gap-1">
        {items.map((item) => {
          const active = item.exact
            ? pathname === item.href
            : pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={`inline-flex h-9 items-center rounded-xl px-3.5 text-sm font-semibold transition ${
                  active
                    ? "bg-brand text-white shadow-sm shadow-brand/25"
                    : "text-foreground/65 hover:bg-surface-muted hover:text-foreground"
                }`}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
