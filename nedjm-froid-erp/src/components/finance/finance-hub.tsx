"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  addCashAdvanceExpense,
  deleteCashAdvanceExpense,
  issueCashAdvance,
  postFinanceMovement,
  postFinanceTransfer,
  reconcileFinanceMovement,
  reverseFinanceMovement,
  settleCashAdvance,
  type CashAdvance,
  type FinanceHubData,
  type FinanceTransaction,
} from "@/lib/actions/finance";
import { Button } from "@/components/ui/button";

type Tab = "dashboard" | "operations" | "advances" | "reconciliation";

const today = () => new Date().toISOString().slice(0, 10);
const inputClass =
  "h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/15";

function money(value: number, currency = "DZD") {
  return new Intl.NumberFormat("fr-DZ", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value);
}

export function FinanceHub({
  initialData,
  loadError,
}: {
  initialData: FinanceHubData;
  loadError?: string;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("dashboard");
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(loadError ?? null);

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

  const totalBank = initialData.accounts
    .filter((a) => a.account_type === "BANK" && a.active)
    .reduce((s, a) => s + a.balance, 0);
  const totalCash = initialData.accounts
    .filter((a) => a.account_type === "CASH" && a.active)
    .reduce((s, a) => s + a.balance, 0);
  const openAdvances = initialData.advances.filter((a) => a.status === "OPEN");

  return (
    <div className="space-y-5">
      <div className="overflow-hidden rounded-xl border border-border bg-gradient-to-r from-[#071b3f] via-[#0b3472] to-[#1268a8] p-5 text-white shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-200">
              Trésorerie intégrée
            </p>
            <h1 className="mt-1 text-2xl font-bold">Banque · Caisse · Paiements</h1>
            <p className="mt-1 max-w-2xl text-sm text-blue-100">
              Soldes en temps réel, journal immuable, rapprochement et avances de caisse.
            </p>
          </div>
          <a
            href="/finance/parametres"
            className="rounded-md border border-white/30 bg-white/10 px-4 py-2 text-sm font-semibold hover:bg-white/20"
          >
            Paramètres
          </a>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">
          {error}
        </div>
      )}
      {message && (
        <div className="rounded-lg border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-800 dark:border-green-900 dark:bg-green-950/30 dark:text-green-200">
          {message}
        </div>
      )}

      <div className="flex gap-1 overflow-x-auto rounded-lg border border-border bg-surface p-1">
        {(
          [
            ["dashboard", "Vue d'ensemble"],
            ["operations", "Opérations"],
            ["advances", "Avances caisse"],
            ["reconciliation", "Rapprochement"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            className={`whitespace-nowrap rounded-md px-4 py-2 text-sm font-semibold ${
              tab === value ? "bg-brand text-white" : "text-foreground/65 hover:bg-surface-muted"
            }`}
            onClick={() => setTab(value)}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "dashboard" && (
        <Dashboard
          data={initialData}
          totalBank={totalBank}
          totalCash={totalCash}
          openAdvances={openAdvances}
        />
      )}
      {tab === "operations" && (
        <Operations
          data={initialData}
          pending={pending}
          run={run}
        />
      )}
      {tab === "advances" && (
        <Advances data={initialData} pending={pending} run={run} />
      )}
      {tab === "reconciliation" && (
        <Reconciliation data={initialData} pending={pending} run={run} />
      )}
    </div>
  );
}

function Dashboard({
  data,
  totalBank,
  totalCash,
  openAdvances,
}: {
  data: FinanceHubData;
  totalBank: number;
  totalCash: number;
  openAdvances: CashAdvance[];
}) {
  const unreconciled = data.transactions.filter(
    (t) => !t.reconciled_at && !t.reversal_of && !t.is_reversed,
  ).length;
  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-4">
        <Kpi label="Solde banques" value={money(totalBank)} tone="blue" />
        <Kpi label="Solde caisses" value={money(totalCash)} tone="green" />
        <Kpi
          label="Avances ouvertes"
          value={money(openAdvances.reduce((s, a) => s + a.remaining, 0))}
          note={`${openAdvances.length} dossier(s)`}
          tone="amber"
        />
        <Kpi label="À rapprocher" value={String(unreconciled)} note="mouvements" tone="slate" />
      </div>
      <section>
        <h2 className="mb-3 text-base font-bold">Comptes actifs</h2>
        {data.accounts.length === 0 ? (
          <Empty text="Créez votre premier compte Banque ou Caisse depuis Paramètres." />
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {data.accounts.filter((a) => a.active).map((account) => (
              <article
                key={account.id}
                className="rounded-xl border border-border bg-surface p-4 shadow-sm"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <span className="rounded-full bg-brand-muted px-2 py-1 text-[11px] font-bold text-brand">
                      {account.account_type === "BANK" ? "BANQUE" : "CAISSE"}
                    </span>
                    <h3 className="mt-2 font-bold">{account.name}</h3>
                    <p className="font-mono text-xs text-foreground/50">{account.code}</p>
                  </div>
                  <span className="text-xl">{account.account_type === "BANK" ? "▰" : "▣"}</span>
                </div>
                <p className="mt-5 text-xs text-foreground/55">Solde disponible</p>
                <p className={`text-xl font-bold ${account.balance < 0 ? "text-red-600" : ""}`}>
                  {money(account.balance, account.currency_code)}
                </p>
              </article>
            ))}
          </div>
        )}
      </section>
      <Ledger transactions={data.transactions.slice(0, 10)} compact />
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
  tone: "blue" | "green" | "amber" | "slate";
}) {
  const colors = {
    blue: "border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/20",
    green: "border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/20",
    amber: "border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/20",
    slate: "border-border bg-surface",
  };
  return (
    <div className={`rounded-xl border p-4 ${colors[tone]}`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-foreground/55">{label}</p>
      <p className="mt-2 text-xl font-bold">{value}</p>
      {note && <p className="mt-1 text-xs text-foreground/50">{note}</p>}
    </div>
  );
}

type Runner = (
  action: () => Promise<{ ok: boolean; error?: string }>,
  success: string,
) => void;

function Operations({
  data,
  pending,
  run,
}: {
  data: FinanceHubData;
  pending: boolean;
  run: Runner;
}) {
  const [mode, setMode] = useState<"movement" | "transfer">("movement");
  const [form, setForm] = useState({
    account_id: data.accounts.find((a) => a.active)?.id ?? "",
    direction: "IN" as "IN" | "OUT",
    amount: "",
    movement_date: today(),
    description: "",
    category_id: "",
    payment_method_id: "",
    reference: "",
    counterparty: "",
    to_account_id: "",
  });
  const account = data.accounts.find((a) => a.id === form.account_id);
  const categories = data.categories.filter(
    (c) =>
      c.active &&
      (c.direction === "BOTH" || c.direction === form.direction) &&
      (!account || c.account_scope === "BOTH" || c.account_scope === account.account_type),
  );
  const methods = data.methods.filter(
    (m) =>
      m.active &&
      (!account || m.account_scope === "BOTH" || m.account_scope === account.account_type),
  );

  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-border bg-surface p-4 shadow-sm">
        <div className="mb-4 flex gap-2">
          <Button variant={mode === "movement" ? "primary" : "secondary"} onClick={() => setMode("movement")}>
            Entrée / sortie
          </Button>
          <Button variant={mode === "transfer" ? "primary" : "secondary"} onClick={() => setMode("transfer")}>
            Transfert interne
          </Button>
        </div>
        <div className="grid gap-3 md:grid-cols-4">
          <Field label={mode === "transfer" ? "Compte source" : "Compte"}>
            <select className={inputClass} value={form.account_id} onChange={(e) => setForm((f) => ({ ...f, account_id: e.target.value }))}>
              <option value="">Sélectionner…</option>
              {data.accounts.filter((a) => a.active).map((a) => (
                <option key={a.id} value={a.id}>{a.code} — {a.name} ({money(a.balance)})</option>
              ))}
            </select>
          </Field>
          {mode === "transfer" ? (
            <Field label="Compte destination">
              <select className={inputClass} value={form.to_account_id} onChange={(e) => setForm((f) => ({ ...f, to_account_id: e.target.value }))}>
                <option value="">Sélectionner…</option>
                {data.accounts.filter((a) => a.active && a.id !== form.account_id).map((a) => (
                  <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
                ))}
              </select>
            </Field>
          ) : (
            <Field label="Sens">
              <select className={inputClass} value={form.direction} onChange={(e) => setForm((f) => ({ ...f, direction: e.target.value as "IN" | "OUT", category_id: "", payment_method_id: "" }))}>
                <option value="IN">Entrée</option>
                <option value="OUT">Sortie</option>
              </select>
            </Field>
          )}
          <Field label="Montant">
            <input type="number" min="0" step="0.01" className={inputClass} value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} />
          </Field>
          <Field label="Date">
            <input type="date" className={inputClass} value={form.movement_date} onChange={(e) => setForm((f) => ({ ...f, movement_date: e.target.value }))} />
          </Field>
          {mode === "movement" && (
            <>
              <Field label="Catégorie">
                <select className={inputClass} value={form.category_id} onChange={(e) => setForm((f) => ({ ...f, category_id: e.target.value }))}>
                  <option value="">Sans catégorie</option>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.label_fr}</option>)}
                </select>
              </Field>
              <Field label="Mode">
                <select className={inputClass} value={form.payment_method_id} onChange={(e) => setForm((f) => ({ ...f, payment_method_id: e.target.value }))}>
                  <option value="">Non précisé</option>
                  {methods.map((m) => <option key={m.id} value={m.id}>{m.label_fr}</option>)}
                </select>
              </Field>
              <Field label="Tiers">
                <input className={inputClass} value={form.counterparty} onChange={(e) => setForm((f) => ({ ...f, counterparty: e.target.value }))} />
              </Field>
            </>
          )}
          <Field label="Référence">
            <input className={inputClass} value={form.reference} onChange={(e) => setForm((f) => ({ ...f, reference: e.target.value }))} />
          </Field>
          <div className="md:col-span-3">
            <Field label="Libellé">
              <input className={inputClass} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
            </Field>
          </div>
        </div>
        <Button
          className="mt-4"
          disabled={pending}
          onClick={() =>
            mode === "transfer"
              ? run(
                  () => postFinanceTransfer({
                    from_account_id: form.account_id,
                    to_account_id: form.to_account_id,
                    amount: form.amount,
                    movement_date: form.movement_date,
                    description: form.description,
                    reference: form.reference,
                  }),
                  "Transfert enregistré.",
                )
              : run(
                  () => postFinanceMovement({
                    account_id: form.account_id,
                    direction: form.direction,
                    amount: form.amount,
                    movement_date: form.movement_date,
                    description: form.description,
                    category_id: form.category_id || null,
                    payment_method_id: form.payment_method_id || null,
                    reference: form.reference,
                    counterparty: form.counterparty,
                  }),
                  "Mouvement enregistré.",
                )
          }
        >
          {pending ? "Enregistrement…" : "Valider l'opération"}
        </Button>
      </section>
      <Ledger transactions={data.transactions} />
    </div>
  );
}

function Ledger({
  transactions,
  compact = false,
}: {
  transactions: FinanceTransaction[];
  compact?: boolean;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="font-bold">{compact ? "Derniers mouvements" : "Journal financier"}</h2>
        <span className="text-xs text-foreground/50">{transactions.length} ligne(s)</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="bg-surface-muted text-left text-xs uppercase text-foreground/55">
            <tr>
              <th className="px-3 py-2">Date</th>
              <th className="px-3 py-2">Compte</th>
              <th className="px-3 py-2">Libellé</th>
              <th className="px-3 py-2">Catégorie</th>
              <th className="px-3 py-2">Référence</th>
              <th className="px-3 py-2 text-right">Entrée</th>
              <th className="px-3 py-2 text-right">Sortie</th>
              <th className="px-3 py-2">État</th>
            </tr>
          </thead>
          <tbody>
            {transactions.length === 0 ? (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-foreground/50">Aucun mouvement.</td></tr>
            ) : transactions.map((t) => (
              <tr key={t.id} className={`border-t border-border/70 ${t.reversal_of || t.is_reversed ? "opacity-55" : ""}`}>
                <td className="px-3 py-2">{t.movement_date}</td>
                <td className="px-3 py-2 font-semibold">{t.account_name}</td>
                <td className="max-w-[260px] truncate px-3 py-2">{t.description}</td>
                <td className="px-3 py-2 text-foreground/65">{t.category_label ?? "—"}</td>
                <td className="px-3 py-2 font-mono text-xs">{t.reference ?? "—"}</td>
                <td className="px-3 py-2 text-right font-semibold text-green-700">{t.direction === "IN" ? money(t.amount) : ""}</td>
                <td className="px-3 py-2 text-right font-semibold text-red-700">{t.direction === "OUT" ? money(t.amount) : ""}</td>
                <td className="px-3 py-2">
                  {t.reversal_of ? <Badge tone="slate">Contre-passation</Badge>
                    : t.is_reversed ? <Badge tone="red">Annulé</Badge>
                    : t.reconciled_at ? <Badge tone="green">Rapproché</Badge>
                    : <Badge tone="amber">Ouvert</Badge>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Advances({
  data,
  pending,
  run,
}: {
  data: FinanceHubData;
  pending: boolean;
  run: Runner;
}) {
  const [selectedId, setSelectedId] = useState(data.advances[0]?.id ?? "");
  const selected = data.advances.find((a) => a.id === selectedId);
  const [form, setForm] = useState({
    cash_account_id: data.accounts.find((a) => a.account_type === "CASH" && a.active)?.id ?? "",
    beneficiary_employee_id: "",
    beneficiary_name: "",
    amount: "",
    issue_date: today(),
    purpose: "",
  });
  const [expense, setExpense] = useState({
    category_id: data.categories.find((c) => c.direction !== "IN" && c.active)?.id ?? "",
    amount: "",
    expense_date: today(),
    description: "",
    receipt_reference: "",
  });

  return (
    <div className="grid gap-5 xl:grid-cols-[380px_1fr]">
      <div className="space-y-4">
        <section className="rounded-xl border border-border bg-surface p-4 shadow-sm">
          <h2 className="font-bold">Nouvelle avance</h2>
          <div className="mt-3 space-y-3">
            <Field label="Caisse">
              <select className={inputClass} value={form.cash_account_id} onChange={(e) => setForm((f) => ({ ...f, cash_account_id: e.target.value }))}>
                <option value="">Sélectionner…</option>
                {data.accounts.filter((a) => a.account_type === "CASH" && a.active).map((a) => (
                  <option key={a.id} value={a.id}>{a.name} — {money(a.balance)}</option>
                ))}
              </select>
            </Field>
            <Field label="Employé (facultatif)">
              <select
                className={inputClass}
                value={form.beneficiary_employee_id}
                onChange={(e) => {
                  const employee = data.employees.find((x) => x.id === e.target.value);
                  setForm((f) => ({
                    ...f,
                    beneficiary_employee_id: e.target.value,
                    beneficiary_name: employee ? `${employee.first_name} ${employee.last_name}` : f.beneficiary_name,
                  }));
                }}
              >
                <option value="">Bénéficiaire externe</option>
                {data.employees.map((e) => <option key={e.id} value={e.id}>{e.matricule} — {e.first_name} {e.last_name}</option>)}
              </select>
            </Field>
            <Field label="Bénéficiaire"><input className={inputClass} value={form.beneficiary_name} onChange={(e) => setForm((f) => ({ ...f, beneficiary_name: e.target.value }))} /></Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Montant"><input type="number" min="0" className={inputClass} value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} /></Field>
              <Field label="Date"><input type="date" className={inputClass} value={form.issue_date} onChange={(e) => setForm((f) => ({ ...f, issue_date: e.target.value }))} /></Field>
            </div>
            <Field label="Objet"><textarea className={`${inputClass} h-20 py-2`} value={form.purpose} onChange={(e) => setForm((f) => ({ ...f, purpose: e.target.value }))} /></Field>
            <Button
              className="w-full"
              disabled={pending}
              onClick={() => run(() => issueCashAdvance({
                ...form,
                beneficiary_employee_id: form.beneficiary_employee_id || null,
              }), "Avance émise.")}
            >
              Émettre l'avance
            </Button>
          </div>
        </section>
        <section className="overflow-hidden rounded-xl border border-border bg-surface">
          {data.advances.length === 0 ? <Empty text="Aucune avance." /> : data.advances.map((a) => (
            <button
              key={a.id}
              className={`block w-full border-b border-border px-4 py-3 text-left last:border-0 ${selectedId === a.id ? "bg-brand-muted" : "hover:bg-surface-muted"}`}
              onClick={() => setSelectedId(a.id)}
            >
              <div className="flex justify-between gap-2">
                <span className="font-semibold">{a.advance_number}</span>
                <Badge tone={a.status === "OPEN" ? "amber" : a.status === "SETTLED" ? "green" : "red"}>{a.status}</Badge>
              </div>
              <p className="mt-1 text-sm">{a.beneficiary_name}</p>
              <p className="text-xs text-foreground/55">{money(a.amount)} · reste {money(a.remaining)}</p>
            </button>
          ))}
        </section>
      </div>

      <section className="rounded-xl border border-border bg-surface p-4 shadow-sm">
        {!selected ? <Empty text="Sélectionnez une avance." /> : (
          <div className="space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-mono text-xs text-foreground/50">{selected.advance_number}</p>
                <h2 className="text-xl font-bold">{selected.beneficiary_name}</h2>
                <p className="text-sm text-foreground/60">{selected.purpose}</p>
              </div>
              <Badge tone={selected.status === "OPEN" ? "amber" : "green"}>{selected.status}</Badge>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Kpi label="Avance" value={money(selected.amount)} tone="blue" />
              <Kpi label="Justifié" value={money(selected.expense_total)} tone="green" />
              <Kpi label="À justifier/retourner" value={money(selected.remaining)} tone="amber" />
            </div>
            {selected.status === "OPEN" && (
              <div className="rounded-lg border border-border bg-surface-muted p-3">
                <h3 className="mb-3 font-semibold">Ajouter un justificatif</h3>
                <div className="grid gap-2 md:grid-cols-5">
                  <select className={inputClass} value={expense.category_id} onChange={(e) => setExpense((f) => ({ ...f, category_id: e.target.value }))}>
                    {data.categories.filter((c) => c.active && c.direction !== "IN").map((c) => <option key={c.id} value={c.id}>{c.label_fr}</option>)}
                  </select>
                  <input type="number" min="0" className={inputClass} placeholder="Montant" value={expense.amount} onChange={(e) => setExpense((f) => ({ ...f, amount: e.target.value }))} />
                  <input type="date" className={inputClass} value={expense.expense_date} onChange={(e) => setExpense((f) => ({ ...f, expense_date: e.target.value }))} />
                  <input className={inputClass} placeholder="Description" value={expense.description} onChange={(e) => setExpense((f) => ({ ...f, description: e.target.value }))} />
                  <Button disabled={pending} onClick={() => run(() => addCashAdvanceExpense({ ...expense, advance_id: selected.id }), "Justificatif ajouté.")}>Ajouter</Button>
                </div>
              </div>
            )}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[650px] text-sm">
                <thead className="bg-surface-muted text-left text-xs uppercase text-foreground/55">
                  <tr><th className="px-3 py-2">Date</th><th className="px-3 py-2">Catégorie</th><th className="px-3 py-2">Libellé</th><th className="px-3 py-2 text-right">Montant</th><th /></tr>
                </thead>
                <tbody>
                  {selected.expenses.map((e) => (
                    <tr key={e.id} className="border-t border-border">
                      <td className="px-3 py-2">{e.expense_date}</td>
                      <td className="px-3 py-2">{e.category_label}</td>
                      <td className="px-3 py-2">{e.description}</td>
                      <td className="px-3 py-2 text-right font-semibold">{money(e.amount)}</td>
                      <td className="px-3 py-2 text-right">{selected.status === "OPEN" && <button className="text-red-600" onClick={() => run(() => deleteCashAdvanceExpense(e.id), "Justificatif supprimé.")}>Supprimer</button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {selected.status === "OPEN" && (
              <div className="flex flex-wrap items-end gap-3 rounded-lg border border-green-200 bg-green-50 p-3 dark:border-green-900 dark:bg-green-950/20">
                <div className="min-w-[220px]">
                  <Field label="Retour caisse">
                    <input type="number" min="0" step="0.01" className={inputClass} value={selected.remaining.toFixed(2)} readOnly />
                  </Field>
                </div>
                <Button disabled={pending} onClick={() => run(() => settleCashAdvance({
                  advance_id: selected.id,
                  return_amount: selected.remaining,
                  settlement_date: today(),
                  note: "Régularisation complète",
                }), "Avance régularisée et clôturée.")}>
                  Régulariser et clôturer
                </Button>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

function Reconciliation({
  data,
  pending,
  run,
}: {
  data: FinanceHubData;
  pending: boolean;
  run: Runner;
}) {
  const [accountId, setAccountId] = useState("");
  const rows = useMemo(
    () => data.transactions.filter((t) => !accountId || t.account_id === accountId),
    [data.transactions, accountId],
  );
  return (
    <section className="rounded-xl border border-border bg-surface p-4 shadow-sm">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-bold">Rapprochement bancaire / caisse</h2>
          <p className="text-sm text-foreground/55">Marquez les lignes pointées sur le relevé sans modifier leur contenu économique.</p>
        </div>
        <select className={`${inputClass} w-72`} value={accountId} onChange={(e) => setAccountId(e.target.value)}>
          <option value="">Tous les comptes</option>
          {data.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[850px] text-sm">
          <thead className="bg-surface-muted text-left text-xs uppercase text-foreground/55">
            <tr><th className="px-3 py-2">Date</th><th className="px-3 py-2">Compte</th><th className="px-3 py-2">Libellé</th><th className="px-3 py-2 text-right">Montant</th><th className="px-3 py-2">Source</th><th className="px-3 py-2 text-right">Actions</th></tr>
          </thead>
          <tbody>
            {rows.map((t) => (
              <tr key={t.id} className="border-t border-border">
                <td className="px-3 py-2">{t.movement_date}</td>
                <td className="px-3 py-2 font-semibold">{t.account_name}</td>
                <td className="px-3 py-2">{t.description}</td>
                <td className={`px-3 py-2 text-right font-semibold ${t.direction === "IN" ? "text-green-700" : "text-red-700"}`}>{t.direction === "OUT" ? "−" : "+"}{money(t.amount)}</td>
                <td className="px-3 py-2"><Badge tone="slate">{t.source_type}</Badge></td>
                <td className="space-x-2 px-3 py-2 text-right">
                  {!t.reversal_of && !t.is_reversed && (
                    <button
                      disabled={pending}
                      className="font-semibold text-brand disabled:opacity-50"
                      onClick={() => run(() => reconcileFinanceMovement({
                        transaction_id: t.id,
                        reconciled: !t.reconciled_at,
                        reference: t.reconciled_at ? null : window.prompt("Référence du relevé (facultatif)") ?? "",
                      }), t.reconciled_at ? "Rapprochement retiré." : "Mouvement rapproché.")}
                    >
                      {t.reconciled_at ? "Dépointer" : "Pointer"}
                    </button>
                  )}
                  {!t.reconciled_at && !t.reversal_of && !t.is_reversed && !["CUSTOMER_PAYMENT", "TRANSFER"].includes(t.source_type) && (
                    <button
                      disabled={pending}
                      className="text-red-600 disabled:opacity-50"
                      onClick={() => {
                        const reason = window.prompt("Motif obligatoire de contre-passation");
                        if (reason) run(() => reverseFinanceMovement({ transaction_id: t.id, reversal_date: today(), reason }), "Contre-passation créée.");
                      }}
                    >
                      Annuler
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-foreground/65">{label}</span>
      {children}
    </label>
  );
}

function Badge({
  tone,
  children,
}: {
  tone: "green" | "amber" | "red" | "slate";
  children: React.ReactNode;
}) {
  const colors = {
    green: "bg-green-100 text-green-800 dark:bg-green-950/40 dark:text-green-300",
    amber: "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
    red: "bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300",
    slate: "bg-surface-muted text-foreground/65",
  };
  return <span className={`inline-flex rounded-full px-2 py-1 text-[11px] font-bold ${colors[tone]}`}>{children}</span>;
}

function Empty({ text }: { text: string }) {
  return <div className="px-4 py-10 text-center text-sm text-foreground/50">{text}</div>;
}

