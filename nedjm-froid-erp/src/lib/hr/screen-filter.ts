import { matriculeKey } from "@/lib/hr/contract-import";

export type FilterChip = {
  id: string;
  kind: "text" | "value";
  /** French label shown on the chip. */
  label: string;
  /** Facet key for a value chip (`statut`, `annee`, `chantier`…). */
  field?: string;
  value: string;
};

export type FilterFacet = {
  field: string;
  value: string;
  /** French suggestion, for example `Statut : Actif`. */
  label: string;
};

export type FilterRow = {
  text: string;
  matricule?: string | null;
  facets: FilterFacet[];
};

export type FilterSuggestion = {
  id: string;
  label: string;
  chip: Omit<FilterChip, "id">;
};

export type FilterSnapshot = {
  personalChips: FilterChip[];
  personalAt: string | null;
  dismissedSharedAt: string | null;
  sharedChips: FilterChip[] | null;
  sharedAt: string | null;
  isSuperAdmin: boolean;
};

export type FilterView = {
  source: "personal" | "shared" | "normal";
  chips: FilterChip[];
};

export function fold(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("fr")
    .trim();
}

function time(value: string | null): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Which chips are on screen for this account. */
export function resolveFilter(state: FilterSnapshot): FilterView {
  const personalAt = time(state.personalAt);
  const sharedAt = state.sharedChips && state.sharedAt ? time(state.sharedAt) : 0;
  const dismissed = time(state.dismissedSharedAt);
  const sharedOn = sharedAt > 0 && state.sharedChips != null;
  const personalOn = state.personalChips.length > 0 && personalAt > 0;

  if (sharedOn && personalOn && personalAt >= sharedAt && personalAt >= dismissed) {
    return { source: "personal", chips: state.personalChips };
  }
  if (sharedOn && dismissed < sharedAt) {
    return { source: "shared", chips: state.sharedChips ?? [] };
  }
  if (sharedOn && dismissed >= sharedAt) return { source: "normal", chips: [] };
  if (personalOn) return { source: "personal", chips: state.personalChips };
  return { source: "normal", chips: [] };
}

function matriculeQuery(value: string): string | null {
  const compact = value.replace(/\s+/g, "");
  if (!/^\d+\/\d{2,4}$/.test(compact)) return null;
  return matriculeKey(compact);
}

export function rowMatches(row: FilterRow, chips: FilterChip[]): boolean {
  return chips.every((chip) => {
    if (chip.kind === "value") {
      return row.facets.some((facet) => facet.field === chip.field && facet.value === chip.value);
    }
    const needle = fold(chip.value);
    if (!needle) return true;
    const matricule = matriculeQuery(chip.value);
    if (matricule && matriculeKey(row.matricule) === matricule) return true;
    return fold(row.text).includes(needle);
  });
}

export function applyFilter<T>(rows: T[], described: FilterRow[], chips: FilterChip[]): T[] {
  if (!chips.length) return rows;
  return rows.filter((_, index) => rowMatches(described[index] ?? { text: "", facets: [] }, chips));
}

type FacetHit = FilterFacet & { count: number };

function collectFacets(rows: FilterRow[]): FacetHit[] {
  const hits = new Map<string, FacetHit>();
  for (const row of rows) {
    for (const facet of row.facets) {
      const key = `${facet.field}\0${facet.value}`;
      const current = hits.get(key);
      if (current) current.count += 1;
      else hits.set(key, { ...facet, count: 1 });
    }
  }
  return [...hits.values()];
}

/** Suggestions while typing. A bare year that matches several fields stays a choice. */
export function suggestFilters(query: string, rows: FilterRow[]): FilterSuggestion[] {
  const typed = query.trim();
  const needle = fold(typed);
  const facets = collectFacets(rows);
  const ranked = facets
    .filter((facet) => {
      if (!needle) return true;
      return fold(facet.label).includes(needle) || fold(facet.value).includes(needle);
    })
    .sort((a, b) => {
      const aExact = fold(a.value) === needle || fold(a.label) === needle ? 1 : 0;
      const bExact = fold(b.value) === needle || fold(b.label) === needle ? 1 : 0;
      if (aExact !== bExact) return bExact - aExact;
      return b.count - a.count || a.label.localeCompare(b.label, "fr");
    })
    .slice(0, needle ? 8 : 8);

  const suggestions: FilterSuggestion[] = ranked.map((facet) => ({
    id: `${facet.field}:${facet.value}`,
    label: facet.label,
    chip: { kind: "value", field: facet.field, label: facet.label, value: facet.value },
  }));
  if (typed) {
    suggestions.push({
      id: "text",
      label: `Rechercher « ${typed} »`,
      chip: { kind: "text", label: typed, value: typed },
    });
  }
  return suggestions;
}

/** A year (or similar) offered under more than one heading must be chosen. */
export function suggestionsAreAmbiguous(query: string, suggestions: FilterSuggestion[]): boolean {
  if (!/^\d{4}$/.test(query.trim())) return false;
  const fields = new Set(
    suggestions.flatMap((item) => (item.chip.kind === "value" && item.chip.field ? [item.chip.field] : [])),
  );
  return fields.size >= 2;
}

export function emptyFilterHint(rows: FilterRow[], chips: FilterChip[]): string | null {
  if (!chips.length || !rows.length) return null;
  if (rows.some((row) => rowMatches(row, chips))) return null;
  for (const chip of chips) {
    if (!rows.some((row) => rowMatches(row, [chip]))) {
      return `Aucun résultat. Le filtre « ${chip.label} » ne correspond à aucune ligne.`;
    }
  }
  return `Aucun résultat pour : ${chips.map((chip) => chip.label).join(", ")}.`;
}

export function filterCountLabel(shown: number, total: number): string {
  return `${shown} sur ${total}`;
}
