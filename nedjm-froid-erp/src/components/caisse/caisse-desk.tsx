"use client";

import { useEffect, useMemo, useState } from "react";
import { logoutAction } from "@/lib/actions/auth";
import {
  addCaisseBuyer,
  addCaisseListItem,
  closeCaisseDay,
  confirmCaisseBonMatch,
  deleteCaisseBuyer,
  deleteCaisseOperation,
  getCaisseAdmin,
  getCaisseAudit,
  getCaisseClose,
  getCaisseDashboard,
  getCaisseOpeningForm,
  getCaissePhoto,
  removeCaisseListItem,
  saveCaisseFinance,
  saveCaisseOpenings,
  saveCaissePurchase,
  saveCaisseRights,
  setCaisseBuyerActive,
  unlockCaisseDay,
  updateCaisseBuyerProfile,
} from "@/lib/actions/caisse";
import { CaisseBulkBonsPanel } from "@/components/caisse/caisse-bulk-bons";
import { bonExtractNeedsAi, evaluateBonMatch, type BonCheckStatus } from "@/lib/caisse/bon-check";
import { prepareAndReadBon } from "@/lib/caisse/bon-ocr";
import { readCaisseBonWithAi } from "@/lib/actions/caisse";
import { formatDa, formatDateFr, isCaissePrincipaleName, recomputePeriodFromDates } from "@/lib/caisse/soldes";
import type { CaisseAdminUser, CaisseAuditRow, CaisseDashboard, CloseStatus, JournalLine, PurchaseItemInput } from "@/lib/caisse/types";
import "./caisse.css";

const INACTIVITY_MS = 5 * 60 * 1000;

type ItemDraft = {
  desc: string;
  itemVal: string;
  unit: string;
  qte: string;
  price: string;
  photoName: string;
  photoDataUrl: string;
  keepPhoto: boolean;
  bonStatus: BonCheckStatus;
  bonMessage: string;
  bonDetectedDate: string | null;
  bonDetectedAmount: number | null;
  bonCandidateDates: string[];
  bonCandidateAmounts: number[];
  bonRawText: string;
};

type Toast = { title: string; text: string };
type Ask = { title: string; text: string; confirm: string; reason?: boolean; resolve: (value: string | null) => void };

function emptyItem(unit: string): ItemDraft {
  return {
    desc: "",
    itemVal: "",
    unit: unit || "U",
    qte: "",
    price: "",
    photoName: "",
    photoDataUrl: "",
    keepPhoto: false,
    bonStatus: "idle",
    bonMessage: "",
    bonDetectedDate: null,
    bonDetectedAmount: null,
    bonCandidateDates: [],
    bonCandidateAmounts: [],
    bonRawText: "",
  };
}

function moneyClass(value: number): string {
  if (value > 0) return "pos";
  if (value < 0) return "neg";
  return "";
}

export function CaisseDesk({ initial, loadError }: { initial: CaisseDashboard | null; loadError?: string }) {
  const [data, setData] = useState<CaisseDashboard | null>(initial);
  const [error, setError] = useState(loadError || "");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const [ask, setAsk] = useState<Ask | null>(null);
  const [reason, setReason] = useState("");
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [datedSummary, setDatedSummary] = useState(false);
  const [opOpen, setOpOpen] = useState(false);
  const [editId, setEditId] = useState("");
  const [editOp, setEditOp] = useState<number | null>(null);
  const [opDate, setOpDate] = useState("");
  const [affectation, setAffectation] = useState("");
  const [matricule, setMatricule] = useState("");
  const [buyer, setBuyer] = useState("");
  const [items, setItems] = useState<ItemDraft[]>([]);
  const [financeOpen, setFinanceOpen] = useState(false);
  const [financeEdit, setFinanceEdit] = useState("");
  const [finType, setFinType] = useState<"IN" | "OUT">("IN");
  const [finDate, setFinDate] = useState("");
  const [finAmount, setFinAmount] = useState("");
  const [finMethod, setFinMethod] = useState("Espèces");
  const [finRef, setFinRef] = useState("");
  const [finBuyer, setFinBuyer] = useState("");
  const [closeOpen, setCloseOpen] = useState(false);
  const [closeState, setCloseState] = useState<CloseStatus | null>(null);
  const [physical, setPhysical] = useState("");
  const [closeNote, setCloseNote] = useState("");
  const [adminOpen, setAdminOpen] = useState(false);
  const [bulkBonsOpen, setBulkBonsOpen] = useState(false);
  const [openingsOnly, setOpeningsOnly] = useState(false);
  const [listsOnly, setListsOnly] = useState(false);
  const [openingDate, setOpeningDate] = useState(initial?.openingDate ?? "");
  const [adminUsers, setAdminUsers] = useState<CaisseAdminUser[]>([]);
  const [openings, setOpenings] = useState<{ name: string; amount: string }[]>([]);
  const [adminLists, setAdminLists] = useState<{ affectations: string[]; units: string[]; matricules: string[] }>({
    affectations: [],
    units: [],
    matricules: [],
  });
  const [listDraft, setListDraft] = useState({ affectation: "", unit: "", matricule: "" });
  const [listSearch, setListSearch] = useState({ affectation: "", unit: "", matricule: "" });
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPass, setNewPass] = useState("");
  const [newAccess, setNewAccess] = useState("");
  const [newRole, setNewRole] = useState("");
  const [newJournal, setNewJournal] = useState("");
  const [newCaisse, setNewCaisse] = useState("");
  const [newEdit, setNewEdit] = useState("");
  const [auditOpen, setAuditOpen] = useState(false);
  const [auditRows, setAuditRows] = useState<CaisseAuditRow[]>([]);
  const [photoUrl, setPhotoUrl] = useState("");
  const [photoArchiveName, setPhotoArchiveName] = useState("");

  const flags = data?.flags;
  const today = data?.today || "";

  function notify(title: string, text = "") {
    setToast({ title, text });
    window.setTimeout(() => setToast(null), 2800);
  }

  function confirmBox(title: string, text: string, confirm: string, withReason = false) {
    return new Promise<string | null>((resolve) => {
      setReason("");
      setAsk({ title, text, confirm, reason: withReason, resolve });
    });
  }

  async function reload(next?: { month?: string; buyer?: string; type?: string }) {
    setBusy(true);
    const result = await getCaisseDashboard({
      month: next?.month ?? data?.month ?? "CURRENT",
      buyer: next?.buyer ?? data?.buyer ?? "TOUS",
      type: next?.type ?? data?.type ?? "TOUS",
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      notify("Chargement", result.error);
      return;
    }
    setError("");
    setData(result.data);
    setDatedSummary(false);
  }

  useEffect(() => {
    let timer = window.setTimeout(() => void logoutAction(), INACTIVITY_MS);
    const reset = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void logoutAction(), INACTIVITY_MS);
    };
    const events = ["mousemove", "mousedown", "keypress", "scroll", "touchstart"] as const;
    events.forEach((event) => document.addEventListener(event, reset, true));
    return () => {
      window.clearTimeout(timer);
      events.forEach((event) => document.removeEventListener(event, reset, true));
    };
  }, []);

  const summary = useMemo(() => {
    if (!data) return null;
    if (datedSummary && dateFrom && dateTo) {
      return recomputePeriodFromDates({
        rows: data.moneyRows,
        openings: data.openings,
        fallbackOuverture: data.periodSummary.ouverture,
        from: dateFrom,
        to: dateTo,
        buyer: data.buyer,
        viewer: data.flags.userName,
        seeAll: data.flags.canSeeAllJournal || data.flags.isAdmin,
      });
    }
    return data.periodSummary;
  }, [data, datedSummary, dateFrom, dateTo]);

  const visibleRows = useMemo(() => {
    const rows = data?.rows ?? [];
    const query = search.trim().toLowerCase();
    return rows.filter((row) => {
      const text = `${row.op} ${row.date} ${row.type} ${row.affectation} ${row.desc} ${row.buyer} ${row.bon}`.toLowerCase();
      if (query && !text.includes(query)) return false;
      if (dateFrom && row.date < dateFrom) return false;
      if (dateTo && row.date > dateTo) return false;
      return true;
    });
  }, [data, search, dateFrom, dateTo]);

  function openOperation() {
    if (!data || !flags) return;
    setEditId("");
    setEditOp(null);
    setOpDate(today);
    setAffectation("");
    setMatricule("");
    setBuyer(flags.userName);
    setItems([emptyItem(data.units[0] || "U")]);
    setOpOpen(true);
  }

  function openEdit(line: JournalLine) {
    if (!data || !flags?.canManage) {
      notify("Accès", "Droit Modifier/Supprimer requis");
      return;
    }
    const lines = data.rows.filter((row) => row.operationId === line.operationId).sort((a, b) => a.lineNo - b.lineNo);
    if (!lines.length) {
      notify("Erreur", "Opération introuvable");
      return;
    }
    if (line.type !== "ACHAT") {
      setFinanceEdit(line.operationId);
      setFinType(line.type === "ALIMENTATION" ? "IN" : "OUT");
      setFinDate(line.date);
      setFinAmount(String(line.recettes ?? line.prixBon ?? ""));
      setFinBuyer(line.buyer);
      setFinMethod("Espèces");
      setFinRef("");
      setFinanceOpen(true);
      return;
    }
    setEditId(line.operationId);
    setEditOp(line.op);
    setOpDate(line.date);
    setAffectation(line.affectation);
    setMatricule(line.matricule);
    setBuyer(line.buyer);
    setItems(
      lines.map((row) => ({
        ...emptyItem(row.unit || data.units[0] || "U"),
        desc: row.desc,
        itemVal: row.itemVal,
        unit: row.unit || data.units[0] || "U",
        qte: String(row.qty ?? ""),
        price: row.price == null ? "" : String(row.price),
        photoName: row.hasPhoto ? "Bon actuel" : "",
        photoDataUrl: "",
        keepPhoto: row.hasPhoto,
        bonStatus: row.hasPhoto ? (row.bonMatchStatus || "unknown") : "idle",
        bonMessage: row.hasPhoto
          ? row.bonMatchStatus === "ok"
            ? "Bon existant conforme."
            : row.bonMatchStatus === "bad" || row.bonMatchStatus === "warn"
              ? "Bon existant avec écart — rechargez pour recontrôler."
              : "Bon existant — rechargez le fichier pour contrôler date/montant."
          : "",
      })),
    );
    setOpOpen(true);
  }

  async function saveOperation() {
    if (!data || !flags) return;
    const contrat = affectation.toUpperCase().startsWith("CONTRAT");
    const pending: PurchaseItemInput[] = [];
    for (const item of items) {
      if (!item.desc && !item.qte && !item.price && !item.photoDataUrl && !item.keepPhoto) continue;
      pending.push({
        desc: item.desc.trim(),
        itemVal: item.itemVal.trim(),
        unit: item.unit || "U",
        qte: Number(item.qte),
        price: Number(item.price),
        photoDataUrl: item.photoDataUrl || null,
        keepPhoto: item.keepPhoto,
      });
      if (!item.desc.trim() || !item.qte || !item.price || (contrat && !item.itemVal.trim())) {
        notify("Attention", "Complétez désignation, quantité et prix");
        return;
      }
    }
    if (!opDate) return notify("Attention", "Choisissez une date");
    if (!affectation) return notify("Attention", "Choisissez une Affectation");
    if (affectation === "PARC ROULANT" && !matricule) return notify("Attention", "Sélectionnez le matricule");
    if (!pending.length) return notify("Attention", "Ajoutez au moins un article");
    if (!pending.some((item) => item.photoDataUrl || item.keepPhoto)) {
      return notify("Attention", "Ajoutez au moins un bon (PDF ou image) pour cette opération (un seul suffit)");
    }
    const bonChecks = items.map((item) => resolveBonCheck(item));
    const bonWarn = bonChecks.find((check) => check.status === "bad" || check.status === "warn" || check.status === "unknown");
    const bonMatchStatus =
      bonChecks.find((check) => check.status === "bad" || check.status === "warn" || check.status === "ok" || check.status === "unknown")
        ?.status ?? null;
    setBusy(true);
    try {
      const result = await saveCaissePurchase({
        operationId: editId || undefined,
        date: opDate,
        affectation,
        immatriculation: matricule,
        buyer: flags.isMaster || flags.isAdmin ? buyer : null,
        items: pending,
        bonMatchStatus: bonMatchStatus === "checking" || bonMatchStatus === "idle" ? null : bonMatchStatus,
      });
      if (!result.ok) return notify("Résultat", result.error);
      if (bonWarn?.message) {
        notify("Enregistré avec avertissement", `${result.data.message}\n${bonWarn.message}`);
      } else {
        notify("Résultat", result.data.message);
      }
      setOpOpen(false);
      await reload();
    } catch (error) {
      notify("Résultat", error instanceof Error ? error.message : "Enregistrement interrompu. Vérifiez le journal puis réessayez.");
    } finally {
      setBusy(false);
    }
  }

  async function openFinance() {
    if (!data) return;
    const status = await getCaisseClose(today);
    if (status.ok && status.data.closed) {
      notify("Caisse clôturée", `La journée ${status.data.date} est clôturée.`);
      if (flags?.isAdmin) await openClose(status.data.date);
      return;
    }
    setFinanceEdit("");
    setFinType("IN");
    setFinDate(today);
    setFinAmount("");
    setFinMethod("Espèces");
    setFinRef("");
    setFinBuyer(data.userList[0] || "");
    setFinanceOpen(true);
  }

  async function saveFinance() {
    const amount = Number(finAmount);
    if (!Number.isFinite(amount) || amount <= 0) return notify("Erreur", "Montant invalide");
    if (finType === "OUT" && !finBuyer) return notify("Erreur", "Choisissez un bénéficiaire");
    setBusy(true);
    try {
      const result = await saveCaisseFinance({
        operationId: financeEdit || undefined,
        type: finType,
        date: finDate,
        amount,
        method: finMethod,
        ref: finRef,
        beneficiary: finBuyer,
      });
      if (!result.ok) return notify("Résultat", result.error);
      notify("Résultat", result.data.message);
      setFinanceOpen(false);
      await reload();
    } catch (error) {
      notify("Résultat", error instanceof Error ? error.message : "Enregistrement interrompu. Vérifiez le journal puis réessayez.");
    } finally {
      setBusy(false);
    }
  }

  async function removeOperation(line: JournalLine) {
    if (!flags?.canManage) return notify("Accès", "Droit Modifier/Supprimer requis");
    const answer = await confirmBox("Supprimer ?", `L'opération N° ${line.op} sera supprimée définitivement.`, "Oui, supprimer");
    if (answer === null) return;
    setBusy(true);
    const result = await deleteCaisseOperation(line.operationId);
    setBusy(false);
    notify("Résultat", result.ok ? result.data.message : result.error);
    if (result.ok) await reload();
  }

  async function openClose(date?: string) {
    const result = await getCaisseClose(date || today);
    if (!result.ok) return notify("Clôture", result.error);
    setCloseState(result.data);
    setPhysical(result.data.physicalSolde == null ? "" : String(result.data.physicalSolde));
    setCloseNote(result.data.note);
    setCloseOpen(true);
  }

  async function confirmClose() {
    if (!closeState) return;
    if (physical === "" || Number.isNaN(Number(physical))) return notify("Info", "Saisissez le solde physique compté");
    const answer = await confirmBox(
      "Clôturer cette journée ?",
      "Les opérations caisse (alimentation / avance) seront bloquées pour cette date jusqu’à réouverture admin.",
      "Oui, clôturer",
    );
    if (answer === null) return;
    setBusy(true);
    const result = await closeCaisseDay({ date: closeState.date, physical: Number(physical), note: closeNote.trim() });
    setBusy(false);
    notify("Clôture", result.ok ? result.data.message : result.error);
    if (result.ok) {
      setCloseOpen(false);
      await reload();
    }
  }

  async function reopen() {
    if (!closeState || !flags?.isAdmin) return notify("Accès", "Réservé à l’administrateur");
    const answer = await confirmBox("Rouvrir la caisse ?", "Motif (retard de travail, rattrapage...)", "Rouvrir", true);
    if (answer === null) return;
    const result = await unlockCaisseDay({ date: closeState.date, reason: answer || "Réouverture admin" });
    notify("Réouverture", result.ok ? result.data.message : result.error);
    if (result.ok) {
      await openClose(closeState.date);
      await reload();
    }
  }

  async function openAdmin() {
    const result = await getCaisseAdmin();
    if (!result.ok) return notify("Erreur", result.error);
    setAdminUsers(result.data.users);
    setOpenings(result.data.openings.map((row) => ({ name: row.name, amount: row.amount ? String(row.amount) : "" })));
    setOpeningDate(result.data.openingDate);
    setAdminLists(result.data.lists);
    setListDraft({ affectation: "", unit: "", matricule: "" });
    setListSearch({ affectation: "", unit: "", matricule: "" });
    setOpeningsOnly(false);
    setListsOnly(false);
    setAdminOpen(true);
  }

  async function openOpenings() {
    const result = await getCaisseOpeningForm();
    if (!result.ok) return notify("Erreur", result.error);
    setOpenings(result.data.openings.map((row) => ({ name: row.name, amount: row.amount ? String(row.amount) : "" })));
    setOpeningDate(result.data.openingDate);
    setOpeningsOnly(true);
    setListsOnly(false);
    setAdminOpen(true);
  }

  async function openLists() {
    if (flags?.isAdmin) {
      const result = await getCaisseAdmin();
      if (!result.ok) return notify("Erreur", result.error);
      setAdminLists(result.data.lists);
    } else if (data) {
      setAdminLists({
        affectations: data.affectations,
        units: data.units,
        matricules: data.matricules,
      });
    } else {
      return notify("Erreur", "Listes indisponibles");
    }
    setListDraft({ affectation: "", unit: "", matricule: "" });
    setListSearch({ affectation: "", unit: "", matricule: "" });
    setOpeningsOnly(false);
    setListsOnly(true);
    setAdminOpen(true);
  }

  async function addListValue(listKey: "AFFECTATION" | "UNIT" | "MATRICULE", raw: string) {
    const result = await addCaisseListItem(listKey, raw);
    notify("Listes", result.ok ? result.data.message : result.error);
    if (!result.ok) return null;
    await reload();
    if (listsOnly || flags?.isAdmin) {
      if (flags?.isAdmin && !listsOnly) await openAdmin();
      else await openLists();
    }
    return result.data.label;
  }

  async function removeListValue(listKey: "AFFECTATION" | "UNIT" | "MATRICULE", label: string) {
    const answer = await confirmBox("Retirer de la liste ?", `« ${label} » sera retiré de la liste déroulante.`, "Oui, retirer");
    if (answer === null) return;
    const result = await removeCaisseListItem(listKey, label);
    notify("Listes", result.ok ? result.data.message : result.error);
    if (!result.ok) return;
    await reload();
    if (affectation === label) setAffectation("");
    if (matricule === label) setMatricule("");
    if (listsOnly) await openLists();
    else if (flags?.isAdmin) await openAdmin();
  }

  async function pickOrAddList(
    listKey: "AFFECTATION" | "UNIT" | "MATRICULE",
    value: string,
    apply: (label: string) => void,
  ) {
    if (value !== "__ADD__") {
      apply(value);
      return;
    }
    if (!flags?.canManageLists) return;
    const title =
      listKey === "AFFECTATION" ? "Nouvelle affectation" : listKey === "MATRICULE" ? "Nouveau matricule" : "Nouvelle unité";
    const label = await confirmBox(title, "Saisissez le libellé à ajouter à la liste.", "Ajouter", true);
    if (label === null || !label.trim()) return;
    const created = await addListValue(listKey, label);
    if (created) apply(created);
  }

  async function saveRights() {
    const result = await saveCaisseRights(adminUsers);
    notify("Droits", result.ok ? result.data.message : result.error);
  }

  async function saveOpenings() {
    const payload = openings.map((row) => ({ name: row.name, amount: Number(row.amount) || 0 }));
    const kept = payload.filter((row) => row.amount > 0);
    const total = kept.reduce((sum, row) => sum + row.amount, 0);
    const answer = await confirmBox(
      "Modifier les soldes d’ouverture ?",
      `Date : ${formatDateFr(openingDate)}\n${kept.length} acheteur(s) avec solde\nTotal (= caisse ouverture) : ${formatDa(total)} DA\n\nLes montants à 0 ou vides seront retirés de l’ouverture.`,
      "Oui, enregistrer",
    );
    if (answer === null) return;
    const result = await saveCaisseOpenings(payload, openingDate);
    notify("Ouverture", result.ok ? result.data.message : result.error);
    if (result.ok) {
      if (openingsOnly) await openOpenings();
      else await openAdmin();
      await reload();
    }
  }

  async function addBuyer() {
    const result = await addCaisseBuyer({
      name: newName,
      email: newEmail,
      pass: newPass,
      access: newAccess,
      role: newRole,
      journal: newJournal,
      caisse: newCaisse,
      edit: newEdit,
    });
    notify("Utilisateur", result.ok ? result.data.message : result.error);
    if (result.ok) {
      setNewName("");
      setNewEmail("");
      setNewPass("");
      await openAdmin();
    }
  }

  async function editBuyer(user: CaisseAdminUser) {
    setReason(user.name);
    const nextName = await confirmBox(
      user.isAdmin ? "Modifier le nom admin" : "Modifier l’acheteur",
      `Nom actuel : ${user.name}\nEmail : ${user.email || "—"}\n\nSaisissez le nouveau nom (exact, tel qu’il doit apparaître dans le journal / listes acheteurs).${
        user.isAdmin ? "\nLes droits Admin restent inchangés." : ""
      }`,
      "Enregistrer",
      true,
    );
    if (nextName === null) return;
    const name = nextName.trim();
    if (!name) return notify("Attention", "Nom obligatoire");
    setReason(user.email || "");
    const nextEmail = await confirmBox(
      "Modifier l’email",
      `Laissez vide pour conserver « ${user.email || "—"} ».`,
      "Continuer",
      true,
    );
    if (nextEmail === null) return;
    const result = await updateCaisseBuyerProfile({
      userId: user.userId,
      buyerId: user.buyerId,
      name,
      email: nextEmail.trim() || user.email,
    });
    notify("Acheteur", result.ok ? result.data.message : result.error);
    if (result.ok) {
      await openAdmin();
      await reload();
    }
  }

  async function toggleBuyerActive(user: CaisseAdminUser) {
    if (user.isAdmin) return notify("Accès", "Le compte admin reste toujours actif.");
    const activate = !user.active;
    const answer = await confirmBox(
      activate ? "Réactiver l’acheteur ?" : "Désactiver l’acheteur ?",
      activate
        ? `« ${user.name} » réapparaîtra dans les listes acheteurs.`
        : `« ${user.name} » disparaîtra des listes acheteurs (opérations passées conservées).`,
      activate ? "Oui, réactiver" : "Oui, désactiver",
    );
    if (answer === null) return;
    const result = await setCaisseBuyerActive({
      userId: user.userId,
      buyerId: user.buyerId,
      active: activate,
    });
    notify("Acheteur", result.ok ? result.data.message : result.error);
    if (result.ok) {
      await openAdmin();
      await reload();
    }
  }

  async function removeBuyer(user: CaisseAdminUser) {
    if (user.isAdmin) return notify("Accès", "Impossible de supprimer un admin ici.");
    if (user.userId) {
      return notify(
        "Suppression",
        "Compte ERP lié : utilisez Désactiver. La suppression du compte se fait dans Paramètres → Utilisateurs.",
      );
    }
    const answer = await confirmBox(
      "Supprimer l’acheteur ?",
      `« ${user.name} » sera retiré définitivement s’il n’a aucune opération ni solde d’ouverture.`,
      "Oui, supprimer",
    );
    if (answer === null) return;
    const result = await deleteCaisseBuyer({ buyerId: user.buyerId });
    notify("Acheteur", result.ok ? result.data.message : result.error);
    if (result.ok) {
      await openAdmin();
      await reload();
    }
  }

  async function openAudit() {
    const result = await getCaisseAudit();
    if (!result.ok) return notify("Audit", result.error);
    setAuditRows(result.data);
    setAuditOpen(true);
  }

  async function showPhoto(operationId: string) {
    const result = await getCaissePhoto(operationId);
    if (!result.ok) return notify("Bon", result.error);
    setPhotoUrl(result.data.url);
    setPhotoArchiveName(result.data.archiveName || "");
  }

  function downloadPhotoArchive() {
    if (!photoUrl || !photoArchiveName) return;
    const link = document.createElement("a");
    link.href = photoUrl;
    const ext = photoUrl.startsWith("data:application/pdf")
      ? "pdf"
      : photoUrl.startsWith("data:image/png")
        ? "png"
        : "jpg";
    link.download = `${photoArchiveName}.${ext}`;
    link.click();
  }

  async function confirmBonMatch(operationId: string) {
    if (!flags?.isAdmin) return notify("Accès", "Réservé à l’administrateur");
    const answer = await confirmBox(
      "Valider le bon",
      "Confirmer que date et montant du bon correspondent à l’opération ? L’alerte couleur (rouge/orange) disparaîtra.",
      "Conforme",
    );
    if (!answer) return;
    setBusy(true);
    try {
      const result = await confirmCaisseBonMatch(operationId);
      notify("Bon", result.ok ? result.data.message : result.error);
      if (result.ok) await reload();
    } finally {
      setBusy(false);
    }
  }

  function exportPdf() {
    if (!visibleRows.length) return notify("Info", "Aucune opération");
    const escape = (value: unknown) => String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;");
    const body = visibleRows
      .map((row) => {
        const amount = row.type === "ACHAT" ? row.lineTotal : row.recettes;
        return `<tr><td>${escape(row.op)}</td><td>${escape(formatDateFr(row.date))}</td><td>${escape(row.type)}</td><td>${escape(row.affectation)}</td><td>${escape(row.desc)}</td><td>${escape(row.qty)}</td><td>${escape(row.price ?? "")}</td><td>${escape(amount ?? "")}</td><td>${escape(row.prixBon ?? "")}</td><td>${escape(row.buyer)}</td></tr>`;
      })
      .join("");
    const popup = window.open("", "_blank");
    if (!popup) return notify("Popup bloquée", "Autorisez les fenêtres");
    popup.document.write(`<!DOCTYPE html><html><head><title>Journal caisse</title><style>body{font-family:Arial;padding:20px}table{width:100%;border-collapse:collapse;font-size:11px}th,td{border:1px solid #ccc;padding:6px}th{background:#2d5a27;color:#fff}</style></head><body><h1>GESTION CAISSE 2026</h1><p>${flags?.userName ?? ""} · ${data?.month === "TOUS" ? "Tous les mois" : data?.month}</p><table><thead><tr><th>N°</th><th>Date</th><th>Type</th><th>Aff.</th><th>Désignation</th><th>Qté</th><th>Prix unitaire</th><th>Montant</th><th>Prix bon</th><th>Acheteur</th></tr></thead><tbody>${body}</tbody></table></body></html>`);
    popup.document.close();
    popup.focus();
    window.setTimeout(() => popup.print(), 250);
  }

  function exportXls() {
    if (!visibleRows.length) return notify("Info", "Aucune opération");
    const header = ["N°", "DATE", "TYPE", "AFFECTATION", "DÉSIGNATION", "QTÉ", "UNITÉ", "PRIX UNITAIRE", "MONTANT", "PRIX BON", "ACHETEUR", "BON"];
    const lines = visibleRows.map((row) => [
      row.op,
      formatDateFr(row.date),
      row.type,
      row.affectation,
      row.desc,
      row.qty,
      row.unit,
      row.price ?? "",
      row.type === "ACHAT" ? (row.lineTotal ?? "") : (row.recettes ?? ""),
      row.prixBon ?? "",
      row.buyer,
      row.bon,
    ]);
    const xml = `<?xml version="1.0"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet ss:Name="Caisse" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Table>${[header, ...lines]
      .map((cells) => `<Row>${cells.map((cell) => `<Cell><Data ss:Type="String">${String(cell).replace(/&/g, "&amp;").replace(/</g, "&lt;")}</Data></Cell>`).join("")}</Row>`)
      .join("")}</Table></Worksheet></Workbook>`;
    const blob = new Blob([xml], { type: "application/vnd.ms-excel" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "Journal_Caisse.xls";
    link.click();
    URL.revokeObjectURL(link.href);
  }

  const totalBon = items.reduce((sum, item) => sum + (Number(item.qte) || 0) * (Number(item.price) || 0), 0);
  const roleLabel = !flags ? "" : flags.isAdmin ? "ADMIN" : flags.canSeeAllJournal ? "JOURNAL" : flags.isMaster ? "MASTER" : "USER";
  const openingTotal = openings.reduce((sum, row) => sum + (Number(row.amount) > 0 ? Number(row.amount) : 0), 0);
  const ecart = closeState ? (physical === "" || Number.isNaN(Number(physical)) ? 0 : Number(physical) - closeState.systemSolde) : 0;
  const dateLocked = !!flags && !flags.isAdmin && !flags.isUnlimited && !editId;

  function resolveBonCheck(item: ItemDraft) {
    if (item.bonStatus === "idle" || item.bonStatus === "checking") {
      return { status: item.bonStatus, message: item.bonMessage };
    }
    if (
      item.bonCandidateDates.length ||
      item.bonCandidateAmounts.length ||
      item.bonDetectedDate != null ||
      item.bonDetectedAmount != null ||
      item.bonRawText
    ) {
      const checked = evaluateBonMatch({
        opDate,
        opAmount: totalBon,
        detectedDate: item.bonDetectedDate,
        detectedAmount: item.bonDetectedAmount,
        candidateDates: item.bonCandidateDates,
        candidateAmounts: item.bonCandidateAmounts,
        rawText: item.bonRawText,
      });
      return { status: checked.status, message: checked.message };
    }
    return { status: item.bonStatus, message: item.bonMessage };
  }

  async function attachBon(index: number, file: File | undefined) {
    if (!file) return;
    updateItem(index, {
      photoName: file.name,
      keepPhoto: false,
      bonStatus: "checking",
      bonMessage: "Lecture du bon (date + montant)…",
      bonDetectedDate: null,
      bonDetectedAmount: null,
      bonCandidateDates: [],
      bonCandidateAmounts: [],
      bonRawText: "",
    });
    try {
      const prepared = await prepareAndReadBon(file);
      let extract = prepared.extract;
      if (bonExtractNeedsAi(extract)) {
        const ai = await readCaisseBonWithAi({ photoDataUrl: prepared.dataUrl });
        if (ai.ok) {
          extract = {
            dates: [...new Set([...(ai.data.date ? [ai.data.date] : []), ...extract.dates])],
            amounts: [
              ...new Set([
                ...(ai.data.amounts || []),
                ...extract.amounts,
                ...(ai.data.amount != null ? [ai.data.amount] : []),
              ]),
            ],
            preferredDate: ai.data.date || extract.preferredDate,
            preferredAmount: ai.data.amount ?? extract.preferredAmount,
            rawText: extract.rawText,
          };
        }
      }
      const checked = evaluateBonMatch({
        opDate,
        opAmount: items.reduce((sum, item) => sum + (Number(item.qte) || 0) * (Number(item.price) || 0), 0),
        detectedDate: extract.preferredDate,
        detectedAmount: extract.preferredAmount,
        candidateDates: extract.dates,
        candidateAmounts: extract.amounts,
        rawText: prepared.rawText || extract.rawText,
      });
      updateItem(index, {
        photoDataUrl: prepared.dataUrl,
        photoName: file.name,
        keepPhoto: false,
        bonStatus: checked.status,
        bonMessage: checked.message,
        bonDetectedDate: checked.detectedDate,
        bonDetectedAmount: checked.detectedAmount,
        bonCandidateDates: extract.dates,
        bonCandidateAmounts: extract.amounts,
        bonRawText: prepared.rawText || extract.rawText || "",
      });
      if (checked.status === "bad" || checked.status === "warn" || checked.status === "unknown" || checked.status === "ok") {
        notify("Contrôle bon", checked.message);
      }
    } catch (error) {
      updateItem(index, {
        photoDataUrl: "",
        photoName: "",
        keepPhoto: false,
        bonStatus: "warn",
        bonMessage: error instanceof Error ? error.message : "Lecture du bon impossible",
        bonDetectedDate: null,
        bonDetectedAmount: null,
        bonCandidateDates: [],
        bonCandidateAmounts: [],
        bonRawText: "",
      });
      notify("Bon", error instanceof Error ? error.message : "Lecture du bon impossible");
    }
  }

  if (!data) {
    return (
      <div className="caisse-app">
        <div className="panel">{error || "Chargement de la caisse impossible."}</div>
      </div>
    );
  }

  return (
    <div className="caisse-app">
      <div className="caisse-bar">
        <div className="brand">GESTION CAISSE 2026</div>
        <div className="user-info">
          <span>{flags?.userName}</span>
          <span className="role-badge">{roleLabel}</span>
        </div>
      </div>

      <div className="kpi-grid">
        <div className="kpi-card solde">
          <div className="kpi-label">Caisse principale</div>
          <div className="kpi-value">{formatDa(data.solde)}</div>
          <small>Cash en caisse (Caisse_Centrale)</small>
        </div>
        <div className="kpi-card dep">
          <div className="kpi-label">Dépenses (achats)</div>
          <div className="kpi-value">{formatDa(data.totalDepenses)}</div>
          <small>Total ACHAT visible</small>
        </div>
        <div className="kpi-card av">
          <div className="kpi-label">Avances / Alimentations</div>
          <div className="kpi-value">{formatDa(data.totalAvances + data.totalAlim)}</div>
          <small>Sorties acheteurs + entrées caisse</small>
        </div>
      </div>

      {summary ? (
        <section className="panel">
          <div className="panel-head">
            <h6>Solde de la période</h6>
            <span className="pill">{summary.label}</span>
          </div>
          <div className="summary-grid">
            {[
              [`Ouverture · ${formatDateFr(data.openingDate)}`, summary.ouverture],
              ["Achats période", summary.achats],
              ["Avances période", summary.avances],
              ["Mouvement", summary.mouvement],
              ["Solde fin période", summary.soldeFin],
            ].map(([label, value]) => (
              <div className="summary-item" key={String(label)}>
                <span className="ps-label">{label}</span>
                <span className={`ps-value ${moneyClass(Number(value))}`}>{formatDa(Number(value))} DA</span>
              </div>
            ))}
          </div>
          <small className="hint">Mouvement = Avances − Achats sur la période · Solde fin = Ouverture {formatDateFr(data.openingDate)} + cumul jusqu’à la fin de la période</small>
        </section>
      ) : null}

      <section className="panel">
        <div className="panel-head">
          <h6>{flags?.canSeeAllJournal || flags?.isAdmin ? "Soldes par acheteur" : "Mon solde"}</h6>
          <small className="hint">Solde fin de période = Ouverture + cumul · Achats/Avances = période filtrée</small>
        </div>
        <div className="buyer-grid">
          {data.buyerBalances.filter((row) => !isCaissePrincipaleName(row.name)).map((row) => (
            <article className="buyer-card" key={row.name}>
              <div className="buyer-name">{row.name}</div>
              <div className={`buyer-solde ${moneyClass(row.solde)}`}>{formatDa(row.solde)} DA</div>
              <div className="buyer-meta">
                <span>Solde fin période</span>
                {row.ouverture ? <span>Ouverture : {formatDa(row.ouverture)} DA</span> : null}
                <span>Achats période : {formatDa(row.achats)} DA</span>
                <span>Avances période : {formatDa(row.avances)} DA</span>
                <span>Mouvement : {formatDa(row.mouvement)} DA</span>
              </div>
              <button
                type="button"
                className="btn-buyer"
                onClick={() => {
                  void reload({ buyer: row.name, month: data.month });
                }}
              >
                Voir ses achats
              </button>
            </article>
          ))}
          {!data.buyerBalances.length ? <p className="hint">Aucun acheteur sur cette période.</p> : null}
        </div>
      </section>

      {flags?.isAdmin || flags?.canSeeAllJournal ? (
        <section className="panel">
          <div className="panel-head">
            <h6>Solde par mois</h6>
            <small className="hint">Cumul chronologique depuis l’ouverture {formatDateFr(data.openingDate)}</small>
          </div>
          <table className="month-table">
            <thead>
              <tr><th>Mois</th><th>Achats</th><th>Avances</th><th>Mouvement</th><th>Solde fin</th></tr>
            </thead>
            <tbody>
              {data.monthlySoldes.map((row) => (
                <tr key={row.month} className={row.month === data.month ? "selected" : ""}>
                  <td>{row.month}</td>
                  <td>{formatDa(row.achats)}</td>
                  <td>{formatDa(row.avances)}</td>
                  <td className={moneyClass(row.mouvement)}>{formatDa(row.mouvement)}</td>
                  <td className={moneyClass(row.soldeFin)}>{formatDa(row.soldeFin)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

      {data.closeStatus ? (
        <div className={`banner ${data.closeStatus.closed ? "closed" : "open"}`}>
          <div>
            <strong>{data.closeStatus.closed ? `Caisse clôturée — ${data.closeStatus.date}` : `Caisse ouverte — ${data.closeStatus.date}`}</strong>
            <div className="hint">
              {data.closeStatus.closed
                ? `Système ${formatDa(data.closeStatus.systemSolde)} DA · Physique ${formatDa(data.closeStatus.physicalSolde || 0)} DA · Écart ${formatDa(data.closeStatus.ecart || 0)} DA`
                : `Solde système actuel : ${formatDa(data.closeStatus.systemSolde)} DA — à comparer avec le cash compté en fin de journée.`}
            </div>
          </div>
          <button type="button" className="btn-light" onClick={() => void openClose(data.closeStatus?.date)}>{data.closeStatus.closed ? "Gérer / Rouvrir" : "Clôturer"}</button>
        </div>
      ) : null}

      <div className="panel action-bar">
        <div className="toolbar">
          <button type="button" className="btn-action btn-green" onClick={openOperation}>OPÉRATION</button>
          {flags?.canSeeCaisse || flags?.isAdmin ? <button type="button" className="btn-action btn-purple" onClick={() => void openFinance()}>CAISSE</button> : null}
          {flags?.canSeeCaisse || flags?.isAdmin ? <button type="button" className="btn-action btn-teal" onClick={() => void openClose()}>CLÔTURE</button> : null}
          {flags?.isAdmin ? <button type="button" className="btn-action btn-navy" onClick={() => void openAdmin()}>ADMIN</button> : null}
          {flags?.isAdmin ? <button type="button" className="btn-action btn-purple" onClick={() => setBulkBonsOpen(true)}>BONS PDF</button> : null}
          {flags?.canManageOpenings && !flags?.isAdmin ? <button type="button" className="btn-action btn-navy" onClick={() => void openOpenings()}>OUVERTURE</button> : null}
          {flags?.canManageLists && !flags?.isAdmin ? <button type="button" className="btn-action btn-navy" onClick={() => void openLists()}>LISTES</button> : null}
          {flags?.isAdmin ? <button type="button" className="btn-action btn-brown" onClick={() => void openAudit()}>AUDIT</button> : null}
        </div>
        <div className="toolbar">
          <button type="button" className="btn-action btn-green" onClick={exportXls}>EXPORT</button>
          <button type="button" className="btn-light" onClick={exportPdf}>PDF</button>
        </div>
      </div>

      <div className="panel filter-bar">
        <div className="field">
          <label>Mois</label>
          <select value={data.month} onChange={(event) => void reload({ month: event.target.value })}>
            <option value="TOUS">Tous les mois</option>
            {data.months.map((month) => <option key={month} value={month}>{month}</option>)}
          </select>
        </div>
        {flags?.canSeeAllJournal || flags?.isAdmin ? (
          <div className="field">
            <label>Acheteur</label>
            <select value={data.buyer} onChange={(event) => void reload({ buyer: event.target.value })}>
              <option value="TOUS">Tous les acheteurs</option>
              {data.buyers.map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
          </div>
        ) : null}
        {flags?.canSeeCaisse || flags?.isAdmin ? (
          <div className="field">
            <label>Type</label>
            <select value={data.type} onChange={(event) => void reload({ type: event.target.value })}>
              <option value="TOUS">Tous types</option>
              <option value="ACHAT">ACHAT</option>
              <option value="AVANCE">AVANCE</option>
              <option value="ALIMENTATION">ALIMENTATION</option>
            </select>
          </div>
        ) : null}
        <div className="field">
          <label>Dates</label>
          <div className="toolbar">
            <input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
            <input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
            <button type="button" className="btn-light" onClick={() => { if (!dateFrom || !dateTo) return notify("Période", "Choisissez une date de début et de fin"); setDatedSummary(true); }}>Filtrer</button>
            <button type="button" className="btn-light" onClick={() => { setDateFrom(""); setDateTo(""); setSearch(""); setDatedSummary(false); }}>Réinitialiser</button>
          </div>
        </div>
        <div className="field">
          <label>Recherche</label>
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Rechercher..." />
        </div>
        <div className="count">{new Set(visibleRows.map((row) => row.op)).size} opération(s) · {visibleRows.length} ligne(s)</div>
      </div>

      <div className="panel ops-wrap">
        <table className="ops">
          <thead>
            <tr>
              {["N°", "DATE", "TYPE", "AFFECTATION", "DÉSIGNATION", "QTÉ", "UNITÉ", "PRIX UNITAIRE", "MONTANT", "PRIX BON", "ACHETEUR", "BON", "ACTION"].map((title) => <th key={title}>{title}</th>)}
            </tr>
          </thead>
          <tbody>
            {error ? <tr><td colSpan={13}>{error}</td></tr> : null}
            {!visibleRows.length && !error ? <tr><td colSpan={13}>Aucune opération</td></tr> : null}
            {visibleRows.map((row) => {
              const amount = row.type === "ACHAT" ? row.lineTotal : row.recettes;
              return (
                <tr key={`${row.operationId}-${row.lineNo}`} className={row.type === "ACHAT" ? "row-out" : "row-in"}>
                  <td>{row.op}</td>
                  <td>{formatDateFr(row.date)}</td>
                  <td><span className={`ops-type ${row.type === "AVANCE" ? "avance" : row.type === "ALIMENTATION" ? "alim" : ""}`}>{row.type}</span></td>
                  <td>{row.affectation}</td>
                  <td className="libelle">{row.desc}</td>
                  <td>{row.qty}</td>
                  <td>{row.unit}</td>
                  <td>{row.price == null ? "" : formatDa(row.price)}</td>
                  <td>{amount == null ? "" : formatDa(amount)}</td>
                  <td>{row.prixBon == null ? "" : formatDa(row.prixBon)}</td>
                  <td>{row.buyer}</td>
                  <td className={row.hasPhoto && row.bonMatchStatus && row.bonMatchStatus !== "ok" ? `bon-journal-cell ${row.bonMatchStatus}` : undefined}>
                    {row.hasPhoto ? (
                      <div className="bon-journal-actions">
                        <button
                          type="button"
                          className={`btn-light bon-journal-btn${row.bonMatchStatus && row.bonMatchStatus !== "ok" ? ` ${row.bonMatchStatus}` : ""}`}
                          title={
                            row.bonMatchStatus === "bad"
                              ? "Écart date et montant du bon"
                              : row.bonMatchStatus === "warn"
                                ? "Écart date ou montant du bon"
                                : row.bonMatchStatus === "unknown"
                                  ? "Bon à vérifier"
                                  : "Voir le bon"
                          }
                          onClick={() => void showPhoto(row.operationId)}
                        >
                          Voir
                        </button>
                        {flags?.isAdmin && row.isFirst && row.bonMatchStatus && row.bonMatchStatus !== "ok" ? (
                          <button
                            type="button"
                            className="btn-light bon-confirm-btn"
                            title="Valider manuellement le bon (admin)"
                            onClick={() => void confirmBonMatch(row.operationId)}
                          >
                            Conforme
                          </button>
                        ) : null}
                      </div>
                    ) : (
                      row.bon || "—"
                    )}
                  </td>
                  <td>
                    {flags?.canManage && row.isFirst ? (
                      <>
                        <button type="button" className="icon-btn" title="Modifier" onClick={() => openEdit(row)}>✎</button>
                        <button type="button" className="icon-btn" title="Supprimer" onClick={() => void removeOperation(row)}>🗑</button>
                      </>
                    ) : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {opOpen ? (
        <div className="overlay">
          <div className="modal">
            <div className="modal-head green">
              <strong>{editOp ? `Modifier opération N° ${editOp}` : "Nouvelle opération caisse"}</strong>
              <button type="button" className="close-x" onClick={() => setOpOpen(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="grid-3">
                <div className="field">
                  <label>Date</label>
                  <input type="date" value={opDate} min={dateLocked ? data.today && shift(data.today, -1) : undefined} max={dateLocked ? data.today : undefined} onChange={(event) => setOpDate(event.target.value)} />
                </div>
                <div className="field">
                  <label>Affectation</label>
                  <select value={affectation} onChange={(event) => void pickOrAddList("AFFECTATION", event.target.value, setAffectation)}>
                    <option value="">-- Sélectionner --</option>
                    {data.affectations.map((name) => <option key={name}>{name}</option>)}
                    {flags?.canManageLists ? <option value="__ADD__">+ Ajouter une affectation…</option> : null}
                  </select>
                </div>
                {flags?.isMaster || flags?.isAdmin ? (
                  <div className="field">
                    <label>Au nom de (Acheteur)</label>
                    <select value={buyer} onChange={(event) => setBuyer(event.target.value)}>
                      {data.userList.map((name) => <option key={name}>{name}</option>)}
                    </select>
                  </div>
                ) : null}
                {affectation === "PARC ROULANT" ? (
                  <div className="field">
                    <label>Matricule</label>
                    <select value={matricule} onChange={(event) => void pickOrAddList("MATRICULE", event.target.value, setMatricule)}>
                      <option value="">-- Sélectionner --</option>
                      {data.matricules.map((name) => <option key={name}>{name}</option>)}
                      {flags?.canManageLists ? <option value="__ADD__">+ Ajouter un matricule…</option> : null}
                    </select>
                  </div>
                ) : null}
              </div>
              <p className="hint">Détails des achats — 1 bon (PDF ou image) suffit. Vert = OK · Orange = date ou montant différent · Rouge = les deux différents (sans blocage).</p>
              <table>
                <thead><tr><th>Désignation</th><th>Item</th><th>Unité</th><th>Qté</th><th>Prix</th><th>Bon</th><th></th></tr></thead>
                <tbody>
                  {items.map((item, index) => {
                    const bon = resolveBonCheck(item);
                    return (
                    <tr key={index}>
                      <td><input value={item.desc} onChange={(event) => updateItem(index, { desc: event.target.value })} /></td>
                      <td><input value={item.itemVal} disabled={!affectation.toUpperCase().startsWith("CONTRAT")} onChange={(event) => updateItem(index, { itemVal: event.target.value })} /></td>
                      <td>
                        <select
                          value={item.unit}
                          onChange={(event) => {
                            void pickOrAddList("UNIT", event.target.value, (label) => updateItem(index, { unit: label }));
                          }}
                        >
                          {data.units.map((unit) => <option key={unit}>{unit}</option>)}
                          {flags?.canManageLists ? <option value="__ADD__">+ Ajouter…</option> : null}
                        </select>
                      </td>
                      <td><input type="number" min="0" step="any" value={item.qte} onChange={(event) => updateItem(index, { qte: event.target.value })} /></td>
                      <td><input type="number" min="0" step="any" value={item.price} onChange={(event) => updateItem(index, { price: event.target.value })} /></td>
                      <td>
                        <div className={`bon-cell ${bon.status !== "idle" ? bon.status : ""}`}>
                          <input
                            type="file"
                            accept="image/*,application/pdf,.pdf"
                            onChange={(event) => {
                              const file = event.target.files?.[0];
                              event.target.value = "";
                              void attachBon(index, file);
                            }}
                          />
                          <small>{item.photoName}</small>
                          {bon.message ? <span className="bon-check-msg">{bon.message}</span> : null}
                        </div>
                      </td>
                      <td><button type="button" className="btn-light" onClick={() => setItems((current) => current.length > 1 ? current.filter((_, i) => i !== index) : [emptyItem(data.units[0] || "U")])}>X</button></td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
              <button type="button" className="btn-light" onClick={() => setItems((current) => [...current, emptyItem(data.units[0] || "U")])}>+ Ajouter une ligne</button>
              <p style={{ textAlign: "right", fontWeight: 800 }}>Total Bon : <span className="neg">{totalBon.toFixed(2)}</span> DA</p>
              <div className="panel">
                <div className="hint">Aperçu immédiat</div>
                <table>
                  <thead><tr><th>N°</th><th>Date</th><th>Aff.</th><th>Désignation</th><th>Qté</th><th>Prix</th><th>Total</th><th>Acheteur</th><th>Bon</th></tr></thead>
                  <tbody>
                    {items.filter((item) => item.desc || item.qte || item.price || item.photoName).map((item, index) => {
                      const bon = resolveBonCheck(item);
                      return (
                      <tr key={index}>
                        <td>{editOp ?? "—"}</td>
                        <td>{formatDateFr(opDate)}</td>
                        <td>{affectation || "—"}</td>
                        <td className="libelle">{item.desc || "—"}</td>
                        <td>{item.qte || "—"}</td>
                        <td>{item.price ? formatDa(Number(item.price)) : "—"}</td>
                        <td>{index === 0 ? formatDa(totalBon) : "—"}</td>
                        <td>{buyer || flags?.userName}</td>
                        <td className={bon.status !== "idle" ? `preview-bon ${bon.status}` : undefined}>
                          {item.photoName || "—"}
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="modal-foot">
              <button type="button" className="btn-light" onClick={() => setOpOpen(false)}>Annuler</button>
              <button type="button" className="btn-action btn-green" onClick={() => void saveOperation()} disabled={busy}>{editId ? "Mettre à jour" : "ENREGISTRER"}</button>
            </div>
          </div>
        </div>
      ) : null}

      {financeOpen ? (
        <div className="overlay">
          <div className="modal narrow">
            <div className="modal-head navy">
              <strong>{financeEdit ? "Modifier caisse" : "Gestion caisse"}</strong>
              <button type="button" className="close-x" onClick={() => setFinanceOpen(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="field"><label>Type</label>
                <select value={finType} disabled={!!financeEdit} onChange={(event) => setFinType(event.target.value as "IN" | "OUT")}>
                  <option value="IN">Alimenter la caisse</option>
                  <option value="OUT">Donner à un acheteur</option>
                </select>
              </div>
              <div className="field"><label>Date</label><input type="date" value={finDate} onChange={(event) => setFinDate(event.target.value)} /></div>
              <div className="field"><label>Montant (DA)</label><input type="number" min="0" step="0.01" value={finAmount} onChange={(event) => setFinAmount(event.target.value)} /></div>
              {finType === "IN" ? (
                <>
                  <div className="field"><label>Moyen</label>
                    <select value={finMethod} onChange={(event) => setFinMethod(event.target.value)}>
                      <option>Espèces</option>
                      <option>Chèque / Virement</option>
                    </select>
                  </div>
                  <div className="field"><label>Référence</label><input value={finRef} onChange={(event) => setFinRef(event.target.value)} /></div>
                </>
              ) : (
                <div className="field"><label>Bénéficiaire</label>
                  <select value={finBuyer} onChange={(event) => setFinBuyer(event.target.value)}>
                    <option value="">-- Sélectionner --</option>
                    {data.userList.filter((name) => !isCaissePrincipaleName(name)).map((name) => <option key={name}>{name}</option>)}
                  </select>
                </div>
              )}
            </div>
            <div className="modal-foot">
              <button type="button" className="btn-light" onClick={() => setFinanceOpen(false)}>Annuler</button>
              <button type="button" className="btn-action btn-navy" onClick={() => void saveFinance()} disabled={busy}>Confirmer</button>
            </div>
          </div>
        </div>
      ) : null}

      {closeOpen && closeState ? (
        <div className="overlay">
          <div className="modal narrow">
            <div className="modal-head teal">
              <strong>Clôture journalière de caisse</strong>
              <button type="button" className="close-x" onClick={() => setCloseOpen(false)}>×</button>
            </div>
            <div className="modal-body">
              <p className="hint">Comparez le solde système avec le cash compté. Une fois clôturée, aucune opération caisse (alimentation / avance) ne peut être saisie pour cette date — l’admin peut rouvrir à tout moment.</p>
              <div className="field"><label>Date</label><input type="date" value={closeState.date} onChange={(event) => void openClose(event.target.value)} /></div>
              <p>Solde système <strong>{formatDa(closeState.systemSolde)} DA</strong></p>
              <div className="field"><label>Solde physique</label><input type="number" min="0" step="0.01" value={physical} disabled={closeState.closed} onChange={(event) => setPhysical(event.target.value)} placeholder="Cash compté" /></div>
              <p>Écart <strong className={ecart === 0 ? "pos" : "neg"}>{formatDa(ecart)} DA</strong></p>
              <div className="field"><label>Note (optionnel)</label><input value={closeNote} disabled={closeState.closed} onChange={(event) => setCloseNote(event.target.value)} placeholder="Ex. billet manquant, retard de saisie..." /></div>
              {closeState.closed ? <p className="hint">Journée clôturée par {closeState.closedBy || "—"} le {closeState.closedAt || "—"}</p> : null}
              {closeState.unlockedBy && !closeState.closed ? <p className="hint">Journée rouverte par {closeState.unlockedBy} · {closeState.unlockedAt} {closeState.unlockReason}</p> : null}
            </div>
            <div className="modal-foot">
              {closeState.canUnlock ? <button type="button" className="btn-light" onClick={() => void reopen()}>Rouvrir (admin)</button> : null}
              <button type="button" className="btn-light" onClick={() => setCloseOpen(false)}>Fermer</button>
              {closeState.canClose ? <button type="button" className="btn-action btn-green" onClick={() => void confirmClose()}>Clôturer la journée</button> : null}
            </div>
          </div>
        </div>
      ) : null}

      {bulkBonsOpen ? (
        <div className="overlay">
          <div className="modal modal-admin">
            <div className="modal-head slate">
              <strong>Import massif des bons</strong>
              <button type="button" className="close-x" onClick={() => setBulkBonsOpen(false)}>×</button>
            </div>
            <div className="modal-body admin-body">
              <CaisseBulkBonsPanel
                months={data.months}
                initialMonth={data.month}
                onNotify={notify}
                onDone={async () => {
                  await reload();
                }}
              />
            </div>
          </div>
        </div>
      ) : null}

      {adminOpen ? (
        <div className="overlay">
          <div className="modal modal-admin">
            <div className="modal-head slate">
              <strong>{listsOnly ? "Listes déroulantes" : openingsOnly ? "Soldes d’ouverture" : "Contrôle des droits · Listes"}</strong>
              <button type="button" className="close-x" onClick={() => setAdminOpen(false)}>×</button>
            </div>
            <div className="modal-body admin-body">
              {openingsOnly || listsOnly ? null : (
                <section className="admin-section">
                  <p className="hint admin-intro">
                    L’administrateur voit toujours tout. Pour chaque employé, cochez ce qu’il a le droit de faire.
                    « Ouverture » délègue les soldes d’ouverture ; « Listes » délègue Affectation / Parc roulant / Unités
                    (déjà inclus pour SUPER_ADMIN / ADMIN_FINANCE).
                  </p>
                  <div className="admin-table-wrap">
                    <table className="admin-table rights-table">
                      <thead>
                        <tr>
                          <th>Nom</th>
                          <th>Email</th>
                          <th>Statut</th>
                          <th>Dates libres</th>
                          <th>Acheter pour autrui</th>
                          <th>Voir achats des autres</th>
                          <th>Opérations caisse</th>
                          <th>Modifier / Supprimer</th>
                          <th>Ouverture</th>
                          <th>Listes</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {adminUsers.map((user, index) => (
                          <tr key={`${user.userId || user.buyerId}-${user.name}`} className={user.active ? undefined : "admin-row-inactive"}>
                            <td className="admin-name">{user.name}</td>
                            <td>
                              <input
                                className="admin-email"
                                type="email"
                                value={user.email}
                                disabled={user.isAdmin}
                                onChange={(event) => setAdminUsers((current) => current.map((row, i) => (i === index ? { ...row, email: event.target.value } : row)))}
                              />
                            </td>
                            <td>
                              <span className={`admin-status ${user.active ? "on" : "off"}`}>
                                {user.isAdmin ? "Admin" : user.active ? "Actif" : "Inactif"}
                              </span>
                            </td>
                            {user.isAdmin ? (
                              <td colSpan={7}>
                                <span className="admin-badge">Admin — voit tout (droits non modifiables)</span>
                              </td>
                            ) : (
                              (["datesLibres", "buyForOthers", "seeAll", "caisseOps", "canEdit", "manageOpenings", "manageLists"] as const).map((key) => (
                                <td key={key} className="admin-check">
                                  <input
                                    type="checkbox"
                                    checked={user[key]}
                                    disabled={(key === "manageOpenings" || key === "manageLists") && !user.userId}
                                    onChange={(event) => setAdminUsers((current) => current.map((row, i) => (i === index ? { ...row, [key]: event.target.checked } : row)))}
                                  />
                                </td>
                              ))
                            )}
                            <td className="admin-row-actions">
                              <button type="button" className="btn-light" onClick={() => void editBuyer(user)}>Modifier</button>
                              {user.isAdmin ? (
                                <span className="hint">Droits admin</span>
                              ) : (
                                <>
                                  <button type="button" className="btn-light" onClick={() => void toggleBuyerActive(user)}>
                                    {user.active ? "Désactiver" : "Activer"}
                                  </button>
                                  <button type="button" className="btn-light btn-danger-text" onClick={() => void removeBuyer(user)}>Supprimer</button>
                                </>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="admin-actions">
                    <button type="button" className="btn-action btn-green" onClick={() => void saveRights()}>Enregistrer les droits</button>
                    <button type="button" className="btn-outline-blue" onClick={() => notify("Trier caisse", "Les mouvements sont déjà dans le journal du mois. Rien à copier.")}>Trier caisse → mois</button>
                  </div>
                </section>
              )}

              {flags?.canManageOpenings && !listsOnly ? (
                <section className="admin-section">
                  <h6 className="admin-section-title">Soldes d’ouverture — {formatDateFr(openingDate)}</h6>
                  <p className="hint">
                    Saisie manuelle du reste chez chaque acheteur. Le total doit égaler le solde d’ouverture de la caisse.
                    Un montant à 0 ou vide retire cet acheteur de l’ouverture après confirmation.
                  </p>
                  <label className="admin-date-field">
                    Date d’ouverture
                    <input type="date" value={openingDate} onChange={(event) => setOpeningDate(event.target.value)} />
                  </label>
                  <div className="admin-table-wrap openings-wrap">
                    <table className="admin-table openings-table">
                      <thead>
                        <tr>
                          <th>Acheteur</th>
                          <th>Solde (DA)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {openings.map((row, index) => (
                          <tr key={row.name}>
                            <td className="admin-name">{row.name}</td>
                            <td>
                              <input
                                className="opening-amount"
                                type="number"
                                min="0"
                                step="0.01"
                                value={row.amount}
                                onChange={(event) => setOpenings((current) => current.map((item, i) => (i === index ? { ...item, amount: event.target.value } : item)))}
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="openings-foot">
                    <span className="pill openings-total">Total (= caisse ouverture) : {formatDa(openingTotal)} DA</span>
                    <button type="button" className="btn-action btn-green" onClick={() => void saveOpenings()}>Modifier les soldes d’ouverture</button>
                  </div>
                </section>
              ) : null}

              {flags?.canManageLists ? (
                <section className="admin-section">
                  <h6 className="admin-section-title">Listes déroulantes</h6>
                  <p className="hint">Affectation, matricules Parc roulant et unités. Les personnes cochées « Listes » peuvent aussi les gérer.</p>
                  {(
                    [
                      { key: "AFFECTATION" as const, title: "Affectation", items: adminLists.affectations, draftKey: "affectation" as const },
                      { key: "MATRICULE" as const, title: "Matricules (Parc roulant)", items: adminLists.matricules, draftKey: "matricule" as const },
                      { key: "UNIT" as const, title: "Unités", items: adminLists.units, draftKey: "unit" as const },
                    ]
                  ).map((block) => {
                    const query = listSearch[block.draftKey].trim().toLowerCase();
                    const visible = query
                      ? block.items.filter((item) => item.toLowerCase().includes(query))
                      : block.items;
                    return (
                    <div key={block.key} className="list-editor">
                      <div className="list-editor-head">
                        <span>{block.title}</span>
                        <span className="list-editor-count">{visible.length}/{block.items.length}</span>
                      </div>
                      <div className="list-editor-add">
                        <input
                          placeholder="Nouveau libellé"
                          value={listDraft[block.draftKey]}
                          onChange={(event) => setListDraft((current) => ({ ...current, [block.draftKey]: event.target.value }))}
                        />
                        <button
                          type="button"
                          className="btn-action btn-green"
                          onClick={() => {
                            const value = listDraft[block.draftKey];
                            void addListValue(block.key, value).then((created) => {
                              if (created) setListDraft((current) => ({ ...current, [block.draftKey]: "" }));
                            });
                          }}
                        >
                          Ajouter
                        </button>
                      </div>
                      <input
                        className="list-editor-search"
                        placeholder="Rechercher pour modifier / retirer…"
                        value={listSearch[block.draftKey]}
                        onChange={(event) => setListSearch((current) => ({ ...current, [block.draftKey]: event.target.value }))}
                      />
                      <ul className="list-editor-items">
                        {visible.length === 0 ? (
                          <li className="list-editor-empty">
                            <span>{block.items.length === 0 ? "Aucun élément" : "Aucun résultat"}</span>
                          </li>
                        ) : (
                          visible.map((item) => (
                            <li key={item}>
                              <span>{item}</span>
                              <button type="button" className="btn-light" onClick={() => void removeListValue(block.key, item)}>Retirer</button>
                            </li>
                          ))
                        )}
                      </ul>
                    </div>
                    );
                  })}
                </section>
              ) : null}

              {openingsOnly || listsOnly ? null : (
                <section className="admin-section">
                  <h6 className="admin-section-title">Ajouter un utilisateur</h6>
                  <div className="add-user-identity">
                    <input placeholder="Nom" value={newName} onChange={(event) => setNewName(event.target.value)} />
                    <input placeholder="Email" value={newEmail} onChange={(event) => setNewEmail(event.target.value)} />
                    <input placeholder="Mot de passe 6 car." maxLength={6} value={newPass} onChange={(event) => setNewPass(event.target.value)} />
                  </div>
                  <div className="add-user-rights">
                    <select value={newAccess} onChange={(event) => setNewAccess(event.target.value)}><option value="">Date limitée</option><option value="OPEN">Dates libres</option></select>
                    <select value={newRole} onChange={(event) => setNewRole(event.target.value)}><option value="">Employé</option><option value="MASTER">Acheter pour autrui</option></select>
                    <select value={newJournal} onChange={(event) => setNewJournal(event.target.value)}><option value="">Ses achats seulement</option><option value="ALL">Voir achats des autres</option></select>
                    <select value={newCaisse} onChange={(event) => setNewCaisse(event.target.value)}><option value="">Sans caisse</option><option value="CAISSE">Opérations caisse</option></select>
                    <select value={newEdit} onChange={(event) => setNewEdit(event.target.value)}><option value="">Sans modification</option><option value="EDIT">Modifier / Supprimer</option></select>
                  </div>
                  <button type="button" className="btn-action btn-add-user" onClick={() => void addBuyer()}>Ajouter</button>
                </section>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {auditOpen ? (
        <div className="overlay">
          <div className="modal">
            <div className="modal-head brown">
              <strong>Journal d’audit</strong>
              <button type="button" className="close-x" onClick={() => setAuditOpen(false)}>×</button>
            </div>
            <div className="modal-body">
              <p className="hint">Qui a créé, modifié ou supprimé une opération — avec date/heure.</p>
              <table>
                <thead><tr><th>Date/Heure</th><th>Utilisateur</th><th>Action</th><th>Type</th><th>N°</th><th>Feuille</th><th>Détail</th><th>Montant</th></tr></thead>
                <tbody>
                  {!auditRows.length ? <tr><td colSpan={8}>Aucune entrée d’audit pour le moment.</td></tr> : null}
                  {auditRows.map((row, index) => (
                    <tr key={index}>
                      <td>{row.when}</td><td>{row.user}</td><td>{row.action}</td><td>{row.type}</td><td>{row.op}</td><td>{row.sheet}</td><td className="libelle">{row.detail}</td><td>{row.amount == null ? "" : `${formatDa(row.amount)} DA`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}

      {photoUrl ? (
        <div className="overlay" onClick={() => { setPhotoUrl(""); setPhotoArchiveName(""); }}>
          <div className="modal narrow" onClick={(event) => event.stopPropagation()}>
            <div className="modal-head green">
              <strong>Bon / pièce jointe</strong>
              <button type="button" className="close-x" onClick={() => { setPhotoUrl(""); setPhotoArchiveName(""); }}>×</button>
            </div>
            <div className="modal-body" style={{ textAlign: "center" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photoUrl} alt="Bon" style={{ maxWidth: "100%", maxHeight: "70vh" }} />
              {photoArchiveName ? (
                <p className="hint" style={{ marginTop: 12 }}>
                  Archive : <strong>{photoArchiveName}</strong>{" "}
                  <button type="button" className="btn-light" onClick={downloadPhotoArchive}>Télécharger</button>
                </p>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {ask ? (
        <div className="overlay">
          <div className="modal narrow">
            <div className="modal-body">
              <h6>{ask.title}</h6>
              <p>{ask.text}</p>
              {ask.reason ? <input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Saisir…" /> : null}
            </div>
            <div className="modal-foot">
              <button type="button" className="btn-light" onClick={() => { ask.resolve(null); setAsk(null); }}>Annuler</button>
              <button type="button" className="btn-action btn-green" onClick={() => { ask.resolve(ask.reason ? reason : "ok"); setAsk(null); }}>{ask.confirm}</button>
            </div>
          </div>
        </div>
      ) : null}
      {toast ? <div className="toast"><strong>{toast.title}</strong><div>{toast.text}</div></div> : null}
      {busy ? <div className="overlay"><div className="panel">Chargement...</div></div> : null}
    </div>
  );

  function updateItem(index: number, patch: Partial<ItemDraft>) {
    setItems((current) => current.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }
}

function shift(iso: string, days: number): string {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
