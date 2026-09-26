"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { searchEmployees, type GlobalSearchEmployee } from "@/lib/actions/global-search";

type PageEntry = { href: string; fr: string; ar: string; keywords?: string };

const PAGES: PageEntry[] = [
  { href: "/", fr: "Tableau de bord", ar: "لوحة القيادة" },
  { href: "/rh", fr: "Ressources humaines", ar: "الموارد البشرية" },
  { href: "/rh/employes", fr: "Employés", ar: "العمال", keywords: "fiche salarie personnel" },
  { href: "/rh/contrats", fr: "Contrats de travail", ar: "العقود" },
  { href: "/rh/postes", fr: "Postes & grille", ar: "المناصب" },
  { href: "/rh/presence", fr: "Présence / pointage", ar: "الحضور" },
  { href: "/rh/conges", fr: "Congés", ar: "العطل" },
  { href: "/rh/paie", fr: "Paie", ar: "الأجور", keywords: "salaire" },
  {
    href: "/rh/paie/bulletins",
    fr: "Bulletins de paie",
    ar: "كشوف الأجر",
    keywords: "bulletin fiche de paie kashf ajr كشف الاجر الراتب",
  },
  { href: "/rh/paie/social", fr: "Paie — social (CNAS)", ar: "الضمان الاجتماعي" },
  { href: "/rh/paie/fiscal", fr: "Paie — fiscal (IRG)", ar: "الضريبة" },
  { href: "/rh/paie/exceptions", fr: "Exceptions de paie", ar: "استثناءات" },
  { href: "/rh/paie/avances", fr: "Avances & prêts", ar: "التسبيقات والقروض" },
  { href: "/rh/paie/virements", fr: "Virements des salaires", ar: "تحويل الأجور" },
  { href: "/rh/couts", fr: "Coûts de la paie", ar: "التكاليف" },
  { href: "/rh/interim", fr: "Intérim", ar: "العمل المؤقت" },
  { href: "/rh/sorties", fr: "Sorties", ar: "الخروج" },
  { href: "/rh/documents", fr: "Documents RH", ar: "الوثائق" },
  { href: "/rh/attestations", fr: "Attestations", ar: "الشهادات" },
  { href: "/rh/legal", fr: "Cotisations & impôts", ar: "الاشتراكات والضرائب", keywords: "cnas irg cacobatph regime" },
  { href: "/rh/parametres", fr: "Paramètres RH", ar: "إعدادات الموارد البشرية", keywords: "rubriques" },
  { href: "/referentiels/chantiers", fr: "Chantiers", ar: "الورشات", keywords: "sites" },
  { href: "/referentiels/activites", fr: "Codes d'activité", ar: "رموز النشاط" },
  { href: "/finance", fr: "Banque & caisse", ar: "البنك والصندوق" },
  { href: "/achats", fr: "Achats", ar: "المشتريات" },
  { href: "/parametres/utilisateurs", fr: "Utilisateurs", ar: "المستخدمون" },
  { href: "/administration/roles", fr: "Rôles & droits", ar: "الأدوار" },
  { href: "/parametres", fr: "Paramètres", ar: "إعدادات عامة" },
];

function fold(s: string) {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[أإآ]/g, "ا")
    .toLowerCase();
}

type Result =
  | { kind: "page"; page: PageEntry }
  | { kind: "employee"; employee: GlobalSearchEmployee };

export function GlobalSearch() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [employees, setEmployees] = useState<GlobalSearchEmployee[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);

  const pages = useMemo(() => {
    const q = fold(query.trim());
    if (!q) return [];
    return PAGES.filter((p) => fold(`${p.fr} ${p.ar} ${p.keywords ?? ""}`).includes(q)).slice(0, 5);
  }, [query]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      const rows = await searchEmployees(q);
      if (!cancelled) {
        setEmployees(rows);
        setLoading(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const shownEmployees = query.trim().length < 2 ? [] : employees;
  const results: Result[] = [
    ...shownEmployees.map((employee) => ({ kind: "employee" as const, employee })),
    ...pages.map((page) => ({ kind: "page" as const, page })),
  ];

  function bulletinsHref(e: GlobalSearchEmployee) {
    return `/rh/paie/bulletins?q=${encodeURIComponent(e.matricule || e.name)}`;
  }

  function reset() {
    setOpen(false);
    setQuery("");
    setEmployees([]);
  }

  function go(href: string) {
    reset();
    router.push(href);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      setOpen(false);
      return;
    }
    if (!results.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (i + 1) % results.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i - 1 + results.length) % results.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const r = results[Math.min(active, results.length - 1)];
      go(r.kind === "page" ? r.page.href : bulletinsHref(r.employee));
    }
  }

  const showPanel = open && query.trim().length > 0;

  return (
    <div ref={boxRef} className="relative hidden md:block">
      <div className="flex items-center gap-2 rounded-2xl border border-border bg-surface px-3 py-2 shadow-[var(--card-shadow)]">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="text-foreground/35" aria-hidden>
          <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.7" />
          <path d="M16 16l4 4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        </svg>
        <input
          className="w-44 bg-transparent text-sm outline-none placeholder:text-foreground/35 lg:w-56"
          placeholder="Rechercher… · بحث"
          aria-label="Recherche globale"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
        />
      </div>
      {showPanel ? (
        <div className="absolute right-0 z-50 mt-2 w-[26rem] max-w-[90vw] overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl shadow-slate-950/15">
          {shownEmployees.length ? (
            <div className="border-b border-border/60 py-1">
              <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-foreground/45">
                Employés · العمال
              </p>
              {shownEmployees.map((e, i) => (
                <div
                  key={e.id}
                  className={`flex items-center gap-2 px-3 py-2 ${active === i ? "bg-brand-muted" : ""}`}
                  onMouseEnter={() => setActive(i)}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">
                      <span className="font-mono text-xs text-foreground/60">{e.matricule}</span> {e.name}
                    </p>
                    {e.name_ar ? (
                      <p className="truncate text-xs text-foreground/55" dir="rtl">
                        {e.name_ar}
                      </p>
                    ) : null}
                  </div>
                  <Link
                    href={bulletinsHref(e)}
                    onClick={reset}
                    className="rounded-lg bg-brand px-2.5 py-1 text-xs font-semibold text-white hover:opacity-90"
                  >
                    Bulletins · كشف الأجر
                  </Link>
                  <Link
                    href={`/rh/employes?q=${encodeURIComponent(e.matricule || e.name)}`}
                    onClick={reset}
                    className="rounded-lg border border-border px-2.5 py-1 text-xs font-semibold text-foreground/75 hover:bg-surface-muted"
                  >
                    Fiche
                  </Link>
                </div>
              ))}
            </div>
          ) : null}
          {pages.length ? (
            <div className="py-1">
              <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-foreground/45">
                Pages · الصفحات
              </p>
              {pages.map((p, j) => {
                const i = shownEmployees.length + j;
                return (
                  <Link
                    key={p.href}
                    href={p.href}
                    onClick={reset}
                    onMouseEnter={() => setActive(i)}
                    className={`flex items-center justify-between gap-3 px-3 py-2 text-sm ${
                      active === i ? "bg-brand-muted text-brand" : "text-foreground/80"
                    }`}
                  >
                    <span className="font-semibold">{p.fr}</span>
                    <span className="text-xs text-foreground/55" dir="rtl">
                      {p.ar}
                    </span>
                  </Link>
                );
              })}
            </div>
          ) : null}
          {!results.length ? (
            <p className="px-3 py-3 text-sm text-foreground/55">
              {query.trim().length < 2
                ? "Tapez au moins 2 caractères · اكتب حرفين على الأقل"
                : loading
                  ? "Recherche… · جارٍ البحث"
                  : "Aucun résultat · لا توجد نتائج"}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
