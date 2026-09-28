"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { saveHrBulletinSettings } from "@/lib/actions/hr-bulletin";
import { uploadHrFicheLetterhead } from "@/lib/actions/hr-fiche";
import {
  DEFAULT_BULLETIN_SETTINGS,
  resolveBulletinLetterhead,
  type BulletinLegalRates,
  type HrBulletinSettings,
} from "@/lib/hr/bulletin-settings";
import { Button } from "@/components/ui/button";
import {
  RhAlert,
  RhField,
  RhPageHeader,
  RhPanel,
  RhSectionTitle,
  RhToolbar,
  bi,
  rhInput,
} from "@/components/rh/rh-ui";
import { renderBulletinHtml, slipToBulletin } from "@/components/rh/bulletin-print";

function printHtml(html: string) {
  const existing = document.getElementById("hr-print-frame");
  existing?.remove();
  const frame = document.createElement("iframe");
  frame.id = "hr-print-frame";
  frame.style.position = "fixed";
  frame.style.left = "-10000px";
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
  const cleanup = () => frame.remove();
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

export function BulletinSettingsManager({
  initial,
  template,
  ficheLetterheadUrl = "",
  legalRates = { ss_pct: null, pat_pct: null, caco_pct: null, intemp_sal_pct: null, intemp_pat_pct: null },
}: {
  initial: HrBulletinSettings;
  template: string;
  ficheLetterheadUrl?: string;
  legalRates?: BulletinLegalRates;
}) {
  const [form, setForm] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const letterheadPreview = resolveBulletinLetterhead(
    form.letterhead_url ? form : { ...form, letterhead_url: ficheLetterheadUrl },
  );

  function set<K extends keyof HrBulletinSettings>(key: K, value: HrBulletinSettings[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <div className="space-y-5">
      <RhPageHeader
        title={bi("Modèle de bulletin", "نموذج كشف الأجر")}
        description={bi(
          "Données du bulletin : en-tête, unités, codes (100, 990, 995), variables légales, employeur et mois. Les taux CSS viennent des variables légales.",
          "بيانات الكشف: الترويسة والوحدات والرموز والمتغيرات القانونية والمستخدم والشهور. نسب الضمان من المتغيرات القانونية.",
        )}
      />
      {error ? <RhAlert tone="danger">{error}</RhAlert> : null}
      {info && !error ? <RhAlert tone="success">{info}</RhAlert> : null}

      <RhPanel className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <RhSectionTitle>{bi("Mise en page, textes et styles", "التصميم والنصوص والتنسيق")}</RhSectionTitle>
          <p className="text-sm text-foreground/60">
            {bi(
              "Titres, libellés, colonnes, marges, polices et tableaux se modifient directement sur le bulletin, dans l’éditeur de documents du simulateur.",
              "العناوين والتسميات والأعمدة والهوامش والخطوط والجداول تُعدَّل مباشرة على الكشف من محرر الوثائق في المحاكي.",
            )}
          </p>
        </div>
        <Link
          href="/simulateur?cible=paie&edition=1"
          className="inline-flex h-9 items-center rounded-lg bg-brand px-3 text-sm font-medium text-white hover:bg-brand/90"
        >
          {bi("Ouvrir l’éditeur", "فتح المحرر")}
        </Link>
      </RhPanel>

      <RhPanel>
        <RhSectionTitle>{bi("En-tête entreprise", "ترويسة المؤسسة")}</RhSectionTitle>
        <div className="grid gap-4 lg:grid-cols-[180px_1fr]">
          <div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={letterheadPreview}
              alt=""
              className="h-40 w-full rounded-xl border border-border/70 object-cover object-top"
            />
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
                start(async () => {
                  const result = await uploadHrFicheLetterhead(data);
                  if (!result.ok) {
                    setError(result.error);
                    return;
                  }
                  set("letterhead_url", result.data.url);
                  setInfo(bi("En-tête enregistré.", "تم حفظ الترويسة."));
                });
              }}
            />
            <Button className="mt-2 w-full" variant="secondary" onClick={() => fileRef.current?.click()}>
              {bi("Charger l’en-tête", "رفع الترويسة")}
            </Button>
            {ficheLetterheadUrl ? (
              <Button
                className="mt-2 w-full"
                variant="ghost"
                onClick={() => set("letterhead_url", ficheLetterheadUrl)}
              >
                {bi("Utiliser l’en-tête de la fiche", "استخدام ترويسة البطاقة")}
              </Button>
            ) : null}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input
                type="checkbox"
                checked={form.hide_zero_lines}
                onChange={(e) => set("hide_zero_lines", e.target.checked)}
              />
              {bi("Masquer les lignes à 0", "إخفاء السطور الصفرية")}
            </label>
            <RhField label={bi("Unité montant", "وحدة المبلغ")}>
              <input className={rhInput} value={form.unit_da} onChange={(e) => set("unit_da", e.target.value)} />
            </RhField>
            <RhField label={bi("Unité pourcentage", "وحدة النسبة")}>
              <input
                className={rhInput}
                value={form.unit_percent}
                onChange={(e) => set("unit_percent", e.target.value)}
              />
            </RhField>
            <RhField label={bi("Unité journalier", "وحدة السلم اليومي")}>
              <input className={rhInput} value={form.unit_day} onChange={(e) => set("unit_day", e.target.value)} />
            </RhField>
          </div>
        </div>
      </RhPanel>

      <RhPanel className="grid gap-3 sm:grid-cols-3">
        <RhField label={bi("Code salaire de base", "رمز الأجر الأساسي")}>
          <input className={rhInput} value={form.base_code} onChange={(e) => set("base_code", e.target.value)} />
        </RhField>
        <RhField label={bi("Libellé salaire de base", "تسمية الأجر الأساسي")}>
          <input className={rhInput} value={form.base_label} onChange={(e) => set("base_label", e.target.value)} />
        </RhField>
        <RhField label={bi("Code retenue SS", "رمز اقتطاع الضمان")}>
          <input className={rhInput} value={form.ss_code} onChange={(e) => set("ss_code", e.target.value)} />
        </RhField>
        <RhField label={bi("Libellé SS", "تسمية الضمان")}>
          <input className={rhInput} value={form.ss_label} onChange={(e) => set("ss_label", e.target.value)} />
        </RhField>
        <RhField label={bi("Code IRG", "رمز الضريبة")}>
          <input className={rhInput} value={form.irg_code} onChange={(e) => set("irg_code", e.target.value)} />
        </RhField>
        <RhField label={bi("Libellé IRG", "تسمية الضريبة")}>
          <input className={rhInput} value={form.irg_label} onChange={(e) => set("irg_label", e.target.value)} />
        </RhField>
        <RhField label="Variable CSS salarié">
          <input className={rhInput} value={form.ss_var_key} onChange={(e) => set("ss_var_key", e.target.value)} />
        </RhField>
        <RhField label="Variable CSS patronale">
          <input className={rhInput} value={form.pat_var_key} onChange={(e) => set("pat_var_key", e.target.value)} />
        </RhField>
        <RhField label="Variable FOS">
          <input className={rhInput} value={form.fos_var_key} onChange={(e) => set("fos_var_key", e.target.value)} />
        </RhField>
        <RhField label="Variable congés / CACOBATPH">
          <input className={rhInput} value={form.caco_var_key} onChange={(e) => set("caco_var_key", e.target.value)} />
        </RhField>
        <RhField label={bi("Code intempéries", "رمز انقطاعات الطقس")}>
          <input className={rhInput} value={form.intemp_code} onChange={(e) => set("intemp_code", e.target.value)} />
        </RhField>
        <RhField label={bi("Libellé intempéries", "تسمية انقطاعات الطقس")}>
          <input className={rhInput} value={form.intemp_label} onChange={(e) => set("intemp_label", e.target.value)} />
        </RhField>
        <RhField label="Variable intempéries salarié">
          <input
            className={rhInput}
            value={form.intemp_sal_var_key}
            onChange={(e) => set("intemp_sal_var_key", e.target.value)}
          />
        </RhField>
        <RhField label="Variable intempéries employeur">
          <input
            className={rhInput}
            value={form.intemp_emp_var_key}
            onChange={(e) => set("intemp_emp_var_key", e.target.value)}
          />
        </RhField>
      </RhPanel>

      <RhPanel className="grid gap-3 sm:grid-cols-3">
        <RhField label={bi("Paiement par défaut", "الدفع الافتراضي")}>
          <input
            className={rhInput}
            value={form.default_payment}
            onChange={(e) => set("default_payment", e.target.value)}
          />
        </RhField>
      </RhPanel>

      <RhPanel>
        <RhSectionTitle>{bi("Employeur — déclarations CNAS / G50 / CACOBATPH", "المستخدم — التصريحات")}</RhSectionTitle>
        <div className="grid gap-3 sm:grid-cols-3">
          {(
            [
              ["employer_name", "Raison sociale"],
              ["employer_address", "Adresse"],
              ["employer_nif", "NIF"],
              ["employer_nis", "NIS"],
              ["employer_cnas_no", "N° employeur CNAS"],
              ["employer_cacobatph_no", "N° adhérent CACOBATPH"],
            ] as const
          ).map(([key, label]) => (
            <RhField key={key} label={label}>
              <input className={rhInput} value={form[key]} onChange={(e) => set(key, e.target.value)} />
            </RhField>
          ))}
        </div>
      </RhPanel>

      <RhPanel>
        <RhSectionTitle>{bi("Mois", "الشهور")}</RhSectionTitle>
        <div className="grid gap-2 sm:grid-cols-4">
          {form.months.map((month, index) => (
            <input
              key={index}
              className={rhInput}
              value={month}
              onChange={(e) => {
                const months = [...form.months];
                months[index] = e.target.value;
                set("months", months);
              }}
            />
          ))}
        </div>
      </RhPanel>

      <RhToolbar>
        <Button
          disabled={pending}
          onClick={() => {
            setError(null);
            start(async () => {
              const result = await saveHrBulletinSettings(form);
              if (!result.ok) {
                setError(result.error);
                return;
              }
              setForm(result.data);
              setInfo(bi("Modèle enregistré.", "تم حفظ النموذج."));
            });
          }}
        >
          {bi("Enregistrer le modèle", "حفظ النموذج")}
        </Button>
        <Button
          variant="secondary"
          onClick={() =>
            printHtml(
              renderBulletinHtml(
                template,
                [
                slipToBulletin(
                  {
                    employee_name: "CHINE ABOUBAKR",
                    poste_fr: "INGENIEUR EN FROID",
                    site_name: "",
                    hired_at: "2024-12-13",
                    birth_date: "1991-12-28",
                    marital_code: "M",
                    address_fr: "CITE BOUHEMDOUN AMIR ABDELKADER",
                    commune: "JIJEL",
                    nss: "914379002240",
                    matricule: "031",
                    period_year: 2026,
                    period_month: 1,
                    days_worked: 31,
                    days_paid: 31,
                    gross_amount: 27300,
                    employee_ss: 2457,
                    employer_ss: 7098,
                    cacobatph: 0,
                    irg_amount: 0,
                    net_payable: 120000,
                    account_no: "00799999001568127523",
                    lines: [
                      {
                        code: "BASE",
                        label_fr: form.base_label,
                        nature: "indemnite",
                        unit: "month",
                        quantity: 1,
                        unit_amount: 21000,
                        amount: 21000,
                        taxable: true,
                      },
                    ],
                  },
                  form.letterhead_url ? form : { ...form, letterhead_url: ficheLetterheadUrl },
                  legalRates,
                ),
              ],
              window.location.origin,
            ),
            )
          }
        >
          {bi("Aperçu impression", "معاينة الطباعة")}
        </Button>
        <Button variant="ghost" onClick={() => setForm(DEFAULT_BULLETIN_SETTINGS)}>
          {bi("Revenir au modèle GAS", "العودة لنموذج المؤسسة")}
        </Button>
      </RhToolbar>
    </div>
  );
}

