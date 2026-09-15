"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  updateNumberSequence,
  upsertSituationType,
  upsertStampRule,
  type NumberSequence,
  type PurchaseHubData,
  type SituationType,
  type StampRule,
} from "@/lib/actions/purchases";
import { Button } from "@/components/ui/button";

type Tab = "situations" | "stamp" | "sequences";
const inputClass =
  "h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/15";

export function PurchaseSettings({
  initialData,
  loadError,
}: {
  initialData: PurchaseHubData;
  loadError?: string;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("situations");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(loadError ?? null);
  const [message, setMessage] = useState<string | null>(null);

  function run(action: () => Promise<{ ok: boolean; error?: string }>, success: string) {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) return setError(result.error ?? "Opération refusée.");
      setMessage(success);
      router.refresh();
    });
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-brand">Configuration sans code</p>
          <h1 className="text-2xl font-bold">Paramètres achats & facturation</h1>
          <p className="text-sm text-foreground/55">Types de situation, règles légales du timbre et numérotation.</p>
        </div>
        <a href="/achats" className="rounded-md border border-border bg-surface px-4 py-2 text-sm font-semibold">Retour aux achats</a>
      </header>
      {error && <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>}
      {message && <div className="rounded-lg border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-800">{message}</div>}
      <div className="flex gap-1 rounded-xl border border-border bg-surface p-1">
        {([["situations", "Types de situation"], ["stamp", "Timbre légal"], ["sequences", "Numérotation"]] as const).map(([value, label]) => (
          <button key={value} onClick={() => setTab(value)} className={`rounded-lg px-4 py-2 text-sm font-semibold ${tab === value ? "bg-brand text-white" : "hover:bg-surface-muted"}`}>{label}</button>
        ))}
      </div>
      {tab === "situations" && <Situations rows={initialData.situations} pending={pending} run={run} />}
      {tab === "stamp" && <StampRules rows={initialData.stampRules} methods={initialData.paymentMethods} pending={pending} run={run} />}
      {tab === "sequences" && <Sequences rows={initialData.sequences} pending={pending} run={run} />}
    </div>
  );
}

type Runner = (action: () => Promise<{ ok: boolean; error?: string }>, success: string) => void;

function Situations({ rows, pending, run }: { rows: SituationType[]; pending: boolean; run: Runner }) {
  const empty = { id: "", code: "", label_fr: "", label_ar: "", includes_supply: true, includes_installation: false, active: true, sort_order: "0" };
  const [form, setForm] = useState(empty);
  function edit(row: SituationType) {
    setForm({ id: row.id, code: row.code, label_fr: row.label_fr, label_ar: row.label_ar ?? "", includes_supply: row.includes_supply, includes_installation: row.includes_installation, active: row.active, sort_order: String(row.sort_order) });
  }
  return (
    <ConfigGrid>
      <Editor title={form.id ? "Modifier le type" : "Nouveau type de situation"}>
        <Field label="Code"><input className={inputClass} value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} /></Field>
        <Field label="Libellé français"><input className={inputClass} value={form.label_fr} onChange={(e) => setForm((f) => ({ ...f, label_fr: e.target.value }))} /></Field>
        <Field label="Libellé arabe"><input dir="rtl" className={inputClass} value={form.label_ar} onChange={(e) => setForm((f) => ({ ...f, label_ar: e.target.value }))} /></Field>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.includes_supply} onChange={(e) => setForm((f) => ({ ...f, includes_supply: e.target.checked }))} /> Comprend fourniture</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.includes_installation} onChange={(e) => setForm((f) => ({ ...f, includes_installation: e.target.checked }))} /> Comprend pose</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.active} onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))} /> Actif</label>
        <Buttons pending={pending} editing={Boolean(form.id)} reset={() => setForm(empty)} save={() => run(() => upsertSituationType({ ...form, id: form.id || undefined, sort_order: Number(form.sort_order) }), "Type de situation enregistré.")} />
      </Editor>
      <Table headers={["Code", "Libellé", "Composition", "État", ""]} rows={rows.map((row) => [row.code, row.label_fr, [row.includes_supply && "Fourniture", row.includes_installation && "Pose"].filter(Boolean).join(" + "), row.active ? "Actif" : "Inactif", <button key="e" className="font-semibold text-brand" onClick={() => edit(row)}>Modifier</button>])} />
    </ConfigGrid>
  );
}

function StampRules({ rows, methods, pending, run }: { rows: StampRule[]; methods: PurchaseHubData["paymentMethods"]; pending: boolean; run: Runner }) {
  const empty = {
    id: "", code: "", label_fr: "", calculation_mode: "FIXED" as StampRule["calculation_mode"],
    calculation_base: "TTC" as StampRule["calculation_base"], fixed_amount: "0", rate_pct: "0",
    brackets_json: '[{"from":0,"to":null,"amount":0}]', payment_method_id: "",
    valid_from: "", valid_to: "", priority: "100", active: true, legal_reference: "",
  };
  const [form, setForm] = useState(empty);
  function edit(row: StampRule) {
    setForm({
      id: row.id, code: row.code, label_fr: row.label_fr, calculation_mode: row.calculation_mode,
      calculation_base: row.calculation_base, fixed_amount: String(row.fixed_amount ?? 0),
      rate_pct: String((row.rate ?? 0) * 100), brackets_json: JSON.stringify(row.brackets),
      payment_method_id: row.payment_method_id ?? "", valid_from: row.valid_from ?? "",
      valid_to: row.valid_to ?? "", priority: String(row.priority), active: row.active,
      legal_reference: row.legal_reference ?? "",
    });
  }
  function save() {
    let brackets: unknown = [];
    try {
      brackets = JSON.parse(form.brackets_json);
    } catch {
      return run(async () => ({ ok: false, error: "JSON des tranches invalide." }), "");
    }
    run(() => upsertStampRule({
      id: form.id || undefined,
      code: form.code,
      label_fr: form.label_fr,
      calculation_mode: form.calculation_mode,
      calculation_base: form.calculation_base,
      fixed_amount: form.calculation_mode === "FIXED" ? Number(form.fixed_amount) : null,
      rate: form.calculation_mode === "PERCENT" ? Number(form.rate_pct) / 100 : null,
      brackets: form.calculation_mode === "BRACKETS" ? brackets : [],
      payment_method_id: form.payment_method_id || null,
      valid_from: form.valid_from || null,
      valid_to: form.valid_to || null,
      priority: Number(form.priority),
      active: form.active,
      legal_reference: form.legal_reference,
    }), "Règle de timbre enregistrée.");
  }
  return (
    <ConfigGrid>
      <Editor title={form.id ? "Modifier la règle" : "Nouvelle règle de timbre"}>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Code"><input className={inputClass} value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} /></Field>
          <Field label="Priorité"><input type="number" className={inputClass} value={form.priority} onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))} /></Field>
        </div>
        <Field label="Libellé"><input className={inputClass} value={form.label_fr} onChange={(e) => setForm((f) => ({ ...f, label_fr: e.target.value }))} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Mode"><select className={inputClass} value={form.calculation_mode} onChange={(e) => setForm((f) => ({ ...f, calculation_mode: e.target.value as StampRule["calculation_mode"] }))}><option value="FIXED">Montant fixe</option><option value="PERCENT">Pourcentage</option><option value="BRACKETS">Tranches</option></select></Field>
          <Field label="Base"><select className={inputClass} value={form.calculation_base} onChange={(e) => setForm((f) => ({ ...f, calculation_base: e.target.value as StampRule["calculation_base"] }))}><option value="HT">HT</option><option value="TVA">TVA</option><option value="TTC">TTC</option></select></Field>
        </div>
        {form.calculation_mode === "FIXED" && <Field label="Montant DZD"><input type="number" min="0" step="0.01" className={inputClass} value={form.fixed_amount} onChange={(e) => setForm((f) => ({ ...f, fixed_amount: e.target.value }))} /></Field>}
        {form.calculation_mode === "PERCENT" && <Field label="Taux (%)"><input type="number" min="0" max="100" step="0.0001" className={inputClass} value={form.rate_pct} onChange={(e) => setForm((f) => ({ ...f, rate_pct: e.target.value }))} /></Field>}
        {form.calculation_mode === "BRACKETS" && <Field label='Tranches JSON [{"from":0,"to":1000,"amount":10}]'><textarea className="min-h-24 w-full rounded-md border border-border bg-background p-3 font-mono text-xs" value={form.brackets_json} onChange={(e) => setForm((f) => ({ ...f, brackets_json: e.target.value }))} /></Field>}
        <Field label="Mode de paiement concerné"><select className={inputClass} value={form.payment_method_id} onChange={(e) => setForm((f) => ({ ...f, payment_method_id: e.target.value }))}><option value="">Tous / sélection manuelle</option>{methods.map((row) => <option key={row.id} value={row.id}>{row.label_fr}</option>)}</select></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Valide du"><input type="date" className={inputClass} value={form.valid_from} onChange={(e) => setForm((f) => ({ ...f, valid_from: e.target.value }))} /></Field>
          <Field label="Au"><input type="date" className={inputClass} value={form.valid_to} onChange={(e) => setForm((f) => ({ ...f, valid_to: e.target.value }))} /></Field>
        </div>
        <Field label="Référence légale"><input className={inputClass} value={form.legal_reference} onChange={(e) => setForm((f) => ({ ...f, legal_reference: e.target.value }))} /></Field>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.active} onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))} /> Règle active</label>
        <Buttons pending={pending} editing={Boolean(form.id)} reset={() => setForm(empty)} save={save} />
      </Editor>
      <Table headers={["Code", "Règle", "Mode", "Validité", "Référence", ""]} rows={rows.map((row) => [row.code, row.label_fr, row.calculation_mode, `${row.valid_from ?? "—"} → ${row.valid_to ?? "—"}`, row.legal_reference ?? "—", <button key="e" className="font-semibold text-brand" onClick={() => edit(row)}>Modifier</button>])} />
    </ConfigGrid>
  );
}

function Sequences({ rows, pending, run }: { rows: NumberSequence[]; pending: boolean; run: Runner }) {
  return <div className="grid gap-4 md:grid-cols-2">{rows.map((row) => <SequenceCard key={row.document_type} row={row} pending={pending} run={run} />)}</div>;
}

function SequenceCard({ row, pending, run }: { row: NumberSequence; pending: boolean; run: Runner }) {
  const [form, setForm] = useState({ ...row, padding: String(row.padding), next_value: String(row.next_value) });
  return (
    <Editor title={row.document_type}>
      <Field label="Préfixe"><input className={inputClass} value={form.prefix} onChange={(e) => setForm((f) => ({ ...f, prefix: e.target.value }))} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Nombre de chiffres"><input type="number" min="2" max="10" className={inputClass} value={form.padding} onChange={(e) => setForm((f) => ({ ...f, padding: e.target.value }))} /></Field>
        <Field label="Prochain numéro"><input type="number" min="1" className={inputClass} value={form.next_value} onChange={(e) => setForm((f) => ({ ...f, next_value: e.target.value }))} /></Field>
      </div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.include_year} onChange={(e) => setForm((f) => ({ ...f, include_year: e.target.checked }))} /> Inclure l’année</label>
      <Button disabled={pending} onClick={() => run(() => updateNumberSequence({ ...form, padding: Number(form.padding), next_value: Number(form.next_value) }), "Séquence enregistrée.")}>Enregistrer</Button>
    </Editor>
  );
}

function ConfigGrid({ children }: { children: ReactNode }) {
  return <div className="grid gap-5 xl:grid-cols-[420px_1fr]">{children}</div>;
}
function Editor({ title, children }: { title: string; children: ReactNode }) {
  return <section className="space-y-3 rounded-xl border border-border bg-surface p-5 shadow-sm"><h2 className="font-bold">{title}</h2>{children}</section>;
}
function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block text-sm"><span className="mb-1 block text-xs font-semibold text-foreground/60">{label}</span>{children}</label>;
}
function Buttons({ pending, editing, reset, save }: { pending: boolean; editing: boolean; reset: () => void; save: () => void }) {
  return <div className="flex gap-2"><Button disabled={pending} onClick={save}>Enregistrer</Button>{editing && <Button variant="secondary" onClick={reset}>Annuler</Button>}</div>;
}
function Table({ headers, rows }: { headers: string[]; rows: ReactNode[][] }) {
  return <div className="overflow-x-auto rounded-xl border border-border bg-surface"><table className="w-full text-sm"><thead className="bg-surface-muted text-left text-xs uppercase text-foreground/50"><tr>{headers.map((header) => <th key={header} className="px-4 py-3">{header}</th>)}</tr></thead><tbody>{rows.map((row, i) => <tr key={i} className="border-t border-border">{row.map((cell, j) => <td key={j} className="px-4 py-3">{cell}</td>)}</tr>)}</tbody></table></div>;
}
