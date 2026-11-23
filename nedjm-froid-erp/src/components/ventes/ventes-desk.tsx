"use client";

import { useEffect, useMemo, useState } from "react";
import { logoutAction } from "@/lib/actions/auth";
import { formatDa, formatDateFr } from "@/lib/banque/ledger";
import {
  DOC_KIND_LABELS,
  buildMockInvoices,
  emptyInvoice,
  emptyLine,
  invoiceTotals,
  lineHt,
  type VentesDocKind,
  type VentesInvoice,
  type VentesInvoiceLine,
  type VentesKindFilter,
} from "@/lib/ventes/types";
import "./ventes.css";

type Modal = "facture" | "encaissement" | "import" | "admin" | "types" | null;

const KIND_ORDER: VentesDocKind[] = ["P", "F", "FP", "RG", "SIT"];

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

/** Champ numérique contrôlé sans préfixe "0" parasite à la saisie. */
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

function nextNumber(list: VentesInvoice[]) {
  const max = list.reduce((m, inv) => Math.max(m, Number(inv.number) || 0), 0);
  return String(max + 1);
}

function payLabel(status: ReturnType<typeof invoiceTotals>["payStatus"]) {
  if (status === "PAYE") return "Payé";
  if (status === "PARTIEL") return "Partiel";
  return "Impayé";
}

export function VentesDesk() {
  const [invoices, setInvoices] = useState<VentesInvoice[]>(() => buildMockInvoices());
  const [kindFilter, setKindFilter] = useState<VentesKindFilter>("TOUS");
  const [payFilter, setPayFilter] = useState<"TOUS" | "PAYE" | "PARTIEL" | "IMPAYE">("TOUS");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState<Modal>(null);
  const [draft, setDraft] = useState<VentesInvoice | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [payForm, setPayForm] = useState({
    invoiceId: "",
    paymentDate: todayIso(),
    account: "BEA SETIF",
    method: "Virement",
    amount: "",
  });

  const enriched = useMemo(
    () =>
      invoices.map((inv) => ({
        inv,
        totals: invoiceTotals(inv),
      })),
    [invoices],
  );

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return enriched.filter(({ inv, totals }) => {
      if (kindFilter !== "TOUS" && inv.docKind !== kindFilter) return false;
      if (payFilter !== "TOUS" && totals.payStatus !== payFilter) return false;
      if (dateFrom && inv.issueDate < dateFrom) return false;
      if (dateTo && inv.issueDate > dateTo) return false;
      if (!q) return true;
      const hay = [
        inv.number,
        inv.clientName,
        inv.contractRef,
        inv.docKind,
        inv.expectedBank,
        inv.paidVia,
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [enriched, kindFilter, payFilter, dateFrom, dateTo, search]);

  const kpis = useMemo(() => {
    const base = visible.reduce(
      (acc, { totals }) => {
        acc.ht += totals.totalHt;
        acc.tva += totals.totalTva;
        acc.rg += totals.retentionAmount;
        acc.net += totals.netPayable;
        acc.due += totals.due;
        return acc;
      },
      { ht: 0, tva: 0, rg: 0, net: 0, due: 0 },
    );
    return base;
  }, [visible]);

  const kindCounts = useMemo(() => {
    const counts: Record<VentesKindFilter, number> = {
      TOUS: enriched.length,
      P: 0,
      F: 0,
      FP: 0,
      RG: 0,
      SIT: 0,
    };
    for (const { inv } of enriched) counts[inv.docKind] += 1;
    return counts;
  }, [enriched]);

  function flash(ok: string) {
    setError(null);
    setMessage(ok);
  }

  function openNew(kind: VentesDocKind) {
    setDraft(emptyInvoice(kind, todayIso(), nextNumber(invoices)));
    setModal("facture");
  }

  function openEdit(inv: VentesInvoice) {
    setDraft({
      ...inv,
      lines: inv.lines.map((l) => ({ ...l })),
    });
    setModal("facture");
  }

  function openPay(inv?: VentesInvoice) {
    const unpaid = visible.find(({ totals }) => totals.due > 0)?.inv;
    const target = inv ?? unpaid ?? visible[0]?.inv;
    if (!target) {
      setError("Aucune facture à encaisser.");
      return;
    }
    const { due, netPayable } = invoiceTotals(target);
    setPayForm({
      invoiceId: target.id,
      paymentDate: todayIso(),
      account: target.expectedBank || "BEA SETIF",
      method: "Virement",
      amount: String(due > 0 ? due : netPayable),
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

  function saveDraft(asIssued: boolean) {
    if (!draft) return;
    if (!draft.number.trim()) {
      setError("N° de facture obligatoire.");
      return;
    }
    if (!draft.clientName.trim()) {
      setError("Client obligatoire.");
      return;
    }
    const saved: VentesInvoice = {
      ...draft,
      status: asIssued ? "EMISE" : "BROUILLON",
      lines: draft.lines.filter(
        (l) =>
          l.designation.trim() ||
          l.unitPriceHt ||
          l.sourceAmount ||
          l.qty,
      ),
    };
    if (saved.lines.length === 0) {
      setError("Ajoutez au moins une ligne.");
      return;
    }
    setInvoices((list) => {
      const idx = list.findIndex((x) => x.id === saved.id);
      if (idx >= 0) {
        const copy = [...list];
        copy[idx] = saved;
        return copy;
      }
      return [saved, ...list];
    });
    setModal(null);
    setDraft(null);
    flash(
      asIssued
        ? `Facture N° ${saved.number} enregistrée (mock UI).`
        : `Brouillon N° ${saved.number} conservé (mock UI).`,
    );
  }

  function applyPayment() {
    const amount = Number(String(payForm.amount).replace(",", "."));
    if (!payForm.invoiceId || !(amount > 0)) {
      setError("Montant d'encaissement invalide.");
      return;
    }
    setInvoices((list) =>
      list.map((inv) => {
        if (inv.id !== payForm.invoiceId) return inv;
        return {
          ...inv,
          paidAmount: Math.round((inv.paidAmount + amount) * 100) / 100,
          paidDate: payForm.paymentDate,
          paidVia: payForm.account,
        };
      }),
    );
    setModal(null);
    flash(`Encaissement de ${formatDa(amount)} DA enregistré (mock UI — pas encore lié à la Banque).`);
  }

  function exportCsv() {
    const header = [
      "N° FACT",
      "Date",
      "Client",
      "Type",
      "HT",
      "TVA",
      "R.G",
      "Timbre",
      "Net",
      "Régler Le",
      "Régler par",
      "Statut",
    ];
    const rows = visible.map(({ inv, totals }) => [
      inv.number,
      inv.issueDate,
      inv.clientName,
      inv.docKind,
      totals.totalHt,
      totals.totalTva,
      totals.retentionAmount,
      totals.stamp,
      totals.netPayable,
      inv.paidDate,
      inv.paidVia,
      payLabel(totals.payStatus),
    ]);
    const csv = [header, ...rows]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";"))
      .join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ventes-recap-mock-${todayIso()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function printPdf() {
    const rows = visible
      .map(({ inv, totals }) => {
        return `<tr>
          <td>${inv.number}</td>
          <td>${formatDateFr(inv.issueDate)}</td>
          <td style="text-align:left">${inv.clientName}</td>
          <td>${inv.docKind}</td>
          <td>${formatDa(totals.totalHt)}</td>
          <td>${formatDa(totals.totalTva)}</td>
          <td>${formatDa(totals.retentionAmount)}</td>
          <td>${formatDa(totals.stamp)}</td>
          <td>${formatDa(totals.netPayable)}</td>
          <td>${formatDateFr(inv.paidDate)}</td>
          <td>${inv.paidVia || "—"}</td>
          <td>${payLabel(totals.payStatus)}</td>
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
      <h1>GESTION VENTES — Récapitulatif (aperçu UI)</h1>
      <table><thead><tr>
        <th>N°</th><th>Date</th><th>Client</th><th>Type</th><th>HT</th><th>TVA</th><th>RG</th><th>Timbre</th><th>Net</th><th>Réglé le</th><th>Par</th><th>Statut</th>
      </tr></thead><tbody>${rows}</tbody></table>
      </body></html>`;
    const w = window.open("", "_blank", "noopener,noreferrer,width=1100,height=800");
    if (!w) return;
    w.document.write(html);
    w.document.close();
    w.focus();
    w.print();
  }

  const draftTotals = draft ? invoiceTotals(draft) : null;

  return (
    <div className="ventes-app">
      <div className="top-navbar">
        <div className="brand">📄 GESTION VENTES</div>
        <div className="user-info">
          <span>Journal commercial — unifié Finance</span>
          <span className="role-badge">UI</span>
        </div>
      </div>

      <div className="ui-mock-banner">
        Interface seule (mock) — même style Banque/Caisse. Aucune écriture base de données pour l’instant.
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
              title={DOC_KIND_LABELS[k]}
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
        <button type="button" className="btn-action btn-admin" onClick={() => setModal("admin")}>
          ADMIN
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
          Journal : <strong>Recap ventes</strong> — {visible.length} facture(s) affichée(s)
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
                    ["N° FACT", 60],
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
              {visible.length === 0 ? (
                <tr>
                  <td colSpan={14} className="empty-rows">
                    <span className="empty-ico" aria-hidden>
                      📥
                    </span>
                    Aucune facture pour ce filtre
                  </td>
                </tr>
              ) : (
                visible.map(({ inv, totals }) => {
                  const rowClass =
                    totals.payStatus === "PAYE"
                      ? "row-paye"
                      : totals.payStatus === "PARTIEL"
                        ? "row-partiel"
                        : "row-impaye";
                  return (
                    <tr key={inv.id} className={rowClass}>
                      <td>{inv.number}</td>
                      <td>{formatDateFr(inv.issueDate)}</td>
                      <td className="client-cell">{inv.clientName}</td>
                      <td>{inv.contractRef || "—"}</td>
                      <td>
                        <span className={`badge-kind ${inv.docKind}`} title={DOC_KIND_LABELS[inv.docKind]}>
                          {inv.docKind}
                        </span>
                      </td>
                      <td className="debit-cell">{formatDa(totals.totalHt)}</td>
                      <td>{formatDa(totals.totalTva)}</td>
                      <td>{formatDa(totals.retentionAmount)}</td>
                      <td>{formatDa(totals.stamp)}</td>
                      <td className="solde-cell">{formatDa(totals.netPayable)}</td>
                      <td>{formatDateFr(inv.paidDate) || "—"}</td>
                      <td>{inv.paidVia || "—"}</td>
                      <td>
                        <span
                          className={`badge-pay ${
                            totals.payStatus === "PAYE"
                              ? "paye"
                              : totals.payStatus === "PARTIEL"
                                ? "partiel"
                                : "impaye"
                          }`}
                        >
                          {payLabel(totals.payStatus)}
                        </span>
                      </td>
                      <td className="actions-cell">
                        <button
                          type="button"
                          className="act-btn act-edit"
                          title="Ouvrir"
                          onClick={() => openEdit(inv)}
                        >
                          <span className="act-ico">✎</span>
                        </button>
                        <button
                          type="button"
                          className="act-btn act-rapp"
                          title="Encaisser"
                          onClick={() => openPay(inv)}
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
              {KIND_ORDER.map((k) => (
                <button
                  key={k}
                  type="button"
                  className="btn-action btn-op"
                  style={{ justifyContent: "flex-start" }}
                  onClick={() => openNew(k)}
                >
                  <strong style={{ minWidth: 36 }}>{k}</strong>
                  <span>{DOC_KIND_LABELS[k]}</span>
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

      {modal === "facture" && draft && draftTotals && (
        <div className="overlay">
          <div className="modal invoice-modal">
            <div className="modal-head green">
              <span>
                Facture {draft.docKind} — N° {draft.number || "…"} ({DOC_KIND_LABELS[draft.docKind]})
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
                  <input value={draft.number} onChange={(e) => updateDraft("number", e.target.value)} />
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
                    onChange={(e) => updateDraft("docKind", e.target.value as VentesDocKind)}
                  >
                    {KIND_ORDER.map((k) => (
                      <option key={k} value={k}>
                        {k} — {DOC_KIND_LABELS[k]}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="span-3">
                  <label className="form-label">Client (Doit)</label>
                  <input
                    value={draft.clientName}
                    onChange={(e) => updateDraft("clientName", e.target.value)}
                    placeholder="Raison sociale"
                  />
                </div>
                <div className="span-3">
                  <label className="form-label">Adresse</label>
                  <input
                    value={draft.clientAddress}
                    onChange={(e) => updateDraft("clientAddress", e.target.value)}
                  />
                </div>
                <div>
                  <label className="form-label">NIF</label>
                  <input value={draft.nif} onChange={(e) => updateDraft("nif", e.target.value)} />
                </div>
                <div>
                  <label className="form-label">Article</label>
                  <input value={draft.article} onChange={(e) => updateDraft("article", e.target.value)} />
                </div>
                <div>
                  <label className="form-label">RC</label>
                  <input value={draft.rc} onChange={(e) => updateDraft("rc", e.target.value)} />
                </div>
                <div>
                  <label className="form-label">Contrat / BC</label>
                  <input
                    value={draft.contractRef}
                    onChange={(e) => updateDraft("contractRef", e.target.value)}
                  />
                </div>
                <div>
                  <label className="form-label">Période</label>
                  <input
                    value={draft.periodLabel}
                    onChange={(e) => updateDraft("periodLabel", e.target.value)}
                  />
                </div>
                <div>
                  <label className="form-label">Établie par</label>
                  <input
                    value={draft.establishedBy}
                    onChange={(e) => updateDraft("establishedBy", e.target.value)}
                  />
                </div>
                <div>
                  <label className="form-label">Tél. contact</label>
                  <input value={draft.phone} onChange={(e) => updateDraft("phone", e.target.value)} />
                </div>
                <div>
                  <label className="form-label">Attes. exo TVA</label>
                  <input
                    value={draft.exoAttestationNo}
                    onChange={(e) => updateDraft("exoAttestationNo", e.target.value)}
                  />
                </div>
                <div>
                  <label className="form-label">Date exo</label>
                  <input
                    type="date"
                    value={draft.exoAttestationDate}
                    onChange={(e) => updateDraft("exoAttestationDate", e.target.value)}
                  />
                </div>
                <div>
                  <label className="form-label">Banque prévue</label>
                  <input
                    value={draft.expectedBank}
                    onChange={(e) => updateDraft("expectedBank", e.target.value)}
                  />
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
                  <label className="form-label">
                    {draft.docKind === "RG" ? "% RG à restituer" : "% R. Garantie"}
                  </label>
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
                    {draft.docKind !== "SIT" && draft.docKind !== "RG" && <th style={{ width: 70 }}>Item</th>}
                    <th>Désignation</th>
                    {draft.docKind !== "SIT" && draft.docKind !== "RG" && <th style={{ width: 50 }}>U</th>}
                    {draft.docKind !== "SIT" && draft.docKind !== "RG" && <th style={{ width: 70 }}>Qté</th>}
                    {draft.docKind === "FP" && <th style={{ width: 90 }}>P. Fourn.</th>}
                    {draft.docKind === "FP" && <th style={{ width: 90 }}>P. Pose</th>}
                    {(draft.docKind === "P" || draft.docKind === "F") && <th style={{ width: 90 }}>P.U HT</th>}
                    {draft.docKind === "SIT" && <th style={{ width: 110 }}>Montant DA</th>}
                    {draft.docKind === "RG" && <th style={{ width: 100 }}>Réf. facture</th>}
                    {draft.docKind === "RG" && <th style={{ width: 110 }}>M. Facture</th>}
                    <th style={{ width: 100 }}>Montant</th>
                    <th style={{ width: 40 }} />
                  </tr>
                </thead>
                <tbody>
                  {draft.lines.map((line) => {
                    const mt =
                      draft.docKind === "RG"
                        ? Math.round(line.sourceAmount * draft.retentionRate * 100) / 100
                        : lineHt(line, draft.docKind);
                    return (
                      <tr key={line.id}>
                        <td>{line.lineNo}</td>
                        {draft.docKind !== "SIT" && draft.docKind !== "RG" && (
                          <td>
                            <input
                              value={line.itemCode}
                              onChange={(e) => updateLine(line.id, { itemCode: e.target.value })}
                            />
                          </td>
                        )}
                        <td>
                          <input
                            value={line.designation}
                            onChange={(e) => updateLine(line.id, { designation: e.target.value })}
                          />
                        </td>
                        {draft.docKind !== "SIT" && draft.docKind !== "RG" && (
                          <td>
                            <input
                              value={line.unit}
                              onChange={(e) => updateLine(line.id, { unit: e.target.value })}
                            />
                          </td>
                        )}
                        {draft.docKind !== "SIT" && draft.docKind !== "RG" && (
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
                        {(draft.docKind === "P" || draft.docKind === "F") && (
                          <td>
                            <NumInput
                              value={line.unitPriceHt}
                              onChange={(n) => updateLine(line.id, { unitPriceHt: n })}
                            />
                          </td>
                        )}
                        {draft.docKind === "SIT" && (
                          <td>
                            <NumInput
                              value={line.unitPriceHt}
                              onChange={(n) => updateLine(line.id, { unitPriceHt: n })}
                            />
                          </td>
                        )}
                        {draft.docKind === "RG" && (
                          <td>
                            <input
                              value={line.sourceInvoiceRef}
                              onChange={(e) =>
                                updateLine(line.id, { sourceInvoiceRef: e.target.value })
                              }
                            />
                          </td>
                        )}
                        {draft.docKind === "RG" && (
                          <td>
                            <NumInput
                              value={line.sourceAmount}
                              onChange={(n) => updateLine(line.id, { sourceAmount: n })}
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
                <div className="tot-row">
                  <span>{draft.docKind === "RG" ? "Restitution RG" : "R. Garantie"}</span>
                  <strong>{formatDa(draftTotals.retentionAmount)} DA</strong>
                </div>
                <div className="tot-row">
                  <span>Timbre</span>
                  <strong>{formatDa(draftTotals.stamp)} DA</strong>
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
              <button type="button" className="btn-action btn-admin" onClick={() => saveDraft(false)}>
                Brouillon
              </button>
              <button type="button" className="btn-action btn-op" onClick={() => saveDraft(true)}>
                Enregistrer
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
              <div>
                <label className="form-label">Facture</label>
                <select
                  value={payForm.invoiceId}
                  onChange={(e) => {
                    const inv = invoices.find((x) => x.id === e.target.value);
                    setPayForm((f) => ({
                      ...f,
                      invoiceId: e.target.value,
                      amount: inv ? String(invoiceTotals(inv).due || invoiceTotals(inv).netPayable) : f.amount,
                      account: inv?.expectedBank || f.account,
                    }));
                  }}
                >
                  {invoices.map((inv) => (
                    <option key={inv.id} value={inv.id}>
                      N° {inv.number} — {inv.clientName} ({formatDa(invoiceTotals(inv).due)} dû)
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
                <label className="form-label">Compte / Banque</label>
                <input
                  value={payForm.account}
                  onChange={(e) => setPayForm((f) => ({ ...f, account: e.target.value }))}
                />
              </div>
              <div>
                <label className="form-label">Mode</label>
                <select
                  value={payForm.method}
                  onChange={(e) => setPayForm((f) => ({ ...f, method: e.target.value }))}
                >
                  <option>Virement</option>
                  <option>Chèque</option>
                  <option>Espèces</option>
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
              <button type="button" className="btn-action btn-encaisser" onClick={applyPayment}>
                Valider
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
                L’import des fichiers <strong>Ventes YYYY.xlsm</strong> (Archive → lignes) sera branché
                après validation de l’interface. Aucun fichier n’est traité pour le moment.
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
        <div className="overlay">
          <div className="modal narrow">
            <div className="modal-head slate">
              <span>Admin Ventes</span>
              <button type="button" className="modal-close" onClick={() => setModal(null)}>
                ×
              </button>
            </div>
            <div className="modal-body">
              <p style={{ margin: 0, fontSize: 13, color: "#334155", lineHeight: 1.5 }}>
                Paramètres (séquence de numérotation, types, droits, listes banques) — à brancher sur
                les réglages Finance / UI-driven. Placeholder UI uniquement.
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
    </div>
  );
}
