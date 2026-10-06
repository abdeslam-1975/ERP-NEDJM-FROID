"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { archiveContractPrint, getContractPrintContext, saveContractPrint } from "@/lib/actions/hr-contract-print";
import { printFromKit, type PrintKit } from "@/lib/doc/print-kit";
import {
  CONTRACT_DOC_TYPE,
  contractCddReasons,
  contractDocData,
  contractPrintError,
  type ContractPrintValues,
} from "@/lib/hr/work-contract";
import { usePrintKit } from "@/components/doc/use-print-kit";
import { Button } from "@/components/ui/button";
import { RhAlert, RhField, RhModal, bi, rhInput } from "@/components/rh/rh-ui";

function printHtml(html: string) {
  document.getElementById("hr-contract-print-frame")?.remove();
  const frame = document.createElement("iframe");
  frame.id = "hr-contract-print-frame";
  frame.setAttribute("aria-hidden", "true");
  Object.assign(frame.style, { position: "fixed", left: "-10000px", top: "0", width: "794px", height: "1123px", border: "0" });
  document.body.appendChild(frame);
  const doc = frame.contentDocument;
  const win = frame.contentWindow;
  if (!doc || !win) {
    frame.remove();
    return;
  }
  doc.open();
  doc.write(html);
  doc.close();
  const cleanup = () => frame.remove();
  win.addEventListener("afterprint", cleanup);
  const run = () => {
    win.focus();
    win.print();
    window.setTimeout(cleanup, 2000);
  };
  const fonts = (doc as Document & { fonts?: FontFaceSet }).fonts;
  const ready = fonts?.ready ?? Promise.resolve();
  Promise.race([ready, new Promise((r) => window.setTimeout(r, 1500))]).then(() => window.setTimeout(run, 150));
}

type FieldDef = { key: keyof ContractPrintValues; label: string; type?: "date"; wide?: boolean; hint?: string };

const FIELDS: FieldDef[] = [
  { key: "numero", label: "N° du contrat · رقم العقد", hint: "Vide = attribué automatiquement (année/NNN)" },
  { key: "nom", label: "Nom et prénom · الاسم واللقب" },
  { key: "matricule", label: "Matricule · الرقم التسلسلي" },
  { key: "birth_date", label: "Né(e) le · تاريخ الميلاد", type: "date" },
  { key: "birth_place", label: "à · مكان الميلاد" },
  { key: "father", label: "Fils/fille de · إبن (ة)" },
  { key: "mother", label: "et de · و" },
  { key: "marital", label: "Situation familiale · الحالة العائلية" },
  { key: "id_piece", label: "Pièce · الوثيقة" },
  { key: "id_number", label: "N° pièce · رقم الوثيقة" },
  { key: "id_issued_on", label: "Délivrée le · الصادرة في", type: "date" },
  { key: "id_issued_by", label: "Autorité · سلطة الإصدار" },
  { key: "address", label: "Adresse · الساكن بـ", wide: true },
  { key: "poste", label: "Poste · المنصب", wide: true },
  { key: "start_date", label: "Début · ابتداء من", type: "date" },
  { key: "end_date", label: "Fin · إلى غاية", type: "date" },
  { key: "essai", label: "Période d'essai · الفترة التجريبية" },
  { key: "preavis", label: "Préavis · الإخطار المسبق" },
  { key: "net", label: "Net à payer (DA) · الأجر الصافي" },
  { key: "recup", label: "Indemnité récupération (DA) · العطلة التعويضية" },
  { key: "retenue", label: "Retenue / jour d'absence (DA) · اقتطاع الغياب" },
];

export const CONTRACT_DOC_TYPES = [CONTRACT_DOC_TYPE] as const;

/** The contract as printed by its approved template. */
export function contractHtml(kit: PrintKit, values: ContractPrintValues) {
  const blocked = contractPrintError(values);
  if (blocked) return { ok: false as const, error: blocked };
  return printFromKit(kit, CONTRACT_DOC_TYPE, contractDocData(values, kit.company), window.location.origin);
}

export function ContractPrintDialog({
  contractId,
  onClose,
  onNumbered,
  onArchived,
}: {
  contractId: string;
  onClose: () => void;
  onNumbered?: (numero: string) => void;
  onArchived?: (url: string) => void;
}) {
  const [values, setValues] = useState<ContractPrintValues | null>(null);
  const { kit, error: kitError } = usePrintKit(CONTRACT_DOC_TYPES);
  const [error, setError] = useState<string | null>(null);
  const [archive, setArchive] = useState<{ state: "running" | "done"; url?: string } | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    let cancelled = false;
    getContractPrintContext(contractId).then((r) => {
      if (cancelled) return;
      if (r.ok) setValues(r.data.values);
      else setError(r.error);
    });
    return () => {
      cancelled = true;
    };
  }, [contractId]);

  const preview = useMemo(() => (values && kit ? contractHtml(kit, values) : null), [values, kit]);
  const html = preview?.ok ? preview.data : "";
  const reasons = useMemo(() => contractCddReasons(kit?.templates.contrat_cdd ?? ""), [kit]);
  const shownError = error ?? kitError ?? (preview && !preview.ok ? preview.error : null);

  function set<K extends keyof ContractPrintValues>(key: K, value: ContractPrintValues[K]) {
    setValues((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  function print() {
    if (!values || !kit) return;
    setError(null);
    setArchive(null);
    start(async () => {
      const r = await saveContractPrint({ contract_id: contractId, values });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      const next = { ...values, numero: r.data.numero };
      setValues(next);
      onNumbered?.(r.data.numero);
      const printed = contractHtml(kit, next);
      if (!printed.ok) {
        setError(printed.error);
        return;
      }
      printHtml(printed.data);
      setArchive({ state: "running" });
      void archiveContractPrint(contractId).then((a) => {
        if (a.ok) {
          setArchive({ state: "done", url: a.data.archive_url });
          onArchived?.(a.data.archive_url);
        } else {
          setArchive(null);
          setError(`Contrat enregistré, archive PDF non créée : ${a.error}`);
        }
      });
    });
  }

  const missing = values
    ? (["nom", "birth_date", "id_number", "poste", "net"] as const).filter((k) => !String(values[k]).trim())
    : [];

  return (
    <RhModal
      size="xl"
      title={bi("Imprimer le contrat de travail", "طباعة عقد العمل")}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {bi("Fermer", "إغلاق")}
          </Button>
          <Button disabled={pending || !values || !kit || values.is_cdi} onClick={print}>
            {bi("Enregistrer et imprimer", "حفظ وطباعة")}
          </Button>
        </>
      }
    >
      {shownError ? (
        <div className="mb-3">
          <RhAlert tone="danger">{shownError}</RhAlert>
        </div>
      ) : null}
      {archive ? (
        <div className="mb-3">
          <RhAlert tone={archive.state === "done" ? "success" : "info"}>
            {archive.state === "running" ? (
              bi("Archivage du contrat en PDF…", "جارٍ أرشفة العقد PDF…")
            ) : (
              <>
                {bi("Contrat archivé en PDF.", "تمت أرشفة العقد PDF.")}{" "}
                <a href={archive.url} target="_blank" rel="noopener noreferrer" className="font-semibold underline">
                  {bi("Ouvrir le PDF", "فتح PDF")}
                </a>
              </>
            )}
          </RhAlert>
        </div>
      ) : null}
      {!values || !kit ? (
        shownError ? null : <p className="text-sm text-foreground/55">{bi("Chargement…", "جارٍ التحميل…")}</p>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          <div className="space-y-3">
            <RhAlert tone="info">
              {bi(
                "Pré-rempli depuis la fiche employé et le contrat. Les corrections sont gardées pour ce contrat ; complétez de préférence les champs arabes dans la fiche employé.",
                "البيانات مأخوذة من بطاقة العامل والعقد. التعديلات تُحفظ لهذا العقد.",
              )}
            </RhAlert>
            {missing.length ? (
              <RhAlert tone="warning">
                {bi(`Champs vides : ${missing.join(", ")}`, "حقول فارغة")}
              </RhAlert>
            ) : null}
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <RhField label={bi("Motif CDD (art. 12 loi 90-11) · سبب التوظيف", "")}>
                  <select
                    className={rhInput}
                    value={values.cdd_reason}
                    onChange={(e) => set("cdd_reason", Number(e.target.value))}
                  >
                    {reasons.map((r, i) => (
                      <option key={i} value={i + 1}>
                        {i + 1}- {r}
                      </option>
                    ))}
                  </select>
                </RhField>
              </div>
              {FIELDS.map((f) => (
                <div key={f.key} className={f.wide ? "sm:col-span-2" : undefined}>
                  <RhField label={f.label} hint={f.hint}>
                    <input
                      type={f.type ?? "text"}
                      dir={f.type ? "ltr" : "auto"}
                      className={rhInput}
                      value={String(values[f.key] ?? "")}
                      onChange={(e) => set(f.key, e.target.value as never)}
                    />
                  </RhField>
                </div>
              ))}
            </div>
          </div>
          <div className="min-h-[70vh] overflow-hidden rounded-xl border border-border bg-white">
            <iframe title="Aperçu du contrat" srcDoc={html} className="h-full min-h-[70vh] w-full" />
          </div>
        </div>
      )}
    </RhModal>
  );
}
