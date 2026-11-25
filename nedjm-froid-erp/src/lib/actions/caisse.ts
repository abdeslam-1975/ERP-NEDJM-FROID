"use server";

import { revalidatePath } from "next/cache";
import { getWorkspaceProfile } from "@/lib/auth/get-workspace";
import { geminiConfigured, geminiModel, generateStructured } from "@/lib/ai/gemini";
import type { BonAttachTarget } from "@/lib/caisse/bon-bulk-match";
import {
  algiersToday,
  computeSoldesBundle,
  isCaissePrincipaleName,
  OPENING_BALANCE_DATE,
  monthBoundsFromSheet,
  monthSortKey,
  formatBonLabel,
  sheetNameFromIso,
  type MoneyRow,
} from "@/lib/caisse/soldes";
import type {
  CaisseAdminUser,
  CaisseAuditRow,
  CaisseDashboard,
  CaisseFlags,
  CaisseVoidedOperation,
  CloseStatus,
  FinanceInput,
  JournalLine,
  PurchaseInput,
} from "@/lib/caisse/types";
import { CAISSE_TRANSFER_AFFECTATION } from "@/lib/caisse/types";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

export type ActionResult<T = void> = { ok: true; data: T } | { ok: false; error: string };

type ServerClient = Awaited<ReturnType<typeof createClient>>;

type OperationRow = {
  id: string;
  op_number: number;
  kind: "ACHAT" | "AVANCE" | "ALIMENTATION";
  op_date: string;
  affectation: string;
  matricule: string;
  buyer_name: string;
  bon_label: string;
  has_photo: boolean;
  bon_match_status?: string | null;
  method: string | null;
  reference: string | null;
  lines: {
    line_no: number;
    designation: string;
    item_val: string;
    unit: string;
    qty: number;
    unit_price: number;
  }[];
};

const PASSWORD_RULE = /^(?=.*[a-zA-Z])(?=.*[0-9]).{6}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function fail(error: string): ActionResult<never> {
  return { ok: false, error };
}

function refresh() {
  revalidatePath("/caisse");
}

async function clientOrError(): Promise<{ supabase: ServerClient; flags: CaisseFlags; today: string; solde: number; userId: string } | ActionResult<never>> {
  const workspace = await getWorkspaceProfile();
  if (!workspace) return fail("Session requise.");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("caisse_my_context");
  if (error) return fail(error.message);
  if (!data || typeof data !== "object") return fail("Accès caisse refusé.");
  const ctx = data as Record<string, unknown>;
  const [manageOpenings, manageLists, manageRestore, rightsRow] = await Promise.all([
    supabase.rpc("caisse_can_manage_openings"),
    supabase.rpc("caisse_can_manage_lists"),
    supabase.rpc("caisse_can_restore_operations"),
    supabase.from("caisse_rights").select("manage_restore").eq("user_id", workspace.id).maybeSingle(),
  ]);
  const restoreFromRpc = !manageRestore.error && !!manageRestore.data;
  const restoreFromRights = !!(rightsRow.data as { manage_restore?: boolean } | null)?.manage_restore;
  return {
    supabase,
    today: String(ctx.today || algiersToday()),
    solde: Number(ctx.solde) || 0,
    userId: workspace.id,
    flags: {
      isAdmin: !!ctx.isAdmin,
      isGerant: !!ctx.isGerant,
      isMaster: !!ctx.isMaster,
      isUnlimited: !!ctx.isUnlimited,
      canSeeAllJournal: !!ctx.canSeeAllJournal,
      canSeeCaisse: !!ctx.canSeeCaisse,
      canManage: !!ctx.canManage,
      // Caisse admin (SUPER_ADMIN / ADMIN_FINANCE) or a delegated « Ouverture » right.
      canManageOpenings: !!ctx.isAdmin || (!manageOpenings.error && !!manageOpenings.data),
      canManageLists: !!ctx.isAdmin || (!manageLists.error && !!manageLists.data),
      // Admin always; else RPC, else caisse_rights.manage_restore (if RPC schema cache lag).
      canRestore: !!ctx.isAdmin || restoreFromRpc || restoreFromRights,
      canValidateBons: !!ctx.isAdmin || !!ctx.isGerant,
      userName: String(ctx.userName || workspace.fullName),
    },
  };
}

function asNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeOpLines(raw: OperationRow["lines"]): OperationRow["lines"] {
  if (Array.isArray(raw)) return [...raw];
  if (raw && typeof raw === "object") return Object.values(raw) as OperationRow["lines"];
  return [];
}

function toJournal(op: OperationRow): { lines: JournalLine[]; money: MoneyRow } {
  const lines = normalizeOpLines(op.lines).sort((a, b) => Number(a.line_no) - Number(b.line_no));
  const grand = lines.reduce((sum, line) => sum + Number(line.qty) * Number(line.unit_price), 0);
  const sheetName = sheetNameFromIso(op.op_date);
  const hasPhoto = !!op.has_photo;
  const matchStatus = (op.bon_match_status as JournalLine["bonMatchStatus"]) ?? null;
  const journal = lines.map((line, index) => {
    const isFirst = index === 0;
    const lineTotal = Number(line.qty) * Number(line.unit_price);
    return {
      operationId: op.id,
      lineNo: Number(line.line_no) || index + 1,
      sheetName,
      type: op.kind,
      isFirst,
      op: op.op_number,
      date: String(op.op_date).slice(0, 10),
      affectation: op.affectation,
      itemVal: line.item_val || "",
      matricule: op.matricule || "",
      desc: line.designation,
      qty: Number(line.qty),
      unit: line.unit || "U",
      price: op.kind === "AVANCE" ? null : Number(line.unit_price),
      lineTotal: op.kind === "AVANCE" ? null : lineTotal,
      prixBon: isFirst ? grand : null,
      depenses: isFirst && op.kind === "ACHAT" ? grand : null,
      recettes: isFirst && op.kind !== "ACHAT" ? grand : null,
      buyer: op.buyer_name,
      // Libellé « Voir Bon » uniquement sur la 1ʳᵉ ligne — les suivantes restaient
      // du texte non cliquable et masquaient l’absence du bouton Modifier.
      bon: isFirst && hasPhoto ? "Voir Bon" : isFirst ? op.bon_label || "" : "",
      hasPhoto: isFirst && hasPhoto,
      bonMatchStatus: isFirst ? matchStatus : null,
    };
  });
  const first = journal[0];
  return {
    lines: journal,
    money: {
      sheetName,
      type: op.kind,
      isFirst: true,
      op: op.op_number,
      date: String(op.op_date).slice(0, 10),
      buyer: op.buyer_name,
      depenses: first?.depenses ?? null,
      recettes: first?.recettes ?? null,
      total: first?.prixBon ?? null,
    },
  };
}

/** Total opération : lignes ACHAT via lineTotal ; AVANCE/ALIM via recettes/prixBon (lineTotal est null). */
function operationGrandTotal(group: JournalLine[]): number {
  const fromLines = group.reduce((sum, line) => sum + (Number(line.lineTotal) || 0), 0);
  if (fromLines !== 0) return fromLines;
  const priorHead = group.find((line) => line.isFirst) || group[0];
  if (!priorHead) return 0;
  if (priorHead.prixBon != null && Number.isFinite(Number(priorHead.prixBon))) return Number(priorHead.prixBon);
  if (priorHead.recettes != null && Number.isFinite(Number(priorHead.recettes))) return Number(priorHead.recettes);
  if (priorHead.depenses != null && Number.isFinite(Number(priorHead.depenses))) return Number(priorHead.depenses);
  return group.reduce((sum, line) => sum + (Number(line.price) || 0) * (Number(line.qty) || 0), 0);
}

/** Si un filtre masque la 1ʳᵉ ligne, rattache photo / totaux / isFirst à la tête restante. */
function ensureOperationHeads(lines: JournalLine[]): JournalLine[] {
  const byOp = new Map<string, JournalLine[]>();
  for (const line of lines) {
    const group = byOp.get(line.operationId);
    if (group) group.push(line);
    else byOp.set(line.operationId, [line]);
  }
  const repaired: JournalLine[] = [];
  for (const group of byOp.values()) {
    group.sort((a, b) => a.lineNo - b.lineNo || a.desc.localeCompare(b.desc, "fr"));
    const grand = operationGrandTotal(group);
    const photoLine = group.find((line) => line.hasPhoto);
    const matchStatus = group.find((line) => line.bonMatchStatus)?.bonMatchStatus ?? null;
    const bonLabel = photoLine?.bon || group.find((line) => line.bon)?.bon || "";
    group.forEach((line, index) => {
      const isFirst = index === 0;
      repaired.push({
        ...line,
        isFirst,
        prixBon: isFirst ? grand : null,
        depenses: isFirst && line.type === "ACHAT" ? grand : null,
        recettes: isFirst && line.type !== "ACHAT" ? grand : null,
        hasPhoto: isFirst && !!photoLine,
        bonMatchStatus: isFirst ? matchStatus : null,
        bon: isFirst ? (photoLine ? "Voir Bon" : bonLabel) : "",
      });
    });
  }
  return repaired;
}

async function logAction(
  supabase: ServerClient,
  action: string,
  kind: string,
  op: string | number,
  sheet: string,
  detail: string,
  amount: number | null,
) {
  await supabase.rpc("caisse_log", {
    p_action: action,
    p_kind: kind,
    p_op: op === "" || op === undefined || op === null ? "" : String(op),
    p_sheet: sheet,
    p_detail: detail,
    p_amount: amount,
  });
}

/**
 * After insert/update/delete, N° are reordered by op_date (forgotten/late ops included).
 * Bon archive names Bon_N… are derived from the new N° at download — photos stay on the same row.
 */
async function refreshOperationNumber(
  supabase: ServerClient,
  operationId: string,
  fallbackOp: number,
): Promise<{ op: number; renumbered: boolean; warning?: string }> {
  let lastError = "";
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const renumbered = await supabase.rpc("caisse_renumber_active_operations");
    if (renumbered.error) {
      lastError = renumbered.error.message;
      continue;
    }
    const row = await supabase.from("caisse_operations").select("op_number").eq("id", operationId).maybeSingle();
    if (row.error || row.data?.op_number == null) {
      lastError = row.error?.message || "N° final introuvable";
      continue;
    }
    return { op: Number(row.data.op_number), renumbered: true };
  }
  return {
    op: fallbackOp,
    renumbered: false,
    warning: lastError || "Renumérotation chronologique indisponible",
  };
}

function renumberNote(numbered: { op: number; renumbered: boolean; warning?: string }, previousOp?: number): string {
  if (numbered.renumbered) {
    if (previousOp != null && previousOp !== numbered.op) {
      return ` N° réordonnés par date (N° ${previousOp} → ${numbered.op}). Les bons suivent le nouveau N°.`;
    }
    return " N° réordonnés par date (opérations + bons).";
  }
  if (numbered.warning) {
    return ` ⚠️ Renumérotation non appliquée: ${numbered.warning}`;
  }
  return "";
}

function photoFromItems(items: PurchaseInput["items"]): { data: string | null; label: string; error: string | null } {
  let data: string | null = null;
  let label = "";
  for (const item of items) {
    const photo = item.photoDataUrl?.trim() || "";
    if (!photo) continue;
    if (!photo.startsWith("data:image/") && !photo.startsWith("data:application/pdf")) {
      return { data: null, label: "", error: "Le bon doit être une image ou un PDF." };
    }
    if (photo.length > 3_800_000) return { data: null, label: "", error: "Bon trop lourd (limite ~3,5 Mo)." };
    if (!data) {
      data = photo;
      label = "";
    }
  }
  return { data, label, error: null };
}

function normalizeBonMatchStatus(
  value: PurchaseInput["bonMatchStatus"],
): "ok" | "warn" | "bad" | "unknown" | null {
  if (value === "ok" || value === "warn" || value === "bad" || value === "unknown") return value;
  return null;
}

/** Libellé affiché = Voir Bon ; le nom d’archive Bon_N… est calculé à l’export/téléchargement. */
async function applyBonDisplayAndMatch(
  supabase: ServerClient,
  operationId: string,
  opNumber: number,
  isoDate: string,
  hasPhoto: boolean,
  matchStatus: PurchaseInput["bonMatchStatus"],
): Promise<string> {
  if (!hasPhoto) {
    const cleared = await supabase
      .from("caisse_operations")
      .update({ bon_label: "", bon_match_status: null })
      .eq("id", operationId);
    if (cleared.error) throw new Error(cleared.error.message);
    return "";
  }
  const archiveName = formatBonLabel(opNumber, isoDate);
  const status = normalizeBonMatchStatus(matchStatus) ?? "unknown";
  let updated = await supabase
    .from("caisse_operations")
    .update({ bon_label: "Voir Bon", bon_match_status: status })
    .eq("id", operationId);
  if (updated.error && /bon_match_status/i.test(updated.error.message)) {
    updated = await supabase.from("caisse_operations").update({ bon_label: "Voir Bon" }).eq("id", operationId);
  }
  if (updated.error) throw new Error(updated.error.message);
  return archiveName;
}

function validatePurchase(input: PurchaseInput, flags: CaisseFlags): string | null {
  if (!ISO_DATE.test(input.date || "")) return "Choisissez une date";
  if (!input.affectation) return "Choisissez une Affectation";
  if (input.affectation === "PARC ROULANT" && !input.immatriculation) return "Sélectionnez le matricule";
  if (!input.items?.length) return "Ajoutez au moins un article";
  const contrat = input.affectation.toUpperCase().startsWith("CONTRAT");
  for (const item of input.items) {
    if (!item.desc?.trim() || !Number.isFinite(item.qte) || item.qte <= 0 || !Number.isFinite(item.price) || item.price < 0) {
      return "Complétez désignation, quantité et prix";
    }
    if (contrat && !item.itemVal?.trim()) return "Complétez désignation, quantité et prix";
  }
  const buyer = input.buyer?.trim() || flags.userName;
  if (buyer !== flags.userName && !flags.isMaster && !flags.isAdmin) return "Achat non autorisé pour cet acheteur";
  const photo = photoFromItems(input.items);
  if (photo.error) return photo.error;
  if (!photo.data && !input.items.some((item) => item.keepPhoto)) return "Ajoutez au moins une photo pour cette opération (une seule suffit)";
  return null;
}

export async function getCaisseDashboard(filter?: {
  month?: string;
  buyer?: string;
  type?: string;
}): Promise<ActionResult<CaisseDashboard>> {
  const gate = await clientOrError();
  if ("ok" in gate) return gate;
  const { supabase, flags, today, solde } = gate;
  const month = !filter?.month || filter.month === "CURRENT" ? sheetNameFromIso(today) : filter.month;
  const buyer = filter?.buyer || "TOUS";
  const type = filter?.type || "TOUS";
  const monthBounds = month !== "TOUS" ? monthBoundsFromSheet(month) : null;

  const opsSelectWithMatch =
    "id, op_number, kind, op_date, affectation, matricule, buyer_name, bon_label, has_photo, bon_match_status, method, reference, lines:caisse_lines(line_no, designation, item_val, unit, qty, unit_price)";
  const opsSelectLegacy =
    "id, op_number, kind, op_date, affectation, matricule, buyer_name, bon_label, has_photo, method, reference, lines:caisse_lines(line_no, designation, item_val, unit, qty, unit_price)";

  // Nested lines only for the visible month (or a capped TOUS) — avoids 8s statement_timeout
  // after archive imports. Soldes use caisse_journal_money() across all months.
  const buildMonthOpsQuery = (select: string) => {
    let query = supabase.from("caisse_operations").select(select).order("op_date", { ascending: false }).limit(3000);
    if (monthBounds) {
      query = query.gte("op_date", monthBounds.start).lt("op_date", monthBounds.endExclusive);
    }
    return query;
  };

  const [opsResRaw, moneyRes, openRes, listRes, buyerRes, closeRes, monthsRes] = await Promise.all([
    buildMonthOpsQuery(opsSelectWithMatch),
    supabase.rpc("caisse_journal_money"),
    supabase.from("caisse_journal_openings").select("buyer_name, amount"),
    supabase.from("caisse_lists").select("list_key, label, sort_order").order("sort_order"),
    supabase.from("caisse_journal_buyers").select("name").eq("active", true),
    flags.canSeeCaisse || flags.isAdmin
      ? supabase.from("caisse_journal_closures").select("*").eq("op_date", today).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase.from("caisse_operations").select("op_date").order("op_date", { ascending: false }).limit(3000),
  ]);

  let opsRes: { data: unknown; error: { message: string } | null } = opsResRaw;
  if (opsRes.error && /bon_match_status/i.test(opsRes.error.message)) {
    opsRes = await buildMonthOpsQuery(opsSelectLegacy);
  }
  if (opsRes.error) return fail(opsRes.error.message);
  if (openRes.error) return fail(openRes.error.message);
  if (listRes.error) return fail(listRes.error.message);

  const operations = (opsRes.data ?? []) as OperationRow[];
  const built = operations.map(toJournal);
  const allLines = ensureOperationHeads(built.flatMap((entry) => entry.lines));
  const photoByOp = new Map<
    string,
    { hasPhoto: boolean; bonMatchStatus: JournalLine["bonMatchStatus"]; bon: string }
  >();
  for (const line of allLines) {
    if (!line.hasPhoto && !line.bon && !line.bonMatchStatus) continue;
    const cur = photoByOp.get(line.operationId) || {
      hasPhoto: false,
      bonMatchStatus: null as JournalLine["bonMatchStatus"],
      bon: "",
    };
    if (line.hasPhoto) cur.hasPhoto = true;
    if (line.bonMatchStatus) cur.bonMatchStatus = line.bonMatchStatus;
    if (line.bon) cur.bon = line.bon;
    photoByOp.set(line.operationId, cur);
  }
  allLines.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    if (a.op !== b.op) return b.op - a.op;
    return a.lineNo - b.lineNo;
  });

  type MoneyRpcRow = {
    id: string;
    op_number: number;
    kind: MoneyRow["type"];
    op_date: string;
    buyer_name: string;
    total: number;
  };
  let money: MoneyRow[];
  if (!moneyRes.error && Array.isArray(moneyRes.data)) {
    money = (moneyRes.data as MoneyRpcRow[]).map((row) => {
      const total = Number(row.total) || 0;
      const sheet = sheetNameFromIso(String(row.op_date).slice(0, 10));
      return {
        sheetName: sheet,
        type: row.kind,
        isFirst: true,
        op: row.op_number,
        date: String(row.op_date).slice(0, 10),
        buyer: row.buyer_name,
        depenses: row.kind === "ACHAT" ? total : null,
        recettes: row.kind !== "ACHAT" ? total : null,
        total,
      };
    });
  } else {
    // Fallback if RPC not deployed yet: soldes from the month payload only.
    money = built.map((entry) => entry.money);
  }

  const openings: Record<string, number> = {};
  for (const row of openRes.data ?? []) openings[row.buyer_name] = Number(row.amount) || 0;
  const settings = await supabase.from("caisse_settings").select("opening_date").eq("id", 1).maybeSingle();
  const openingDate = settings.error || !settings.data?.opening_date
    ? OPENING_BALANCE_DATE
    : String(settings.data.opening_date).slice(0, 10);
  const bundle = computeSoldesBundle({
    rows: money,
    openings,
    monthFilter: month,
    buyerFilter: buyer,
    viewer: flags.userName,
    seeAll: flags.canSeeAllJournal || flags.isAdmin,
  });
  const names = new Set<string>();
  if (flags.isMaster || flags.canSeeAllJournal || flags.isAdmin || flags.canSeeCaisse) {
    const directory = await supabase.rpc("caisse_name_directory");
    if (!directory.error) {
      for (const row of (directory.data ?? []) as { name: string }[]) if (row.name) names.add(row.name);
    }
  }
  names.add(flags.userName);
  for (const row of buyerRes.data ?? []) if (row.name) names.add(row.name);
  // Inactive buyers stay out of selection lists (even if present on archived operations).
  const userList = [...names].filter((name) => !isCaissePrincipaleName(name)).sort((a, b) => a.localeCompare(b, "fr"));
  const months = new Set<string>();
  if (!monthsRes.error) {
    for (const row of monthsRes.data ?? []) {
      const sheet = sheetNameFromIso(String(row.op_date).slice(0, 10));
      if (sheet && sheet !== "—") months.add(sheet);
    }
  }
  for (const row of money) if (row.sheetName && row.sheetName !== "—") months.add(row.sheetName);
  for (const line of allLines) if (line.sheetName && line.sheetName !== "—") months.add(line.sheetName);
  months.add(sheetNameFromIso(today));
  const monthsList = [...months].sort((a, b) => monthSortKey(b) - monthSortKey(a));
  const table = ensureOperationHeads(
    allLines.filter((line) => {
      if (month !== "TOUS" && line.sheetName !== month) return false;
      if (buyer !== "TOUS" && line.buyer !== buyer) return false;
      if (type !== "TOUS" && line.type !== type) return false;
      return true;
    }),
  ).map((line) => {
    if (!line.isFirst) return line;
    const meta = photoByOp.get(line.operationId);
    if (!meta) return line;
    return {
      ...line,
      hasPhoto: meta.hasPhoto,
      bonMatchStatus: meta.bonMatchStatus,
      bon: meta.hasPhoto ? "Voir Bon" : meta.bon || "",
    };
  });
  const lists = listRes.data ?? [];
  const close = closeRes.data;
  const closeStatus: CloseStatus | null =
    flags.canSeeCaisse || flags.isAdmin
      ? {
          date: today,
          closed: close?.status === "CLOSED",
          systemSolde: solde,
          physicalSolde: asNumber(close?.physical_solde),
          ecart: asNumber(close?.ecart),
          note: close?.note || "",
          closedBy: close?.closed_by_name || "",
          closedAt: close?.closed_at || "",
          unlockedBy: close?.unlocked_by_name || "",
          unlockedAt: close?.unlocked_at || "",
          unlockReason: close?.unlock_reason || "",
          canClose: close?.status !== "CLOSED",
          canUnlock: !!flags.isAdmin && close?.status === "CLOSED",
        }
      : null;

  return {
    ok: true,
    data: {
      flags,
      today,
      solde,
      totalDepenses: bundle.periodSummary.achats,
      totalAvances: bundle.periodSummary.avances,
      totalAlim: bundle.periodSummary.alim,
      months: monthsList,
      buyers: userList,
      userList,
      affectations: lists.filter((row) => row.list_key === "AFFECTATION").map((row) => row.label),
      units: lists.filter((row) => row.list_key === "UNIT").map((row) => row.label),
      matricules: lists.filter((row) => row.list_key === "MATRICULE").map((row) => row.label),
      periodSummary: bundle.periodSummary,
      monthlySoldes: bundle.monthlySoldes,
      buyerBalances: bundle.buyerBalances,
      moneyRows: money,
      openings,
      openingDate,
      rows: table,
      closeStatus,
      month,
      buyer,
      type,
    },
  };
}

async function writeLines(supabase: ServerClient, operationId: string, kind: "ACHAT" | "AVANCE" | "ALIMENTATION", items: { desc: string; itemVal: string; unit: string; qte: number; price: number }[]) {
  const payload = items.map((item, index) => ({
    operation_id: operationId,
    line_no: index + 1,
    designation: item.desc.trim(),
    item_val: item.itemVal?.trim() || "",
    unit: item.unit || "U",
    qty: item.qte,
    unit_price: item.price,
  }));
  if (kind !== "ACHAT") {
    payload.splice(1);
  }
  const { error } = await supabase.from("caisse_lines").insert(payload);
  if (error) throw new Error(error.message);
}

export async function saveCaissePurchase(input: PurchaseInput): Promise<ActionResult<{ message: string }>> {
  const gate = await clientOrError();
  if ("ok" in gate) return gate;
  const { supabase, flags, userId } = gate;
  const problem = validatePurchase(input, flags);
  if (problem) return fail(`❌ ${problem}`);
  const photo = photoFromItems(input.items);
  const buyer = (flags.isMaster || flags.isAdmin) && input.buyer?.trim() ? input.buyer.trim() : flags.userName;
  const header = {
    kind: "ACHAT" as const,
    op_date: input.date,
    affectation: input.affectation,
    matricule: input.affectation === "PARC ROULANT" ? input.immatriculation : "",
    buyer_name: buyer,
    bon_label: "",
    photo_data: photo.data,
  };
  const grand = input.items.reduce((sum, item) => sum + item.qte * item.price, 0);
  let matchStatus = normalizeBonMatchStatus(input.bonMatchStatus);
  try {
    if (input.operationId) {
      if (!flags.canManage) return fail("❌ Accès réservé : droit Modifier/Supprimer requis.");
      const existing = await supabase
        .from("caisse_operations")
        .select("op_number, op_date, photo_data, bon_label, bon_match_status")
        .eq("id", input.operationId)
        .maybeSingle();
      if (existing.error) return fail(existing.error.message);
      if (!existing.data) return fail("❌ Opération introuvable.");

      let photoData = photo.data;
      if (!photoData && input.items.some((item) => item.keepPhoto)) {
        photoData = existing.data.photo_data ?? null;
        if (!photoData) return fail("❌ Photo du bon obligatoire (au moins une par opération)");
        if (matchStatus == null) {
          matchStatus = normalizeBonMatchStatus(
            existing.data.bon_match_status as PurchaseInput["bonMatchStatus"],
          );
        }
      }
      const previousOp = Number(existing.data.op_number) || 0;

      const updated = await supabase
        .from("caisse_operations")
        .update({ ...header, photo_data: photoData })
        .eq("id", input.operationId)
        .select("id, op_number")
        .maybeSingle();
      if (updated.error) return fail(`❌ ${updated.error.message}`);
      if (!updated.data) return fail("❌ Opération introuvable.");
      const removed = await supabase.from("caisse_lines").delete().eq("operation_id", input.operationId);
      if (removed.error) return fail(removed.error.message);
      await writeLines(supabase, input.operationId, "ACHAT", input.items);
      // Always renumber: a forgotten/late date must reshuffle N° (and thus Bon_N… archives).
      const numbered = await refreshOperationNumber(
        supabase,
        input.operationId,
        Number(updated.data.op_number) || previousOp,
      );
      const archiveName = await applyBonDisplayAndMatch(
        supabase,
        input.operationId,
        numbered.op,
        input.date,
        !!photoData,
        matchStatus,
      );
      await logAction(
        supabase,
        "UPDATE",
        "ACHAT",
        numbered.op,
        sheetNameFromIso(input.date),
        `Modification achat | Acheteur: ${buyer}${archiveName ? ` | archive ${archiveName}` : ""}`,
        grand,
      );
      refresh();
      return {
        ok: true,
        data: {
          message: `✅ Opération N° ${numbered.op} mise à jour.${renumberNote(numbered, previousOp)}`,
        },
      };
    }
    const inserted = await supabase
      .from("caisse_operations")
      .insert({ ...header, created_by: userId })
      .select("id, op_number")
      .maybeSingle();
    if (inserted.error) return fail(`❌ ${inserted.error.message}`);
    if (!inserted.data) return fail("❌ Enregistrement refusé.");
    await writeLines(supabase, inserted.data.id, "ACHAT", input.items);
    const provisionalOp = Number(inserted.data.op_number) || 0;
    const numbered = await refreshOperationNumber(supabase, inserted.data.id, provisionalOp);
    const archiveName = await applyBonDisplayAndMatch(
      supabase,
      inserted.data.id,
      numbered.op,
      input.date,
      !!photo.data,
      matchStatus,
    );
    await logAction(
      supabase,
      "CREATE",
      "ACHAT",
      numbered.op,
      sheetNameFromIso(input.date),
      `Acheteur: ${buyer} | ${input.affectation} | ${input.items.length} ligne(s)${archiveName ? ` | archive ${archiveName}` : ""}`,
      grand,
    );
    refresh();
    return {
      ok: true,
      data: {
        message: `✅ Opération effectuée avec succès (N° ${numbered.op} → ${sheetNameFromIso(input.date)}).${renumberNote(numbered, provisionalOp)}`,
      },
    };
  } catch (error) {
    return fail(error instanceof Error ? `❌ ${error.message}` : "❌ Erreur");
  }
}

function parseTransferPairId(reference: string | null | undefined): string | null {
  const match = String(reference || "").match(/pair:([0-9a-f-]{36})/i);
  return match?.[1] || null;
}

function transferReference(role: "from" | "to", otherBuyer: string, pairId: string): string {
  return role === "from"
    ? `Vers:${otherBuyer}|pair:${pairId}`
    : `De:${otherBuyer}|pair:${pairId}`;
}

/** Libellé journal aligné sur le tableau Excel : ALIMENTATION DE CAISSE DE {dest} PAR {source} */
function transferDesignation(source: string, dest: string): string {
  return `ALIMENTATION DE CAISSE DE ${dest} PAR ${source}`;
}

export async function saveCaisseFinance(input: FinanceInput): Promise<ActionResult<{ message: string }>> {
  const gate = await clientOrError();
  if ("ok" in gate) return gate;
  const { supabase, flags, userId } = gate;
  if (!flags.canSeeCaisse && !flags.isAdmin) return fail("❌ Accès caisse requis");
  if (!ISO_DATE.test(input.date || "")) return fail("❌ Date invalide");
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) return fail("❌ Montant invalide");

  const photoRaw = input.photoDataUrl?.trim() || "";
  if (photoRaw) {
    if (!photoRaw.startsWith("data:image/") && !photoRaw.startsWith("data:application/pdf")) {
      return fail("❌ Le justificatif doit être une image ou un PDF.");
    }
    if (photoRaw.length > 3_800_000) return fail("❌ Justificatif trop lourd (limite ~3,5 Mo).");
  }
  let matchStatus = normalizeBonMatchStatus(input.bonMatchStatus);

  if (input.type === "TRANSFER") {
    const source = input.sourceBuyer?.trim() || "";
    const dest = input.beneficiary?.trim() || "";
    if (!source) return fail("❌ Choisissez l’acheteur qui finance");
    if (!dest) return fail("❌ Choisissez l’acheteur bénéficiaire");
    if (source === dest) return fail("❌ Les deux acheteurs doivent être différents");
    if (isCaissePrincipaleName(source) || isCaissePrincipaleName(dest)) {
      return fail("❌ Utilisez Alimentation / Avance caisse pour la caisse centrale");
    }

    try {
      if (input.operationId) {
        if (!flags.canManage) return fail("❌ Accès réservé : droit Modifier/Supprimer requis.");
        const existing = await supabase
          .from("caisse_operations")
          .select("id, op_number, kind, affectation, reference, photo_data, bon_match_status, buyer_name")
          .eq("id", input.operationId)
          .maybeSingle();
        if (existing.error) return fail(existing.error.message);
        if (!existing.data) return fail("❌ Opération introuvable.");

        let photoData: string | null = photoRaw || null;
        if (!photoData && input.keepPhoto) {
          photoData = existing.data.photo_data ?? null;
          if (matchStatus == null) {
            matchStatus = normalizeBonMatchStatus(
              existing.data.bon_match_status as FinanceInput["bonMatchStatus"],
            );
          }
        }
        if (photoData && matchStatus == null) matchStatus = "unknown";

        const label = transferDesignation(source, dest);
        const pairId = parseTransferPairId(existing.data.reference) || crypto.randomUUID();
        const isAlreadyTransfer = existing.data.affectation === CAISSE_TRANSFER_AFFECTATION;

        // Convertir une ancienne avance caisse (OUT) en alimentation acheteur→acheteur.
        if (!isAlreadyTransfer) {
          if (existing.data.kind !== "AVANCE") {
            return fail("❌ Seule une avance peut être convertie en alimentation entre acheteurs.");
          }
          const debitInsert = await supabase
            .from("caisse_operations")
            .insert({
              kind: "ACHAT",
              op_date: input.date,
              affectation: CAISSE_TRANSFER_AFFECTATION,
              matricule: "",
              buyer_name: source,
              bon_label: "",
              method: "Transfert acheteur",
              reference: transferReference("from", dest, pairId),
              photo_data: photoData,
              created_by: userId,
            })
            .select("id, op_number")
            .maybeSingle();
          if (debitInsert.error) return fail(`❌ ${debitInsert.error.message}`);
          if (!debitInsert.data) return fail("❌ Création du débit acheteur refusée.");

          const creditUpdate = await supabase
            .from("caisse_operations")
            .update({
              kind: "AVANCE",
              op_date: input.date,
              affectation: CAISSE_TRANSFER_AFFECTATION,
              matricule: "",
              buyer_name: dest,
              method: "Transfert acheteur",
              reference: transferReference("to", source, pairId),
              photo_data: photoData,
            })
            .eq("id", input.operationId);
          if (creditUpdate.error) return fail(`❌ ${creditUpdate.error.message}`);
          const removed = await supabase.from("caisse_lines").delete().eq("operation_id", input.operationId);
          if (removed.error) return fail(removed.error.message);
          await writeLines(supabase, debitInsert.data.id, "ACHAT", [
            { desc: label, itemVal: "", unit: "U", qte: 1, price: amount },
          ]);
          await writeLines(supabase, input.operationId, "AVANCE", [
            { desc: label, itemVal: "", unit: "U", qte: 1, price: amount },
          ]);
          const numberedDebit = await refreshOperationNumber(
            supabase,
            debitInsert.data.id,
            Number(debitInsert.data.op_number) || 0,
          );
          const numberedCredit = await refreshOperationNumber(
            supabase,
            input.operationId,
            Number(existing.data.op_number) || 0,
          );
          await applyBonDisplayAndMatch(
            supabase,
            debitInsert.data.id,
            numberedDebit.op,
            input.date,
            !!photoData,
            matchStatus,
          );
          await applyBonDisplayAndMatch(
            supabase,
            input.operationId,
            numberedCredit.op,
            input.date,
            !!photoData,
            matchStatus,
          );
          await logAction(
            supabase,
            "UPDATE",
            "AVANCE",
            numberedCredit.op,
            sheetNameFromIso(input.date),
            `Conversion avance → ${label}`,
            amount,
          );
          refresh();
          return {
            ok: true,
            data: {
              message: `✅ Converti en alimentation entre acheteurs : ${label} (N° ${numberedDebit.op} / ${numberedCredit.op}).`,
            },
          };
        }

        const pairRes = await supabase
          .from("caisse_operations")
          .select("id, kind, op_number, reference")
          .eq("affectation", CAISSE_TRANSFER_AFFECTATION)
          .is("voided_at", null)
          .like("reference", `%pair:${pairId}%`);
        if (pairRes.error) return fail(pairRes.error.message);
        const pairRows = pairRes.data || [];
        const debit =
          pairRows.find((row) => row.kind === "ACHAT") ||
          (existing.data.kind === "ACHAT" ? existing.data : null);
        const credit =
          pairRows.find((row) => row.kind === "AVANCE") ||
          (existing.data.kind === "AVANCE" ? existing.data : null);
        if (!debit || !credit) return fail("❌ Paire de transfert introuvable (ACHAT + AVANCE).");

        const debitHeader = {
          kind: "ACHAT" as const,
          op_date: input.date,
          affectation: CAISSE_TRANSFER_AFFECTATION,
          matricule: "",
          buyer_name: source,
          method: "Transfert acheteur",
          reference: transferReference("from", dest, pairId),
          photo_data: photoData,
        };
        const creditHeader = {
          kind: "AVANCE" as const,
          op_date: input.date,
          affectation: CAISSE_TRANSFER_AFFECTATION,
          matricule: "",
          buyer_name: dest,
          method: "Transfert acheteur",
          reference: transferReference("to", source, pairId),
          photo_data: photoData,
        };
        const debitLine = {
          desc: label,
          itemVal: "",
          unit: "U",
          qte: 1,
          price: amount,
        };
        const creditLine = {
          desc: label,
          itemVal: "",
          unit: "U",
          qte: 1,
          price: amount,
        };

        for (const [opId, header, line, kind] of [
          [debit.id, debitHeader, debitLine, "ACHAT"],
          [credit.id, creditHeader, creditLine, "AVANCE"],
        ] as const) {
          const updated = await supabase.from("caisse_operations").update(header).eq("id", opId);
          if (updated.error) return fail(`❌ ${updated.error.message}`);
          const removed = await supabase.from("caisse_lines").delete().eq("operation_id", opId);
          if (removed.error) return fail(removed.error.message);
          await writeLines(supabase, opId, kind, [line]);
        }

        const numberedDebit = await refreshOperationNumber(supabase, debit.id, Number(debit.op_number) || 0);
        const numberedCredit = await refreshOperationNumber(supabase, credit.id, Number(credit.op_number) || 0);
        await applyBonDisplayAndMatch(
          supabase,
          debit.id,
          numberedDebit.op,
          input.date,
          !!photoData,
          matchStatus,
        );
        await applyBonDisplayAndMatch(
          supabase,
          credit.id,
          numberedCredit.op,
          input.date,
          !!photoData,
          matchStatus,
        );
        await logAction(
          supabase,
          "UPDATE",
          "AVANCE",
          numberedCredit.op,
          sheetNameFromIso(input.date),
          label,
          amount,
        );
        refresh();
        return {
          ok: true,
          data: {
            message: `✅ ${label} mis à jour (N° ${numberedDebit.op} / ${numberedCredit.op}).`,
          },
        };
      }

      if (photoRaw && matchStatus == null) matchStatus = "unknown";
      const pairId = crypto.randomUUID();
      const debitInsert = await supabase
        .from("caisse_operations")
        .insert({
          kind: "ACHAT",
          op_date: input.date,
          affectation: CAISSE_TRANSFER_AFFECTATION,
          matricule: "",
          buyer_name: source,
          bon_label: "",
          method: "Transfert acheteur",
          reference: transferReference("from", dest, pairId),
          photo_data: photoRaw || null,
          created_by: userId,
        })
        .select("id, op_number")
        .maybeSingle();
      if (debitInsert.error) return fail(`❌ ${debitInsert.error.message}`);
      if (!debitInsert.data) return fail("❌ Enregistrement du débit refusé.");

      const creditInsert = await supabase
        .from("caisse_operations")
        .insert({
          kind: "AVANCE",
          op_date: input.date,
          affectation: CAISSE_TRANSFER_AFFECTATION,
          matricule: "",
          buyer_name: dest,
          bon_label: "",
          method: "Transfert acheteur",
          reference: transferReference("to", source, pairId),
          photo_data: photoRaw || null,
          created_by: userId,
        })
        .select("id, op_number")
        .maybeSingle();
      if (creditInsert.error) return fail(`❌ ${creditInsert.error.message}`);
      if (!creditInsert.data) return fail("❌ Enregistrement du crédit refusé.");

      const label = transferDesignation(source, dest);
      await writeLines(supabase, debitInsert.data.id, "ACHAT", [
        { desc: label, itemVal: "", unit: "U", qte: 1, price: amount },
      ]);
      await writeLines(supabase, creditInsert.data.id, "AVANCE", [
        { desc: label, itemVal: "", unit: "U", qte: 1, price: amount },
      ]);

      const numberedDebit = await refreshOperationNumber(
        supabase,
        debitInsert.data.id,
        Number(debitInsert.data.op_number) || 0,
      );
      const numberedCredit = await refreshOperationNumber(
        supabase,
        creditInsert.data.id,
        Number(creditInsert.data.op_number) || 0,
      );
      await applyBonDisplayAndMatch(
        supabase,
        debitInsert.data.id,
        numberedDebit.op,
        input.date,
        !!photoRaw,
        matchStatus,
      );
      await applyBonDisplayAndMatch(
        supabase,
        creditInsert.data.id,
        numberedCredit.op,
        input.date,
        !!photoRaw,
        matchStatus,
      );
      await logAction(
        supabase,
        "CAISSE",
        "AVANCE",
        numberedCredit.op,
        sheetNameFromIso(input.date),
        `${label} (N° ${numberedDebit.op}/${numberedCredit.op})`,
        amount,
      );
      refresh();
      return {
        ok: true,
        data: {
          message: `✅ ${label} — ${amount.toFixed(2)} DA (N° ${numberedDebit.op} / ${numberedCredit.op}). La caisse centrale n’est pas touchée.`,
        },
      };
    } catch (error) {
      return fail(error instanceof Error ? `❌ ${error.message}` : "❌ Erreur");
    }
  }

  const kind = input.type === "IN" ? "ALIMENTATION" : "AVANCE";
  const beneficiary = input.type === "IN" ? "Caisse Principale" : input.beneficiary?.trim() || "";
  if (input.type === "OUT" && !beneficiary) return fail("❌ Choisissez un bénéficiaire");

  const headerBase = {
    kind,
    op_date: input.date,
    affectation: kind === "ALIMENTATION" ? "CAISSE CENTRALE" : "AVANCE CAISSE",
    matricule: "",
    buyer_name: beneficiary,
    bon_label: "",
    method: input.type === "IN" ? input.method || "Espèces" : "Espèces",
    reference: input.type === "IN" ? input.ref || "" : "-",
  };
  const line = {
    desc: kind === "ALIMENTATION" ? `Alimentation (${headerBase.method || ""}) ${headerBase.reference || ""}`.trim() : `RECEPTION (${beneficiary})`,
    itemVal: "",
    unit: "U",
    qte: 1,
    price: amount,
  };
  try {
    if (input.operationId) {
      if (!flags.canManage) return fail("❌ Accès réservé : droit Modifier/Supprimer requis.");
      const existing = await supabase
        .from("caisse_operations")
        .select("op_number, photo_data, bon_match_status, affectation")
        .eq("id", input.operationId)
        .maybeSingle();
      if (existing.error) return fail(existing.error.message);
      if (!existing.data) return fail("❌ Opération introuvable.");
      if (existing.data.affectation === CAISSE_TRANSFER_AFFECTATION) {
        return fail("❌ Modifiez ce mouvement via le type « Un acheteur finance un autre ».");
      }

      let photoData: string | null = photoRaw || null;
      if (!photoData && input.keepPhoto) {
        photoData = existing.data.photo_data ?? null;
        if (matchStatus == null) {
          matchStatus = normalizeBonMatchStatus(
            existing.data.bon_match_status as FinanceInput["bonMatchStatus"],
          );
        }
      }
      if (photoData && matchStatus == null) matchStatus = "unknown";

      const updated = await supabase
        .from("caisse_operations")
        .update({ ...headerBase, photo_data: photoData })
        .eq("id", input.operationId)
        .select("id, op_number")
        .maybeSingle();
      if (updated.error) return fail(`❌ ${updated.error.message}`);
      if (!updated.data) return fail("❌ Opération introuvable.");
      const removed = await supabase.from("caisse_lines").delete().eq("operation_id", input.operationId);
      if (removed.error) return fail(removed.error.message);
      await writeLines(supabase, input.operationId, kind, [line]);
      const previousOp = Number(updated.data.op_number) || Number(existing.data.op_number) || 0;
      const numbered = await refreshOperationNumber(supabase, input.operationId, previousOp);
      const archiveName = await applyBonDisplayAndMatch(
        supabase,
        input.operationId,
        numbered.op,
        input.date,
        !!photoData,
        matchStatus,
      );
      await logAction(
        supabase,
        "UPDATE",
        kind,
        numbered.op,
        sheetNameFromIso(input.date),
        `Modification caisse | ${beneficiary}${archiveName ? ` | archive ${archiveName}` : ""}`,
        amount,
      );
      refresh();
      return {
        ok: true,
        data: {
          message: `✅ Mouvement de caisse N° ${numbered.op} mis à jour.${renumberNote(numbered, previousOp)}`,
        },
      };
    }

    if (photoRaw && matchStatus == null) matchStatus = "unknown";
    const inserted = await supabase
      .from("caisse_operations")
      .insert({ ...headerBase, photo_data: photoRaw || null, created_by: userId })
      .select("id, op_number")
      .maybeSingle();
    if (inserted.error) return fail(`❌ ${inserted.error.message}`);
    if (!inserted.data) return fail("❌ Enregistrement refusé.");
    await writeLines(supabase, inserted.data.id, kind, [line]);
    const provisionalOp = Number(inserted.data.op_number) || 0;
    const numbered = await refreshOperationNumber(supabase, inserted.data.id, provisionalOp);
    const archiveName = await applyBonDisplayAndMatch(
      supabase,
      inserted.data.id,
      numbered.op,
      input.date,
      !!photoRaw,
      matchStatus,
    );
    const { data: solde } = await supabase.rpc("caisse_system_solde");
    await logAction(
      supabase,
      "CAISSE",
      kind,
      numbered.op,
      "Caisse_Centrale",
      `${kind === "ALIMENTATION" ? "Alimentation Caisse" : `Avance caisse vers: ${beneficiary}`}${archiveName ? ` | archive ${archiveName}` : ""}`,
      amount,
    );
    refresh();
    const balance = Number(solde) || 0;
    const note = renumberNote(numbered, provisionalOp);
    const message =
      kind === "ALIMENTATION"
        ? `✅ Alimentation (banque / espèces) enregistrée (n° ${numbered.op}) — Solde caisse: ${balance.toFixed(2)} DA.${note}`
        : `✅ Avance caisse vers ${beneficiary} (n° ${numbered.op})\n(✅ Tiré vers: ${sheetNameFromIso(input.date)}).${note}`;
    return { ok: true, data: { message } };
  } catch (error) {
    return fail(error instanceof Error ? `❌ ${error.message}` : "❌ Erreur");
  }
}

export async function deleteCaisseOperation(operationId: string): Promise<ActionResult<{ message: string }>> {
  const gate = await clientOrError();
  if ("ok" in gate) return gate;
  const { supabase, flags } = gate;
  if (!flags.canManage) return fail("❌ Accès réservé : droit Modifier/Supprimer requis.");
  const existing = await supabase
    .from("caisse_operations")
    .select("id, op_number, kind, op_date, affectation, reference")
    .eq("id", operationId)
    .maybeSingle();
  if (existing.error) return fail(existing.error.message);
  if (!existing.data) return fail("❌ Opération introuvable.");

  const toVoid = [operationId];
  if (existing.data.affectation === CAISSE_TRANSFER_AFFECTATION) {
    const pairId = parseTransferPairId(existing.data.reference);
    if (pairId) {
      const pairRes = await supabase
        .from("caisse_operations")
        .select("id")
        .eq("affectation", CAISSE_TRANSFER_AFFECTATION)
        .is("voided_at", null)
        .like("reference", `%pair:${pairId}%`);
      if (!pairRes.error) {
        for (const row of pairRes.data || []) {
          if (!toVoid.includes(row.id)) toVoid.push(row.id);
        }
      }
    }
  }

  for (const id of toVoid) {
    const updated = await supabase.rpc("caisse_void_operation", { p_id: id });
    if (updated.error) return fail(`❌ ${updated.error.message}`);
  }
  await logAction(
    supabase,
    "DELETE",
    existing.data.kind,
    existing.data.op_number,
    sheetNameFromIso(existing.data.op_date),
    "Mise en corbeille (restaurable par admin)",
    null,
  );
  refresh();
  const pairNote = toVoid.length > 1 ? " (paire transfert acheteur)" : "";
  return {
    ok: true,
    data: {
      message: `✅ Opération N° ${existing.data.op_number} mise en corbeille${pairNote}. L’admin peut la restaurer.`,
    },
  };
}

function mapVoidedRows(
  rows: {
    id: string;
    op_number: number;
    kind: string;
    op_date: string;
    affectation: string | null;
    buyer_name: string | null;
    reference: string | null;
    voided_at: string | null;
    has_photo: boolean | null;
    lines?: { line_no: number; designation: string | null; qty: number | null; unit_price: number | null }[] | null;
    designation?: string;
    amount?: number;
  }[],
): CaisseVoidedOperation[] {
  return rows.map((row) => {
    const lines = Array.isArray(row.lines)
      ? [...row.lines].sort((a, b) => Number(a.line_no) - Number(b.line_no))
      : [];
    const designation =
      row.designation ??
      lines.find((line) => line.designation)?.designation ??
      "";
    const amount =
      row.amount != null
        ? Number(row.amount) || 0
        : lines.reduce((sum, line) => sum + (Number(line.qty) || 0) * (Number(line.unit_price) || 0), 0);
    return {
      id: row.id,
      opNumber: Number(row.op_number) || 0,
      kind: row.kind || "",
      date: String(row.op_date || "").slice(0, 10),
      affectation: row.affectation || "",
      buyer: row.buyer_name || "",
      reference: row.reference || "",
      designation,
      amount,
      voidedAt: row.voided_at || "",
      hasPhoto: !!row.has_photo,
    };
  });
}

export async function listVoidedCaisseOperations(): Promise<ActionResult<{ rows: CaisseVoidedOperation[] }>> {
  const gate = await clientOrError();
  if ("ok" in gate) return gate;
  const { supabase, flags } = gate;
  if (!flags.isAdmin && !flags.canRestore) {
    return fail("❌ Accès réservé : restauration admin (ou droit délégué).");
  }

  // Prefer service role: voided rows are hidden by RLS; avoids PostgREST schema-cache lag on new RPCs.
  try {
    const service = createServiceClient();
    const listed = await service
      .from("caisse_operations")
      .select(
        "id, op_number, kind, op_date, affectation, buyer_name, reference, voided_at, has_photo, lines:caisse_lines(line_no, designation, qty, unit_price)",
      )
      .not("voided_at", "is", null)
      .order("voided_at", { ascending: false })
      .limit(150);
    if (listed.error) return fail(listed.error.message);
    return { ok: true, data: { rows: mapVoidedRows((listed.data ?? []) as Parameters<typeof mapVoidedRows>[0]) } };
  } catch {
    // SUPABASE_SERVICE_ROLE_KEY missing in env — fall back to RPC.
  }

  const listed = await supabase.rpc("caisse_list_voided_operations", { p_limit: 150 });
  if (listed.error) {
    const msg = listed.error.message || "";
    if (/schema cache|could not find the function|PGRST202/i.test(msg)) {
      return fail(
        "❌ Fonctions corbeille invisibles pour l’API. Dans Supabase SQL Editor exécutez : NOTIFY pgrst, 'reload schema';",
      );
    }
    if (/caisse_list_voided_operations|manage_restore|caisse_can_restore/i.test(msg)) {
      return fail("❌ Migration restauration non appliquée sur Supabase (caisse_restore_voided).");
    }
    return fail(msg);
  }
  return {
    ok: true,
    data: {
      rows: mapVoidedRows((listed.data ?? []) as Parameters<typeof mapVoidedRows>[0]),
    },
  };
}

async function verifyRestoredOperation(
  operationId: string,
): Promise<{ ok: true; opNumber: number } | { ok: false; error: string }> {
  try {
    const service = createServiceClient();
    const check = await service
      .from("caisse_operations")
      .select("id, op_number, voided_at")
      .eq("id", operationId)
      .maybeSingle();
    if (check.error) return { ok: false, error: check.error.message };
    if (!check.data) return { ok: false, error: "Opération introuvable après restauration." };
    if (check.data.voided_at) {
      return {
        ok: false,
        error:
          "Restauration non appliquée en base (voided_at toujours renseigné). Appliquez la migration caisse_restore_really sur Supabase.",
      };
    }
    return { ok: true, opNumber: Number(check.data.op_number) || 0 };
  } catch {
    // No service key: fall back to user-visible select (RLS hides voided rows).
    const gate = await clientOrError();
    if ("ok" in gate) return { ok: false, error: gate.ok === false ? gate.error : "Session requise." };
    const check = await gate.supabase
      .from("caisse_operations")
      .select("id, op_number, voided_at")
      .eq("id", operationId)
      .maybeSingle();
    if (check.error) return { ok: false, error: check.error.message };
    if (!check.data || check.data.voided_at) {
      return {
        ok: false,
        error:
          "Restauration non confirmée. Appliquez la migration caisse_restore_really sur Supabase, puis réessayez.",
      };
    }
    return { ok: true, opNumber: Number(check.data.op_number) || 0 };
  }
}

export async function restoreCaisseOperation(operationId: string): Promise<ActionResult<{ message: string }>> {
  const gate = await clientOrError();
  if ("ok" in gate) return gate;
  const { supabase, flags } = gate;
  if (!flags.isAdmin && !flags.canRestore) {
    return fail("❌ Accès réservé : restauration admin (ou droit délégué).");
  }

  const restored = await supabase.rpc("caisse_restore_operation", { p_id: operationId });
  if (restored.error) {
    const msg = restored.error.message || "";
    if (/schema cache|could not find the function|PGRST202/i.test(msg)) {
      return fail(
        "❌ Fonction restauration invisible pour l’API. Dans Supabase SQL Editor exécutez la migration caisse_restore_really (ou NOTIFY pgrst, 'reload schema';).",
      );
    }
    return fail(`❌ ${msg}`);
  }

  const verified = await verifyRestoredOperation(operationId);
  if (!verified.ok) return fail(`❌ ${verified.error}`);

  const op = verified.opNumber || Number(restored.data) || 0;
  await logAction(supabase, "RESTORE", "", op || "", "", `Restauration opération ${operationId}`, null);
  refresh();
  return {
    ok: true,
    data: {
      message: op
        ? `✅ Opération restaurée (nouveau N° ${op}). Les numéros ont été réordonnés.`
        : "✅ Opération restaurée. Les numéros ont été réordonnés.",
    },
  };
}

export async function getCaissePhoto(
  operationId: string,
): Promise<ActionResult<{ url: string; archiveName: string }>> {
  const gate = await clientOrError();
  if ("ok" in gate) return gate;
  const { data, error } = await gate.supabase
    .from("caisse_operations")
    .select("photo_data, op_number, op_date")
    .eq("id", operationId)
    .maybeSingle();
  if (error) return fail(error.message);
  if (!data?.photo_data) return fail("Bon introuvable.");
  const archiveName = formatBonLabel(data.op_number, String(data.op_date).slice(0, 10));
  return { ok: true, data: { url: data.photo_data, archiveName } };
}

/** Admin / gérant : valider manuellement le bon → statut ok, plus d’alerte couleur. */
export async function confirmCaisseBonMatch(
  operationId: string,
): Promise<ActionResult<{ message: string }>> {
  const gate = await clientOrError();
  if ("ok" in gate) return gate;
  const { supabase, flags } = gate;
  if (!flags.canValidateBons) return fail("❌ Réservé à l’administrateur ou au gérant");
  if (!operationId?.trim()) return fail("❌ Opération invalide");
  const existing = await supabase
    .from("caisse_operations")
    .select("id, op_number, op_date, has_photo, bon_match_status")
    .eq("id", operationId)
    .maybeSingle();
  if (existing.error) return fail(existing.error.message);
  if (!existing.data) return fail("❌ Opération introuvable.");
  if (!existing.data.has_photo) return fail("❌ Aucun bon à valider.");
  const updated = await supabase
    .from("caisse_operations")
    .update({ bon_match_status: "ok", bon_label: "Voir Bon" })
    .eq("id", operationId);
  if (updated.error) {
    if (/bon_match_status/i.test(updated.error.message)) {
      return fail("❌ Colonne bon_match_status absente — exécutez la migration SQL d’abord.");
    }
    return fail(updated.error.message);
  }
  const who = flags.isAdmin ? "admin" : "gérant";
  await logAction(
    supabase,
    "UPDATE",
    "ACHAT",
    existing.data.op_number,
    sheetNameFromIso(String(existing.data.op_date).slice(0, 10)),
    `Validation manuelle du bon (${who}) | était: ${existing.data.bon_match_status || "—"}`,
    null,
  );
  refresh();
  return { ok: true, data: { message: `✅ Bon N° ${existing.data.op_number} marqué conforme.` } };
}

/** Admin : métadonnées des bons déjà attachés (pour ZIP mois, sans charger photo_data). */
export async function listCaisseMonthBonDownloads(
  monthSheet: string,
): Promise<ActionResult<{ items: { operationId: string; op: number; date: string; archiveName: string }[]; count: number }>> {
  const gate = await clientOrError();
  if ("ok" in gate) return gate;
  const { supabase, flags } = gate;
  if (!flags.isAdmin) return fail("❌ Réservé à l’administrateur");
  if (!monthSheet?.trim() || monthSheet === "TOUS") return fail("❌ Choisissez un mois");

  const rpc = await supabase.rpc("caisse_month_bon_downloads", { p_month: monthSheet });
  if (!rpc.error) {
    const rows = (Array.isArray(rpc.data) ? rpc.data : []) as {
      operationId: string;
      op: number;
      date: string;
    }[];
    const items = rows.map((row) => ({
      operationId: row.operationId,
      op: Number(row.op),
      date: String(row.date).slice(0, 10),
      archiveName: formatBonLabel(row.op, String(row.date).slice(0, 10)),
    }));
    return { ok: true, data: { items, count: items.length } };
  }

  // Fallback si RPC absente : filtre SQL par mois (évite timeout 8s sur tout l’historique).
  const bounds = monthBoundsFromSheet(monthSheet);
  if (!bounds) return fail("❌ Mois invalide");
  const opsRes = await supabase
    .from("caisse_operations")
    .select("id, op_number, op_date, kind, has_photo")
    .eq("kind", "ACHAT")
    .eq("has_photo", true)
    .gte("op_date", bounds.start)
    .lt("op_date", bounds.endExclusive)
    .order("op_number", { ascending: true })
    .limit(2000);
  if (opsRes.error) return fail(opsRes.error.message || rpc.error.message);

  const items = (opsRes.data ?? []).map((op) => {
    const date = String(op.op_date).slice(0, 10);
    return {
      operationId: op.id,
      op: Number(op.op_number),
      date,
      archiveName: formatBonLabel(op.op_number, date),
    };
  });

  return { ok: true, data: { items, count: items.length } };
}

/** Admin : liste des achats d’un mois pour rattacher les bons en masse. */
export async function listCaisseBonAttachTargets(
  monthSheet: string,
): Promise<ActionResult<{ targets: BonAttachTarget[]; withoutPhoto: number }>> {
  const gate = await clientOrError();
  if ("ok" in gate) return gate;
  const { supabase, flags } = gate;
  if (!flags.isAdmin) return fail("❌ Réservé à l’administrateur");
  if (!monthSheet?.trim() || monthSheet === "TOUS") return fail("❌ Choisissez un mois");

  const rpc = await supabase.rpc("caisse_bon_attach_targets", { p_month: monthSheet });
  if (!rpc.error) {
    const targets = (Array.isArray(rpc.data) ? rpc.data : []) as BonAttachTarget[];
    const normalized = targets.map((row) => ({
      operationId: String(row.operationId),
      op: Number(row.op),
      date: String(row.date).slice(0, 10),
      amount: Math.round(Number(row.amount) * 100) / 100,
      buyer: String(row.buyer || ""),
      hasPhoto: !!row.hasPhoto,
    }));
    if (normalized.length && normalized.every((row) => !(row.amount > 0))) {
      return fail(
        `❌ Les achats de « ${monthSheet} » n’ont pas de lignes/montants lisibles — impossible de rattacher les bons.`,
      );
    }
    return {
      ok: true,
      data: {
        targets: normalized,
        withoutPhoto: normalized.filter((row) => !row.hasPhoto).length,
      },
    };
  }

  const bounds = monthBoundsFromSheet(monthSheet);
  if (!bounds) return fail("❌ Mois invalide");
  const opsRes = await supabase
    .from("caisse_operations")
    .select("id, op_number, op_date, kind, has_photo, buyer_name, lines:caisse_lines(qty, unit_price)")
    .eq("kind", "ACHAT")
    .gte("op_date", bounds.start)
    .lt("op_date", bounds.endExclusive)
    .order("op_date", { ascending: true })
    .limit(2000);
  if (opsRes.error) return fail(opsRes.error.message || rpc.error.message);

  const targets: BonAttachTarget[] = [];
  let emptyAmount = 0;
  for (const op of opsRes.data ?? []) {
    const date = String(op.op_date).slice(0, 10);
    const lines = (op.lines || []) as { qty: number; unit_price: number }[];
    const amount = lines.reduce(
      (sum: number, line) => sum + Number(line.qty) * Number(line.unit_price),
      0,
    );
    const rounded = Math.round(amount * 100) / 100;
    if (!(rounded > 0)) emptyAmount += 1;
    targets.push({
      operationId: op.id,
      op: Number(op.op_number),
      date,
      amount: rounded,
      buyer: op.buyer_name || "",
      hasPhoto: !!op.has_photo,
    });
  }
  if (targets.length && emptyAmount === targets.length) {
    return fail(
      `❌ Les achats de « ${monthSheet} » n’ont pas de lignes/montants lisibles — impossible de rattacher les bons.`,
    );
  }
  return {
    ok: true,
    data: {
      targets,
      withoutPhoto: targets.filter((row) => !row.hasPhoto).length,
    },
  };
}

/**
 * Admin : retire les bons d’un mois pour recommencer l’import.
 * mode=suspect → warn / unknown / vide (faux positifs fréquents)
 * mode=all → tous les bons ACHAT du mois
 */
export async function clearCaisseMonthBonPhotos(input: {
  monthSheet: string;
  mode?: "suspect" | "all";
}): Promise<ActionResult<{ cleared: number; message: string }>> {
  const gate = await clientOrError();
  if ("ok" in gate) return gate;
  const { supabase, flags } = gate;
  if (!flags.isAdmin) return fail("❌ Réservé à l’administrateur");
  const monthSheet = input.monthSheet?.trim() || "";
  if (!monthSheet || monthSheet === "TOUS") return fail("❌ Choisissez un mois");
  const mode = input.mode === "all" ? "all" : "suspect";
  const bounds = monthBoundsFromSheet(monthSheet);
  if (!bounds) return fail("❌ Mois invalide");

  const opsRes = await supabase
    .from("caisse_operations")
    .select("id, op_number, op_date, kind, has_photo, bon_match_status")
    .eq("kind", "ACHAT")
    .eq("has_photo", true)
    .gte("op_date", bounds.start)
    .lt("op_date", bounds.endExclusive)
    .limit(2000);
  if (opsRes.error) return fail(opsRes.error.message);

  const targets = (opsRes.data ?? []).filter((op) => {
    if (mode === "all") return true;
    const status = op.bon_match_status as string | null;
    return status === "warn" || status === "unknown" || status === "bad" || !status;
  });

  let cleared = 0;
  for (const op of targets) {
    const updated = await supabase
      .from("caisse_operations")
      .update({ photo_data: null, bon_label: "", bon_match_status: null })
      .eq("id", op.id);
    if (updated.error) {
      if (/bon_match_status/i.test(updated.error.message)) {
        const fallback = await supabase
          .from("caisse_operations")
          .update({ photo_data: null, bon_label: "" })
          .eq("id", op.id);
        if (fallback.error) return fail(fallback.error.message);
      } else {
        return fail(updated.error.message);
      }
    }
    cleared += 1;
  }

  await logAction(
    supabase,
    "UPDATE",
    "ACHAT",
    "",
    monthSheet,
    `Purge bons import (${mode}) — ${cleared} opération(s)`,
    null,
  );
  refresh();
  return {
    ok: true,
    data: {
      cleared,
      message: `✅ ${cleared} bon(s) retiré(s) de « ${monthSheet} » (${mode === "all" ? "tous" : "suspects warn/unknown"}).`,
    },
  };
}

/** Admin : attache un bon (image data URL) à une opération ACHAT. */
export async function attachCaisseBonPhoto(input: {
  operationId: string;
  photoDataUrl: string;
  bonMatchStatus?: PurchaseInput["bonMatchStatus"];
  replaceExisting?: boolean;
}): Promise<ActionResult<{ message: string; op: number; archiveName: string }>> {
  const gate = await clientOrError();
  if ("ok" in gate) return gate;
  const { supabase, flags } = gate;
  if (!flags.isAdmin) return fail("❌ Réservé à l’administrateur");

  const photo = input.photoDataUrl?.trim() || "";
  if (!photo.startsWith("data:image/") && !photo.startsWith("data:application/pdf")) {
    return fail("❌ Le bon doit être une image ou un PDF.");
  }
  if (photo.length > 3_800_000) return fail("❌ Bon trop lourd (limite ~3,5 Mo).");

  const status = normalizeBonMatchStatus(input.bonMatchStatus) ?? "unknown";
  const viaRpc = await supabase.rpc("caisse_attach_bon_photo", {
    p_operation_id: input.operationId,
    p_photo_data: photo,
    p_match_status: status,
    p_replace: !!input.replaceExisting,
  });
  if (!viaRpc.error && viaRpc.data && typeof viaRpc.data === "object") {
    const payload = viaRpc.data as { op: number; date?: string; message?: string };
    const op = Number(payload.op);
    const date = String(payload.date || "").slice(0, 10);
    const archiveName = date ? formatBonLabel(op, date) : `Bon_N${op}`;
    await logAction(
      supabase,
      "UPDATE",
      "ACHAT",
      op,
      date ? sheetNameFromIso(date) : "",
      `Rattachement bon (import masse) | ${archiveName}`,
      null,
    );
    refresh();
    return {
      ok: true,
      data: {
        op,
        archiveName,
        message: String(payload.message || `✅ Bon lié à N° ${op}`),
      },
    };
  }

  const existing = await supabase
    .from("caisse_operations")
    .select("id, op_number, op_date, kind, has_photo")
    .eq("id", input.operationId)
    .maybeSingle();
  if (existing.error) return fail(existing.error.message || viaRpc.error?.message || "Échec rattachement");
  if (!existing.data) return fail("❌ Opération introuvable.");
  if (existing.data.kind !== "ACHAT") return fail("❌ Uniquement pour les achats.");
  if (existing.data.has_photo && !input.replaceExisting) {
    return fail(`❌ L’opération N° ${existing.data.op_number} a déjà un bon.`);
  }

  const updated = await supabase
    .from("caisse_operations")
    .update({ photo_data: photo, bon_label: "Voir Bon" })
    .eq("id", input.operationId);
  if (updated.error) return fail(updated.error.message);

  const archiveName = await applyBonDisplayAndMatch(
    supabase,
    input.operationId,
    Number(existing.data.op_number),
    String(existing.data.op_date).slice(0, 10),
    true,
    status,
  );
  await logAction(
    supabase,
    "UPDATE",
    "ACHAT",
    existing.data.op_number,
    sheetNameFromIso(String(existing.data.op_date).slice(0, 10)),
    `Rattachement bon (import masse) | ${archiveName}`,
    null,
  );
  refresh();
  return {
    ok: true,
    data: {
      op: Number(existing.data.op_number),
      archiveName,
      message: `✅ Bon lié à N° ${existing.data.op_number}`,
    },
  };
}

const BON_AI_SCHEMA = {
  type: "object",
  properties: {
    date: {
      anyOf: [{ type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" }, { type: "null" }],
      description: "Date du bon au format ISO YYYY-MM-DD",
    },
    amount: {
      anyOf: [{ type: "number" }, { type: "null" }],
      description: "Montant total à payer en dinars algériens (nombre, pas de texte)",
    },
    amounts: {
      type: "array",
      items: { type: "number" },
      description: "Autres montants visibles (lignes + total)",
    },
  },
  required: ["date", "amount", "amounts"],
} as const;

/**
 * Lecture IA (Gemini) d’un bon image — indispensable pour l’écriture manuscrite
 * où Tesseract échoue. Admin only.
 */
export async function readCaisseBonWithAi(input: {
  photoDataUrl: string;
}): Promise<
  ActionResult<{
    date: string | null;
    amount: number | null;
    amounts: number[];
    model: string;
  }>
> {
  const gate = await clientOrError();
  if ("ok" in gate) return gate;
  const { flags } = gate;
  if (!flags.isAdmin) return fail("❌ Réservé à l’administrateur");
  if (!geminiConfigured()) {
    return fail("❌ Lecture IA non configurée (GEMINI_API_KEY absente sur le serveur).");
  }

  const raw = input.photoDataUrl?.trim() || "";
  const match = /^data:(image\/(?:jpeg|jpg|png|webp));base64,([A-Za-z0-9+/=\s]+)$/i.exec(raw);
  if (!match) return fail("❌ Image bon invalide pour l’IA (JPEG/PNG/WEBP).");
  const mime = match[1]!.toLowerCase() === "image/jpg" ? "image/jpeg" : match[1]!.toLowerCase();
  const base64 = match[2]!.replace(/\s+/g, "");
  if (base64.length > 2_800_000) return fail("❌ Image trop lourde pour l’analyse IA.");

  try {
    const parsed = (await generateStructured({
      parts: [
        {
          text: `Tu lis un bon / reçu / facture algérien (imprimé OU manuscrit, français et/ou arabe).
Extrais uniquement :
- date du bon (ISO YYYY-MM-DD), ou null si illisible
- amount = montant TOTAL / NET À PAYER / case montant (en DA), nombre décimal
- amounts = liste des montants numériques visibles utiles (lignes + total)
Ignore numéros de facture longs, RC, NIF, téléphone, matricules.
Réponds strictement en JSON selon le schéma.`,
        },
        { inline_data: { mime_type: mime, data: base64 } },
      ],
      schema: BON_AI_SCHEMA,
    })) as { date?: string | null; amount?: number | null; amounts?: unknown };

    const date =
      typeof parsed.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(parsed.date) ? parsed.date : null;
    const amount =
      typeof parsed.amount === "number" && Number.isFinite(parsed.amount) && parsed.amount > 0
        ? Math.round(parsed.amount * 100) / 100
        : null;
    const amounts = Array.isArray(parsed.amounts)
      ? [
          ...new Set(
            parsed.amounts
              .map((value) => (typeof value === "number" ? Math.round(value * 100) / 100 : NaN))
              .filter((value) => Number.isFinite(value) && value > 0),
          ),
        ]
      : [];
    if (amount != null && !amounts.includes(amount)) amounts.push(amount);

    return {
      ok: true,
      data: { date, amount, amounts, model: geminiModel() },
    };
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Lecture IA du bon impossible.");
  }
}

export async function getCaisseClose(date: string): Promise<ActionResult<CloseStatus>> {
  const gate = await clientOrError();
  if ("ok" in gate) return gate;
  const { supabase, flags, solde } = gate;
  if (!flags.canSeeCaisse && !flags.isAdmin) return fail("Accès caisse requis");
  if (!ISO_DATE.test(date || "")) return fail("Date invalide");
  const { data, error } = await supabase.from("caisse_journal_closures").select("*").eq("op_date", date).maybeSingle();
  if (error) return fail(error.message);
  return {
    ok: true,
    data: {
      date,
      closed: data?.status === "CLOSED",
      systemSolde: solde,
      physicalSolde: asNumber(data?.physical_solde),
      ecart: asNumber(data?.ecart),
      note: data?.note || "",
      closedBy: data?.closed_by_name || "",
      closedAt: data?.closed_at || "",
      unlockedBy: data?.unlocked_by_name || "",
      unlockedAt: data?.unlocked_at || "",
      unlockReason: data?.unlock_reason || "",
      canClose: data?.status !== "CLOSED",
      canUnlock: !!flags.isAdmin && data?.status === "CLOSED",
    },
  };
}

export async function closeCaisseDay(input: { date: string; physical: number; note: string }): Promise<ActionResult<{ message: string }>> {
  const gate = await clientOrError();
  if ("ok" in gate) return gate;
  const { supabase, flags } = gate;
  if (!flags.canSeeCaisse && !flags.isAdmin) return fail("❌ Accès caisse requis");
  if (!ISO_DATE.test(input.date || "")) return fail("❌ Date invalide");
  const physical = Number(input.physical);
  if (!Number.isFinite(physical) || physical < 0) return fail("❌ Solde physique invalide");
  const current = await supabase.from("caisse_journal_closures").select("status").eq("op_date", input.date).maybeSingle();
  if (current.error) return fail(current.error.message);
  if (current.data?.status === "CLOSED") return fail("❌ Cette journée est déjà clôturée. L’admin peut la rouvrir.");
  const { data: solde, error: soldeError } = await supabase.rpc("caisse_system_solde");
  if (soldeError) return fail(soldeError.message);
  const systemSolde = Number(solde) || 0;
  const ecart = physical - systemSolde;
  const now = new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Africa/Algiers",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date());
  const row = {
    op_date: input.date,
    status: "CLOSED",
    system_solde: systemSolde,
    physical_solde: physical,
    ecart,
    note: input.note || "",
    closed_by_name: flags.userName,
    closed_at: now,
    unlocked_by_name: "",
    unlocked_at: "",
    unlock_reason: "",
  };
  const saved = current.data
    ? await supabase.from("caisse_journal_closures").update(row).eq("op_date", input.date)
    : await supabase.from("caisse_journal_closures").insert(row);
  if (saved.error) return fail(saved.error.message);
  await logAction(supabase, "CLOTURE", "CAISSE", "", "Clotures_Caisse", `Clôture ${input.date} | Système ${systemSolde} | Physique ${physical} | Écart ${ecart}${input.note ? ` | ${input.note}` : ""}`, physical);
  refresh();
  return {
    ok: true,
    data: {
      message: `✅ Journée ${input.date} clôturée.\nSystème: ${systemSolde.toFixed(2)} DA\nPhysique: ${physical.toFixed(2)} DA\nÉcart: ${ecart.toFixed(2)} DA`,
    },
  };
}

export async function unlockCaisseDay(input: { date: string; reason: string }): Promise<ActionResult<{ message: string }>> {
  const gate = await clientOrError();
  if ("ok" in gate) return gate;
  const { supabase, flags } = gate;
  if (!flags.isAdmin) return fail("❌ Seul l’administrateur peut rouvrir une journée");
  if (!ISO_DATE.test(input.date || "")) return fail("❌ Date invalide");
  const current = await supabase.from("caisse_journal_closures").select("status").eq("op_date", input.date).maybeSingle();
  if (current.error) return fail(current.error.message);
  if (current.data?.status !== "CLOSED") return fail("Cette journée est déjà ouverte");
  const now = new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Africa/Algiers",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date());
  const saved = await supabase
    .from("caisse_journal_closures")
    .update({
      status: "OPEN",
      unlocked_by_name: flags.userName,
      unlocked_at: now,
      unlock_reason: input.reason || "Réouverture admin",
    })
    .eq("op_date", input.date);
  if (saved.error) return fail(saved.error.message);
  await logAction(supabase, "UNLOCK", "CAISSE", "", "Clotures_Caisse", `Réouverture ${input.date} | ${input.reason || "Réouverture admin"}`, null);
  refresh();
  return { ok: true, data: { message: `✅ Journée ${input.date} rouverte. Vous pouvez saisir les opérations en retard, puis reclôturer.` } };
}

export async function getCaisseAdmin(): Promise<
  ActionResult<{
    users: CaisseAdminUser[];
    openings: { name: string; amount: number }[];
    openingDate: string;
    total: number;
    lists: { affectations: string[]; units: string[]; matricules: string[] };
  }>
> {
  const gate = await clientOrError();
  if ("ok" in gate) return gate;
  const { supabase, flags } = gate;
  if (!flags.isAdmin) return fail("Réservé à l’administrateur");
  let rightsRes = await supabase
    .from("caisse_rights")
    .select("user_id, manage_openings, manage_lists, manage_restore, caisse_active");
  if (rightsRes.error && /manage_restore/i.test(rightsRes.error.message)) {
    rightsRes = await supabase
      .from("caisse_rights")
      .select("user_id, manage_openings, manage_lists, caisse_active");
  }
  const [usersRes, buyersRes, openingsRes, settingsRes, listsRes] = await Promise.all([
    supabase.rpc("caisse_admin_users"),
    supabase.from("caisse_journal_buyers").select("id, name, email, user_id, dates_libres, buy_for_others, see_all, caisse_ops, can_edit, active"),
    supabase.from("caisse_journal_openings").select("buyer_name, amount"),
    supabase.from("caisse_settings").select("opening_date").eq("id", 1).maybeSingle(),
    supabase.from("caisse_lists").select("list_key, label, sort_order").order("sort_order"),
  ]);
  if (usersRes.error) return fail(usersRes.error.message);
  if (buyersRes.error) return fail(buyersRes.error.message);
  if (openingsRes.error) return fail(openingsRes.error.message);
  if (listsRes.error) return fail(listsRes.error.message);
  const rightsByUser = new Map(
    (rightsRes.error ? [] : (rightsRes.data ?? [])).map((row) => [
      row.user_id,
      {
        manageOpenings: !!row.manage_openings,
        manageLists: !!row.manage_lists,
        manageRestore: !!(row as { manage_restore?: boolean }).manage_restore,
        active: row.caisse_active !== false,
      },
    ]),
  );
  const openingDate = settingsRes.error || !settingsRes.data?.opening_date
    ? OPENING_BALANCE_DATE
    : String(settingsRes.data.opening_date).slice(0, 10);
  const users: CaisseAdminUser[] = ((usersRes.data ?? []) as {
    userId: string;
    name: string;
    email: string;
    isAdmin: boolean;
    datesLibres: boolean;
    buyForOthers: boolean;
    seeAll: boolean;
    caisseOps: boolean;
    canEdit: boolean;
    active?: boolean;
  }[]).map((user) => ({
    userId: user.userId,
    buyerId: null as string | null,
    name: user.name,
    email: user.email || "",
    isAdmin: !!user.isAdmin,
    active: user.active !== false && (rightsByUser.get(user.userId)?.active ?? true),
    datesLibres: !!user.datesLibres,
    buyForOthers: !!user.buyForOthers,
    seeAll: !!user.seeAll,
    caisseOps: !!user.caisseOps,
    canEdit: !!user.canEdit,
    manageOpenings: rightsByUser.get(user.userId)?.manageOpenings ?? false,
    manageLists: rightsByUser.get(user.userId)?.manageLists ?? false,
    manageRestore: rightsByUser.get(user.userId)?.manageRestore ?? false,
  }));
  const usersById = new Map(users.filter((row) => row.userId).map((row) => [row.userId as string, row]));
  const usersByEmail = new Map(
    users
      .filter((row) => row.userId && row.email.trim())
      .map((row) => [row.email.trim().toLowerCase(), row]),
  );
  for (const buyer of buyersRes.data ?? []) {
    const email = String(buyer.email || "").trim().toLowerCase();
    const linkedUser =
      (buyer.user_id ? usersById.get(buyer.user_id) : undefined) ||
      (email ? usersByEmail.get(email) : undefined);
    if (linkedUser) {
      linkedUser.buyerId = buyer.id;
      if (email && !linkedUser.email.trim()) linkedUser.email = String(buyer.email || "");
      const hasRightsRow = rightsByUser.has(linkedUser.userId as string);
      if (!hasRightsRow && !linkedUser.isAdmin) {
        linkedUser.datesLibres = !!buyer.dates_libres;
        linkedUser.buyForOthers = !!buyer.buy_for_others;
        linkedUser.seeAll = !!buyer.see_all;
        linkedUser.caisseOps = !!buyer.caisse_ops;
        linkedUser.canEdit = !!buyer.can_edit;
        linkedUser.active = buyer.active !== false;
      }
      continue;
    }
    users.push({
      userId: null,
      buyerId: buyer.id,
      name: buyer.name,
      email: buyer.email || "",
      isAdmin: false,
      active: buyer.active !== false,
      datesLibres: !!buyer.dates_libres,
      buyForOthers: !!buyer.buy_for_others,
      seeAll: !!buyer.see_all,
      caisseOps: !!buyer.caisse_ops,
      canEdit: !!buyer.can_edit,
      manageOpenings: false,
      manageLists: false,
      manageRestore: false,
    });
  }
  users.sort((a, b) => a.name.localeCompare(b.name, "fr"));
  const openingMap = new Map((openingsRes.data ?? []).map((row) => [row.buyer_name, Number(row.amount) || 0]));
  // Admins (SUPER_ADMIN / ADMIN_FINANCE) can also hold an opening float as acheteurs.
  const openingNames = new Set(
    users
      .filter((user) => user.active && !isCaissePrincipaleName(user.name))
      .map((user) => user.name),
  );
  for (const name of openingMap.keys()) openingNames.add(name);
  const openings = [...openingNames]
    .filter((name) => !isCaissePrincipaleName(name))
    .sort((a, b) => a.localeCompare(b, "fr"))
    .map((name) => ({ name, amount: openingMap.get(name) || 0 }));
  const lists = listsRes.data ?? [];
  return {
    ok: true,
    data: {
      users,
      openings,
      openingDate,
      total: openings.reduce((sum, row) => sum + (row.amount > 0 ? row.amount : 0), 0),
      lists: {
        affectations: lists.filter((row) => row.list_key === "AFFECTATION").map((row) => row.label),
        units: lists.filter((row) => row.list_key === "UNIT").map((row) => row.label),
        matricules: lists.filter((row) => row.list_key === "MATRICULE").map((row) => row.label),
      },
    },
  };
}

export async function getCaisseOpeningForm(): Promise<
  ActionResult<{ openings: { name: string; amount: number }[]; openingDate: string }>
> {
  const gate = await clientOrError();
  if ("ok" in gate) return gate;
  const { supabase, flags } = gate;
  if (!flags.canManageOpenings) {
    return fail("Réservé à l’administrateur caisse ou à la personne déléguée (Ouverture)");
  }
  const [openingsRes, buyersRes, directoryRes, settingsRes] = await Promise.all([
    supabase.from("caisse_journal_openings").select("buyer_name, amount"),
    supabase.from("caisse_journal_buyers").select("name").eq("active", true),
    supabase.rpc("caisse_name_directory"),
    supabase.from("caisse_settings").select("opening_date").eq("id", 1).maybeSingle(),
  ]);
  if (openingsRes.error) return fail(openingsRes.error.message);
  const openingDate = settingsRes.error || !settingsRes.data?.opening_date
    ? OPENING_BALANCE_DATE
    : String(settingsRes.data.opening_date).slice(0, 10);
  const names = new Set<string>();
  for (const buyer of buyersRes.data ?? []) {
    if (!isCaissePrincipaleName(buyer.name)) names.add(buyer.name);
  }
  if (!directoryRes.error) {
    for (const row of (directoryRes.data ?? []) as { name: string }[]) {
      if (row.name && !isCaissePrincipaleName(row.name)) names.add(row.name);
    }
  }
  const amounts = new Map((openingsRes.data ?? []).map((row) => [row.buyer_name, Number(row.amount) || 0]));
  for (const name of amounts.keys()) if (!isCaissePrincipaleName(name)) names.add(name);
  const openings = [...names]
    .sort((a, b) => a.localeCompare(b, "fr"))
    .map((name) => ({ name, amount: amounts.get(name) || 0 }));
  return { ok: true, data: { openings, openingDate } };
}

export async function saveCaisseRights(rows: CaisseAdminUser[]): Promise<ActionResult<{ message: string }>> {
  const gate = await clientOrError();
  if ("ok" in gate) return gate;
  const { supabase, flags } = gate;
  if (!flags.isAdmin) return fail("Réservé à l’administrateur");
  const names: string[] = [];
  for (const row of rows) {
    if (row.isAdmin) continue;
    names.push(row.name);
    const flagsRow = {
      dates_libres: !!row.datesLibres,
      buy_for_others: !!row.buyForOthers,
      see_all: !!row.seeAll,
      caisse_ops: !!row.caisseOps,
      can_edit: !!row.canEdit,
      active: row.active !== false,
    };
    let userId = row.userId || null;
    if (!userId && row.email?.trim()) {
      const existingUser = await supabase.rpc("caisse_user_id_by_email", {
        p_email: row.email.trim().toLowerCase(),
      });
      if (existingUser.error) return fail(existingUser.error.message);
      if (existingUser.data) userId = String(existingUser.data);
    }
    if (userId) {
      const saved = await supabase.from("caisse_rights").upsert({
        user_id: userId,
        dates_libres: flagsRow.dates_libres,
        buy_for_others: flagsRow.buy_for_others,
        see_all: flagsRow.see_all,
        caisse_ops: flagsRow.caisse_ops,
        can_edit: flagsRow.can_edit,
        manage_openings: !!row.manageOpenings,
        manage_lists: !!row.manageLists,
        manage_restore: !!row.manageRestore,
        caisse_active: flagsRow.active,
      });
      if (saved.error) {
        if (/manage_restore/i.test(saved.error.message)) {
          const fallback = await supabase.from("caisse_rights").upsert({
            user_id: userId,
            dates_libres: flagsRow.dates_libres,
            buy_for_others: flagsRow.buy_for_others,
            see_all: flagsRow.see_all,
            caisse_ops: flagsRow.caisse_ops,
            can_edit: flagsRow.can_edit,
            manage_openings: !!row.manageOpenings,
            manage_lists: !!row.manageLists,
            caisse_active: flagsRow.active,
          });
          if (fallback.error) return fail(fallback.error.message);
        } else {
          return fail(saved.error.message);
        }
      }
      if (row.buyerId) {
        const linked = await supabase
          .from("caisse_journal_buyers")
          .update({
            user_id: userId,
            email: row.email || null,
            ...flagsRow,
          })
          .eq("id", row.buyerId);
        if (linked.error) return fail(linked.error.message);
      }
    } else if (row.buyerId) {
      const saved = await supabase
        .from("caisse_journal_buyers")
        .update({
          email: row.email || null,
          ...flagsRow,
        })
        .eq("id", row.buyerId);
      if (saved.error) return fail(saved.error.message);
    }
  }
  await logAction(supabase, "DROITS", "", "", "Users", `Droits mis à jour: ${names.length ? names.join(", ") : "—"}`, null);
  refresh();
  return { ok: true, data: { message: "✅ Droits enregistrés" } };
}

export async function saveCaisseOpenings(
  rows: { name: string; amount: number }[],
  openingDate?: string,
): Promise<ActionResult<{ message: string }>> {
  const gate = await clientOrError();
  if ("ok" in gate) return gate;
  const { supabase, flags } = gate;
  if (!flags.canManageOpenings) {
    return fail("Réservé à l’administrateur caisse ou à la personne déléguée (Ouverture)");
  }
  const date = openingDate && /^\d{4}-\d{2}-\d{2}$/.test(openingDate) ? openingDate : null;
  if (date) {
    const savedDate = await supabase.from("caisse_settings").update({ opening_date: date }).eq("id", 1);
    if (savedDate.error) return fail(savedDate.error.message);
  }
  const map = new Map<string, number>();
  for (const row of rows) {
    const name = row.name?.trim();
    const amount = Number(row.amount);
    if (!name || isCaissePrincipaleName(name) || !Number.isFinite(amount) || amount <= 0) continue;
    map.set(name, (map.get(name) || 0) + amount);
  }
  const cleared = await supabase.from("caisse_journal_openings").delete().neq("buyer_name", "");
  if (cleared.error) return fail(cleared.error.message);
  const payload = [...map.entries()].map(([buyer_name, amount]) => ({ buyer_name, amount }));
  if (payload.length) {
    const inserted = await supabase.from("caisse_journal_openings").insert(payload);
    if (inserted.error) return fail(inserted.error.message);
  }
  const total = payload.reduce((sum, row) => sum + row.amount, 0);
  const label = date ? date.split("-").reverse().join("/") : "ouverture";
  await logAction(supabase, "OUVERTURE", "", "", "Soldes_Ouverture", `Soldes ouverture ${label}: ${payload.length} acheteur(s), total caisse ${total}`, total);
  refresh();
  return {
    ok: true,
    data: {
      message: `✅ Soldes d’ouverture enregistrés.\n${payload.length} acheteur(s)\nTotal (= caisse ouverture) : ${total.toFixed(2)} DA`,
    },
  };
}

export async function addCaisseBuyer(input: {
  name: string;
  email: string;
  pass: string;
  access: string;
  role: string;
  journal: string;
  caisse: string;
  edit: string;
}): Promise<ActionResult<{ message: string }>> {
  const gate = await clientOrError();
  if ("ok" in gate) return gate;
  const { supabase, flags } = gate;
  if (!flags.isAdmin) return fail("Réservé à l’administrateur");
  const name = input.name?.trim();
  const email = input.email?.trim().toLowerCase();
  if (!name || !email || !input.pass) return fail("Nom, email et mot de passe obligatoires");
  if (!PASSWORD_RULE.test(input.pass)) return fail("Le mot de passe doit contenir 6 caractères (lettres + chiffres)");
  const flagsRow = {
    dates_libres: input.access === "OPEN",
    buy_for_others: input.role === "MASTER",
    see_all: input.journal === "ALL",
    caisse_ops: input.caisse === "CAISSE",
    can_edit: input.edit === "EDIT",
  };
  const existingUser = await supabase.rpc("caisse_user_id_by_email", { p_email: email });
  if (existingUser.error) return fail(existingUser.error.message);
  if (existingUser.data) {
    const saved = await supabase.from("caisse_rights").upsert({ user_id: existingUser.data, ...flagsRow });
    if (saved.error) return fail(saved.error.message);
  } else {
    const duplicate = await supabase.from("caisse_journal_buyers").select("id").eq("name", name).maybeSingle();
    if (duplicate.error) return fail(duplicate.error.message);
    if (duplicate.data) return fail("Ce nom existe déjà");
    const inserted = await supabase.from("caisse_journal_buyers").insert({ name, email, ...flagsRow });
    if (inserted.error) return fail(inserted.error.message);
  }
  await logAction(supabase, "USER_ADD", "", "", "Users", `Nouvel utilisateur: ${name}`, null);
  refresh();
  return { ok: true, data: { message: "✅ Utilisateur ajouté" } };
}

export async function updateCaisseBuyerProfile(input: {
  userId?: string | null;
  buyerId?: string | null;
  name: string;
  email?: string;
}): Promise<ActionResult<{ message: string }>> {
  const gate = await clientOrError();
  if ("ok" in gate) return gate;
  const { supabase, flags } = gate;
  if (!flags.isAdmin) return fail("Réservé à l’administrateur");
  const name = input.name?.trim();
  if (!name) return fail("Nom obligatoire");
  const email = input.email?.trim().toLowerCase() || "";

  if (input.userId) {
    const current = await supabase.from("sys_users").select("id, full_name, email").eq("id", input.userId).maybeSingle();
    if (current.error) return fail(current.error.message);
    if (!current.data) return fail("Utilisateur introuvable");
    const oldName = String(current.data.full_name || "").trim();
    if (oldName !== name) {
      const renamed = await supabase.rpc("caisse_rename_buyer", { p_old: oldName, p_new: name });
      if (renamed.error) return fail(renamed.error.message);
      const savedName = await supabase.from("sys_users").update({ full_name: name }).eq("id", input.userId);
      if (savedName.error) return fail(savedName.error.message);
    }
    if (email) {
      const savedEmail = await supabase.from("sys_users").update({ email }).eq("id", input.userId);
      if (savedEmail.error) return fail(savedEmail.error.message);
    }
    await logAction(supabase, "USER_EDIT", "", "", "Users", `Profil modifié: ${oldName} → ${name}`, null);
  } else if (input.buyerId) {
    const current = await supabase.from("caisse_journal_buyers").select("id, name, email").eq("id", input.buyerId).maybeSingle();
    if (current.error) return fail(current.error.message);
    if (!current.data) return fail("Acheteur introuvable");
    const oldName = String(current.data.name || "").trim();
    if (oldName !== name) {
      const renamed = await supabase.rpc("caisse_rename_buyer", { p_old: oldName, p_new: name });
      if (renamed.error) return fail(renamed.error.message);
    }
    const saved = await supabase
      .from("caisse_journal_buyers")
      .update({ name, email: email || null })
      .eq("id", input.buyerId);
    if (saved.error) return fail(saved.error.message);
    await logAction(supabase, "USER_EDIT", "", "", "Users", `Acheteur modifié: ${oldName} → ${name}`, null);
  } else {
    return fail("Cible manquante");
  }
  refresh();
  return { ok: true, data: { message: `✅ Informations enregistrées pour « ${name} »` } };
}

export async function setCaisseBuyerActive(input: {
  userId?: string | null;
  buyerId?: string | null;
  active: boolean;
}): Promise<ActionResult<{ message: string }>> {
  const gate = await clientOrError();
  if ("ok" in gate) return gate;
  const { supabase, flags } = gate;
  if (!flags.isAdmin) return fail("Réservé à l’administrateur");
  const active = !!input.active;

  if (input.userId) {
    const current = await supabase.from("sys_users").select("full_name").eq("id", input.userId).maybeSingle();
    if (current.error) return fail(current.error.message);
    if (!current.data) return fail("Utilisateur introuvable");
    const saved = await supabase.from("caisse_rights").upsert({
      user_id: input.userId,
      caisse_active: active,
    });
    if (saved.error) return fail(saved.error.message);
    await logAction(
      supabase,
      active ? "USER_ON" : "USER_OFF",
      "",
      "",
      "Users",
      `${active ? "Réactivé" : "Désactivé"}: ${current.data.full_name}`,
      null,
    );
  } else if (input.buyerId) {
    const current = await supabase.from("caisse_journal_buyers").select("name").eq("id", input.buyerId).maybeSingle();
    if (current.error) return fail(current.error.message);
    if (!current.data) return fail("Acheteur introuvable");
    const saved = await supabase.from("caisse_journal_buyers").update({ active }).eq("id", input.buyerId);
    if (saved.error) return fail(saved.error.message);
    await logAction(
      supabase,
      active ? "USER_ON" : "USER_OFF",
      "",
      "",
      "Users",
      `${active ? "Réactivé" : "Désactivé"}: ${current.data.name}`,
      null,
    );
  } else {
    return fail("Cible manquante");
  }
  refresh();
  return {
    ok: true,
    data: { message: active ? "✅ Acheteur réactivé (visible dans les listes)" : "✅ Acheteur désactivé (masqué des listes)" },
  };
}

export async function deleteCaisseBuyer(input: {
  userId?: string | null;
  buyerId?: string | null;
}): Promise<ActionResult<{ message: string }>> {
  const gate = await clientOrError();
  if ("ok" in gate) return gate;
  const { supabase, flags } = gate;
  if (!flags.isAdmin) return fail("Réservé à l’administrateur");

  if (input.userId) {
    return fail("Compte ERP lié : utilisez Désactiver. La suppression se fait depuis Paramètres → Utilisateurs.");
  }
  if (!input.buyerId) return fail("Cible manquante");

  const current = await supabase.from("caisse_journal_buyers").select("id, name").eq("id", input.buyerId).maybeSingle();
  if (current.error) return fail(current.error.message);
  if (!current.data) return fail("Acheteur introuvable");
  const name = String(current.data.name || "").trim();

  const usedOps = await supabase.from("caisse_operations").select("id", { count: "exact", head: true }).eq("buyer_name", name);
  if (usedOps.error) return fail(usedOps.error.message);
  if ((usedOps.count ?? 0) > 0) {
    return fail("Impossible de supprimer : des opérations existent. Désactivez l’acheteur à la place.");
  }
  const usedOpen = await supabase.from("caisse_journal_openings").select("buyer_name", { count: "exact", head: true }).eq("buyer_name", name);
  if (usedOpen.error) return fail(usedOpen.error.message);
  if ((usedOpen.count ?? 0) > 0) {
    return fail("Impossible de supprimer : un solde d’ouverture existe. Désactivez l’acheteur ou mettez le solde à 0.");
  }

  const removed = await supabase.from("caisse_journal_buyers").delete().eq("id", input.buyerId);
  if (removed.error) return fail(removed.error.message);
  await logAction(supabase, "USER_DEL", "", "", "Users", `Acheteur supprimé: ${name}`, null);
  refresh();
  return { ok: true, data: { message: `✅ « ${name} » supprimé` } };
}

const LIST_KEYS = ["AFFECTATION", "UNIT", "MATRICULE"] as const;
type CaisseListKey = (typeof LIST_KEYS)[number];

function normalizeListLabel(label: string): string {
  return label.trim().replace(/\s+/g, " ");
}

export async function addCaisseListItem(
  listKey: CaisseListKey,
  label: string,
): Promise<ActionResult<{ message: string; label: string }>> {
  const gate = await clientOrError();
  if ("ok" in gate) return gate;
  const { supabase, flags } = gate;
  if (!flags.canManageLists) return fail("Réservé à l’administrateur caisse ou à la personne déléguée (Listes)");
  if (!LIST_KEYS.includes(listKey)) return fail("Liste inconnue");
  const value = normalizeListLabel(label);
  if (!value || value.length > 120) return fail("Libellé invalide (1 à 120 caractères)");
  const maxOrder = await supabase
    .from("caisse_lists")
    .select("sort_order")
    .eq("list_key", listKey)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (maxOrder.error) return fail(maxOrder.error.message);
  const sortOrder = (maxOrder.data?.sort_order ?? 0) + 10;
  const inserted = await supabase.from("caisse_lists").insert({ list_key: listKey, label: value, sort_order: sortOrder });
  if (inserted.error) {
    if (inserted.error.code === "23505") return fail("Cette valeur existe déjà dans la liste");
    return fail(inserted.error.message);
  }
  await logAction(supabase, "LIST_ADD", listKey, "", "Listes", `Ajout ${listKey}: ${value}`, null);
  refresh();
  return { ok: true, data: { message: `✅ « ${value} » ajouté`, label: value } };
}

export async function removeCaisseListItem(
  listKey: CaisseListKey,
  label: string,
): Promise<ActionResult<{ message: string }>> {
  const gate = await clientOrError();
  if ("ok" in gate) return gate;
  const { supabase, flags } = gate;
  if (!flags.canManageLists) return fail("Réservé à l’administrateur caisse ou à la personne déléguée (Listes)");
  if (!LIST_KEYS.includes(listKey)) return fail("Liste inconnue");
  const value = normalizeListLabel(label);
  if (!value) return fail("Libellé invalide");
  if (listKey === "AFFECTATION" && value.toUpperCase() === "PARC ROULANT") {
    return fail("PARC ROULANT est une affectation système et ne peut pas être retirée");
  }
  const removed = await supabase.from("caisse_lists").delete().eq("list_key", listKey).eq("label", value);
  if (removed.error) return fail(removed.error.message);
  await logAction(supabase, "LIST_DEL", listKey, "", "Listes", `Retrait ${listKey}: ${value}`, null);
  refresh();
  return { ok: true, data: { message: `✅ « ${value} » retiré de la liste` } };
}

export async function renameCaisseListItem(
  listKey: CaisseListKey,
  oldLabel: string,
  newLabel: string,
): Promise<ActionResult<{ message: string; label: string }>> {
  const gate = await clientOrError();
  if ("ok" in gate) return gate;
  const { supabase, flags } = gate;
  if (!flags.canManageLists) return fail("Réservé à l’administrateur caisse ou à la personne déléguée (Listes)");
  if (!LIST_KEYS.includes(listKey)) return fail("Liste inconnue");
  const from = normalizeListLabel(oldLabel);
  const to = normalizeListLabel(newLabel);
  if (!from || !to || to.length > 120) return fail("Libellé invalide (1 à 120 caractères)");
  if (from === to) return { ok: true, data: { message: "Aucun changement", label: to } };
  if (listKey === "AFFECTATION" && from.toUpperCase() === "PARC ROULANT") {
    return fail("PARC ROULANT est une affectation système et ne peut pas être renommée");
  }
  const renamed = await supabase.rpc("caisse_rename_list_item", {
    p_list_key: listKey,
    p_old: from,
    p_new: to,
  });
  if (renamed.error) return fail(renamed.error.message);
  await logAction(supabase, "LIST_EDIT", listKey, "", "Listes", `Rename ${listKey}: ${from} → ${to}`, null);
  refresh();
  return { ok: true, data: { message: `✅ « ${from} » → « ${to} »`, label: to } };
}

export async function getCaisseAudit(): Promise<ActionResult<CaisseAuditRow[]>> {
  const gate = await clientOrError();
  if ("ok" in gate) return gate;
  const { supabase, flags } = gate;
  if (!flags.isAdmin) return fail("Réservé à l’administrateur");
  const { data, error } = await supabase.from("caisse_audit").select("at, user_name, action, kind, op_number, sheet_name, detail, amount").order("at", { ascending: false }).limit(150);
  if (error) return fail(error.message);
  return {
    ok: true,
    data: (data ?? []).map((row) => ({
      when: new Intl.DateTimeFormat("fr-FR", {
        timeZone: "Africa/Algiers",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }).format(new Date(row.at)),
      user: row.user_name,
      action: row.action,
      type: row.kind,
      op: row.op_number,
      sheet: row.sheet_name,
      detail: row.detail,
      amount: asNumber(row.amount),
    })),
  };
}
