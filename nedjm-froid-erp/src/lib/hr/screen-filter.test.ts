import { describe, expect, it } from "vitest";
import {
  applyFilter,
  emptyFilterHint,
  resolveFilter,
  rowMatches,
  suggestFilters,
  suggestionsAreAmbiguous,
  type FilterRow,
  type FilterSnapshot,
} from "@/lib/hr/screen-filter";

const rows: FilterRow[] = [
  {
    text: "Benali Ahmed 05/08",
    matricule: "05/08",
    facets: [
      { field: "statut", value: "ACTIVE", label: "Statut : Actif" },
      { field: "annee", value: "2008", label: "Année d'embauche : 2008" },
      { field: "chantier", value: "Oran", label: "Chantier : Oran" },
    ],
  },
  {
    text: "Cherif Lina 01/21",
    matricule: "001/21",
    facets: [
      { field: "statut", value: "INACTIVE", label: "Statut : Inactif" },
      { field: "annee", value: "2021", label: "Année d'embauche : 2021" },
      { field: "annee_doc", value: "2021", label: "Année du document : 2021" },
      { field: "manque", value: "nss", label: "Sans NSS" },
    ],
  },
];

const base: FilterSnapshot = {
  personalChips: [],
  personalAt: null,
  dismissedSharedAt: null,
  sharedChips: null,
  sharedAt: null,
  isSuperAdmin: false,
};

describe("screen filter", () => {
  it("matches a matricule written with or without leading zeros", () => {
    const chip = { id: "1", kind: "text" as const, label: "5/08", value: "5/08" };
    expect(rowMatches(rows[0], [chip])).toBe(true);
    expect(rowMatches(rows[1], [{ ...chip, value: "1/21", label: "1/21" }])).toBe(true);
    expect(rowMatches(rows[0], [{ ...chip, value: "1/21", label: "1/21" }])).toBe(false);
  });

  it("keeps only rows that match every chip", () => {
    const chips = [
      { id: "a", kind: "value" as const, field: "statut", label: "Statut : Actif", value: "ACTIVE" },
      { id: "b", kind: "text" as const, label: "benali", value: "benali" },
    ];
    expect(applyFilter(["a", "b"], rows, chips)).toEqual(["a"]);
  });

  it("offers several meanings for a year and a free-text search", () => {
    const suggestions = suggestFilters("2021", rows);
    expect(suggestions.map((item) => item.label)).toEqual([
      "Année d'embauche : 2021",
      "Année du document : 2021",
      "Rechercher « 2021 »",
    ]);
    expect(suggestionsAreAmbiguous("2021", suggestions)).toBe(true);
    expect(suggestionsAreAmbiguous("Actif", suggestFilters("Actif", rows))).toBe(false);
  });

  it("names the chip that emptied the list", () => {
    const chips = [{ id: "1", kind: "value" as const, field: "statut", label: "Statut : Actif", value: "GONE" }];
    expect(emptyFilterHint(rows, chips)).toBe("Aucun résultat. Le filtre « Statut : Actif » ne correspond à aucune ligne.");
  });

  it("shows a personal filter only on that account, then the shared one, then the saved personal filter again", () => {
    const personal = {
      ...base,
      personalChips: [{ id: "p", kind: "text" as const, label: "benali", value: "benali" }],
      personalAt: "2026-11-05T10:00:00.000Z",
    };
    expect(resolveFilter(personal).source).toBe("personal");

    const shared = {
      ...personal,
      sharedChips: [{ id: "s", kind: "value" as const, field: "statut", label: "Statut : Actif", value: "ACTIVE" }],
      sharedAt: "2026-11-05T11:00:00.000Z",
    };
    expect(resolveFilter(shared).source).toBe("shared");

    const optedOut = { ...shared, dismissedSharedAt: "2026-11-05T12:00:00.000Z" };
    expect(resolveFilter(optedOut).source).toBe("normal");

    const sharedGone = { ...optedOut, sharedChips: null, sharedAt: null };
    expect(resolveFilter(sharedGone).source).toBe("personal");
  });

  it("lets a newer personal filter replace the shared view for that account", () => {
    const view = resolveFilter({
      ...base,
      personalChips: [{ id: "p", kind: "text" as const, label: "lina", value: "lina" }],
      personalAt: "2026-11-05T12:00:00.000Z",
      sharedChips: [{ id: "s", kind: "value" as const, field: "statut", label: "Statut : Actif", value: "ACTIVE" }],
      sharedAt: "2026-11-05T11:00:00.000Z",
    });
    expect(view.source).toBe("personal");
    expect(view.chips[0]?.value).toBe("lina");
  });
});
