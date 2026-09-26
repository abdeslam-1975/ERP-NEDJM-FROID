"use client";

import { Fragment, useState, useTransition } from "react";
import {
  deleteGridRow,
  deletePoste,
  importPostesFromContracts,
  listPostes,
  saveGridRow,
  savePoste,
  type PosteCategory,
  type PosteRow,
} from "@/lib/actions/hr-postes";
import { slashDateIso } from "@/lib/hr/hr-letters";
import { Button } from "@/components/ui/button";
import { RhAlert, RhChip, RhField, RhModal, bi, rhInput } from "@/components/rh/rh-ui";

const CATEGORIES: { code: PosteCategory; label: string }[] = [
  { code: "EXECUTION", label: "Exécution · تنفيذ" },
  { code: "MAITRISE", label: "Maîtrise · تحكم" },
  { code: "CADRE", label: "Cadre · إطار" },
  { code: "DIRECTION", label: "Direction · إدارة" },
];

function money(n: number) {
  return n.toLocaleString("fr-DZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function today() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Algiers" }).format(new Date());
}

type PosteDraft = {
  id: string | null;
  code: string;
  label_fr: string;
  label_ar: string;
  category: PosteCategory;
  qualification_code: string;
  is_active: boolean;
  sort_order: string;
};

const emptyPoste = (): PosteDraft => ({
  id: null,
  code: "",
  label_fr: "",
  label_ar: "",
  category: "EXECUTION",
  qualification_code: "",
  is_active: true,
  sort_order: "0",
});

/** Rows in force today (latest effective_from ≤ today per grade). */
function currentGrid(p: PosteRow) {
  const t = today();
  const seen = new Set<string>();
  return p.grid.filter((g) => {
    if (g.effective_from > t || seen.has(g.grade)) return false;
    seen.add(g.grade);
    return true;
  });
}

export function PostesManager({
  initialRows,
  canEdit,
  loadError,
}: {
  initialRows: PosteRow[];
  canEdit: boolean;
  loadError?: string;
}) {
  const [rows, setRows] = useState(initialRows);
  const [draft, setDraft] = useState<PosteDraft | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [gridDraft, setGridDraft] = useState({ grade: "A", base_monthly: "", net_ref_monthly: "", effective_from: today(), notes: "" });
  const [error, setError] = useState<string | null>(loadError ?? null);
  const [notice, setNotice] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [pending, start] = useTransition();

  async function reload() {
    const r = await listPostes();
    if (r.ok) setRows(r.data);
    else setError(r.error);
  }

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, done?: string) {
    setError(null);
    setNotice(null);
    start(async () => {
      const r = await fn();
      if (!r.ok) {
        setError(r.error ?? "Erreur");
        return;
      }
      if (done) setNotice(done);
      await reload();
    });
  }

  function save() {
    if (!draft) return;
    setError(null);
    start(async () => {
      const r = await savePoste({ ...draft, sort_order: draft.sort_order || 0 });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setDraft(null);
      await reload();
    });
  }

  function addGrid(posteId: string) {
    run(async () => {
      const r = await saveGridRow({
        poste_id: posteId,
        ...gridDraft,
        net_ref_monthly: gridDraft.net_ref_monthly || null,
      });
      if (r.ok) setGridDraft({ ...gridDraft, base_monthly: "", net_ref_monthly: "", notes: "" });
      return r;
    });
  }

  const q = search.trim().toLowerCase();
  const visible = rows.filter(
    (p) => !q || p.code.toLowerCase().includes(q) || p.label_fr.toLowerCase().includes(q) || (p.label_ar ?? "").includes(q),
  );

  return (
    <div className="space-y-5">
      <RhAlert tone="info">
        {bi(
          "Référentiel des postes et grille salariale par poste et grade (versions datées). Le contrat reprend l'intitulé du poste et propose le salaire de la grille ; la paie signale tout salaire inférieur à la grille. Les rubriques peuvent aussi être affectées à un poste (priorité : employé > contrat > poste > chantier).",
          "",
        )}
      </RhAlert>
      {error ? <RhAlert tone="danger">{error}</RhAlert> : null}
      {notice ? <RhAlert tone="success">{notice}</RhAlert> : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <input
          className={`${rhInput} mt-0 w-64`}
          placeholder={bi("Rechercher un poste…", "بحث")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {canEdit ? (
          <div className="flex gap-2">
            <Button
              variant="secondary"
              disabled={pending}
              onClick={() =>
                run(async () => {
                  const r = await importPostesFromContracts();
                  if (r.ok) setNotice(`${r.data.created} poste(s) créé(s), ${r.data.linked} contrat(s) rattaché(s).`);
                  return r;
                })
              }
            >
              {bi("Importer depuis les contrats", "استيراد من العقود")}
            </Button>
            <Button onClick={() => setDraft(emptyPoste())}>{bi("Nouveau poste", "منصب جديد")}</Button>
          </div>
        ) : null}
      </div>

      <div className="overflow-x-auto rounded-2xl border border-border/80 bg-surface">
        <table className="w-full text-sm">
          <thead className="bg-surface-muted text-xs uppercase text-foreground/60">
            <tr>
              <th className="px-3 py-2 text-left">Code</th>
              <th className="px-3 py-2 text-left">{bi("Intitulé", "التسمية")}</th>
              <th className="px-3 py-2 text-left">{bi("Catégorie", "الفئة")}</th>
              <th className="px-3 py-2 text-left">{bi("Grille en vigueur", "الشبكة")}</th>
              <th className="px-3 py-2 text-right">{bi("Contrats", "العقود")}</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-foreground/50">
                  {bi("Aucun poste. Utilisez « Importer depuis les contrats » pour démarrer.", "")}
                </td>
              </tr>
            ) : (
              visible.map((p) => {
                const cur = currentGrid(p);
                const open = openId === p.id;
                return (
                  <Fragment key={p.id}>
                    <tr className="border-t border-border/60 align-top">
                      <td className="px-3 py-2 font-mono text-xs">{p.code}</td>
                      <td className="px-3 py-2">
                        {p.label_fr}
                        {p.label_ar ? (
                          <div dir="rtl" className="text-xs text-foreground/60">
                            {p.label_ar}
                          </div>
                        ) : null}
                        {!p.is_active ? <RhChip tone="neutral">{bi("Inactif", "غير نشط")}</RhChip> : null}
                      </td>
                      <td className="px-3 py-2">{CATEGORIES.find((c) => c.code === p.category)?.label}</td>
                      <td className="px-3 py-2 tabular-nums">
                        {cur.length
                          ? cur.map((g) => (
                              <div key={g.id}>
                                {g.grade} : {money(g.base_monthly)}
                              </div>
                            ))
                          : "—"}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{p.contracts}</td>
                      <td className="space-x-1 whitespace-nowrap px-3 py-2 text-right">
                        <Button variant="secondary" onClick={() => setOpenId(open ? null : p.id)}>
                          {open ? bi("Fermer la grille", "إغلاق") : bi("Grille", "الشبكة")}
                        </Button>
                        {canEdit ? (
                          <>
                            <Button
                              variant="secondary"
                              onClick={() =>
                                setDraft({
                                  id: p.id,
                                  code: p.code,
                                  label_fr: p.label_fr,
                                  label_ar: p.label_ar ?? "",
                                  category: p.category,
                                  qualification_code: p.qualification_code ?? "",
                                  is_active: p.is_active,
                                  sort_order: String(p.sort_order),
                                })
                              }
                            >
                              {bi("Modifier", "تعديل")}
                            </Button>
                            {p.contracts === 0 ? (
                              <Button
                                variant="secondary"
                                disabled={pending}
                                onClick={() => {
                                  if (window.confirm(`Supprimer le poste ${p.code} ?`)) run(() => deletePoste(p.id));
                                }}
                              >
                                {bi("Supprimer", "حذف")}
                              </Button>
                            ) : null}
                          </>
                        ) : null}
                      </td>
                    </tr>
                    {open ? (
                      <tr className="bg-surface-muted/40">
                        <td colSpan={6} className="px-3 py-3">
                          <table className="w-full text-xs">
                            <thead className="text-foreground/60">
                              <tr>
                                <th className="px-2 py-1 text-left">Grade</th>
                                <th className="px-2 py-1 text-right">{bi("Base mensuelle", "الأجر القاعدي")}</th>
                                <th className="px-2 py-1 text-right">{bi("Net de référence", "الصافي المرجعي")}</th>
                                <th className="px-2 py-1 text-left">{bi("En vigueur au", "ابتداء من")}</th>
                                <th className="px-2 py-1 text-left">{bi("Note", "ملاحظة")}</th>
                                <th />
                              </tr>
                            </thead>
                            <tbody>
                              {p.grid.map((g) => (
                                <tr key={g.id} className="border-t border-border/40">
                                  <td className="px-2 py-1 font-semibold">{g.grade}</td>
                                  <td className="px-2 py-1 text-right tabular-nums">{money(g.base_monthly)}</td>
                                  <td className="px-2 py-1 text-right tabular-nums">
                                    {g.net_ref_monthly == null ? "—" : money(g.net_ref_monthly)}
                                  </td>
                                  <td className="px-2 py-1 tabular-nums">{slashDateIso(g.effective_from)}</td>
                                  <td className="px-2 py-1">{g.notes}</td>
                                  <td className="px-2 py-1 text-right">
                                    {canEdit ? (
                                      <button
                                        type="button"
                                        className="text-red-600 hover:underline"
                                        onClick={() => {
                                          if (window.confirm("Supprimer cette ligne de grille ?")) run(() => deleteGridRow(g.id));
                                        }}
                                      >
                                        {bi("Supprimer", "حذف")}
                                      </button>
                                    ) : null}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          {canEdit ? (
                            <div className="mt-2 grid gap-2 sm:grid-cols-[6rem_10rem_10rem_10rem_1fr_auto] sm:items-end">
                              <RhField label="Grade">
                                <input
                                  className={rhInput}
                                  value={gridDraft.grade}
                                  onChange={(e) => setGridDraft({ ...gridDraft, grade: e.target.value.toUpperCase() })}
                                />
                              </RhField>
                              <RhField label={bi("Base", "القاعدي")}>
                                <input
                                  inputMode="decimal"
                                  className={rhInput}
                                  value={gridDraft.base_monthly}
                                  onChange={(e) => setGridDraft({ ...gridDraft, base_monthly: e.target.value })}
                                />
                              </RhField>
                              <RhField label={bi("Net réf.", "الصافي")}>
                                <input
                                  inputMode="decimal"
                                  className={rhInput}
                                  value={gridDraft.net_ref_monthly}
                                  onChange={(e) => setGridDraft({ ...gridDraft, net_ref_monthly: e.target.value })}
                                />
                              </RhField>
                              <RhField label={bi("En vigueur au", "ابتداء من")}>
                                <input
                                  type="date"
                                  className={rhInput}
                                  value={gridDraft.effective_from}
                                  onChange={(e) => setGridDraft({ ...gridDraft, effective_from: e.target.value })}
                                />
                              </RhField>
                              <RhField label={bi("Note", "ملاحظة")}>
                                <input
                                  className={rhInput}
                                  value={gridDraft.notes}
                                  onChange={(e) => setGridDraft({ ...gridDraft, notes: e.target.value })}
                                />
                              </RhField>
                              <Button disabled={pending || !Number(gridDraft.base_monthly)} onClick={() => addGrid(p.id)}>
                                {bi("Ajouter", "إضافة")}
                              </Button>
                            </div>
                          ) : null}
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {draft ? (
        <RhModal
          title={draft.id ? bi("Modifier le poste", "تعديل المنصب") : bi("Nouveau poste", "منصب جديد")}
          onClose={() => setDraft(null)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setDraft(null)}>
                {bi("Annuler", "إلغاء")}
              </Button>
              <Button disabled={pending} onClick={save}>
                {bi("Enregistrer", "حفظ")}
              </Button>
            </>
          }
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <RhField label="Code">
              <input
                className={rhInput}
                value={draft.code}
                onChange={(e) => setDraft({ ...draft, code: e.target.value.toUpperCase() })}
              />
            </RhField>
            <RhField label={bi("Catégorie", "الفئة")}>
              <select
                className={rhInput}
                value={draft.category}
                onChange={(e) => setDraft({ ...draft, category: e.target.value as PosteCategory })}
              >
                {CATEGORIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.label}
                  </option>
                ))}
              </select>
            </RhField>
            <RhField label={bi("Intitulé (FR)", "")}>
              <input
                className={rhInput}
                value={draft.label_fr}
                onChange={(e) => setDraft({ ...draft, label_fr: e.target.value })}
              />
            </RhField>
            <RhField label="التسمية بالعربية">
              <input
                dir="rtl"
                className={rhInput}
                value={draft.label_ar}
                onChange={(e) => setDraft({ ...draft, label_ar: e.target.value })}
              />
            </RhField>
            <RhField label={bi("Qualification (code)", "التأهيل")}>
              <input
                className={rhInput}
                value={draft.qualification_code}
                onChange={(e) => setDraft({ ...draft, qualification_code: e.target.value })}
              />
            </RhField>
            <RhField label={bi("Ordre", "الترتيب")}>
              <input
                inputMode="numeric"
                className={rhInput}
                value={draft.sort_order}
                onChange={(e) => setDraft({ ...draft, sort_order: e.target.value })}
              />
            </RhField>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={draft.is_active}
                onChange={(e) => setDraft({ ...draft, is_active: e.target.checked })}
              />
              {bi("Actif", "نشط")}
            </label>
          </div>
          {draft.id ? (
            <p className="mt-3 text-xs text-foreground/55">
              {bi("L'intitulé est recopié sur les contrats ouverts rattachés à ce poste.", "")}
            </p>
          ) : null}
        </RhModal>
      ) : null}
    </div>
  );
}
