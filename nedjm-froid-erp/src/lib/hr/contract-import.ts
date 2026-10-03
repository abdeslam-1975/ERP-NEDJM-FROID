import { archiveNameKey } from "@/lib/hr/attendance-archive";
import { normalizeHeader, toIsoDate } from "@/lib/hr/employee-import";
import { rangesOverlap } from "@/lib/hr/principal-contract";

export const CONTRACT_IMPORT_MAX_ROWS = 2000;

export const CONTRACT_IMPORT_TARGETS = [
  { code: "matricule", label: "Matricule" },
  { code: "last_name", label: "Nom" },
  { code: "first_name", label: "Prénom" },
  { code: "full_name", label: "Nom et prénom (une seule colonne)" },
  { code: "site", label: "Chantier / affectation" },
  { code: "poste", label: "Poste" },
  { code: "contract_type", label: "Type de contrat" },
  { code: "start_date", label: "Date de début" },
  { code: "end_date", label: "Date de fin" },
  { code: "salaire_base", label: "Salaire de base mensuel" },
  { code: "salaire_net", label: "Salaire net mensuel (référence chantier)" },
] as const;

export type ContractImportTarget = (typeof CONTRACT_IMPORT_TARGETS)[number]["code"];

const ALIASES: Record<ContractImportTarget, string[]> = {
  matricule: ["mat", "matricule", "n matricule", "code employe", "رقم التسجيل"],
  last_name: ["nom", "nom latin", "nom fr", "last name", "اللقب"],
  first_name: ["prenom", "prenoms", "prenom latin", "prenom fr", "first name", "الاسم"],
  full_name: ["nom et prenom", "nom prenom", "nom et prenoms", "nom prenoms", "employe", "salarie", "travailleur", "الاسم واللقب"],
  site: ["chantier", "affectation", "site", "lieu de travail", "lieu d affectation", "base", "الورشة"],
  poste: ["poste", "fonction", "emploi", "poste occupe", "qualification", "المنصب"],
  contract_type: ["type", "type de contrat", "type contrat", "nature du contrat", "contrat", "نوع العقد"],
  start_date: [
    "date debut",
    "date de debut",
    "debut",
    "date debut contrat",
    "date de debut du contrat",
    "du",
    "date d effet",
    "date entree",
    "date d entree",
    "date recrutement",
    "date de recrutement",
    "date embauche",
    "date d embauche",
    "تاريخ البداية",
  ],
  end_date: ["date fin", "date de fin", "fin", "date fin contrat", "date de fin du contrat", "au", "echeance", "expiration", "تاريخ النهاية"],
  salaire_base: ["salaire de base", "salaire base", "sb", "الأجر القاعدي"],
  salaire_net: ["salaire net", "net", "net mensuel", "salaire net mensuel", "salaire", "الأجر الصافي"],
};

/** Column → target, each target used once (the first column wins). */
export function guessContractMapping(headers: string[]): (ContractImportTarget | null)[] {
  const used = new Set<ContractImportTarget>();
  return headers.map((h) => {
    const norm = normalizeHeader(h ?? "");
    const hit = (Object.keys(ALIASES) as ContractImportTarget[]).find((code) => ALIASES[code].includes(norm));
    if (!hit || used.has(hit)) return null;
    used.add(hit);
    return hit;
  });
}

/** Header row: among the first rows, the one whose cells match the most targets. */
export function findContractHeaderRow(matrix: string[][]): number {
  let best = 0;
  let bestHits = 0;
  for (let i = 0; i < Math.min(matrix.length, 15); i += 1) {
    const hits = guessContractMapping(matrix[i] ?? []).filter(Boolean).length;
    if (hits > bestHits) {
      best = i;
      bestHits = hits;
    }
  }
  return best;
}

/** "01/26", "1/26" and "001/26" are the same matricule; letters are compared in upper case. */
export function matriculeKey(value: string | null | undefined): string {
  return (value ?? "")
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/(^|[^0-9])0+(?=[0-9])/g, "$1");
}

function amount(raw: string): number | null {
  const v = raw.replace(/[\s\u00a0]/g, "").replace(/da$/i, "").replace(",", ".");
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
}

const frDate = (iso: string) => iso.split("-").reverse().join("/");

export type ImportEmployee = {
  id: string;
  matricule: string;
  last_name: string;
  first_name: string;
  hired_at: string | null;
};
export type ImportSite = { id: string; code?: string | null; name_fr: string; activity_code_id?: string | null };
export type ImportCatalog = { code: string; label_fr: string };
export type ImportExistingContract = {
  employee_id: string;
  start_date: string;
  end_date: string | null;
  status: string;
  affectation_principale: boolean;
};

export type ContractImportDefaults = {
  match_by: "MATRICULE" | "NAME";
  site_id: string;
  activity_code_id: string;
  contract_type_code: string;
  work_regime_code: string;
  status: "ACTIVE" | "DRAFT";
};

export type ContractImportPayload = {
  employee_id: string;
  site_id: string;
  activity_code_id: string;
  contract_type_code: string | null;
  work_regime_code: string | null;
  poste_fr: string | null;
  affectation_principale: true;
  salaire_base_monthly: number;
  salaire_net_ref_monthly: number;
  start_date: string;
  end_date: string | null;
  status: "DRAFT" | "ACTIVE" | "ENDED";
};

export type ContractImportStatus = "ready" | "unmatched" | "exists" | "duplicate" | "invalid";

export type ContractImportRow = {
  /** Line number in the sheet (1 = first line). */
  line: number;
  name: string;
  matricule: string;
  status: ContractImportStatus;
  employee_id: string | null;
  /** Employees with this name when the match is ambiguous. */
  candidates: string[];
  payload: ContractImportPayload | null;
  issues: string[];
  warnings: string[];
};

const OPEN = new Set(["DRAFT", "ACTIVE", "SUSPENDED"]);

/** Rows of a contract sheet turned into contract payloads, with what blocks or alters each one. */
export function buildContractImportRows(input: {
  matrix: string[][];
  headerRow: number;
  mapping: (ContractImportTarget | null)[];
  defaults: ContractImportDefaults;
  employees: readonly ImportEmployee[];
  sites: readonly ImportSite[];
  contractTypes: readonly ImportCatalog[];
  existing: readonly ImportExistingContract[];
  /** Employee chosen by hand, by line. */
  overrides?: Record<number, string>;
  today?: string;
}): ContractImportRow[] {
  const { matrix, headerRow, mapping, defaults, employees, sites, contractTypes, existing } = input;
  const overrides = input.overrides ?? {};
  const today = input.today ?? new Date().toISOString().slice(0, 10);
  const col = (code: ContractImportTarget) => mapping.indexOf(code);
  const byId = new Map(employees.map((e) => [e.id, e]));
  const byMat = new Map<string, ImportEmployee[]>();
  const byName = new Map<string, ImportEmployee[]>();
  for (const e of employees) {
    const mk = matriculeKey(e.matricule);
    byMat.set(mk, [...(byMat.get(mk) ?? []), e]);
    const nk = archiveNameKey(`${e.last_name} ${e.first_name}`);
    byName.set(nk, [...(byName.get(nk) ?? []), e]);
  }
  const siteOf = (raw: string) => {
    const norm = normalizeHeader(raw);
    return sites.find((s) => normalizeHeader(s.code ?? "") === norm || normalizeHeader(s.name_fr) === norm) ?? null;
  };
  const typeOf = (raw: string) => {
    const norm = normalizeHeader(raw);
    return contractTypes.find((t) => normalizeHeader(t.code) === norm || normalizeHeader(t.label_fr) === norm) ?? null;
  };
  const planned: { line: number; employee_id: string; start: string; end: string | null }[] = [];
  const rows: ContractImportRow[] = [];

  matrix.slice(headerRow + 1, headerRow + 1 + CONTRACT_IMPORT_MAX_ROWS).forEach((cells, index) => {
    const line = headerRow + index + 2;
    const cell = (code: ContractImportTarget) => {
      const i = col(code);
      return i < 0 ? "" : (cells[i] ?? "").trim();
    };
    const matricule = cell("matricule");
    const fullName = cell("full_name");
    const name = fullName || [cell("last_name"), cell("first_name")].filter(Boolean).join(" ");
    if (!matricule && !name) return;
    const issues: string[] = [];
    const warnings: string[] = [];

    let candidates: ImportEmployee[] = [];
    if (defaults.match_by === "MATRICULE" && matricule) candidates = byMat.get(matriculeKey(matricule)) ?? [];
    else if (name) candidates = byName.get(archiveNameKey(name)) ?? [];
    const chosen = overrides[line] ? byId.get(overrides[line]) : undefined;
    const employee = chosen ?? (candidates.length === 1 ? candidates[0] : undefined);
    if (!employee) {
      rows.push({
        line,
        name,
        matricule,
        status: "unmatched",
        employee_id: null,
        candidates: candidates.map((c) => c.id),
        payload: null,
        issues: [candidates.length > 1 ? "Plusieurs employés correspondent : choisissez-le." : "Employé introuvable : choisissez-le."],
        warnings,
      });
      return;
    }
    if (!chosen && defaults.match_by === "MATRICULE" && name) {
      const own = archiveNameKey(`${employee.last_name} ${employee.first_name}`);
      if (own !== archiveNameKey(name)) warnings.push(`Nom différent dans l'application : ${employee.last_name} ${employee.first_name}`);
    }

    const siteRaw = cell("site");
    const site = siteRaw ? siteOf(siteRaw) : (sites.find((s) => s.id === defaults.site_id) ?? null);
    if (siteRaw && !site) issues.push(`Chantier « ${siteRaw} » inconnu`);
    else if (!site) issues.push("Chantier à choisir (valeur par défaut)");
    const activity = site?.activity_code_id || defaults.activity_code_id;
    if (site && !activity) issues.push("Activité à choisir (valeur par défaut)");

    const startRaw = cell("start_date");
    let start = startRaw ? toIsoDate(startRaw) : null;
    if (startRaw && !start) issues.push(`Date de début illisible « ${startRaw} »`);
    if (!startRaw) {
      start = employee.hired_at ? employee.hired_at.slice(0, 10) : null;
      if (start) warnings.push(`Début = date d'embauche de la fiche (${frDate(start)})`);
      else issues.push("Date de début absente (ni colonne, ni date d'embauche sur la fiche)");
    }
    if (start && !start.endsWith("-01")) {
      const first = `${start.slice(0, 7)}-01`;
      warnings.push(`Début ramené au ${frDate(first)} (un contrat commence le 1er du mois)`);
      start = first;
    }
    const endRaw = cell("end_date");
    const end = endRaw ? toIsoDate(endRaw) : null;
    if (endRaw && !end) issues.push(`Date de fin illisible « ${endRaw} »`);
    if (start && end && end < start) issues.push("Date de fin avant le début");

    const typeRaw = cell("contract_type");
    let type = defaults.contract_type_code || null;
    if (typeRaw) {
      const t = typeOf(typeRaw);
      if (t) type = t.code;
      else warnings.push(`Type « ${typeRaw} » inconnu : ${type ?? "aucun"} retenu`);
    }

    const money = (code: ContractImportTarget, label: string) => {
      const raw = cell(code);
      if (!raw) return 0;
      const n = amount(raw);
      if (n == null) {
        warnings.push(`${label} illisible « ${raw} » : 0 retenu`);
        return 0;
      }
      return n;
    };
    const base = money("salaire_base", "Salaire de base");
    const net = money("salaire_net", "Salaire net");

    let status: ContractImportStatus = issues.length ? "invalid" : "ready";
    if (status === "ready" && start) {
      const clash = existing.some(
        (c) =>
          c.employee_id === employee.id &&
          c.affectation_principale &&
          OPEN.has(c.status) &&
          rangesOverlap(c.start_date, c.end_date, start, end),
      );
      const twice = planned.find((p) => p.employee_id === employee.id && rangesOverlap(p.start, p.end, start, end));
      if (clash) {
        status = "exists";
        issues.push("Contrat principal déjà enregistré sur cette période");
      } else if (twice) {
        status = "duplicate";
        issues.push(`Même employé déjà importé ligne ${twice.line} sur cette période`);
      } else planned.push({ line, employee_id: employee.id, start, end });
    }

    rows.push({
      line,
      name: name || `${employee.last_name} ${employee.first_name}`,
      matricule,
      status,
      employee_id: employee.id,
      candidates: [],
      payload:
        status === "ready" && site && activity && start
          ? {
              employee_id: employee.id,
              site_id: site.id,
              activity_code_id: activity,
              contract_type_code: type,
              work_regime_code: defaults.work_regime_code || null,
              poste_fr: cell("poste").slice(0, 120).toLocaleUpperCase("fr-DZ") || null,
              affectation_principale: true,
              salaire_base_monthly: base,
              salaire_net_ref_monthly: net,
              start_date: start,
              end_date: end,
              status: end && end < today ? "ENDED" : defaults.status,
            }
          : null,
      issues,
      warnings,
    });
  });
  return rows;
}
