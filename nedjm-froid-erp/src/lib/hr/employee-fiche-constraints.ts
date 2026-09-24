/**
 * Contraintes Fiche Employé — UI + validation serveur.
 * Champs latins → MAJUSCULE ; formats numériques / dates stricts.
 */

const DIGIT_LENGTH: Record<string, number> = {
  nss: 12,
  nin: 18,
  birth_act_no: 5,
  id_number: 9,
  account_no: 20,
};

const ACCOUNT_PREFIX = "00799999";

/** Codes exclus de la MAJUSCULE automatique (latin). */
const NO_UPPERCASE = new Set([
  "email",
  "photo_url",
  "phone",
  "whatsapp",
  "nss",
  "nin",
  "birth_act_no",
  "id_number",
  "account_no",
  "account_key",
  "postal_code",
  "matricule",
  "status",
  "irg_category",
  "id",
]);

/** Délivrance : pas de date future (aujourd'hui OK). */
const ISSUE_DATE_CODES = new Set(["id_issued_on"]);

/** Expiration : strictement après aujourd'hui (passé et aujourd'hui refusés). */
const EXPIRY_DATE_CODES = new Set(["id_expires_on"]);

export function digitsOnly(raw: string, maxLen: number): string {
  return String(raw ?? "")
    .replace(/\D/g, "")
    .slice(0, maxLen);
}

export function todayIsoDate(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Jour suivant (min pour date d'expiration). */
export function tomorrowIsoDate(now = new Date()): string {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return todayIsoDate(d);
}

export function isLatinUppercaseField(code: string): boolean {
  if (!code || code.endsWith("_ar")) return false;
  if (code.endsWith("_code")) return false;
  if (NO_UPPERCASE.has(code)) return false;
  if (DIGIT_LENGTH[code] != null) return false;
  if (ISSUE_DATE_CODES.has(code) || EXPIRY_DATE_CODES.has(code)) return false;
  // Codes catalogue / listes (ne pas altérer UUID / codes)
  if (code === "poste" || code === "affectation" || code === "status") return false;
  return true;
}

export function digitMaxLength(code: string): number | null {
  return DIGIT_LENGTH[code] ?? null;
}

export function isIssueDateField(code: string): boolean {
  return ISSUE_DATE_CODES.has(code);
}

export function isExpiryDateField(code: string): boolean {
  return EXPIRY_DATE_CODES.has(code);
}

/** @deprecated use isIssueDateField — conservé pour compat UI */
export function isNoFutureDateField(code: string): boolean {
  return isIssueDateField(code);
}

/** Filtre la saisie en direct (ne rejette pas encore les longueurs incomplètes). */
export function sanitizeFicheInput(code: string, raw: string): string {
  const max = DIGIT_LENGTH[code];
  if (max != null) return digitsOnly(raw, max);

  const v = String(raw ?? "").trim();
  if (ISSUE_DATE_CODES.has(code)) {
    if (!v) return "";
    if (v > todayIsoDate()) return ""; // refuse futur
    return v;
  }

  if (EXPIRY_DATE_CODES.has(code)) {
    if (!v) return "";
    // passé ou aujourd'hui → refus
    if (v <= todayIsoDate()) return "";
    return v;
  }

  if (isLatinUppercaseField(code)) {
    return String(raw ?? "").toLocaleUpperCase("fr-DZ");
  }

  return String(raw ?? "");
}

export function normalizeFicheValues(
  values: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...values };
  for (const [code, raw] of Object.entries(values)) {
    if (raw == null) continue;
    if (typeof raw !== "string" && typeof raw !== "number") continue;
    const asStr = String(raw);
    if (asStr.trim() === "") {
      out[code] = typeof raw === "number" ? raw : "";
      continue;
    }
    out[code] = sanitizeFicheInput(code, asStr);
  }
  return out;
}

export type FicheConstraintIssue = { code: string; message: string };

function empty(v: unknown): boolean {
  return v == null || String(v).trim() === "";
}

/**
 * Validation stricte si la valeur est renseignée.
 */
export function validateFicheConstraints(
  values: Record<string, unknown>,
): FicheConstraintIssue[] {
  const issues: FicheConstraintIssue[] = [];
  const today = todayIsoDate();

  for (const [code, len] of Object.entries(DIGIT_LENGTH)) {
    if (empty(values[code])) continue;
    const digits = digitsOnly(String(values[code]), len + 5);
    if (digits.length !== len) {
      const labels: Record<string, string> = {
        nss: "N° NSS",
        nin: "NIN",
        birth_act_no: "N° acte de naissance",
        id_number: "N° pièce",
        account_no: "N° compte",
      };
      issues.push({
        code,
        message: `${labels[code] ?? code} : exactement ${len} chiffres requis.`,
      });
      continue;
    }
    if (code === "account_no" && !digits.startsWith(ACCOUNT_PREFIX)) {
      issues.push({
        code,
        message: `N° compte : doit commencer par ${ACCOUNT_PREFIX} (${len} chiffres).`,
      });
    }
  }

  for (const code of ISSUE_DATE_CODES) {
    if (empty(values[code])) continue;
    const v = String(values[code]).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) {
      issues.push({ code, message: "Date de délivrance : date invalide." });
      continue;
    }
    if (v > today) {
      issues.push({
        code,
        message: "Date de délivrance : une date future n'est pas autorisée.",
      });
    }
  }

  for (const code of EXPIRY_DATE_CODES) {
    if (empty(values[code])) continue;
    const v = String(values[code]).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) {
      issues.push({ code, message: "Date d'expiration : date invalide." });
      continue;
    }
    if (v <= today) {
      issues.push({
        code,
        message:
          "Date d'expiration : la date doit être postérieure à aujourd'hui (aujourd'hui et le passé sont refusés).",
      });
    }
  }

  return issues;
}

export const FICHE_ACCOUNT_PREFIX = ACCOUNT_PREFIX;
