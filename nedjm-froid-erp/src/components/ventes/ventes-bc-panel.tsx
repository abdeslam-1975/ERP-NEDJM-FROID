"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  SalOrderDeletedItem,
  SalOrderDetail,
  SalOrderListItem,
  SalOrdersDashboard,
} from "@/lib/actions/ventes-orders";
import type { VentesContractOption } from "@/lib/actions/ventes";
import { formatDa, formatDateFr } from "@/lib/banque/ledger";
import { computeOrderTotals } from "@/lib/ventes/order-compute";
import {
  emptyOrder,
  emptyOrderLine,
  type VentesOrder,
  type VentesOrderLine,
} from "@/lib/ventes/order-types";

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

function detailToDraft(detail: SalOrderDetail): VentesOrder {
  const o = detail.order;
  return {
    id: o.id,
    orderNumber: o.order_number,
    orderDate: o.order_date,
    clientId: o.client_id,
    contractId: o.contract_id || "",
    clientName: o.client_name,
    clientAddress: o.client_address || "",
    nif: o.client_nif || "",
    article: o.client_article || "",
    rc: o.client_rc || "",
    phone: o.client_phone || "",
    contractRef: o.contract_ref || "",
    paymentTerms: o.payment_terms || "",
    deliveryDelay: o.delivery_delay || "",
    buyerName: o.buyer_name || "",
    establishedBy: o.established_by || "",
    hasPose: o.has_pose,
    taxRate: Number(o.tax_rate) || 0,
    discountAmount: Number(o.discount_amount) || 0,
    retentionRate: Number(o.retention_rate) || 0,
    stampAmount: Number(o.stamp_amount) || 0,
    note: o.note || "",
    lines:
      detail.lines.length > 0
        ? detail.lines.map((l) => ({
            id: l.id,
            lineNo: l.line_no,
            itemCode: l.item_code || "",
            designation: l.designation,
            unit: l.unit || "U",
            qty: Number(l.qty) || 0,
            unitPriceHt: Number(l.unit_price_ht) || 0,
            posePriceHt: Number(l.pose_price_ht) || 0,
          }))
        : [emptyOrderLine(1)],
    status: o.status,
    persisted: true,
  };
}

export function VentesBcPanel() {
  const [data, setData] = useState<SalOrdersDashboard | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"TOUS" | "BROUILLON" | "EMIS" | "ANNULE">(
    "TOUS",
  );
  const [draft, setDraft] = useState<VentesOrder | null>(null);
  const [clientContracts, setClientContracts] = useState<VentesContractOption[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [schemaMissing, setSchemaMissing] = useState(false);
  const [trashOpen, setTrashOpen] = useState(false);
  const [trashRows, setTrashRows] = useState<SalOrderDeletedItem[]>([]);

  async function refresh() {
    setBusy(true);
    try {
      const { getSalOrdersDashboard } = await import("@/lib/actions/ventes-orders");
      const result = await getSalOrdersDashboard();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setData(result.data);
      setSchemaMissing(false);
      setError(null);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  const visible = useMemo(() => {
    const rows = data?.orders ?? [];
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (statusFilter !== "TOUS" && r.status !== statusFilter) return false;
      if (!q) return true;
      return (
        r.order_number.toLowerCase().includes(q) ||
        r.client_name.toLowerCase().includes(q) ||
        (r.payment_terms || "").toLowerCase().includes(q)
      );
    });
  }, [data, search, statusFilter]);

  const kpis = useMemo(() => {
    return visible.reduce(
      (acc, r) => {
        acc.ht += Number(r.total_ht) || 0;
        acc.tva += Number(r.total_tva) || 0;
        acc.rg += Number(r.retention_amount) || 0;
        acc.net += Number(r.net_payable) || 0;
        if (r.status === "BROUILLON") acc.drafts += 1;
        if (r.status === "EMIS") acc.issued += 1;
        return acc;
      },
      { ht: 0, tva: 0, rg: 0, net: 0, drafts: 0, issued: 0 },
    );
  }, [visible]);

  const draftTotals = useMemo(() => {
    if (!draft) return null;
    return computeOrderTotals({
      has_pose: draft.hasPose,
      tax_rate: draft.taxRate,
      discount_amount: draft.discountAmount,
      retention_rate: draft.retentionRate,
      stamp_amount: draft.stampAmount,
      lines: draft.lines.map((l) => ({
        qty: l.qty,
        unit_price_ht: l.unitPriceHt,
        pose_price_ht: l.posePriceHt,
      })),
    });
  }, [draft]);

  async function loadClientContracts(clientId: string) {
    if (!clientId) {
      setClientContracts([]);
      return;
    }
    const { listVentesOrderClientContracts } = await import("@/lib/actions/ventes-orders");
    const result = await listVentesOrderClientContracts(clientId);
    setClientContracts(result.ok ? result.data : []);
  }

  function applyClient(clientId: string) {
    const client = data?.clients.find((c) => c.id === clientId);
    setDraft((d) => {
      if (!d) return d;
      if (!client) return { ...d, clientId, contractId: "", contractRef: "" };
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

  function openNew() {
    if (data && !data.canCreate) {
      setError("Création refusée (droits Ventes).");
      return;
    }
    setClientContracts([]);
    setDraft(emptyOrder(data?.today || new Date().toISOString().slice(0, 10)));
    setError(null);
  }

  async function openEdit(row: SalOrderListItem) {
    setBusy(true);
    try {
      const { getSalOrderDetail } = await import("@/lib/actions/ventes-orders");
      const result = await getSalOrderDetail(row.id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (result.data.order.status !== "BROUILLON") {
        window.open(`/api/ventes/orders/${row.id}/pdf`, "_blank", "noopener,noreferrer");
        return;
      }
      setDraft(detailToDraft(result.data));
      await loadClientContracts(result.data.order.client_id);
    } finally {
      setBusy(false);
    }
  }

  function updateDraft<K extends keyof VentesOrder>(key: K, value: VentesOrder[K]) {
    setDraft((d) => (d ? { ...d, [key]: value } : d));
  }

  function updateLine(lineId: string, patch: Partial<VentesOrderLine>) {
    setDraft((d) => {
      if (!d) return d;
      return {
        ...d,
        lines: d.lines.map((l) => (l.id === lineId ? { ...l, ...patch } : l)),
      };
    });
  }

  async function save(issue: boolean) {
    if (!draft) return;
    setSaving(true);
    setError(null);
    try {
      const { saveSalOrder } = await import("@/lib/actions/ventes-orders");
      const result = await saveSalOrder({
        id: draft.persisted ? draft.id : undefined,
        order_number: draft.orderNumber,
        order_date: draft.orderDate,
        client_id: draft.clientId,
        contract_id: draft.contractId || null,
        client_name: draft.clientName,
        client_address: draft.clientAddress,
        client_nif: draft.nif,
        client_article: draft.article,
        client_rc: draft.rc,
        client_phone: draft.phone,
        contract_ref: draft.contractRef,
        payment_terms: draft.paymentTerms,
        delivery_delay: draft.deliveryDelay,
        buyer_name: draft.buyerName,
        established_by: draft.establishedBy,
        has_pose: draft.hasPose,
        tax_rate: draft.taxRate,
        discount_amount: draft.discountAmount,
        retention_rate: draft.retentionRate,
        stamp_amount: draft.stampAmount,
        note: draft.note,
        issue,
        lines: draft.lines.map((l) => ({
          item_code: l.itemCode,
          designation: l.designation,
          unit: l.unit,
          qty: l.qty,
          unit_price_ht: l.unitPriceHt,
          pose_price_ht: l.posePriceHt,
        })),
      });
      if (!result.ok) {
        if (result.error.toLowerCase().includes("does not exist") || result.error.includes("sal_orders")) {
          setSchemaMissing(true);
        }
        setError(result.error);
        return;
      }
      setMessage(
        issue
          ? `Bon de commande ${result.data.order_number} émis.`
          : `Bon de commande ${result.data.order_number} enregistré.`,
      );
      setDraft(null);
      await refresh();
    } finally {
      setSaving(false);
    }
  }

  async function softDelete(id: string, label: string) {
    if (!window.confirm(`Mettre le BC ${label} en corbeille ?\n(Restaurable via CORBEILLE)`)) {
      return;
    }
    setBusy(true);
    try {
      const { softDeleteSalOrder } = await import("@/lib/actions/ventes-orders");
      const result = await softDeleteSalOrder(id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setMessage(result.data.message);
      setDraft(null);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function openTrash() {
    if (data && !data.canRestore && !data.canDelete) {
      setError("Corbeille refusée (droits Ventes).");
      return;
    }
    setBusy(true);
    try {
      const { listDeletedSalOrders } = await import("@/lib/actions/ventes-orders");
      const result = await listDeletedSalOrders();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setTrashRows(result.data.rows);
      setTrashOpen(true);
      setError(null);
    } finally {
      setBusy(false);
    }
  }

  async function restoreTrashItem(row: SalOrderDeletedItem) {
    setBusy(true);
    try {
      const { restoreSalOrder, listDeletedSalOrders } = await import("@/lib/actions/ventes-orders");
      const result = await restoreSalOrder(row.id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setMessage(result.data.message);
      const refreshed = await listDeletedSalOrders();
      if (refreshed.ok) setTrashRows(refreshed.data.rows);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {error && <div className="alert alert-error">{error}</div>}
      {message && <div className="alert alert-ok">{message}</div>}
      {schemaMissing && (
        <div className="alert alert-error">
          Table sal_orders absente — appliquer la migration ventes BC avant utilisation.
        </div>
      )}

      <div className="kpi-grid-5">
        <div className="kpi-card kpi-ht">
          <div className="kpi-label">HT</div>
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
          <small>Retenue</small>
        </div>
        <div className="kpi-card kpi-net">
          <div className="kpi-label">Net</div>
          <div className="kpi-value">{formatDa(kpis.net)}</div>
          <small>Net à payer</small>
        </div>
        <div className="kpi-card kpi-due">
          <div className="kpi-label">Brouillons / Émis</div>
          <div className="kpi-value">
            {kpis.drafts}/{kpis.issued}
          </div>
          <small>Sur filtre</small>
        </div>
      </div>

      <div className="panel action-bar">
        <button type="button" className="btn-action btn-facture" onClick={openNew}>
          + BON DE COMMANDE
        </button>
        <button type="button" className="btn-action btn-export" onClick={() => void refresh()} disabled={busy}>
          ACTUALISER
        </button>
        {(data?.canRestore || data?.canDelete) && (
          <button
            type="button"
            className="btn-action btn-corbeille"
            disabled={busy}
            onClick={() => void openTrash()}
          >
            CORBEILLE
          </button>
        )}
        <div className="filters">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
          >
            <option value="TOUS">Statut: tous</option>
            <option value="BROUILLON">Brouillon</option>
            <option value="EMIS">Émis</option>
            <option value="ANNULE">Annulé</option>
          </select>
          <input
            type="text"
            placeholder="Rechercher BC..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="account-meta">
        <div>
          Bons de commande Ventes — {visible.length} / {(data?.orders ?? []).length}
        </div>
      </div>

      <div className="table-card">
        <div className="table-scroll">
          <table className="main-table">
            <thead>
              <tr>
                {(
                  [
                    ["N° BC", 90],
                    ["DATE", 90],
                    ["CLIENT", 220],
                    ["PAIEMENT", 120],
                    ["HT", 100],
                    ["TVA", 90],
                    ["R.G", 90],
                    ["NET", 110],
                    ["STATUT", 90],
                    ["ACTIONS", 200],
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
                  <td colSpan={10} className="empty-rows">
                    {busy ? "Chargement…" : "Impossible de charger les bons de commande"}
                  </td>
                </tr>
              ) : visible.length === 0 ? (
                <tr>
                  <td colSpan={10} className="empty-rows">
                    Aucun bon de commande
                  </td>
                </tr>
              ) : (
                visible.map((row) => (
                  <tr key={row.id}>
                    <td>{row.order_number}</td>
                    <td>{formatDateFr(row.order_date)}</td>
                    <td style={{ textAlign: "left" }}>{row.client_name}</td>
                    <td>{row.payment_terms || "—"}</td>
                    <td>{formatDa(row.total_ht)}</td>
                    <td>{formatDa(row.total_tva)}</td>
                    <td>{formatDa(row.retention_amount)}</td>
                    <td>
                      <strong>{formatDa(row.net_payable)}</strong>
                    </td>
                    <td>
                      <span className={`badge-kind ${row.status === "EMIS" ? "F" : "P"}`}>
                        {row.status}
                      </span>
                    </td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      {row.status === "BROUILLON" ? (
                        <button
                          type="button"
                          className="btn-light"
                          style={{ marginRight: 4 }}
                          onClick={() => void openEdit(row)}
                        >
                          Éditer
                        </button>
                      ) : (
                        <a
                          className="btn-light"
                          style={{ marginRight: 4 }}
                          href={`/api/ventes/orders/${row.id}/pdf`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          PDF
                        </a>
                      )}
                      {(data.canDelete || data.canUpdate) && row.status !== "ANNULE" && (
                        <button
                          type="button"
                          className="btn-light"
                          title="Mettre en corbeille"
                          disabled={busy}
                          onClick={() => void softDelete(row.id, row.order_number)}
                        >
                          Supprimer
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {draft && draftTotals && (
        <div className="overlay">
          <div className="modal invoice-modal">
            <div className="modal-head green">
              <span>Bon de commande — N° {draft.orderNumber || "…"}</span>
              <button type="button" className="modal-close" onClick={() => setDraft(null)}>
                ×
              </button>
            </div>
            <div className="modal-body">
              <div className="grid-3">
                <div>
                  <label className="form-label">Bon de CMD N°</label>
                  <input
                    value={draft.orderNumber}
                    onChange={(e) => updateDraft("orderNumber", e.target.value)}
                    placeholder="Auto si vide"
                  />
                </div>
                <div>
                  <label className="form-label">Sétif le</label>
                  <input
                    type="date"
                    value={draft.orderDate}
                    onChange={(e) => updateDraft("orderDate", e.target.value)}
                  />
                </div>
                <div>
                  <label className="form-label">Paiement</label>
                  <input
                    value={draft.paymentTerms}
                    onChange={(e) => updateDraft("paymentTerms", e.target.value)}
                  />
                </div>
                <div className="span-3">
                  <label className="form-label">Doit (client)</label>
                  <select value={draft.clientId} onChange={(e) => applyClient(e.target.value)}>
                    <option value="">— Choisir un client —</option>
                    {(data?.clients ?? []).map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nom_fr}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="span-3">
                  <label className="form-label">Nom figé</label>
                  <input
                    value={draft.clientName}
                    onChange={(e) => updateDraft("clientName", e.target.value)}
                  />
                </div>
                <div>
                  <label className="form-label">ID Fiscal</label>
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
                  <label className="form-label">RC N°</label>
                  <input value={draft.rc} onChange={(e) => updateDraft("rc", e.target.value)} />
                </div>
                <div>
                  <label className="form-label">Contact Tél</label>
                  <input value={draft.phone} onChange={(e) => updateDraft("phone", e.target.value)} />
                </div>
                <div>
                  <label className="form-label">Délai de livraison</label>
                  <input
                    value={draft.deliveryDelay}
                    onChange={(e) => updateDraft("deliveryDelay", e.target.value)}
                  />
                </div>
                <div>
                  <label className="form-label">Réf</label>
                  <input
                    value={draft.contractRef}
                    onChange={(e) => updateDraft("contractRef", e.target.value)}
                  />
                </div>
                <div>
                  <label className="form-label">Contrat (optionnel)</label>
                  <select
                    value={draft.contractId}
                    disabled={!draft.clientId}
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
                  >
                    <option value="">— Sans contrat —</option>
                    {clientContracts.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.contract_number}
                      </option>
                    ))}
                  </select>
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
                  <label className="form-label">Acheteur</label>
                  <input
                    value={draft.buyerName}
                    onChange={(e) => updateDraft("buyerName", e.target.value)}
                  />
                </div>
                <div>
                  <label className="form-label">TVA</label>
                  <select
                    value={String(draft.taxRate)}
                    onChange={(e) => updateDraft("taxRate", Number(e.target.value))}
                  >
                    <option value="0">0 %</option>
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
                  <label className="form-label">Remise (DA)</label>
                  <NumInput
                    value={draft.discountAmount}
                    onChange={(n) => updateDraft("discountAmount", n)}
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
                  <label className="form-label">Prix Pose</label>
                  <select
                    value={draft.hasPose ? "1" : "0"}
                    onChange={(e) => updateDraft("hasPose", e.target.value === "1")}
                  >
                    <option value="0">Non</option>
                    <option value="1">Oui (F+P)</option>
                  </select>
                </div>
              </div>

              <div
                style={{
                  marginTop: 14,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <strong style={{ fontSize: 13 }}>Lignes</strong>
                <button
                  type="button"
                  className="btn-light"
                  onClick={() =>
                    setDraft((d) =>
                      d ? { ...d, lines: [...d.lines, emptyOrderLine(d.lines.length + 1)] } : d,
                    )
                  }
                >
                  + Ligne
                </button>
              </div>

              <div className="table-scroll" style={{ marginTop: 8, maxHeight: 260 }}>
                <table className="main-table">
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th>Désignation</th>
                      <th>U</th>
                      <th>Qté</th>
                      <th>P.U HT</th>
                      {draft.hasPose && <th>P.U Pose</th>}
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {draft.lines.map((line) => (
                      <tr key={line.id}>
                        <td>
                          <input
                            value={line.itemCode}
                            onChange={(e) => updateLine(line.id, { itemCode: e.target.value })}
                          />
                        </td>
                        <td>
                          <input
                            value={line.designation}
                            onChange={(e) => updateLine(line.id, { designation: e.target.value })}
                          />
                        </td>
                        <td>
                          <input
                            value={line.unit}
                            onChange={(e) => updateLine(line.id, { unit: e.target.value })}
                          />
                        </td>
                        <td>
                          <NumInput
                            value={line.qty}
                            onChange={(n) => updateLine(line.id, { qty: n })}
                          />
                        </td>
                        <td>
                          <NumInput
                            value={line.unitPriceHt}
                            onChange={(n) => updateLine(line.id, { unitPriceHt: n })}
                          />
                        </td>
                        {draft.hasPose && (
                          <td>
                            <NumInput
                              value={line.posePriceHt}
                              onChange={(n) => updateLine(line.id, { posePriceHt: n })}
                            />
                          </td>
                        )}
                        <td>
                          <button
                            type="button"
                            className="btn-light"
                            onClick={() =>
                              setDraft((d) =>
                                d
                                  ? {
                                      ...d,
                                      lines:
                                        d.lines.length <= 1
                                          ? d.lines
                                          : d.lines.filter((x) => x.id !== line.id),
                                    }
                                  : d,
                              )
                            }
                          >
                            ✕
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="grid-3" style={{ marginTop: 12 }}>
                <div>
                  <label className="form-label">Total HT</label>
                  <input readOnly value={formatDa(draftTotals.total_ht)} />
                </div>
                <div>
                  <label className="form-label">Total TVA</label>
                  <input readOnly value={formatDa(draftTotals.total_tva)} />
                </div>
                <div>
                  <label className="form-label">Net à payer</label>
                  <input readOnly value={formatDa(draftTotals.net_payable)} />
                </div>
              </div>
            </div>
            <div className="modal-foot">
              {draft.persisted && (data?.canDelete || data?.canUpdate) && (
                <button
                  type="button"
                  className="btn-light"
                  disabled={saving || busy}
                  onClick={() => void softDelete(draft.id, draft.orderNumber || draft.id)}
                >
                  Supprimer
                </button>
              )}
              <button type="button" className="btn-light" onClick={() => setDraft(null)}>
                Fermer
              </button>
              <button
                type="button"
                className="btn-action btn-export"
                disabled={saving}
                onClick={() => void save(false)}
              >
                Enregistrer
              </button>
              <button
                type="button"
                className="btn-action btn-facture"
                disabled={saving}
                onClick={() => void save(true)}
              >
                Émettre
              </button>
            </div>
          </div>
        </div>
      )}

      {trashOpen && (
        <div className="overlay">
          <div className="modal wide">
            <div className="modal-head brown">
              <span>Corbeille — bons de commande supprimés</span>
              <button type="button" className="modal-close" onClick={() => setTrashOpen(false)}>
                ×
              </button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: 12, color: "#64748b", marginTop: 0 }}>
                Les suppressions ne sont pas définitives : restaurez un BC pour le remettre dans la
                liste. Indépendant de la corbeille Banque / Caisse.
              </p>
              <div className="table-scroll">
                <table className="main-table">
                  <thead>
                    <tr>
                      <th>Supprimé le</th>
                      <th>N° BC</th>
                      <th>Date</th>
                      <th>Client</th>
                      <th>Statut</th>
                      <th>Net</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {!trashRows.length ? (
                      <tr>
                        <td colSpan={7} className="empty-rows">
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
                          <td>{row.order_number}</td>
                          <td>{formatDateFr(row.order_date)}</td>
                          <td style={{ textAlign: "left" }}>{row.client_name}</td>
                          <td>{row.status}</td>
                          <td>
                            <strong>{formatDa(row.net_payable)}</strong>
                          </td>
                          <td>
                            <button
                              type="button"
                              className="btn-action btn-facture"
                              disabled={busy}
                              onClick={() => void restoreTrashItem(row)}
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
            </div>
            <div className="modal-foot">
              <button type="button" className="btn-light" onClick={() => setTrashOpen(false)}>
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
