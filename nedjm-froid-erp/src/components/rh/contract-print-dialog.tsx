"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  getContractPrintContext,
  saveContractPrint,
  saveContractTemplate,
} from "@/lib/actions/hr-contract-print";
import {
  CONTRACT_PLACEHOLDERS,
  DEFAULT_CONTRACT_TEMPLATE,
  articleTitle,
  type ContractPrintValues,
  type ContractTemplate,
} from "@/lib/hr/work-contract";
import { buildWorkContractHtml } from "@/components/rh/work-contract-print";
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

export function ContractPrintDialog({
  contractId,
  canEditTemplate,
  onClose,
  onNumbered,
}: {
  contractId: string;
  canEditTemplate: boolean;
  onClose: () => void;
  onNumbered?: (numero: string) => void;
}) {
  const [values, setValues] = useState<ContractPrintValues | null>(null);
  const [template, setTemplate] = useState<ContractTemplate | null>(null);
  const [editingTemplate, setEditingTemplate] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    let cancelled = false;
    getContractPrintContext(contractId).then((r) => {
      if (cancelled) return;
      if (r.ok) {
        setValues(r.data.values);
        setTemplate(r.data.template);
      } else setError(r.error);
    });
    return () => {
      cancelled = true;
    };
  }, [contractId]);

  const html = useMemo(
    () => (values && template ? buildWorkContractHtml(values, template) : ""),
    [values, template],
  );

  function set<K extends keyof ContractPrintValues>(key: K, value: ContractPrintValues[K]) {
    setValues((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  function print() {
    if (!values || !template) return;
    setError(null);
    start(async () => {
      const r = await saveContractPrint({ contract_id: contractId, values });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      const next = { ...values, numero: r.data.numero };
      setValues(next);
      onNumbered?.(r.data.numero);
      printHtml(buildWorkContractHtml(next, template));
    });
  }

  const missing = values
    ? (["nom", "birth_date", "id_number", "poste", "net"] as const).filter((k) => !String(values[k]).trim())
    : [];

  return (
    <>
    <RhModal
      size="xl"
      title={bi("Imprimer le contrat de travail", "طباعة عقد العمل")}
      onClose={onClose}
      footer={
        <>
          {canEditTemplate && template ? (
            <Button variant="secondary" onClick={() => setEditingTemplate(true)}>
              {bi("Modifier le modèle (articles)", "تعديل النموذج")}
            </Button>
          ) : null}
          <Button variant="secondary" onClick={onClose}>
            {bi("Fermer", "إغلاق")}
          </Button>
          <Button disabled={pending || !values} onClick={print}>
            {bi("Enregistrer et imprimer", "حفظ وطباعة")}
          </Button>
        </>
      }
    >
      {error ? (
        <div className="mb-3">
          <RhAlert tone="danger">{error}</RhAlert>
        </div>
      ) : null}
      {!values || !template ? (
        error ? null : <p className="text-sm text-foreground/55">{bi("Chargement…", "جارٍ التحميل…")}</p>
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
              <RhField label={bi("Type · النوع", "")}>
                <select
                  className={rhInput}
                  value={values.is_cdi ? "CDI" : "CDD"}
                  onChange={(e) => set("is_cdi", e.target.value === "CDI")}
                >
                  <option value="CDD">عقد عمل محدد المدة (CDD)</option>
                  <option value="CDI">عقد عمل غير محدد المدة (CDI)</option>
                </select>
              </RhField>
              {!values.is_cdi ? (
                <RhField label={bi("Motif CDD (art. 12 loi 90-11) · سبب التوظيف", "")}>
                  <select
                    className={rhInput}
                    value={values.cdd_reason}
                    onChange={(e) => set("cdd_reason", Number(e.target.value))}
                  >
                    {template.cdd_reasons.map((r, i) => (
                      <option key={i} value={i + 1}>
                        {i + 1}- {r}
                      </option>
                    ))}
                  </select>
                </RhField>
              ) : (
                <div />
              )}
              {FIELDS.filter((f) => !(values.is_cdi && f.key === "end_date")).map((f) => (
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
    {editingTemplate && template ? (
      <ContractTemplateEditor
        template={template}
        onClose={() => setEditingTemplate(false)}
        onSaved={(t) => {
          setTemplate(t);
          setEditingTemplate(false);
        }}
      />
    ) : null}
    </>
  );
}

function ContractTemplateEditor({
  template,
  onClose,
  onSaved,
}: {
  template: ContractTemplate;
  onClose: () => void;
  onSaved: (t: ContractTemplate) => void;
}) {
  const [draft, setDraft] = useState<ContractTemplate>(template);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const area = `${rhInput} h-auto min-h-[5.5rem] py-2 leading-7`;

  function save() {
    setError(null);
    start(async () => {
      const r = await saveContractTemplate(draft);
      if (!r.ok) setError(r.error);
      else onSaved(r.data);
    });
  }

  const text = (key: keyof ContractTemplate, label: string, rows = 3) => (
    <RhField label={label}>
      <textarea
        dir="rtl"
        rows={rows}
        className={area}
        value={draft[key] as string}
        onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
      />
    </RhField>
  );

  return (
    <RhModal
      size="lg"
      title={bi("Modèle du contrat de travail", "نموذج عقد العمل")}
      onClose={onClose}
      footer={
        <>
          <Button
            variant="secondary"
            onClick={() => {
              if (window.confirm(bi("Revenir au texte d'origine ?", "الرجوع إلى النص الأصلي؟"))) {
                setDraft(DEFAULT_CONTRACT_TEMPLATE);
              }
            }}
          >
            {bi("Texte d'origine", "النص الأصلي")}
          </Button>
          <Button variant="secondary" onClick={onClose}>
            {bi("Annuler", "إلغاء")}
          </Button>
          <Button disabled={pending} onClick={save}>
            {bi("Enregistrer le modèle", "حفظ النموذج")}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {error ? <RhAlert tone="danger">{error}</RhAlert> : null}
        <RhAlert tone="info">
          {bi(
            `Variables : ${CONTRACT_PLACEHOLDERS.map(([k, l]) => `${k} = ${l}`).join(" · ")}. Texte **entre deux étoiles** = gras.`,
            "",
          )}
        </RhAlert>
        <div className="grid gap-3 sm:grid-cols-2">
          {text("title_cdd", "Titre CDD", 1)}
          {text("title_cdi", "Titre CDI", 1)}
        </div>
        {text("legal_intro", "Préambule légal")}
        <div className="grid gap-3 sm:grid-cols-2">
          {text("opening_cdd", "Phrase d'ouverture CDD", 2)}
          {text("opening_cdi", "Phrase d'ouverture CDI", 2)}
        </div>
        {text("employer_block", "L'employeur (من جهة)", 5)}
        {text("cdd_reason_intro", "Article 2 (CDD) : introduction")}
        {draft.cdd_reasons.map((r, i) => (
          <RhField key={`reason-${i}`} label={`Motif ${i + 1}`}>
            <input
              dir="rtl"
              className={rhInput}
              value={r}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  cdd_reasons: draft.cdd_reasons.map((x, j) => (j === i ? e.target.value : x)),
                })
              }
            />
          </RhField>
        ))}
        {draft.articles.map((a, i) => (
          <div key={`art-${i}`} className="rounded-xl border border-border/70 p-3">
            <div className="mb-1 flex flex-wrap items-center justify-between gap-2 text-sm font-semibold">
              <span>
                {bi(`Article suivant n° ${i + 1}`, "")} ({articleTitle(i + 2)} en CDD)
              </span>
              <span className="flex items-center gap-3">
                <label className="flex items-center gap-1 text-xs font-normal">
                  <input
                    type="checkbox"
                    checked={a.cdd_only === true}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        articles: draft.articles.map((x, j) => (j === i ? { ...x, cdd_only: e.target.checked } : x)),
                      })
                    }
                  />
                  {bi("CDD seulement", "")}
                </label>
                <button
                  type="button"
                  className="text-xs text-red-600 hover:underline"
                  onClick={() => setDraft({ ...draft, articles: draft.articles.filter((_, j) => j !== i) })}
                >
                  {bi("Supprimer", "حذف")}
                </button>
              </span>
            </div>
            <textarea
              dir="rtl"
              rows={3}
              className={area}
              value={a.body}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  articles: draft.articles.map((x, j) => (j === i ? { ...x, body: e.target.value } : x)),
                })
              }
            />
          </div>
        ))}
        <Button
          variant="secondary"
          onClick={() =>
            setDraft({
              ...draft,
              articles: [...draft.articles, { key: `art${draft.articles.length + 1}`, body: "", cdd_only: false }],
            })
          }
        >
          {bi("Ajouter un article", "إضافة مادة")}
        </Button>
        {text("note", "Remarque (ملاحظة)")}
        {text("closing", "Phrase finale", 1)}
        <div className="grid gap-3 sm:grid-cols-2">
          {text("sig_employee", "Signature employé", 1)}
          {text("sig_employer", "Signature employeur", 1)}
        </div>
        {text("copies", "Exemplaires (1re ligne à droite, lignes suivantes à gauche)", 3)}
      </div>
    </RhModal>
  );
}
