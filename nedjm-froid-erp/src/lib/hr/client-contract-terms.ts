import type { ContractClause, PenaltyRule } from "@/lib/contracts/attributes-schema";

export type LaborPoste = { id: string; designation: string; unit: string };
export type AbsenceRule = { id: string; label: string; detail: string; fixedAmount: number | null };
export type WorkerClause = { id: string; article_ref: string; title: string; content: string };

export type StoredClientTerms = {
  client_contract_id: string;
  contract_number: string;
  poste_label: string;
  penalty_text: string;
  clauses: { id: string; article_ref: string; title: string; content: string }[];
};

const COMMERCIAL = new Set(["REVISION_PRIX", "GARANTIE"]);

function sameText(a: string, b: string) {
  return a.trim().toLocaleLowerCase("fr-DZ") === b.trim().toLocaleLowerCase("fr-DZ");
}

function isAbsence(rule: Pick<PenaltyRule, "code" | "label">) {
  const text = `${rule.code} ${rule.label}`.toLocaleLowerCase("fr-DZ");
  return text.includes("absence") || text.includes("غياب");
}

function penaltyDetail(rule: PenaltyRule): { detail: string; fixedAmount: number | null } {
  if (rule.mode === "FIXED" && rule.fixed_amount != null) {
    return { detail: `${rule.fixed_amount} DA`, fixedAmount: rule.fixed_amount };
  }
  if ((rule.mode === "PCT_DAILY" || rule.mode === "PCT_ITEM") && rule.rate != null) {
    const pct = Math.round(rule.rate * 1000) / 10;
    const unit = rule.mode === "PCT_DAILY" ? "par jour" : "du poste";
    return { detail: `${pct} % ${unit}`, fixedAmount: null };
  }
  if (rule.mode === "PROGRESSIVE") return { detail: "barème progressif", fixedAmount: null };
  return { detail: rule.label, fixedAmount: null };
}

export function laborPostes(
  items: readonly { id: string; item_type: string; designation: string; unit?: string | null }[],
): LaborPoste[] {
  return items
    .filter((item) => item.item_type === "LABOR" && item.designation.trim())
    .map((item) => ({ id: item.id, designation: item.designation.trim(), unit: item.unit?.trim() || "" }));
}

export function absenceRules(rules: readonly PenaltyRule[]): AbsenceRule[] {
  return rules.filter((rule) => rule.enabled !== false && isAbsence(rule)).map((rule) => {
    const described = penaltyDetail(rule);
    return { id: rule.id, label: rule.label, detail: described.detail, fixedAmount: described.fixedAmount };
  });
}

/** Clauses that bind the worker. Invoicing, price revision and the financial guarantee stay on the client contract. */
export function transferableClauses(clauses: readonly ContractClause[]): WorkerClause[] {
  return clauses
    .filter((clause) => !COMMERCIAL.has(clause.category) && clause.title.trim())
    .map((clause) => ({
      id: clause.id,
      article_ref: clause.article_ref?.trim() || "",
      title: clause.title.trim(),
      content: clause.content?.trim() || "",
    }));
}

export function posteMatchesLabor(poste: string, labor: readonly LaborPoste[]): LaborPoste | null {
  const wanted = poste.trim();
  if (!wanted) return null;
  return labor.find((item) => sameText(item.designation, wanted)) ?? null;
}

export function penaltyText(rules: readonly AbsenceRule[]): string {
  return rules.map((rule) => `${rule.label} : ${rule.detail}`).join(" · ");
}

export function storedClientTerms(input: {
  clientContractId: string;
  contractNumber: string;
  poste: string;
  rules: readonly AbsenceRule[];
  clauses: readonly WorkerClause[];
  confirmedIds: readonly string[];
}): StoredClientTerms {
  const confirmed = new Set(input.confirmedIds);
  return {
    client_contract_id: input.clientContractId,
    contract_number: input.contractNumber,
    poste_label: input.poste.trim(),
    penalty_text: penaltyText(input.rules),
    clauses: input.clauses
      .filter((clause) => confirmed.has(clause.id))
      .map((clause) => ({
        id: clause.id,
        article_ref: clause.article_ref,
        title: clause.title,
        content: clause.content,
      })),
  };
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Section added after the worker-contract template. Empty when the contract has no client terms. */
export function clientTermsAppendix(terms: StoredClientTerms | null | undefined): string {
  if (!terms || (!terms.penalty_text && !terms.clauses.length && !terms.poste_label)) return "";
  const clauses = terms.clauses
    .map((clause) => {
      const ref = clause.article_ref ? ` <span>(${escapeHtml(clause.article_ref)})</span>` : "";
      const body = clause.content ? `<p>${escapeHtml(clause.content)}</p>` : "";
      return `<li><strong>${escapeHtml(clause.title)}</strong>${ref}${body}</li>`;
    })
    .join("");
  return `<section class="client-terms" dir="rtl" style="margin-top:24px;page-break-inside:avoid;font-family:inherit">
<h2 style="font-size:16px">شروط عقد العميل ${escapeHtml(terms.contract_number)}</h2>
<p>المنصب حسب عقد العميل: ${escapeHtml(terms.poste_label || "—")}</p>
${terms.penalty_text ? `<p>عقوبة الغياب: ${escapeHtml(terms.penalty_text)}</p>` : ""}
${clauses ? `<ul>${clauses}</ul>` : ""}
</section>`;
}

export function appendClientTerms(html: string, terms: StoredClientTerms | null | undefined): string {
  const section = clientTermsAppendix(terms);
  if (!section || !html.includes("</body>")) return html;
  return html.replace("</body>", `${section}</body>`);
}

export function asStoredClientTerms(value: unknown): StoredClientTerms | null {
  if (!value || typeof value !== "object") return null;
  const row = value as StoredClientTerms;
  if (typeof row.client_contract_id !== "string" || typeof row.contract_number !== "string") return null;
  return {
    client_contract_id: row.client_contract_id,
    contract_number: row.contract_number,
    poste_label: typeof row.poste_label === "string" ? row.poste_label : "",
    penalty_text: typeof row.penalty_text === "string" ? row.penalty_text : "",
    clauses: Array.isArray(row.clauses) ? row.clauses : [],
  };
}

/** Stable text of the client terms printed on the work contract. A difference voids the signed copy. */
export function clientTermsKey(terms: StoredClientTerms | null | undefined): string {
  if (!terms) return "";
  const clauses = [...terms.clauses]
    .map((clause) => [clause.id, clause.article_ref, clause.title, clause.content].join("\u001f"))
    .sort()
    .join("\u001e");
  return [terms.client_contract_id, terms.contract_number, terms.poste_label, terms.penalty_text, clauses].join("\u001d");
}
