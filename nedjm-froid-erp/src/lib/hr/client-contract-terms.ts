import type { ContractClause, PenaltyRule } from "@/lib/contracts/attributes-schema";

export type LaborPoste = { id: string; designation: string; unit: string };
export type AbsenceRule = { id: string; label: string; detail: string; fixedAmount: number | null };
export type WorkerClause = { id: string; article_ref: string; title: string; content: string };

export type PenaltyField = { id: string; name: string; value: string; amount: string };

export type StoredClientTerms = {
  client_contract_id: string;
  contract_number: string;
  poste_label: string;
  penalty_text: string;
  clauses: { id: string; article_ref: string; title: string; content: string }[];
  /** Name and value the user kept. An empty row is not stored. */
  penalties: PenaltyField[];
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
  if (rule.mode === "PROGRESSIVE") {
    const steps = (rule.brackets ?? [])
      .map((step) => `اليوم ${step.from_day}: ${Math.round(step.rate * 1000) / 10} %`)
      .join(" · ");
    return { detail: steps || "barème progressif", fixedAmount: null };
  }
  return { detail: rule.label, fixedAmount: null };
}

function graceNote(rule: PenaltyRule): string {
  if (rule.grace_days) return `بعد ${rule.grace_days} أيام`;
  if (rule.grace_hours) return `بعد ${rule.grace_hours} ساعة`;
  return "";
}

export function laborPostes(
  items: readonly { id: string; item_type: string; designation: string; unit?: string | null }[],
): LaborPoste[] {
  return items
    .filter((item) => item.item_type === "LABOR" && item.designation.trim())
    .map((item) => ({ id: item.id, designation: item.designation.trim(), unit: item.unit?.trim() || "" }));
}

export function absenceRules(rules: readonly PenaltyRule[]): AbsenceRule[] {
  return describedPenalties(rules)
    .filter((rule) => rule.absence)
    .map((rule) => ({
      id: rule.id,
      label: rule.label,
      detail: rule.detail,
      fixedAmount: rule.fixedAmount,
    }));
}

export type DescribedPenalty = AbsenceRule & {
  absence: boolean;
  grace: string;
  articleRef: string;
  statement: string;
};

export type PenaltyCitation = { code: string; label: string; article: string; statement: string };

/** Article number and the clause's own wording, kept when an extraction was applied. */
export function citationsFromExtraction(result: unknown): PenaltyCitation[] {
  if (!result || typeof result !== "object") return [];
  const penalties = (result as { penalties?: unknown }).penalties;
  if (!Array.isArray(penalties)) return [];
  return penalties.flatMap((row) => {
    if (!row || typeof row !== "object") return [];
    const item = row as {
      preset_code?: unknown;
      label?: unknown;
      source?: { article?: unknown; excerpt?: unknown };
    };
    const label = typeof item.label === "string" ? item.label.trim() : "";
    const article = typeof item.source?.article === "string" ? item.source.article.trim() : "";
    const statement = typeof item.source?.excerpt === "string" ? item.source.excerpt.trim() : "";
    if (!label || (!article && !statement)) return [];
    return [{ code: typeof item.preset_code === "string" ? item.preset_code.trim() : "", label, article, statement }];
  });
}

function uniqueCitation(label: string, citations: readonly PenaltyCitation[], used: ReadonlySet<number>) {
  const tokens = penaltyTokens(label);
  let best: number[] = [];
  let bestScore = 0;
  citations.forEach((item, index) => {
    if (used.has(index)) return;
    const score = sharedTokens(tokens, penaltyTokens(item.label));
    if (score > bestScore) {
      bestScore = score;
      best = [index];
    } else if (score > 0 && score === bestScore) best.push(index);
  });
  return best.length === 1 ? best[0] : -1;
}

/** Fills a penalty with the article number and the wording of the client contract when they are still empty. */
export function citePenaltyRules(rules: readonly PenaltyRule[], citations: readonly PenaltyCitation[]): PenaltyRule[] {
  const used = new Set<number>();
  return rules.map((rule) => {
    if ((rule.article_ref ?? "").trim() && (rule.statement ?? "").trim()) return rule;
    const byCode = citations.findIndex((item, index) => !used.has(index) && item.code && item.code === rule.code);
    const index = byCode >= 0 ? byCode : uniqueCitation(rule.label, citations, used);
    if (index < 0) return rule;
    used.add(index);
    const hit = citations[index];
    return {
      ...rule,
      article_ref: (rule.article_ref ?? "").trim() || hit.article,
      statement: (rule.statement ?? "").trim() || hit.statement,
    };
  });
}

/** Every enabled penalty of one client contract, with the value written the way the contract states it. */
export function describedPenalties(rules: readonly PenaltyRule[]): DescribedPenalty[] {
  return rules.filter((rule) => rule.enabled !== false).map((rule) => {
    const described = penaltyDetail(rule);
    return {
      id: rule.id,
      label: rule.label,
      detail: described.detail,
      fixedAmount: described.fixedAmount,
      absence: isAbsence(rule),
      grace: graceNote(rule),
      articleRef: rule.article_ref?.trim() || "",
      statement: rule.statement?.trim() || "",
    };
  });
}

export type WorkerTerm = {
  id: string;
  title: string;
  value: string;
  articleRef: string;
  penalties: PenaltyField[];
};

function namesTokens(text: string, tokens: Set<string>) {
  let count = 0;
  for (const token of penaltyTokens(text)) if (tokens.has(token)) count += 1;
  return count > 0;
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

const PENALTY_STOP = new Set([
  "absence",
  "absences",
  "غياب",
  "de",
  "du",
  "des",
  "et",
  "la",
  "le",
  "les",
  "un",
  "une",
  "par",
  "jour",
  "jours",
  "pour",
  "au",
  "aux",
  "en",
  "sur",
  "dans",
  "non",
  "justifie",
  "justifiee",
  "injustifiee",
]);

function fold(text: string) {
  return text.toLocaleLowerCase("fr-DZ").normalize("NFD").replace(/\p{M}/gu, "");
}

/** Meaningful words of a contract label or a poste. Plurals and the Arabic article are folded in. */
function penaltyTokens(text: string): Set<string> {
  const out = new Set<string>();
  for (const raw of fold(text).split(/[^a-z0-9\u0600-\u06ff]+/)) {
    if (raw.length < 3 || PENALTY_STOP.has(raw)) continue;
    out.add(raw);
    if (/^[\u0600-\u06ff]/.test(raw) && raw.startsWith("ال") && raw.length > 4) out.add(raw.slice(2));
    if (/^[a-z]/.test(raw) && raw.endsWith("s") && raw.length > 4) out.add(raw.slice(0, -1));
  }
  return out;
}

function sharedTokens(poste: Set<string>, rule: Set<string>) {
  let count = 0;
  for (const token of poste) if (rule.has(token)) count += 1;
  return count;
}

/**
 * The absence clause of this client contract that names the chosen poste.
 * Words come from that contract's own labels. One clause applies to every poste.
 * Two clauses with the same overlap are left unmatched.
 */
export function absenceForPoste(poste: string, rules: readonly AbsenceRule[]): AbsenceRule | null {
  if (rules.length === 1) return rules[0];
  const posteTokens = penaltyTokens(poste);
  if (!posteTokens.size) return null;
  let best: AbsenceRule[] = [];
  let bestScore = 0;
  for (const rule of rules) {
    const score = sharedTokens(posteTokens, penaltyTokens(rule.label));
    if (score > bestScore) {
      bestScore = score;
      best = [rule];
    } else if (score > 0 && score === bestScore) best.push(rule);
  }
  return best.length === 1 ? best[0] : null;
}

/** Text written in the contract's penalty field: a DA amount, or the rate of the matched clause. */
export function retenueFromAbsence(rule: AbsenceRule | null): string {
  if (!rule) return "";
  if (rule.fixedAmount != null) return String(rule.fixedAmount);
  return rule.detail;
}

function citedTitle(articleRef: string, label: string) {
  const ref = articleRef.trim();
  const name = label.trim();
  return ref ? `البند ${ref} — ${name}` : name;
}

/** Short line taken from the rule, in the shape printed under the clause. */
function extractedPenaltyValue(label: string, rule: DescribedPenalty | undefined, detail: string) {
  const head = [label.trim(), rule?.grace?.trim() ?? ""].filter(Boolean).join(" · ");
  const amount = detail.trim();
  return amount ? `${head} : ${amount}` : head;
}

/** The clause stays in the contract's own words. The penalty name and its value are separate fields. */
function penaltyTerm(matched: AbsenceRule, rule: DescribedPenalty | undefined): WorkerTerm {
  const articleRef = rule?.articleRef?.trim() || "";
  const statement = rule?.statement?.trim() || "";
  return {
    id: matched.id,
    title: articleRef ? citedTitle(articleRef, matched.label) : rule?.grace ? `${matched.label} · ${rule.grace}` : matched.label,
    value: statement,
    articleRef,
    penalties: [
      {
        id: `${matched.id}-penalty`,
        name: rule?.absence ? "الغياب" : matched.label,
        value: extractedPenaltyValue(matched.label, rule, matched.detail),
        amount: "",
      },
    ],
  };
}

/**
 * Clauses of this client contract that bind the worker in the chosen poste.
 * A clause that names another poste of the same contract is left out.
 * Values stay as the contract wrote them, including a scale such as day 1 then day 3.
 */
export function workerTerms(input: {
  poste: string;
  labor: readonly LaborPoste[];
  penalties: readonly DescribedPenalty[];
  clauses: readonly WorkerClause[];
}): WorkerTerm[] {
  const poste = input.poste.trim();
  if (!poste) return [];
  const posteTokens = penaltyTokens(poste);
  const others = input.labor.filter((item) => !sameText(item.designation, poste));
  const namesOther = (text: string) => others.some((item) => namesTokens(text, penaltyTokens(item.designation)));
  const terms: WorkerTerm[] = [];
  const matched = absenceForPoste(
    poste,
    input.penalties.filter((rule) => rule.absence),
  );
  if (matched) {
    const rule = input.penalties.find((item) => item.id === matched.id);
    terms.push(penaltyTerm(matched, rule));
  }
  for (const rule of input.penalties) {
    if (rule.absence || !namesTokens(rule.label, posteTokens) || namesOther(rule.label)) continue;
    terms.push(penaltyTerm(rule, rule));
  }
  for (const clause of input.clauses) {
    const text = `${clause.title} ${clause.content}`;
    if (namesOther(text) && !namesTokens(text, posteTokens)) continue;
    terms.push({
      id: clause.id,
      title: citedTitle(clause.article_ref, clause.title),
      value: clause.content,
      articleRef: clause.article_ref,
      penalties: [],
    });
  }
  return terms;
}

function keptPenalties(rows: readonly Partial<PenaltyField>[]): PenaltyField[] {
  return rows.flatMap((row) => {
    const id = typeof row.id === "string" ? row.id.trim() : "";
    const name = typeof row.name === "string" ? row.name.trim() : "";
    const value = typeof row.value === "string" ? row.value.trim() : "";
    const amount = typeof row.amount === "string" ? row.amount.trim() : "";
    if (!id || (!name && !value && !amount)) return [];
    return [{ id, name, value, amount }];
  });
}

/** Stores the clause text and the penalty rows the user left. An empty row is dropped. */
export function storedFromWorkerTerms(input: {
  clientContractId: string;
  contractNumber: string;
  poste: string;
  terms: readonly WorkerTerm[];
  absenceIds: ReadonlySet<string>;
}): StoredClientTerms {
  return {
    client_contract_id: input.clientContractId,
    contract_number: input.contractNumber,
    poste_label: input.poste.trim(),
    penalty_text: "",
    clauses: input.terms.flatMap((term) => {
      const title = term.title.trim();
      const content = term.value.trim();
      if (!title || !content) return [];
      return [{ id: term.id, article_ref: term.articleRef, title, content }];
    }),
    penalties: keptPenalties(input.terms.flatMap((term) => term.penalties)),
  };
}

const RETENUE_TEXT =
  /^(?:\d{1,9}([.,]\d{1,2})?|\d{1,3}([.,]\d{1,2})?\s*%\s*(?:par jour|du poste)|barème progressif)$/i;

/** Amount written beside the absence penalty. Other penalties stay out of article 9. */
export function absenceEquivalentAmount(rows: readonly { name?: string; amount?: string }[]): string {
  for (const row of rows) {
    const name = (row.name ?? "").trim();
    const amount = (row.amount ?? "").trim();
    if (amount && name.includes("غياب")) return amount;
  }
  return "";
}

/** A daily deduction: a DA amount, or the rate copied from the client-contract clause. */
export function isRetenueText(value: string): boolean {
  const text = value.trim();
  return text.length > 0 && text.length <= 40 && RETENUE_TEXT.test(text);
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
    penalties: [],
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
      const number = clause.article_ref?.trim() ?? "";
      const heading =
        number && !clause.title.trim().startsWith("البند ")
          ? `البند ${number} — ${clause.title}`
          : clause.title;
      const body = clause.content ? `<p>${escapeHtml(clause.content)}</p>` : "";
      return `<li><strong>${escapeHtml(heading)}</strong>${body}</li>`;
    })
    .join("");
  const penalties = (terms.penalties ?? [])
    .map((row) => {
      const name = row.name.trim();
      const value = row.value.trim();
      const amount = (row.amount ?? "").trim();
      if (!name && !value && !amount) return "";
      const line = !name ? value : !value ? `عقوبة ${name}` : `عقوبة ${name}: ${value}`;
      const money = amount ? `${line ? `${line}، ` : ""}أي ما يعادل ${amount}` : line;
      return `<p>${escapeHtml(money)}</p>`;
    })
    .join("");
  return `<section class="client-terms" dir="rtl" style="margin-top:24px;page-break-inside:avoid;font-family:inherit">
<h2 style="font-size:16px">شروط عقد العميل ${escapeHtml(terms.contract_number)}</h2>
<p>المنصب حسب عقد العميل: ${escapeHtml(terms.poste_label || "—")}</p>
${clauses ? `<ul>${clauses}</ul>` : ""}
${penalties}
${terms.penalty_text && !penalties ? `<p>عقوبة الغياب: ${escapeHtml(terms.penalty_text)}</p>` : ""}
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
    penalties: keptPenalties(Array.isArray(row.penalties) ? row.penalties : []),
  };
}

/** Stable text of the client terms printed on the work contract. A difference voids the signed copy. */
export function clientTermsKey(terms: StoredClientTerms | null | undefined): string {
  if (!terms) return "";
  const clauses = [...terms.clauses]
    .map((clause) => [clause.id, clause.article_ref, clause.title, clause.content].join("\u001f"))
    .sort()
    .join("\u001e");
  const penalties = [...(terms.penalties ?? [])]
    .map((row) => [row.id, row.name, row.value, row.amount ?? ""].join("\u001f"))
    .sort()
    .join("\u001e");
  return [terms.client_contract_id, terms.contract_number, terms.poste_label, terms.penalty_text, clauses, penalties].join("\u001d");
}
