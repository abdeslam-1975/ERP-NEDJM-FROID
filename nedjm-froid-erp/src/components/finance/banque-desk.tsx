"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import ExcelJS from "exceljs";
import {
  addBanqueListItem,
  deleteBanqueLine,
  executeBanqueVirement,
  importBanqueReleve,
  saveBanqueLine,
  setBanqueRapprochement,
  toggleBanqueAccountActive,
} from "@/lib/actions/banque";
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
import type { BanqueDashboard, BanqueLine } from "@/lib/banque/types";
import { Button } from "@/components/ui/button";

const inputClass =
  "h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/15";

type Props = {
  initialData: BanqueDashboard;
  loadError?: string;
};

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

export function BanqueDesk({ initialData, loadError }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [data, setData] = useState(initialData);
  const [accountId, setAccountId] = useState(initialData.selectedAccountId);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(loadError ?? null);
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [modal, setModal] = useState<"op" | "virement" | "import" | "admin" | null>(null);
  const [opForm, setOpForm] = useState<OpForm>(emptyOp(initialData.today));
  const [virement, setVirement] = useState({
    from_account_id: initialData.selectedAccountId ?? "",
    to_account_id: "",
    amount: "",
    op_date: initialData.today,
  });
  const [adminLabel, setAdminLabel] = useState("");
  const [adminKey, setAdminKey] = useState<"AFFECTATION" | "FOURNISSEUR" | "MODE">("AFFECTATION");
  const [newBankName, setNewBankName] = useState("");

  const account = data.accounts.find((a) => a.id === accountId) ?? null;
  const alerts = useMemo(
    () => cautionAlertsFromLibelles(data.lines, data.today),
    [data.lines, data.today],
  );

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

  async function switchAccount(id: string) {
    setAccountId(id);
    reload(id);
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
    setOpForm(form);
    setModal("op");
  }

  function openEdit(line: BanqueLine) {
    const isCaution = line.libelle.includes("CAUTION");
    const bc = parseDocField(line.bc_label, "BC");
    const fac = parseDocField(line.fac_label, "FAC");
    const mode = parseDocField(line.mode_label, "MODE");
    const exp = line.libelle.match(/\[EXP:\s*(\d{2}\/\d{2}\/\d{4})\]/);
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

  async function submitOp(modeFile: File | null, bcFile: File | null, facFile: File | null) {
    try {
      const modeUrl = (await readFileAsDataUrl(modeFile)) || opForm.mode_url || null;
      const bcUrl = (await readFileAsDataUrl(bcFile)) || opForm.bc_url || null;
      const facUrl = (await readFileAsDataUrl(facFile)) || opForm.fac_url || null;
      const libelle = opForm.isCaution
        ? buildCautionLibelle(opForm.caution_type, opForm.caution_expiry || null)
        : opForm.fournisseur.trim();
      if (!accountId) {
        setError("Sélectionnez une banque.");
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
            bc_url: bcUrl,
            mode_label: buildModeLabel(opForm.mode, opForm.mode_num),
            mode_url: modeUrl,
            fac_label: buildFacLabel(opForm.fac_num, opForm.fac_date || null),
            fac_url: facUrl,
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
      "N°",
      "DATE OP",
      "DATE VAL",
      "AFFECTATION",
      "BC",
      "MODE",
      "FAC.",
      "LIBELLÉ",
      "DÉBIT",
      "CRÉDIT",
      "FRAIS",
      "SOLDE",
      "RAPP",
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
          return {
            ok: true as const,
            error: undefined,
          };
        },
        "Relevé importé.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import impossible.");
    }
  }

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-xl border border-border bg-gradient-to-r from-[#1a472a] via-[#2d6a4f] to-[#3a87ad] p-5 text-white shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-100">Gestion banques</p>
            <h1 className="mt-1 text-2xl font-bold">Banque</h1>
            <p className="mt-1 max-w-2xl text-sm text-emerald-50">
              Journal par compte, cautions, virements, rapprochement et import de relevé — même logique que le cahier historique.
            </p>
          </div>
          <Button asChild variant="ghost" className="border-white/30 bg-white/10 text-white hover:bg-white/20 hover:text-white">
            <a href="/parametres/finance">Paramètres comptes</a>
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
      )}
      {message && (
        <div className="rounded-lg border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-800">{message}</div>
      )}
      {alerts.length > 0 && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <p className="font-semibold">Radar cautions</p>
          <ul className="mt-1 list-disc pl-5">
            {alerts.map((a) => (
              <li key={`${a.libelle}-${a.expiry}`}>
                {a.libelle}: {a.expired ? `expirée le ${a.expiry}` : `expire dans ${a.days} jour(s) (${a.expiry})`}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-3">
        <Kpi label="Solde général" value={`${formatDa(data.totalSolde)} DA`} tone="green" />
        <Kpi label="Caution soumission" value={`${formatDa(data.totalSoum)} DA`} note="Total S-CAUTION" tone="amber" />
        <Kpi label="Caution bonne fin" value={`${formatDa(data.totalFin)} DA`} note="Total B-CAUTION" tone="red" />
      </div>

      <section className="rounded-xl border border-border bg-surface p-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-wide text-foreground/50">Banques</span>
          {data.accounts.filter((a) => a.active).map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => switchAccount(a.id)}
              className={`rounded-lg border px-3 py-2 text-left text-sm font-semibold transition ${
                a.id === accountId
                  ? "border-transparent bg-[#3a87ad] text-white shadow"
                  : "border-border bg-surface-muted text-foreground hover:border-[#3a87ad]"
              }`}
            >
              <span className="block">{a.name}</span>
              <span className="block text-[11px] opacity-80">{formatDa(a.balance)} DA</span>
            </button>
          ))}
          {data.accounts.filter((a) => a.active).length === 0 && (
            <p className="text-sm text-foreground/55">Créez un compte Banque dans Paramètres.</p>
          )}
        </div>
      </section>

      <section className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface p-3 shadow-sm">
        <Button disabled={pending || !accountId || !data.canCreate} onClick={() => openOp(false)}>
          Opération
        </Button>
        <Button disabled={pending || !accountId || !data.canCreate} variant="secondary" onClick={() => openOp(true)}>
          Caution
        </Button>
        <Button
          disabled={pending || !data.canCreate}
          variant="secondary"
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
          Virement
        </Button>
        <Button disabled={pending || !accountId || !data.canUpdate} variant="secondary" onClick={() => setModal("import")}>
          Relevé
        </Button>
        {data.canUpdate && (
          <Button disabled={pending} variant="secondary" onClick={() => setModal("admin")}>
            Admin
          </Button>
        )}
        <div className="ms-auto flex flex-wrap items-center gap-2">
          <input type="date" className={`${inputClass} w-auto`} value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          <input type="date" className={`${inputClass} w-auto`} value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          <input
            className={`${inputClass} w-48`}
            placeholder="Rechercher…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Button variant="secondary" onClick={exportExcel} disabled={!account}>
            Export
          </Button>
          <Button variant="secondary" onClick={printReport} disabled={!account}>
            PDF
          </Button>
        </div>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-sm text-foreground/65">
        <span>
          Banque active : <strong className="text-foreground">{account?.name ?? "—"}</strong>
        </span>
        <span>
          Solde : <strong className="text-emerald-700">{formatDa(account?.balance ?? 0)}</strong> DA
        </span>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
        <div className="max-h-[58vh] overflow-auto">
          <table className="min-w-[1400px] w-full border-collapse text-center text-[11.5px]">
            <thead>
              <tr className="sticky top-0 z-[1] bg-[#2d5a27] text-white">
                {[
                  "N°",
                  "Date op",
                  "Date val",
                  "Affectation",
                  "BC",
                  "Mode",
                  "Fac.",
                  "Libellé",
                  "Débit",
                  "Crédit",
                  "Frais",
                  "Solde",
                  "Rapp",
                  "Actions",
                ].map((h) => (
                  <th key={h} className="whitespace-nowrap px-2 py-2 font-bold uppercase tracking-wide">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleLines.length === 0 ? (
                <tr>
                  <td colSpan={14} className="px-4 py-10 text-foreground/45">
                    {account ? "Aucune transaction" : "Sélectionnez une banque"}
                  </td>
                </tr>
              ) : (
                visibleLines.map((line) => {
                  const tone =
                    line.debit > 0 ? "bg-emerald-50" : line.credit > 0 ? "bg-red-50" : "";
                  const alert = alerts.find((a) => line.libelle.includes(a.libelle));
                  return (
                    <tr
                      key={line.id}
                      className={`${tone} border-b border-border/60 hover:bg-sky-50 ${
                        alert?.expired ? "bg-red-100/70" : alert ? "bg-orange-100/70" : ""
                      }`}
                    >
                      <td className="px-2 py-1.5">{line.display_no}</td>
                      <td className="px-2 py-1.5">{formatDateFr(line.op_date)}</td>
                      <td className="px-2 py-1.5">{formatDateFr(line.value_date)}</td>
                      <td className="px-2 py-1.5">{line.affectation || "—"}</td>
                      <td className="px-2 py-1.5">{docCell(line.bc_label, line.bc_url)}</td>
                      <td className="px-2 py-1.5">{docCell(line.mode_label, line.mode_url)}</td>
                      <td className="px-2 py-1.5">{docCell(line.fac_label, line.fac_url)}</td>
                      <td className="max-w-[240px] truncate px-2 py-1.5 text-left">{line.libelle}</td>
                      <td className="px-2 py-1.5 font-bold text-emerald-700">{line.debit ? formatDa(line.debit) : ""}</td>
                      <td className="px-2 py-1.5 font-bold text-red-600">{line.credit ? formatDa(line.credit) : ""}</td>
                      <td className="px-2 py-1.5">{line.frais ? formatDa(line.frais) : ""}</td>
                      <td className="px-2 py-1.5 font-bold text-[#1a472a]">{formatDa(line.solde)}</td>
                      <td className="px-2 py-1.5">{line.reconciled ? "✅" : ""}</td>
                      <td className="whitespace-nowrap px-2 py-1.5">
                        {data.canUpdate && (
                          line.reconciled ? (
                            <button
                              type="button"
                              className="text-amber-600"
                              title="Annuler le rapprochement"
                              onClick={() =>
                                run(
                                  () => setBanqueRapprochement({ line_id: line.id, reconciled: false }),
                                  "Rapprochement annulé.",
                                  false,
                                )
                              }
                            >
                              Déverrouiller
                            </button>
                          ) : (
                            <span className="inline-flex gap-2">
                              <button
                                type="button"
                                className="text-emerald-700"
                                onClick={() => {
                                  const value = window.prompt("Date de valeur (AAAA-MM-JJ)", line.value_date);
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
                                Rapp
                              </button>
                              <button type="button" className="text-sky-700" onClick={() => openEdit(line)}>
                                Modifier
                              </button>
                              {data.canDelete && (
                                <button
                                  type="button"
                                  className="text-red-600"
                                  onClick={() => {
                                    if (!window.confirm(`Supprimer l'opération N° ${line.display_no} ?`)) return;
                                    run(() => deleteBanqueLine(line.id), "Opération supprimée.", false);
                                  }}
                                >
                                  Supprimer
                                </button>
                              )}
                            </span>
                          )
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
        <Modal
          title={opForm.isCaution ? "Cautionnement" : opForm.id ? "Modifier l'opération" : "Nouvelle opération"}
          onClose={() => setModal(null)}
        >
          <OpModalBody
            form={opForm}
            setForm={setOpForm}
            lists={data.lists}
            pending={pending}
            onSubmit={submitOp}
          />
        </Modal>
      )}

      {modal === "virement" && (
        <Modal title="Nouveau virement" onClose={() => setModal(null)}>
          <div className="grid gap-3">
            <Field label="Date">
              <input type="date" className={inputClass} value={virement.op_date} onChange={(e) => setVirement((v) => ({ ...v, op_date: e.target.value }))} />
            </Field>
            <Field label="Banque source">
              <select className={inputClass} value={virement.from_account_id} onChange={(e) => setVirement((v) => ({ ...v, from_account_id: e.target.value }))}>
                <option value="">Sélectionner…</option>
                {data.accounts.filter((a) => a.active).map((a) => (
                  <option key={a.id} value={a.id}>{a.name} — {formatDa(a.balance)} DA</option>
                ))}
              </select>
            </Field>
            <Field label="Banque destination">
              <select className={inputClass} value={virement.to_account_id} onChange={(e) => setVirement((v) => ({ ...v, to_account_id: e.target.value }))}>
                <option value="">Sélectionner…</option>
                {data.accounts.filter((a) => a.active && a.id !== virement.from_account_id).map((a) => (
                  <option key={a.id} value={a.id}>{a.name} — {formatDa(a.balance)} DA</option>
                ))}
              </select>
            </Field>
            <Field label="Montant (DA)">
              <input type="number" min="0" step="0.01" className={inputClass} value={virement.amount} onChange={(e) => setVirement((v) => ({ ...v, amount: e.target.value }))} />
            </Field>
            <Button
              disabled={pending}
              onClick={() =>
                run(
                  () => executeBanqueVirement(virement),
                  "Virement exécuté.",
                )
              }
            >
              Exécuter
            </Button>
          </div>
        </Modal>
      )}

      {modal === "import" && (
        <Modal title="Importer relevé bancaire" onClose={() => setModal(null)}>
          <p className="mb-3 text-sm text-foreground/65">
            Colonnes Excel : A = Date, B = Libellé, C = Débit (entrée), D = Crédit (sortie) — même convention que le cahier.
          </p>
          <input
            type="file"
            accept=".xlsx,.xls"
            className={inputClass}
            onChange={(e) => handleImport(e.target.files?.[0] ?? null)}
          />
        </Modal>
      )}

      {modal === "admin" && (
        <Modal title="Administration banque" onClose={() => setModal(null)}>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2 rounded-lg border border-border p-3">
              <h3 className="font-bold">Listes</h3>
              <select className={inputClass} value={adminKey} onChange={(e) => setAdminKey(e.target.value as typeof adminKey)}>
                <option value="AFFECTATION">Affectation</option>
                <option value="FOURNISSEUR">Fournisseur</option>
                <option value="MODE">Mode de paiement</option>
              </select>
              <input className={inputClass} value={adminLabel} onChange={(e) => setAdminLabel(e.target.value)} placeholder="Nouvelle valeur" />
              <Button
                disabled={pending || !adminLabel.trim()}
                onClick={() =>
                  run(
                    () => addBanqueListItem({ list_key: adminKey, label: adminLabel.trim() }),
                    "Paramètre ajouté.",
                    false,
                  )
                }
              >
                Ajouter
              </Button>
            </div>
            <div className="space-y-2 rounded-lg border border-border p-3">
              <h3 className="font-bold">Banques</h3>
              <ul className="space-y-2 text-sm">
                {data.accounts.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-2">
                    <span>{a.name} · {a.active ? "Active" : "Désactivée"}</span>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={pending}
                      onClick={() =>
                        run(
                          () => toggleBanqueAccountActive(a.id, !a.active),
                          a.active ? "Banque désactivée." : "Banque activée.",
                          false,
                        )
                      }
                    >
                      {a.active ? "Désactiver" : "Activer"}
                    </Button>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-foreground/55">
                Pour créer une banque, utilisez{" "}
                <a className="underline" href="/parametres/finance">Paramètres comptes</a>
                {newBankName ? ` (${newBankName})` : ""}.
              </p>
              <input
                className={inputClass}
                value={newBankName}
                onChange={(e) => setNewBankName(e.target.value)}
                placeholder="Rappel nom banque…"
              />
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Kpi({
  label,
  value,
  note,
  tone,
}: {
  label: string;
  value: string;
  note?: string;
  tone: "green" | "amber" | "red";
}) {
  const colors = {
    green: "from-[#1a472a] to-[#2d6a4f]",
    amber: "from-[#b45309] to-[#d97706]",
    red: "from-[#991b1b] to-[#dc2626]",
  };
  return (
    <div className={`rounded-xl bg-gradient-to-br ${colors[tone]} p-4 text-white shadow`}>
      <p className="text-[11px] uppercase tracking-wide opacity-90">{label}</p>
      <p className="mt-1 text-2xl font-extrabold">{value}</p>
      {note && <p className="text-xs opacity-80">{note}</p>}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-[11px] font-bold uppercase tracking-wide text-foreground/55">{label}</span>
      {children}
    </label>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-surface shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-lg font-bold">{title}</h2>
          <button type="button" onClick={onClose} className="text-foreground/50 hover:text-foreground">
            Fermer
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function OpModalBody({
  form,
  setForm,
  lists,
  pending,
  onSubmit,
}: {
  form: OpForm;
  setForm: React.Dispatch<React.SetStateAction<OpForm>>;
  lists: BanqueDashboard["lists"];
  pending: boolean;
  onSubmit: (modeFile: File | null, bcFile: File | null, facFile: File | null) => void;
}) {
  const [modeFile, setModeFile] = useState<File | null>(null);
  const [bcFile, setBcFile] = useState<File | null>(null);
  const [facFile, setFacFile] = useState<File | null>(null);

  return (
    <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-3">
        <Field label="Date *">
          <input type="date" className={inputClass} value={form.op_date} onChange={(e) => setForm((f) => ({ ...f, op_date: e.target.value }))} />
        </Field>
        <Field label="Affectation">
          <select className={inputClass} value={form.affectation} onChange={(e) => setForm((f) => ({ ...f, affectation: e.target.value }))}>
            <option value="">—</option>
            {lists.affectations.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </Field>
        {form.isCaution ? (
          <>
            <Field label="Type de caution">
              <select className={inputClass} value={form.caution_type} onChange={(e) => setForm((f) => ({ ...f, caution_type: e.target.value as OpForm["caution_type"] }))}>
                <option value="S-CAUTION">Soumission</option>
                <option value="B-CAUTION">Bonne fin</option>
              </select>
            </Field>
            <Field label="Date d'échéance">
              <input type="date" className={inputClass} value={form.caution_expiry} onChange={(e) => setForm((f) => ({ ...f, caution_expiry: e.target.value }))} />
            </Field>
          </>
        ) : (
          <Field label="Fournisseur / libellé">
            <input
              className={inputClass}
              list="banque-fournisseurs"
              value={form.fournisseur}
              onChange={(e) => setForm((f) => ({ ...f, fournisseur: e.target.value }))}
            />
            <datalist id="banque-fournisseurs">
              {lists.fournisseurs.map((f) => (
                <option key={f} value={f} />
              ))}
            </datalist>
          </Field>
        )}
      </div>

      <div className="grid gap-3 rounded-lg border border-border p-3 md:grid-cols-3">
        <Field label="Mode">
          <select className={inputClass} value={form.mode} onChange={(e) => setForm((f) => ({ ...f, mode: e.target.value }))}>
            <option value="">—</option>
            {lists.modes.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </Field>
        <Field label="N° mode"><input className={inputClass} value={form.mode_num} onChange={(e) => setForm((f) => ({ ...f, mode_num: e.target.value }))} /></Field>
        <Field label="Pièce mode"><input type="file" accept="image/*,application/pdf" className={inputClass} onChange={(e) => setModeFile(e.target.files?.[0] ?? null)} /></Field>
      </div>

      <div className="grid gap-3 rounded-lg border border-border p-3 md:grid-cols-3">
        <Field label="N° BC"><input className={inputClass} value={form.bc_num} onChange={(e) => setForm((f) => ({ ...f, bc_num: e.target.value }))} /></Field>
        <Field label="Date BC"><input type="date" className={inputClass} value={form.bc_date} onChange={(e) => setForm((f) => ({ ...f, bc_date: e.target.value }))} /></Field>
        <Field label="Pièce BC"><input type="file" accept="image/*,application/pdf" className={inputClass} onChange={(e) => setBcFile(e.target.files?.[0] ?? null)} /></Field>
      </div>

      <div className="grid gap-3 rounded-lg border border-border p-3 md:grid-cols-3">
        <Field label="N° facture"><input className={inputClass} value={form.fac_num} onChange={(e) => setForm((f) => ({ ...f, fac_num: e.target.value }))} /></Field>
        <Field label="Date facture"><input type="date" className={inputClass} value={form.fac_date} onChange={(e) => setForm((f) => ({ ...f, fac_date: e.target.value }))} /></Field>
        <Field label="Pièce facture"><input type="file" accept="image/*,application/pdf" className={inputClass} onChange={(e) => setFacFile(e.target.files?.[0] ?? null)} /></Field>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <Field label="Débit (+) entrée">
          <input type="number" min="0" step="0.01" className={inputClass} value={form.debit} onChange={(e) => setForm((f) => ({ ...f, debit: e.target.value }))} />
        </Field>
        <Field label="Crédit (-) sortie">
          <input type="number" min="0" step="0.01" className={inputClass} value={form.credit} onChange={(e) => setForm((f) => ({ ...f, credit: e.target.value }))} />
        </Field>
        <Field label="Frais bancaires">
          <input type="number" min="0" step="0.01" className={inputClass} value={form.frais} onChange={(e) => setForm((f) => ({ ...f, frais: e.target.value }))} />
        </Field>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button disabled={pending} onClick={() => onSubmit(modeFile, bcFile, facFile)}>
          {pending ? "Enregistrement…" : "Enregistrer"}
        </Button>
      </div>
    </div>
  );
}

function docCell(label: string, url: string | null) {
  const text = label.replace(/🔗/g, "").trim();
  if (!text) return "—";
  if (url && (url.startsWith("http") || url.startsWith("data:"))) {
    return (
      <a href={url} target="_blank" rel="noreferrer" className="font-semibold text-sky-700 underline">
        {text}
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
