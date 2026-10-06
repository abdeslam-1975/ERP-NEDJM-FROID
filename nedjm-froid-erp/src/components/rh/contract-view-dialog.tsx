"use client";

import { useEffect, useMemo, useState } from "react";
import { Pencil, Printer } from "lucide-react";
import { getContractPrintContext, type ContractPrintContext } from "@/lib/actions/hr-contract-print";
import { usePrintKit } from "@/components/doc/use-print-kit";
import { contractHtml } from "@/components/rh/contract-print-dialog";
import { Button } from "@/components/ui/button";
import { RhAlert, RhModal, bi } from "@/components/rh/rh-ui";

const VIEW_DOC_TYPES = ["contrat_cdd", "contrat_cdi"] as const;

/** The saved contract exactly as it prints, read-only, with Edit and Print. */
export function ContractViewDialog({
  contractId,
  title,
  subtitle,
  onEdit,
  onPrint,
  onClose,
}: {
  contractId: string;
  title: string;
  subtitle?: string;
  onEdit: () => void;
  onPrint: () => void;
  onClose: () => void;
}) {
  const [context, setContext] = useState<ContractPrintContext | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getContractPrintContext(contractId).then((r) => {
      if (cancelled) return;
      if (r.ok) setContext(r.data);
      else setError(r.error);
    });
    return () => {
      cancelled = true;
    };
  }, [contractId]);

  const { kit, error: kitError } = usePrintKit(VIEW_DOC_TYPES);
  const printed = useMemo(() => (context && kit ? contractHtml(kit, context.values) : null), [context, kit]);
  const html = printed?.ok
    ? printed.data.replace("</head>", "<style>@media screen { body { padding: 28px 34px; } }</style></head>")
    : "";
  const shownError = error ?? kitError ?? (printed && !printed.ok ? printed.error : null);

  return (
    <RhModal
      size="lg"
      title={title}
      subtitle={subtitle}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {bi("Fermer", "إغلاق")}
          </Button>
          <Button variant="secondary" onClick={onEdit}>
            <Pencil aria-hidden />
            {bi("Modifier", "تعديل")}
          </Button>
          <Button onClick={onPrint}>
            <Printer aria-hidden />
            {bi("Imprimer", "طباعة")}
          </Button>
        </>
      }
    >
      {shownError ? (
        <RhAlert tone="danger">{shownError}</RhAlert>
      ) : (
        <div className="h-[calc(100dvh-12rem)] min-h-[24rem] overflow-hidden rounded-xl bg-surface-muted/70 p-3">
          {html ? (
            <iframe
              title={bi("Contrat de travail", "عقد العمل")}
              srcDoc={html}
              className="h-full w-full rounded-lg bg-white shadow-md ring-1 ring-black/5"
            />
          ) : (
            <p className="p-6 text-center text-sm text-foreground/60">{bi("Chargement…", "جارٍ التحميل…")}</p>
          )}
        </div>
      )}
    </RhModal>
  );
}
