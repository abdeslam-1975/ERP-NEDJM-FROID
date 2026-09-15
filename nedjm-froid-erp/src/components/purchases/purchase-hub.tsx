"use client";

import { useMemo, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  createOrderFromProforma,
  createProforma,
  postReceipt,
  postSupplierInvoice,
  postSupplierPayment,
  releaseSupplierRetention,
  setProformaStatus,
  upsertSupplier,
  type PurchaseHubData,
  type PurchaseOrder,
  type Supplier,
} from "@/lib/actions/purchases";
import { Button } from "@/components/ui/button";

type Tab = "dashboard" | "proformas" | "orders" | "receipts" | "invoices" | "suppliers";
const today = () => new Date().toISOString().slice(0, 10);
const inputClass =
  "h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/15";
const money = (value: number) =>
  new Intl.NumberFormat("fr-DZ", { style: "currency", currency: "DZD" }).format(value);

export function PurchaseHub({
  initialData,
  loadError,
}: {
  initialData: PurchaseHubData;
  loadError?: string;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("dashboard");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(loadError ?? null);
  const [message, setMessage] = useState<string | null>(null);

  function run(action: () => Promise<{ ok: boolean; error?: string }>, success: string) {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setError(result.error ?? "Opération refusée.");
        return;
      }
      setMessage(success);
      router.refresh();
    });
  }

  const tabs: [Tab, string][] = [
    ["dashboard", "Pilotage"],
    ["proformas", "Proformas"],
    ["orders", "Bons de commande"],
    ["receipts", "Réceptions"],
    ["invoices", "Factures & paiements"],
    ["suppliers", "Fournisseurs"],
  ];

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-brand">Cycle achats A → Z</p>
          <h1 className="text-2xl font-bold">Achats & fournisseurs</h1>
          <p className="text-sm text-foreground/55">
            Proforma → commande → réceptions multiples → factures multiples → paiement.
          </p>
        </div>
        <a className="rounded-md border border-border bg-surface px-4 py-2 text-sm font-semibold" href="/achats/parametres">
          Paramètres documentaires
        </a>
      </header>
      {error && <Notice tone="error">{error}</Notice>}
      {message && <Notice tone="success">{message}</Notice>}
      <div className="flex gap-1 overflow-x-auto rounded-xl border border-border bg-surface p-1">
        {tabs.map(([value, label]) => (
          <button
            key={value}
            onClick={() => setTab(value)}
            className={`whitespace-nowrap rounded-lg px-4 py-2 text-sm font-semibold transition ${
              tab === value ? "bg-brand text-white shadow-sm" : "hover:bg-surface-muted"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "dashboard" && <Dashboard data={initialData} />}
      {tab === "proformas" && <Proformas data={initialData} pending={pending} run={run} />}
      {tab === "orders" && <Orders data={initialData} pending={pending} run={run} />}
      {tab === "receipts" && <Receipts data={initialData} pending={pending} run={run} />}
      {tab === "invoices" && <Invoices data={initialData} pending={pending} run={run} />}
      {tab === "suppliers" && <Suppliers rows={initialData.suppliers} pending={pending} run={run} />}
    </div>
  );
}

type Runner = (
  action: () => Promise<{ ok: boolean; error?: string }>,
  success: string,
) => void;

function Dashboard({ data }: { data: PurchaseHubData }) {
  const openOrders = data.orders.filter((row) => !["CLOSED", "CANCELLED"].includes(row.status));
  const outstanding = data.invoices.reduce((sum, row) => sum + row.open_amount, 0);
  const overdue = data.invoices.filter(
    (row) => row.due_date && row.due_date < today() && row.open_amount > 0,
  );
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Fournisseurs actifs" value={String(data.suppliers.filter((row) => row.active).length)} />
        <Kpi label="Commandes ouvertes" value={String(openOrders.length)} />
        <Kpi label="Dette fournisseur" value={money(outstanding)} accent />
        <Kpi label="Factures échues" value={String(overdue.length)} danger={overdue.length > 0} />
      </div>
      <section className="rounded-xl border border-border bg-surface p-5">
        <h2 className="font-bold">Contrôle trois voies</h2>
        <p className="mt-1 text-sm text-foreground/55">
          Le système interdit de facturer une quantité supérieure aux réceptions acceptées.
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-foreground/45">
              <tr><th className="py-2">Commande</th><th>Fournisseur</th><th>Commandé HT</th><th>Réception</th><th>Facturation</th><th>Statut</th></tr>
            </thead>
            <tbody>
              {data.orders.slice(0, 12).map((order) => {
                const ordered = order.lines.reduce((sum, line) => sum + line.quantity, 0);
                const received = order.lines.reduce((sum, line) => sum + line.received_quantity, 0);
                const invoiced = order.lines.reduce((sum, line) => sum + line.invoiced_quantity, 0);
                return (
                  <tr key={order.id} className="border-t border-border">
                    <td className="py-3 font-semibold">{order.order_number}</td>
                    <td>{order.supplier_name}</td>
                    <td>{money(order.total_ht)}</td>
                    <td>{received} / {ordered}</td>
                    <td>{invoiced} / {received}</td>
                    <td><Status value={order.status} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

type DraftLine = {
  item_code: string;
  designation: string;
  unit: string;
  quantity: string;
  supply_unit_price_ht: string;
  installation_unit_price_ht: string;
  tax_rate_id: string;
  situation_type_id: string;
};

const emptyLine = (): DraftLine => ({
  item_code: "",
  designation: "",
  unit: "U",
  quantity: "1",
  supply_unit_price_ht: "0",
  installation_unit_price_ht: "0",
  tax_rate_id: "",
  situation_type_id: "",
});

function Proformas({ data, pending, run }: { data: PurchaseHubData; pending: boolean; run: Runner }) {
  const [form, setForm] = useState({
    supplier_id: data.suppliers.find((row) => row.active)?.id ?? "",
    site_id: "",
    proforma_number: "",
    supplier_reference: "",
    proforma_date: today(),
    validity_date: "",
    currency_code: "DZD",
    delivery_terms: "",
    payment_terms: "",
    attachment_url: "",
    note: "",
  });
  const [lines, setLines] = useState<DraftLine[]>([emptyLine()]);

  function updateLine(index: number, patch: Partial<DraftLine>) {
    setLines((current) => current.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  }

  function submit() {
    run(
      () =>
        createProforma({
          ...form,
          site_id: form.site_id || null,
          validity_date: form.validity_date || null,
          lines: lines.map((line) => ({
            ...line,
            quantity: Number(line.quantity),
            supply_unit_price_ht: Number(line.supply_unit_price_ht),
            installation_unit_price_ht: Number(line.installation_unit_price_ht),
            tax_rate_id: line.tax_rate_id || null,
            situation_type_id: line.situation_type_id || null,
          })),
        }),
      "Facture proforma enregistrée.",
    );
  }

  return (
    <div className="space-y-5">
      <Panel title="Nouvelle facture proforma" subtitle="Document commercial sans écriture comptable.">
        <div className="grid gap-3 md:grid-cols-3">
          <Field label="Fournisseur *">
            <select className={inputClass} value={form.supplier_id} onChange={(e) => setForm((f) => ({ ...f, supplier_id: e.target.value }))}>
              <option value="">Sélectionner</option>
              {data.suppliers.filter((row) => row.active).map((row) => <option key={row.id} value={row.id}>{row.code} — {row.legal_name}</option>)}
            </select>
          </Field>
          <Field label="Site / chantier">
            <select className={inputClass} value={form.site_id} onChange={(e) => setForm((f) => ({ ...f, site_id: e.target.value }))}>
              <option value="">Central</option>{data.sites.map((row) => <option key={row.id} value={row.id}>{row.code} — {row.name_fr}</option>)}
            </select>
          </Field>
          <Field label="N° ERP (vide = automatique)"><input className={inputClass} value={form.proforma_number} onChange={(e) => setForm((f) => ({ ...f, proforma_number: e.target.value }))} /></Field>
          <Field label="Référence fournisseur"><input className={inputClass} value={form.supplier_reference} onChange={(e) => setForm((f) => ({ ...f, supplier_reference: e.target.value }))} /></Field>
          <Field label="Date"><input type="date" className={inputClass} value={form.proforma_date} onChange={(e) => setForm((f) => ({ ...f, proforma_date: e.target.value }))} /></Field>
          <Field label="Validité"><input type="date" className={inputClass} value={form.validity_date} onChange={(e) => setForm((f) => ({ ...f, validity_date: e.target.value }))} /></Field>
          <Field label="Conditions de livraison"><input className={inputClass} value={form.delivery_terms} onChange={(e) => setForm((f) => ({ ...f, delivery_terms: e.target.value }))} /></Field>
          <Field label="Conditions de paiement"><input className={inputClass} value={form.payment_terms} onChange={(e) => setForm((f) => ({ ...f, payment_terms: e.target.value }))} /></Field>
          <Field label="Pièce jointe (URL)"><input className={inputClass} value={form.attachment_url} onChange={(e) => setForm((f) => ({ ...f, attachment_url: e.target.value }))} /></Field>
        </div>
        <div className="mt-4 space-y-2">
          {lines.map((line, index) => (
            <div key={index} className="grid gap-2 rounded-lg border border-border bg-background p-3 lg:grid-cols-[100px_1.5fr_70px_80px_120px_120px_150px_130px_auto]">
              <input className={inputClass} placeholder="Code" value={line.item_code} onChange={(e) => updateLine(index, { item_code: e.target.value })} />
              <input className={inputClass} placeholder="Désignation" value={line.designation} onChange={(e) => updateLine(index, { designation: e.target.value })} />
              <input className={inputClass} placeholder="Unité" value={line.unit} onChange={(e) => updateLine(index, { unit: e.target.value })} />
              <input type="number" min="0" step="0.0001" className={inputClass} placeholder="Qté" value={line.quantity} onChange={(e) => updateLine(index, { quantity: e.target.value })} />
              <input type="number" min="0" step="0.01" className={inputClass} title="Prix fourniture HT" placeholder="Fourniture HT" value={line.supply_unit_price_ht} onChange={(e) => updateLine(index, { supply_unit_price_ht: e.target.value })} />
              <input type="number" min="0" step="0.01" className={inputClass} title="Prix pose HT" placeholder="Pose HT" value={line.installation_unit_price_ht} onChange={(e) => updateLine(index, { installation_unit_price_ht: e.target.value })} />
              <select className={inputClass} value={line.situation_type_id} onChange={(e) => updateLine(index, { situation_type_id: e.target.value })}>
                <option value="">Type de situation</option>{data.situations.filter((row) => row.active).map((row) => <option key={row.id} value={row.id}>{row.label_fr}</option>)}
              </select>
              <select className={inputClass} value={line.tax_rate_id} onChange={(e) => updateLine(index, { tax_rate_id: e.target.value })}>
                <option value="">Sans TVA</option>{data.taxRates.map((row) => <option key={row.id} value={row.id}>{row.label_fr}</option>)}
              </select>
              <button className="px-2 text-sm font-semibold text-red-600" disabled={lines.length === 1} onClick={() => setLines((current) => current.filter((_, i) => i !== index))}>Retirer</button>
            </div>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => setLines((current) => [...current, emptyLine()])}>Ajouter une ligne</Button>
          <Button disabled={pending || !form.supplier_id} onClick={submit}>Enregistrer la proforma</Button>
        </div>
      </Panel>
      <DocumentTable
        headers={["N°", "Date", "Fournisseur", "HT", "TTC", "Statut", "Actions"]}
        rows={data.proformas.map((row) => [
          row.proforma_number,
          row.proforma_date,
          row.supplier_name,
          money(row.total_ht),
          money(row.total_ttc),
          <Status key="s" value={row.status} />,
          row.status === "DRAFT" ? (
            <div key="a" className="flex gap-3">
              <button className="font-semibold text-brand" disabled={pending} onClick={() => run(() => setProformaStatus({ proforma_id: row.id, status: "APPROVED" }), "Proforma approuvée.")}>Approuver</button>
              <button className="font-semibold text-red-600" disabled={pending} onClick={() => run(() => setProformaStatus({ proforma_id: row.id, status: "CANCELLED" }), "Proforma annulée.")}>Annuler</button>
            </div>
          ) : "—",
        ])}
      />
    </div>
  );
}

function Orders({ data, pending, run }: { data: PurchaseHubData; pending: boolean; run: Runner }) {
  const orderedProformas = new Set(data.orders.filter((row) => row.status !== "CANCELLED").map((row) => row.proforma_id));
  const available = data.proformas.filter((row) => row.status === "APPROVED" && !orderedProformas.has(row.id));
  const [form, setForm] = useState({
    proforma_id: available[0]?.id ?? "",
    order_number: "",
    order_date: today(),
    expected_delivery_date: "",
    delivery_address: "",
    note: "",
  });
  return (
    <div className="space-y-5">
      <Panel title="Créer un bon de commande" subtitle="Uniquement après approbation d’une facture proforma.">
        <div className="grid gap-3 md:grid-cols-3">
          <Field label="Proforma approuvée *"><select className={inputClass} value={form.proforma_id} onChange={(e) => setForm((f) => ({ ...f, proforma_id: e.target.value }))}><option value="">Sélectionner</option>{available.map((row) => <option key={row.id} value={row.id}>{row.proforma_number} — {row.supplier_name}</option>)}</select></Field>
          <Field label="N° BC (vide = automatique)"><input className={inputClass} value={form.order_number} onChange={(e) => setForm((f) => ({ ...f, order_number: e.target.value }))} /></Field>
          <Field label="Date BC"><input type="date" className={inputClass} value={form.order_date} onChange={(e) => setForm((f) => ({ ...f, order_date: e.target.value }))} /></Field>
          <Field label="Livraison prévue"><input type="date" className={inputClass} value={form.expected_delivery_date} onChange={(e) => setForm((f) => ({ ...f, expected_delivery_date: e.target.value }))} /></Field>
          <Field label="Adresse de livraison"><input className={inputClass} value={form.delivery_address} onChange={(e) => setForm((f) => ({ ...f, delivery_address: e.target.value }))} /></Field>
          <Field label="Note"><input className={inputClass} value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} /></Field>
        </div>
        <Button className="mt-4" disabled={pending || !form.proforma_id} onClick={() => run(() => createOrderFromProforma({ ...form, expected_delivery_date: form.expected_delivery_date || null }), "Bon de commande créé.")}>Créer le bon de commande</Button>
      </Panel>
      <DocumentTable
        headers={["N° BC", "Date", "Fournisseur", "HT", "TTC", "Réception", "Facturation", "Statut"]}
        rows={data.orders.map((row) => {
          const ordered = row.lines.reduce((sum, line) => sum + line.quantity, 0);
          const received = row.lines.reduce((sum, line) => sum + line.received_quantity, 0);
          const invoiced = row.lines.reduce((sum, line) => sum + line.invoiced_quantity, 0);
          return [row.order_number, row.order_date, row.supplier_name, money(row.total_ht), money(row.total_ttc), `${received} / ${ordered}`, `${invoiced} / ${received}`, <Status key="s" value={row.status} />];
        })}
      />
    </div>
  );
}

function Receipts({ data, pending, run }: { data: PurchaseHubData; pending: boolean; run: Runner }) {
  const eligible = data.orders.filter((row) => ["APPROVED", "SENT", "PARTIALLY_RECEIVED"].includes(row.status));
  const [orderId, setOrderId] = useState(eligible[0]?.id ?? "");
  const order = eligible.find((row) => row.id === orderId);
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [form, setForm] = useState({ receipt_number: "", receipt_date: today(), delivery_note_number: "", received_by_name: "", note: "" });
  const remaining = order?.lines.filter((line) => line.quantity - line.received_quantity > 0) ?? [];
  return (
    <div className="space-y-5">
      <Panel title="Enregistrer une réception" subtitle="Les quantités acceptées alimentent la limite de facturation fournisseur.">
        <div className="grid gap-3 md:grid-cols-3">
          <Field label="Bon de commande *"><select className={inputClass} value={orderId} onChange={(e) => { setOrderId(e.target.value); setQuantities({}); }}><option value="">Sélectionner</option>{eligible.map((row) => <option key={row.id} value={row.id}>{row.order_number} — {row.supplier_name}</option>)}</select></Field>
          <Field label="N° réception (auto)"><input className={inputClass} value={form.receipt_number} onChange={(e) => setForm((f) => ({ ...f, receipt_number: e.target.value }))} /></Field>
          <Field label="Date"><input type="date" className={inputClass} value={form.receipt_date} onChange={(e) => setForm((f) => ({ ...f, receipt_date: e.target.value }))} /></Field>
          <Field label="Bon de livraison"><input className={inputClass} value={form.delivery_note_number} onChange={(e) => setForm((f) => ({ ...f, delivery_note_number: e.target.value }))} /></Field>
          <Field label="Réceptionné par"><input className={inputClass} value={form.received_by_name} onChange={(e) => setForm((f) => ({ ...f, received_by_name: e.target.value }))} /></Field>
          <Field label="Note"><input className={inputClass} value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} /></Field>
        </div>
        {order && (
          <div className="mt-4 space-y-2">
            {remaining.map((line) => {
              const max = line.quantity - line.received_quantity;
              return (
                <div key={line.id} className="grid items-center gap-3 rounded-lg border border-border p-3 sm:grid-cols-[1fr_120px_120px]">
                  <div><p className="font-semibold">{line.item_code} — {line.designation}</p><p className="text-xs text-foreground/55">Restant {max} {line.unit}</p></div>
                  <input type="number" min="0" max={max} step="0.0001" className={inputClass} value={quantities[line.id] ?? String(max)} onChange={(e) => setQuantities((current) => ({ ...current, [line.id]: e.target.value }))} />
                  <span className="text-xs text-foreground/55">Acceptée = reçue</span>
                </div>
              );
            })}
          </div>
        )}
        <Button className="mt-4" disabled={pending || !order || remaining.length === 0} onClick={() => order && run(() => postReceipt({
          order_id: order.id,
          ...form,
          lines: remaining.map((line) => {
            const quantity = Number(quantities[line.id] ?? line.quantity - line.received_quantity);
            return { order_line_id: line.id, quantity, accepted_quantity: quantity, note: null };
          }).filter((line) => line.quantity > 0),
        }), "Réception enregistrée.")}>Valider la réception</Button>
      </Panel>
      <DocumentTable headers={["N° réception", "Date", "Commande", "Bon livraison", "Réceptionné par", "Statut"]} rows={data.receipts.map((row) => [row.receipt_number, row.receipt_date, row.order_number, row.delivery_note_number ?? "—", row.received_by_name ?? "—", <Status key="s" value={row.status} />])} />
    </div>
  );
}

function Invoices({ data, pending, run }: { data: PurchaseHubData; pending: boolean; run: Runner }) {
  const eligible = data.orders.filter((order) => order.lines.some((line) => line.received_quantity > line.invoiced_quantity));
  const [orderId, setOrderId] = useState(eligible[0]?.id ?? "");
  const order = eligible.find((row) => row.id === orderId);
  const billable = order?.lines.filter((line) => line.received_quantity > line.invoiced_quantity) ?? [];
  const orderReceipts = data.receipts.filter((row) => row.order_id === orderId && row.status === "POSTED");
  const [invoiceForm, setInvoiceForm] = useState({
    internal_number: "",
    supplier_invoice_number: "",
    invoice_date: today(),
    due_date: "",
    retention_rate_pct: "0",
    retention_due_date: "",
    stamp_rule_id: "",
    attachment_url: "",
    note: "",
  });
  const [payment, setPayment] = useState({
    invoice_id: data.invoices.find((row) => row.open_amount > 0)?.id ?? "",
    account_id: data.accounts[0]?.id ?? "",
    payment_method_id: data.paymentMethods[0]?.id ?? "",
    amount: "",
    payment_date: today(),
    reference: "",
    note: "",
  });
  return (
    <div className="space-y-5">
      <Panel title="Comptabiliser une facture fournisseur" subtitle="Le contrôle BC ↔ réception ↔ facture est automatique.">
        <div className="grid gap-3 md:grid-cols-3">
          <Field label="Commande réceptionnée *"><select className={inputClass} value={orderId} onChange={(e) => setOrderId(e.target.value)}><option value="">Sélectionner</option>{eligible.map((row) => <option key={row.id} value={row.id}>{row.order_number} — {row.supplier_name}</option>)}</select></Field>
          <Field label="N° facture fournisseur *"><input className={inputClass} value={invoiceForm.supplier_invoice_number} onChange={(e) => setInvoiceForm((f) => ({ ...f, supplier_invoice_number: e.target.value }))} /></Field>
          <Field label="N° interne (auto)"><input className={inputClass} value={invoiceForm.internal_number} onChange={(e) => setInvoiceForm((f) => ({ ...f, internal_number: e.target.value }))} /></Field>
          <Field label="Date facture"><input type="date" className={inputClass} value={invoiceForm.invoice_date} onChange={(e) => setInvoiceForm((f) => ({ ...f, invoice_date: e.target.value }))} /></Field>
          <Field label="Échéance"><input type="date" className={inputClass} value={invoiceForm.due_date} onChange={(e) => setInvoiceForm((f) => ({ ...f, due_date: e.target.value }))} /></Field>
          <Field label="RG sur HT (%)"><input type="number" min="0" max="100" step="0.01" className={inputClass} value={invoiceForm.retention_rate_pct} onChange={(e) => setInvoiceForm((f) => ({ ...f, retention_rate_pct: e.target.value }))} /></Field>
          <Field label="Échéance RG"><input type="date" className={inputClass} value={invoiceForm.retention_due_date} onChange={(e) => setInvoiceForm((f) => ({ ...f, retention_due_date: e.target.value }))} /></Field>
          <Field label="Règle de timbre"><select className={inputClass} value={invoiceForm.stamp_rule_id} onChange={(e) => setInvoiceForm((f) => ({ ...f, stamp_rule_id: e.target.value }))}><option value="">Aucun timbre</option>{data.stampRules.filter((row) => row.active).map((row) => <option key={row.id} value={row.id}>{row.label_fr}</option>)}</select></Field>
          <Field label="Pièce jointe (URL)"><input className={inputClass} value={invoiceForm.attachment_url} onChange={(e) => setInvoiceForm((f) => ({ ...f, attachment_url: e.target.value }))} /></Field>
        </div>
        {order && <div className="mt-4 rounded-lg border border-border p-3 text-sm">{billable.map((line) => <p key={line.id}><span className="font-semibold">{line.item_code}</span> — facturable {line.received_quantity - line.invoiced_quantity} {line.unit}</p>)}</div>}
        <Button className="mt-4" disabled={pending || !order || !invoiceForm.supplier_invoice_number || billable.length === 0} onClick={() => order && run(() => postSupplierInvoice({
          order_id: order.id,
          internal_number: invoiceForm.internal_number,
          supplier_invoice_number: invoiceForm.supplier_invoice_number,
          invoice_date: invoiceForm.invoice_date,
          due_date: invoiceForm.due_date || null,
          retention_rate: Number(invoiceForm.retention_rate_pct) / 100,
          retention_due_date: invoiceForm.retention_due_date || null,
          stamp_rule_id: invoiceForm.stamp_rule_id || null,
          receipt_ids: orderReceipts.map((row) => row.id),
          attachment_url: invoiceForm.attachment_url,
          note: invoiceForm.note,
          lines: billable.map((line) => ({ order_line_id: line.id, quantity: line.received_quantity - line.invoiced_quantity })),
        }), "Facture fournisseur comptabilisée.")}>Comptabiliser la facture</Button>
      </Panel>

      <Panel title="Payer une facture fournisseur" subtitle="Le paiement génère automatiquement une sortie Banque/Caisse.">
        <div className="grid gap-3 md:grid-cols-4">
          <Field label="Facture *"><select className={inputClass} value={payment.invoice_id} onChange={(e) => {
            const invoice = data.invoices.find((row) => row.id === e.target.value);
            setPayment((f) => ({ ...f, invoice_id: e.target.value, amount: invoice ? String(invoice.open_amount) : "" }));
          }}><option value="">Sélectionner</option>{data.invoices.filter((row) => row.open_amount > 0).map((row) => <option key={row.id} value={row.id}>{row.internal_number} — {row.supplier_name} — {money(row.open_amount)}</option>)}</select></Field>
          <Field label="Compte *"><select className={inputClass} value={payment.account_id} onChange={(e) => setPayment((f) => ({ ...f, account_id: e.target.value }))}>{data.accounts.map((row) => <option key={row.id} value={row.id}>{row.code} — {row.name}</option>)}</select></Field>
          <Field label="Mode *"><select className={inputClass} value={payment.payment_method_id} onChange={(e) => setPayment((f) => ({ ...f, payment_method_id: e.target.value }))}>{data.paymentMethods.map((row) => <option key={row.id} value={row.id}>{row.label_fr}</option>)}</select></Field>
          <Field label="Montant"><input type="number" min="0" step="0.01" className={inputClass} value={payment.amount} onChange={(e) => setPayment((f) => ({ ...f, amount: e.target.value }))} /></Field>
          <Field label="Date"><input type="date" className={inputClass} value={payment.payment_date} onChange={(e) => setPayment((f) => ({ ...f, payment_date: e.target.value }))} /></Field>
          <Field label="Référence"><input className={inputClass} value={payment.reference} onChange={(e) => setPayment((f) => ({ ...f, reference: e.target.value }))} /></Field>
        </div>
        <Button className="mt-4" disabled={pending || !payment.invoice_id || !payment.account_id || !payment.payment_method_id || Number(payment.amount) <= 0} onClick={() => run(() => postSupplierPayment({ ...payment, amount: Number(payment.amount) }), "Paiement fournisseur enregistré.")}>Enregistrer le paiement</Button>
      </Panel>

      <DocumentTable headers={["Interne / fournisseur", "Fournisseur", "BC", "HT", "TVA", "RG", "Timbre", "Net / reste", "Action"]} rows={data.invoices.map((row) => [
        <span key="n" className="font-semibold">{row.internal_number}<small className="block font-normal text-foreground/50">{row.supplier_invoice_number}</small></span>,
        row.supplier_name,
        row.order_number,
        money(row.total_ht),
        money(row.total_tva),
        `${money(row.retention_amount)} · ${row.retention_status}`,
        money(row.stamp_amount),
        <span key="o">{money(row.net_payable)}<small className="block text-red-600">Reste {money(row.open_amount)}</small></span>,
        row.retention_status === "HELD" && (!row.retention_due_date || row.retention_due_date <= today()) ? <button key="r" className="font-semibold text-brand" disabled={pending} onClick={() => run(() => releaseSupplierRetention(row.id), "Retenue de garantie libérée.")}>Libérer RG</button> : "—",
      ])} />
    </div>
  );
}

function Suppliers({ rows, pending, run }: { rows: Supplier[]; pending: boolean; run: Runner }) {
  const empty = {
    id: "", code: "", legal_name: "", trade_name: "", nif: "", nis: "", rc: "", ai: "",
    address: "", city: "", phone: "", email: "", contact_name: "", payment_terms_days: "0",
    bank_details: "", active: true, notes: "",
  };
  const [form, setForm] = useState(empty);
  function edit(row: Supplier) {
    setForm({
      id: row.id, code: row.code, legal_name: row.legal_name, trade_name: row.trade_name ?? "",
      nif: row.nif ?? "", nis: row.nis ?? "", rc: row.rc ?? "", ai: row.ai ?? "",
      address: row.address ?? "", city: row.city ?? "", phone: row.phone ?? "", email: row.email ?? "",
      contact_name: row.contact_name ?? "", payment_terms_days: String(row.payment_terms_days),
      bank_details: row.bank_details ?? "", active: row.active, notes: row.notes ?? "",
    });
  }
  return (
    <div className="grid gap-5 xl:grid-cols-[430px_1fr]">
      <Panel title={form.id ? "Modifier le fournisseur" : "Nouveau fournisseur"} subtitle="Les identifiants sont conservés dans le référentiel.">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Code *"><input className={inputClass} value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} /></Field>
          <Field label="Raison sociale *"><input className={inputClass} value={form.legal_name} onChange={(e) => setForm((f) => ({ ...f, legal_name: e.target.value }))} /></Field>
          <Field label="NIF"><input className={inputClass} value={form.nif} onChange={(e) => setForm((f) => ({ ...f, nif: e.target.value }))} /></Field>
          <Field label="RC"><input className={inputClass} value={form.rc} onChange={(e) => setForm((f) => ({ ...f, rc: e.target.value }))} /></Field>
          <Field label="NIS"><input className={inputClass} value={form.nis} onChange={(e) => setForm((f) => ({ ...f, nis: e.target.value }))} /></Field>
          <Field label="AI"><input className={inputClass} value={form.ai} onChange={(e) => setForm((f) => ({ ...f, ai: e.target.value }))} /></Field>
          <Field label="Contact"><input className={inputClass} value={form.contact_name} onChange={(e) => setForm((f) => ({ ...f, contact_name: e.target.value }))} /></Field>
          <Field label="Téléphone"><input className={inputClass} value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} /></Field>
          <Field label="E-mail"><input className={inputClass} value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} /></Field>
          <Field label="Délai paiement (jours)"><input type="number" min="0" className={inputClass} value={form.payment_terms_days} onChange={(e) => setForm((f) => ({ ...f, payment_terms_days: e.target.value }))} /></Field>
          <div className="col-span-2"><Field label="Adresse"><input className={inputClass} value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} /></Field></div>
        </div>
        <label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={form.active} onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))} /> Fournisseur actif</label>
        <div className="mt-4 flex gap-2">
          <Button disabled={pending} onClick={() => run(() => upsertSupplier({ ...form, id: form.id || undefined, payment_terms_days: Number(form.payment_terms_days) }), "Fournisseur enregistré.")}>Enregistrer</Button>
          {form.id && <Button variant="secondary" onClick={() => setForm(empty)}>Annuler</Button>}
        </div>
      </Panel>
      <DocumentTable headers={["Code", "Raison sociale", "NIF", "RC", "Contact", "État", ""]} rows={rows.map((row) => [row.code, row.legal_name, row.nif ?? "—", row.rc ?? "—", row.phone ?? row.email ?? "—", row.active ? "Actif" : "Inactif", <button key="e" className="font-semibold text-brand" onClick={() => edit(row)}>Modifier</button>])} />
    </div>
  );
}

function Kpi({ label, value, accent, danger }: { label: string; value: string; accent?: boolean; danger?: boolean }) {
  return <div className={`rounded-xl border p-4 ${danger ? "border-red-300 bg-red-50 dark:bg-red-950/20" : "border-border bg-surface"}`}><p className="text-xs font-semibold uppercase tracking-wide text-foreground/50">{label}</p><p className={`mt-2 text-2xl font-bold ${accent ? "text-brand" : danger ? "text-red-700" : ""}`}>{value}</p></div>;
}

function Panel({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return <section className="rounded-xl border border-border bg-surface p-5 shadow-sm"><h2 className="text-lg font-bold">{title}</h2>{subtitle && <p className="mb-4 mt-1 text-sm text-foreground/55">{subtitle}</p>}{children}</section>;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block text-sm"><span className="mb-1 block text-xs font-semibold text-foreground/60">{label}</span>{children}</label>;
}

function Notice({ tone, children }: { tone: "error" | "success"; children: ReactNode }) {
  return <div className={`rounded-lg border px-4 py-3 text-sm ${tone === "error" ? "border-red-300 bg-red-50 text-red-800" : "border-green-300 bg-green-50 text-green-800"}`}>{children}</div>;
}

function Status({ value }: { value: string }) {
  const positive = ["APPROVED", "RECEIVED", "POSTED", "CLOSED"].includes(value);
  const negative = ["CANCELLED"].includes(value);
  return <span className={`inline-flex rounded-full px-2 py-1 text-[11px] font-bold ${negative ? "bg-red-100 text-red-700" : positive ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-800"}`}>{value}</span>;
}

function DocumentTable({ headers, rows }: { headers: string[]; rows: ReactNode[][] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-surface">
      <table className="w-full text-sm">
        <thead className="bg-surface-muted text-left text-xs uppercase tracking-wide text-foreground/50"><tr>{headers.map((header) => <th key={header} className="whitespace-nowrap px-4 py-3">{header}</th>)}</tr></thead>
        <tbody>{rows.length === 0 ? <tr><td colSpan={headers.length} className="px-4 py-10 text-center text-foreground/45">Aucune donnée.</td></tr> : rows.map((row, rowIndex) => <tr key={rowIndex} className="border-t border-border">{row.map((cell, cellIndex) => <td key={cellIndex} className="whitespace-nowrap px-4 py-3">{cell}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}
