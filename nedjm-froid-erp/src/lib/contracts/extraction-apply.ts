import type {
  ContractAttributes,
  ContractClause,
  PenaltyRule,
} from "@/lib/contracts/attributes-schema";
import type {
  ExtractedPenalty,
  ExtractionResult,
  ExtractionSource,
  HeaderKey,
} from "@/lib/contracts/extraction-schema";

export type ExtractionSelection = {
  header: HeaderKey[];
  penalties: number[];
  penalty_cap: boolean;
  termination: boolean;
  clauses: number[];
};

export type HeaderSnapshot = {
  start_date: string;
  end_date: string;
  ods_date: string | null;
  total_amount_ht: number;
  caution_rate: number;
  total_mode: "AUTO" | "MANUAL";
};

export type HeaderPatch = Partial<{
  start_date: string;
  end_date: string;
  ods_date: string;
  total_amount_ht: number;
  caution_rate: number;
}>;

export type AppliedExtraction = {
  attributes: ContractAttributes;
  attributesChanged: boolean;
  header: HeaderPatch;
  applied: string[];
  skipped: string[];
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function validIsoDate(value: string): string | null {
  const text = value.trim();
  if (!ISO_DATE.test(text)) return null;
  const date = new Date(`${text}T00:00:00Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== text ? null : text;
}

/** Accepts "281 195 650,00", "281195650.00" or "5 %" style numbers. */
export function parseLooseNumber(value: string): number | null {
  const cleaned = value
    .replace(/[\s\u00a0\u202f]/g, "")
    .replace(/(DA|DZD|%)/gi, "")
    .trim();
  if (!cleaned) return null;
  const normalized =
    cleaned.includes(",") && !cleaned.includes(".")
      ? cleaned.replace(",", ".")
      : cleaned.replace(/,/g, "");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

export function parseCautionRate(value: string): number | null {
  const n = parseLooseNumber(value);
  if (n == null || n < 0) return null;
  const rate = value.includes("%") || n > 1 ? n / 100 : n;
  return rate <= 1 ? Math.round(rate * 1_000_000) / 1_000_000 : null;
}

export function documentIdFor(source: ExtractionSource, documentIds: string[]): string | null {
  return source.document >= 1 ? (documentIds[source.document - 1] ?? null) : null;
}

function customCode(label: string, taken: Set<string>): string {
  const base =
    label
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 48) || "PENALITE";
  let code = base;
  let n = 2;
  while (taken.has(code)) code = `${base}_${n++}`;
  return code;
}

function penaltyPatch(p: ExtractedPenalty): Partial<PenaltyRule> {
  const patch: Partial<PenaltyRule> = { mode: p.mode };
  if (p.mode === "FIXED") {
    if (p.fixed_amount != null) patch.fixed_amount = p.fixed_amount;
  } else if (p.mode === "PROGRESSIVE") {
    if (p.brackets.length) {
      patch.brackets = [...p.brackets].sort((a, b) => a.from_day - b.from_day);
    }
  } else if (p.rate != null) {
    patch.rate = p.rate;
  }
  if (p.grace_hours != null) patch.grace_hours = p.grace_hours;
  if (p.grace_days != null) patch.grace_days = p.grace_days;
  return patch;
}

function penaltyUsable(p: ExtractedPenalty): boolean {
  if (p.mode === "FIXED") return p.fixed_amount != null;
  if (p.mode === "PROGRESSIVE") return p.brackets.length > 0;
  return p.rate != null;
}

export function applyExtraction(input: {
  attributes: ContractAttributes;
  header: HeaderSnapshot;
  result: ExtractionResult;
  selection: ExtractionSelection;
  documentIds: string[];
  newId: () => string;
}): AppliedExtraction {
  const { result, selection, documentIds, newId } = input;
  const applied: string[] = [];
  const skipped: string[] = [];
  let attrs: ContractAttributes = structuredClone(input.attributes);
  let attributesChanged = false;
  const header: HeaderPatch = {};

  for (const key of selection.header) {
    const field = result.header?.[key];
    if (!field) continue;
    if (key === "start_date" || key === "end_date" || key === "ods_date") {
      const date = validIsoDate(field.value);
      if (!date) {
        skipped.push(`${key} : date illisible (« ${field.value} »).`);
        continue;
      }
      header[key] = date;
    } else if (key === "total_amount_ht") {
      const amount = parseLooseNumber(field.value);
      if (amount == null || amount < 0) {
        skipped.push(`Montant HT illisible (« ${field.value} »).`);
        continue;
      }
      if (input.header.total_mode !== "MANUAL") {
        skipped.push(
          "Montant HT non appliqué : le contrat calcule son total à partir des lignes (mode AUTO).",
        );
        continue;
      }
      header.total_amount_ht = Math.round(amount * 100) / 100;
    } else if (key === "caution_rate") {
      const rate = parseCautionRate(field.value);
      if (rate == null) {
        skipped.push(`Taux de caution illisible (« ${field.value} »).`);
        continue;
      }
      header.caution_rate = rate;
    }
    applied.push(`En-tête : ${key}`);
  }

  const start = header.start_date ?? input.header.start_date;
  const end = header.end_date ?? input.header.end_date;
  if ((header.start_date || header.end_date) && end < start) {
    delete header.start_date;
    delete header.end_date;
    for (const key of ["start_date", "end_date"]) {
      const at = applied.indexOf(`En-tête : ${key}`);
      if (at >= 0) applied.splice(at, 1);
    }
    skipped.push("Dates non appliquées : la date de fin serait avant la date de début.");
  }

  const taken = new Set(
    [...attrs.penalties.presets, ...attrs.penalties.custom].map((p) => p.code),
  );
  for (const index of selection.penalties) {
    const p = result.penalties[index];
    if (!p) continue;
    if (!penaltyUsable(p)) {
      skipped.push(`Pénalité « ${p.label} » : taux ou montant absent.`);
      continue;
    }
    const patch = penaltyPatch(p);
    const presetIndex = p.preset_code
      ? attrs.penalties.presets.findIndex((rule) => rule.code === p.preset_code)
      : -1;
    const customIndex =
      presetIndex < 0 && p.preset_code
        ? attrs.penalties.custom.findIndex((rule) => rule.code === p.preset_code)
        : -1;
    if (presetIndex >= 0) {
      attrs.penalties.presets[presetIndex] = {
        ...attrs.penalties.presets[presetIndex],
        ...patch,
      };
    } else if (customIndex >= 0) {
      attrs.penalties.custom[customIndex] = {
        ...attrs.penalties.custom[customIndex],
        ...patch,
      };
    } else {
      const code = customCode(p.label, taken);
      taken.add(code);
      attrs.penalties.custom.push({
        id: newId(),
        code,
        label: p.label,
        enabled: true,
        system: false,
        mode: p.mode,
        ...patch,
      } as PenaltyRule);
    }
    attributesChanged = true;
    applied.push(`Pénalité : ${p.label}`);
  }

  if (selection.penalty_cap && result.penalty_cap) {
    attrs.penalties.max_cap_rate = result.penalty_cap.rate;
    attrs.penalties.max_cap_enabled = true;
    attributesChanged = true;
    applied.push("Plafond des pénalités");
  }

  if (selection.termination && result.termination) {
    const t = result.termination;
    const current = attrs.clauses.termination;
    attrs.clauses.termination = {
      ...current,
      article_ref: t.article_ref ?? t.source.article ?? current.article_ref,
      notice_days: t.notice_days ?? current.notice_days,
      cure_days: t.cure_days ?? current.cure_days,
      client_convenience: t.client_convenience ?? current.client_convenience,
      grounds: t.grounds.length ? t.grounds : current.grounds,
      financial_consequences: t.financial_consequences ?? current.financial_consequences,
      caution_effect: t.caution_effect ?? current.caution_effect,
      source_document_id: documentIdFor(t.source, documentIds) ?? current.source_document_id,
      source_page: t.source.page ?? current.source_page,
    };
    attributesChanged = true;
    applied.push("Résiliation");
  }

  for (const index of selection.clauses) {
    const c = result.clauses[index];
    if (!c) continue;
    const article = c.article_ref ?? c.source.article ?? "";
    const clause: ContractClause = {
      id: newId(),
      category: c.category,
      article_ref: article,
      title: c.title,
      content: c.content,
      source_document_id: documentIdFor(c.source, documentIds),
      source_page: c.source.page,
    };
    const existing = article
      ? attrs.clauses.items.findIndex(
          (item) => item.category === c.category && item.article_ref === article,
        )
      : -1;
    if (existing >= 0) {
      attrs.clauses.items[existing] = { ...clause, id: attrs.clauses.items[existing].id };
    } else {
      attrs.clauses.items.push(clause);
    }
    attributesChanged = true;
    applied.push(`Clause : ${c.title}`);
  }

  if (!attributesChanged) attrs = input.attributes;
  return { attributes: attrs, attributesChanged, header, applied, skipped };
}
