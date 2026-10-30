"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { createCaisseBuyer, saveCaisseOpenings, type CaisseOpeningsData } from "@/lib/actions/caisse";

const inputClass =
  "h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/15";

function money(value: number, currency: string) {
  return new Intl.NumberFormat("fr-DZ", { style: "currency", currency, maximumFractionDigits: 2 }).format(value);
}

function parseAmount(value: string) {
  const normalized = value.trim().replace(/\s/g, "").replace(",", ".");
  if (!normalized) return 0;
  const amount = Number(normalized);
  return Number.isFinite(amount) ? amount : Number.NaN;
}

export function OpeningsManager({ initial }: { initial: CaisseOpeningsData }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [amounts, setAmounts] = useState<Record<string, string>>(() =>
    Object.fromEntries(initial.buyers.map((buyer) => [buyer.id, String(buyer.amount)])),
  );
  const [buyerCode, setBuyerCode] = useState("");
  const [buyerName, setBuyerName] = useState("");
  const currency = initial.box?.currencyCode ?? "DZD";

  const parsed = useMemo(
    () =>
      initial.buyers.map((buyer) => ({
        buyer,
        amount: parseAmount(amounts[buyer.id] ?? "0"),
      })),
    [amounts, initial.buyers],
  );
  const invalid = parsed.some((row) => Number.isNaN(row.amount) || row.amount < 0);
  const total = invalid ? null : parsed.reduce((sum, row) => sum + row.amount, 0);
  const stored = initial.boxOpening;
  const differs = total != null && stored != null && Math.round(stored * 100) !== Math.round(total * 100);

  function changeDate(value: string) {
    router.push(value ? `/caisse?date=${value}` : "/caisse");
  }

  function save() {
    if (!initial.box || total == null) return;
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await saveCaisseOpenings({
        boxId: initial.box!.id,
        openingDate: initial.openingDate,
        buyers: parsed.map((row) => ({ buyerId: row.buyer.id, amount: row.amount })),
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setMessage("Ouvertures enregistrées. L'ouverture de la caisse est égale au total des acheteurs.");
      router.refresh();
    });
  }

  function addBuyer() {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await createCaisseBuyer({ code: buyerCode, fullName: buyerName });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setBuyerCode("");
      setBuyerName("");
      setMessage("Acheteur ajouté.");
      router.refresh();
    });
  }

  if (!initial.box) {
    return <Alert tone="warning">Aucune caisse. Un droit d'écriture est requis pour créer la caisse principale.</Alert>;
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Soldes d’ouverture</h1>
        <p className="mt-1 text-sm text-foreground/70">
          {initial.box.name} · {initial.box.code}. أرصدة القطع فقط، بلا سلف ولا شراء ولا تغذية.
        </p>
      </div>

      {error ? <Alert tone="danger">{error}</Alert> : null}
      {message ? <Alert tone="success">{message}</Alert> : null}
      {differs && stored != null && total != null ? (
        <Alert tone="warning">
          Ouverture caisse enregistrée {money(stored, currency)} ≠ total acheteurs {money(total, currency)}.
          L'enregistrement aligne l'ouverture de la caisse sur le total.
        </Alert>
      ) : null}

      <label className="block max-w-xs text-sm font-medium">
        Date de coupe
        <input
          type="date"
          className={`${inputClass} mt-1`}
          value={initial.openingDate}
          onChange={(event) => changeDate(event.target.value)}
        />
      </label>

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[36rem] text-sm">
          <thead className="bg-surface-muted text-left">
            <tr>
              <th className="px-3 py-2 font-semibold">Code</th>
              <th className="px-3 py-2 font-semibold">Acheteur</th>
              <th className="px-3 py-2 font-semibold">Ouverture</th>
            </tr>
          </thead>
          <tbody>
            {initial.buyers.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-3 py-4 text-foreground/60">
                  Aucun acheteur.
                </td>
              </tr>
            ) : (
              initial.buyers.map((buyer) => (
                <tr key={buyer.id} className="border-t border-border">
                  <td className="px-3 py-2">{buyer.code}</td>
                  <td className="px-3 py-2">{buyer.fullName}</td>
                  <td className="px-3 py-2">
                    <input
                      inputMode="decimal"
                      className={inputClass}
                      disabled={!initial.canWrite || pending}
                      value={amounts[buyer.id] ?? "0"}
                      onChange={(event) => setAmounts((current) => ({ ...current, [buyer.id]: event.target.value }))}
                    />
                  </td>
                </tr>
              ))
            )}
          </tbody>
          <tfoot className="border-t border-border bg-surface-muted">
            <tr>
              <td className="px-3 py-2 font-semibold" colSpan={2}>
                Total des ouvertures acheteurs
              </td>
              <td className="px-3 py-2 font-semibold">{total == null ? "—" : money(total, currency)}</td>
            </tr>
            <tr>
              <td className="px-3 py-2" colSpan={2}>
                Ouverture caisse (buyer vide)
              </td>
              <td className="px-3 py-2">{stored == null ? "Non enregistrée" : money(stored, currency)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {initial.canWrite ? (
        <div className="flex flex-wrap items-end gap-3">
          <Button type="button" onClick={save} disabled={pending || invalid}>
            Enregistrer
          </Button>
          <label className="text-sm">
            Code acheteur
            <input className={`${inputClass} mt-1 w-36`} value={buyerCode} onChange={(event) => setBuyerCode(event.target.value)} />
          </label>
          <label className="text-sm">
            Nom
            <input className={`${inputClass} mt-1 w-64`} value={buyerName} onChange={(event) => setBuyerName(event.target.value)} />
          </label>
          <Button type="button" variant="secondary" onClick={addBuyer} disabled={pending || !buyerCode.trim() || !buyerName.trim()}>
            Ajouter un acheteur
          </Button>
        </div>
      ) : (
        <Alert tone="info">Lecture seule.</Alert>
      )}
    </div>
  );
}
