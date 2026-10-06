"use client";

import { useEffect, useMemo, useState } from "react";
import { Pencil, Printer } from "lucide-react";
import type { CatalogItem } from "@/lib/actions/hr-catalogs";
import type { HrEmployeeFiche, HrEmployeeField } from "@/lib/actions/hr-employees";
import { valuesFromFicheRecord } from "@/lib/hr/employee-field-utils";
import { DEFAULT_FICHE_SETTINGS, type HrFicheSettings } from "@/lib/hr/fiche-settings";
import { FICHE_DOC_TYPES, ficheHtml } from "@/lib/hr/employee-fiche-doc";
import { usePrintKit } from "@/components/doc/use-print-kit";
import { printHtml } from "@/components/rh/print-frame";
import { RhAlert, RhModal } from "@/components/rh/rh-ui";
import { Button } from "@/components/ui/button";

const A4_W = 794;
const A4_H = 1123;

/** The employee card exactly as it prints (A4, letterhead), with Print and Edit. */
export function EmployeeCardPreview({
  employee,
  fields,
  catalogs,
  fiche = DEFAULT_FICHE_SETTINGS,
  onEdit,
  onClose,
}: {
  employee: HrEmployeeFiche;
  fields: HrEmployeeField[];
  catalogs: CatalogItem[];
  fiche?: HrFicheSettings;
  onEdit: () => void;
  onClose: () => void;
}) {
  const { kit, error } = usePrintKit(FICHE_DOC_TYPES);
  const printed = useMemo(
    () =>
      kit
        ? ficheHtml(kit, valuesFromFicheRecord(employee, fields), catalogs, fields, fiche, window.location.origin)
        : null,
    [kit, employee, fields, catalogs, fiche],
  );
  const html = printed?.ok ? printed.data : "";
  const problem = error ?? (printed && !printed.ok ? printed.error : null);
  const [box, setBox] = useState<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(0.6);

  useEffect(() => {
    if (!box) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setScale(Math.max(0.3, Math.min(1.25, width / A4_W, height / A4_H)));
    });
    observer.observe(box);
    return () => observer.disconnect();
  }, [box]);

  const name = [employee.last_name, employee.first_name].filter(Boolean).join(" ");

  return (
    <RhModal
      size="lg"
      title={name || employee.matricule}
      subtitle={`Matricule ${employee.matricule}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Fermer
          </Button>
          <Button variant="secondary" onClick={onEdit}>
            <Pencil aria-hidden />
            Modifier
          </Button>
          <Button disabled={!html} onClick={() => printHtml(html, "hr-fiche-print-frame")}>
            <Printer aria-hidden />
            Imprimer
          </Button>
        </>
      }
    >
      {problem ? (
        <div className="mb-3">
          <RhAlert tone="danger">{problem}</RhAlert>
        </div>
      ) : null}
      <div ref={setBox} className="flex h-[calc(100dvh-12rem)] min-h-[24rem] items-start justify-center overflow-hidden rounded-xl bg-surface-muted/70 p-4">
        <div
          className="shrink-0 overflow-hidden rounded-sm bg-white shadow-[0_12px_40px_-12px_rgba(15,23,42,0.35)] ring-1 ring-black/5"
          style={{ width: A4_W * scale, height: A4_H * scale }}
        >
          <iframe
            title={`Fiche ${employee.matricule}`}
            srcDoc={html}
            className="origin-top-left border-0"
            style={{ width: A4_W, height: A4_H, transform: `scale(${scale})` }}
          />
        </div>
      </div>
    </RhModal>
  );
}
