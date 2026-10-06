import Link from "next/link";
import {
  ChevronRight,
  FileText,
  HardHat,
  Landmark,
  Percent,
  ShieldCheck,
  SlidersHorizontal,
  BriefcaseBusiness,
  type LucideIcon,
} from "lucide-react";
import type { BulletinLegalRates } from "@/lib/hr/bulletin-settings";
import type { IrgBracket } from "@/lib/hr/irg-calc";
import { RH_CARD } from "@/components/rh/rh-ui";
import { cn } from "@/lib/utils";

function Tile({ icon: Icon, className }: { icon: LucideIcon; className?: string }) {
  return (
    <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-muted text-brand", className)}>
      <Icon className="h-[17px] w-[17px]" strokeWidth={1.8} aria-hidden />
    </span>
  );
}

function Head({ icon, title, href }: { icon: LucideIcon; title: string; href?: string }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <Tile icon={icon} />
        <h3 className="font-semibold text-foreground">{title}</h3>
      </div>
      {href ? (
        <Link href={href} className="text-sm font-medium text-brand hover:underline">
          Modifier
        </Link>
      ) : null}
    </div>
  );
}

function pct(value: number | null | undefined) {
  if (value === null || value === undefined) return "—";
  return `${value.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} %`;
}

function da(value: number) {
  return Math.round(value).toLocaleString("fr-FR");
}

/** Key figures of the HR settings (rates, IRG scale, what is configured), each linked to the section editing it. */
export function RhSettingsOverview({
  rates,
  brackets,
  counts,
}: {
  rates?: BulletinLegalRates;
  brackets: IrgBracket[];
  counts: { rubriques: number; lists: number; fields: number; legends: number; sites: number };
}) {
  const contributions = [
    { label: "CNAS — part salariale", value: rates?.ss_pct },
    { label: "CNAS — part patronale", value: rates?.pat_pct },
    { label: "Œuvres sociales", value: rates?.fos_pct },
    { label: "CACOBATPH", value: rates?.caco_pct },
  ].filter((c) => c.value !== null && c.value !== undefined);
  const maxRate = Math.max(0.0001, ...brackets.map((b) => b.rate));
  const configured = [
    { label: "Rubriques de salaire", value: counts.rubriques, href: "/parametres/rh/rubriques" },
    { label: "Listes et codes", value: counts.lists, href: "/parametres/rh/listes" },
    { label: "Champs de la fiche employé", value: counts.fields, href: "/parametres/rh/fiche" },
    { label: "Légendes de pointage", value: counts.legends, href: "/parametres/rh/listes" },
  ];
  const links: { icon: LucideIcon; title: string; detail: string; href: string }[] = [
    { icon: HardHat, title: "Chantiers", detail: `${counts.sites} site${counts.sites > 1 ? "s" : ""}`, href: "/referentiels/chantiers" },
    { icon: BriefcaseBusiness, title: "Postes & grille", detail: "Postes et salaires", href: "/rh/postes" },
    { icon: FileText, title: "Modèles de documents", detail: "Lettres, ordres, contrats", href: "/parametres/rh/documents" },
    { icon: ShieldCheck, title: "Qualité des données", detail: "Fiches à compléter", href: "/rh/qualite-donnees" },
  ];

  return (
    <div className="ui-stagger grid grid-cols-12 gap-5">
      <section className={cn(RH_CARD, "col-span-12 p-6 md:col-span-6 2xl:col-span-4")}>
        <Head icon={Percent} title="Cotisations sociales" href="/parametres/rh/cotisations?tab=cnas" />
        {contributions.length ? (
          contributions.map((c) => (
            <div key={c.label} className="flex items-center justify-between border-b border-border/60 py-3 last:border-0">
              <span className="text-sm text-foreground/55">{c.label}</span>
              <span className="rounded-lg bg-surface-muted px-2.5 py-1 text-sm font-semibold text-foreground">{pct(c.value)}</span>
            </div>
          ))
        ) : (
          <p className="py-6 text-center text-sm text-foreground/50">Taux non renseignés</p>
        )}
      </section>

      <section className={cn(RH_CARD, "col-span-12 p-6 md:col-span-6 2xl:col-span-4")}>
        <Head icon={Landmark} title="Barème IRG mensuel" href="/parametres/rh/cotisations?tab=irg" />
        {brackets.length ? (
          brackets.map((b, i) => (
            <div key={b.min_annual} className="flex items-center gap-3 py-2">
              <span className="text-sm whitespace-nowrap tabular-nums text-foreground/55">
                {b.max_annual === null ? `> ${da(b.min_annual / 12)}` : `${da(b.min_annual / 12)} – ${da(b.max_annual / 12)}`} DA
              </span>
              <div className="h-1.5 min-w-6 flex-1 overflow-hidden rounded-full bg-surface-muted">
                <div
                  className="ui-grow-x h-full rounded-full bg-brand"
                  style={{ width: `${(b.rate / maxRate) * 100}%`, opacity: 0.35 + (i / Math.max(1, brackets.length - 1)) * 0.65 }}
                />
              </div>
              <span className="w-12 text-right text-sm font-semibold text-foreground">{pct(b.rate * 100)}</span>
            </div>
          ))
        ) : (
          <p className="py-6 text-center text-sm text-foreground/50">Aucun barème en vigueur</p>
        )}
      </section>

      <section className={cn(RH_CARD, "col-span-12 p-6 2xl:col-span-4")}>
        <Head icon={SlidersHorizontal} title="Paramétrage" />
        {configured.map((c) => (
          <Link
            key={c.label}
            href={c.href}
            className="group flex items-center justify-between border-b border-border/60 py-3 last:border-0"
          >
            <span className="text-sm text-foreground group-hover:text-brand">{c.label}</span>
            <span className="text-sm font-semibold tabular-nums text-foreground/70">{c.value}</span>
          </Link>
        ))}
      </section>

      <div className="col-span-12 grid gap-4 sm:grid-cols-2 2xl:grid-cols-4">
        {links.map(({ icon, title, detail, href }) => (
          <Link key={href} href={href} className={cn(RH_CARD, "ui-lift group flex items-center gap-4 p-5")}>
            <Tile icon={icon} className="h-10 w-10 rounded-[0.8rem]" />
            <div className="min-w-0 flex-1">
              <p className="font-medium text-foreground">{title}</p>
              <p className="truncate text-xs text-foreground/50">{detail}</p>
            </div>
            <ChevronRight className="h-4 w-4 text-foreground/30 transition group-hover:translate-x-0.5 group-hover:text-brand" aria-hidden />
          </Link>
        ))}
      </div>
    </div>
  );
}
