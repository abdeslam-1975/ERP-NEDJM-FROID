import { isPathBlocked, type UiLayoutData } from "@/lib/ui/resolve";

/**
 * The settings center (Paramètres): every setting of the application has exactly one place here. Work pages only
 * link to it (⚙). Who sees a section follows the interface catalogue (the route must not be blocked) and the roles
 * the page itself requires.
 */

export type SettingsIcon =
  | "gauge"
  | "wallet"
  | "receipt"
  | "scale"
  | "idcard"
  | "list"
  | "calendar"
  | "files"
  | "landmark"
  | "cart"
  | "users"
  | "shield"
  | "grid"
  | "key"
  | "palette"
  | "lock"
  | "history";

export type SettingsSectionDef = {
  id: string;
  labelFr: string;
  labelAr: string;
  descriptionFr: string;
  href: string;
  icon: SettingsIcon;
  keywords?: string;
  /** Roles the page requires (requireRoles); the super admin always passes. */
  roles?: readonly string[];
  superAdminOnly?: boolean;
};

export type SettingsGroupDef = {
  key: string;
  titleFr: string;
  titleAr: string;
  descriptionFr: string;
  color: string;
  icon: SettingsIcon;
  sections: SettingsSectionDef[];
};

export const SETTINGS_HOME = "/parametres";

export const SETTINGS_GROUPS: SettingsGroupDef[] = [
  {
    key: "rh",
    titleFr: "Ressources humaines",
    titleAr: "الموارد البشرية",
    descriptionFr: "Paie, cotisations, fiche employé, listes et modèles de documents.",
    color: "#2563eb",
    icon: "users",
    sections: [
      {
        id: "rh",
        labelFr: "Vue d'ensemble",
        labelAr: "نظرة عامة",
        descriptionFr: "Taux en vigueur, barème IRG et état du paramétrage RH.",
        href: "/parametres/rh",
        icon: "gauge",
      },
      {
        id: "rh_rubriques",
        labelFr: "Rubriques de salaire",
        labelAr: "بنود الأجر",
        descriptionFr: "Dictionnaire des rubriques et valeurs par employé, chantier, contrat ou poste.",
        href: "/parametres/rh/rubriques",
        icon: "wallet",
        keywords: "prime indemnite salaire base import",
      },
      {
        id: "rh_bulletin",
        labelFr: "Modèle de bulletin",
        labelAr: "نموذج كشف الراتب",
        descriptionFr: "Mise en page et mentions du bulletin de paie.",
        href: "/parametres/rh/bulletin",
        icon: "receipt",
        keywords: "fiche de paie kashf",
      },
      {
        id: "rh_cotisations",
        labelFr: "Cotisations & impôts",
        labelAr: "الاشتراكات والضرائب",
        descriptionFr: "CNAS, CACOBATPH, barème IRG, SNMG et variables légales datées.",
        href: "/parametres/rh/cotisations",
        icon: "scale",
        keywords: "cnas irg cacobatph snmg taux regime bareme",
      },
      {
        id: "rh_fiche",
        labelFr: "Modèle de fiche employé",
        labelAr: "نموذج بطاقة العامل",
        descriptionFr: "Champs de la fiche, ordre, champs obligatoires et papier à en-tête.",
        href: "/parametres/rh/fiche",
        icon: "idcard",
        keywords: "champs en-tete letterhead",
      },
      {
        id: "rh_listes",
        labelFr: "Listes et codes",
        labelAr: "القوائم والرموز",
        descriptionFr: "Catalogues de la fiche employé et légendes du pointage.",
        href: "/parametres/rh/listes",
        icon: "list",
        keywords: "legendes pointage presence codes catalogues",
      },
      {
        id: "rh_presence",
        labelFr: "Feuille de présence",
        labelAr: "ورقة الحضور",
        descriptionFr: "Colonnes de la feuille de présence imprimée.",
        href: "/parametres/rh/presence",
        icon: "calendar",
        keywords: "pointage colonnes",
        superAdminOnly: true,
      },
      {
        id: "rh_documents",
        labelFr: "Modèles de documents",
        labelAr: "نماذج الوثائق",
        descriptionFr: "Identité de l'entreprise, lettres, ordres, fiches, contrats, documents créés et polices.",
        href: "/parametres/rh/documents",
        icon: "files",
        keywords: "attestation certificat ordre de mission contrat police entreprise identite",
      },
    ],
  },
  {
    key: "finance",
    titleFr: "Finance & achats",
    titleAr: "المالية والمشتريات",
    descriptionFr: "Comptes, TVA, modes de paiement, documents d'achat et numérotation.",
    color: "#059669",
    icon: "landmark",
    sections: [
      {
        id: "finance",
        labelFr: "Banque & caisse",
        labelAr: "البنك والصندوق",
        descriptionFr: "Comptes, TVA, modes de paiement, catégories et clôtures financières.",
        href: "/parametres/finance",
        icon: "landmark",
        keywords: "tva compte bancaire caisse categorie",
      },
      {
        id: "achats",
        labelFr: "Achats & facturation",
        labelAr: "المشتريات والفوترة",
        descriptionFr: "Profils d'impression, types de situation, timbre légal et numérotation.",
        href: "/parametres/achats",
        icon: "cart",
        keywords: "timbre numerotation situation profil impression",
      },
    ],
  },
  {
    key: "acces",
    titleFr: "Accès & sécurité",
    titleAr: "الصلاحيات والأمان",
    descriptionFr: "Comptes, rôles, droits par écran et interface visible par rôle.",
    color: "#7c3aed",
    icon: "shield",
    sections: [
      {
        id: "utilisateurs",
        labelFr: "Utilisateurs",
        labelAr: "المستخدمون",
        descriptionFr: "Comptes, invitations, rôles et chantiers de chaque utilisateur.",
        href: "/parametres/utilisateurs",
        icon: "users",
        keywords: "compte invitation mot de passe",
        roles: ["SUPER_ADMIN", "ADMIN_RH"],
      },
      {
        id: "roles",
        labelFr: "Rôles",
        labelAr: "الأدوار",
        descriptionFr: "Rôles disponibles et leur niveau.",
        href: "/administration/roles",
        icon: "shield",
        roles: ["SUPER_ADMIN", "GERANT"],
      },
      {
        id: "permissions",
        labelFr: "Droits par rôle",
        labelAr: "صلاحيات الأدوار",
        descriptionFr: "Pour chaque rôle : modules, onglets et boutons ouverts, actions permises et chantiers.",
        href: "/administration/permissions",
        icon: "grid",
        keywords: "droits permissions matrice",
        roles: ["SUPER_ADMIN", "GERANT"],
      },
      {
        id: "acces",
        labelFr: "Accès par compte",
        labelAr: "صلاحيات الحسابات",
        descriptionFr: "Ouvrir à un compte précis ses modules, puis les onglets de chaque module.",
        href: "/parametres/acces",
        icon: "key",
        superAdminOnly: true,
      },
      {
        id: "interface",
        labelFr: "Interface",
        labelAr: "الواجهة",
        descriptionFr: "Modules et onglets visibles par rôle, ordre, libellés et couleurs.",
        href: "/parametres/interface",
        icon: "palette",
        keywords: "theme couleurs menu onglets",
        superAdminOnly: true,
      },
    ],
  },
  {
    key: "controle",
    titleFr: "Clôtures & audit",
    titleAr: "الإقفال والتدقيق",
    descriptionFr: "Verrouillage des mois clôturés et historique des modifications.",
    color: "#d97706",
    icon: "lock",
    sections: [
      {
        id: "periodes",
        labelFr: "Clôture des périodes",
        labelAr: "إقفال الفترات",
        descriptionFr: "Verrouillage des mois clôturés, paie comprise.",
        href: "/administration/periodes",
        icon: "lock",
        keywords: "cloture verrouillage mois",
        roles: ["SUPER_ADMIN", "GERANT", "ADMIN_FINANCE"],
      },
      {
        id: "audit",
        labelFr: "Journal d'audit",
        labelAr: "سجل التدقيق",
        descriptionFr: "Qui a modifié quoi, et quand.",
        href: "/administration/audit",
        icon: "history",
        keywords: "historique modifications",
        roles: ["SUPER_ADMIN", "GERANT", "ADMIN_RH", "ADMIN_FINANCE"],
      },
    ],
  },
];

const ALL_SECTIONS = SETTINGS_GROUPS.flatMap((g) => g.sections);

const owns = (href: string, pathname: string) => pathname === href || pathname.startsWith(`${href}/`);

/** Pages shown inside the settings center (its home and every section with its sub-pages). */
export function isSettingsPath(pathname: string): boolean {
  return pathname === SETTINGS_HOME || ALL_SECTIONS.some((s) => owns(s.href, pathname));
}

/** Section owning the page: the longest matching link, so /parametres/rh/fiche is not « Vue d'ensemble ». */
export function settingsSectionAt(sections: { id: string; href: string }[], pathname: string): string | null {
  let best: { id: string; href: string } | null = null;
  for (const s of sections) if (owns(s.href, pathname) && (!best || s.href.length > best.href.length)) best = s;
  return best?.id ?? null;
}

export type SettingsViewer = { isSuperAdmin: boolean; roleCodes: readonly string[] };

export type ResolvedSettingsSection = Omit<SettingsSectionDef, "roles" | "superAdminOnly">;
export type ResolvedSettingsGroup = Omit<SettingsGroupDef, "sections"> & { sections: ResolvedSettingsSection[] };

function canOpen(layout: UiLayoutData, viewer: SettingsViewer, section: SettingsSectionDef): boolean {
  if (isPathBlocked(layout, section.href)) return false;
  if (viewer.isSuperAdmin) return true;
  if (section.superAdminOnly) return false;
  return !section.roles || section.roles.some((r) => viewer.roleCodes.includes(r));
}

/** Groups and sections the viewer may open (groups left without a section are dropped). */
export function resolveSettingsGroups(layout: UiLayoutData, viewer: SettingsViewer): ResolvedSettingsGroup[] {
  return SETTINGS_GROUPS.map(({ sections, ...group }) => ({
    ...group,
    sections: sections.filter((s) => canOpen(layout, viewer, s)).map(({ roles, superAdminOnly, ...s }) => {
      void roles;
      void superAdminOnly;
      return s;
    }),
  })).filter((g) => g.sections.length > 0);
}
