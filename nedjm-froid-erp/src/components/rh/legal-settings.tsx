"use client";

import { Fragment, useMemo, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  addLegalVarVersion,
  cancelCnasRegimeRates,
  cancelLegalVarVersion,
  createContribution,
  deleteCnasRegime,
  deleteContribution,
  saveCnasRegime,
  saveContribution,
  stopContribution,
  type CnasRegimeRow,
  type ContributionSettings,
  type LegalPeriod,
  type LegalRateVersion,
  type LegalVarRow,
  type LegalVarVersion,
} from "@/lib/actions/hr-legal-vars";
import type { ContributionGroup } from "@/lib/hr/compliance-keys";
import { IrgBaremeManager } from "@/components/rh/irg-bareme-manager";
import type { IrgCatalog } from "@/lib/actions/hr-irg";
import { Button } from "@/components/ui/button";
import {
  RhAlert,
  RhChip,
  RhField,
  RhPageHeader,
  RhPanel,
  RhTableWrap,
  RhTabs,
  bi,
  rhInput,
  rhSelect,
  rhTd,
  rhTh,
} from "@/components/rh/rh-ui";

type Section = "cnas" | "cacobatph" | "irg" | "other";

/** Fraction → percent with up to 4 decimals (0.00375 → 0.375). */
function toPct(n: number) {
  return Math.round(n * 1_000_000) / 10_000;
}

function pctText(n: number | null) {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${String(toPct(n)).replace(".", ",")} %`;
}

function numText(n: number | null, unit: string | null) {
  if (n == null || !Number.isFinite(n)) return "—";
  const v = new Intl.NumberFormat("fr-DZ", { maximumFractionDigits: 4 }).format(n);
  return unit ? `${v} ${unit}` : v;
}

function plainPct(n: number | null) {
  return n == null ? "" : String(n).replace(".", ",");
}

function dateText(iso: string | null) {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

const MONTH_FMT = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" });

function monthText(iso: string | null) {
  if (!iso) return "—";
  return MONTH_FMT.format(new Date(`${iso.slice(0, 7)}-01T00:00:00Z`));
}

function prevMonthIso(iso: string) {
  const [y, m] = iso.slice(0, 7).split("-").map(Number);
  return new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 10);
}

/** First payroll month using a value dated `iso` (payroll reads the value in force on the 1st). */
function payrollMonthOf(iso: string) {
  if (iso.slice(8, 10) === "01") return iso;
  const [y, m] = iso.slice(0, 7).split("-").map(Number);
  return new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
}

function parseNumber(raw: string) {
  const s = raw.trim().replace(/[\s%]/g, "").replace(",", ".");
  if (!s) return null;
  const v = Number(s);
  return Number.isFinite(v) ? v : null;
}

/** "R 10" → "R_10": codes accept A-Z, 0-9 and _ only. */
function codeInput(raw: string) {
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+/, "")
    .slice(0, 30);
}

function fallbackPeriod(): LegalPeriod {
  const month = `${new Date().toISOString().slice(0, 7)}-01`;
  return { open_from: null, month_start: month, default_from: month };
}

const canChangeFrom = (period: LegalPeriod, from: string) => !period.open_from || from >= period.open_from;

function useLegalAction() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  function run(action: () => Promise<{ ok: true } | { ok: false; error: string }>, success: string, after?: () => void) {
    setError(null);
    setInfo(null);
    start(async () => {
      const result = await action();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setInfo(success);
      after?.();
      router.refresh();
    });
  }
  return { pending, error, info, setError, setInfo, run };
}

function Feedback({ error, info }: { error: string | null; info: string | null }) {
  if (!error && !info) return null;
  return (
    <div className="mt-3">
      {error ? <RhAlert tone="danger">{error}</RhAlert> : <RhAlert tone="success">{info}</RhAlert>}
    </div>
  );
}

function QuickDialog({
  title,
  subtitle,
  children,
  footer,
  onClose,
}: {
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
  footer: ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-3 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="flex max-h-[92dvh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-border/60 bg-surface shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-border/50 px-5 py-3">
          <div>
            <h3 className="text-base font-semibold">{title}</h3>
            {subtitle ? <div className="mt-0.5 text-xs text-foreground/55">{subtitle}</div> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="rounded-lg px-2 py-1 text-foreground/55 hover:bg-surface-muted"
          >
            ✕
          </button>
        </div>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">{children}</div>
        <div className="flex flex-wrap justify-end gap-2 border-t border-border/50 px-5 py-3">{footer}</div>
      </div>
    </div>
  );
}

function MonthField({
  label,
  value,
  period,
  onChange,
}: {
  label: string;
  value: string;
  period: LegalPeriod;
  onChange: (iso: string) => void;
}) {
  return (
    <RhField
      label={label}
      required
      hint={
        period.open_from
          ? `Au plus tôt ${monthText(period.open_from)} : les paies validées ou clôturées ne changent jamais.`
          : "S'applique à la paie de ce mois et des mois suivants."
      }
    >
      <input
        className={rhInput}
        type="month"
        value={value.slice(0, 7)}
        min={period.open_from?.slice(0, 7)}
        onChange={(e) => onChange(e.target.value ? `${e.target.value}-01` : "")}
      />
    </RhField>
  );
}

function PeriodBanner({ period }: { period: LegalPeriod }) {
  return (
    <RhAlert tone="info">
      {period.open_from ? (
        <>
          Paies validées ou clôturées jusqu&apos;à <b>{monthText(prevMonthIso(period.open_from))}</b> : leurs montants
          ne changent jamais. Toute modification s&apos;applique au plus tôt à partir de{" "}
          <b>{monthText(period.open_from)}</b>.
        </>
      ) : (
        <>
          Chaque modification s&apos;applique à partir du mois choisi, sans toucher aux mois précédents. Dès qu&apos;une
          paie est validée, ses montants et les taux de ce mois sont figés.
        </>
      )}
    </RhAlert>
  );
}

const PART_SHORT = { EMPLOYEE: "Salariale", EMPLOYER: "Patronale" } as const;
const PART_LABEL = { EMPLOYEE: "Part salariale (retenue)", EMPLOYER: "Part patronale (charge)" } as const;
const BASE_SHORT = { COTISABLE: "brut cotisable", TAXABLE: "brut imposable" } as const;
const SCOPE_LABEL = {
  ALL: "Tous les salariés",
  CACOBATPH_CONGES: "Salariés assujettis CACOBATPH congés",
  CACOBATPH_INTEMPERIES: "Salariés assujettis intempéries",
} as const;
const LEGAL_PART: Record<string, keyof typeof PART_SHORT> = {
  CNAS_EMPLOYEE: "EMPLOYEE",
  CNAS_EMPLOYER_BASE: "EMPLOYER",
  CNAS_FOS: "EMPLOYER",
  CACOBATPH_CONGES: "EMPLOYER",
  CACOBATPH_INTEMPERIES_SAL: "EMPLOYEE",
  CACOBATPH_INTEMPERIES_EMP: "EMPLOYER",
};

function settingsText(s: ContributionSettings | null, group: ContributionGroup | "other") {
  if (!s) return "";
  return [
    PART_SHORT[s.part],
    BASE_SHORT[s.base],
    s.reduces_irg ? "déductible IRG" : null,
    group === "cacobatph" ? SCOPE_LABEL[s.scope].toLowerCase() : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

function sameSettings(a: ContributionSettings | null, b: ContributionSettings) {
  return (
    !!a && a.part === b.part && a.base === b.base && a.reduces_irg === b.reduces_irg && a.scope === b.scope
  );
}

function lastValue(row: LegalVarRow) {
  return row.current_numeric ?? row.planned[0]?.value ?? row.history[0]?.value ?? null;
}

function RubriquesPanel({
  title,
  subtitle,
  group,
  rows,
  canEdit,
  asPercent,
  allowCustom,
  period,
}: {
  title: string;
  subtitle?: ReactNode;
  group: ContributionGroup | "other";
  rows: LegalVarRow[];
  canEdit: boolean;
  asPercent: boolean;
  allowCustom: boolean;
  period: LegalPeriod;
}) {
  const { pending, error, info, run } = useLegalAction();
  const [dialog, setDialog] = useState<
    { kind: "create" } | { kind: "edit"; row: LegalVarRow } | { kind: "stop"; row: LegalVarRow } | null
  >(null);
  const [openHistory, setOpenHistory] = useState<string | null>(null);
  const show = (v: number | null, row: LegalVarRow) => (asPercent ? pctText(v) : numText(v, row.unit));
  const colCount = canEdit ? 5 : 4;

  function cancelPlanned(row: LegalVarRow, v: LegalVarVersion) {
    const month = monthText(payrollMonthOf(v.effective_from));
    if (!window.confirm(`Annuler la valeur prévue dès ${month} (« ${row.label_fr} ») ?`)) return;
    run(() => cancelLegalVarVersion({ version_id: v.id }), `Valeur prévue dès ${month} annulée.`);
  }

  function remove(row: LegalVarRow) {
    if (!window.confirm(`Supprimer définitivement « ${row.label_fr} » ? Elle n'a encore été appliquée à aucune paie.`)) {
      return;
    }
    run(() => deleteContribution({ var_id: row.id }), `« ${row.label_fr} » supprimée.`);
  }

  return (
    <RhPanel>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold">{title}</h3>
          {subtitle ? <div className="mt-1 text-xs text-foreground/55">{subtitle}</div> : null}
        </div>
        {canEdit && allowCustom && group !== "other" ? (
          <Button onClick={() => setDialog({ kind: "create" })}>+ {bi("Ajouter une rubrique", "إضافة بند")}</Button>
        ) : null}
      </div>
      <Feedback error={error} info={info} />
      <div className="mt-3">
        <RhTableWrap>
          <table className="min-w-full text-sm">
            <thead className="border-b border-border/70 bg-surface-muted/80">
              <tr>
                <th className={rhTh()}>{bi("Rubrique", "البند")}</th>
                <th className={rhTh()}>{bi("Part", "الجزء")}</th>
                <th className={rhTh()}>
                  {asPercent ? "Taux" : "Valeur"} · paie de {monthText(period.month_start)}
                </th>
                <th className={rhTh()}>{bi("À venir", "القادم")}</th>
                {canEdit ? <th className={rhTh()} /> : null}
              </tr>
            </thead>
            <tbody>
              {!rows.length ? (
                <tr>
                  <td className={`${rhTd()} text-foreground/55`} colSpan={colCount}>
                    Aucune rubrique.
                  </td>
                </tr>
              ) : null}
              {rows.map((row) => {
                const historyOpen = openHistory === row.id;
                const custom = row.contribution != null;
                const part = row.contribution?.part ?? LEGAL_PART[row.key];
                const stopFuture = row.stops_from && row.stops_from > period.month_start ? row.stops_from : null;
                return (
                  <Fragment key={row.id}>
                    <tr className="border-b border-border/60 align-top">
                      <td className={rhTd()}>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-medium">{row.label_fr}</span>
                          {custom ? <RhChip tone="brand">Ajoutée</RhChip> : <RhChip>Légale</RhChip>}
                          {row.contribution?.code ? <RhChip>Code {row.contribution.code}</RhChip> : null}
                          {row.status === "stopped" ? (
                            <RhChip tone="danger">Arrêtée depuis {monthText(row.stops_from)}</RhChip>
                          ) : null}
                          {row.status === "planned" ? (
                            <RhChip tone="warning">
                              Démarre en {monthText(row.planned[0] ? payrollMonthOf(row.planned[0].effective_from) : null)}
                            </RhChip>
                          ) : null}
                        </div>
                        {row.label_ar ? (
                          <span className="mt-0.5 block text-xs text-foreground/55" dir="rtl">
                            {row.label_ar}
                          </span>
                        ) : null}
                        {row.contribution ? (
                          <span className="mt-0.5 block text-xs text-foreground/55">
                            Assiette : {BASE_SHORT[row.contribution.base]}
                            {row.contribution.reduces_irg ? " · déductible IRG" : ""}
                            {group === "cacobatph" ? ` · ${SCOPE_LABEL[row.contribution.scope].toLowerCase()}` : ""}
                          </span>
                        ) : null}
                      </td>
                      <td className={`${rhTd()} whitespace-nowrap`}>{part ? PART_SHORT[part] : "—"}</td>
                      <td className={`${rhTd()} whitespace-nowrap`}>
                        <span className="font-semibold tabular-nums">{show(row.current_numeric, row)}</span>
                        <span className="mt-0.5 block text-xs text-foreground/55">
                          {row.effective_from ? `depuis le ${dateText(row.effective_from)}` : "non calculée"}
                        </span>
                        {row.history.length ? (
                          <button
                            type="button"
                            className="mt-1 text-xs text-brand hover:underline"
                            onClick={() => setOpenHistory(historyOpen ? null : row.id)}
                          >
                            {historyOpen ? "Masquer l'historique" : `Historique (${row.history.length})`}
                          </button>
                        ) : null}
                      </td>
                      <td className={rhTd()}>
                        {row.planned.length || stopFuture ? (
                          <ul className="space-y-1">
                            {row.planned.map((p) => (
                              <li key={p.id} className="flex flex-wrap items-center gap-2">
                                <RhChip tone="warning">
                                  {show(p.value, row)} dès {monthText(payrollMonthOf(p.effective_from))}
                                </RhChip>
                                {custom && p.contribution && !sameSettings(row.contribution, p.contribution) ? (
                                  <span className="text-xs text-foreground/55">
                                    {settingsText(p.contribution, group)}
                                  </span>
                                ) : null}
                                {canEdit && canChangeFrom(period, p.effective_from) ? (
                                  <button
                                    type="button"
                                    disabled={pending}
                                    className="text-xs text-red-700 hover:underline disabled:opacity-50"
                                    onClick={() => cancelPlanned(row, p)}
                                  >
                                    Annuler
                                  </button>
                                ) : null}
                              </li>
                            ))}
                            {stopFuture && row.status !== "stopped" ? (
                              <li>
                                <RhChip tone="danger">Arrêt dès {monthText(stopFuture)}</RhChip>
                              </li>
                            ) : null}
                          </ul>
                        ) : (
                          <span className="text-foreground/40">—</span>
                        )}
                      </td>
                      {canEdit ? (
                        <td className={`${rhTd()} whitespace-nowrap`}>
                          <div className="flex flex-wrap justify-end gap-1">
                            <Button variant="secondary" disabled={pending} onClick={() => setDialog({ kind: "edit", row })}>
                              Modifier
                            </Button>
                            <Button
                              variant="ghost"
                              className="text-red-700"
                              disabled={pending || !custom || (row.status === "stopped" && !row.deletable)}
                              title={
                                !custom
                                  ? "Taux légal obligatoire : modifiable, non supprimable."
                                  : row.status === "stopped" && !row.deletable
                                    ? "Déjà arrêtée."
                                    : undefined
                              }
                              onClick={() => (row.deletable ? remove(row) : setDialog({ kind: "stop", row }))}
                            >
                              Supprimer
                            </Button>
                          </div>
                        </td>
                      ) : null}
                    </tr>
                    {historyOpen ? (
                      <tr className="border-b border-border/60 bg-surface-muted/40">
                        <td className={rhTd()} colSpan={colCount}>
                          <ul className="space-y-1 text-xs">
                            {row.history.map((h) => (
                              <li key={h.id} className="tabular-nums">
                                <b>{show(h.value, row)}</b> · du {dateText(h.effective_from)}
                                {h.effective_to ? ` au ${dateText(h.effective_to)}` : " (sans fin)"}
                                {h.contribution ? ` · ${settingsText(h.contribution, group)}` : ""}
                                {period.open_from && h.effective_from < period.open_from ? (
                                  <span className="ml-1 text-foreground/45">· période validée, figée</span>
                                ) : null}
                              </li>
                            ))}
                          </ul>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </RhTableWrap>
      </div>
      {!canEdit ? (
        <p className="mt-3 text-xs text-foreground/55">
          {bi(
            "Lecture seule : modification réservée à SUPER_ADMIN, ADMIN_RH et ADMIN_FINANCE (unité 05).",
            "للاطلاع فقط: التعديل محصور في SUPER_ADMIN و ADMIN_RH و ADMIN_FINANCE (الوحدة 05).",
          )}
        </p>
      ) : null}

      {dialog?.kind === "create" && group !== "other" ? (
        <ContributionDialog group={group} row={null} period={period} onClose={() => setDialog(null)} />
      ) : null}
      {dialog?.kind === "edit" && dialog.row.contribution && group !== "other" ? (
        <ContributionDialog group={group} row={dialog.row} period={period} onClose={() => setDialog(null)} />
      ) : null}
      {dialog?.kind === "edit" && !dialog.row.contribution ? (
        <ValueDialog row={dialog.row} asPercent={asPercent} period={period} onClose={() => setDialog(null)} />
      ) : null}
      {dialog?.kind === "stop" ? <StopDialog row={dialog.row} period={period} onClose={() => setDialog(null)} /> : null}
    </RhPanel>
  );
}

function ValueDialog({
  row,
  asPercent,
  period,
  onClose,
}: {
  row: LegalVarRow;
  asPercent: boolean;
  period: LegalPeriod;
  onClose: () => void;
}) {
  const { pending, error, setError, run } = useLegalAction();
  const current = lastValue(row);
  const [value, setValue] = useState(
    current == null ? "" : String(asPercent ? toPct(current) : current).replace(".", ","),
  );
  const [from, setFrom] = useState(period.default_from);

  function submit() {
    const v = parseNumber(value);
    if (v == null) return setError("Saisissez une valeur numérique.");
    if (!from) return setError("Choisissez le mois d'effet.");
    run(
      () =>
        addLegalVarVersion(
          asPercent
            ? { var_id: row.id, effective_from: from, value_pct: v, as_percent: true }
            : { var_id: row.id, effective_from: from, value_numeric: v, as_percent: false },
        ),
      `${row.label_fr} : ${String(v).replace(".", ",")}${asPercent ? " %" : ""} à partir de ${monthText(from)}.`,
      onClose,
    );
  }

  return (
    <QuickDialog
      title={`Modifier — ${row.label_fr}`}
      subtitle={`Valeur actuelle : ${asPercent ? pctText(row.current_numeric) : numText(row.current_numeric, row.unit)}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" disabled={pending} onClick={onClose}>
            Fermer
          </Button>
          <Button disabled={pending} onClick={submit}>
            {bi("Enregistrer", "حفظ")}
          </Button>
        </>
      }
    >
      {error ? <RhAlert tone="danger">{error}</RhAlert> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <RhField label={asPercent ? "Nouveau taux (%)" : "Nouvelle valeur"} required>
          <input className={rhInput} inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} />
        </RhField>
        <MonthField label="À partir de la paie de" value={from} period={period} onChange={setFrom} />
      </div>
      <p className="text-xs text-foreground/55">
        Les paies des mois précédents gardent l&apos;ancienne valeur. Enregistrer deux fois le même mois remplace la
        valeur prévue pour ce mois.
      </p>
    </QuickDialog>
  );
}

type ContributionForm = {
  label_fr: string;
  label_ar: string;
  code: string;
  sort_order: string;
  part: "EMPLOYEE" | "EMPLOYER";
  base: "COTISABLE" | "TAXABLE";
  reduces_irg: boolean;
  scope: "ALL" | "CACOBATPH_CONGES" | "CACOBATPH_INTEMPERIES";
  value_pct: string;
  effective_from: string;
  resume: boolean;
};

function ContributionDialog({
  group,
  row,
  period,
  onClose,
}: {
  group: ContributionGroup;
  row: LegalVarRow | null;
  period: LegalPeriod;
  onClose: () => void;
}) {
  const { pending, error, setError, run } = useLegalAction();
  const current = row ? lastValue(row) : null;
  const initial: ContributionForm = row?.contribution
    ? {
        label_fr: row.label_fr,
        label_ar: row.label_ar ?? "",
        code: row.contribution.code,
        sort_order: String(row.sort_order),
        part: row.contribution.part,
        base: row.contribution.base,
        reduces_irg: row.contribution.reduces_irg,
        scope: row.contribution.scope,
        value_pct: current == null ? "" : String(toPct(current)).replace(".", ","),
        effective_from: period.default_from,
        resume: false,
      }
    : {
        label_fr: "",
        label_ar: "",
        code: "",
        sort_order: "0",
        part: "EMPLOYEE",
        base: group === "irg" ? "TAXABLE" : "COTISABLE",
        reduces_irg: false,
        scope: group === "cacobatph" ? "CACOBATPH_CONGES" : "ALL",
        value_pct: "",
        effective_from: period.default_from,
        resume: false,
      };
  const [form, setForm] = useState<ContributionForm>(initial);
  const set = <K extends keyof ContributionForm>(k: K, v: ContributionForm[K]) => setForm((f) => ({ ...f, [k]: v }));
  const stopped = row?.status === "stopped";

  const settings: ContributionSettings = {
    part: form.part,
    base: form.base,
    reduces_irg: form.part === "EMPLOYEE" && form.reduces_irg,
    scope: form.scope,
  };
  const pct = parseNumber(form.value_pct);
  const calcChanged = row
    ? stopped
      ? form.resume
      : pct !== parseNumber(initial.value_pct) || !sameSettings(row.contribution, settings)
    : true;

  function submit() {
    const display = {
      label_fr: form.label_fr,
      label_ar: form.label_ar || null,
      code: form.code || null,
      sort_order: Number(form.sort_order) || 0,
    };
    if (calcChanged) {
      if (pct == null || pct <= 0) return setError("Saisissez un taux supérieur à 0 %.");
      if (!form.effective_from) return setError("Choisissez le mois d'effet.");
    }
    if (!row) {
      run(
        () =>
          createContribution({
            group,
            display,
            settings,
            value_pct: pct,
            effective_from: form.effective_from,
          }),
        `« ${form.label_fr} » ajoutée : calculée à partir de la paie de ${monthText(form.effective_from)}.`,
        onClose,
      );
      return;
    }
    run(
      () =>
        saveContribution({
          var_id: row.id,
          display,
          change: calcChanged ? { settings, value_pct: pct, effective_from: form.effective_from } : null,
        }),
      calcChanged
        ? `« ${form.label_fr} » : nouveau calcul à partir de la paie de ${monthText(form.effective_from)}.`
        : `« ${form.label_fr} » : libellés mis à jour.`,
      onClose,
    );
  }

  const summary =
    pct != null && pct > 0
      ? `${form.part === "EMPLOYEE" ? "Retenue sur salaire" : "Charge employeur"} de ${String(pct).replace(".", ",")} % du ${
          BASE_SHORT[form.base]
        }${settings.reduces_irg ? ", déduite de l'assiette IRG" : ""}, à partir de la paie de ${monthText(
          form.effective_from,
        )}.`
      : null;

  const calcFields = (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <RhField label="Part" required>
          <select className={rhSelect} value={form.part} onChange={(e) => set("part", e.target.value as ContributionForm["part"])}>
            <option value="EMPLOYEE">{PART_LABEL.EMPLOYEE}</option>
            <option value="EMPLOYER">{PART_LABEL.EMPLOYER}</option>
          </select>
        </RhField>
        <RhField label="Taux (%)" required>
          <input
            className={rhInput}
            inputMode="decimal"
            value={form.value_pct}
            placeholder="ex. 0,5"
            onChange={(e) => set("value_pct", e.target.value)}
          />
        </RhField>
        {group === "cacobatph" ? (
          <RhField label="Salariés concernés">
            <select
              className={rhSelect}
              value={form.scope}
              onChange={(e) => set("scope", e.target.value as ContributionForm["scope"])}
            >
              <option value="CACOBATPH_CONGES">{SCOPE_LABEL.CACOBATPH_CONGES}</option>
              <option value="CACOBATPH_INTEMPERIES">{SCOPE_LABEL.CACOBATPH_INTEMPERIES}</option>
            </select>
          </RhField>
        ) : null}
        <MonthField
          label="À partir de la paie de"
          value={form.effective_from}
          period={period}
          onChange={(v) => set("effective_from", v)}
        />
      </div>
      <details className="rounded-xl border border-border/60 px-3 py-2">
        <summary className="cursor-pointer text-sm font-medium">Options avancées</summary>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <RhField label="Assiette">
            <select className={rhSelect} value={form.base} onChange={(e) => set("base", e.target.value as ContributionForm["base"])}>
              <option value="COTISABLE">Brut cotisable (comme la CNAS)</option>
              <option value="TAXABLE">Brut imposable (comme l&apos;IRG)</option>
            </select>
          </RhField>
          {form.part === "EMPLOYEE" ? (
            <label className="flex items-center gap-2 self-end pb-2 text-sm">
              <input type="checkbox" checked={form.reduces_irg} onChange={(e) => set("reduces_irg", e.target.checked)} />
              Déductible de l&apos;assiette IRG
            </label>
          ) : null}
        </div>
      </details>
    </>
  );

  return (
    <QuickDialog
      title={row ? `Modifier — ${row.label_fr}` : "Nouvelle rubrique"}
      subtitle={
        group === "cnas" ? "Onglet CNAS" : group === "cacobatph" ? "Onglet CACOBATPH" : "Onglet Impôts (IRG)"
      }
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" disabled={pending} onClick={onClose}>
            Fermer
          </Button>
          <Button disabled={pending || form.label_fr.trim().length < 2} onClick={submit}>
            {row ? bi("Enregistrer", "حفظ") : bi("Ajouter", "إضافة")}
          </Button>
        </>
      }
    >
      {error ? <RhAlert tone="danger">{error}</RhAlert> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <RhField label="Libellé (FR)" required>
          <input
            className={rhInput}
            value={form.label_fr}
            placeholder="ex. Retraite complémentaire"
            onChange={(e) => set("label_fr", e.target.value)}
          />
        </RhField>
        <RhField label="Libellé (AR)">
          <input className={rhInput} dir="rtl" value={form.label_ar} onChange={(e) => set("label_ar", e.target.value)} />
        </RhField>
        <RhField label="Code sur le bulletin" hint="Vide = code technique">
          <input
            className={rhInput}
            value={form.code}
            maxLength={12}
            placeholder="ex. 992"
            onChange={(e) => set("code", e.target.value)}
          />
        </RhField>
        <RhField label="Ordre d'affichage">
          <input
            className={rhInput}
            inputMode="numeric"
            value={form.sort_order}
            onChange={(e) => set("sort_order", e.target.value)}
          />
        </RhField>
      </div>
      {row ? (
        <p className="text-xs text-foreground/55">
          Libellés et code : mis à jour tout de suite pour les prochaines paies ; les bulletins déjà générés gardent
          leur texte.
        </p>
      ) : null}

      {stopped ? (
        <label className="flex items-center gap-2 rounded-xl border border-border/60 px-3 py-2 text-sm">
          <input type="checkbox" checked={form.resume} onChange={(e) => set("resume", e.target.checked)} />
          Reprendre le calcul (arrêtée depuis {monthText(row?.stops_from ?? null)})
        </label>
      ) : null}
      {!stopped || form.resume ? (
        <div className="space-y-3 rounded-xl border border-brand/20 bg-brand-muted/10 p-3">
          <p className="text-sm font-medium">Calcul sur le bulletin</p>
          {calcFields}
          {summary && calcChanged ? <p className="text-xs text-foreground/70">{summary}</p> : null}
          {row && !calcChanged ? (
            <p className="text-xs text-foreground/55">Aucun changement de calcul.</p>
          ) : null}
        </div>
      ) : null}
    </QuickDialog>
  );
}

function StopDialog({ row, period, onClose }: { row: LegalVarRow; period: LegalPeriod; onClose: () => void }) {
  const { pending, error, setError, run } = useLegalAction();
  const [from, setFrom] = useState(period.default_from);

  function submit() {
    if (!from) return setError("Choisissez le mois d'arrêt.");
    run(
      () => stopContribution({ var_id: row.id, effective_from: from }),
      `« ${row.label_fr} » retirée à partir de la paie de ${monthText(from)}.`,
      onClose,
    );
  }

  return (
    <QuickDialog
      title={`Supprimer — ${row.label_fr}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" disabled={pending} onClick={onClose}>
            Fermer
          </Button>
          <Button variant="danger" disabled={pending} onClick={submit}>
            Supprimer
          </Button>
        </>
      }
    >
      {error ? <RhAlert tone="danger">{error}</RhAlert> : null}
      <RhAlert tone="warning">
        Cette cotisation a déjà été appliquée : elle est retirée des paies à partir du mois choisi, et les paies
        précédentes la gardent avec leurs montants.
      </RhAlert>
      <MonthField label="Retirer à partir de la paie de" value={from} period={period} onChange={setFrom} />
      <p className="text-xs text-foreground/55">Vous pourrez la reprendre plus tard (Modifier → Reprendre le calcul).</p>
    </QuickDialog>
  );
}

function regimeRatesText(v: { employee_pct: number | null; employer_pct: number | null; fos_pct: number | null }) {
  const one = (n: number | null) => (n == null ? "légal" : `${plainPct(n)} %`);
  return `${one(v.employee_pct)} / ${one(v.employer_pct)} / ${one(v.fos_pct)}`;
}

function RegimesPanel({
  regimes,
  canEdit,
  legal,
  period,
}: {
  regimes: CnasRegimeRow[];
  canEdit: boolean;
  legal: { employee: number | null; employer: number | null; fos: number | null };
  period: LegalPeriod;
}) {
  const { pending, error, info, run } = useLegalAction();
  const [dialog, setDialog] = useState<{ regime: CnasRegimeRow | null } | null>(null);
  const [openHistory, setOpenHistory] = useState<string | null>(null);
  const colCount = canEdit ? 8 : 7;

  const cell = (v: number | null, legalValue: number | null) =>
    v != null ? (
      <span className="font-semibold tabular-nums">{plainPct(v)} %</span>
    ) : (
      <span className="text-foreground/50">légal ({pctText(legalValue)})</span>
    );

  function cancel(r: CnasRegimeRow, v: LegalRateVersion) {
    const month = monthText(payrollMonthOf(v.effective_from));
    if (!window.confirm(`Annuler les taux prévus dès ${month} (régime ${r.code}) ?`)) return;
    run(() => cancelCnasRegimeRates({ version_id: v.id }), `Taux prévus dès ${month} annulés.`);
  }

  function removeRegime(r: CnasRegimeRow) {
    if (!window.confirm(`Supprimer le régime ${r.code} (${r.label_fr}) ? Les bulletins déjà générés ne changent pas.`)) {
      return;
    }
    run(() => deleteCnasRegime({ id: r.id }), `Régime ${r.code} supprimé.`);
  }

  return (
    <RhPanel>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold">Régimes CNAS</h3>
          <p className="mt-1 text-xs text-foreground/55">
            Le régime se choisit dans le contrat (« Régime CNAS ») ou, à défaut, dans la fiche employé (« Profil
            social ») ; sinon STANDARD. Case vide = taux légal du mois. Chaque changement de taux s&apos;applique à
            partir du mois choisi, sur le bulletin (CSS salariale, CSS patronale, et la case FOS à part).
          </p>
          <p className="mt-0.5 text-xs text-foreground/55" dir="rtl">
            يُختار النظام في العقد («نظام CNAS») أو في ملف العامل («ملف الاشتراك»)، وإلا يُطبَّق العادي STANDARD.
          </p>
        </div>
        {canEdit ? (
          <Button variant="secondary" onClick={() => setDialog({ regime: null })}>
            + Ajouter un régime
          </Button>
        ) : null}
      </div>
      <Feedback error={error} info={info} />
      <div className="mt-3">
        <RhTableWrap>
          <table className="min-w-full text-sm">
            <thead className="border-b border-border/70 bg-surface-muted/80">
              <tr>
                <th className={rhTh()}>Code</th>
                <th className={rhTh()}>Libellé</th>
                <th className={rhTh()}>% salarié</th>
                <th className={rhTh()}>% employeur</th>
                <th className={rhTh()}>% FOS</th>
                <th className={rhTh()}>À venir</th>
                <th className={rhTh()}>Actif</th>
                {canEdit ? <th className={rhTh()} /> : null}
              </tr>
            </thead>
            <tbody>
              {!regimes.length ? (
                <tr>
                  <td className={`${rhTd()} text-foreground/55`} colSpan={colCount}>
                    Aucun régime : le taux légal s&apos;applique à tous.
                  </td>
                </tr>
              ) : null}
              {regimes.map((r) => {
                const historyOpen = openHistory === r.id;
                return (
                  <Fragment key={r.id}>
                    <tr className="border-b border-border/60 align-top">
                      <td className={rhTd()}>
                        <span className="font-mono text-xs">{r.code}</span>
                        {r.history.length ? (
                          <button
                            type="button"
                            className="mt-1 block text-xs text-brand hover:underline"
                            onClick={() => setOpenHistory(historyOpen ? null : r.id)}
                          >
                            {historyOpen ? "Masquer" : `Historique (${r.history.length})`}
                          </button>
                        ) : null}
                      </td>
                      <td className={rhTd()}>
                        {r.label_fr}
                        {r.label_ar && r.label_ar !== r.label_fr ? (
                          <span className="mt-0.5 block text-xs text-foreground/60" dir="rtl">
                            {r.label_ar}
                          </span>
                        ) : null}
                      </td>
                      <td className={rhTd()}>{cell(r.employee_pct, legal.employee)}</td>
                      <td className={rhTd()}>{cell(r.employer_pct, legal.employer)}</td>
                      <td className={rhTd()}>{cell(r.fos_pct, legal.fos)}</td>
                      <td className={rhTd()}>
                        {r.planned.length ? (
                          <ul className="space-y-1">
                            {r.planned.map((p) => (
                              <li key={p.id} className="flex flex-wrap items-center gap-2">
                                <RhChip tone="warning">
                                  {regimeRatesText(p)} dès {monthText(payrollMonthOf(p.effective_from))}
                                </RhChip>
                                {canEdit && canChangeFrom(period, p.effective_from) ? (
                                  <button
                                    type="button"
                                    disabled={pending}
                                    className="text-xs text-red-700 hover:underline disabled:opacity-50"
                                    onClick={() => cancel(r, p)}
                                  >
                                    Annuler
                                  </button>
                                ) : null}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <span className="text-foreground/40">—</span>
                        )}
                      </td>
                      <td className={rhTd()}>{r.is_active ? "Oui" : "Non"}</td>
                      {canEdit ? (
                        <td className={`${rhTd()} whitespace-nowrap`}>
                          <div className="flex justify-end gap-1">
                            <Button variant="secondary" disabled={pending} onClick={() => setDialog({ regime: r })}>
                              Modifier
                            </Button>
                            <Button
                              variant="ghost"
                              className="text-red-700"
                              disabled={pending || r.code === "STANDARD"}
                              title={r.code === "STANDARD" ? "Régime par défaut : non supprimable." : undefined}
                              onClick={() => removeRegime(r)}
                            >
                              Supprimer
                            </Button>
                          </div>
                        </td>
                      ) : null}
                    </tr>
                    {historyOpen ? (
                      <tr className="border-b border-border/60 bg-surface-muted/40">
                        <td className={rhTd()} colSpan={colCount}>
                          <ul className="space-y-1 text-xs tabular-nums">
                            {r.history.map((h) => (
                              <li key={h.id}>
                                <b>{regimeRatesText(h)}</b> · du {dateText(h.effective_from)}
                                {h.effective_to ? ` au ${dateText(h.effective_to)}` : " (sans fin)"}
                              </li>
                            ))}
                          </ul>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </RhTableWrap>
      </div>
      {dialog ? (
        <RegimeDialog regime={dialog.regime} legal={legal} period={period} onClose={() => setDialog(null)} />
      ) : null}
    </RhPanel>
  );
}

function RegimeDialog({
  regime,
  legal,
  period,
  onClose,
}: {
  regime: CnasRegimeRow | null;
  legal: { employee: number | null; employer: number | null; fos: number | null };
  period: LegalPeriod;
  onClose: () => void;
}) {
  const { pending, error, setError, run } = useLegalAction();
  const src = regime;
  const initialRates = {
    employee_pct: plainPct(src?.employee_pct ?? null),
    employer_pct: plainPct(src?.employer_pct ?? null),
    fos_pct: plainPct(src?.fos_pct ?? null),
  };
  const [form, setForm] = useState({
    code: regime?.code ?? "",
    label_fr: regime?.label_fr ?? "",
    label_ar: regime?.label_ar ?? "",
    is_active: regime?.is_active ?? true,
    ...initialRates,
    effective_from: period.default_from,
  });
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));
  const ratesChanged = (["employee_pct", "employer_pct", "fos_pct"] as const).some(
    (k) => parseNumber(form[k]) !== parseNumber(initialRates[k]),
  );
  const placeholder = (v: number | null) => (v == null ? "légal" : `légal ${String(toPct(v)).replace(".", ",")}`);

  function submit() {
    const code = form.code.replace(/_+$/, "");
    if (!/^[A-Z0-9_]{2,30}$/.test(code)) {
      return setError("Code : au moins 2 caractères (lettres, chiffres ou _), ex. R10 ou R_10.");
    }
    const rateFields = [
      ["employee_pct", "% salarié"],
      ["employer_pct", "% employeur"],
      ["fos_pct", "% FOS"],
    ] as const;
    const rates: Record<(typeof rateFields)[number][0], number | null> = {
      employee_pct: null,
      employer_pct: null,
      fos_pct: null,
    };
    for (const [k, label] of rateFields) {
      const raw = form[k].trim();
      const v = parseNumber(raw);
      if (raw && (v == null || v < 0 || v > 100)) return setError(`${label} : saisissez un nombre entre 0 et 100 (ex. 10,2).`);
      rates[k] = v;
    }
    if (ratesChanged && !form.effective_from) return setError("Choisissez le mois d'effet.");
    run(
      () =>
        saveCnasRegime({
          id: regime?.id ?? null,
          code,
          label_fr: form.label_fr,
          label_ar: form.label_ar || null,
          is_active: form.is_active,
          rates: ratesChanged ? { ...rates, effective_from: form.effective_from } : null,
        }),
      ratesChanged
        ? `Régime ${code} : nouveaux taux à partir de la paie de ${monthText(form.effective_from)}.`
        : `Régime ${code} enregistré.`,
      onClose,
    );
  }

  const rateInput = (k: "employee_pct" | "employer_pct" | "fos_pct", label: string, legalValue: number | null) => (
    <RhField label={label}>
      <input
        className={rhInput}
        inputMode="decimal"
        value={form[k]}
        placeholder={placeholder(legalValue)}
        onChange={(e) => set(k, e.target.value)}
      />
    </RhField>
  );

  return (
    <QuickDialog
      title={regime ? `Régime ${regime.code}` : "Nouveau régime CNAS"}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" disabled={pending} onClick={onClose}>
            Fermer
          </Button>
          <Button disabled={pending || form.label_fr.trim().length < 2 || form.code.trim().length < 2} onClick={submit}>
            {regime ? bi("Enregistrer", "حفظ") : bi("Ajouter", "إضافة")}
          </Button>
        </>
      }
    >
      {error ? <RhAlert tone="danger">{error}</RhAlert> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <RhField label="Code" required>
          <input
            className={`${rhInput} font-mono`}
            value={form.code}
            disabled={!!regime}
            placeholder="ex. ABATTEMENT"
            onChange={(e) => set("code", codeInput(e.target.value))}
          />
        </RhField>
        <RhField label="Libellé (FR)" required>
          <input className={rhInput} value={form.label_fr} onChange={(e) => set("label_fr", e.target.value)} />
        </RhField>
        <RhField label="Libellé (AR)">
          <input className={rhInput} dir="rtl" value={form.label_ar} onChange={(e) => set("label_ar", e.target.value)} />
        </RhField>
        <label className="flex items-center gap-2 self-end pb-2 text-sm">
          <input type="checkbox" checked={form.is_active} onChange={(e) => set("is_active", e.target.checked)} />
          Régime actif
        </label>
      </div>
      <div className="space-y-3 rounded-xl border border-brand/20 bg-brand-muted/10 p-3">
        <p className="text-sm font-medium">Taux (%) — case vide = taux légal du mois</p>
        <div className="grid gap-4 sm:grid-cols-3">
          {rateInput("employee_pct", "% salarié", legal.employee)}
          {rateInput("employer_pct", "% employeur", legal.employer)}
          {rateInput("fos_pct", "% FOS", legal.fos)}
        </div>
        {ratesChanged ? (
          <MonthField
            label="Nouveaux taux à partir de la paie de"
            value={form.effective_from}
            period={period}
            onChange={(v) => set("effective_from", v)}
          />
        ) : (
          <p className="text-xs text-foreground/55">Modifiez un taux pour choisir son mois d&apos;effet.</p>
        )}
      </div>
    </QuickDialog>
  );
}

export function LegalSettings({
  vars,
  regimes,
  period = fallbackPeriod(),
  irgCatalog,
  canEdit,
  loadError,
  initialSection = "cnas",
}: {
  vars: LegalVarRow[];
  regimes?: CnasRegimeRow[];
  period?: LegalPeriod;
  irgCatalog: IrgCatalog;
  canEdit: boolean;
  loadError?: string;
  initialSection?: Section;
}) {
  const [section, setSection] = useState<Section>(initialSection);
  const byGroup = useMemo(() => {
    const pick = (group: LegalVarRow["group"]) =>
      vars
        .filter((v) => v.group === group)
        .sort((a, b) => Number(a.contribution != null) - Number(b.contribution != null));
    return { caco: pick("cacobatph"), irg: pick("irg"), other: pick("other") };
  }, [vars]);
  const legalCnas = (key: string) => vars.find((v) => v.key === key)?.current_numeric ?? null;

  return (
    <div className="space-y-5">
      <RhPageHeader
        title={bi("Cotisations & impôts", "الاشتراكات والضرائب")}
        description={bi(
          "Ajoutez, modifiez ou arrêtez une rubrique en quelques clics : le changement s'applique à partir du mois choisi, jamais aux paies passées.",
          "أضف أو عدّل أو أوقف بنداً بنقرات: التغيير يسري من الشهر المختار ولا يمس الأجور السابقة.",
        )}
      />

      {loadError ? <RhAlert tone="danger">{loadError}</RhAlert> : null}

      <RhTabs
        items={[
          { id: "cnas", label: "CNAS" },
          { id: "cacobatph", label: "CACOBATPH" },
          { id: "irg", label: "Impôts (IRG)" },
          { id: "other", label: bi("Autres (SNMG…)", "أخرى (الأجر الأدنى…)") },
        ]}
        value={section}
        onChange={(id) => setSection(id as Section)}
      />

      <PeriodBanner period={period} />

      {section === "cnas" ? (
        regimes ? (
          <RegimesPanel
            regimes={regimes}
            canEdit={canEdit}
            period={period}
            legal={{
              employee: legalCnas("CNAS_EMPLOYEE"),
              employer: legalCnas("CNAS_EMPLOYER_BASE"),
              fos: legalCnas("CNAS_FOS"),
            }}
          />
        ) : (
          <RhAlert tone="info">{bi("Régimes CNAS indisponibles.", "أنظمة CNAS غير متوفرة.")}</RhAlert>
        )
      ) : null}

      {section === "cacobatph" ? (
        <RubriquesPanel
          title="Rubriques CACOBATPH"
          subtitle="Congés payés et intempéries, appliqués aux salariés des activités assujetties (codes d'activité)."
          group="cacobatph"
          rows={byGroup.caco}
          canEdit={canEdit}
          asPercent
          allowCustom
          period={period}
        />
      ) : null}

      {section === "irg" ? (
        <>
          <RubriquesPanel
            title="Rubriques impôts"
            subtitle="Abattement IRG par zone (Sud / Extrême Sud) — 0 % tant que le taux n'est pas confirmé — et retenues ou taxes ajoutées."
            group="irg"
            rows={byGroup.irg}
            canEdit={canEdit}
            asPercent
            allowCustom
            period={period}
          />
          <RhPanel>
            <IrgBaremeManager catalog={irgCatalog} canEdit={canEdit} />
          </RhPanel>
        </>
      ) : null}

      {section === "other" ? (
        <RubriquesPanel
          title="Paramètres liés à la paie"
          group="other"
          rows={byGroup.other}
          canEdit={canEdit}
          asPercent={false}
          allowCustom={false}
          period={period}
        />
      ) : null}
    </div>
  );
}
