"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useMemo, useState, type ReactNode } from "react";
import { Search, Settings2 } from "lucide-react";
import { SettingsGlyph } from "@/components/settings/settings-icons";
import { SETTINGS_HOME, settingsSectionAt, type ResolvedSettingsGroup } from "@/lib/ui/settings-center";
import { cn } from "@/lib/utils";

const fold = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

/** Settings center: its sections on the left (with a search), the open section on the right. */
export function SettingsFrame({ groups, children }: { groups: ResolvedSettingsGroup[]; children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const active = useMemo(() => settingsSectionAt(groups.flatMap((g) => g.sections), pathname), [groups, pathname]);
  const shown = useMemo(() => {
    const q = fold(query.trim());
    if (!q) return groups;
    return groups
      .map((g) => ({
        ...g,
        sections: g.sections.filter((s) =>
          fold(`${s.labelFr} ${s.labelAr} ${s.descriptionFr} ${s.keywords ?? ""} ${g.titleFr}`).includes(q),
        ),
      }))
      .filter((g) => g.sections.length > 0);
  }, [groups, query]);
  const home = pathname === SETTINGS_HOME;

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[16.5rem_minmax(0,1fr)]">
      <aside className="ui-panel rounded-[1.75rem] border p-3 lg:sticky lg:top-24 print:hidden">
        <Link
          href={SETTINGS_HOME}
          aria-current={home ? "page" : undefined}
          className={cn(
            "flex items-center gap-3 rounded-2xl p-2 transition-colors",
            home ? "bg-brand-muted" : "hover:bg-surface-muted",
          )}
        >
          <span className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand to-sky-500 text-white shadow-sm">
            <Settings2 className="size-5" strokeWidth={1.9} aria-hidden />
          </span>
          <span className="min-w-0 leading-tight">
            <span className="block font-display text-[15px] font-semibold text-foreground">Paramètres</span>
            <span className="block text-xs text-foreground/50" dir="rtl">
              الإعدادات
            </span>
          </span>
        </Link>

        <form
          role="search"
          className="relative mt-3"
          onSubmit={(e) => {
            e.preventDefault();
            const first = shown[0]?.sections[0];
            if (first) {
              setQuery("");
              router.push(first.href);
            }
          }}
        >
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-foreground/40" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher un réglage…"
            aria-label="Rechercher un réglage"
            className="h-10 w-full rounded-xl border border-border/70 bg-surface pr-3 pl-9 text-sm outline-none transition focus:border-brand/60 focus:ring-2 focus:ring-brand/20"
          />
        </form>

        <nav aria-label="Sections des paramètres" className="mt-2 max-h-80 overflow-y-auto pr-0.5 lg:max-h-[calc(100dvh-15rem)]">
          {shown.map((group) => (
            <div key={group.key} className="mt-3">
              <p className="flex items-center gap-2 px-2 pb-1.5 text-[11px] font-semibold tracking-wide text-foreground/45 uppercase">
                <span className="size-1.5 rounded-full" style={{ background: group.color }} />
                {group.titleFr}
              </p>
              <ul className="space-y-0.5">
                {group.sections.map((s) => {
                  const on = s.id === active;
                  return (
                    <li key={s.id}>
                      <Link
                        href={s.href}
                        title={s.labelAr}
                        aria-current={on ? "page" : undefined}
                        className={cn(
                          "flex items-center gap-2.5 rounded-xl px-2 py-1.5 text-[13px] transition-colors",
                          on ? "font-semibold text-foreground" : "font-medium text-foreground/70 hover:bg-surface-muted hover:text-foreground",
                        )}
                        style={on ? { background: `${group.color}14`, boxShadow: `inset 0 0 0 1px ${group.color}33` } : undefined}
                      >
                        <span
                          className="flex size-7 shrink-0 items-center justify-center rounded-lg"
                          style={{ background: `${group.color}${on ? "26" : "14"}`, color: group.color }}
                        >
                          <SettingsGlyph icon={s.icon} className="size-[15px]" />
                        </span>
                        <span className="min-w-0 truncate">{s.labelFr}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
          {!shown.length ? <p className="px-2 py-6 text-center text-sm text-foreground/50">Aucun réglage ne correspond.</p> : null}
        </nav>
      </aside>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
