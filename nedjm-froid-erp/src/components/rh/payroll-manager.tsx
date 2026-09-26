"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  closePayrollRun,
  generatePayrollRun,
  reopenPayrollRun,
  validatePayrollRun,
  type PayrollRunRow,
  type PayrollSlipLineRow,
  type PayrollSlipRow,
} from "@/lib/actions/hr-ops";
import { runStatusLabel, type PayrollRunAction } from "@/lib/hr/payroll-run-status";
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
  bulletinRatesFromVars,
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
  initialRuns = [],
  canValidate = false,
  canClose = false,
  sites,
  year,
  month,
  view = "all",
  bulletin = DEFAULT_BULLETIN_SETTINGS,
  legalRates = { ss_pct: null, pat_pct: null, caco_pct: null, intemp_sal_pct: null, intemp_pat_pct: null },
  loadError,
}: {
  initialSlips: PayrollSlipRow[];
  initialRuns?: PayrollRunRow[];
  canValidate?: boolean;
  canClose?: boolean;
  sites: readonly SiteOpt[];
  year: number;
  month: number;
  view?: View;
  bulletin?: HrBulletinSettings;
  legalRates?: BulletinLegalRates;
  loadError?: string;
}) {
  const [slips, setSlips] = useState(initialSlips);
  const [runs, setRuns] = useState(initialRuns);
  const [siteId, setSiteId] = useState(sites[0]?.id ?? "");
  const [periodYear, setPeriodYear] = useState(year);
  const [periodMonth, setPeriodMonth] = useState(month);
  const [error, setError] = useState<string | null>(loadError ?? null);
  const [info, setInfo] = useState<string | null>(null);
  const [preview, setPreview] = useState<BulletinModel[] | null>(null);
  const [pending, start] = useTransition();
  const currentRun = runs.find((r) => r.site_id === siteId) ?? null;
  const currentStatus = currentRun?.status_code ?? "DRAFT";
  const siteName = sites.find((s) => s.id === siteId)?.name_fr ?? "";
  const periodRates = slips[0] ? bulletinRatesFromVars(slips[0].legal_vars, bulletin) : legalRates;
  const declarationsProvisional = !runs.length || runs.some((r) => r.status_code === "DRAFT");
  const [exporting, setExporting] = useState(false);

  async function downloadDeclarations(query: string) {
    setError(null);
    setExporting(true);
    try {
      const res = await fetch(`/api/rh/declarations?${query}`);
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? `Export impossible (${res.status}).`);
        return;
      }
      const filename =
        /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? "declarations.xlsx";
      const url = URL.createObjectURL(await res.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      setError("Export impossible : connexion interrompue. · تعذّر التصدير.");
    } finally {
      setExporting(false);
    }
  }

  function transitionRun(action: PayrollRunAction) {
    if (!currentRun) return;
    if (
      action === "close" &&
      !window.confirm(
        `Clôturer définitivement la paie ${String(month).padStart(2, "0")}/${year} — ${siteName} ?\n` +
          "Bulletins et pointage du mois seront figés ; les corrections passeront en rappel le mois suivant.",
      )
    ) {
      return;
    }
    setError(null);
    setInfo(null);
    const runId = currentRun.id;
    const run =
      action === "validate" ? validatePayrollRun : action === "reopen" ? reopenPayrollRun : closePayrollRun;
    start(async () => {
      const r = await run({ run_id: runId });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      const next = r.data.status_code;
      const from = action === "validate" ? "DRAFT" : "VALIDATED";
      setRuns((prev) => prev.map((x) => (x.id === runId ? { ...x, status_code: next } : x)));
      setSlips((prev) =>
        prev.map((s) => (s.run_id === runId && s.status_code === from ? { ...s, status_code: next } : s)),
      );
      setInfo(
        action === "validate"
          ? "Paie validée : bulletins et pointage du mois figés (réouverture possible)."
          : action === "reopen"
            ? "Paie réouverte : pointage et bulletins de nouveau modifiables."
            : "Paie clôturée définitivement.",
      );
    });
  }
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

  function toBulletin(s: PayrollSlipRow) {
    return slipToBulletin(s, bulletin, bulletinRatesFromVars(s.legal_vars, bulletin));
  }

  function openBulletin(rows: PayrollSlipRow[]) {
    setPreview(rows.map(toBulletin));
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
          {bi("CNAS salarié", "ضمان العامل")} {periodRates.ss_pct ?? "—"}
          {bulletin.unit_percent}
        </RhChip>
        <RhChip tone="brand">
          {bi("CNAS employeur", "ضمان المؤسسة")} {periodRates.pat_pct ?? "—"}
          {bulletin.unit_percent}
        </RhChip>
        <RhChip>
          {bi("Congés CACOBATPH", "عطل كاكوباتف")} {periodRates.caco_pct ?? "—"}
          {bulletin.unit_percent}
        </RhChip>
        <RhChip>
          {bi("Intempéries", "انقطاعات الطقس")} {periodRates.intemp_sal_pct ?? "—"}
          {" / "}
          {periodRates.intemp_pat_pct ?? "—"}
          {bulletin.unit_percent}
        </RhChip>
        <RhChip tone="warning">
          IRG {bi("barème + règles", "السلم والقواعد")}
        </RhChip>
      </div>
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border/60 bg-surface px-4 py-3 text-sm">
        <span className="font-semibold">
          Paie {String(month).padStart(2, "0")}/{year}
          {siteName ? ` · ${siteName}` : ""}
        </span>
        {currentRun ? (
          <>
            <RhChip
              tone={
                currentStatus === "LOCKED" ? "danger" : currentStatus === "VALIDATED" ? "success" : "neutral"
              }
            >
              {runStatusLabel(currentStatus).fr}
            </RhChip>
            <span className="text-xs text-foreground/60">{currentRun.slip_count} bulletin(s)</span>
            <div className="ml-auto flex flex-wrap gap-2">
              {currentStatus === "DRAFT" && canValidate ? (
                <Button
                  variant="secondary"
                  disabled={pending || currentRun.slip_count === 0}
                  onClick={() => transitionRun("validate")}
                >
                  Valider la paie
                </Button>
              ) : null}
              {currentStatus === "VALIDATED" && canValidate ? (
                <Button variant="ghost" disabled={pending} onClick={() => transitionRun("reopen")}>
                  Réouvrir
                </Button>
              ) : null}
              {currentStatus === "VALIDATED" && canClose ? (
                <Button disabled={pending} onClick={() => transitionRun("close")}>
                  Clôturer le mois
                </Button>
              ) : null}
            </div>
          </>
        ) : (
          <span className="text-xs text-foreground/60">Pas encore générée pour ce chantier.</span>
        )}
      </div>
      {canValidate ? (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border/60 bg-surface px-4 py-3 text-sm">
          <span className="font-semibold">{bi("Déclarations", "التصريحات")}</span>
          {declarationsProvisional ? (
            <RhChip tone="warning">{bi("Provisoire : paie non validée", "مؤقت: الأجور غير معتمدة")}</RhChip>
          ) : (
            <RhChip tone="success">{bi("Paie validée", "الأجور معتمدة")}</RhChip>
          )}
          <div className="ml-auto flex flex-wrap gap-2">
            <Button
              disabled={exporting}
              onClick={() => downloadDeclarations(`kind=monthly&year=${year}&month=${month}`)}
            >
              {bi("CNAS · G50 · CACOBATPH · Virements (Excel)", "تصدير الشهر")}
            </Button>
            {siteId ? (
              <Button
                variant="secondary"
                disabled={exporting}
                onClick={() => downloadDeclarations(`kind=monthly&year=${year}&month=${month}&site=${siteId}`)}
              >
                {bi("Ce chantier seulement", "هذه الورشة فقط")}
              </Button>
            ) : null}
            <Button
              variant="secondary"
              disabled={exporting}
              onClick={() => downloadDeclarations(`kind=das&year=${year}`)}
            >
              {bi(`DAS annuelle ${year}`, `التصريح السنوي ${year}`)}
            </Button>
          </div>
        </div>
      ) : null}
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
          disabled={
            pending ||
            !siteId ||
            (periodYear === year && periodMonth === month && currentStatus !== "DRAFT")
          }
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
                printBulletins(slips.map(toBulletin))
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
                      <Button variant="secondary" onClick={() => openBulletin([s])}>
                        {bi("Bulletin de Paie", "كشف الأجر")}
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() =>
                          printBulletins([toBulletin(s)])
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
