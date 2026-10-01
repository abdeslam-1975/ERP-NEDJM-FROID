"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo } from "react";
import { useUiLayout } from "@/components/layout/ui-layout-context";
import { resolveTabset } from "@/lib/ui/resolve";

export function RhModuleNav() {
  const pathname = usePathname();
  const layout = useUiLayout();
  const items = useMemo(() => resolveTabset(layout, "rh"), [layout]);

  return (
    <nav className="sticky top-0 z-20 -mx-1 mb-1 overflow-x-auto rounded-2xl border border-border/80 bg-surface px-2 py-2 shadow-[var(--card-shadow)]">
      <ul className="flex min-w-max items-center gap-1">
        {items.map((item) => {
          const href = item.href ?? "/rh";
          const active = item.exact
            ? pathname === href
            : pathname === href || pathname.startsWith(`${href}/`);
          return (
            <li key={item.key}>
              <Link
                href={href}
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
