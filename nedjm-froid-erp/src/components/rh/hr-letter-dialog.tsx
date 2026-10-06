"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { getLetterContext, issueLetter } from "@/lib/actions/hr-letters";
import { printFromKit, type PrintKit } from "@/lib/doc/print-kit";
import { companyLetterheadUrl } from "@/lib/hr/company-letterhead";
import {
  defaultLetterBody,
  letterDocData,
  letterDocType,
  letterKindLabel,
  type LetterKind,
  type LetterLang,
  type LetterValues,
} from "@/lib/hr/hr-letters";
import { usePrintKit } from "@/components/doc/use-print-kit";
import { printHtml } from "@/components/rh/print-frame";
import { Button } from "@/components/ui/button";
import { RhAlert, RhField, RhModal, bi, rhInput } from "@/components/rh/rh-ui";

type TextKey = {
  [K in keyof LetterValues]: LetterValues[K] extends string ? K : never;
}[keyof LetterValues];

type FieldDef = { key: TextKey; label: string; date?: boolean; rtl?: boolean; wide?: boolean };

const COMMON: FieldDef[] = [
  { key: "nom_fr", label: "Nom et prénom (FR)" },
  { key: "nom_ar", label: "الاسم واللقب", rtl: true },
  { key: "matricule", label: "Matricule" },
  { key: "date_doc", label: "Date du document", date: true },
  { key: "poste_fr", label: "Poste (FR)" },
  { key: "poste_ar", label: "المنصب", rtl: true },
];

const BIRTH: FieldDef[] = [
  { key: "birth_date", label: "Né(e) le", date: true },
  { key: "birth_place_fr", label: "Lieu de naissance (FR)" },
  { key: "birth_place_ar", label: "مكان الميلاد", rtl: true },
];

const BY_KIND: Record<LetterKind, FieldDef[]> = {
  ATTEST: [...BIRTH, { key: "start_date", label: "En poste depuis le", date: true }],
  CERTIF: [
    ...BIRTH,
    { key: "start_date", label: "Du", date: true },
    { key: "end_date", label: "Au (date de sortie)", date: true },
  ],
  STC: [
    { key: "start_date", label: "Du", date: true },
    { key: "end_date", label: "Au (date de sortie)", date: true },
    { key: "amount", label: "Somme reçue (DA)" },
  ],
  MED1: [
    { key: "address_fr", label: "Adresse (FR)", wide: true },
    { key: "address_ar", label: "العنوان", rtl: true, wide: true },
    { key: "absence_since", label: "Absent depuis le", date: true },
    { key: "delai", label: "Délai (jours)" },
  ],
  MED2: [
    { key: "address_fr", label: "Adresse (FR)", wide: true },
    { key: "address_ar", label: "العنوان", rtl: true, wide: true },
    { key: "absence_since", label: "Absent depuis le", date: true },
    { key: "delai", label: "Délai (jours)" },
    { key: "ref_numero", label: "N° 1ère mise en demeure" },
    { key: "ref_date", label: "Date 1ère mise en demeure", date: true },
  ],
  LEAVE: [
    { key: "leave_kind_fr", label: "Nature (FR)" },
    { key: "leave_kind_ar", label: "طبيعة العطلة", rtl: true },
    { key: "leave_from", label: "Du", date: true },
    { key: "leave_to", label: "Au", date: true },
    { key: "leave_days", label: "Nombre de jours" },
    { key: "leave_return", label: "Date de reprise", date: true },
    { key: "leave_balance", label: "Reliquat après congé (j)" },
  ],
};

export function HrLetterDialog({
  employeeId,
  kind,
  leaveRequestId,
  correspondenceId,
  onClose,
  onIssued,
}: {
  employeeId: string;
  kind: LetterKind;
  leaveRequestId?: string | null;
  correspondenceId?: string | null;
  onClose: () => void;
  onIssued?: (numero: string) => void;
}) {
  const [values, setValues] = useState<LetterValues | null>(null);
  const [letterhead, setLetterhead] = useState<string | null>(null);
  const [corrId, setCorrId] = useState<string | null>(correspondenceId ?? null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    let cancelled = false;
    getLetterContext({
      employee_id: employeeId,
      kind,
      leave_request_id: leaveRequestId ?? null,
      correspondence_id: correspondenceId ?? null,
    }).then((r) => {
      if (cancelled) return;
      if (r.ok) {
        setValues(r.data.values);
        setLetterhead(r.data.letterhead_url);
        setCorrId(r.data.correspondence_id);
      } else setError(r.error);
    });
    return () => {
      cancelled = true;
    };
  }, [employeeId, kind, leaveRequestId, correspondenceId]);

  const docTypes = useMemo(() => [letterDocType(kind, "fr"), letterDocType(kind, "ar")], [kind]);
  const { kit, error: kitError } = usePrintKit(docTypes);
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const letterheadUrl = companyLetterheadUrl(letterhead, origin);
  const render = (v: LetterValues, k: PrintKit) =>
    printFromKit(k, letterDocType(v.kind, v.lang), letterDocData(v, k.company, letterheadUrl), origin);
  const preview = values && kit ? render(values, kit) : null;
  const html = preview?.ok ? preview.data : "";
  const shownError = error ?? kitError ?? (preview && !preview.ok ? preview.error : null);

  function startCustomText(v: LetterValues, k: PrintKit) {
    const template = k.templates[letterDocType(v.kind, v.lang)] ?? "";
    set("body", defaultLetterBody(template, letterDocData(v, k.company, letterheadUrl)).join("\n\n"));
  }

  function set<K extends keyof LetterValues>(key: K, value: LetterValues[K]) {
    setValues((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  function setLang(lang: LetterLang) {
    setValues((prev) => (prev ? { ...prev, lang, body: "" } : prev));
  }

  function print() {
    if (!values || !kit) return;
    setError(null);
    start(async () => {
      const r = await issueLetter({ employee_id: employeeId, values, correspondence_id: corrId });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      const next = { ...values, numero: r.data.numero };
      setValues(next);
      setCorrId(r.data.id);
      onIssued?.(r.data.numero);
      const doc = render(next, kit);
      if (doc.ok) printHtml(doc.data, "hr-letter-print-frame");
      else setError(doc.error);
    });
  }

  const label = letterKindLabel(kind);
  const customText = Boolean(values?.body.trim());

  return (
    <RhModal size="xl" title={`${label.fr} · ${label.ar}`} onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {bi("Fermer", "إغلاق")}
          </Button>
          <Button disabled={pending || !values || !kit} onClick={print}>
            {kind === "LEAVE" ? bi("Imprimer", "طباعة") : bi("Enregistrer et imprimer", "حفظ وطباعة")}
          </Button>
        </>
      }
    >
      {shownError ? (
        <div className="mb-3">
          <RhAlert tone="danger">{shownError}</RhAlert>
        </div>
      ) : null}
      {!values ? (
        shownError ? null : <p className="text-sm text-foreground/55">{bi("Chargement…", "جارٍ التحميل…")}</p>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Button variant={values.lang === "fr" ? "primary" : "secondary"} onClick={() => setLang("fr")}>
                Français
              </Button>
              <Button variant={values.lang === "ar" ? "primary" : "secondary"} onClick={() => setLang("ar")}>
                العربية
              </Button>
              <select
                className={`${rhInput} mt-0 w-auto`}
                value={values.sex}
                onChange={(e) => set("sex", e.target.value === "F" ? "F" : "M")}
              >
                <option value="M">Monsieur · السيد</option>
                <option value="F">Madame · السيدة</option>
              </select>
              {values.numero ? <span className="text-sm font-semibold">N° {values.numero}</span> : null}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {[...COMMON, ...BY_KIND[kind]].map((f) => (
                <div key={f.key} className={f.wide ? "sm:col-span-2" : undefined}>
                  <RhField label={f.label}>
                    <input
                      type={f.date ? "date" : "text"}
                      dir={f.rtl ? "rtl" : f.date ? "ltr" : "auto"}
                      className={rhInput}
                      value={values[f.key]}
                      onChange={(e) => set(f.key, e.target.value)}
                    />
                  </RhField>
                </div>
              ))}
            </div>
            {kind === "STC" ? (
              <div className="space-y-2 rounded-xl border border-border/70 p-3">
                <p className="text-sm font-semibold">{bi("Détail du solde (facultatif)", "تفاصيل التصفية")}</p>
                {values.lines.map((l, i) => (
                  <div key={i} className="grid grid-cols-[1fr_1fr_8rem_auto] gap-2">
                    <input
                      className={`${rhInput} mt-0`}
                      value={l.label_fr}
                      placeholder="Désignation"
                      onChange={(e) =>
                        set("lines", values.lines.map((x, j) => (j === i ? { ...x, label_fr: e.target.value } : x)))
                      }
                    />
                    <input
                      dir="rtl"
                      className={`${rhInput} mt-0`}
                      value={l.label_ar}
                      placeholder="البيان"
                      onChange={(e) =>
                        set("lines", values.lines.map((x, j) => (j === i ? { ...x, label_ar: e.target.value } : x)))
                      }
                    />
                    <input
                      inputMode="decimal"
                      className={`${rhInput} mt-0 text-right`}
                      value={String(l.amount)}
                      onChange={(e) =>
                        set(
                          "lines",
                          values.lines.map((x, j) => (j === i ? { ...x, amount: Number(e.target.value.replace(",", ".")) || 0 } : x)),
                        )
                      }
                    />
                    <button
                      type="button"
                      className="text-xs text-red-600 hover:underline"
                      onClick={() => set("lines", values.lines.filter((_, j) => j !== i))}
                    >
                      {bi("Retirer", "حذف")}
                    </button>
                  </div>
                ))}
                <Button
                  variant="secondary"
                  onClick={() => set("lines", [...values.lines, { label_fr: "", label_ar: "", amount: 0 }])}
                >
                  {bi("Ajouter une ligne", "إضافة سطر")}
                </Button>
              </div>
            ) : null}
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={customText}
                disabled={!kit}
                onChange={(e) => (e.target.checked && kit ? startCustomText(values, kit) : set("body", ""))}
              />
              {bi("Modifier le texte librement", "تعديل النص")}
            </label>
            {customText ? (
              <textarea
                dir={values.lang === "ar" ? "rtl" : "ltr"}
                rows={10}
                className={`${rhInput} h-auto py-2 leading-7`}
                value={values.body}
                onChange={(e) => set("body", e.target.value)}
              />
            ) : null}
          </div>
          <div className="min-h-[70vh] overflow-hidden rounded-xl border border-border bg-white">
            <iframe title="Aperçu" srcDoc={html} className="h-full min-h-[70vh] w-full" />
          </div>
        </div>
      )}
    </RhModal>
  );
}
