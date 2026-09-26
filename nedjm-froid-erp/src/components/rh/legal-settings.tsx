"use client";

import { Fragment, useMemo, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  addLegalVarVersion,
  cancelLegalVarVersion,
  createContribution,
  deleteContribution,
  updateContribution,
  upsertCnasRegime,
  type CnasRegimeRow,
  type LegalVarRow,
} from "@/lib/actions/hr-legal-vars";
import type { ContributionGroup } from "@/lib/hr/compliance-keys";
import { IrgBaremeManager } from "@/components/rh/irg-bareme-manager";
import type { IrgCatalog } from "@/lib/actions/hr-irg";
import { Button } from "@/components/ui/button";
import {
  RhAlert,
  RhChip,
  RhField,
  RhModal,
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

function dateText(iso: string | null) {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

function firstOfMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function parseNumber(raw: string) {
  const s = raw.trim().replace(/\s/g, "").replace(",", ".");
  if (!s) return null;
  const v = Number(s);
  return Number.isFinite(v) ? v : null;
}

function draftValue(row: LegalVarRow, asPercent: boolean) {
  if (row.current_numeric == null) return "";
  return String(asPercent ? toPct(row.current_numeric) : row.current_numeric);
}

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
  return { pending, error, info, setError, run };
}

function Feedback({ error, info }: { error: string | null; info: string | null }) {
  if (!error && !info) return null;
  return (
    <div className="mt-3">
      {error ? <RhAlert tone="danger">{error}</RhAlert> : <RhAlert tone="success">{info}</RhAlert>}
    </div>
  );
}

const DATE_HINT =
  "La paie d'un mois applique la valeur en vigueur le 1er du mois : pour changer la paie de ce mois, gardez le 1er du mois comme date d'effet.";

function RateTable({
  title,
  subtitle,
  rows,
  canEdit,
  asPercent,
  describe,
  actions,
  empty,
}: {
  title: string;
  subtitle?: ReactNode;
  rows: LegalVarRow[];
  canEdit: boolean;
  asPercent: boolean;
  describe?: (row: LegalVarRow) => ReactNode;
  actions?: (row: LegalVarRow) => ReactNode;
  empty?: ReactNode;
}) {
  const { pending, error, info, setError, run } = useLegalAction();
  const [drafts, setDrafts] = useState<Record<string, { value: string; from: string }>>({});
  const [openHistory, setOpenHistory] = useState<string | null>(null);
  const show = (v: number | null, row: LegalVarRow) => (asPercent ? pctText(v) : numText(v, row.unit));

  function draftOf(row: LegalVarRow) {
    return drafts[row.id] ?? { value: draftValue(row, asPercent), from: firstOfMonth() };
  }

  function save(row: LegalVarRow) {
    const d = draftOf(row);
    const value = parseNumber(d.value);
    if (value == null) {
      setError(`${row.label_fr} : saisissez une valeur numérique.`);
      return;
    }
    if (!d.from) {
      setError(`${row.label_fr} : choisissez la date d'effet.`);
      return;
    }
    run(
      () =>
        addLegalVarVersion(
          asPercent
            ? { var_id: row.id, effective_from: d.from, value_pct: value, as_percent: true }
            : { var_id: row.id, effective_from: d.from, value_numeric: value, as_percent: false },
        ),
      `${row.label_fr} : ${asPercent ? `${String(value).replace(".", ",")} %` : value} à partir du ${dateText(d.from)}.`,
    );
  }

  function cancel(row: LegalVarRow, versionId: string, from: string) {
    if (!window.confirm(`Annuler la valeur programmée au ${dateText(from)} pour « ${row.label_fr} » ?`)) return;
    run(() => cancelLegalVarVersion({ version_id: versionId }), `Valeur du ${dateText(from)} annulée.`);
  }

  return (
    <RhPanel>
      <h3 className="font-semibold">{title}</h3>
      {subtitle ? <div className="mt-1 text-xs text-foreground/55">{subtitle}</div> : null}
      <Feedback error={error} info={info} />
      {!rows.length ? (
        <div className="mt-3 text-sm text-foreground/55">{empty ?? "—"}</div>
      ) : (
        <div className="mt-3">
          <RhTableWrap>
            <table className="min-w-full text-sm">
              <thead className="border-b border-border/70 bg-surface-muted/80">
                <tr>
                  <th className={rhTh()}>{bi("Libellé", "التسمية")}</th>
                  <th className={rhTh()}>{bi("En vigueur", "السارية")}</th>
                  <th className={rhTh()}>{bi("Programmé", "مبرمجة")}</th>
                  {canEdit ? (
                    <>
                      <th className={rhTh()}>{asPercent ? "Nouveau taux (%)" : "Nouvelle valeur"}</th>
                      <th className={rhTh()}>{bi("À partir du", "ابتداءً من")}</th>
                      <th className={rhTh()} />
                    </>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const d = draftOf(row);
                  const historyOpen = openHistory === row.id;
                  return (
                    <Fragment key={row.id}>
                      <tr className="border-b border-border/60 align-top">
                        <td className={rhTd()}>
                          <span className="font-medium">{row.label_fr}</span>
                          {row.label_ar ? (
                            <span className="mt-0.5 block text-xs text-foreground/55" dir="rtl">
                              {row.label_ar}
                            </span>
                          ) : null}
                          <span className="mt-0.5 block font-mono text-[11px] text-foreground/45">{row.key}</span>
                          {describe ? <div className="mt-1.5 flex flex-wrap gap-1">{describe(row)}</div> : null}
                        </td>
                        <td className={`${rhTd()} whitespace-nowrap`}>
                          <span className="font-semibold tabular-nums">{show(row.current_numeric, row)}</span>
                          <span className="mt-0.5 block text-xs text-foreground/55">
                            {row.effective_from ? `depuis le ${dateText(row.effective_from)}` : "aucune valeur"}
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
                          {row.planned.length ? (
                            <ul className="space-y-1">
                              {row.planned.map((p) => (
                                <li key={p.id} className="flex items-center gap-2 whitespace-nowrap">
                                  <RhChip tone="warning">
                                    {show(p.value, row)} au {dateText(p.effective_from)}
                                  </RhChip>
                                  {canEdit ? (
                                    <button
                                      type="button"
                                      disabled={pending}
                                      className="text-xs text-red-700 hover:underline disabled:opacity-50"
                                      onClick={() => cancel(row, p.id, p.effective_from)}
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
                        {canEdit ? (
                          <>
                            <td className={rhTd()}>
                              <input
                                className={`${rhInput} w-28`}
                                inputMode="decimal"
                                disabled={pending}
                                value={d.value}
                                aria-label={`Nouvelle valeur ${row.label_fr}`}
                                onChange={(e) =>
                                  setDrafts((prev) => ({ ...prev, [row.id]: { ...d, value: e.target.value } }))
                                }
                              />
                            </td>
                            <td className={rhTd()}>
                              <input
                                className={`${rhInput} w-40`}
                                type="date"
                                disabled={pending}
                                value={d.from}
                                aria-label={`Date d'effet ${row.label_fr}`}
                                onChange={(e) =>
                                  setDrafts((prev) => ({ ...prev, [row.id]: { ...d, from: e.target.value } }))
                                }
                              />
                            </td>
                            <td className={`${rhTd()} whitespace-nowrap`}>
                              <div className="flex flex-wrap items-center gap-2">
                                <Button disabled={pending} onClick={() => save(row)}>
                                  {bi("Enregistrer", "حفظ")}
                                </Button>
                                {actions?.(row)}
                              </div>
                            </td>
                          </>
                        ) : null}
                      </tr>
                      {historyOpen ? (
                        <tr className="border-b border-border/60 bg-surface-muted/40">
                          <td className={rhTd()} colSpan={canEdit ? 6 : 3}>
                            <ul className="grid gap-1 text-xs sm:grid-cols-2 lg:grid-cols-3">
                              {row.history.map((h) => (
                                <li key={h.id} className="tabular-nums">
                                  <b>{show(h.value, row)}</b> · du {dateText(h.effective_from)}
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
      )}
      {canEdit && rows.length ? <p className="mt-3 text-xs text-foreground/55">{DATE_HINT}</p> : null}
      {!canEdit ? (
        <p className="mt-3 text-xs text-foreground/55">
          {bi(
            "Lecture seule : modification réservée à SUPER_ADMIN, ADMIN_RH et ADMIN_FINANCE (unité 05).",
            "للاطلاع فقط: التعديل محصور في SUPER_ADMIN و ADMIN_RH و ADMIN_FINANCE (الوحدة 05).",
          )}
        </p>
      ) : null}
    </RhPanel>
  );
}

const PART_LABEL = { EMPLOYEE: "Part salariale (retenue)", EMPLOYER: "Part patronale (charge)" } as const;
const BASE_LABEL = { COTISABLE: "Assiette : brut cotisable", TAXABLE: "Assiette : brut imposable" } as const;
const SCOPE_LABEL = {
  ALL: "Tous les salariés",
  CACOBATPH_CONGES: "Salariés assujettis CACOBATPH congés",
  CACOBATPH_INTEMPERIES: "Salariés assujettis intempéries",
} as const;

type ContributionForm = {
  label_fr: string;
  label_ar: string;
  code: string;
  part: "EMPLOYEE" | "EMPLOYER";
  base: "COTISABLE" | "TAXABLE";
  reduces_irg: boolean;
  scope: "ALL" | "CACOBATPH_CONGES" | "CACOBATPH_INTEMPERIES";
  sort_order: string;
  value_pct: string;
  effective_from: string;
};

function emptyContribution(group: ContributionGroup): ContributionForm {
  return {
    label_fr: "",
    label_ar: "",
    code: "",
    part: "EMPLOYEE",
    base: group === "irg" ? "TAXABLE" : "COTISABLE",
    reduces_irg: false,
    scope: group === "cacobatph" ? "CACOBATPH_CONGES" : "ALL",
    sort_order: "0",
    value_pct: "",
    effective_from: firstOfMonth(),
  };
}

function ContributionModal({
  group,
  editing,
  onClose,
}: {
  group: ContributionGroup;
  editing: LegalVarRow | null;
  onClose: () => void;
}) {
  const { pending, error, setError, run } = useLegalAction();
  const [form, setForm] = useState<ContributionForm>(() =>
    editing?.contribution
      ? {
          label_fr: editing.label_fr,
          label_ar: editing.label_ar ?? "",
          code: editing.contribution.code,
          part: editing.contribution.part,
          base: editing.contribution.base,
          reduces_irg: editing.contribution.reduces_irg,
          scope: editing.contribution.scope,
          sort_order: String(editing.sort_order),
          value_pct: "",
          effective_from: firstOfMonth(),
        }
      : emptyContribution(group),
  );
  const set = <K extends keyof ContributionForm>(k: K, v: ContributionForm[K]) => setForm((f) => ({ ...f, [k]: v }));

  function submit() {
    const details = {
      label_fr: form.label_fr,
      label_ar: form.label_ar || null,
      code: form.code || null,
      part: form.part,
      base: form.base,
      reduces_irg: form.part === "EMPLOYEE" && form.reduces_irg,
      scope: form.scope,
      sort_order: Number(form.sort_order) || 0,
    };
    if (editing) {
      run(() => updateContribution({ var_id: editing.id, details }), "Cotisation mise à jour.", onClose);
      return;
    }
    const pct = parseNumber(form.value_pct);
    if (pct == null) {
      setError("Saisissez le taux (%).");
      return;
    }
    run(
      () => createContribution({ group, details, value_pct: pct, effective_from: form.effective_from }),
      "Cotisation ajoutée : elle sera calculée à la prochaine génération de paie.",
      onClose,
    );
  }

  return (
    <RhModal
      title={editing ? `Paramètres — ${editing.label_fr}` : "Nouvelle cotisation"}
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
            {bi("Enregistrer", "حفظ")}
          </Button>
        </>
      }
    >
      <div className="space-y-4 p-2">
        {error ? <RhAlert tone="danger">{error}</RhAlert> : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <RhField label="Libellé (FR)" required>
            <input
              className={rhInput}
              value={form.label_fr}
              placeholder="ex. Retraite anticipée"
              onChange={(e) => set("label_fr", e.target.value)}
            />
          </RhField>
          <RhField label="Libellé (AR)">
            <input className={rhInput} dir="rtl" value={form.label_ar} onChange={(e) => set("label_ar", e.target.value)} />
          </RhField>
          <RhField label="Code sur le bulletin" hint="Vide = clé technique">
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
          <RhField label="Part">
            <select
              className={rhSelect}
              value={form.part}
              onChange={(e) => set("part", e.target.value as ContributionForm["part"])}
            >
              <option value="EMPLOYEE">{PART_LABEL.EMPLOYEE}</option>
              <option value="EMPLOYER">{PART_LABEL.EMPLOYER}</option>
            </select>
          </RhField>
          <RhField label="Assiette">
            <select
              className={rhSelect}
              value={form.base}
              onChange={(e) => set("base", e.target.value as ContributionForm["base"])}
            >
              <option value="COTISABLE">Brut cotisable (comme la CNAS)</option>
              <option value="TAXABLE">Brut imposable (comme l&apos;IRG)</option>
            </select>
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
          {form.part === "EMPLOYEE" ? (
            <label className="flex items-center gap-2 self-end pb-2 text-sm">
              <input
                type="checkbox"
                checked={form.reduces_irg}
                onChange={(e) => set("reduces_irg", e.target.checked)}
              />
              Déductible de l&apos;assiette IRG (comme la CNAS salariale)
            </label>
          ) : null}
        </div>
        {!editing ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <RhField label="Taux (%)" required>
              <input
                className={rhInput}
                inputMode="decimal"
                value={form.value_pct}
                placeholder="ex. 0,5"
                onChange={(e) => set("value_pct", e.target.value)}
              />
            </RhField>
            <RhField label="À partir du" required hint={DATE_HINT}>
              <input
                className={rhInput}
                type="date"
                value={form.effective_from}
                onChange={(e) => set("effective_from", e.target.value)}
              />
            </RhField>
          </div>
        ) : (
          <p className="text-xs text-foreground/55">
            Le taux se modifie dans le tableau (nouvelle valeur + date d&apos;effet), pour garder l&apos;historique.
          </p>
        )}
      </div>
    </RhModal>
  );
}

function ContributionsPanel({
  group,
  rows,
  canEdit,
}: {
  group: ContributionGroup;
  rows: LegalVarRow[];
  canEdit: boolean;
}) {
  const [modal, setModal] = useState<{ editing: LegalVarRow | null } | null>(null);
  const { pending, error, info, run } = useLegalAction();

  function remove(row: LegalVarRow) {
    if (
      !window.confirm(
        `Supprimer « ${row.label_fr} » ? Elle ne sera plus calculée ; les bulletins déjà générés gardent leurs montants.`,
      )
    ) {
      return;
    }
    run(() => deleteContribution({ var_id: row.id }), `« ${row.label_fr} » supprimée.`);
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-foreground/65">
          Cotisations supplémentaires calculées automatiquement sur chaque bulletin.
        </p>
        {canEdit ? (
          <Button variant="secondary" onClick={() => setModal({ editing: null })}>
            + Ajouter une cotisation
          </Button>
        ) : null}
      </div>
      <Feedback error={error} info={info} />
      <RateTable
        title="Cotisations ajoutées"
        rows={rows}
        canEdit={canEdit}
        asPercent
        empty="Aucune cotisation ajoutée pour cet onglet."
        describe={(row) =>
          row.contribution ? (
            <>
              {row.contribution.code ? <RhChip tone="brand">Code {row.contribution.code}</RhChip> : null}
              <RhChip>{PART_LABEL[row.contribution.part]}</RhChip>
              <RhChip>{BASE_LABEL[row.contribution.base]}</RhChip>
              {row.contribution.reduces_irg ? <RhChip tone="success">Déductible IRG</RhChip> : null}
              {group === "cacobatph" ? <RhChip>{SCOPE_LABEL[row.contribution.scope]}</RhChip> : null}
            </>
          ) : null
        }
        actions={(row) => (
          <>
            <Button variant="ghost" disabled={pending} onClick={() => setModal({ editing: row })}>
              Paramètres
            </Button>
            <Button variant="ghost" disabled={pending} className="text-red-700" onClick={() => remove(row)}>
              Supprimer
            </Button>
          </>
        )}
      />
      {modal ? <ContributionModal group={group} editing={modal.editing} onClose={() => setModal(null)} /> : null}
    </div>
  );
}

type RegimeDraft = {
  id: string | null;
  code: string;
  label_fr: string;
  label_ar: string;
  employee_pct: string;
  employer_pct: string;
  fos_pct: string;
  is_active: boolean;
};

const pctDraft = (v: number | null) => (v == null ? "" : String(v));

function CnasRegimesPanel({
  regimes,
  canEdit,
  legal,
}: {
  regimes: CnasRegimeRow[];
  canEdit: boolean;
  legal: { employee: number | null; employer: number | null; fos: number | null };
}) {
  const { pending, error, info, run } = useLegalAction();
  const [drafts, setDrafts] = useState<Record<string, RegimeDraft>>({});
  const [adding, setAdding] = useState<RegimeDraft | null>(null);

  const draftOf = (r: CnasRegimeRow): RegimeDraft =>
    drafts[r.id] ?? {
      id: r.id,
      code: r.code,
      label_fr: r.label_fr,
      label_ar: r.label_ar,
      employee_pct: pctDraft(r.employee_pct),
      employer_pct: pctDraft(r.employer_pct),
      fos_pct: pctDraft(r.fos_pct),
      is_active: r.is_active,
    };

  function save(d: RegimeDraft, after?: () => void) {
    run(
      () =>
        upsertCnasRegime({
          id: d.id,
          code: d.code,
          label_fr: d.label_fr,
          label_ar: d.label_ar || null,
          employee_pct: d.employee_pct,
          employer_pct: d.employer_pct,
          fos_pct: d.fos_pct,
          is_active: d.is_active,
        }),
      `Régime ${d.code.toUpperCase()} enregistré.`,
      after,
    );
  }

  const placeholder = (v: number | null) => (v == null ? "légal" : `légal ${String(toPct(v)).replace(".", ",")}`);

  function cells(d: RegimeDraft, onChange: (d: RegimeDraft) => void, isNew: boolean) {
    const input = (k: "employee_pct" | "employer_pct" | "fos_pct", ph: string) => (
      <input
        className={`${rhInput} w-24`}
        inputMode="decimal"
        disabled={!canEdit || pending}
        value={d[k]}
        placeholder={ph}
        onChange={(e) => onChange({ ...d, [k]: e.target.value })}
      />
    );
    return (
      <>
        <td className={rhTd()}>
          {isNew ? (
            <input
              className={`${rhInput} w-32 font-mono`}
              value={d.code}
              placeholder="CODE"
              onChange={(e) => onChange({ ...d, code: e.target.value.toUpperCase() })}
            />
          ) : (
            <span className="font-mono text-xs">{d.code}</span>
          )}
        </td>
        <td className={rhTd()}>
          <input
            className={`${rhInput} min-w-40`}
            disabled={!canEdit || pending}
            value={d.label_fr}
            placeholder="Libellé"
            onChange={(e) => onChange({ ...d, label_fr: e.target.value })}
          />
        </td>
        <td className={rhTd()}>{input("employee_pct", placeholder(legal.employee))}</td>
        <td className={rhTd()}>{input("employer_pct", placeholder(legal.employer))}</td>
        <td className={rhTd()}>{input("fos_pct", placeholder(legal.fos))}</td>
        <td className={rhTd()}>
          <input
            type="checkbox"
            disabled={!canEdit || pending}
            checked={d.is_active}
            aria-label="Actif"
            onChange={(e) => onChange({ ...d, is_active: e.target.checked })}
          />
        </td>
      </>
    );
  }

  return (
    <RhPanel>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold">Régimes CNAS</h3>
          <p className="mt-1 text-xs text-foreground/55">
            Taux appliqués selon le régime du salarié (fiche employé ou contrat). Case vide = taux légal en vigueur
            ci-dessus.
          </p>
        </div>
        {canEdit && !adding ? (
          <Button
            variant="secondary"
            onClick={() =>
              setAdding({
                id: null,
                code: "",
                label_fr: "",
                label_ar: "",
                employee_pct: "",
                employer_pct: "",
                fos_pct: "",
                is_active: true,
              })
            }
          >
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
                <th className={rhTh()}>Actif</th>
                {canEdit ? <th className={rhTh()} /> : null}
              </tr>
            </thead>
            <tbody>
              {regimes.map((r) => {
                const d = draftOf(r);
                return (
                  <tr key={r.id} className="border-b border-border/60">
                    {cells(d, (next) => setDrafts((prev) => ({ ...prev, [r.id]: next })), false)}
                    {canEdit ? (
                      <td className={rhTd()}>
                        <Button disabled={pending} onClick={() => save(d)}>
                          {bi("Enregistrer", "حفظ")}
                        </Button>
                      </td>
                    ) : null}
                  </tr>
                );
              })}
              {adding ? (
                <tr className="border-b border-border/60 bg-brand-muted/20">
                  {cells(adding, setAdding, true)}
                  <td className={`${rhTd()} whitespace-nowrap`}>
                    <div className="flex gap-2">
                      <Button disabled={pending} onClick={() => save(adding, () => setAdding(null))}>
                        Ajouter
                      </Button>
                      <Button variant="ghost" disabled={pending} onClick={() => setAdding(null)}>
                        Annuler
                      </Button>
                    </div>
                  </td>
                </tr>
              ) : null}
              {!regimes.length && !adding ? (
                <tr>
                  <td className={`${rhTd()} text-foreground/55`} colSpan={canEdit ? 7 : 6}>
                    Aucun régime : le taux légal s&apos;applique à tous.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </RhTableWrap>
      </div>
    </RhPanel>
  );
}

export function LegalSettings({
  vars,
  regimes,
  irgCatalog,
  canEdit,
  loadError,
  initialSection = "cnas",
}: {
  vars: LegalVarRow[];
  regimes?: CnasRegimeRow[];
  irgCatalog: IrgCatalog;
  canEdit: boolean;
  loadError?: string;
  initialSection?: Section;
}) {
  const [section, setSection] = useState<Section>(initialSection);
  const byGroup = useMemo(() => {
    const pick = (group: LegalVarRow["group"], custom: boolean) =>
      vars.filter((v) => v.group === group && (custom ? v.contribution != null : v.contribution == null));
    return {
      cnas: pick("cnas", false),
      cnasExtra: pick("cnas", true),
      caco: pick("cacobatph", false),
      cacoExtra: pick("cacobatph", true),
      irg: pick("irg", false),
      irgExtra: pick("irg", true),
      other: pick("other", false),
    };
  }, [vars]);
  const legalCnas = (key: string) => vars.find((v) => v.key === key)?.current_numeric ?? null;

  return (
    <div className="space-y-5">
      <RhPageHeader
        title={bi("Cotisations & impôts", "الاشتراكات والضرائب")}
        description={bi(
          "Une seule fenêtre : CNAS, CACOBATPH et impôts. Les bulletins lisent ces valeurs à la génération de la paie.",
          "نافذة واحدة: الضمان، كاكوباتف، والضرائب. الكشوف تقرأ هذه القيم.",
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

      {section === "cnas" ? (
        <>
          <RateTable
            title="CNAS — taux légaux de sécurité sociale"
            subtitle="Sur le bulletin : CSS salariale et CSS patronale (employeur + FOS)."
            rows={byGroup.cnas}
            canEdit={canEdit}
            asPercent
          />
          {regimes ? (
            <CnasRegimesPanel
              regimes={regimes}
              canEdit={canEdit}
              legal={{
                employee: legalCnas("CNAS_EMPLOYEE"),
                employer: legalCnas("CNAS_EMPLOYER_BASE"),
                fos: legalCnas("CNAS_FOS"),
              }}
            />
          ) : null}
          <ContributionsPanel group="cnas" rows={byGroup.cnasExtra} canEdit={canEdit} />
        </>
      ) : null}

      {section === "cacobatph" ? (
        <>
          <RateTable
            title="CACOBATPH — congés payés et intempéries"
            subtitle="Appliqués aux salariés des activités assujetties (codes d'activité)."
            rows={byGroup.caco}
            canEdit={canEdit}
            asPercent
          />
          <ContributionsPanel group="cacobatph" rows={byGroup.cacoExtra} canEdit={canEdit} />
        </>
      ) : null}

      {section === "irg" ? (
        <>
          <RateTable
            title="Abattement IRG par zone (Sud / Extrême Sud)"
            subtitle="0 % tant que le taux n'est pas confirmé. La zone d'un chantier se règle sur sa fiche, ou via la liste « Wilaya → zone IRG » des paramètres RH."
            rows={byGroup.irg}
            canEdit={canEdit}
            asPercent
          />
          <ContributionsPanel group="irg" rows={byGroup.irgExtra} canEdit={canEdit} />
          <RhPanel>
            <IrgBaremeManager catalog={irgCatalog} canEdit={canEdit} />
          </RhPanel>
        </>
      ) : null}

      {section === "other" ? (
        <RateTable title="Paramètres liés à la paie" rows={byGroup.other} canEdit={canEdit} asPercent={false} />
      ) : null}
    </div>
  );
}
