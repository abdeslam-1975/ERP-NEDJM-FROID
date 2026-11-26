"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import ExcelJS from "exceljs";
import { logoutAction } from "@/lib/actions/auth";
import {
  addBanqueListItem,
  createBanqueAccount,
  createBanqueAdminUser,
  deleteBanqueAdminUser,
  deleteBanqueLine,
  executeBanqueVirement,
  importBanqueArchive,
  importBanqueReleve,
  listBanqueAdminUsers,
  listDeletedBanqueLines,
  restoreBanqueLine,
  saveBanqueLine,
  setBanqueRapprochement,
  syncBanqueArchiveLists,
  toggleBanqueAccountActive,
  type BanqueAdminUser,
} from "@/lib/actions/banque";
import {
  archiveSheetToRpcRows,
  parseArchiveWorkbookFromExcelJs,
  type ArchiveBankSheet,
  type ArchiveSettings,
} from "@/lib/banque/archive-xlsx";
import {
  buildBcLabel,
  buildCautionLibelle,
  buildFacLabel,
  buildModeLabel,
  cautionAlertsFromLibelles,
  excelSerialToIso,
  formatDa,
  formatDateFr,
  formatDateIso,
  parseDocField,
} from "@/lib/banque/ledger";
import type { BanqueDashboard, BanqueDeletedLine, BanqueLine } from "@/lib/banque/types";
import "./banque.css";

type OpForm = {
  id?: string;
  op_date: string;
  affectation: string;
  fournisseur: string;
  caution_type: "S-CAUTION" | "B-CAUTION";
  caution_expiry: string;
  mode: string;
  mode_num: string;
  mode_url: string;
  bc_num: string;
  bc_date: string;
  bc_url: string;
  fac_num: string;
  fac_date: string;
  fac_url: string;
  debit: string;
  credit: string;
  frais: string;
  isCaution: boolean;
  line_kind: BanqueLine["line_kind"];
};

function emptyOp(today: string): OpForm {
  return {
    op_date: today,
    affectation: "",
    fournisseur: "",
    caution_type: "S-CAUTION",
    caution_expiry: "",
    mode: "",
    mode_num: "",
    mode_url: "",
    bc_num: "",
    bc_date: "",
    bc_url: "",
    fac_num: "",
    fac_date: "",
    fac_url: "",
    debit: "0",
    credit: "0",
    frais: "0",
    isCaution: false,
    line_kind: "MANUAL",
  };
}

async function readFileAsDataUrl(file: File | null): Promise<string | null> {
  if (!file) return null;
  if (file.size > 400_000) throw new Error("Fichier trop volumineux (max 400 Ko).");
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Lecture fichier impossible."));
    reader.readAsDataURL(file);
  });
}

export function BanqueDesk({
  initialData,
  loadError,
}: {
  initialData: BanqueDashboard;
  loadError?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [data, setData] = useState(initialData);
  const [accountId, setAccountId] = useState(initialData.selectedAccountId);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(loadError ?? null);
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [modal, setModal] = useState<"op" | "virement" | "import" | "admin" | "trash" | null>(null);
  const [trashRows, setTrashRows] = useState<BanqueDeletedLine[]>([]);
  const [opForm, setOpForm] = useState<OpForm>(emptyOp(initialData.today));
  const [virement, setVirement] = useState({
    from_account_id: initialData.selectedAccountId ?? "",
    to_account_id: "",
    amount: "",
    op_date: initialData.today,
  });
  const [adminTab, setAdminTab] = useState<"parametres" | "banques" | "utilisateurs" | "archive">(
    "parametres",
  );
  const [archiveBanks, setArchiveBanks] = useState<ArchiveBankSheet[]>([]);
  const [archiveSettings, setArchiveSettings] = useState<ArchiveSettings | null>(null);
  const [archivePick, setArchivePick] = useState<string>("");
  const [archiveMode, setArchiveMode] = useState<"fill_empty" | "replace">("fill_empty");
  const [archiveFileName, setArchiveFileName] = useState("");
  const [adminAff, setAdminAff] = useState("");
  const [adminFourn, setAdminFourn] = useState("");
  const [adminMode, setAdminMode] = useState("");
  const [adminBankName, setAdminBankName] = useState("");
  const [adminUsers, setAdminUsers] = useState<BanqueAdminUser[]>([]);
  const [adminUsersLoading, setAdminUsersLoading] = useState(false);
  const [adminUsersTick, setAdminUsersTick] = useState(0);
  const [adminUserForm, setAdminUserForm] = useState({
    email: "",
    password: "",
    name: "",
    role: "user" as "admin" | "user",
  });
  const [modeFile, setModeFile] = useState<File | null>(null);
  const [bcFile, setBcFile] = useState<File | null>(null);
  const [facFile, setFacFile] = useState<File | null>(null);

  const account = data.accounts.find((a) => a.id === accountId) ?? null;
  const alerts = useMemo(
    () => cautionAlertsFromLibelles(data.lines, data.today),
    [data.lines, data.today],
  );

  useEffect(() => {
    if (modal !== "admin" || adminTab !== "utilisateurs") return;
    let cancelled = false;
    setAdminUsersLoading(true);
    void listBanqueAdminUsers().then((res) => {
      if (cancelled) return;
      setAdminUsersLoading(false);
      if (!res.ok) {
        setError(res.error);
        setAdminUsers([]);
        return;
      }
      setAdminUsers(res.data);
    });
    return () => {
      cancelled = true;
    };
  }, [modal, adminTab, adminUsersTick]);

  function openAdmin() {
    setAdminTab("parametres");
    setAdminAff("");
    setAdminFourn("");
    setAdminMode("");
    setAdminBankName("");
    setAdminUserForm({ email: "", password: "", name: "", role: "user" });
    setModal("admin");
  }

  function openTrash() {
    if (!data.canRestore && !data.canDelete) {
      setError("Restauration réservée (droit supprimer Banque).");
      return;
    }
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await listDeletedBanqueLines(accountId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setTrashRows(result.data.rows);
      setModal("trash");
      if (!result.data.rows.length) {
        setMessage("Corbeille vide — aucune opération Banque supprimée.");
      }
    });
  }

  function restoreTrashItem(row: BanqueDeletedLine) {
    if (!window.confirm(`Restaurer l'opération « ${row.libelle} » (${row.account_name}) ?`)) {
      return;
    }
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await restoreBanqueLine(row.id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setMessage(result.data.message);
      reload(accountId);
      const refreshed = await listDeletedBanqueLines(accountId);
      if (refreshed.ok) setTrashRows(refreshed.data.rows);
    });
  }

  function refreshAdminUsers() {
    setAdminUsersTick((n) => n + 1);
  }

  function saveAdminUser() {
    const { email, password, name, role } = adminUserForm;
    if (!email.trim() || !password || !name.trim()) {
      setError("Email, mot de passe et nom sont requis.");
      return;
    }
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await createBanqueAdminUser({
        email: email.trim(),
        password,
        name: name.trim(),
        role,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setMessage("Utilisateur enregistré.");
      setAdminUserForm({ email: "", password: "", name: "", role: "user" });
      refreshAdminUsers();
    });
  }

  function removeAdminUser(user: BanqueAdminUser) {
    if (!window.confirm(`Supprimer: ${user.email}?`)) return;
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await deleteBanqueAdminUser(user.id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setMessage("Utilisateur supprimé.");
      refreshAdminUsers();
    });
  }

  function addListItem(list_key: "AFFECTATION" | "FOURNISSEUR" | "MODE", label: string, clear: () => void) {
    const value = label.trim();
    if (!value) return;
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await addBanqueListItem({ list_key, label: value });
      if (!result.ok) {
        setError(result.error ?? "Opération refusée.");
        return;
      }
      setMessage("Paramètre ajouté.");
      clear();
      reload(accountId);
    });
  }

  const visibleLines = useMemo(() => {
    return data.lines.filter((line) => {
      if (search) {
        const hay = [
          line.affectation,
          line.bc_label,
          line.mode_label,
          line.fac_label,
          line.libelle,
          String(line.display_no),
        ]
          .join(" ")
          .toLowerCase();
        if (!hay.includes(search.toLowerCase())) return false;
      }
      if (dateFrom && line.op_date < dateFrom) return false;
      if (dateTo && line.op_date > dateTo) return false;
      return true;
    });
  }, [data.lines, search, dateFrom, dateTo]);

  function reload(nextAccountId?: string | null) {
    startTransition(async () => {
      const { getBanqueDashboard } = await import("@/lib/actions/banque");
      const result = await getBanqueDashboard(nextAccountId ?? accountId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setData(result.data);
      setAccountId(result.data.selectedAccountId);
      setError(null);
      router.refresh();
    });
  }

  function run(action: () => Promise<{ ok: boolean; error?: string }>, success: string, closeModal = true) {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setError(result.error ?? "Opération refusée.");
        return;
      }
      setMessage(success);
      if (closeModal) setModal(null);
      reload(accountId);
    });
  }

  function openOp(isCaution: boolean) {
    const form = emptyOp(data.today);
    form.isCaution = isCaution;
    form.line_kind = isCaution ? "CAUTION" : "MANUAL";
    form.affectation = isCaution
      ? data.lists.affectations.find((a) => a.includes("CAUTION")) || "CAUTION"
      : data.lists.affectations[0] || "";
    form.fournisseur = data.lists.fournisseurs[0] || "";
    form.mode = data.lists.modes[0] || "";
    setModeFile(null);
    setBcFile(null);
    setFacFile(null);
    setOpForm(form);
    setModal("op");
  }

  function openEdit(line: BanqueLine) {
    const isCaution = line.libelle.includes("CAUTION");
    const bc = parseDocField(line.bc_label, "BC");
    const fac = parseDocField(line.fac_label, "FAC");
    const mode = parseDocField(line.mode_label, "MODE");
    const exp = line.libelle.match(/\[EXP:\s*(\d{2}\/\d{2}\/\d{4})\]/);
    setModeFile(null);
    setBcFile(null);
    setFacFile(null);
    setOpForm({
      id: line.id,
      op_date: line.op_date,
      affectation: line.affectation,
      fournisseur: line.libelle.replace(/\s*\[EXP:[^\]]+\]/, "").trim(),
      caution_type: line.libelle.includes("B-CAUTION") ? "B-CAUTION" : "S-CAUTION",
      caution_expiry: exp ? formatDateIso(exp[1]) : "",
      mode: mode.mode || line.mode_label,
      mode_num: mode.num,
      mode_url: line.mode_url || "",
      bc_num: bc.num,
      bc_date: bc.date ? formatDateIso(bc.date) : "",
      bc_url: line.bc_url || "",
      fac_num: fac.num,
      fac_date: fac.date ? formatDateIso(fac.date) : "",
      fac_url: line.fac_url || "",
      debit: String(line.debit),
      credit: String(line.credit),
      frais: String(line.frais),
      isCaution,
      line_kind: isCaution ? "CAUTION" : line.line_kind,
    });
    setModal("op");
  }

  async function submitOp() {
    try {
      const nextModeUrl = (await readFileAsDataUrl(modeFile)) || opForm.mode_url || null;
      const nextBcUrl = (await readFileAsDataUrl(bcFile)) || opForm.bc_url || null;
      const nextFacUrl = (await readFileAsDataUrl(facFile)) || opForm.fac_url || null;
      const libelle = opForm.isCaution
        ? buildCautionLibelle(opForm.caution_type, opForm.caution_expiry || null)
        : opForm.fournisseur.trim();
      if (!accountId) {
        setError("Sélectionnez une banque.");
        return;
      }
      if (!opForm.op_date) {
        setError("Date obligatoire.");
        return;
      }
      if (!opForm.isCaution && !libelle) {
        setError("Choisissez un fournisseur / libellé (liste Settings).");
        return;
      }
      run(
        () =>
          saveBanqueLine({
            id: opForm.id,
            account_id: accountId,
            op_date: opForm.op_date,
            affectation: opForm.affectation,
            libelle,
            debit: opForm.debit,
            credit: opForm.credit,
            frais: opForm.frais,
            bc_label: buildBcLabel(opForm.bc_num, opForm.bc_date || null),
            bc_url: nextBcUrl,
            mode_label: buildModeLabel(opForm.mode, opForm.mode_num),
            mode_url: nextModeUrl,
            fac_label: buildFacLabel(opForm.fac_num, opForm.fac_date || null),
            fac_url: nextFacUrl,
            line_kind: opForm.isCaution ? "CAUTION" : opForm.line_kind,
          }),
        opForm.id ? "Opération mise à jour." : "Opération enregistrée.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fichier invalide.");
    }
  }

  async function exportExcel() {
    if (!account) return;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(account.name.slice(0, 31) || "Banque");
    ws.addRow([
      "N°", "DATE OP", "DATE VAL", "AFFECTATION", "BC", "MODE", "FAC.", "LIBELLÉ",
      "DÉBIT", "CRÉDIT", "FRAIS", "SOLDE", "RAPP",
    ]);
    for (const line of visibleLines) {
      ws.addRow([
        line.display_no,
        formatDateFr(line.op_date),
        formatDateFr(line.value_date),
        line.affectation,
        line.bc_label,
        line.mode_label,
        line.fac_label,
        line.libelle,
        line.debit || "",
        line.credit || "",
        line.frais || "",
        line.solde,
        line.reconciled ? "✅" : "",
      ]);
    }
    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Rapport_${account.name}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function printReport() {
    if (!account) return;
    const rows = visibleLines
      .map(
        (line) =>
          `<tr><td>${formatDateFr(line.op_date)}</td><td>${escapeHtml(line.affectation)}</td><td>${escapeHtml(line.bc_label)}</td><td>${escapeHtml(line.mode_label)}</td><td>${escapeHtml(line.fac_label)}</td><td style="text-align:left">${escapeHtml(line.libelle)}</td><td>${formatDa(line.debit)}</td><td>${formatDa(line.credit)}</td><td>${formatDa(line.frais)}</td><td><b>${formatDa(line.solde)}</b></td></tr>`,
      )
      .join("");
    const html = `<!DOCTYPE html><html><head><title>Relevé — ${escapeHtml(account.name)}</title><style>body{font-family:Arial;padding:20px}table{width:100%;border-collapse:collapse;margin-top:16px}th,td{border:1px solid #bdc3c7;padding:6px;text-align:center;font-size:11px}th{background:#ecf0f1}</style></head><body><h1>RELEVÉ BANCAIRE</h1><p><strong>Banque:</strong> ${escapeHtml(account.name)}<br><strong>Période:</strong> ${dateFrom || "…"} à ${dateTo || "…"}</p><table><thead><tr><th>Date</th><th>Affectation</th><th>BC</th><th>Mode</th><th>Facture</th><th>Libellé</th><th>Débit</th><th>Crédit</th><th>Frais</th><th>Solde</th></tr></thead><tbody>${rows}</tbody></table></body></html>`;
    const popup = window.open("", "_blank");
    if (!popup) return;
    popup.document.write(html);
    popup.document.close();
    popup.onload = () => popup.print();
  }

  async function handleImport(file: File | null) {
    if (!file || !accountId) {
      setError("Choisissez une banque et un fichier.");
      return;
    }
    try {
      const buffer = await file.arrayBuffer();
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(buffer);
      const sheet = wb.worksheets[0];
      if (!sheet) throw new Error("Feuille Excel introuvable.");
      const rows: { dateOp: string; dateVal: string; libelle: string; debit: number; credit: number }[] = [];
      sheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return;
        const rawDate = row.getCell(1).value;
        let dateOp = "";
        if (typeof rawDate === "number") dateOp = excelSerialToIso(rawDate);
        else if (rawDate instanceof Date) dateOp = rawDate.toISOString().slice(0, 10);
        else dateOp = formatDateIso(String(rawDate ?? ""));
        const libelle = String(row.getCell(2).value ?? "").trim();
        const debit = Number(row.getCell(3).value) || 0;
        const credit = Number(row.getCell(4).value) || 0;
        if (!dateOp || (debit <= 0 && credit <= 0)) return;
        rows.push({ dateOp, dateVal: dateOp, libelle: libelle || "IMPORT AUTO", debit, credit });
      });
      if (rows.length === 0) throw new Error("Aucune ligne exploitable dans le relevé.");
      run(
        async () => {
          const result = await importBanqueReleve({ account_id: accountId, rows });
          if (!result.ok) return result;
          return { ok: true as const, error: undefined };
        },
        "Relevé importé.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import impossible.");
    }
  }

  return (
    <div className="banque-app">
      <div className="top-navbar">
        <div className="brand">🏦 GESTION BANQUES 2026</div>
        <div className="user-info">
          <span>Journal bancaire ERP</span>
          {(data.canUpdate || data.canCreate) && (
            <span className="role-badge">{data.canDelete ? "ADMIN" : "USER"}</span>
          )}
          <a className="btn-light" href="/parametres/finance" style={{ padding: "4px 10px", fontSize: 12 }}>
            Paramètres
          </a>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {message && <div className="alert alert-ok">{message}</div>}
      {alerts.length > 0 && (
        <div className="alert alert-warn">
          <strong>Radar cautions</strong>
          <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
            {alerts.map((a) => (
              <li key={`${a.libelle}-${a.expiry}`}>
                {a.libelle}: {a.expired ? `expirée le ${a.expiry}` : `expire dans ${a.days} jour(s) (${a.expiry})`}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="kpi-grid">
        <div className="kpi-card kpi-solde">
          <div className="kpi-label">Solde Général</div>
          <div className="kpi-value">{formatDa(data.totalSolde)}</div>
          <small>Dinars Algériens (DA)</small>
        </div>
        <div className="kpi-card kpi-soum">
          <div className="kpi-label">Caution Soumission</div>
          <div className="kpi-value">{formatDa(data.totalSoum)}</div>
          <small>Total S-CAUTION</small>
        </div>
        <div className="kpi-card kpi-fin">
          <div className="kpi-label">Caution Bonne Fin</div>
          <div className="kpi-value">{formatDa(data.totalFin)}</div>
          <small>Total B-CAUTION</small>
        </div>
      </div>

      <div className="panel">
        <div className="bank-tabs">
          <span className="bank-tabs-label">Banques :</span>
          {data.accounts.filter((a) => a.active).map((a) => (
            <button
              key={a.id}
              type="button"
              className={`btn-bank${a.id === accountId ? " active" : ""}`}
              onClick={() => {
                setAccountId(a.id);
                reload(a.id);
              }}
            >
              <span>{a.name}</span>
              <span className="bank-bal">{formatDa(a.balance)} DA</span>
            </button>
          ))}
          {data.accounts.filter((a) => a.active).length === 0 && (
            <span style={{ color: "#888", fontSize: 13 }}>Créez une banque depuis Paramètres.</span>
          )}
        </div>
      </div>

      <div className="panel action-bar">
        <button type="button" className="btn-action btn-op" disabled={pending || !accountId || !data.canCreate} onClick={() => openOp(false)}>
          + OPÉRATION
        </button>
        <button type="button" className="btn-action btn-caution" disabled={pending || !accountId || !data.canCreate} onClick={() => openOp(true)}>
          CAUTION
        </button>
        <button
          type="button"
          className="btn-action btn-virement"
          disabled={pending || !data.canCreate}
          onClick={() => {
            setVirement({
              from_account_id: accountId ?? "",
              to_account_id: "",
              amount: "",
              op_date: data.today,
            });
            setModal("virement");
          }}
        >
          VIREMENT
        </button>
        <button type="button" className="btn-action btn-releve" disabled={pending || !accountId || !data.canUpdate} onClick={() => setModal("import")}>
          RELEVÉ
        </button>
        {data.canUpdate && (
          <button type="button" className="btn-action btn-admin" disabled={pending} onClick={openAdmin}>
            ADMIN
          </button>
        )}
        {(data.canRestore || data.canDelete) && (
          <button type="button" className="btn-action btn-corbeille" disabled={pending} onClick={openTrash}>
            CORBEILLE
          </button>
        )}
        <div className="filters">
          <span style={{ fontSize: 11, fontWeight: 700 }}>Du</span>
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          <span style={{ fontSize: 11, fontWeight: 700 }}>Au</span>
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          <button
            type="button"
            className="btn-filter"
            onClick={() => {
              /* dates already bound */
            }}
          >
            Filtrer
          </button>
          <button
            type="button"
            className="btn-light"
            onClick={() => {
              setDateFrom("");
              setDateTo("");
              setSearch("");
            }}
          >
            ✕
          </button>
          <input type="text" placeholder="Rechercher..." value={search} onChange={(e) => setSearch(e.target.value)} />
          <button type="button" className="btn-action btn-export" onClick={exportExcel} disabled={!account}>
            EXPORT
          </button>
          <button type="button" className="btn-action btn-pdf" onClick={printReport} disabled={!account}>
            PDF
          </button>
          <form action={logoutAction} style={{ display: "inline" }}>
            <button type="submit" className="btn-quitter">
              ⏻ QUITTER
            </button>
          </form>
        </div>
      </div>

      <div className="account-meta">
        <div>
          <span className="meta-bank-ico" aria-hidden>
            🏛
          </span>{" "}
          Banque active : <strong>{account?.name ?? "—"}</strong>
        </div>
        <div>
          Solde : <strong className="solde">{formatDa(account?.balance ?? 0)}</strong>{" "}
          <span className="meta-da">DA</span>
        </div>
      </div>

      <div className="table-card">
        <div className="table-scroll">
          <table className="main-table">
            <thead>
              <tr>
                {(
                  [
                    ["N°", 40],
                    ["DATE OP", 90],
                    ["DATE VAL", 90],
                    ["AFFECTATION", 130],
                    ["BC", 85],
                    ["MODE", 85],
                    ["FAC.", 75],
                    ["LIBELLÉ", 220],
                    ["DÉBIT", 110],
                    ["CRÉDIT", 110],
                    ["FRAIS", 85],
                    ["SOLDE", 120],
                    ["RAPP", 55],
                    ["ACTIONS", 100],
                  ] as const
                ).map(([h, w]) => (
                  <th key={h} style={{ width: w }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleLines.length === 0 ? (
                <tr>
                  <td colSpan={14} className="empty-rows">
                    <span className="empty-ico" aria-hidden>
                      {account ? "📥" : "🏛"}
                    </span>
                    {account ? "Aucune transaction" : "Sélectionnez une banque"}
                  </td>
                </tr>
              ) : (
                visibleLines.map((line) => {
                  const alert = alerts.find((a) => line.libelle.includes(a.libelle));
                  const rowClass = [
                    line.debit > 0 ? "row-in" : line.credit > 0 ? "row-out" : "",
                    alert?.expired ? "row-alert-exp" : alert ? "row-alert-soon" : "",
                  ]
                    .filter(Boolean)
                    .join(" ");
                  return (
                    <tr key={line.id} className={rowClass}>
                      <td>{line.display_no}</td>
                      <td>{formatDateFr(line.op_date)}</td>
                      <td>{formatDateFr(line.value_date)}</td>
                      <td>{line.affectation || "—"}</td>
                      <td>{docCell(line.bc_label, line.bc_url)}</td>
                      <td>{docCell(line.mode_label, line.mode_url)}</td>
                      <td>{docCell(line.fac_label, line.fac_url)}</td>
                      <td className="libelle-cell">{line.libelle}</td>
                      <td className="debit-cell">{moneyDa(line.debit)}</td>
                      <td className="credit-cell">{moneyDa(line.credit)}</td>
                      <td className="frais-cell">{moneyDa(line.frais, true)}</td>
                      <td className="solde-cell">{moneyDa(line.solde, true)}</td>
                      <td className="rapp-cell">
                        {line.reconciled ? (
                          <span className="rapp-done" title="Rapproché">
                            ✅
                          </span>
                        ) : data.canUpdate ? (
                          <button
                            type="button"
                            className="act-btn act-rapp"
                            title="Rapprochement"
                            onClick={() => {
                              const value = window.prompt(
                                "Date de valeur (AAAA-MM-JJ)",
                                line.value_date,
                              );
                              if (!value) return;
                              run(
                                () =>
                                  setBanqueRapprochement({
                                    line_id: line.id,
                                    reconciled: true,
                                    value_date: value,
                                  }),
                                "Rapprochement enregistré.",
                                false,
                              );
                            }}
                          >
                            <span className="act-ico" aria-hidden>
                              ✓
                            </span>
                          </button>
                        ) : null}
                      </td>
                      <td className="actions-cell">
                        {data.canUpdate ? (
                          line.reconciled ? (
                            <>
                              <button
                                type="button"
                                className="act-btn act-unlock"
                                title="Annuler le rapprochement"
                                onClick={() =>
                                  run(
                                    () =>
                                      setBanqueRapprochement({
                                        line_id: line.id,
                                        reconciled: false,
                                      }),
                                    "Rapprochement annulé.",
                                    false,
                                  )
                                }
                              >
                                <span className="act-ico" aria-hidden>
                                  🔓
                                </span>
                              </button>
                              <span className="locked-badge">Verrouillé</span>
                            </>
                          ) : (
                            <>
                              <button
                                type="button"
                                className="act-btn act-edit"
                                title="Modifier"
                                onClick={() => openEdit(line)}
                              >
                                <span className="act-ico" aria-hidden>
                                  ✎
                                </span>
                              </button>
                              {data.canDelete && (
                                <button
                                  type="button"
                                  className="act-btn act-del"
                                  title="Supprimer"
                                  onClick={() => {
                                    if (
                                      !window.confirm(
                                        `Supprimer l'opération N° ${line.display_no} ?`,
                                      )
                                    ) {
                                      return;
                                    }
                                    run(
                                      () => deleteBanqueLine(line.id),
                                      "Opération supprimée.",
                                      false,
                                    );
                                  }}
                                >
                                  <span className="act-ico" aria-hidden>
                                    🗑
                                  </span>
                                </button>
                              )}
                            </>
                          )
                        ) : (
                          <span className="actions-none">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {modal === "op" && (
        <div className="overlay">
          <div className="modal op-modal">
            <div className={`modal-head ${opForm.isCaution ? "warning" : "green"}`}>
              <span>
                {opForm.isCaution
                  ? opForm.id
                    ? `Modifier Caution N° ${opForm.id.slice(0, 8)}`
                    : "Nouveau Cautionnement"
                  : opForm.id
                    ? `Modifier Opération`
                    : "Nouvelle Opération"}
              </span>
              <button type="button" className="modal-close" onClick={() => setModal(null)}>×</button>
            </div>
            <div className="modal-body">
              <div className="grid-3">
                <div>
                  <label className="form-label">Date *</label>
                  <input type="date" value={opForm.op_date} onChange={(e) => setOpForm((f) => ({ ...f, op_date: e.target.value }))} />
                </div>
                <div className={opForm.isCaution ? "" : "span-2"}>
                  <label className="form-label">Affectation (Settings)</label>
                  <select value={opForm.affectation} onChange={(e) => setOpForm((f) => ({ ...f, affectation: e.target.value }))}>
                    <option value="">— Choisir (Settings) —</option>
                    {data.lists.affectations.map((a) => <option key={a} value={a}>{a}</option>)}
                  </select>
                </div>
                {opForm.isCaution ? (
                  <>
                    <div>
                      <label className="form-label">Type de Caution</label>
                      <select value={opForm.caution_type} onChange={(e) => setOpForm((f) => ({ ...f, caution_type: e.target.value as OpForm["caution_type"] }))}>
                        <option value="S-CAUTION">Soumission</option>
                        <option value="B-CAUTION">Bonne Fin</option>
                      </select>
                    </div>
                    <div>
                      <label className="form-label">Date d&apos;échéance</label>
                      <input type="date" value={opForm.caution_expiry} onChange={(e) => setOpForm((f) => ({ ...f, caution_expiry: e.target.value }))} />
                    </div>
                  </>
                ) : null}
              </div>

              {!opForm.isCaution ? (
                <div className="fourn-combo" style={{ marginTop: 12 }}>
                  <label className="form-label">
                    Fournisseur / Libellé * (Settings · {data.lists.fournisseurs.length})
                  </label>
                  <select
                    className="fourn-select"
                    value={
                      data.lists.fournisseurs.includes(opForm.fournisseur) || !opForm.fournisseur
                        ? opForm.fournisseur
                        : "__other__"
                    }
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === "__other__") {
                        setOpForm((f) => ({ ...f, fournisseur: "" }));
                        return;
                      }
                      setOpForm((f) => ({ ...f, fournisseur: v }));
                    }}
                  >
                    <option value="">— Choisir dans Settings —</option>
                    {data.lists.fournisseurs.map((f) => (
                      <option key={f} value={f}>
                        {f}
                      </option>
                    ))}
                    <option value="__other__">✎ Saisir un autre libellé…</option>
                  </select>
                  <input
                    className="fourn-search"
                    list="banque-fourn-list"
                    value={opForm.fournisseur}
                    onChange={(e) => setOpForm((f) => ({ ...f, fournisseur: e.target.value }))}
                    placeholder="Recherche / saisie libre (liste Settings)"
                    autoComplete="off"
                  />
                  <datalist id="banque-fourn-list">
                    {data.lists.fournisseurs.map((f) => (
                      <option key={`dl-${f}`} value={f} />
                    ))}
                  </datalist>
                </div>
              ) : null}

              <div className="block-box" style={{ marginTop: 14 }}>
                <label className="form-label" style={{ color: "#15803d" }}>Mode de Paiement (Settings)</label>
                <div className="grid-3">
                  <select value={opForm.mode} onChange={(e) => setOpForm((f) => ({ ...f, mode: e.target.value }))}>
                    <option value="">— Choisir (Settings) —</option>
                    {data.lists.modes.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                  <input placeholder="N° Numero" value={opForm.mode_num} onChange={(e) => setOpForm((f) => ({ ...f, mode_num: e.target.value }))} />
                  <input type="file" accept="image/*,application/pdf" onChange={(e) => setModeFile(e.target.files?.[0] ?? null)} />
                </div>
              </div>

              <div className="grid-2" style={{ marginTop: 12 }}>
                <div className="block-box">
                  <label className="form-label" style={{ color: "#1d4ed8" }}>Bon de Commande</label>
                  <div className="grid-2">
                    <input placeholder="N° Numero" value={opForm.bc_num} onChange={(e) => setOpForm((f) => ({ ...f, bc_num: e.target.value }))} />
                    <input type="date" value={opForm.bc_date} onChange={(e) => setOpForm((f) => ({ ...f, bc_date: e.target.value }))} />
                  </div>
                  <input type="file" accept="image/*,application/pdf" style={{ marginTop: 8, width: "100%" }} onChange={(e) => setBcFile(e.target.files?.[0] ?? null)} />
                </div>
                <div className="block-box">
                  <label className="form-label" style={{ color: "#dc2626" }}>Facture</label>
                  <div className="grid-2">
                    <input placeholder="N° Numero" value={opForm.fac_num} onChange={(e) => setOpForm((f) => ({ ...f, fac_num: e.target.value }))} />
                    <input type="date" value={opForm.fac_date} onChange={(e) => setOpForm((f) => ({ ...f, fac_date: e.target.value }))} />
                  </div>
                  <input type="file" accept="image/*,application/pdf" style={{ marginTop: 8, width: "100%" }} onChange={(e) => setFacFile(e.target.files?.[0] ?? null)} />
                </div>
              </div>

              <div className="grid-3" style={{ marginTop: 12 }}>
                <div>
                  <label className="form-label" style={{ color: "#16a34a" }}>Débit (+) Entrée</label>
                  <input type="number" min="0" step="0.01" value={opForm.debit} onChange={(e) => setOpForm((f) => ({ ...f, debit: e.target.value }))} />
                </div>
                <div>
                  <label className="form-label" style={{ color: "#dc2626" }}>Crédit (-) Sortie</label>
                  <input type="number" min="0" step="0.01" value={opForm.credit} onChange={(e) => setOpForm((f) => ({ ...f, credit: e.target.value }))} />
                </div>
                <div>
                  <label className="form-label">Frais Bancaires</label>
                  <input type="number" min="0" step="0.01" value={opForm.frais} onChange={(e) => setOpForm((f) => ({ ...f, frais: e.target.value }))} />
                </div>
              </div>
            </div>
            <div className="modal-foot">
              <button type="button" className="btn-light" onClick={() => setModal(null)}>Annuler</button>
              <button type="button" className={`btn-action ${opForm.isCaution ? "btn-caution" : "btn-op"}`} disabled={pending} onClick={submitOp}>
                {pending ? "…" : "ENREGISTRER"}
              </button>
            </div>
          </div>
        </div>
      )}

      {modal === "virement" && (
        <div className="overlay">
          <div className="modal narrow">
            <div className="modal-head navy">
              <span>NOUVEAU VIREMENT</span>
              <button type="button" className="modal-close" onClick={() => setModal(null)}>×</button>
            </div>
            <div className="modal-body" style={{ display: "grid", gap: 12 }}>
              <div>
                <label className="form-label">Date *</label>
                <input type="date" value={virement.op_date} onChange={(e) => setVirement((v) => ({ ...v, op_date: e.target.value }))} />
              </div>
              <div>
                <label className="form-label" style={{ color: "#dc2626" }}>Banque Source (Débit)</label>
                <select value={virement.from_account_id} onChange={(e) => setVirement((v) => ({ ...v, from_account_id: e.target.value }))}>
                  <option value="">Sélectionner…</option>
                  {data.accounts.filter((a) => a.active).map((a) => (
                    <option key={a.id} value={a.id}>{a.name} — {formatDa(a.balance)} DA</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="form-label" style={{ color: "#16a34a" }}>Banque Destination (Crédit)</label>
                <select value={virement.to_account_id} onChange={(e) => setVirement((v) => ({ ...v, to_account_id: e.target.value }))}>
                  <option value="">Sélectionner…</option>
                  {data.accounts.filter((a) => a.active && a.id !== virement.from_account_id).map((a) => (
                    <option key={a.id} value={a.id}>{a.name} — {formatDa(a.balance)} DA</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="form-label">Montant (DA) *</label>
                <input type="number" min="1" step="0.01" value={virement.amount} onChange={(e) => setVirement((v) => ({ ...v, amount: e.target.value }))} />
              </div>
            </div>
            <div className="modal-foot">
              <button type="button" className="btn-light" onClick={() => setModal(null)}>Annuler</button>
              <button type="button" className="btn-action btn-virement" disabled={pending} onClick={() => run(() => executeBanqueVirement(virement), "Virement exécuté.")}>
                EXÉCUTER
              </button>
            </div>
          </div>
        </div>
      )}

      {modal === "import" && (
        <div className="overlay">
          <div className="modal narrow">
            <div className="modal-head teal">
              <span>Importer Relevé Bancaire</span>
              <button type="button" className="modal-close" onClick={() => setModal(null)}>×</button>
            </div>
            <div className="modal-body">
              <div className="alert alert-warn" style={{ marginBottom: 12 }}>
                Format Excel : A = Date, B = Libellé, C = Débit (entrée), D = Crédit (sortie)
              </div>
              <label className="form-label">Fichier Excel</label>
              <input type="file" accept=".xlsx,.xls" onChange={(e) => handleImport(e.target.files?.[0] ?? null)} />
            </div>
            <div className="modal-foot">
              <button type="button" className="btn-light" onClick={() => setModal(null)}>Annuler</button>
            </div>
          </div>
        </div>
      )}

      {modal === "admin" && (
        <div className="overlay">
          <div className="modal admin-modal">
            <div className="modal-head slate">
              <span>🛡 GESTION SYSTÈME — ADMIN</span>
              <button type="button" className="modal-close" onClick={() => setModal(null)}>×</button>
            </div>
            <div className="modal-body">
              <div className="admin-tabs">
                <button
                  type="button"
                  className={`admin-tab${adminTab === "parametres" ? " active" : ""}`}
                  onClick={() => setAdminTab("parametres")}
                >
                  ⚙ Paramètres
                </button>
                <button
                  type="button"
                  className={`admin-tab${adminTab === "banques" ? " active" : ""}`}
                  onClick={() => setAdminTab("banques")}
                >
                  🏛 Banques
                </button>
                <button
                  type="button"
                  className={`admin-tab${adminTab === "utilisateurs" ? " active" : ""}`}
                  onClick={() => setAdminTab("utilisateurs")}
                >
                  👥 Utilisateurs
                </button>
                <button
                  type="button"
                  className={`admin-tab${adminTab === "archive" ? " active" : ""}`}
                  onClick={() => setAdminTab("archive")}
                >
                  📦 Archive
                </button>
              </div>

              {adminTab === "parametres" && (
                <div className="admin-pane">
                  <p style={{ fontSize: 12, color: "#64748b", marginTop: 0 }}>
                    Feuille <b>Settings</b> de l&apos;archive — ces listes alimentent les menus
                    déroulants à l&apos;ajout d&apos;opération (Affectation, Fournisseur/Libellé, Mode).
                  </p>
                  <div className="admin-param-grid">
                    <div className="admin-card">
                      <div className="admin-ico" style={{ color: "#2563eb" }}>🏷</div>
                      <h6>Nouvelle Affectation</h6>
                      <input
                        value={adminAff}
                        onChange={(e) => setAdminAff(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") addListItem("AFFECTATION", adminAff, () => setAdminAff(""));
                        }}
                      />
                      <button
                        type="button"
                        className="btn-add-aff"
                        disabled={pending || !adminAff.trim()}
                        onClick={() => addListItem("AFFECTATION", adminAff, () => setAdminAff(""))}
                      >
                        + Ajouter
                      </button>
                      <div className="admin-list-box">
                        <div className="admin-list-head">
                          Archive Settings · {data.lists.affectations.length}
                        </div>
                        <ul>
                          {data.lists.affectations.map((a) => (
                            <li key={a}>{a}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                    <div className="admin-card">
                      <div className="admin-ico" style={{ color: "#d97706" }}>🚚</div>
                      <h6>Nouveau Fournisseur</h6>
                      <input
                        value={adminFourn}
                        onChange={(e) => setAdminFourn(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") addListItem("FOURNISSEUR", adminFourn, () => setAdminFourn(""));
                        }}
                      />
                      <button
                        type="button"
                        className="btn-add-fourn"
                        disabled={pending || !adminFourn.trim()}
                        onClick={() => addListItem("FOURNISSEUR", adminFourn, () => setAdminFourn(""))}
                      >
                        + Ajouter
                      </button>
                      <div className="admin-list-box">
                        <div className="admin-list-head">
                          Archive Settings · {data.lists.fournisseurs.length}
                        </div>
                        <ul>
                          {data.lists.fournisseurs.map((f) => (
                            <li key={f}>{f}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                    <div className="admin-card">
                      <div className="admin-ico" style={{ color: "#16a34a" }}>💳</div>
                      <h6>Mode de Paiement</h6>
                      <input
                        value={adminMode}
                        onChange={(e) => setAdminMode(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") addListItem("MODE", adminMode, () => setAdminMode(""));
                        }}
                      />
                      <button
                        type="button"
                        className="btn-add-mode"
                        disabled={pending || !adminMode.trim()}
                        onClick={() => addListItem("MODE", adminMode, () => setAdminMode(""))}
                      >
                        + Ajouter
                      </button>
                      <div className="admin-list-box">
                        <div className="admin-list-head">
                          Archive Settings · {data.lists.modes.length}
                        </div>
                        <ul>
                          {data.lists.modes.map((m) => (
                            <li key={m}>{m}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {adminTab === "banques" && (
                <div className="admin-pane">
                  <div className="admin-bank-layout">
                    <div className="admin-card" style={{ textAlign: "left" }}>
                      <h6 style={{ textAlign: "left" }}>＋ Créer Banque</h6>
                      <input
                        value={adminBankName}
                        onChange={(e) => setAdminBankName(e.target.value)}
                        placeholder="Nom de la banque"
                      />
                      <button
                        type="button"
                        className="btn-add-mode"
                        disabled={pending || !adminBankName.trim()}
                        onClick={() => {
                          const name = adminBankName.trim();
                          if (!name) return;
                          run(
                            () => createBanqueAccount(name),
                            "Banque créée.",
                            false,
                          );
                          setAdminBankName("");
                        }}
                      >
                        CRÉER
                      </button>
                    </div>
                    <div className="admin-card" style={{ padding: 0, overflow: "hidden" }}>
                      <table className="admin-table">
                        <thead>
                          <tr>
                            <th>Banque</th>
                            <th>Statut</th>
                            <th>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.accounts.length === 0 ? (
                            <tr>
                              <td colSpan={3} style={{ textAlign: "center", color: "#94a3b8", padding: 16 }}>
                                Aucune banque
                              </td>
                            </tr>
                          ) : (
                            data.accounts.map((a) => (
                              <tr key={a.id}>
                                <td style={{ fontWeight: 700 }}>🏛 {a.name}</td>
                                <td>
                                  <span className={a.active ? "badge-active" : "badge-off"}>
                                    {a.active ? "Active" : "Désactivée"}
                                  </span>
                                </td>
                                <td style={{ whiteSpace: "nowrap" }}>
                                  <button
                                    type="button"
                                    className="btn-light"
                                    style={{ marginRight: 6 }}
                                    disabled={pending || !a.active}
                                    title="Désactiver"
                                    onClick={() =>
                                      run(
                                        () => toggleBanqueAccountActive(a.id, false),
                                        "Banque désactivée.",
                                        false,
                                      )
                                    }
                                  >
                                    ⌀
                                  </button>
                                  <button
                                    type="button"
                                    className="btn-light"
                                    disabled={pending || a.active}
                                    title="Activer"
                                    onClick={() =>
                                      run(
                                        () => toggleBanqueAccountActive(a.id, true),
                                        "Banque activée.",
                                        false,
                                      )
                                    }
                                  >
                                    ✓
                                  </button>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {adminTab === "utilisateurs" && (
                <div className="admin-pane">
                  <div className="admin-bank-layout">
                    <div className="admin-card" style={{ textAlign: "left" }}>
                      <h6 style={{ textAlign: "left" }}>＋ Nouvel Utilisateur</h6>
                      <input
                        type="email"
                        placeholder="Email"
                        value={adminUserForm.email}
                        onChange={(e) => setAdminUserForm((f) => ({ ...f, email: e.target.value }))}
                        disabled={pending}
                      />
                      <input
                        type="password"
                        placeholder="Mot de passe"
                        value={adminUserForm.password}
                        onChange={(e) => setAdminUserForm((f) => ({ ...f, password: e.target.value }))}
                        disabled={pending}
                        autoComplete="new-password"
                      />
                      <input
                        placeholder="Nom Complet"
                        value={adminUserForm.name}
                        onChange={(e) => setAdminUserForm((f) => ({ ...f, name: e.target.value }))}
                        disabled={pending}
                      />
                      <select
                        value={adminUserForm.role}
                        onChange={(e) =>
                          setAdminUserForm((f) => ({
                            ...f,
                            role: e.target.value === "admin" ? "admin" : "user",
                          }))
                        }
                        disabled={pending}
                        style={{ width: "100%", marginBottom: 10 }}
                      >
                        <option value="user">Utilisateur Simple</option>
                        <option value="admin">Administrateur</option>
                      </select>
                      <button
                        type="button"
                        className="btn-add-aff"
                        disabled={
                          pending ||
                          !adminUserForm.email.trim() ||
                          !adminUserForm.password ||
                          !adminUserForm.name.trim()
                        }
                        onClick={saveAdminUser}
                      >
                        ENREGISTRER
                      </button>
                    </div>
                    <div className="admin-card" style={{ padding: 0, overflow: "hidden" }}>
                      <table className="admin-table" style={{ textAlign: "center" }}>
                        <thead>
                          <tr>
                            <th>Nom</th>
                            <th>Email</th>
                            <th>Rôle</th>
                            <th style={{ width: 70 }}>Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {adminUsersLoading ? (
                            <tr>
                              <td colSpan={4} style={{ color: "#94a3b8", padding: 16 }}>
                                Chargement...
                              </td>
                            </tr>
                          ) : adminUsers.length === 0 ? (
                            <tr>
                              <td colSpan={4} style={{ color: "#94a3b8", padding: 16 }}>
                                Aucun utilisateur
                              </td>
                            </tr>
                          ) : (
                            adminUsers.map((u) => (
                              <tr key={u.id}>
                                <td style={{ fontWeight: 700 }}>{u.name || "—"}</td>
                                <td style={{ color: "#64748b", fontSize: 12 }}>{u.email}</td>
                                <td>
                                  <span className={u.role === "admin" ? "badge-admin" : "badge-user"}>
                                    {u.role}
                                  </span>
                                </td>
                                <td>
                                  <button
                                    type="button"
                                    className="btn-light"
                                    title="Supprimer"
                                    disabled={pending}
                                    onClick={() => removeAdminUser(u)}
                                  >
                                    🗑
                                  </button>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {adminTab === "archive" && (
                <div className="admin-pane">
                  <div className="admin-card" style={{ textAlign: "left" }}>
                    <h6 style={{ textAlign: "left" }}>Import archive GESTION DES BANQUES (.xlsx)</h6>
                    <p style={{ fontSize: 12, color: "#64748b", marginTop: 0 }}>
                      Analyse locale du fichier (aucune écriture tant que vous ne confirmez pas).
                      Commencez par une banque vide (ex. BEA SETIF 053 / AL SALAM). Mode{" "}
                      <strong>replace</strong> uniquement si vous voulez écraser un journal existant.
                    </p>
                    <input
                      type="file"
                      accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                      disabled={pending}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        e.target.value = "";
                        if (!file) return;
                        void (async () => {
                          try {
                            const buf = await file.arrayBuffer();
                            const wb = new ExcelJS.Workbook();
                            await wb.xlsx.load(buf);
                            const parsed = await parseArchiveWorkbookFromExcelJs(wb);
                            setArchiveBanks(parsed.banks);
                            setArchiveSettings(parsed.settings);
                            setArchiveFileName(file.name);
                            const prefer =
                              parsed.banks.find((b) => b.accountName === "BEA SETIF 053" && b.lines.length > 0) ??
                              parsed.banks.find((b) => b.accountName === "AL SALAM" && b.lines.length > 0) ??
                              parsed.banks.find((b) => b.lines.length > 0);
                            setArchivePick(prefer?.accountName ?? "");
                          } catch (err) {
                            window.alert(
                              err instanceof Error ? err.message : "Lecture du fichier impossible.",
                            );
                          }
                        })();
                      }}
                    />
                    {archiveFileName ? (
                      <p style={{ fontSize: 12, marginBottom: 8 }}>Fichier : {archiveFileName}</p>
                    ) : null}

                    {archiveBanks.length > 0 ? (
                      <>
                        <table className="admin-table" style={{ marginTop: 8 }}>
                          <thead>
                            <tr>
                              <th>Banque ERP</th>
                              <th>Ops</th>
                              <th>Ouverture</th>
                              <th>Solde final</th>
                              <th>Liens</th>
                              <th>Alertes</th>
                            </tr>
                          </thead>
                          <tbody>
                            {archiveBanks.map((b) => (
                              <tr
                                key={b.sheetName}
                                style={{
                                  background:
                                    archivePick === b.accountName ? "rgba(45,90,39,0.08)" : undefined,
                                  cursor: "pointer",
                                }}
                                onClick={() => setArchivePick(b.accountName)}
                              >
                                <td style={{ fontWeight: 700 }}>{b.accountName}</td>
                                <td>{b.lines.length}</td>
                                <td>
                                  {formatDa(b.openingBalance)}
                                  {b.openingMismatch ? " *" : ""}
                                </td>
                                <td>{formatDa(b.expectedFinal)}</td>
                                <td>
                                  {b.linkCounts.bc + b.linkCounts.mode + b.linkCounts.fac}
                                </td>
                                <td style={{ fontSize: 11, color: "#b45309" }}>
                                  {[
                                    b.openingMismatch ? "ouverture≠libellé" : "",
                                    b.balanceMismatches > 0
                                      ? `${b.balanceMismatches} écart(s) solde`
                                      : "",
                                  ]
                                    .filter(Boolean)
                                    .join(" · ") || "—"}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        <p style={{ fontSize: 11, color: "#94a3b8" }}>
                          * Si l’ouverture affichée dans Excel contredit la colonne SOLDE, l’import
                          utilise l’ouverture implicite (cohérente avec les soldes).
                        </p>

                        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 10 }}>
                          <label style={{ fontSize: 13 }}>
                            Banque{" "}
                            <select
                              value={archivePick}
                              onChange={(e) => setArchivePick(e.target.value)}
                            >
                              <option value="">—</option>
                              {archiveBanks.map((b) => (
                                <option key={b.sheetName} value={b.accountName}>
                                  {b.accountName} ({b.lines.length})
                                </option>
                              ))}
                            </select>
                          </label>
                          <label style={{ fontSize: 13 }}>
                            Mode{" "}
                            <select
                              value={archiveMode}
                              onChange={(e) =>
                                setArchiveMode(e.target.value as "fill_empty" | "replace")
                              }
                            >
                              <option value="fill_empty">fill_empty (compte vide)</option>
                              <option value="replace">replace (écraser)</option>
                            </select>
                          </label>
                          <button
                            type="button"
                            className="btn-add-mode"
                            disabled={pending || !archivePick}
                            onClick={() => {
                              const sheet = archiveBanks.find((b) => b.accountName === archivePick);
                              if (!sheet || sheet.lines.length === 0) {
                                window.alert("Aucune opération à importer pour cette banque.");
                                return;
                              }
                              const account = data.accounts.find((a) => a.name === sheet.accountName);
                              if (!account) {
                                window.alert(
                                  `Compte ERP introuvable pour « ${sheet.accountName} ». Créez-le d’abord dans Banques.`,
                                );
                                return;
                              }
                              if (
                                archiveMode === "replace" &&
                                !window.confirm(
                                  `Remplacer tout le journal de ${sheet.accountName} par l’archive (${sheet.lines.length} ops) ?`,
                                )
                              ) {
                                return;
                              }
                              if (
                                archiveMode === "fill_empty" &&
                                !window.confirm(
                                  `Importer ${sheet.lines.length} opérations dans ${sheet.accountName} (ouverture ${formatDa(sheet.openingBalance)} → solde ${formatDa(sheet.expectedFinal)}) ?`,
                                )
                              ) {
                                return;
                              }
                              run(
                                () =>
                                  importBanqueArchive({
                                    account_id: account.id,
                                    opening_balance: sheet.openingBalance,
                                    opening_date: sheet.openingDate,
                                    expected_final: sheet.expectedFinal,
                                    allow_negative: sheet.expectedFinal < 0,
                                    mode: archiveMode,
                                    rows: archiveSheetToRpcRows(sheet),
                                  }),
                                `Archive importée : ${sheet.accountName}.`,
                              );
                            }}
                          >
                            IMPORTER LA BANQUE
                          </button>
                          <button
                            type="button"
                            className="btn-light"
                            disabled={pending || !archiveSettings}
                            onClick={() => {
                              if (!archiveSettings) return;
                              if (
                                !window.confirm(
                                  `Synchroniser les listes ADMIN ?\nAffectations: ${archiveSettings.affectations.length}\nFournisseurs: ${archiveSettings.fournisseurs.length}\nModes: ${archiveSettings.modes.length}`,
                                )
                              ) {
                                return;
                              }
                              run(
                                () =>
                                  syncBanqueArchiveLists({
                                    affectations: archiveSettings.affectations,
                                    fournisseurs: archiveSettings.fournisseurs,
                                    modes: archiveSettings.modes,
                                  }),
                                "Listes ADMIN synchronisées.",
                              );
                            }}
                          >
                            SYNC LISTES SETTINGS
                          </button>
                        </div>
                      </>
                    ) : null}
                  </div>
                </div>
              )}
            </div>
            <div className="modal-foot">
              <button type="button" className="btn-light" onClick={() => setModal(null)}>Fermer</button>
            </div>
          </div>
        </div>
      )}

      {modal === "trash" && (
        <div className="overlay">
          <div className="modal wide">
            <div className="modal-head brown">
              <span>Corbeille — opérations Banque supprimées</span>
              <button type="button" className="modal-close" onClick={() => setModal(null)}>
                ×
              </button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: 12, color: "#64748b", marginTop: 0 }}>
                Les suppressions Banque ne sont pas définitives : restaurez une opération pour la
                remettre dans le journal (les N° sont recalculés). Indépendant de la corbeille Caisse.
              </p>
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Supprimée le</th>
                    <th>Banque</th>
                    <th>Date op.</th>
                    <th>Type</th>
                    <th>Libellé</th>
                    <th>Débit</th>
                    <th>Crédit</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {!trashRows.length ? (
                    <tr>
                      <td colSpan={8} style={{ textAlign: "center", color: "#94a3b8", padding: 16 }}>
                        Corbeille vide.
                      </td>
                    </tr>
                  ) : (
                    trashRows.map((row) => (
                      <tr key={row.id}>
                        <td>
                          {row.deleted_at
                            ? new Date(row.deleted_at).toLocaleString("fr-FR", {
                                timeZone: "Africa/Algiers",
                              })
                            : "—"}
                        </td>
                        <td style={{ fontWeight: 700 }}>{row.account_name || "—"}</td>
                        <td>{formatDateFr(row.op_date)}</td>
                        <td>{row.line_kind}</td>
                        <td className="libelle-cell">{row.libelle || "—"}</td>
                        <td className="debit-cell">{moneyDa(row.debit)}</td>
                        <td className="credit-cell">{moneyDa(row.credit)}</td>
                        <td>
                          <button
                            type="button"
                            className="btn-action btn-op"
                            disabled={pending}
                            onClick={() => restoreTrashItem(row)}
                          >
                            Restaurer
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <div className="modal-foot">
              <button type="button" className="btn-light" onClick={() => setModal(null)}>
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export const BanqueJournal = BanqueDesk;

/** Same display as Apps Script sheet cells: `12 518 413,00 DA`. */
function moneyDa(value: number, always = false): string {
  if (!always && !(Number(value) > 0)) return "";
  return `${formatDa(value)} DA`;
}

function docCell(label: string, url: string | null) {
  const text = label.replace(/🔗/g, "").trim();
  if (!text) return "—";
  if (url && (url.startsWith("http") || url.startsWith("data:"))) {
    return (
      <a href={url} target="_blank" rel="noreferrer" className="doc-link" title="Ouvrir le document">
        📎 {text}
      </a>
    );
  }
  return text;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
