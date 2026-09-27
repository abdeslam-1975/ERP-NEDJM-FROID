import { z } from "zod";
import { communesOf } from "@/lib/referentiels/wilayas";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function blankToNull(value: unknown): string | null {
  if (value == null) return null;
  const text = String(value).trim();
  return text === "" ? null : text;
}

function optionalText(max: number) {
  return z
    .union([z.string().max(max), z.null()])
    .optional()
    .transform((value) => {
      const text = blankToNull(value);
      return text;
    });
}

export const clientUpsertSchema = z
  .object({
    id: z.string().uuid().optional(),
    code_client: optionalText(32),
    nom_fr: z.string().trim().min(2, "Le nom français est obligatoire.").max(200),
    nom_ar: optionalText(200),
    code_activite: optionalText(32),
    nif: optionalText(20),
    nis: optionalText(15),
    rc: optionalText(40),
    article_imposition: optionalText(40),
    adresse: optionalText(300),
    wilaya: optionalText(80),
    commune: optionalText(80),
    telephone: optionalText(32),
    email: optionalText(200),
    site_web: optionalText(200),
    banque_nom: optionalText(120),
    banque_compte: optionalText(40),
    banque_rib: optionalText(20),
    responsable_nom: optionalText(200),
    responsable_telephone: optionalText(32),
    responsable_email: optionalText(200),
  })
  .superRefine((value, ctx) => {
    if (value.code_client && !/^[A-Za-z0-9][A-Za-z0-9-]{1,31}$/.test(value.code_client)) {
      ctx.addIssue({
        code: "custom",
        path: ["code_client"],
        message: "Code client : lettres, chiffres et tirets uniquement.",
      });
    }
    if (value.nif && !/^\d{15}$|^\d{20}$/.test(value.nif)) {
      ctx.addIssue({
        code: "custom",
        path: ["nif"],
        message: "NIF : 15 ou 20 chiffres.",
      });
    }
    if (value.nis && !/^\d{15}$/.test(value.nis)) {
      ctx.addIssue({
        code: "custom",
        path: ["nis"],
        message: "NIS : 15 chiffres.",
      });
    }
    if (value.rc && !/^[A-Za-z0-9][A-Za-z0-9 /\-]{4,39}$/.test(value.rc)) {
      ctx.addIssue({
        code: "custom",
        path: ["rc"],
        message: "RC : 5 à 40 caractères (lettres, chiffres, espace, / ou -).",
      });
    }
    if (value.banque_rib && !/^\d{20}$/.test(value.banque_rib)) {
      ctx.addIssue({
        code: "custom",
        path: ["banque_rib"],
        message: "RIB : 20 chiffres.",
      });
    }
    if (value.telephone && value.telephone.replace(/\D/g, "").length < 9) {
      ctx.addIssue({
        code: "custom",
        path: ["telephone"],
        message: "Téléphone : au moins 9 chiffres.",
      });
    }
    if (
      value.responsable_telephone &&
      value.responsable_telephone.replace(/\D/g, "").length < 9
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["responsable_telephone"],
        message: "Téléphone du responsable : au moins 9 chiffres.",
      });
    }
    if (value.email && !EMAIL.test(value.email)) {
      ctx.addIssue({
        code: "custom",
        path: ["email"],
        message: "E-mail invalide.",
      });
    }
    if (value.responsable_email && !EMAIL.test(value.responsable_email)) {
      ctx.addIssue({
        code: "custom",
        path: ["responsable_email"],
        message: "E-mail du responsable invalide.",
      });
    }
    if (value.site_web && !isWebsite(value.site_web)) {
      ctx.addIssue({
        code: "custom",
        path: ["site_web"],
        message: "Site web invalide.",
      });
    }
    if (value.commune && !value.wilaya) {
      ctx.addIssue({
        code: "custom",
        path: ["wilaya"],
        message: "Choisissez une wilaya avant la commune.",
      });
    }
    if (
      value.wilaya &&
      value.commune &&
      !communesOf(value.wilaya).includes(value.commune)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["commune"],
        message: "Cette commune n'appartient pas à la wilaya choisie.",
      });
    }
  })
  .transform((value) => ({
    ...value,
    code_client: value.code_client?.toUpperCase() ?? null,
  }));

function isWebsite(value: string) {
  try {
    const url = new URL(value.includes("://") ? value : `https://${value}`);
    return url.hostname.includes(".");
  } catch {
    return false;
  }
}

export type ClientInput = z.infer<typeof clientUpsertSchema>;
