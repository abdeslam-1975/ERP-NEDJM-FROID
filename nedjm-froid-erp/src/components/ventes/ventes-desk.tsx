"use client";

import { useEffect, useMemo, useState } from "react";
import { logoutAction } from "@/lib/actions/auth";
import type {
  SalInvoiceDetail,
  VentesContractOption,
  VentesDashboard,
} from "@/lib/actions/ventes";
import { formatDa, formatDateFr } from "@/lib/banque/ledger";
import type { SalesRegisterRow } from "@/lib/ventes/db-types";
import {
  filterRegisterRows,
  kindCounts as countKinds,
  payLabel,
  payStatusOf,
  sumKpis,
  type VentesKindFilter,
  type VentesPayStatus,
} from "@/lib/ventes/register";
import {
  DOC_KIND_LABELS,
  emptyInvoice,
  emptyLine,
  invoiceTotals,
  lineHt,
  type VentesDocKind,
  type VentesInvoice,
  type VentesInvoiceLine,
} from "@/lib/ventes/types";
import { VentesAdminModal } from "@/components/ventes/ventes-admin-modal";
import "./ventes.css";

type Modal = "facture" | "detail" | "encaissement" | "import" | "admin" | "types" | null;

const KIND_ORDER: VentesDocKind[] = ["P", "F", "FP", "RG", "SIT"];

function NumInput({
  value,
  onChange,
}: {
  value: number;
  onChange: (n: number) => void;
}) {
  const [text, setText] = useState(() => (value === 0 ? "" : String(value)));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setText(value === 0 ? "" : String(value));
  }, [value, focused]);

  return (
    <input
      className="num-input"
      type="text"
      inputMode="decimal"
      value={focused ? text : value === 0 ? "" : String(value)}
      onFocus={() => {
        setFocused(true);
        setText(value === 0 ? "" : String(value));
      }}
      onBlur={() => {
        setFocused(false);
        const n = Number(String(text).replace(",", "."));
        onChange(Number.isFinite(n) ? n : 0);
      }}
      onChange={(e) => {
        const raw = e.target.value.replace(/[^\d.,\-]/g, "");
        setText(raw);
        if (raw.trim() === "" || raw === "-" || raw === "." || raw === ",") return;
        const n = Number(raw.replace(",", "."));
        if (Number.isFinite(n)) onChange(n);
      }}
    />
  );
}

function kindLabel(code: string, kinds: VentesDashboard["kinds"]): string {
  const fromDb = kinds.find((k) => k.code === code)?.label_fr;
  if (fromDb) return fromDb;
  if (code in DOC_KIND_LABELS) return DOC_KIND_LABELS[code as VentesDocKind];
  return code;
}

export function VentesDesk({
  initial,
  loadError,
}: {
  initial: VentesDashboard | null;
  loadError?: string;
}) {
  const [data, setData] = useState<VentesDashboard | null>(initial);
  const [kindFilter, setKindFilter] = useState<VentesKindFilter>("TOUS");
  const [payFilter, setPayFilter] = useState<"TOUS" | VentesPayStatus>("TOUS");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState<Modal>(null);
  const [draft, setDraft] = useState<VentesInvoice | null>(null);
  const [detail, setDetail] = useState<SalesRegisterRow | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(loadError || null);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [clientContracts, setClientContracts] = useState<VentesContractOption[]>([]);
  const [payForm, setPayForm] = useState({
    invoiceId: "",
    paymentDate: initial?.today ?? "",
    account: "BEA SETIF",
    method: "Virement",
    amount: "",
  });

  const rows = data?.rows ?? [];
  const today = data?.today ?? "";
  const clients = data?.clients ?? [];

  const visible = useMemo(
    () =>
      filterRegisterRows(rows, {
        kind: kindFilter,
        pay: payFilter,
        dateFrom,
        dateTo,
        search,
      }),
    [rows, kindFilter, payFilter, dateFrom, dateTo, search],
  );

  const kpis = useMemo(() => sumKpis(visible), [visible]);
  const kindCounts = useMemo(() => countKinds(rows), [rows]);

  async function refresh() {
    setBusy(true);
    try {
      const { getVentesDashboard } = await import("@/lib/actions/ventes");
      const result = await getVentesDashboard();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setData(result.data);
      setError(null);
    } finally {
      setBusy(false);
    }
  }

  function flash(ok: string) {
    setError(null);
    setMessage(ok);
  }

  async function loadClientContracts(clientId: string) {
    if (!clientId) {
      setClientContracts([]);
      return;
    }
    const { listVentesClientContracts } = await import("@/lib/actions/ventes");
    const result = await listVentesClientContracts(clientId);
    setClientContracts(result.ok ? result.data : []);
  }

  function applyClientToDraft(clientId: string) {
    const client = clients.find((c) => c.id === clientId);
    setDraft((d) => {
      if (!d) return d;
      if (!client) {
        return { ...d, clientId, contractId: "", contractRef: "" };
      }
      return {
        ...d,
        clientId: client.id,
        clientName: client.nom_fr,
        clientAddress: client.adresse || "",
        nif: client.nif || "",
        article: client.article_imposition || "",
        rc: client.rc || "",
        phone: client.telephone || "",
        contractId: "",
        contractRef: "",
      };
    });
    void loadClientContracts(clientId);
  }

  function detailToDraft(detailData: SalInvoiceDetail): VentesInvoice {
    const inv = detailData.invoice;
    return {
      id: inv.id,
      number: inv.number,
      issueDate: inv.issue_date,
      docKind: (["P", "F", "FP", "RG", "SIT"].includes(inv.doc_kind)
        ? inv.doc_kind
        : "P") as VentesDocKind,
      clientId: inv.client_id,
      contractId: inv.contract_id || "",
      clientName: inv.client_name,
      clientAddress: inv.client_address || "",
      nif: inv.client_nif || "",
      article: inv.client_article || "",
      rc: inv.client_rc || "",
      phone: inv.client_phone || "",
      contractRef: inv.contract_ref || "",
      periodLabel: inv.period_label || "",
      establishedBy: inv.established_by || "",
      exoAttestationNo: inv.exo_attestation_no || "",
      exoAttestationDate: inv.exo_attestation_date || "",
      expectedBank: inv.expected_bank_label || "",
      taxRate: Number(inv.tax_rate) || 0,
      retentionRate: Number(inv.retention_rate) || 0,
      stampAmount: Number(inv.stamp_amount) || 0,
      lines:
        detailData.lines.length > 0
          ? detailData.lines.map((l) => ({
              id: l.id,
              lineNo: l.line_no,
              itemCode: l.item_code || "",
              designation: l.designation,
              unit: l.unit || "",
              qty: Number(l.qty) || 0,
              unitPriceHt: Number(l.unit_price_ht) || 0,
              posePriceHt: Number(l.pose_price_ht) || 0,
              sourceInvoiceRef: l.source_invoice_ref || "",
              sourceAmount: Number(l.source_amount) || 0,
            }))
          : [emptyLine(1)],
      paidAmount: 0,
      paidDate: "",
      paidVia: "",
      status: inv.status,
      persisted: true,
    };
  }

  function openNew(kind: VentesDocKind) {
    if (kind === "RG") {
      setError("Facture RG : disponible en phase M5.");
      return;
    }
    if (data && !data.canCreate) {
      setError("Création refusée (droits Ventes).");
      return;
    }
    setClientContracts([]);
    const draftInv = emptyInvoice(kind, today || new Date().toISOString().slice(0, 10), "");
    if (data?.defaults) {
      draftInv.taxRate = data.defaults.tax_rate;
      draftInv.retentionRate = data.defaults.retention_rate;
      draftInv.stampAmount = data.defaults.stamp_amount;
    }
    if (data?.banks[0]) draftInv.expectedBank = data.banks[0].label;
    setDraft(draftInv);
    setModal("facture");
  }

  function openAdmin() {
    if (data && !data.canAdmin) {
      setError("Admin Ventes réservé à l'administrateur.");
      return;
    }
    setModal("admin");
  }

  async function openDetail(row: SalesRegisterRow) {
    if (row.source === "SAL" && row.status === "BROUILLON") {
      setBusy(true);
      try {
        const { getSalInvoiceDetail } = await import("@/lib/actions/ventes");
        const result = await getSalInvoiceDetail(row.id);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        if (result.data.invoice.doc_kind === "RG") {
          setError("Édition RG : disponible en phase M5.");
          return;
        }
        setDraft(detailToDraft(result.data));
        await loadClientContracts(result.data.invoice.client_id);
        setModal("facture");
      } finally {
        setBusy(false);
      }
      return;
    }
    setDetail(row);
    setModal("detail");
  }

  const payableRows = useMemo(
    () =>
      rows.filter(
        (r) =>
          r.source === "SAL" &&
          r.status === "EMISE" &&
          Number(r.due_ttc) > 0.005,
      ),
    [rows],
  );

  function openPay(row?: SalesRegisterRow) {
    if (data && !data.canEncaisser) {
      setError("Encaissement refusé (droits Ventes).");
      return;
    }
    if (row && row.source !== "SAL") {
      setError("Facture hors module Ventes — encaissement non géré ici pour l’instant.");
      return;
    }
    if (row && row.status !== "EMISE") {
      setError("Émettez la facture avant l’encaissement.");
      return;
    }
    const unpaid = payableRows.find((r) => Number(r.due_ttc) > 0.005);
    const target = row && row.source === "SAL" ? row : unpaid;
    if (!target) {
      setError("Aucune facture Ventes émise à encaisser.");
      return;
    }
    setPayForm({
      invoiceId: target.id,
      paymentDate: today || new Date().toISOString().slice(0, 10),
      account: target.expected_bank_label || data?.banks[0]?.label || "",
      method: data?.paymentModes[0]?.label || "Virement",
      amount: String(Number(target.due_ttc) > 0 ? target.due_ttc : target.net_payable),
    });
    setModal("encaissement");
  }

  function updateDraft<K extends keyof VentesInvoice>(key: K, value: VentesInvoice[K]) {
    setDraft((d) => (d ? { ...d, [key]: value } : d));
  }

  function updateLine(lineId: string, patch: Partial<VentesInvoiceLine>) {
    setDraft((d) => {
      if (!d) return d;
      return {
        ...d,
        lines: d.lines.map((l) => (l.id === lineId ? { ...l, ...patch } : l)),
      };
    });
  }

  function addLine() {
    setDraft((d) => {
      if (!d) return d;
      const n = d.lines.length + 1;
      return { ...d, lines: [...d.lines, emptyLine(n)] };
    });
  }

  function removeLine(lineId: string) {
    setDraft((d) => {
      if (!d || d.lines.length <= 1) return d;
      return {
        ...d,
        lines: d.lines
          .filter((l) => l.id !== lineId)
          .map((l, i) => ({ ...l, lineNo: i + 1 })),
      };
    });
  }

  async function saveDraft(asIssued: boolean) {
    if (!draft) return;
    if (draft.docKind === "RG") {
      setError("Facture RG : disponible en phase M5.");
      return;
    }
    if (!draft.clientId) {
      setError("Sélectionnez un client du référentiel.");
      return;
    }
    if (!draft.clientName.trim()) {
      setError("Client obligatoire.");
      return;
    }
    const lines = draft.lines.filter(
      (l) => l.designation.trim() || l.unitPriceHt || l.qty || l.posePriceHt,
    );
    if (lines.length === 0) {
      setError("Ajoutez au moins une ligne.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const { saveSalInvoice } = await import("@/lib/actions/ventes");
      const result = await saveSalInvoice({
        id: draft.persisted ? draft.id : undefined,
        doc_kind: draft.docKind,
        number: draft.number,
        issue_date: draft.issueDate,
        client_id: draft.clientId,
        contract_id: draft.contractId || null,
        client_name: draft.clientName,
        client_address: draft.clientAddress,
        client_nif: draft.nif,
        client_article: draft.article,
        client_rc: draft.rc,
        client_phone: draft.phone,
        contract_ref: draft.contractRef,
        period_label: draft.periodLabel,
        established_by: draft.establishedBy,
        expected_bank_label: draft.expectedBank,
        tax_rate: draft.taxRate,
        retention_rate: draft.retentionRate,
        stamp_amount: draft.stampAmount,
        exo_attestation_no: draft.exoAttestationNo,
        exo_attestation_date: draft.exoAttestationDate || null,
        issue: asIssued,
        lines: lines.map((l) => ({
          item_code: l.itemCode,
          designation: l.designation,
          unit: l.unit,
          qty: l.qty,
          unit_price_ht: l.unitPriceHt,
          pose_price_ht: l.posePriceHt,
          source_invoice_ref: l.sourceInvoiceRef,
          source_amount: l.sourceAmount,
        })),
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setModal(null);
      setDraft(null);
      flash(
        asIssued
          ? `Facture N° ${result.data.number} émise (${formatDa(result.data.net_payable)} DA).`
          : `Brouillon N° ${result.data.number} enregistré.`,
      );
      await refresh();
    } finally {
      setSaving(false);
    }
  }

  async function applyPayment() {
    const amount = Number(String(payForm.amount).replace(",", "."));
    if (!payForm.invoiceId || !(amount > 0)) {
      setError("Montant d'encaissement invalide.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const { recordSalPayment } = await import("@/lib/actions/ventes");
      const result = await recordSalPayment({
        invoice_id: payForm.invoiceId,
        payment_date: payForm.paymentDate,
        amount_ttc: amount,
        account_label: payForm.account,
        method_label: payForm.method,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setModal(null);
      flash(
        `Encaissement ${formatDa(result.data.amount_ttc)} DA enregistré (interne Ventes). Reste dû : ${formatDa(result.data.due_ttc)} DA.`,
      );
      await refresh();
    } finally {
      setSaving(false);
    }
  }

  function exportCsv() {
    const header = [
      "Source",
      "N° FACT",
      "Date",
      "Client",
      "Contrat",
      "Type",
      "HT",
      "TVA",
      "R.G",
      "Timbre",
      "Net",
      "Payé",
      "Dû",
      "Régler Le",
      "Banque",
      "Statut",
    ];
    const body = visible.map((row) => [
      row.source,
      row.invoice_number,
      row.issue_date,
      row.client_name,
      row.contract_ref ?? "",
      row.doc_kind,
      row.total_ht,
      row.total_tva,
      row.retention_amount,
      row.stamp_amount,
      row.net_payable,
      row.paid_ttc,
      row.due_ttc,
      row.last_payment_date ?? "",
      row.expected_bank_label ?? "",
      payLabel(payStatusOf(row)),
    ]);
    const csv = [header, ...body]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";"))
      .join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ventes-recap-${today || "export"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function printPdf() {
    const body = visible
      .map((row) => {
        return `<tr>
          <td>${row.invoice_number}</td>
          <td>${formatDateFr(row.issue_date)}</td>
          <td style="text-align:left">${row.client_name}</td>
          <td>${row.doc_kind}</td>
          <td>${formatDa(row.total_ht)}</td>
          <td>${formatDa(row.total_tva)}</td>
          <td>${formatDa(row.retention_amount)}</td>
          <td>${formatDa(row.stamp_amount)}</td>
          <td>${formatDa(row.net_payable)}</td>
          <td>${formatDateFr(row.last_payment_date) || "—"}</td>
          <td>${row.expected_bank_label || "—"}</td>
          <td>${payLabel(payStatusOf(row))}</td>
        </tr>`;
      })
      .join("");
    const html = `<!doctype html><html><head><title>RECAP VENTES</title>
      <style>
        body{font-family:Segoe UI,sans-serif;padding:24px;color:#111}
        h1{font-size:18px;margin:0 0 12px}
        table{border-collapse:collapse;width:100%;font-size:11px}
        th{background:#1a472a;color:#fff;padding:6px}
        td{border-bottom:1px solid #eee;padding:5px;text-align:center}
      </style></head><body>
      <h1>GESTION VENTES — Récapitulatif</h1>
      <table><thead><tr>
        <th>N°</th><th>Date</th><th>Client</th><th>Type</th><th>HT</th><th>TVA</th><th>RG</th><th>Timbre</th><th>Net</th><th>Réglé le</th><th>Par</th><th>Statut</th>
      </tr></thead><tbody>${body}</tbody></table>
      </body></html>`;
    const w = window.open("", "_blank", "noopener,noreferrer,width=1100,height=800");
    if (!w) return;
    w.document.write(html);
    w.document.close();
    w.focus();
    w.print();
  }

  const draftTotals = draft ? invoiceTotals(draft) : null;
  const kinds = data?.kinds ?? [];

  return (
    <div className="ventes-app">
      <div className="top-navbar">
        <div className="brand">📄 GESTION VENTES</div>
        <div className="user-info">
          <span>Journal commercial — unifié Finance</span>
          <span className="role-badge">{busy ? "…" : "LIVE"}</span>
        </div>
      </div>

      <div className="ui-live-banner">
        Journal Ventes — factures + encaissement interne (sans lien Banque/Caisse/contrats). RG →
        M5.
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {message && <div className="alert alert-ok">{message}</div>}

      <div className="kpi-grid-5">
        <div className="kpi-card kpi-ht">
          <div className="kpi-label">CA HT</div>
          <div className="kpi-value">{formatDa(kpis.ht)}</div>
          <small>Filtre courant</small>
        </div>
        <div className="kpi-card kpi-tva">
          <div className="kpi-label">TVA</div>
          <div className="kpi-value">{formatDa(kpis.tva)}</div>
          <small>Montant TVA</small>
        </div>
        <div className="kpi-card kpi-rg">
          <div className="kpi-label">R. Garantie</div>
          <div className="kpi-value">{formatDa(kpis.rg)}</div>
          <small>Retenue calculée</small>
        </div>
        <div className="kpi-card kpi-net">
          <div className="kpi-label">Net à payer</div>
          <div className="kpi-value">{formatDa(kpis.net)}</div>
          <small>Total facturé</small>
        </div>
        <div className="kpi-card kpi-due">
          <div className="kpi-label">Reste dû</div>
          <div className="kpi-value">{formatDa(kpis.due)}</div>
          <small>À recouvrer</small>
        </div>
      </div>

      <div className="panel">
        <div className="kind-tabs">
          <span className="bank-tabs-label">Types :</span>
          <button
            type="button"
            className={`btn-kind${kindFilter === "TOUS" ? " active" : ""}`}
            onClick={() => setKindFilter("TOUS")}
          >
            TOUS
            <span className="kind-count">{kindCounts.TOUS}</span>
          </button>
          {KIND_ORDER.map((k) => (
            <button
              key={k}
              type="button"
              className={`btn-kind${kindFilter === k ? " active" : ""}`}
              onClick={() => setKindFilter(k)}
              title={kindLabel(k, kinds)}
            >
              {k}
              <span className="kind-count">{kindCounts[k]}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="panel action-bar">
        <button type="button" className="btn-action btn-facture" onClick={() => openNew("P")}>
          + FACTURE
        </button>
        <button type="button" className="btn-action btn-types" onClick={() => setModal("types")}>
          TYPES
        </button>
        <button type="button" className="btn-action btn-encaisser" onClick={() => openPay()}>
          ENCAISSEMENT
        </button>
        <button type="button" className="btn-action btn-import" onClick={() => setModal("import")}>
          IMPORT
        </button>
        <button type="button" className="btn-action btn-admin" onClick={openAdmin}>
          ADMIN
        </button>
        <button type="button" className="btn-action btn-export" onClick={() => void refresh()} disabled={busy}>
          ACTUALISER
        </button>
        <div className="filters">
          <span style={{ fontSize: 11, fontWeight: 700 }}>Du</span>
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          <span style={{ fontSize: 11, fontWeight: 700 }}>Au</span>
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          <select value={payFilter} onChange={(e) => setPayFilter(e.target.value as typeof payFilter)}>
            <option value="TOUS">Paiement: tous</option>
            <option value="PAYE">Payé</option>
            <option value="PARTIEL">Partiel</option>
            <option value="IMPAYE">Impayé</option>
          </select>
          <button type="button" className="btn-filter">
            Filtrer
          </button>
          <button
            type="button"
            className="btn-light"
            onClick={() => {
              setDateFrom("");
              setDateTo("");
              setSearch("");
              setPayFilter("TOUS");
              setKindFilter("TOUS");
            }}
          >
            ✕
          </button>
          <input
            type="text"
            placeholder="Rechercher..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button type="button" className="btn-action btn-export" onClick={exportCsv}>
            EXPORT
          </button>
          <button type="button" className="btn-action btn-pdf" onClick={printPdf}>
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
          Journal : <strong>v_sales_register</strong> — {visible.length} facture(s) / {rows.length} chargée(s)
        </div>
        <div>
          Impayé filtré : <strong className="solde">{formatDa(kpis.due)}</strong>{" "}
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
                    ["SRC", 50],
                    ["N° FACT", 70],
                    ["DATE", 90],
                    ["CLIENT", 220],
                    ["CONTRAT", 140],
                    ["TYPE", 55],
                    ["HT", 100],
                    ["TVA", 90],
                    ["R.G", 90],
                    ["TIMBRE", 80],
                    ["NET", 110],
                    ["RÉGLER LE", 90],
                    ["PAR", 100],
                    ["STATUT", 80],
                    ["ACTIONS", 110],
                  ] as const
                ).map(([h, w]) => (
                  <th key={h} style={{ width: w }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {!data ? (
                <tr>
                  <td colSpan={15} className="empty-rows">
                    Impossible de charger le journal ventes
                  </td>
                </tr>
              ) : visible.length === 0 ? (
                <tr>
                  <td colSpan={15} className="empty-rows">
                    <span className="empty-ico" aria-hidden>
                      📥
                    </span>
                    Aucune facture pour ce filtre
                  </td>
                </tr>
              ) : (
                visible.map((row) => {
                  const pay = payStatusOf(row);
                  const rowClass =
                    pay === "PAYE" ? "row-paye" : pay === "PARTIEL" ? "row-partiel" : "row-impaye";
                  return (
                    <tr key={`${row.source}-${row.id}`} className={rowClass}>
                      <td>
                        <span className={`badge-src ${row.source === "SAL" ? "sal" : "contract"}`}>
                          {row.source === "SAL" ? "SAL" : "CTR"}
                        </span>
                      </td>
                      <td>{row.invoice_number}</td>
                      <td>{formatDateFr(row.issue_date)}</td>
                      <td className="client-cell">{row.client_name}</td>
                      <td>{row.contract_ref || "—"}</td>
                      <td>
                        <span className={`badge-kind ${row.doc_kind}`} title={kindLabel(row.doc_kind, kinds)}>
                          {row.doc_kind}
                        </span>
                      </td>
                      <td className="debit-cell">{formatDa(row.total_ht)}</td>
                      <td>{formatDa(row.total_tva)}</td>
                      <td>{formatDa(row.retention_amount)}</td>
                      <td>{formatDa(row.stamp_amount)}</td>
                      <td className="solde-cell">{formatDa(row.net_payable)}</td>
                      <td>{formatDateFr(row.last_payment_date) || "—"}</td>
                      <td>{row.expected_bank_label || "—"}</td>
                      <td>
                        <span
                          className={`badge-pay ${
                            pay === "PAYE" ? "paye" : pay === "PARTIEL" ? "partiel" : "impaye"
                          }`}
                        >
                          {payLabel(pay)}
                        </span>
                      </td>
                      <td className="actions-cell">
                        <button
                          type="button"
                          className="act-btn act-edit"
                          title="Ouvrir"
                          onClick={() => openDetail(row)}
                        >
                          <span className="act-ico">✎</span>
                        </button>
                        <button
                          type="button"
                          className="act-btn act-rapp"
                          title="Encaisser"
                          onClick={() => openPay(row)}
                        >
                          <span className="act-ico">€</span>
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {modal === "types" && (
        <div className="overlay">
          <div className="modal narrow">
            <div className="modal-head navy">
              <span>Choisir le type de facture</span>
              <button type="button" className="modal-close" onClick={() => setModal(null)}>
                ×
              </button>
            </div>
            <div className="modal-body" style={{ display: "grid", gap: 8 }}>
              {(kinds.length
                ? kinds.map((k) => k.code as VentesDocKind)
                : KIND_ORDER
              ).map((k) => (
                <button
                  key={k}
                  type="button"
                  className="btn-action btn-op"
                  style={{ justifyContent: "flex-start" }}
                  onClick={() => openNew(k)}
                >
                  <strong style={{ minWidth: 36 }}>{k}</strong>
                  <span>{kindLabel(k, kinds)}</span>
                </button>
              ))}
            </div>
            <div className="modal-foot">
              <button type="button" className="btn-light" onClick={() => setModal(null)}>
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      {modal === "detail" && detail && (
        <div className="overlay">
          <div className="modal narrow">
            <div className="modal-head green">
              <span>
                Facture {detail.doc_kind} — N° {detail.invoice_number}
              </span>
              <button
                type="button"
                className="modal-close"
                onClick={() => {
                  setModal(null);
                  setDetail(null);
                }}
              >
                ×
              </button>
            </div>
            <div className="modal-body" style={{ display: "grid", gap: 8, fontSize: 13 }}>
              <div>
                <strong>Source :</strong> {detail.source}
              </div>
              <div>
                <strong>Client :</strong> {detail.client_name}
              </div>
              <div>
                <strong>Contrat :</strong> {detail.contract_ref || "—"}
              </div>
              <div>
                <strong>Date :</strong> {formatDateFr(detail.issue_date)}
              </div>
              <div>
                <strong>HT / TVA / Net :</strong> {formatDa(detail.total_ht)} /{" "}
                {formatDa(detail.total_tva)} / {formatDa(detail.net_payable)} DA
              </div>
              <div>
                <strong>Payé / Dû :</strong> {formatDa(detail.paid_ttc)} / {formatDa(detail.due_ttc)} DA
              </div>
              <div>
                <strong>Statut doc :</strong> {detail.status} — paiement{" "}
                {payLabel(payStatusOf(detail))}
              </div>
              <p style={{ margin: "8px 0 0", color: "#64748b", lineHeight: 1.45 }}>
                Édition complète des lignes (sal_invoice_lines) en phase M3.
              </p>
            </div>
            <div className="modal-foot">
              <button
                type="button"
                className="btn-light"
                onClick={() => {
                  setModal(null);
                  setDetail(null);
                }}
              >
                Fermer
              </button>
              <button
                type="button"
                className="btn-action btn-encaisser"
                onClick={() => {
                  const row = detail;
                  setModal(null);
                  setDetail(null);
                  openPay(row);
                }}
              >
                Encaisser
              </button>
            </div>
          </div>
        </div>
      )}

      {modal === "facture" && draft && draftTotals && (
        <div className="overlay">
          <div className="modal invoice-modal">
            <div className="modal-head green">
              <span>
                Facture {draft.docKind} — N° {draft.number || "…"} ({kindLabel(draft.docKind, kinds)})
              </span>
              <button
                type="button"
                className="modal-close"
                onClick={() => {
                  setModal(null);
                  setDraft(null);
                }}
              >
                ×
              </button>
            </div>
            <div className="modal-body">
              <div className="grid-3">
                <div>
                  <label className="form-label">Facture N°</label>
                  <input
                    value={draft.number}
                    onChange={(e) => updateDraft("number", e.target.value)}
                    placeholder="Auto si vide"
                  />
                </div>
                <div>
                  <label className="form-label">Date</label>
                  <input
                    type="date"
                    value={draft.issueDate}
                    onChange={(e) => updateDraft("issueDate", e.target.value)}
                  />
                </div>
                <div>
                  <label className="form-label">Type</label>
                  <select
                    value={draft.docKind}
                    onChange={(e) => {
                      const k = e.target.value as VentesDocKind;
                      if (k === "RG") {
                        setError("Facture RG : disponible en phase M5.");
                        return;
                      }
                      updateDraft("docKind", k);
                    }}
                    disabled={draft.persisted}
                  >
                    {KIND_ORDER.filter((k) => k !== "RG").map((k) => (
                      <option key={k} value={k}>
                        {k} — {kindLabel(k, kinds)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="span-3">
                  <label className="form-label">Client (référentiel)</label>
                  <select
                    value={draft.clientId}
                    onChange={(e) => applyClientToDraft(e.target.value)}
                  >
                    <option value="">— Choisir un client —</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nom_fr}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="span-3">
                  <label className="form-label">Nom figé sur facture</label>
                  <input
                    value={draft.clientName}
                    onChange={(e) => updateDraft("clientName", e.target.value)}
                    placeholder="Raison sociale"
                  />
                </div>
                <div>
                  <label className="form-label">ID fiscale (NIF)</label>
                  <input value={draft.nif} onChange={(e) => updateDraft("nif", e.target.value)} />
                </div>
                <div>
                  <label className="form-label">Article</label>
                  <input
                    value={draft.article}
                    onChange={(e) => updateDraft("article", e.target.value)}
                  />
                </div>
                <div>
                  <label className="form-label">R.C</label>
                  <input value={draft.rc} onChange={(e) => updateDraft("rc", e.target.value)} />
                </div>
                <div>
                  <label className="form-label">Contact Tél</label>
                  <input value={draft.phone} onChange={(e) => updateDraft("phone", e.target.value)} />
                </div>
                <div>
                  <label className="form-label">Contrat (optionnel)</label>
                  <select
                    value={draft.contractId}
                    onChange={(e) => {
                      const id = e.target.value;
                      const c = clientContracts.find((x) => x.id === id);
                      setDraft((d) =>
                        d
                          ? {
                              ...d,
                              contractId: id,
                              contractRef: c?.contract_number || d.contractRef,
                            }
                          : d,
                      );
                    }}
                    disabled={!draft.clientId}
                  >
                    <option value="">— Sans contrat —</option>
                    {clientContracts.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.contract_number} ({c.status})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="form-label">Réf. contrat / BC</label>
                  <input
                    value={draft.contractRef}
                    onChange={(e) => updateDraft("contractRef", e.target.value)}
                  />
                </div>
                <div>
                  <label className="form-label">Banque prévue</label>
                  {(data?.banks.length ?? 0) > 0 ? (
                    <select
                      value={draft.expectedBank}
                      onChange={(e) => updateDraft("expectedBank", e.target.value)}
                    >
                      <option value="">—</option>
                      {data!.banks.map((b) => (
                        <option key={b.id} value={b.label}>
                          {b.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      value={draft.expectedBank}
                      onChange={(e) => updateDraft("expectedBank", e.target.value)}
                    />
                  )}
                </div>
                <div>
                  <label className="form-label">Établie par</label>
                  {(data?.etabliePar.length ?? 0) > 0 ? (
                    <select
                      value={draft.establishedBy}
                      onChange={(e) => updateDraft("establishedBy", e.target.value)}
                    >
                      <option value="">—</option>
                      {data!.etabliePar.map((b) => (
                        <option key={b.id} value={b.label}>
                          {b.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      value={draft.establishedBy}
                      onChange={(e) => updateDraft("establishedBy", e.target.value)}
                    />
                  )}
                </div>
                <div>
                  <label className="form-label">Taux TVA</label>
                  <select
                    value={String(draft.taxRate)}
                    onChange={(e) => updateDraft("taxRate", Number(e.target.value))}
                  >
                    <option value="0">0 % (exonéré)</option>
                    <option value="0.19">19 %</option>
                  </select>
                </div>
                <div>
                  <label className="form-label">% R. Garantie</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="100"
                    value={Number((draft.retentionRate * 100).toFixed(4))}
                    onChange={(e) => {
                      const pct = Number(e.target.value);
                      updateDraft("retentionRate", Number.isFinite(pct) ? pct / 100 : 0);
                    }}
                  />
                </div>
                <div>
                  <label className="form-label">Timbre (DA)</label>
                  <NumInput
                    value={draft.stampAmount}
                    onChange={(n) => updateDraft("stampAmount", n)}
                  />
                </div>
                <div>
                  <label className="form-label">Période</label>
                  <input
                    value={draft.periodLabel}
                    onChange={(e) => updateDraft("periodLabel", e.target.value)}
                  />
                </div>
              </div>

              <div style={{ marginTop: 14, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <strong style={{ fontSize: 13 }}>Lignes</strong>
                <button type="button" className="btn-light" onClick={addLine}>
                  + Ligne
                </button>
              </div>
              <table className="lines-table">
                <thead>
                  <tr>
                    <th style={{ width: 40 }}>N°</th>
                    <th>Désignation</th>
                    {draft.docKind !== "SIT" && <th style={{ width: 70 }}>Qté</th>}
                    {draft.docKind === "FP" && <th style={{ width: 90 }}>P. Fourn.</th>}
                    {draft.docKind === "FP" && <th style={{ width: 90 }}>P. Pose</th>}
                    {(draft.docKind === "P" || draft.docKind === "F") && (
                      <th style={{ width: 90 }}>P.U HT</th>
                    )}
                    {draft.docKind === "SIT" && <th style={{ width: 110 }}>Montant DA</th>}
                    <th style={{ width: 100 }}>Total</th>
                    <th style={{ width: 40 }} />
                  </tr>
                </thead>
                <tbody>
                  {draft.lines.map((line) => {
                    const mt = lineHt(line, draft.docKind);
                    return (
                      <tr key={line.id}>
                        <td>{line.lineNo}</td>
                        <td>
                          <input
                            value={line.designation}
                            onChange={(e) => updateLine(line.id, { designation: e.target.value })}
                          />
                        </td>
                        {draft.docKind !== "SIT" && (
                          <td>
                            <NumInput value={line.qty} onChange={(n) => updateLine(line.id, { qty: n })} />
                          </td>
                        )}
                        {draft.docKind === "FP" && (
                          <td>
                            <NumInput
                              value={line.unitPriceHt}
                              onChange={(n) => updateLine(line.id, { unitPriceHt: n })}
                            />
                          </td>
                        )}
                        {draft.docKind === "FP" && (
                          <td>
                            <NumInput
                              value={line.posePriceHt}
                              onChange={(n) => updateLine(line.id, { posePriceHt: n })}
                            />
                          </td>
                        )}
                        {(draft.docKind === "P" || draft.docKind === "F" || draft.docKind === "SIT") && (
                          <td>
                            <NumInput
                              value={line.unitPriceHt}
                              onChange={(n) => updateLine(line.id, { unitPriceHt: n })}
                            />
                          </td>
                        )}
                        <td style={{ fontWeight: 700, textAlign: "right", paddingRight: 8 }}>
                          {formatDa(mt)}
                        </td>
                        <td>
                          <button
                            type="button"
                            className="act-btn act-del"
                            title="Supprimer ligne"
                            onClick={() => removeLine(line.id)}
                          >
                            <span className="act-ico">×</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              <div className="totals-box">
                <div className="tot-row">
                  <span>Total HT</span>
                  <strong>{formatDa(draftTotals.totalHt)} DA</strong>
                </div>
                <div className="tot-row">
                  <span>TVA</span>
                  <strong>{formatDa(draftTotals.totalTva)} DA</strong>
                </div>
                <div className="tot-row strong">
                  <span>Net à payer</span>
                  <span>{formatDa(draftTotals.netPayable)} DA</span>
                </div>
              </div>
            </div>
            <div className="modal-foot">
              <button
                type="button"
                className="btn-light"
                onClick={() => {
                  setModal(null);
                  setDraft(null);
                }}
              >
                Annuler
              </button>
              <button
                type="button"
                className="btn-action btn-admin"
                disabled={saving}
                onClick={() => void saveDraft(false)}
              >
                {saving ? "…" : "Brouillon"}
              </button>
              <button
                type="button"
                className="btn-action btn-op"
                disabled={saving}
                onClick={() => void saveDraft(true)}
              >
                {saving ? "…" : "Émettre"}
              </button>
            </div>
          </div>
        </div>
      )}

      {modal === "encaissement" && (
        <div className="overlay">
          <div className="modal narrow">
            <div className="modal-head navy">
              <span>Encaissement client</span>
              <button type="button" className="modal-close" onClick={() => setModal(null)}>
                ×
              </button>
            </div>
            <div className="modal-body" style={{ display: "grid", gap: 12 }}>
              <div className="alert alert-ok">
                Encaissement interne Ventes uniquement — pas d’écriture Banque/Caisse.
              </div>
              <div>
                <label className="form-label">Facture (SAL émise)</label>
                <select
                  value={payForm.invoiceId}
                  onChange={(e) => {
                    const inv = payableRows.find((x) => x.id === e.target.value);
                    setPayForm((f) => ({
                      ...f,
                      invoiceId: e.target.value,
                      amount: inv
                        ? String(Number(inv.due_ttc) > 0 ? inv.due_ttc : inv.net_payable)
                        : f.amount,
                      account: inv?.expected_bank_label || f.account,
                    }));
                  }}
                >
                  {payableRows.map((inv) => (
                    <option key={inv.id} value={inv.id}>
                      N° {inv.invoice_number} — {inv.client_name} ({formatDa(inv.due_ttc)} dû)
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="form-label">Date</label>
                <input
                  type="date"
                  value={payForm.paymentDate}
                  onChange={(e) => setPayForm((f) => ({ ...f, paymentDate: e.target.value }))}
                />
              </div>
              <div>
                <label className="form-label">Banque (libellé)</label>
                {(data?.banks.length ?? 0) > 0 ? (
                  <select
                    value={payForm.account}
                    onChange={(e) => setPayForm((f) => ({ ...f, account: e.target.value }))}
                  >
                    <option value="">—</option>
                    {data!.banks.map((b) => (
                      <option key={b.id} value={b.label}>
                        {b.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    value={payForm.account}
                    onChange={(e) => setPayForm((f) => ({ ...f, account: e.target.value }))}
                  />
                )}
              </div>
              <div>
                <label className="form-label">Mode</label>
                <select
                  value={payForm.method}
                  onChange={(e) => setPayForm((f) => ({ ...f, method: e.target.value }))}
                >
                  {(data?.paymentModes.length
                    ? data.paymentModes.map((m) => m.label)
                    : ["Virement", "Chèque", "Espèces"]
                  ).map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="form-label">Montant (DA)</label>
                <input
                  type="number"
                  step="0.01"
                  value={payForm.amount}
                  onChange={(e) => setPayForm((f) => ({ ...f, amount: e.target.value }))}
                />
              </div>
            </div>
            <div className="modal-foot">
              <button type="button" className="btn-light" onClick={() => setModal(null)}>
                Annuler
              </button>
              <button
                type="button"
                className="btn-action btn-encaisser"
                disabled={saving || payableRows.length === 0}
                onClick={() => void applyPayment()}
              >
                {saving ? "…" : "Valider"}
              </button>
            </div>
          </div>
        </div>
      )}

      {modal === "import" && (
        <div className="overlay">
          <div className="modal narrow">
            <div className="modal-head teal">
              <span>Import Excel (Ventes)</span>
              <button type="button" className="modal-close" onClick={() => setModal(null)}>
                ×
              </button>
            </div>
            <div className="modal-body">
              <p style={{ margin: 0, fontSize: 13, color: "#334155", lineHeight: 1.5 }}>
                Import archive Excel prévu en phase M7 (hors 2014/2015 d’analyse). Aucun fichier
                traité ici.
              </p>
            </div>
            <div className="modal-foot">
              <button type="button" className="btn-light" onClick={() => setModal(null)}>
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      {modal === "admin" && (
        <VentesAdminModal
          onClose={() => setModal(null)}
          onChanged={() => void refresh()}
          onError={(msg) => {
            setMessage(null);
            setError(msg);
          }}
          onOk={(msg) => flash(msg)}
        />
      )}
    </div>
  );
}
