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
  it("finds an Arabic name despite hamza and a French name without its accent", () => {
    const row: FilterRow = { text: "أحمد Amélie", matricule: "1/24", facets: [] };
    const chip = { id: "1", kind: "text" as const, label: "احمد", value: "احمد" };
    expect(rowMatches(row, [chip])).toBe(true);
    expect(rowMatches(row, [{ ...chip, label: "amelie", value: "amelie" }])).toBe(true);
    expect(rowMatches(row, [{ ...chip, label: "cherif", value: "cherif" }])).toBe(false);
  });

  it("matches a matricule written with or without leading zeros", () => {
    const chip = { id: "1", kind: "text" as const, label: "5/08", value: "5/08" };
    expect(rowMatches(rows[0], [chip])).toBe(true);
    expect(rowMatches(rows[1], [{ ...chip, value: "1/21", label: "1/21" }])).toBe(true);
    expect(rowMatches(rows[0], [{ ...chip, value: "1/21", label: "1/21" }])).toBe(false);
  });

  it("finds a row from any written word, including a facet that is not in the main text", () => {
    const chip = { id: "1", kind: "text" as const, label: "actif oran", value: "actif oran" };
    expect(rowMatches(rows[0], [chip])).toBe(true);
    expect(rowMatches(rows[1], [chip])).toBe(false);
    expect(rowMatches(rows[1], [{ ...chip, value: "2021", label: "2021" }])).toBe(true);
  });

  it("keeps only rows that match every chip", () => {
    const chips = [
      { id: "a", kind: "value" as const, field: "statut", label: "Statut : Actif", value: "ACTIVE" },
      { id: "b", kind: "text" as const, label: "benali", value: "benali" },
    ];
    expect(applyFilter(["a", "b"], rows, chips)).toEqual(["a"]);
  });

  it("runs whatever sentence is written and still finds a name inside it", () => {
    const withPeriods: FilterRow[] = [
      { ...rows[0], periods: [{ field: "card", value: "2026-11" }] },
      { ...rows[1], periods: [{ field: "card", value: "2026-11" }] },
    ];
    const chip = {
      id: "1",
      kind: "text" as const,
      label: "sentence",
      value: "اعرض لي benali الذي انجزته خلال شهر نوفمبر 2026",
    };
    expect(rowMatches({ ...withPeriods[0], text: "Benali Ahmed" }, [chip])).toBe(true);
    expect(rowMatches(withPeriods[1], [chip])).toBe(false);
    expect(rowMatches(withPeriods[0], [{ ...chip, value: "النشطون" }])).toBe(true);
    expect(rowMatches(withPeriods[1], [{ ...chip, value: "النشطون" }])).toBe(false);
    expect(rowMatches(withPeriods[1], [{ ...chip, value: "بدون ضمان" }])).toBe(true);
    expect(rowMatches(withPeriods[0], [{ ...chip, value: "بدون ضمان" }])).toBe(false);
    expect(suggestFilters("ما تم تعديله في نوفمبر 2026", withPeriods).some((item) => item.label.includes("نوفمبر 2026"))).toBe(true);
  });

  it("offers several meanings for a year and a free-text search", () => {
    const suggestions = suggestFilters("2021", rows);
    expect(suggestions.map((item) => item.label)).toEqual([
      "Rechercher « 2021 »",
      "Année d'embauche : 2021",
      "Année du document : 2021",
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
