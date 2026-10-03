"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { resetHrTestData } from "@/lib/actions/admin-reset";
import { RESET_CONFIRM_WORD, resetSummary } from "@/lib/hr/test-data-reset";
import { Button } from "@/components/ui/button";
import { RhAlert, RhField, RhModal, rhInput } from "@/components/rh/rh-ui";

type Done = { counts: Record<string, number>; filesRemoved: number; storageErrors: string[] };

/** Super admin only: wipes the test-phase HR data (employees and everything linked), keeps the settings. */
export function TestDataResetCard() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Done | null>(null);
  const [pending, startTransition] = useTransition();

  function close() {
    if (pending) return;
    setOpen(false);
    setConfirm("");
    setError(null);
  }

  function run() {
    setError(null);
    startTransition(async () => {
      const res = await resetHrTestData(confirm);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setDone(res.data);
      setOpen(false);
      setConfirm("");
      router.refresh();
    });
  }

  return (
    <div className="rounded-2xl border border-red-300/70 bg-red-50/40 p-5 dark:border-red-900/50 dark:bg-red-950/20">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl">
          <p className="font-display text-lg font-semibold text-red-900 dark:text-red-100">
            Réinitialiser les données de test
          </p>
          <p className="mt-1 text-sm text-foreground/70">
            Supprime tous les employés et tout ce qui leur est lié : contrats, documents et PDF archivés, ordres de
            mission, titres de congé, présences, congés, paies, bulletins, virements, déclarations et les décisions /
            notifications correspondantes. Les paramètres sont conservés : chantiers, catalogues, rubriques, champs de
            la fiche, modèles, postes, variables légales et utilisateurs.
          </p>
        </div>
        <Button variant="danger" onClick={() => setOpen(true)}>
          <Trash2 aria-hidden />
          Réinitialiser
        </Button>
      </div>

      {done ? (
        <div className="mt-4">
          <RhAlert tone={done.storageErrors.length ? "warning" : "success"}>
            <p className="font-semibold">Données de test supprimées.</p>
            <p className="mt-1">
              {resetSummary(done.counts)
                .filter((row) => row.count > 0)
                .map((row) => `${row.label} : ${row.count}`)
                .join(" · ") || "Aucune donnée à supprimer."}
              {` · Fichiers supprimés : ${done.filesRemoved}`}
            </p>
            {done.storageErrors.length ? (
              <p className="mt-1">Fichiers non supprimés : {done.storageErrors.join(" ; ")}</p>
            ) : null}
          </RhAlert>
        </div>
      ) : null}

      {open ? (
        <RhModal
          title="Réinitialiser les données de test"
          subtitle="Action définitive : les données supprimées ne peuvent pas être récupérées."
          onClose={close}
          footer={
            <>
              <Button variant="secondary" disabled={pending} onClick={close}>
                Annuler
              </Button>
              <Button variant="danger" disabled={pending || confirm.trim() !== RESET_CONFIRM_WORD} onClick={run}>
                <Trash2 aria-hidden />
                {pending ? "Suppression…" : "Tout supprimer"}
              </Button>
            </>
          }
        >
          <div className="space-y-4">
            <RhAlert tone="danger">
              Tous les employés, contrats, documents, présences, congés et paies seront supprimés, ainsi que les
              fichiers PDF et photos. Les numéros (matricules, N° de documents) repartiront de 1.
            </RhAlert>
            <RhField label={`Tapez ${RESET_CONFIRM_WORD} pour confirmer`}>
              <input
                className={rhInput}
                value={confirm}
                autoComplete="off"
                onChange={(e) => setConfirm(e.target.value)}
                placeholder={RESET_CONFIRM_WORD}
              />
            </RhField>
            {error ? <RhAlert tone="danger">{error}</RhAlert> : null}
          </div>
        </RhModal>
      ) : null}
    </div>
  );
}
