"use server";

import { revalidatePath } from "next/cache";
import { getWorkspaceProfile } from "@/lib/auth/get-workspace";
import {
  algiersToday,
  computeSoldesBundle,
  isCaissePrincipaleName,
  OPENING_BALANCE_DATE,
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
  CloseStatus,
  FinanceInput,
  JournalLine,
  PurchaseInput,
} from "@/lib/caisse/types";
import { createClient } from "@/lib/supabase/server";

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
  const [manageOpenings, manageLists] = await Promise.all([
    supabase.rpc("caisse_can_manage_openings"),
    supabase.rpc("caisse_can_manage_lists"),
  ]);
  return {
    supabase,
    today: String(ctx.today || algiersToday()),
    solde: Number(ctx.solde) || 0,
    userId: workspace.id,
    flags: {
      isAdmin: !!ctx.isAdmin,
      isMaster: !!ctx.isMaster,
      isUnlimited: !!ctx.isUnlimited,
      canSeeAllJournal: !!ctx.canSeeAllJournal,
      canSeeCaisse: !!ctx.canSeeCaisse,
      canManage: !!ctx.canManage,
      // Caisse admin (SUPER_ADMIN / ADMIN_FINANCE) or a delegated « Ouverture » right.
      canManageOpenings: !!ctx.isAdmin || (!manageOpenings.error && !!manageOpenings.data),
      canManageLists: !!ctx.isAdmin || (!manageLists.error && !!manageLists.data),
      userName: String(ctx.userName || workspace.fullName),
    },
  };
}

function asNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function toJournal(op: OperationRow): { lines: JournalLine[]; money: MoneyRow } {
  const lines = [...(op.lines || [])].sort((a, b) => a.line_no - b.line_no);
  const grand = lines.reduce((sum, line) => sum + Number(line.qty) * Number(line.unit_price), 0);
  const sheetName = sheetNameFromIso(op.op_date);
  const journal = lines.map((line, index) => {
    const isFirst = index === 0;
    const lineTotal = Number(line.qty) * Number(line.unit_price);
    return {
      operationId: op.id,
      lineNo: line.line_no,
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
      bon: op.bon_label || "",
      hasPhoto: isFirst && !!op.has_photo,
      bonMatchStatus: isFirst
        ? ((op.bon_match_status as JournalLine["bonMatchStatus"]) ?? null)
        : null,
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
 * After insert/update, N° may change once operations are ordered by op_date.
 * Falls back to fallbackOp if renumber fails so a successful write is never reported as lost.
 */
async function refreshOperationNumber(
  supabase: ServerClient,
  operationId: string,
  fallbackOp: number,
): Promise<{ op: number; renumbered: boolean; warning?: string }> {
  const renumbered = await supabase.rpc("caisse_renumber_active_operations");
  if (renumbered.error) {
    return { op: fallbackOp, renumbered: false, warning: renumbered.error.message };
  }
  const row = await supabase.from("caisse_operations").select("op_number").eq("id", operationId).maybeSingle();
  if (row.error || row.data?.op_number == null) {
    return { op: fallbackOp, renumbered: false, warning: row.error?.message || "N° final introuvable" };
  }
  return { op: Number(row.data.op_number), renumbered: true };
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
    if (photo.length > 1_500_000) return { data: null, label: "", error: "Bon trop lourd (1 Mo maximum)." };
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

  const opsSelectWithMatch =
    "id, op_number, kind, op_date, affectation, matricule, buyer_name, bon_label, has_photo, bon_match_status, method, reference, lines:caisse_lines(line_no, designation, item_val, unit, qty, unit_price)";
  const opsSelectLegacy =
    "id, op_number, kind, op_date, affectation, matricule, buyer_name, bon_label, has_photo, method, reference, lines:caisse_lines(line_no, designation, item_val, unit, qty, unit_price)";
  let opsRes: { data: unknown; error: { message: string } | null } = await supabase
    .from("caisse_operations")
    .select(opsSelectWithMatch)
    .order("op_date", { ascending: false })
    .limit(3000);
  if (opsRes.error && /bon_match_status/i.test(opsRes.error.message)) {
    opsRes = await supabase
      .from("caisse_operations")
      .select(opsSelectLegacy)
      .order("op_date", { ascending: false })
      .limit(3000);
  }
  const [openRes, listRes, buyerRes, closeRes] = await Promise.all([
    supabase.from("caisse_journal_openings").select("buyer_name, amount"),
    supabase.from("caisse_lists").select("list_key, label, sort_order").order("sort_order"),
    supabase.from("caisse_journal_buyers").select("name").eq("active", true),
    flags.canSeeCaisse || flags.isAdmin
      ? supabase.from("caisse_journal_closures").select("*").eq("op_date", today).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (opsRes.error) return fail(opsRes.error.message);
  if (openRes.error) return fail(openRes.error.message);
  if (listRes.error) return fail(listRes.error.message);

  const operations = (opsRes.data ?? []) as OperationRow[];
  const built = operations.map(toJournal);
  const allLines = built.flatMap((entry) => entry.lines);
  allLines.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    if (a.op !== b.op) return b.op - a.op;
    return a.lineNo - b.lineNo;
  });
  const money = built.map((entry) => entry.money);
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
  const months = [...new Set(allLines.map((line) => line.sheetName).filter((name) => name && name !== "—"))];
  if (!months.includes(sheetNameFromIso(today))) months.push(sheetNameFromIso(today));
  months.sort((a, b) => monthSortKey(b) - monthSortKey(a));
  const table = allLines.filter((line) => {
    if (month !== "TOUS" && line.sheetName !== month) return false;
    if (buyer !== "TOUS" && line.buyer !== buyer) return false;
    if (type !== "TOUS" && line.type !== type) return false;
    return true;
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
      months,
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
      let photoData = photo.data;
      if (!photoData && input.items.some((item) => item.keepPhoto)) {
        const existing = await supabase
          .from("caisse_operations")
          .select("photo_data, bon_label, bon_match_status")
          .eq("id", input.operationId)
          .maybeSingle();
        if (existing.error) return fail(existing.error.message);
        photoData = existing.data?.photo_data ?? null;
        if (!photoData) return fail("❌ Photo du bon obligatoire (au moins une par opération)");
        if (matchStatus == null) {
          matchStatus = normalizeBonMatchStatus(
            existing.data?.bon_match_status as PurchaseInput["bonMatchStatus"],
          );
        }
      }
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
      const numbered = await refreshOperationNumber(supabase, input.operationId, updated.data.op_number);
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
      return { ok: true, data: { message: `✅ Opération N° ${numbered.op} mise à jour.` } };
    }
    const inserted = await supabase
      .from("caisse_operations")
      .insert({ ...header, created_by: userId })
      .select("id, op_number")
      .maybeSingle();
    if (inserted.error) return fail(`❌ ${inserted.error.message}`);
    if (!inserted.data) return fail("❌ Enregistrement refusé.");
    await writeLines(supabase, inserted.data.id, "ACHAT", input.items);
    const numbered = await refreshOperationNumber(supabase, inserted.data.id, inserted.data.op_number);
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
        message: `✅ Opération effectuée avec succès (N° ${numbered.op} → ${sheetNameFromIso(input.date)})`,
      },
    };
  } catch (error) {
    return fail(error instanceof Error ? `❌ ${error.message}` : "❌ Erreur");
  }
}

export async function saveCaisseFinance(input: FinanceInput): Promise<ActionResult<{ message: string }>> {
  const gate = await clientOrError();
  if ("ok" in gate) return gate;
  const { supabase, flags, userId } = gate;
  if (!flags.canSeeCaisse && !flags.isAdmin) return fail("❌ Accès caisse requis");
  if (!ISO_DATE.test(input.date || "")) return fail("❌ Date invalide");
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) return fail("❌ Montant invalide");
  const kind = input.type === "IN" ? "ALIMENTATION" : "AVANCE";
  const beneficiary = input.type === "IN" ? "Caisse Principale" : input.beneficiary?.trim() || "";
  if (input.type === "OUT" && !beneficiary) return fail("❌ Choisissez un bénéficiaire");
  const header = {
    kind,
    op_date: input.date,
    affectation: kind === "ALIMENTATION" ? "CAISSE CENTRALE" : "AVANCE CAISSE",
    matricule: "",
    buyer_name: beneficiary,
    bon_label: "",
    photo_data: null,
    method: input.type === "IN" ? input.method || "Espèces" : "Espèces",
    reference: input.type === "IN" ? input.ref || "" : "-",
  };
  const line = {
    desc: kind === "ALIMENTATION" ? `Alimentation (${header.method || ""}) ${header.reference || ""}`.trim() : `RECEPTION (${beneficiary})`,
    itemVal: "",
    unit: "U",
    qte: 1,
    price: amount,
  };
  try {
    if (input.operationId) {
      if (!flags.canManage) return fail("❌ Accès réservé : droit Modifier/Supprimer requis.");
      const updated = await supabase.from("caisse_operations").update(header).eq("id", input.operationId).select("id, op_number").maybeSingle();
      if (updated.error) return fail(`❌ ${updated.error.message}`);
      if (!updated.data) return fail("❌ Opération introuvable.");
      const removed = await supabase.from("caisse_lines").delete().eq("operation_id", input.operationId);
      if (removed.error) return fail(removed.error.message);
      await writeLines(supabase, input.operationId, kind, [line]);
      const numbered = await refreshOperationNumber(supabase, input.operationId, updated.data.op_number);
      await logAction(supabase, "UPDATE", kind, numbered.op, sheetNameFromIso(input.date), `Modification caisse | ${beneficiary}`, amount);
      refresh();
      return { ok: true, data: { message: `✅ Mouvement de caisse N° ${numbered.op} mis à jour.` } };
    }
    const inserted = await supabase.from("caisse_operations").insert({ ...header, created_by: userId }).select("id, op_number").maybeSingle();
    if (inserted.error) return fail(`❌ ${inserted.error.message}`);
    if (!inserted.data) return fail("❌ Enregistrement refusé.");
    await writeLines(supabase, inserted.data.id, kind, [line]);
    const numbered = await refreshOperationNumber(supabase, inserted.data.id, inserted.data.op_number);
    const { data: solde } = await supabase.rpc("caisse_system_solde");
    await logAction(
      supabase,
      "CAISSE",
      kind,
      numbered.op,
      "Caisse_Centrale",
      kind === "ALIMENTATION" ? "Alimentation Caisse" : `Transfert vers: ${beneficiary}`,
      amount,
    );
    refresh();
    const balance = Number(solde) || 0;
    const message =
      kind === "ALIMENTATION"
        ? `✅ Alimentation enregistrée (n° ${numbered.op}) — Solde: ${balance.toFixed(2)} DA`
        : `✅ Transfert vers ${beneficiary} (n° ${numbered.op})\n(✅ Tiré vers: ${sheetNameFromIso(input.date)})`;
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
  const existing = await supabase.from("caisse_operations").select("id, op_number, kind, op_date").eq("id", operationId).maybeSingle();
  if (existing.error) return fail(existing.error.message);
  if (!existing.data) return fail("❌ Opération introuvable.");
  const updated = await supabase.rpc("caisse_void_operation", { p_id: operationId });
  if (updated.error) return fail(`❌ ${updated.error.message}`);
  await logAction(
    supabase,
    "DELETE",
    existing.data.kind,
    existing.data.op_number,
    sheetNameFromIso(existing.data.op_date),
    "Suppression définitive",
    null,
  );
  refresh();
  return {
    ok: true,
    data: { message: `✅ Opération N° ${existing.data.op_number} supprimée. Les numéros ont été réordonnés.` },
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
  const [usersRes, buyersRes, openingsRes, rightsRes, settingsRes, listsRes] = await Promise.all([
    supabase.rpc("caisse_admin_users"),
    supabase.from("caisse_journal_buyers").select("id, name, email, user_id, dates_libres, buy_for_others, see_all, caisse_ops, can_edit, active"),
    supabase.from("caisse_journal_openings").select("buyer_name, amount"),
    supabase.from("caisse_rights").select("user_id, manage_openings, manage_lists, caisse_active"),
    supabase.from("caisse_settings").select("opening_date").eq("id", 1).maybeSingle(),
    supabase.from("caisse_lists").select("list_key, label, sort_order").order("sort_order"),
  ]);
  if (usersRes.error) return fail(usersRes.error.message);
  if (buyersRes.error) return fail(buyersRes.error.message);
  if (openingsRes.error) return fail(openingsRes.error.message);
  if (listsRes.error) return fail(listsRes.error.message);
  const linked = new Set((buyersRes.data ?? []).map((row) => row.user_id).filter(Boolean));
  const rightsByUser = new Map(
    (rightsRes.error ? [] : (rightsRes.data ?? [])).map((row) => [
      row.user_id,
      {
        manageOpenings: !!row.manage_openings,
        manageLists: !!row.manage_lists,
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
    buyerId: null,
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
  }));
  for (const buyer of buyersRes.data ?? []) {
    if (buyer.user_id && linked.has(buyer.user_id)) continue;
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
    if (row.userId) {
      const saved = await supabase.from("caisse_rights").upsert({
        user_id: row.userId,
        dates_libres: !!row.datesLibres,
        buy_for_others: !!row.buyForOthers,
        see_all: !!row.seeAll,
        caisse_ops: !!row.caisseOps,
        can_edit: !!row.canEdit,
        manage_openings: !!row.manageOpenings,
        manage_lists: !!row.manageLists,
        caisse_active: row.active !== false,
      });
      if (saved.error) return fail(saved.error.message);
    } else if (row.buyerId) {
      const saved = await supabase
        .from("caisse_journal_buyers")
        .update({
          email: row.email || null,
          dates_libres: !!row.datesLibres,
          buy_for_others: !!row.buyForOthers,
          see_all: !!row.seeAll,
          caisse_ops: !!row.caisseOps,
          can_edit: !!row.canEdit,
          active: row.active !== false,
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
