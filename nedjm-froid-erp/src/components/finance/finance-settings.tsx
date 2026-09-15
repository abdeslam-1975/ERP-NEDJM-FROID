"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  deleteFinanceConfig,
  lockFinancePeriod,
  unlockFinancePeriod,
  upsertFinanceAccount,
  upsertFinanceCategory,
  upsertFinanceMethod,
  upsertFinanceTaxRate,
  type FinanceAccount,
  type FinanceCategory,
  type FinanceHubData,
  type FinancePaymentMethod,
  type FinanceTaxRate,
} from "@/lib/actions/finance";
import { Button } from "@/components/ui/button";

type Tab = "accounts" | "tax" | "methods" | "categories" | "periods";
const today = () => new Date().toISOString().slice(0, 10);
const inputClass =
  "h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/15";

export function FinanceSettings({
  initialData,
  loadError,
}: {
  initialData: FinanceHubData;
  loadError?: string;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("accounts");
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

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-brand">Configuration UI</p>
          <h1 className="text-2xl font-bold">Paramètres financiers</h1>
          <p className="text-sm text-foreground/55">
            Comptes, TVA, modes, catégories et périodes — sans modification du code.
          </p>
        </div>
        <a href="/finance" className="rounded-md border border-border bg-surface px-4 py-2 text-sm font-semibold">
          Retour au hub
        </a>
      </div>
      {error && <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>}
      {message && <div className="rounded-lg border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-800">{message}</div>}
      <div className="flex gap-1 overflow-x-auto rounded-lg border border-border bg-surface p-1">
        {(
          [
            ["accounts", "Comptes"],
            ["tax", "TVA"],
            ["methods", "Modes de paiement"],
            ["categories", "Catégories"],
            ["periods", "Clôtures"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            onClick={() => setTab(value)}
            className={`whitespace-nowrap rounded-md px-4 py-2 text-sm font-semibold ${tab === value ? "bg-brand text-white" : "hover:bg-surface-muted"}`}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "accounts" && <AccountsEditor data={initialData} pending={pending} run={run} />}
      {tab === "tax" && <TaxEditor rows={initialData.taxRates} pending={pending} run={run} />}
      {tab === "methods" && <MethodsEditor rows={initialData.methods} pending={pending} run={run} />}
      {tab === "categories" && <CategoriesEditor rows={initialData.categories} pending={pending} run={run} />}
      {tab === "periods" && <PeriodsEditor data={initialData} pending={pending} run={run} />}
    </div>
  );
}

type Runner = (
  action: () => Promise<{ ok: boolean; error?: string }>,
  success: string,
) => void;

function AccountsEditor({
  data,
  pending,
  run,
}: {
  data: FinanceHubData;
  pending: boolean;
  run: Runner;
}) {
  const empty = {
    id: "",
    code: "",
    name: "",
    account_type: "BANK" as "BANK" | "CASH",
    site_id: "",
    currency_code: "DZD",
    bank_name: "",
    account_number: "",
    rib: "",
    opening_balance: "0",
    opening_date: today(),
    allow_negative: false,
    active: true,
    notes: "",
  };
  const [form, setForm] = useState(empty);

  function edit(a: FinanceAccount) {
    setForm({
      id: a.id,
      code: a.code,
      name: a.name,
      account_type: a.account_type,
      site_id: a.site_id ?? "",
      currency_code: a.currency_code,
      bank_name: a.bank_name ?? "",
      account_number: a.account_number ?? "",
      rib: a.rib ?? "",
      opening_balance: String(a.opening_balance),
      opening_date: a.opening_date,
      allow_negative: a.allow_negative,
      active: a.active,
      notes: a.notes ?? "",
    });
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[420px_1fr]">
      <EditorCard title={form.id ? "Modifier le compte" : "Nouveau compte"}>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Code"><input className={inputClass} value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} /></Field>
          <Field label="Type"><select className={inputClass} value={form.account_type} onChange={(e) => setForm((f) => ({ ...f, account_type: e.target.value as "BANK" | "CASH" }))}><option value="BANK">Banque</option><option value="CASH">Caisse</option></select></Field>
          <div className="col-span-2"><Field label="Libellé"><input className={inputClass} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /></Field></div>
          <Field label="Site"><select className={inputClass} value={form.site_id} onChange={(e) => setForm((f) => ({ ...f, site_id: e.target.value }))}><option value="">Central / tous sites</option>{data.sites.map((s) => <option key={s.id} value={s.id}>{s.code} — {s.name_fr}</option>)}</select></Field>
          <Field label="Devise"><input className={inputClass} maxLength={3} value={form.currency_code} onChange={(e) => setForm((f) => ({ ...f, currency_code: e.target.value }))} /></Field>
          <Field label="Solde initial"><input type="number" step="0.01" className={inputClass} value={form.opening_balance} onChange={(e) => setForm((f) => ({ ...f, opening_balance: e.target.value }))} /></Field>
          <Field label="Date initiale"><input type="date" className={inputClass} value={form.opening_date} onChange={(e) => setForm((f) => ({ ...f, opening_date: e.target.value }))} /></Field>
          {form.account_type === "BANK" && (
            <>
              <Field label="Banque"><input className={inputClass} value={form.bank_name} onChange={(e) => setForm((f) => ({ ...f, bank_name: e.target.value }))} /></Field>
              <Field label="N° compte"><input className={inputClass} value={form.account_number} onChange={(e) => setForm((f) => ({ ...f, account_number: e.target.value }))} /></Field>
              <div className="col-span-2"><Field label="RIB"><input className={inputClass} value={form.rib} onChange={(e) => setForm((f) => ({ ...f, rib: e.target.value }))} /></Field></div>
            </>
          )}
        </div>
        <label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={form.allow_negative} onChange={(e) => setForm((f) => ({ ...f, allow_negative: e.target.checked }))} /> Autoriser solde négatif</label>
        <label className="mt-2 flex items-center gap-2 text-sm"><input type="checkbox" checked={form.active} onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))} /> Compte actif</label>
        <div className="mt-4 flex gap-2">
          <Button disabled={pending} onClick={() => run(() => upsertFinanceAccount({ ...form, id: form.id || undefined, site_id: form.site_id || null, opening_balance: Number(form.opening_balance) }), "Compte enregistré.")}>Enregistrer</Button>
          {form.id && <Button variant="secondary" onClick={() => setForm(empty)}>Annuler</Button>}
        </div>
      </EditorCard>
      <DataTable
        headers={["Code", "Compte", "Type", "Solde", "État", ""]}
        rows={data.accounts.map((a) => [
          <span key="code" className="font-mono text-xs">{a.code}</span>,
          a.name,
          a.account_type,
          new Intl.NumberFormat("fr-DZ", { style: "currency", currency: a.currency_code }).format(a.balance),
          a.active ? "Actif" : "Inactif",
          <button key="edit" className="font-semibold text-brand" onClick={() => edit(a)}>Modifier</button>,
        ])}
      />
    </div>
  );
}

function TaxEditor({ rows, pending, run }: { rows: FinanceTaxRate[]; pending: boolean; run: Runner }) {
  const empty = { id: "", code: "", label_fr: "", rate_pct: "", active: true, is_default: false, valid_from: "", valid_to: "" };
  const [form, setForm] = useState(empty);
  function edit(r: FinanceTaxRate) {
    setForm({ id: r.id, code: r.code, label_fr: r.label_fr, rate_pct: String(r.rate * 100), active: r.active, is_default: r.is_default, valid_from: r.valid_from ?? "", valid_to: r.valid_to ?? "" });
  }
  return (
    <ConfigLayout>
      <EditorCard title={form.id ? "Modifier le taux" : "Nouveau taux TVA"}>
        <Field label="Code"><input className={inputClass} value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} /></Field>
        <Field label="Libellé"><input className={inputClass} value={form.label_fr} onChange={(e) => setForm((f) => ({ ...f, label_fr: e.target.value }))} /></Field>
        <Field label="Taux (%)"><input type="number" min="0" max="100" step="0.01" className={inputClass} value={form.rate_pct} onChange={(e) => setForm((f) => ({ ...f, rate_pct: e.target.value }))} /></Field>
        <div className="grid grid-cols-2 gap-2"><Field label="Valide du"><input type="date" className={inputClass} value={form.valid_from} onChange={(e) => setForm((f) => ({ ...f, valid_from: e.target.value }))} /></Field><Field label="Au"><input type="date" className={inputClass} value={form.valid_to} onChange={(e) => setForm((f) => ({ ...f, valid_to: e.target.value }))} /></Field></div>
        <Active checked={form.active} onChange={(active) => setForm((f) => ({ ...f, active }))} />
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.is_default} onChange={(e) => setForm((f) => ({ ...f, is_default: e.target.checked, active: e.target.checked ? true : f.active }))} /> Taux par défaut</label>
        <FormButtons pending={pending} editing={Boolean(form.id)} reset={() => setForm(empty)} save={() => run(() => upsertFinanceTaxRate({ id: form.id || undefined, code: form.code, label_fr: form.label_fr, rate: Number(form.rate_pct) / 100, active: form.active, is_default: form.is_default, valid_from: form.valid_from || null, valid_to: form.valid_to || null }), "Taux TVA enregistré.")} />
      </EditorCard>
      <DataTable headers={["Code", "Libellé", "Taux", "État", "Actions"]} rows={rows.map((r) => [r.code, r.label_fr, `${(r.rate * 100).toFixed(2)} %`, r.is_default ? "Par défaut" : r.active ? "Actif" : "Inactif", <Actions key="a" edit={() => edit(r)} remove={() => run(() => deleteFinanceConfig({ entity: "tax_rate", id: r.id }), "Taux supprimé.")} />])} />
    </ConfigLayout>
  );
}

function MethodsEditor({ rows, pending, run }: { rows: FinancePaymentMethod[]; pending: boolean; run: Runner }) {
  const empty = { id: "", code: "", label_fr: "", account_scope: "BOTH" as "BANK" | "CASH" | "BOTH", legacy_contract_method: "AUTRE", active: true, sort_order: "0" };
  const [form, setForm] = useState(empty);
  function edit(r: FinancePaymentMethod) { setForm({ id: r.id, code: r.code, label_fr: r.label_fr, account_scope: r.account_scope, legacy_contract_method: r.legacy_contract_method ?? "AUTRE", active: r.active, sort_order: String(r.sort_order) }); }
  return (
    <ConfigLayout>
      <EditorCard title={form.id ? "Modifier le mode" : "Nouveau mode"}>
        <Field label="Code"><input className={inputClass} value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} /></Field>
        <Field label="Libellé"><input className={inputClass} value={form.label_fr} onChange={(e) => setForm((f) => ({ ...f, label_fr: e.target.value }))} /></Field>
        <Field label="Comptes compatibles"><select className={inputClass} value={form.account_scope} onChange={(e) => setForm((f) => ({ ...f, account_scope: e.target.value as typeof f.account_scope }))}><option value="BOTH">Banque + Caisse</option><option value="BANK">Banque</option><option value="CASH">Caisse</option></select></Field>
        <Field label="Compatibilité contrats"><select className={inputClass} value={form.legacy_contract_method} onChange={(e) => setForm((f) => ({ ...f, legacy_contract_method: e.target.value }))}>{["VIREMENT", "CHEQUE", "ESPECES", "AUTRE"].map((x) => <option key={x}>{x}</option>)}</select></Field>
        <Active checked={form.active} onChange={(active) => setForm((f) => ({ ...f, active }))} />
        <FormButtons pending={pending} editing={Boolean(form.id)} reset={() => setForm(empty)} save={() => run(() => upsertFinanceMethod({ ...form, id: form.id || undefined, sort_order: Number(form.sort_order) }), "Mode enregistré.")} />
      </EditorCard>
      <DataTable headers={["Code", "Libellé", "Périmètre", "État", "Actions"]} rows={rows.map((r) => [r.code, r.label_fr, r.account_scope, r.active ? "Actif" : "Inactif", <Actions key="a" edit={() => edit(r)} remove={() => run(() => deleteFinanceConfig({ entity: "payment_method", id: r.id }), "Mode supprimé.")} />])} />
    </ConfigLayout>
  );
}

function CategoriesEditor({ rows, pending, run }: { rows: FinanceCategory[]; pending: boolean; run: Runner }) {
  const empty = { id: "", code: "", label_fr: "", direction: "BOTH" as "IN" | "OUT" | "BOTH", account_scope: "BOTH" as "BANK" | "CASH" | "BOTH", active: true, sort_order: "0" };
  const [form, setForm] = useState(empty);
  function edit(r: FinanceCategory) { setForm({ id: r.id, code: r.code, label_fr: r.label_fr, direction: r.direction, account_scope: r.account_scope, active: r.active, sort_order: String(r.sort_order) }); }
  return (
    <ConfigLayout>
      <EditorCard title={form.id ? "Modifier la catégorie" : "Nouvelle catégorie"}>
        <Field label="Code"><input className={inputClass} value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} /></Field>
        <Field label="Libellé"><input className={inputClass} value={form.label_fr} onChange={(e) => setForm((f) => ({ ...f, label_fr: e.target.value }))} /></Field>
        <Field label="Sens"><select className={inputClass} value={form.direction} onChange={(e) => setForm((f) => ({ ...f, direction: e.target.value as typeof f.direction }))}><option value="BOTH">Entrée + Sortie</option><option value="IN">Entrée</option><option value="OUT">Sortie</option></select></Field>
        <Field label="Périmètre"><select className={inputClass} value={form.account_scope} onChange={(e) => setForm((f) => ({ ...f, account_scope: e.target.value as typeof f.account_scope }))}><option value="BOTH">Banque + Caisse</option><option value="BANK">Banque</option><option value="CASH">Caisse</option></select></Field>
        <Active checked={form.active} onChange={(active) => setForm((f) => ({ ...f, active }))} />
        <FormButtons pending={pending} editing={Boolean(form.id)} reset={() => setForm(empty)} save={() => run(() => upsertFinanceCategory({ ...form, id: form.id || undefined, sort_order: Number(form.sort_order) }), "Catégorie enregistrée.")} />
      </EditorCard>
      <DataTable headers={["Code", "Libellé", "Sens", "Périmètre", "Actions"]} rows={rows.map((r) => [r.code, r.label_fr, r.direction, r.account_scope, <Actions key="a" edit={() => edit(r)} remove={() => run(() => deleteFinanceConfig({ entity: "category", id: r.id }), "Catégorie supprimée.")} />])} />
    </ConfigLayout>
  );
}

function PeriodsEditor({ data, pending, run }: { data: FinanceHubData; pending: boolean; run: Runner }) {
  const [form, setForm] = useState({ account_id: data.accounts[0]?.id ?? "", start_date: today().slice(0, 7) + "-01", end_date: today(), reason: "" });
  return (
    <ConfigLayout>
      <EditorCard title="Clôturer une période">
        <p className="mb-3 text-sm text-foreground/55">Bloque toute écriture datée dans l&apos;intervalle. Le déverrouillage reste audité.</p>
        <Field label="Compte"><select className={inputClass} value={form.account_id} onChange={(e) => setForm((f) => ({ ...f, account_id: e.target.value }))}>{data.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>
        <div className="grid grid-cols-2 gap-2"><Field label="Du"><input type="date" className={inputClass} value={form.start_date} onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))} /></Field><Field label="Au"><input type="date" className={inputClass} value={form.end_date} onChange={(e) => setForm((f) => ({ ...f, end_date: e.target.value }))} /></Field></div>
        <Field label="Motif"><input className={inputClass} value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} /></Field>
        <Button className="mt-4" disabled={pending} onClick={() => run(() => lockFinancePeriod(form), "Période clôturée.")}>Clôturer</Button>
      </EditorCard>
      <DataTable headers={["Compte", "Du", "Au", "Motif", "État / action"]} rows={data.periodLocks.map((l) => [l.account_name ?? "Tous", l.start_date, l.end_date, l.reason ?? "—", l.unlocked_at ? "Déverrouillée" : <button key="u" className="font-semibold text-red-600" onClick={() => run(() => unlockFinancePeriod(l.id), "Période déverrouillée.")}>Déverrouiller</button>])} />
    </ConfigLayout>
  );
}

function ConfigLayout({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-5 xl:grid-cols-[380px_1fr]">{children}</div>;
}
function EditorCard({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="space-y-3 rounded-xl border border-border bg-surface p-4 shadow-sm"><h2 className="font-bold">{title}</h2>{children}</section>;
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1 block text-xs font-semibold text-foreground/65">{label}</span>{children}</label>;
}
function Active({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} /> Actif</label>;
}
function FormButtons({ pending, editing, save, reset }: { pending: boolean; editing: boolean; save: () => void; reset: () => void }) {
  return <div className="flex gap-2 pt-2"><Button disabled={pending} onClick={save}>Enregistrer</Button>{editing && <Button variant="secondary" onClick={reset}>Annuler</Button>}</div>;
}
function Actions({ edit, remove }: { edit: () => void; remove: () => void }) {
  return <span className="space-x-3 whitespace-nowrap"><button className="font-semibold text-brand" onClick={edit}>Modifier</button><button className="text-red-600" onClick={() => { if (window.confirm("Supprimer ce paramètre ?")) remove(); }}>Supprimer</button></span>;
}
function DataTable({ headers, rows }: { headers: string[]; rows: React.ReactNode[][] }) {
  return (
    <section className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
      <div className="overflow-x-auto"><table className="w-full min-w-[680px] text-sm">
        <thead className="bg-surface-muted text-left text-xs uppercase text-foreground/55"><tr>{headers.map((h) => <th key={h} className="px-3 py-2">{h}</th>)}</tr></thead>
        <tbody>{rows.length === 0 ? <tr><td colSpan={headers.length} className="px-4 py-10 text-center text-foreground/50">Aucune donnée.</td></tr> : rows.map((row, i) => <tr key={i} className="border-t border-border">{row.map((cell, j) => <td key={j} className="px-3 py-2">{cell}</td>)}</tr>)}</tbody>
      </table></div>
    </section>
  );
}

