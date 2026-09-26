import { z } from "zod";

function emptyToNull(v: unknown) {
  if (v === "" || v === undefined) return null;
  return v;
}

function optionalCoord(min: number, max: number, label: string) {
  return z.preprocess((v) => {
    if (v === "" || v === null || v === undefined) return null;
    if (typeof v === "number" && Number.isNaN(v)) return null;
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : v;
  }, z.number().min(min, label).max(max, label).nullable());
}

export const siteCreateSchema = z.object({
  code: z
    .string()
    .trim()
    .min(2, "Le code doit contenir au moins 2 caractères")
    .max(32, "Le code ne peut pas dépasser 32 caractères")
    .transform((v) => v.toUpperCase())
    .pipe(
      z
        .string()
        .regex(
          /^[A-Z0-9_-]+$/,
          "Le code n'accepte que A-Z, 0-9, tiret et underscore",
        ),
    ),
  name_fr: z
    .string()
    .trim()
    .min(2, "Le nom français est obligatoire (2–120 caractères)")
    .max(120, "Le nom français ne peut pas dépasser 120 caractères"),
  name_ar: z.preprocess(
    emptyToNull,
    z.string().trim().max(120).nullable(),
  ),
  activity_code_id: z.string().uuid("Code d'activité invalide"),
  wilaya: z.preprocess(
    emptyToNull,
    z.string().trim().max(80).nullable(),
  ),
  commune: z.preprocess(
    emptyToNull,
    z.string().trim().max(80).nullable(),
  ),
  irg_zone_code: z.preprocess(
    emptyToNull,
    z.string().trim().max(40).nullable(),
  ).optional(),
  latitude: optionalCoord(-90, 90, "Latitude invalide (−90 à 90)"),
  longitude: optionalCoord(-180, 180, "Longitude invalide (−180 à 180)"),
  is_active: z.boolean().default(true),
});

export const siteUpdateSchema = siteCreateSchema.partial().extend({
  id: z.string().uuid("Identifiant chantier invalide"),
});

export const siteToggleActiveSchema = z.object({
  id: z.string().uuid("Identifiant chantier invalide"),
  is_active: z.boolean(),
});

export type SiteCreateInput = z.infer<typeof siteCreateSchema>;
export type SiteUpdateInput = z.infer<typeof siteUpdateSchema>;
