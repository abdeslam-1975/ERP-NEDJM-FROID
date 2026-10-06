"use client";

import { useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { Upload } from "lucide-react";
import { registerDocFont, setDocFontActive } from "@/lib/actions/hr-custom-docs";
import { uploadDocAsset } from "@/components/rh/doc-asset-upload";
import { BUNDLED_FONTS } from "@/lib/doc/bundled-fonts";
import { fontFaceCss, type UploadedFont } from "@/lib/doc/fonts";
import { Button } from "@/components/ui/button";
import { RhAlert, RhChip, RhField, RhPanel, RhSectionTitle, rhInput } from "@/components/rh/rh-ui";

const SAMPLE_LATIN = "Attestation de travail — 0123456789";
const SAMPLE_ARABIC = "شهادة عمل — نجم للتبريد ٠١٢٣";
const WEIGHTS = [100, 200, 300, 400, 500, 600, 700, 800, 900];

function FontCard({ family, weights, arabic, footer }: { family: string; weights: string; arabic: boolean; footer?: ReactNode }) {
  return (
    <li className="flex flex-col gap-2 rounded-xl border border-border/70 bg-surface px-3.5 py-3">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-sm font-semibold">{family}</span>
        <span className="shrink-0 text-[11px] text-foreground/50">{weights}</span>
      </div>
      <p className="truncate text-lg leading-snug" style={{ fontFamily: `"${family}", sans-serif` }} dir={arabic ? "rtl" : "ltr"}>
        {arabic ? SAMPLE_ARABIC : SAMPLE_LATIN}
      </p>
      <p className="truncate text-sm font-bold" style={{ fontFamily: `"${family}", sans-serif` }}>
        {arabic ? SAMPLE_LATIN : "ABCDEFGH abcdefgh éèàçœ"}
      </p>
      {footer}
    </li>
  );
}

export function DocFontsManager({ fonts: initial, canEdit }: { fonts: UploadedFont[]; canEdit: boolean }) {
  const [fonts, setFonts] = useState(initial);
  const [family, setFamily] = useState("");
  const [weight, setWeight] = useState(400);
  const [style, setStyle] = useState<"normal" | "italic">("normal");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const css = useMemo(() => fontFaceCss(fonts), [fonts]);
  const uploadedFamilies = useMemo(() => {
    const map = new Map<string, UploadedFont[]>();
    for (const f of fonts) map.set(f.family, [...(map.get(f.family) ?? []), f]);
    return [...map.entries()];
  }, [fonts]);

  function upload() {
    const file = fileRef.current?.files?.[0];
    setError(null);
    setInfo(null);
    if (!file) return setError("Choisissez un fichier de police (WOFF2, WOFF, TTF ou OTF).");
    const name = family.trim() || file.name.replace(/\.[^.]+$/, "").replace(/[^A-Za-z0-9 _-]+/g, " ").trim();
    start(async () => {
      const sent = await uploadDocAsset("font", file);
      if (!sent.ok) return setError(sent.error);
      const r = await registerDocFont({ path: sent.path, family: name, weight, style });
      if (!r.ok) return setError(r.error);
      setFonts((list) => [...list, r.data]);
      setFamily("");
      if (fileRef.current) fileRef.current.value = "";
      setInfo(`Police « ${r.data.family} » importée : elle apparaît dans le menu « Police » des documents créés.`);
    });
  }

  function toggle(font: UploadedFont) {
    start(async () => {
      const r = await setDocFontActive(font.id, !font.is_active);
      if (!r.ok) return setError(r.error);
      setFonts((list) => list.map((f) => (f.id === font.id ? { ...f, is_active: !f.is_active } : f)));
    });
  }

  return (
    <div className="space-y-5">
      <style>{css}</style>
      <RhPanel>
        <RhSectionTitle>Importer une police</RhSectionTitle>
        <p className="mb-4 text-sm text-foreground/60">
          Ajoutez la police de votre charte (fichier WOFF2, WOFF, TTF ou OTF, 5 Mo maximum). Importez un fichier par graisse : par
          exemple « Normal 400 » puis « Gras 700 ». Vérifiez que la licence de la police autorise son utilisation.
        </p>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <RhField label="Fichier">
            <input ref={fileRef} type="file" accept=".woff2,.woff,.ttf,.otf" className={rhInput} disabled={!canEdit || pending} />
          </RhField>
          <RhField label="Nom de la police" hint="Lettres latines, chiffres, espaces. Vide : nom du fichier.">
            <input className={rhInput} value={family} maxLength={60} disabled={!canEdit} onChange={(e) => setFamily(e.target.value)} />
          </RhField>
          <RhField label="Graisse">
            <select className={rhInput} value={weight} disabled={!canEdit} onChange={(e) => setWeight(Number(e.target.value))}>
              {WEIGHTS.map((w) => (
                <option key={w} value={w}>
                  {w === 400 ? "400 — normal" : w === 700 ? "700 — gras" : w}
                </option>
              ))}
            </select>
          </RhField>
          <RhField label="Style">
            <select className={rhInput} value={style} disabled={!canEdit} onChange={(e) => setStyle(e.target.value === "italic" ? "italic" : "normal")}>
              <option value="normal">Droit</option>
              <option value="italic">Italique</option>
            </select>
          </RhField>
        </div>
        {error ? (
          <div className="mt-4">
            <RhAlert tone="danger">{error}</RhAlert>
          </div>
        ) : null}
        {info ? (
          <div className="mt-4">
            <RhAlert tone="success">{info}</RhAlert>
          </div>
        ) : null}
        <div className="mt-4">
          <Button disabled={!canEdit || pending} onClick={upload}>
            <Upload aria-hidden />
            Importer la police
          </Button>
        </div>
      </RhPanel>

      <RhPanel>
        <RhSectionTitle>Polices importées</RhSectionTitle>
        {uploadedFamilies.length ? (
          <ul className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {uploadedFamilies.map(([name, faces]) => (
              <FontCard
                key={name}
                family={name}
                arabic={false}
                weights={faces.map((f) => `${f.weight}${f.style === "italic" ? " italique" : ""}`).join(" · ")}
                footer={
                  <div className="flex flex-wrap gap-1.5">
                    {faces.map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        disabled={!canEdit || pending}
                        onClick={() => toggle(f)}
                        title={f.is_active ? "Archiver cette graisse" : "Réactiver cette graisse"}
                      >
                        <RhChip tone={f.is_active ? "success" : "neutral"}>
                          {f.weight}
                          {f.style === "italic" ? " it." : ""} · {f.is_active ? "active" : "archivée"}
                        </RhChip>
                      </button>
                    ))}
                  </div>
                }
              />
            ))}
          </ul>
        ) : (
          <p className="text-sm text-foreground/55">Aucune police importée pour l’instant.</p>
        )}
      </RhPanel>

      <RhPanel>
        <RhSectionTitle>Polices fournies avec l’application</RhSectionTitle>
        <p className="mb-4 text-sm text-foreground/60">
          Polices libres (licence OFL) installées avec l’application : elles s’impriment et s’archivent en PDF à l’identique, sans
          dépendre des polices de l’ordinateur.
        </p>
        {(["arabic", "latin"] as const).map((category) => (
          <div key={category} className="mb-4 last:mb-0">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-foreground/50">
              {category === "arabic" ? "Arabes (avec caractères latins)" : "Latines"}
            </p>
            <ul className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
              {BUNDLED_FONTS.filter((f) => f.category === category).map((f) => (
                <FontCard
                  key={f.family}
                  family={f.family}
                  arabic={category === "arabic"}
                  weights={[...new Set(f.faces.map((face) => face.weight))].join(" · ")}
                />
              ))}
            </ul>
          </div>
        ))}
      </RhPanel>
    </div>
  );
}
