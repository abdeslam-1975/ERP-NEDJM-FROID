/** Employee fields used to open a fiche from the search bar. */
export type FicheSearchable = {
  id: string;
  matricule: string;
  last_name: string;
  first_name: string;
  last_name_ar?: string | null;
  first_name_ar?: string | null;
  nss?: string | null;
  nin?: string | null;
};

export type FicheSearchResult =
  | { ok: true; employee: FicheSearchable }
  | { ok: false; error: string };

function norm(value: string | null | undefined) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

function nameMatches(row: FicheSearchable, needle: string) {
  const last = norm(row.last_name);
  const first = norm(row.first_name);
  const lastAr = norm(row.last_name_ar);
  const firstAr = norm(row.first_name_ar);
  return (
    last.includes(needle) ||
    first.includes(needle) ||
    (lastAr !== "" && lastAr.includes(needle)) ||
    (firstAr !== "" && firstAr.includes(needle)) ||
    `${last} ${first}`.includes(needle) ||
    `${first} ${last}`.includes(needle) ||
    (lastAr !== "" && firstAr !== "" && `${lastAr} ${firstAr}`.includes(needle)) ||
    (lastAr !== "" && firstAr !== "" && `${firstAr} ${lastAr}`.includes(needle))
  );
}

/** Looks up one employee by matricule, NSS, NIN (exact) or by name (contains). */
export function findEmployeeForFicheSearch(
  rows: readonly FicheSearchable[],
  query: string,
): FicheSearchResult {
  const needle = norm(query);
  if (!needle) {
    return { ok: false, error: "Saisissez un critère de recherche. · أدخل معيار البحث." };
  }

  const byId = rows.find(
    (row) =>
      norm(row.matricule) === needle ||
      (row.nss != null && row.nss !== "" && norm(row.nss) === needle) ||
      (row.nin != null && row.nin !== "" && norm(row.nin) === needle),
  );
  if (byId) return { ok: true, employee: byId };

  const byName = rows.filter((row) => nameMatches(row, needle));
  if (byName.length === 1) return { ok: true, employee: byName[0] };
  if (byName.length > 1) {
    const sample = byName
      .slice(0, 5)
      .map((row) => `${row.matricule} ${row.last_name} ${row.first_name}`.trim())
      .join(" · ");
    const more = byName.length > 5 ? ` (+${byName.length - 5})` : "";
    return {
      ok: false,
      error: `Plusieurs employés trouvés : ${sample}${more}. Affinez (matricule, NSS ou NIN). · عدة عمال، دقّق البحث.`,
    };
  }

  return { ok: false, error: "Aucun employé pour cette recherche. · لا يوجد عامل بهذا البحث." };
}
