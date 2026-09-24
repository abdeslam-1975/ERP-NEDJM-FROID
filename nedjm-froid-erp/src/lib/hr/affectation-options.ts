import type { CatalogItem } from "@/lib/actions/hr-catalogs";

type SiteOpt = {
  id: string;
  name_fr: string;
  name_ar?: string | null;
};

/**
 * Affectation = Administration (catalogue) + chantiers actifs (live)
 * + autres entrées catalogue (éditables sans code).
 */
export function mergeAffectationCatalog(
  catalogs: CatalogItem[],
  sites: SiteOpt[],
): CatalogItem[] {
  const base = catalogs.filter(
    (c) => !(c.kind === "affectation" && String(c.code).startsWith("SITE:")),
  );
  const siteItems: CatalogItem[] = sites.map((s, i) => ({
    id: `virtual-site-${s.id}`,
    kind: "affectation",
    code: `SITE:${s.id}`,
    label_fr: s.name_fr,
    label_ar: (s.name_ar && s.name_ar.trim()) || s.name_fr,
    extra: { source: "site", site_id: s.id },
    color_bg: null,
    color_fg: null,
    sort_order: 100 + i,
    is_active: true,
  }));
  return [...base, ...siteItems];
}
