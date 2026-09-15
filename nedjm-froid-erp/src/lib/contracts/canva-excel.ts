import ExcelJS from "exceljs";

export type CanvaRow = {
  item_code: string;
  designation: string;
  unit: string;
  quantity: number;
  unit_price_ht: number;
  total_price_ht: number;
};

const LABOR_HEADERS = [
  "item_code",
  "designation",
  "effectif",
  "unit",
  "unit_price_ht",
  "total_price_ht",
];

const SPARE_HEADERS = [
  "item_code",
  "designation",
  "unit",
  "quantity",
  "unit_price_ht",
  "total_price_ht",
];

function toArrayBuffer(data: ExcelJS.Buffer | ArrayBuffer | Uint8Array): ArrayBuffer {
  if (data instanceof ArrayBuffer) return data;
  const view =
    data instanceof Uint8Array
      ? data
      : new Uint8Array(data as ArrayLike<number>);
  return view.buffer.slice(
    view.byteOffset,
    view.byteOffset + view.byteLength,
  ) as ArrayBuffer;
}

/** Downloadable empty canva with 2 sheets. */
export async function buildEmptyCanvaWorkbook(): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  const labor = wb.addWorksheet("Main-d'oeuvre");
  labor.addRow(LABOR_HEADERS);
  labor.addRow(["LAB-EXEMPLE", "Technicien HVAC", 1, "JOUR", 17500, 17500]);
  const spares = wb.addWorksheet("Pieces-detachees");
  spares.addRow(SPARE_HEADERS);
  spares.addRow(["SP-EXEMPLE", "Filtre à air", "U", 10, 1500, 15000]);
  const buf = await wb.xlsx.writeBuffer();
  return toArrayBuffer(buf);
}

function num(v: unknown): number {
  if (typeof v === "number") return v;
  const s = String(v ?? "")
    .trim()
    .replace(/\s/g, "")
    .replace(",", ".");
  if (s === "") return NaN;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

function pick(row: Record<string, unknown>, keys: string[]): unknown {
  const normalized = Object.fromEntries(
    Object.entries(row).map(([k, v]) => [
      k.trim().toLowerCase().replace(/['’]/g, "'"),
      v,
    ]),
  );
  for (const key of keys) {
    const k = key.toLowerCase();
    if (normalized[k] != null && String(normalized[k]).trim() !== "") {
      return normalized[k];
    }
  }
  return undefined;
}

function sheetToObjects(sheet: ExcelJS.Worksheet): Record<string, unknown>[] {
  const rows: Record<string, unknown>[] = [];
  let headers: string[] = [];
  sheet.eachRow((row, rowNumber) => {
    const values = row.values as unknown[];
    // ExcelJS rows are 1-indexed; values[0] is unused
    const cells = values.slice(1).map((c) => {
      if (c && typeof c === "object" && "text" in c) {
        return String((c as { text: string }).text);
      }
      if (c && typeof c === "object" && "result" in c) {
        return (c as { result: unknown }).result;
      }
      return c ?? "";
    });
    if (rowNumber === 1) {
      headers = cells.map((h) => String(h ?? "").trim());
      return;
    }
    const obj: Record<string, unknown> = {};
    headers.forEach((h, i) => {
      if (!h) return;
      obj[h] = cells[i] ?? "";
    });
    rows.push(obj);
  });
  return rows;
}

function parseSheetRows(
  rows: Record<string, unknown>[],
  kind: "LABOR" | "SPARE_PART",
): CanvaRow[] {
  const out: CanvaRow[] = [];
  for (const raw of rows) {
    const item_code = String(
      pick(raw, ["item_code", "code", "référence", "reference", "ref"]) ?? "",
    ).trim();
    const designation = String(
      pick(raw, [
        "designation",
        "désignation",
        "libelle",
        "libellé",
        "description",
      ]) ?? "",
    ).trim();
    if (!item_code && !designation) continue;
    if (!item_code || !designation) {
      throw new Error(
        `Ligne invalide (${kind}): code et désignation obligatoires.`,
      );
    }
    const quantity = num(
      pick(raw, [
        "quantity",
        "effectif",
        "qte",
        "qté",
        "qty",
        "quantite",
        "quantité",
      ]),
    );
    const unit_price_ht = num(
      pick(raw, [
        "unit_price_ht",
        "unit_price",
        "prix_unitaire",
        "prix",
        "pu",
        "pu_ht",
      ]),
    );
    let total_price_ht = num(
      pick(raw, ["total_price_ht", "total", "montant", "montant_ht"]),
    );
    if (!Number.isFinite(quantity) || !Number.isFinite(unit_price_ht)) {
      throw new Error(`Ligne ${item_code}: quantité/prix invalides.`);
    }
    if (!Number.isFinite(total_price_ht)) {
      total_price_ht = Math.round(quantity * unit_price_ht * 100) / 100;
    }
    const unit =
      String(
        pick(raw, ["unit", "unité", "unite"]) ??
          (kind === "LABOR" ? "JOUR" : "U"),
      ).trim() || (kind === "LABOR" ? "JOUR" : "U");

    out.push({
      item_code: item_code.toUpperCase(),
      designation,
      unit,
      quantity,
      unit_price_ht,
      total_price_ht,
    });
  }
  return out;
}

export async function parseFullCanva(buffer: ArrayBuffer): Promise<{
  labor: CanvaRow[];
  spares: CanvaRow[];
}> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const laborSheet =
    wb.worksheets.find((s) =>
      /main|labour|labor|oeuvre|œuvre/i.test(s.name),
    ) ?? wb.worksheets[0];
  const spareSheet =
    wb.worksheets.find((s) => /piece|pièce|spare|detache/i.test(s.name)) ??
    wb.worksheets[1];

  if (!laborSheet) throw new Error("Feuille Main-d'œuvre introuvable.");

  const labor = parseSheetRows(sheetToObjects(laborSheet), "LABOR");
  const spares = spareSheet
    ? parseSheetRows(sheetToObjects(spareSheet), "SPARE_PART")
    : [];

  return { labor, spares };
}

export async function parseFullCanvaFile(file: File): Promise<{
  labor: CanvaRow[];
  spares: CanvaRow[];
}> {
  const buffer = await file.arrayBuffer();
  return parseFullCanva(buffer);
}
