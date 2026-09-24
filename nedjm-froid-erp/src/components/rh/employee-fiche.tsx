"use client";

import { useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import {
  uploadHrEmployeePhoto,
  type HrEmployeeField,
} from "@/lib/actions/hr-employees";
import type { CatalogItem } from "@/lib/actions/hr-catalogs";
import { Button } from "@/components/ui/button";
import {
  CatalogSelect,
  RhAlert,
  RhChip,
  RhModal,
  rhInput,
} from "@/components/rh/rh-ui";
import { buildOfficialFicheHtml } from "@/components/rh/employee-fiche-print";
import { EmployeeDocumentsUpload } from "@/components/rh/employee-documents-upload";
import { DEFAULT_FICHE_SETTINGS, type HrFicheSettings } from "@/lib/hr/fiche-settings";
import {
  isFieldApplicable,
  maritalAllowsChildren,
} from "@/lib/hr/employee-field-utils";
import {
  digitMaxLength,
  isExpiryDateField,
  isIssueDateField,
  isLatinUppercaseField,
  sanitizeFicheInput,
  todayIsoDate,
  tomorrowIsoDate,
} from "@/lib/hr/employee-fiche-constraints";
import { sanitizeOcrSuggestion } from "@/lib/hr/ocr/extractors";

/** Champs fiche : hauteur compacte pour tenir dans l'écran. */
const ficheInput = `${rhInput} mt-0.5 h-8 rounded-lg px-2 py-0 text-xs`;

function groupFields(fields: HrEmployeeField[], values: Record<string, string>) {
  const active = fields
    .filter((f) => f.is_active && f.code !== "photo_url" && isFieldApplicable(f, values))
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order);
  const groups: { titleFr: string; titleAr: string; key: string; fields: HrEmployeeField[] }[] = [];
  for (const field of active) {
    const key = `${field.section_fr ?? ""}|${field.section_ar ?? ""}`;
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.fields.push(field);
    else
      groups.push({
        titleFr: field.section_fr || "Informations",
        titleAr: field.section_ar || "",
        key,
        fields: [field],
      });
  }
  return groups;
}

const STATUS_TONE: Record<string, "success" | "warning" | "danger" | "neutral"> = {
  ACTIVE: "success",
  INACTIVE: "neutral",
  SUSPENDED: "warning",
  DISABLED: "danger",
};

export function EmployeeFicheDialog({
  values,
  setValues,
  fields,
  catalogs,
  fiche,
  pending,
  formError,
  onClose,
  onSubmit,
  onNew,
  onSearch,
}: {
  values: Record<string, string>;
  setValues: (next: Record<string, string> | ((prev: Record<string, string>) => Record<string, string>)) => void;
  fields: HrEmployeeField[];
  catalogs: CatalogItem[];
  fiche: HrFicheSettings;
  pending: boolean;
  formError: string | null;
  onClose: () => void;
  onSubmit: () => void;
  onNew: () => void;
  onSearch: (query: string) => void;
}) {
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [fieldHint, setFieldHint] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [, start] = useTransition();
  const photoField = fields.find((f) => f.code === (fiche.photo_field || "photo_url"));
  const groups = useMemo(() => groupFields(fields, values), [fields, values]);
  const headerGroup = groups[0];
  const restGroups = groups.slice(1);

  const displayName =
    [values.last_name, values.first_name].filter(Boolean).join(" ") ||
    [values.last_name_ar, values.first_name_ar].filter(Boolean).join(" ") ||
    "Nouvel employé";
  const displayNameAr = [values.last_name_ar, values.first_name_ar].filter(Boolean).join(" ");
  const photoUrl = values[photoField?.code ?? "photo_url"];
  const status = values.status || "ACTIVE";

  function set(code: string, value: string) {
    const nextValue = sanitizeFicheInput(code, value);
    if (isIssueDateField(code) && value && !nextValue) {
      setFieldHint("Date de délivrance : une date future n'est pas autorisée.");
    } else if (isExpiryDateField(code) && value && !nextValue) {
      setFieldHint(
        "Date d'expiration : aujourd'hui et les dates passées sont refusées. Choisissez une date future.",
      );
    } else if (fieldHint) {
      setFieldHint(null);
    }
    setValues((prev) => {
      const next = { ...prev, [code]: nextValue };
      if (code === "marital_code" && !maritalAllowsChildren(nextValue)) {
        next.children_count = "";
      }
      return next;
    });
  }

  function printFiche() {
    printHtml(
      buildOfficialFicheHtml(
        values,
        catalogs,
        fields,
        fiche ?? DEFAULT_FICHE_SETTINGS,
        window.location.origin,
      ),
    );
  }

  return (
    <RhModal
      size="xl"
      title={
        <span className="flex flex-wrap items-center gap-2.5">
          <span>Fiche employé</span>
          {values.matricule ? (
            <span className="rounded-lg bg-brand/10 px-2.5 py-1 font-mono text-xs font-bold tracking-wide text-brand">
              {values.matricule}
            </span>
          ) : (
            <RhChip tone="brand">Brouillon</RhChip>
          )}
        </span>
      }
      onClose={onClose}
      subtitle={
        <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative min-w-0 flex-1">
            <svg
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-foreground/35"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden
            >
              <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.7" />
              <path d="M20 20l-3.2-3.2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
            </svg>
            <input
              ref={searchRef}
              className={`${rhInput} mt-0 h-11 pl-10`}
              placeholder="Rechercher par matricule, N°SS ou NIN…"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  onSearch(searchRef.current?.value ?? "");
                }
              }}
            />
          </div>
          <Button
            variant="secondary"
            className="h-11 shrink-0"
            onClick={() => onSearch(searchRef.current?.value ?? "")}
          >
            Rechercher
          </Button>
        </div>
      }
      footer={
        <>
          <Button variant="ghost" className="mr-auto hidden sm:inline-flex" onClick={onClose}>
            Fermer
          </Button>
          <Button variant="secondary" className="gap-2" onClick={printFiche}>
            <IconPrint />
            Imprimer
          </Button>
          <Button variant="secondary" className="gap-2" disabled={pending} onClick={onNew}>
            <IconPlus />
            Nouveau
          </Button>
          <Button className="min-w-[8.5rem] gap-2" disabled={pending} onClick={onSubmit}>
            <IconSave />
            {pending ? "Enregistrement…" : "Enregistrer"}
          </Button>
        </>
      }
    >
      <div className="space-y-2">
        <EmployeeDocumentsUpload
          employeeId={values.id || undefined}
          catalogs={catalogs}
            onApplySuggestions={(patch) => {
              setValues((prev) => {
                const next = { ...prev };
                for (const [code, value] of Object.entries(patch)) {
                  next[code] = sanitizeOcrSuggestion(code, value);
                }
                return next;
              });
              setFieldHint(null);
            }}
        />
        {/* Identity hero — compact */}
        <div className="overflow-hidden rounded-xl border border-border/60 bg-surface">
          <div className="bg-[linear-gradient(135deg,#1a2f8a_0%,#3b6ef5_55%,#7aa0ff_100%)] px-3 py-2">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="group relative h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-white/15 ring-2 ring-white/25 transition hover:ring-white/45"
              >
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const data = new FormData();
                    data.set("file", file);
                    data.set("employee_id", values.id || "draft");
                    start(async () => {
                      const result = await uploadHrEmployeePhoto(data);
                      if (!result.ok) {
                        setPhotoError(result.error);
                        return;
                      }
                      setPhotoError(null);
                      set(photoField?.code ?? "photo_url", result.data.url);
                    });
                  }}
                />
                {photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={photoUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="flex h-full w-full items-center justify-center text-white/90">
                    <IconUser />
                  </span>
                )}
              </button>

              <div className="min-w-0 flex-1">
                <p className="truncate font-display text-base font-semibold tracking-tight text-white sm:text-lg">
                  {displayName}
                </p>
                {displayNameAr ? (
                  <p className="truncate text-sm text-white/80" dir="rtl">
                    {displayNameAr}
                  </p>
                ) : null}
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  <RhChip tone={STATUS_TONE[status] ?? "neutral"}>{status}</RhChip>
                  {values.nss ? (
                    <span className="rounded bg-white/15 px-1.5 py-0.5 text-[10px] font-medium text-white/95">
                      NSS · {values.nss}
                    </span>
                  ) : null}
                  {values.nin ? (
                    <span className="rounded bg-white/15 px-1.5 py-0.5 text-[10px] font-medium text-white/95">
                      NIN · {values.nin}
                    </span>
                  ) : null}
                </div>
                {photoError ? (
                  <p className="mt-0.5 text-[10px] font-medium text-red-200">{photoError}</p>
                ) : null}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 p-2.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
            {(headerGroup?.fields ?? []).map((field) => (
              <FicheField key={field.id} field={field}>
                <FieldControl
                  field={field}
                  catalogs={catalogs}
                  value={values[field.code] ?? ""}
                  onChange={(v) => set(field.code, v)}
                />
              </FicheField>
            ))}
          </div>
        </div>

        {restGroups.map((group, index) => (
          <SectionCard
            key={group.key}
            index={index + 1}
            titleFr={group.titleFr}
            titleAr={group.titleAr}
          >
            {group.fields.map((field) => (
              <FicheField key={field.id} field={field}>
                <FieldControl
                  field={field}
                  catalogs={catalogs}
                  value={values[field.code] ?? ""}
                  onChange={(v) => set(field.code, v)}
                />
              </FicheField>
            ))}
          </SectionCard>
        ))}
      </div>

      {fieldHint ? (
        <div className="mt-2">
          <RhAlert tone="warning">{fieldHint}</RhAlert>
        </div>
      ) : null}
      {formError ? (
        <div className="mt-2">
          <RhAlert tone="danger">{formError}</RhAlert>
        </div>
      ) : null}
    </RhModal>
  );
}

function FicheField({
  field,
  children,
}: {
  field: HrEmployeeField;
  children: ReactNode;
}) {
  return (
    <label className="group block min-w-0">
      <span className="flex items-baseline justify-between gap-1">
        <span className="truncate text-[10px] font-semibold text-foreground/75">
          {field.label_fr}
          {field.is_required ? <span className="ml-0.5 text-alert-critical">*</span> : null}
        </span>
        {field.label_ar ? (
          <span className="truncate text-[9px] font-medium text-foreground/35" dir="rtl">
            {field.label_ar}
          </span>
        ) : null}
      </span>
      {children}
    </label>
  );
}

function SectionCard({
  index,
  titleFr,
  titleAr,
  children,
}: {
  index: number;
  titleFr: string;
  titleAr: string;
  children: ReactNode;
}) {
  const roman = ["I", "II", "III", "IV", "V", "VI"][index - 1] ?? String(index);
  return (
    <section className="overflow-hidden rounded-xl border border-border/60 bg-surface">
      <header className="flex items-center gap-2 border-b border-border/40 bg-surface-muted/30 px-2.5 py-1.5">
        <span className="flex h-5 w-5 items-center justify-center rounded-md bg-brand text-[9px] font-bold text-white">
          {roman}
        </span>
        <div className="min-w-0 flex flex-1 items-baseline gap-2">
          <h4 className="truncate font-display text-xs font-semibold text-foreground">
            {titleFr}
          </h4>
          {titleAr ? (
            <p className="truncate text-[10px] text-foreground/40" dir="rtl">
              {titleAr}
            </p>
          ) : null}
        </div>
      </header>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 p-2.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
        {children}
      </div>
    </section>
  );
}

function FieldControl({
  field,
  catalogs,
  value,
  onChange,
}: {
  field: HrEmployeeField;
  catalogs: CatalogItem[];
  value: string;
  onChange: (value: string) => void;
}) {
  if (field.code === "matricule") {
    return (
      <input
        className={`${ficheInput} bg-brand-muted/50 font-mono font-semibold text-brand`}
        value={value}
        readOnly
      />
    );
  }
  if (field.code === "status") {
    return (
      <select className={ficheInput} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="ACTIVE">ACTIVE</option>
        <option value="INACTIVE">INACTIVE</option>
        <option value="SUSPENDED">SUSPENDED</option>
        <option value="DISABLED">DISABLED</option>
      </select>
    );
  }
  if (field.value_type === "catalog" && field.catalog_kind) {
    return (
      <CatalogSelect
        items={catalogs}
        kind={field.catalog_kind}
        value={value}
        onChange={onChange}
        className={ficheInput}
      />
    );
  }
  if (field.value_type === "date") {
    const max = isIssueDateField(field.code) ? todayIsoDate() : undefined;
    const min = isExpiryDateField(field.code) ? tomorrowIsoDate() : undefined;
    return (
      <input
        type="date"
        className={ficheInput}
        value={value}
        max={max}
        min={min}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }
  if (field.value_type === "number") {
    return (
      <input type="number" className={ficheInput} value={value} onChange={(e) => onChange(e.target.value)} />
    );
  }

  const digitLen = digitMaxLength(field.code);
  if (digitLen != null) {
    return (
      <input
        inputMode="numeric"
        pattern={`\\d{0,${digitLen}}`}
        maxLength={digitLen}
        autoComplete="off"
        className={`${ficheInput} font-mono tracking-wide`}
        value={value}
        placeholder={`${digitLen} chiffres`}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }

  const upper = isLatinUppercaseField(field.code);
  return (
    <input
      dir={field.code.endsWith("_ar") ? "rtl" : undefined}
      className={`${ficheInput}${upper ? " uppercase" : ""}`}
      style={upper ? { textTransform: "uppercase" } : undefined}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

function printHtml(html: string) {
  const existing = document.getElementById("hr-print-frame");
  existing?.remove();
  const frame = document.createElement("iframe");
  frame.id = "hr-print-frame";
  frame.setAttribute("aria-hidden", "true");
  frame.style.position = "fixed";
  frame.style.left = "-10000px";
  frame.style.top = "0";
  frame.style.width = "794px";
  frame.style.height = "1123px";
  frame.style.border = "0";
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

  const cleanup = () => {
    frame.remove();
  };
  win.addEventListener("afterprint", cleanup);

  const run = () => {
    win.focus();
    win.print();
    window.setTimeout(cleanup, 2000);
  };
  const images = Array.from(doc.images);
  if (!images.length) {
    window.setTimeout(run, 50);
    return;
  }
  let pending = images.length;
  const done = () => {
    pending -= 1;
    if (pending <= 0) window.setTimeout(run, 50);
  };
  for (const image of images) {
    if (image.complete) done();
    else {
      image.addEventListener("load", done);
      image.addEventListener("error", done);
    }
  }
}

function IconPrint() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M7 8V4h10v4M7 16H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2M7 14h10v6H7v-6Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconPlus() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function IconSave() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M5 5h11l3 3v11H5V5Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path d="M8 5v5h7V5M8 19v-6h8v6" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
    </svg>
  );
}

function IconUser() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="9" r="3.5" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M5.5 19c1.2-3 3.5-4.5 6.5-4.5s5.3 1.5 6.5 4.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}
