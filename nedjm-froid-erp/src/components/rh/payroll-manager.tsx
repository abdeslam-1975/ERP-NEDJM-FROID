"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  generatePayrollRun,
  lockPayrollSlip,
  type PayrollSlipLineRow,
  type PayrollSlipRow,
} from "@/lib/actions/hr-ops";
import { Button } from "@/components/ui/button";
import {
  RhAlert,
  RhChip,
  RhField,
  RhPageHeader,
  RhTableWrap,
  RhToolbar,
  bi,
  rhInput,
} from "@/components/rh/rh-ui";
import {
  buildBulletinHtml,
  slipToBulletin,
  type BulletinModel,
} from "@/components/rh/bulletin-print";
import { classTitle } from "@/components/rh/contract-salary-fields";
import { sortBySalaryClass } from "@/lib/hr/payroll-calc";
import {
  DEFAULT_BULLETIN_SETTINGS,
  tauxUnitSuffix,
  type BulletinLegalRates,
  type HrBulletinSettings,
} from "@/lib/hr/bulletin-settings";

type SiteOpt = { id: string; name_fr: string };
type View = "all" | "social" | "fiscal";

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

function printBulletins(models: BulletinModel[]) {
  printHtml(buildBulletinHtml(models, window.location.origin));
}

function money(n: number) {
  return new Intl.NumberFormat("fr-DZ", {
    maximumFractionDigits: 2,
  }).format(n);
}

function rubricColumns(slips: PayrollSlipRow[], hideZero: boolean) {
  const byCode = new Map<string, PayrollSlipLineRow>();
  for (const slip of slips) {
    for (const line of slip.lines ?? []) {
      if (hideZero && Math.abs(line.amount) === 0) continue;
      if (!byCode.has(line.code)) byCode.set(line.code, line);
    }
  }
  return sortBySalaryClass([...byCode.values()]);
}

function groupByClass(columns: PayrollSlipLineRow[]) {
  const groups: { category: "1" | "2" | "3" | "4"; cols: PayrollSlipLineRow[] }[] = [];
  for (const col of columns) {
    const category = (["1", "2", "3", "4"].includes(col.category)
      ? col.category
      : "1") as "1" | "2" | "3" | "4";
    const last = groups[groups.length - 1];
    if (last && last.category === category) last.cols.push(col);
    else groups.push({ category, cols: [col] });
  }
  return groups;
}

function lineForCode(lines: PayrollSlipLineRow[] | undefined, code: string) {
  return (lines ?? []).find((line) => line.code === code);
}

function BulletinPreview({
  models,
  onClose,
}: {
  models: BulletinModel[];
  onClose: () => void;
}) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const html = useMemo(
    () => buildBulletinHtml(models, typeof window !== "undefined" ? window.location.origin : ""),
    [models],
  );

  useEffect(() => {
    const frame = frameRef.current;
    const doc = frame?.contentDocument;
    if (!doc) return;
    doc.open();
    doc.write(html);
    doc.close();
  }, [html]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-950/45 p-2 backdrop-blur-[2px] sm:p-4">
      <div className="mx-auto flex h-full w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-border/60 bg-surface shadow-2xl shadow-slate-950/20">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 bg-gradient-to-b from-surface to-surface-muted/40 px-4 py-3">
          <h3 className="font-display text-lg font-semibold tracking-tight">
            {bi("Bulletin de Paie", "كشف الأجر")}
          </h3>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => printBulletins(models)}>
              {bi("Imprimer / PDF", "طباعة / PDF")}
            </Button>
            <Button variant="ghost" onClick={onClose}>
              {bi("Fermer", "إغلاق")}
            </Button>
          </div>
        </div>
        <iframe
          ref={frameRef}
          title="Bulletin de Paie"
          className="min-h-0 w-full flex-1 bg-white"
        />
      </div>
    </div>
  );
}

export function PayrollManager({
  initialSlips,
  sites,
  year,
  month,
  view = "all",
  bulletin = DEFAULT_BULLETIN_SETTINGS,
  legalRates = { ss_pct: null, pat_pct: null, caco_pct: null, intemp_sal_pct: null, intemp_pat_pct: null },
  loadError,
}: {
  initialSlips: PayrollSlipRow[];
  sites: readonly SiteOpt[];
  year: number;
  month: number;
  view?: View;
  bulletin?: HrBulletinSettings;
  legalRates?: BulletinLegalRates;
  loadError?: string;
}) {
  const [slips, setSlips] = useState(initialSlips);
  const [siteId, setSiteId] = useState(sites[0]?.id ?? "");
  const [periodYear, setPeriodYear] = useState(year);
  const [periodMonth, setPeriodMonth] = useState(month);
  const [error, setError] = useState<string | null>(loadError ?? null);
  const [info, setInfo] = useState<string | null>(null);
  const [preview, setPreview] = useState<BulletinModel[] | null>(null);
  const [pending, start] = useTransition();
  const itemCols = useMemo(
    () => rubricColumns(slips, bulletin.hide_zero_lines),
    [slips, bulletin.hide_zero_lines],
  );
  const classGroups = useMemo(() => groupByClass(itemCols), [itemCols]);
  const totalCols =
    1 +
    (view !== "fiscal" ? 2 : 0) +
    (view === "social" ? 5 : 0) +
    (view === "fiscal" ? 2 : 0) +
    itemCols.length +
    (view === "all" ? 1 : 0) +
    1;

  function openBulletin(rows: PayrollSlipRow[]) {
    setPreview(rows.map((s) => slipToBulletin(s, bulletin, legalRates)));
  }

  return (
    <div className="space-y-5">
      {preview ? (
        <BulletinPreview models={preview} onClose={() => setPreview(null)} />
      ) : null}
      <RhPageHeader
        title="Paie"
        description={
          <>
            Taux issus des variables légales (CNAS, IRG, CACOBATPH). Coefficient issu des légendes de présence.
            Rubriques (panier, hygiène…) depuis le dictionnaire et le contrat.
            Après modification du contrat, les bulletins brouillon se recalculent.
            <span className="mt-1 block" dir="rtl">
              النسب من المتغيرات القانونية (الضمان، الضريبة، كاكوباتف). المعامل من رموز الحضور. بنود الأجر (وجبة العامل، النظافة…)
              من القاموس والعقد. بعد تعديل العقد تُحدَّث كشوف المسودة.
            </span>
          </>
        }
        actions={
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["/rh/paie", "Fiches"],
                ["/rh/paie/social", "Social"],
                ["/rh/paie/fiscal", "Fiscal"],
                ["/rh/legal", bi("Cotisations & impôts", "الاشتراكات والضرائب")],
                ["/rh/paie/bulletins", "Bulletins"],
                ["/rh/paie/exceptions", bi("Exceptions", "استثناءات")],
                ["/rh/parametres", "Rubriques"],
              ] as const
            ).map(([href, label]) => (
              <Link
                key={href}
                href={href}
                className="inline-flex items-center rounded-xl border border-border/70 bg-surface px-3 py-1.5 text-xs font-semibold text-foreground/75 transition hover:border-brand/40 hover:bg-brand-muted hover:text-brand"
              >
                {label}
              </Link>
            ))}
          </div>
        }
      />
      {error ? (
        <RhAlert tone="danger">
          <span className="whitespace-pre-wrap">{error}</span>
        </RhAlert>
      ) : null}
      {info && !error ? (
        <RhAlert tone="success">
          <span className="whitespace-pre-wrap">{info}</span>
        </RhAlert>
      ) : null}
      <div className="flex flex-wrap gap-2 rounded-2xl border border-border/60 bg-surface/80 px-4 py-3 text-xs text-foreground/75 backdrop-blur-sm">
        <RhChip tone="brand">
          {bi("CNAS salarié", "ضمان العامل")} {legalRates.ss_pct ?? "—"}
          {bulletin.unit_percent}
        </RhChip>
        <RhChip tone="brand">
          {bi("CNAS employeur", "ضمان المؤسسة")} {legalRates.pat_pct ?? "—"}
          {bulletin.unit_percent}
        </RhChip>
        <RhChip>
          {bi("Congés CACOBATPH", "عطل كاكوباتف")} {legalRates.caco_pct ?? "—"}
          {bulletin.unit_percent}
        </RhChip>
        <RhChip>
          {bi("Intempéries", "انقطاعات الطقس")} {legalRates.intemp_sal_pct ?? "—"}
          {" / "}
          {legalRates.intemp_pat_pct ?? "—"}
          {bulletin.unit_percent}
        </RhChip>
        <RhChip tone="warning">
          IRG {bi("barème + règles", "السلم والقواعد")}
        </RhChip>
      </div>
      <RhToolbar>
        <RhField label={bi("Chantier", "الورشة")}>
          <select
            className={rhInput}
            value={siteId}
            onChange={(e) => setSiteId(e.target.value)}
          >
            {sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name_fr}
              </option>
            ))}
          </select>
        </RhField>
        <RhField label={bi("Année", "السنة")}>
          <input
            className={rhInput}
            type="number"
            value={periodYear}
            onChange={(e) => setPeriodYear(Number(e.target.value))}
          />
        </RhField>
        <RhField label={bi("Mois", "الشهر")}>
          <input
            className={rhInput}
            type="number"
            min={1}
            max={12}
            value={periodMonth}
            onChange={(e) => setPeriodMonth(Number(e.target.value))}
          />
        </RhField>
        <Button
          disabled={pending || !siteId}
          onClick={() => {
            setError(null);
            start(async () => {
              const r = await generatePayrollRun({
                period_year: periodYear,
                period_month: periodMonth,
                site_id: siteId,
              });
              if (!r.ok) {
                setError(r.error);
                return;
              }
              setInfo(
                [
                  bi(
                    `${r.data.count} bulletins générés (CNAS, IRG, CACOBATPH depuis les variables).`,
                    `${r.data.count} كشوف مولّدة (الضمان والضريبة وكاكوباتف من المتغيرات).`,
                  ),
                  ...(r.data.warnings ?? []),
                ].join("\n"),
              );
              window.location.assign(
                `${window.location.pathname}?year=${periodYear}&month=${periodMonth}`,
              );
            });
          }}
        >
          Générer
        </Button>
        {slips.length > 0 ? (
          <>
            <Button variant="secondary" onClick={() => openBulletin(slips)}>
              {bi("Afficher Bulletin de Paie", "إظهار كشف الأجر")}
            </Button>
            <Button
              variant="secondary"
              onClick={() =>
                printBulletins(slips.map((s) => slipToBulletin(s, bulletin, legalRates)))
              }
            >
              {bi("Imprimer les bulletins", "طباعة الكشوف")}
            </Button>
          </>
        ) : null}
      </RhToolbar>

      <RhTableWrap>
        <table className="min-w-full text-sm">
          <thead className="border-b border-border/70 bg-surface-muted/80 text-xs text-foreground/60">
            <tr>
              <th className="sticky left-0 z-10 bg-surface-muted/80 px-3.5 py-3 text-left" rowSpan={itemCols.length ? 2 : 1}>
                {bi("Employé", "العامل")}
              </th>
              {view !== "fiscal" ? (
                <>
                  <th className="px-3.5 py-3 text-left" rowSpan={itemCols.length ? 2 : 1}>
                    {bi("Jours", "الأيام")}
                  </th>
                  <th className="px-3.5 py-3 text-left" rowSpan={itemCols.length ? 2 : 1}>
                    {bi("Net", "الصافي")}
                  </th>
                </>
              ) : null}
              {view === "social" ? (
                <>
                  <th className="px-3.5 py-3 text-left" rowSpan={itemCols.length ? 2 : 1}>
                    {bi("SS salarié", "ضمان العامل")}
                  </th>
                  <th className="px-3.5 py-3 text-left" rowSpan={itemCols.length ? 2 : 1}>
                    {bi("SS employeur", "ضمان المؤسسة")}
                  </th>
                  <th className="px-3.5 py-3 text-left" rowSpan={itemCols.length ? 2 : 1}>
                    CACOBATPH
                  </th>
                  <th className="px-3.5 py-3 text-left" rowSpan={itemCols.length ? 2 : 1}>
                    {bi("Intemp. sal.", "طقس العامل")}
                  </th>
                  <th className="px-3.5 py-3 text-left" rowSpan={itemCols.length ? 2 : 1}>
                    {bi("Intemp. pat.", "طقس المؤسسة")}
                  </th>
                </>
              ) : null}
              {view === "fiscal" ? (
                <>
                  <th className="px-3.5 py-3 text-left" rowSpan={itemCols.length ? 2 : 1}>
                    {bi("Base IRG", "وعاء الضريبة")}
                  </th>
                  <th className="px-3.5 py-3 text-left" rowSpan={itemCols.length ? 2 : 1}>
                    IRG
                  </th>
                </>
              ) : null}
              {classGroups.map((group) => (
                <th
                  key={group.category}
                  className="border-l border-border px-3.5 py-3 text-center"
                  colSpan={group.cols.length}
                >
                  {classTitle(group.category)}
                </th>
              ))}
              {view === "all" ? (
                <th className="px-3.5 py-3 text-left" rowSpan={itemCols.length ? 2 : 1}>
                  Statut
                </th>
              ) : null}
              <th rowSpan={itemCols.length ? 2 : 1} />
            </tr>
            {itemCols.length ? (
              <tr>
                {itemCols.map((col) => (
                  <th key={col.code} className="whitespace-nowrap border-l border-border px-2 py-2 text-right font-normal">
                    <span className="block font-mono text-[11px]">{col.code}</span>
                    <span className="block max-w-[9rem] truncate" title={col.label_fr}>
                      {col.label_fr}
                    </span>
                    <span className="block text-[11px]">{tauxUnitSuffix(col.unit, bulletin).trim()}</span>
                  </th>
                ))}
              </tr>
            ) : null}
          </thead>
          <tbody>
            {slips.length === 0 ? (
              <tr>
                <td className="px-3.5 py-6 text-center text-foreground/55" colSpan={totalCols}>
                  {bi("Aucun bulletin pour cette période.", "لا توجد كشوف لهذه الفترة.")}
                </td>
              </tr>
            ) : (
              slips.map((s) => (
                <tr key={s.id} className="border-b border-border/60">
                  <td className="sticky left-0 z-10 bg-surface px-3.5 py-3">
                    <span className="font-mono text-xs">{s.matricule}</span>{" "}
                    {s.employee_name}
                    {view === "social" && !String(s.nss ?? "").trim() && s.employee_ss > 0 ? (
                      <span className="mt-0.5 block text-[11px] text-amber-700">
                        {bi("NSS manquant", "رقم الضمان ناقص")}
                      </span>
                    ) : null}
                  </td>
                  {view !== "fiscal" ? (
                    <>
                      <td className="px-3.5 py-3">{s.days_paid}</td>
                      <td className="whitespace-nowrap px-3.5 py-3">
                        {money(s.net_payable)}
                        {bulletin.unit_da}
                      </td>
                    </>
                  ) : null}
                  {view === "social" ? (
                    <>
                      <td className="whitespace-nowrap px-3.5 py-3">
                        {money(s.employee_ss)}
                        {bulletin.unit_da}
                      </td>
                      <td className="whitespace-nowrap px-3.5 py-3">
                        {money(s.employer_ss)}
                        {bulletin.unit_da}
                      </td>
                      <td className="whitespace-nowrap px-3.5 py-3">
                        {s.cacobatph ? `${money(s.cacobatph)}${bulletin.unit_da}` : ""}
                      </td>
                      <td className="whitespace-nowrap px-3.5 py-3">
                        {s.intemperies_employee
                          ? `${money(s.intemperies_employee)}${bulletin.unit_da}`
                          : ""}
                      </td>
                      <td className="whitespace-nowrap px-3.5 py-3">
                        {s.intemperies_employer
                          ? `${money(s.intemperies_employer)}${bulletin.unit_da}`
                          : ""}
                      </td>
                    </>
                  ) : null}
                  {view === "fiscal" ? (
                    <>
                      <td className="whitespace-nowrap px-3.5 py-3">
                        {money(s.irg_base)}
                        {bulletin.unit_da}
                      </td>
                      <td className="whitespace-nowrap px-3.5 py-3">
                        {money(s.irg_amount)}
                        {bulletin.unit_da}
                      </td>
                    </>
                  ) : null}
                  {itemCols.map((col) => {
                    const line = lineForCode(s.lines, col.code);
                    return (
                      <td key={col.code} className="whitespace-nowrap border-l border-border px-2 py-3 text-right font-mono text-xs">
                        {line ? `${money(line.amount)}${bulletin.unit_da}` : ""}
                      </td>
                    );
                  })}
                  {view === "all" ? (
                    <td className="px-3.5 py-3">{s.status_code}</td>
                  ) : null}
                  <td className="px-3.5 py-3">
                    <div className="flex flex-wrap gap-1">
                      {view === "all" && s.status_code !== "LOCKED" ? (
                        <Button
                          variant="secondary"
                          disabled={pending}
                          onClick={() => {
                            start(async () => {
                              const r = await lockPayrollSlip({ slip_id: s.id });
                              if (!r.ok) {
                                setError(r.error);
                                return;
                              }
                              setSlips((prev) =>
                                prev.map((x) =>
                                  x.id === s.id ? { ...x, status_code: "LOCKED" } : x,
                                ),
                              );
                            });
                          }}
                        >
                          Verrouiller
                        </Button>
                      ) : null}
                      <Button variant="secondary" onClick={() => openBulletin([s])}>
                        {bi("Bulletin de Paie", "كشف الأجر")}
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() =>
                          printBulletins([slipToBulletin(s, bulletin, legalRates)])
                        }
                      >
                        {bi("Imprimer", "طباعة")}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </RhTableWrap>
    </div>
  );
}
