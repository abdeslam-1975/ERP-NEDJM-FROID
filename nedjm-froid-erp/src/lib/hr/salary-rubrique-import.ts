import { salaryClassFlags } from "@/lib/hr/payroll-calc";

export const SALARY_IMPORT_HEADERS = [
  "code",
  "label_fr",
  "label_ar",
  "nature",
  "unit",
  "category",
  "cotisable",
  "taxable",
  "apply_scope",
  "default_amount",
  "sort_order",
  "is_active",
] as const;

export type RubriqueDraft = {
  code: string;
  label_ar: string;
  label_fr: string;
  nature: "indemnite" | "prime" | "rappel" | "remboursement" | "retenue";
  unit: "day" | "month" | "percent" | "presence_day";
  category: "1" | "2" | "3" | "4";
  cotisable: boolean;
  taxable: boolean;
  apply_scope: "employee" | "site" | "contract" | "poste";
  default_amount: number;
  sort_order: number;
  is_active: boolean;
};

export type RubriqueParseFail = { code: string; error: string };

export type RubriqueImportPreview = {
  code: string;
  status: "new" | "update" | "unchanged" | "rejected";
  reason?: string;
  incoming: RubriqueDraft | null;
  keep_scope: boolean;
};

type ExistingRubrique = {
  code: string;
  label_ar: string;
  label_fr: string;
  nature: string;
  unit: string;
  category: string;
  cotisable: boolean;
  taxable: boolean;
  apply_scope: string;
  default_amount: number;
  sort_order: number;
  is_active: boolean;
};

function cell(v: unknown): string {
  if (v == null) return "";
  return String(v).replace(/\u00a0/g, " ").trim();
}

function normKey(k: string): string {
  return k
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['’]/g, "'")
    .replace(/[^a-z0-9\u0600-\u06ff]+/g, "_")
    .replace(/^_|_$/g, "");
}

function pick(row: Record<string, unknown>, keys: string[]): string {
  const map = Object.fromEntries(
    Object.entries(row).map(([k, v]) => [normKey(k), v]),
  );
  for (const key of keys) {
    const found = map[normKey(key)];
    const s = cell(found);
    if (s) return s;
  }
  return "";
}

function parseBool(raw: string, fallback: boolean): boolean {
  const v = raw.trim().toLowerCase();
  if (!v) return fallback;
  if (["1", "true", "oui", "yes", "o", "y", "نعم", "vrai"].includes(v)) return true;
  if (["0", "false", "non", "no", "n", "لا", "faux"].includes(v)) return false;
  return fallback;
}

function parseNature(raw: string): RubriqueDraft["nature"] | null {
  const v = raw.trim().toLowerCase();
  if (!v) return "indemnite";
  if (v.includes("rappel") || v.includes("تدارك")) return "rappel";
  if (v.includes("rembours") || v.includes("استرجاع")) return "remboursement";
  if (v.includes("retenue") || v.includes("اقتطاع")) return "retenue";
  if (v.includes("prime") || v.includes("منحة")) return "prime";
  if (v.includes("indemn") || v.includes("تعويض")) return "indemnite";
  if (["indemnite", "prime", "rappel", "remboursement", "retenue"].includes(v)) {
    return v as RubriqueDraft["nature"];
  }
  return null;
}

function parseUnit(raw: string, label = ""): RubriqueDraft["unit"] {
  const v = `${raw} ${label}`.toLowerCase();
  if (v.includes("presence") || v.includes("حضور")) return "presence_day";
  if (v.includes("percent") || v.includes("%") || v.includes("نسبة")) return "percent";
  if (/\*j\b|\/\s*j\b|jour|day|يومي|يوم/.test(v)) return "day";
  if (v.includes("month") || v.includes("mois") || v.includes("/f") || v.includes("شهر")) {
    return "month";
  }
  if (raw.trim() === "") return "month";
  return "month";
}

function parseScope(raw: string): RubriqueDraft["apply_scope"] | null {
  const v = raw.trim().toLowerCase();
  if (!v) return "employee";
  if (["site", "chantier", "workshop", "ورشة", "atelier"].includes(v)) return "site";
  if (["contract", "contrat", "عقد"].includes(v)) return "contract";
  if (["poste", "post", "fonction", "منصب", "وظيفة"].includes(v)) return "poste";
  if (["employee", "employe", "salarie", "ouvrier", "عامل"].includes(v)) {
    return "employee";
  }
  return null;
}

function parseCategory(raw: string): RubriqueDraft["category"] | null {
  const v = raw.trim();
  if (!v) return "1";
  if (["1", "2", "3", "4"].includes(v)) return v as RubriqueDraft["category"];
  const n = v.toLowerCase();
  if (n.includes("non cotisable") && n.includes("non imposable")) return "4";
  if (n.includes("imposable") && n.includes("non cotisable")) return "3";
  if (n.includes("cotisable") && n.includes("non imposable")) return "2";
  if (n.includes("cotisable") && n.includes("imposable")) return "1";
  return null;
}

export function flagsForCategory(category: RubriqueDraft["category"]): {
  cotisable: boolean;
  taxable: boolean;
} {
  return salaryClassFlags(category);
}

function codeOf(raw: string): string {
  const t = raw.trim();
  if (!t) return "";
  const n = Number(t.replace(",", "."));
  if (Number.isFinite(n) && t !== "") return String(Math.trunc(n)).toUpperCase();
  return t.toUpperCase();
}

export function mapObjectRow(
  row: Record<string, unknown>,
): { ok: true; data: RubriqueDraft } | { ok: false; fail: RubriqueParseFail } {
  const code = codeOf(
    pick(row, ["code", "code_rubrique", "rubrique", "id", "رمز", "الرمز", "n"]),
  );
  if (!code) {
    return { ok: false, fail: { code: "?", error: "Code manquant. · رمز البند مفقود." } };
  }
  if (code.length > 40) {
    return { ok: false, fail: { code, error: "Code trop long (40 caractères). · الرمز أطول من 40 حرفاً." } };
  }
  let label_fr = pick(row, ["label_fr", "libelle_fr", "libelle", "designation", "intitule"]);
  let label_ar = pick(row, ["label_ar", "libelle_ar", "التسمية", "التسميه"]);
  if (!label_fr && !label_ar) {
    return { ok: false, fail: { code, error: "Libellé manquant. · التسمية مفقودة." } };
  }
  if (!label_fr) label_fr = label_ar;
  if (!label_ar) label_ar = label_fr;

  const nature = parseNature(pick(row, ["nature", "type", "النوع"]));
  if (!nature) {
    return { ok: false, fail: { code, error: "Nature inconnue. · نوع البند غير معروف." } };
  }
  const category = parseCategory(pick(row, ["category", "classe", "categorie", "الصنف"]));
  if (!category) {
    return { ok: false, fail: { code, error: "Classe invalide (1 à 4). · الصنف يجب أن يكون 1 أو 2 أو 3 أو 4." } };
  }
  const apply_scope = parseScope(
    pick(row, ["apply_scope", "scope", "application", "يطبق_على", "يطب_ق_على"]),
  );
  if (!apply_scope) {
    return { ok: false, fail: { code, error: "Niveau d'application inconnu (chantier / contrat / employé). · مستوى التطبيق غير معروف (ورشة / عقد / عامل)." } };
  }
  const derived = flagsForCategory(category);
  const unit = parseUnit(pick(row, ["unit", "unite", "الوحدة"]), `${label_fr} ${label_ar}`);
  const amountRaw = pick(row, ["default_amount", "amount", "montant", "valeur", "المبلغ"]);
  const default_amount = amountRaw ? Number(amountRaw.replace(/\s/g, "").replace(",", ".")) : 0;
  if (!Number.isFinite(default_amount) || default_amount < 0) {
    return { ok: false, fail: { code, error: "Montant invalide. · المبلغ غير صالح." } };
  }
  const sortRaw = pick(row, ["sort_order", "ordre", "order"]);
  const sort_order = sortRaw
    ? Number.parseInt(sortRaw, 10)
    : Number.parseInt(code, 10) || 10;
  const is_active = parseBool(pick(row, ["is_active", "actif", "active"]), true);
  return {
    ok: true,
    data: {
      code,
      label_ar: label_ar.slice(0, 160),
      label_fr: label_fr.slice(0, 160),
      nature,
      unit,
      category,
      cotisable: derived.cotisable,
      taxable: derived.taxable,
      apply_scope,
      default_amount,
      sort_order: Number.isFinite(sort_order) ? Math.max(0, Math.min(9999, sort_order)) : 10,
      is_active,
    },
  };
}

export function matrixToObjects(rows: unknown[][]): Record<string, unknown>[] {
  if (!rows.length) return [];
  const headers = rows[0].map((h) => cell(h));
  if (!headers.some(Boolean)) return [];
  const out: Record<string, unknown>[] = [];
  for (const row of rows.slice(1)) {
    if (!row.some((v) => cell(v) !== "")) continue;
    const obj: Record<string, unknown> = {};
    headers.forEach((h, i) => {
      if (h) obj[h] = row[i];
    });
    out.push(obj);
  }
  return out;
}

function categoryFromGroup(group: string): RubriqueDraft["category"] {
  return parseCategory(group) ?? "1";
}

export function parseGasStyleMatrix(rows: unknown[][]): RubriqueDraft[] | null {
  if (rows.length < 3) return null;
  const r1 = rows[0] ?? [];
  const r2 = rows[1] ?? [];
  const r3 = rows[2] ?? [];
  const width = Math.max(r1.length, r2.length, r3.length);
  let numericCodes = 0;
  for (let i = 0; i < width; i += 1) {
    const n = Number(r3[i]);
    if (Number.isFinite(n) && n >= 100 && n < 500) numericCodes += 1;
  }
  if (numericCodes < 4) return null;
  const groupText = rows[0].map((v) => cell(v)).join(" ").toLowerCase();
  if (!groupText.includes("cotisable") && !groupText.includes("imposable")) return null;

  let group = "";
  const byCode = new Map<string, RubriqueDraft>();
  let prevCodeCol = -1;
  for (let c = 0; c < width; c += 1) {
    const g = cell(r1[c]);
    if (g) group = g;
    const codeRaw = r3[c];
    if (codeRaw == null || cell(codeRaw) === "") continue;
    const code = codeOf(cell(codeRaw));
    if (!code) continue;
    const sameCol = cell(r2[c]);
    const block: string[] = [];
    for (let i = prevCodeCol + 1; i <= c; i += 1) {
      const lab = cell(r2[i]);
      if (lab) block.push(lab);
    }
    prevCodeCol = c;
    const rawLabel = sameCol || pickDisplayLabel(block);
    const label_fr = (rawLabel || `Rubrique ${code}`).slice(0, 160);
    const label_ar = (rawLabel ? rawLabel : `بند ${code}`).slice(0, 160);
    const category = categoryFromGroup(group);
    const flags = flagsForCategory(category);
    const nature = parseNature(label_fr) ?? "indemnite";
    const unit = parseUnit("", [sameCol, ...block, label_fr].join(" "));
    byCode.set(code, {
      code,
      label_fr,
      label_ar,
      nature,
      unit,
      category,
      cotisable: flags.cotisable,
      taxable: flags.taxable,
      apply_scope: "employee",
      default_amount: 0,
      sort_order: Number.parseInt(code, 10) || 10,
      is_active: true,
    });
  }
  return byCode.size ? [...byCode.values()] : null;
}

function pickDisplayLabel(labels: string[]) {
  if (!labels.length) return "";
  const named = labels.filter((l) => !/(\*[Jj]|\/\s*[JjFf]|%\s|\*%|journalier)/i.test(l));
  return (named.at(-1) || labels.at(-1) || "").replace(/\s+/g, " ").trim();
}

export function parseRecords(
  records: Record<string, unknown>[],
): { drafts: RubriqueDraft[]; rejected: RubriqueParseFail[] } {
  const drafts: RubriqueDraft[] = [];
  const rejected: RubriqueParseFail[] = [];
  const seen = new Set<string>();
  for (const rec of records) {
    const mapped = mapObjectRow(rec);
    if (!mapped.ok) {
      rejected.push(mapped.fail);
      continue;
    }
    if (seen.has(mapped.data.code)) {
      rejected.push({ code: mapped.data.code, error: "Code dupliqué dans le fichier. · رمز مكرر في الملف." });
      continue;
    }
    seen.add(mapped.data.code);
    drafts.push(mapped.data);
  }
  return { drafts, rejected };
}

function sameDraft(a: RubriqueDraft, b: ExistingRubrique): boolean {
  return (
    a.label_ar === b.label_ar &&
    a.label_fr === b.label_fr &&
    a.nature === b.nature &&
    a.unit === b.unit &&
    a.category === b.category &&
    a.cotisable === b.cotisable &&
    a.taxable === b.taxable &&
    a.apply_scope === b.apply_scope &&
    a.default_amount === Number(b.default_amount) &&
    a.sort_order === b.sort_order &&
    a.is_active === b.is_active
  );
}

export function previewRubriqueImport(
  drafts: RubriqueDraft[],
  rejected: RubriqueParseFail[],
  existing: ExistingRubrique[],
  replaceScope: boolean,
): RubriqueImportPreview[] {
  const current = new Map(existing.map((r) => [r.code.toUpperCase(), r]));
  const rows: RubriqueImportPreview[] = rejected.map((fail) => ({
    code: fail.code,
    status: "rejected",
    reason: fail.error,
    incoming: null,
    keep_scope: false,
  }));
  for (const draft of drafts) {
    const prev = current.get(draft.code);
    if (!prev) {
      rows.push({ code: draft.code, status: "new", incoming: draft, keep_scope: false });
      continue;
    }
    const incoming = { ...draft };
    let keep_scope = false;
    if (!replaceScope && prev.apply_scope !== draft.apply_scope) {
      incoming.apply_scope = prev.apply_scope as RubriqueDraft["apply_scope"];
      keep_scope = true;
    }
    if (sameDraft(incoming, prev)) {
      rows.push({
        code: draft.code,
        status: "unchanged",
        incoming,
        keep_scope,
      });
      continue;
    }
    rows.push({
      code: draft.code,
      status: "update",
      incoming,
      keep_scope,
      reason: keep_scope
        ? "Niveau d'application actuel conservé. · مستوى التطبيق الحالي سيُحتفظ به."
        : undefined,
    });
  }
  return rows;
}

export function parseCsvText(text: string): Record<string, unknown>[] {
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l) => l.trim() !== "");
  if (!lines.length) return [];
  const split = (line: string) => {
    const out: string[] = [];
    let cur = "";
    let q = false;
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      if (ch === '"') {
        if (q && line[i + 1] === '"') {
          cur += '"';
          i += 1;
        } else q = !q;
      } else if (ch === "," && !q) {
        out.push(cur);
        cur = "";
      } else cur += ch;
    }
    out.push(cur);
    return out;
  };
  const headers = split(lines[0]);
  return lines.slice(1).map((line) => {
    const cols = split(line);
    const obj: Record<string, unknown> = {};
    headers.forEach((h, i) => {
      obj[h] = cols[i] ?? "";
    });
    return obj;
  });
}

export function parseJsonText(text: string): Record<string, unknown>[] {
  const data = JSON.parse(text) as unknown;
  if (Array.isArray(data)) return data as Record<string, unknown>[];
  if (data && typeof data === "object") {
    const obj = data as Record<string, unknown>;
    if (Array.isArray(obj.rubriques)) return obj.rubriques as Record<string, unknown>[];
    if (Array.isArray(obj.items)) return obj.items as Record<string, unknown>[];
  }
  throw new Error("JSON : liste de rubriques attendue. · ملف JSON يجب أن يكون قائمة بنود.");
}
