import type { CatalogItem } from "@/lib/actions/hr-catalogs";
import type { HrEmployeeFiche, HrEmployeeField } from "@/lib/actions/hr-employees";

function catalogLabel(o: Pick<CatalogItem, "label_fr" | "label_ar">): string {
  const fr = (o.label_fr ?? "").trim();
  const ar = (o.label_ar ?? "").trim();
  if (!fr) return ar;
  if (!ar || ar === fr) return fr;
  return `${fr} — ${ar}`;
}

export type ExportColumn = { code: string; labelFr: string; labelAr: string };

export type EmployeeExportTable = {
  columns: ExportColumn[];
  rows: string[][];
};

/** Active columns of the employee table, without the photo (a link, not a cell of the base). */
export function exportColumns(fields: HrEmployeeField[]): ExportColumn[] {
  return fields
    .filter((f) => f.is_active && f.code !== "photo_url")
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order || a.label_fr.localeCompare(b.label_fr, "fr"))
    .map((f) => ({ code: f.code, labelFr: f.label_fr || f.code, labelAr: f.label_ar || "" }));
}

function rawValue(row: HrEmployeeFiche, field: HrEmployeeField): unknown {
  if (field.storage_group === "extra") return row.attrs?.[field.code];
  return (row as unknown as Record<string, unknown>)[field.code];
}

/** The text shown in the table: a catalogue code becomes its label. */
export function employeeCellText(row: HrEmployeeFiche, field: HrEmployeeField, catalogs: CatalogItem[]): string {
  const raw = rawValue(row, field);
  if (raw == null || raw === "") return "";
  if (field.value_type === "catalog" && field.catalog_kind) {
    const opt = catalogs.find((c) => c.kind === field.catalog_kind && c.code === String(raw));
    return opt ? catalogLabel(opt) : String(raw);
  }
  return String(raw);
}

/**
 * The employee base as a grid. `employeeIds` and `fieldCodes` limit it to the part the user chose;
 * omitted, the whole base and every exportable column are used.
 */
export function buildEmployeeExport(
  rows: HrEmployeeFiche[],
  fields: HrEmployeeField[],
  catalogs: CatalogItem[],
  opts: { employeeIds?: ReadonlySet<string>; fieldCodes?: ReadonlySet<string> } = {},
): EmployeeExportTable {
  const byCode = new Map(fields.map((f) => [f.code, f]));
  const columns = exportColumns(fields).filter((c) => !opts.fieldCodes || opts.fieldCodes.has(c.code));
  const chosen = opts.employeeIds ? rows.filter((r) => opts.employeeIds!.has(r.id)) : rows;
  return {
    columns,
    rows: chosen.map((row) =>
      columns.map((c) => {
        const field = byCode.get(c.code);
        return field ? employeeCellText(row, field, catalogs) : "";
      }),
    ),
  };
}

function esc(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Printable page of the same grid (landscape, header repeated on each page). */
export function employeeExportHtml(table: EmployeeExportTable, opts: { title: string; subtitle: string }): string {
  const head = table.columns
    .map(
      (c) =>
        `<th>${esc(c.labelFr)}${c.labelAr ? `<br><span class="ar">${esc(c.labelAr)}</span>` : ""}</th>`,
    )
    .join("");
  const body = table.rows
    .map((row) => `<tr>${row.map((cell) => `<td>${esc(cell) || "—"}</td>`).join("")}</tr>`)
    .join("");
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${esc(opts.title)}</title>
<style>
  @page { size: A4 landscape; margin: 10mm; }
  body { font-family: "Segoe UI", sans-serif; color: #1c1917; margin: 0; }
  h1 { font-size: 16px; margin: 0; }
  p { margin: 2px 0 10px; font-size: 11px; color: #57534e; }
  table { border-collapse: collapse; width: 100%; font-size: 9px; }
  th, td { border: 1px solid #d6d3d1; padding: 3px 5px; text-align: left; vertical-align: top; }
  th { background: #fff7ed; font-size: 8px; }
  .ar { font-weight: 500; color: #9a3412; }
  tr { break-inside: avoid; }
  thead { display: table-header-group; }
</style></head><body>
<h1>${esc(opts.title)}</h1>
<p>${esc(opts.subtitle)}</p>
<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>
</body></html>`;
}
