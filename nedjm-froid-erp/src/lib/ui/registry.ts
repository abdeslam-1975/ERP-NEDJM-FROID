/**
 * Catalogue of the interface items the super admin can show / hide per role, reorder and rename
 * (Paramètres → Interface). The database only stores the choices (sys_ui_role_hidden,
 * sys_ui_item_overrides, sys_ui_theme), keyed by `itemKey(tabset, id)`.
 *
 * Levels: A = side menu, B = HR module tabs, C = tabs of the other modules, D = tabs inside a record.
 */

export type UiLevel = "A" | "B" | "C" | "D";

export type UiIcon =
  | "home"
  | "users"
  | "contract"
  | "calendar"
  | "pay"
  | "docs"
  | "settings"
  | "site"
  | "finance"
  | "cart"
  | "shield";

export type UiItemDef = {
  id: string;
  labelFr: string;
  labelAr?: string;
  /** Route opened by the item. Hiding the item also blocks this route (and its sub-routes unless `exact`). */
  href?: string;
  exact?: boolean;
  /** Link to a route owned by another item: hiding it only removes the link. */
  alias?: boolean;
  /** Never hidden (home page, settings hub, interface screen). */
  locked?: boolean;
  icon?: UiIcon;
  /** Side menu only: default group. */
  group?: string;
  /** Side menu only: tabset whose first visible item replaces `href` when `href` itself is hidden. */
  childTabset?: string;
  /** HR module bar only: section (RH_SECTIONS) the tab is listed under. */
  section?: string;
  descriptionFr?: string;
  superAdminOnly?: boolean;
};

export type UiTabsetDef = {
  key: string;
  level: UiLevel;
  titleFr: string;
  titleAr: string;
  /** Where the tabs appear, shown in the settings screen. */
  whereFr: string;
  items: UiItemDef[];
};

export type UiGroupDef = { key: string; titleFr: string; titleAr: string };

export const UI_LEVELS: { level: UiLevel; titleFr: string; titleAr: string }[] = [
  { level: "A", titleFr: "Menu latéral", titleAr: "القائمة الجانبية" },
  { level: "B", titleFr: "Onglets Ressources humaines", titleAr: "تبويبات الموارد البشرية" },
  { level: "C", titleFr: "Onglets des autres modules", titleAr: "تبويبات الوحدات الأخرى" },
  { level: "D", titleFr: "Onglets internes des fiches", titleAr: "التبويبات الداخلية" },
];

export const UI_NAV_GROUPS: UiGroupDef[] = [
  { key: "group.pilotage", titleFr: "Pilotage", titleAr: "القيادة" },
  { key: "group.rh", titleFr: "Ressources Humaines", titleAr: "الموارد البشرية" },
  { key: "group.sites", titleFr: "Sites & activités", titleAr: "الورشات" },
  { key: "group.commercial", titleFr: "Commercial", titleAr: "التجاري" },
  { key: "group.finance", titleFr: "Finance & Achats", titleAr: "المالية والمشتريات" },
  { key: "group.admin", titleFr: "Administration", titleAr: "الإدارة" },
];

/** Sections of the HR module bar; a section shows only when one of its tabs is visible. */
export const RH_SECTIONS: UiGroupDef[] = [
  { key: "overview", titleFr: "Vue d'ensemble", titleAr: "نظرة عامة" },
  { key: "people", titleFr: "Personnel", titleAr: "العمال" },
  { key: "time", titleFr: "Temps & présence", titleAr: "الوقت والحضور" },
  { key: "payroll", titleFr: "Paie", titleAr: "الأجور" },
  { key: "documents", titleFr: "Documents", titleAr: "الوثائق" },
  { key: "legal", titleFr: "Juridique", titleAr: "القانوني" },
  { key: "settings", titleFr: "Paramètres", titleAr: "الإعدادات" },
];

export const UI_TABSETS: UiTabsetDef[] = [
  {
    key: "nav",
    level: "A",
    titleFr: "Menu latéral",
    titleAr: "القائمة الجانبية",
    whereFr: "Barre de gauche, toutes les pages",
    items: [
      { id: "home", labelFr: "Tableau de Bord", labelAr: "لوحة القيادة", href: "/", exact: true, icon: "home", group: "group.pilotage", locked: true },
      { id: "simulateur", labelFr: "Simulateur", labelAr: "المحاكي", href: "/simulateur", icon: "docs", group: "group.pilotage" },
      { id: "decisions", labelFr: "Centre de décisions", labelAr: "مركز القرارات", href: "/decisions", icon: "shield", group: "group.pilotage" },
      { id: "rh", labelFr: "Ressources Humaines", labelAr: "الموارد البشرية", href: "/rh", icon: "users", group: "group.rh", childTabset: "rh" },
      { id: "chantiers", labelFr: "Chantiers", labelAr: "الورشات", href: "/referentiels/chantiers", icon: "site", group: "group.sites" },
      { id: "activites", labelFr: "Codes d'activité", labelAr: "رموز النشاط", href: "/referentiels/activites", icon: "site", group: "group.sites" },
      { id: "clients", labelFr: "Clients", labelAr: "العملاء", href: "/referentiels/clients", icon: "users", group: "group.commercial" },
      { id: "contrats", labelFr: "Contrats clients", labelAr: "عقود العملاء", href: "/referentiels/contrats", icon: "contract", group: "group.commercial" },
      { id: "finance", labelFr: "Banque & Caisse", labelAr: "البنك والصندوق", href: "/finance", icon: "finance", group: "group.finance" },
      { id: "achats", labelFr: "Achats", labelAr: "المشتريات", href: "/achats", icon: "cart", group: "group.finance" },
      { id: "utilisateurs", labelFr: "Utilisateurs", labelAr: "المستخدمون", href: "/parametres/utilisateurs", icon: "users", group: "group.admin" },
      { id: "roles", labelFr: "Rôles & droits", labelAr: "الأدوار", href: "/administration/roles", icon: "shield", group: "group.admin" },
      { id: "parametres", labelFr: "Paramètres", labelAr: "إعدادات عامة", href: "/parametres", exact: true, icon: "settings", group: "group.admin", locked: true },
    ],
  },
  {
    key: "rh",
    level: "B",
    titleFr: "Module Ressources humaines",
    titleAr: "وحدة الموارد البشرية",
    whereFr: "Barre d'onglets en haut des pages RH",
    items: [
      { id: "dashboard", labelFr: "Tableau de bord", href: "/rh", exact: true, section: "overview" },
      { id: "employes", labelFr: "Employés", href: "/rh/employes", section: "people" },
      { id: "contrats", labelFr: "Contrats", href: "/rh/contrats", section: "people" },
      { id: "postes", labelFr: "Postes & grille", href: "/rh/postes", section: "people" },
      { id: "presence", labelFr: "Présence", href: "/rh/presence", exact: true, section: "time" },
      { id: "presence_imports", labelFr: "Imports de présences", href: "/rh/presence/imports", section: "time" },
      { id: "conges", labelFr: "Congés", href: "/rh/conges", section: "time" },
      { id: "preparation", labelFr: "Préparation du mois", href: "/rh/paie/preparation", section: "payroll" },
      { id: "paie", labelFr: "Paie", href: "/rh/paie", section: "payroll" },
      { id: "simulateur", labelFr: "Simulateur", href: "/simulateur", alias: true, section: "payroll" },
      { id: "exceptions", labelFr: "Exceptions", href: "/rh/paie/exceptions", section: "payroll" },
      { id: "avances", labelFr: "Avances", href: "/rh/paie/avances", section: "payroll" },
      { id: "virements", labelFr: "Virements", href: "/rh/paie/virements", section: "payroll" },
      { id: "declarations", labelFr: "Déclarations", href: "/rh/paie/declarations", section: "payroll" },
      { id: "operations_externes", labelFr: "Opérations externes", href: "/rh/paie/operations-externes", section: "payroll" },
      { id: "couts", labelFr: "Coûts", href: "/rh/couts", section: "payroll" },
      { id: "interim", labelFr: "Intérim", href: "/rh/interim", section: "people" },
      { id: "sorties", labelFr: "Sorties", href: "/rh/sorties", section: "people" },
      { id: "documents", labelFr: "Documents", href: "/rh/documents", section: "documents" },
      { id: "attestations", labelFr: "Attestations", href: "/rh/attestations", section: "documents" },
      { id: "legal", labelFr: "Cotisations & impôts", href: "/rh/legal", exact: true, section: "legal" },
      { id: "legal_propositions", labelFr: "Propositions légales", href: "/rh/legal/propositions", section: "legal" },
      { id: "legal_documents", labelFr: "Documents juridiques", href: "/rh/legal/documents", section: "legal" },
      { id: "legal_extraction", labelFr: "Extraction IA", href: "/rh/legal/extraction-ia", section: "legal" },
      { id: "legal_veille", labelFr: "Veille juridique", href: "/rh/legal/veille", section: "legal" },
      { id: "qualite", labelFr: "Qualité des données", href: "/rh/qualite-donnees", section: "overview" },
      { id: "parametres", labelFr: "Paramètres", href: "/rh/parametres", section: "settings" },
    ],
  },
  {
    key: "settings",
    level: "C",
    titleFr: "Page Paramètres",
    titleAr: "صفحة الإعدادات",
    whereFr: "Cartes de la page Paramètres",
    items: [
      { id: "interface", labelFr: "Interface", labelAr: "الواجهة", href: "/parametres/interface", locked: true, superAdminOnly: true, descriptionFr: "Modules et onglets visibles par rôle, ordre, libellés et couleurs." },
      { id: "utilisateurs", labelFr: "Utilisateurs", labelAr: "المستخدمون", href: "/parametres/utilisateurs", alias: true, descriptionFr: "Comptes, invitations, rôles et chantiers de chaque utilisateur." },
      { id: "roles", labelFr: "Rôles", labelAr: "الأدوار", href: "/administration/roles", alias: true, descriptionFr: "Rôles disponibles et leur niveau." },
      { id: "permissions", labelFr: "Matrice des permissions", labelAr: "مصفوفة الصلاحيات", href: "/administration/permissions", descriptionFr: "Droits lire / créer / modifier / supprimer / imprimer / exporter par rôle et par écran." },
      { id: "periodes", labelFr: "Clôture des périodes", labelAr: "إقفال الفترات", href: "/administration/periodes", descriptionFr: "Verrouillage des mois clôturés." },
      { id: "audit", labelFr: "Journal d'audit", labelAr: "سجل التدقيق", href: "/administration/audit", descriptionFr: "Historique des modifications." },
      { id: "rh_parametres", labelFr: "Paramètres RH", labelAr: "إعدادات الموارد البشرية", href: "/rh/parametres", alias: true, descriptionFr: "Rubriques de salaire, modèle de fiche, listes et codes, bulletin." },
      { id: "rh_legal", labelFr: "Cotisations & impôts", labelAr: "الاشتراكات والضرائب", href: "/rh/legal", alias: true, descriptionFr: "CNAS, CACOBATPH, barème IRG, SNMG et variables légales." },
      { id: "legendes", labelFr: "Légendes de présence", labelAr: "رموز الحضور", href: "/referentiels/legendes", descriptionFr: "Codes du pointage et leurs coefficients." },
      { id: "finance_parametres", labelFr: "Paramètres finance", labelAr: "إعدادات المالية", href: "/finance/parametres", descriptionFr: "Comptes, TVA, modes de paiement, catégories, clôtures." },
      { id: "achats_parametres", labelFr: "Paramètres achats", labelAr: "إعدادات المشتريات", href: "/achats/parametres", descriptionFr: "Profils d'impression, types de situation, timbre, numérotation." },
    ],
  },
  {
    key: "rh_settings",
    level: "C",
    titleFr: "Paramètres RH",
    titleAr: "إعدادات الموارد البشرية",
    whereFr: "RH → Paramètres",
    items: [
      { id: "salary", labelFr: "Rubriques de salaire" },
      { id: "fiche", labelFr: "Modèle de fiche" },
      { id: "catalogs", labelFr: "Listes et codes" },
      { id: "bulletin", labelFr: "Modèle de bulletin" },
      { id: "attendance", labelFr: "Feuille de présence" },
    ],
  },
  {
    key: "rh_legal",
    level: "C",
    titleFr: "Cotisations & impôts",
    titleAr: "الاشتراكات والضرائب",
    whereFr: "RH → Cotisations & impôts",
    items: [
      { id: "cnas", labelFr: "CNAS" },
      { id: "cacobatph", labelFr: "CACOBATPH" },
      { id: "irg", labelFr: "Impôts (IRG)" },
      { id: "other", labelFr: "Autres (SNMG…)" },
    ],
  },
  {
    key: "salary_rubrics",
    level: "C",
    titleFr: "Rubriques de salaire",
    titleAr: "بنود الأجر",
    whereFr: "RH → Paramètres → Rubriques de salaire",
    items: [
      { id: "dict", labelFr: "Dictionnaire" },
      { id: "values", labelFr: "Valeurs" },
      { id: "import", labelFr: "Import" },
    ],
  },
  {
    key: "att_imports",
    level: "C",
    titleFr: "Imports de présences",
    titleAr: "استيراد الحضور",
    whereFr: "RH → Imports de présences",
    items: [
      { id: "lots", labelFr: "Lots" },
      { id: "validation", labelFr: "À valider" },
      { id: "codes", labelFr: "Correspondances de codes" },
      { id: "politique", labelFr: "Politique de validation" },
    ],
  },
  {
    key: "rule_proposals",
    level: "C",
    titleFr: "Propositions légales",
    titleAr: "المقترحات القانونية",
    whereFr: "RH → Propositions légales",
    items: [
      { id: "open", labelFr: "En cours" },
      { id: "submitted", labelFr: "À approuver" },
      { id: "approved", labelFr: "Approuvées, date à décider" },
      { id: "all", labelFr: "Toutes" },
    ],
  },
  {
    key: "legal_watch",
    level: "C",
    titleFr: "Veille juridique",
    titleAr: "المراقبة القانونية",
    whereFr: "RH → Veille juridique",
    items: [
      { id: "textes", labelFr: "Textes détectés" },
      { id: "sources", labelFr: "Sources surveillées" },
      { id: "domaines", labelFr: "Domaines autorisés" },
      { id: "mots-cles", labelFr: "Mots-clés" },
      { id: "historique", labelFr: "Historique" },
    ],
  },
  {
    key: "finance",
    level: "C",
    titleFr: "Banque & Caisse",
    titleAr: "البنك والصندوق",
    whereFr: "Banque & Caisse",
    items: [
      { id: "dashboard", labelFr: "Vue d'ensemble" },
      { id: "operations", labelFr: "Opérations" },
      { id: "advances", labelFr: "Avances caisse" },
      { id: "reconciliation", labelFr: "Rapprochement" },
    ],
  },
  {
    key: "finance_settings",
    level: "C",
    titleFr: "Paramètres finance",
    titleAr: "إعدادات المالية",
    whereFr: "Banque & Caisse → Paramètres",
    items: [
      { id: "accounts", labelFr: "Comptes" },
      { id: "tax", labelFr: "TVA" },
      { id: "methods", labelFr: "Modes de paiement" },
      { id: "categories", labelFr: "Catégories" },
      { id: "periods", labelFr: "Clôtures" },
    ],
  },
  {
    key: "purchases",
    level: "C",
    titleFr: "Achats",
    titleAr: "المشتريات",
    whereFr: "Achats",
    items: [
      { id: "dashboard", labelFr: "Pilotage" },
      { id: "proformas", labelFr: "Proformas" },
      { id: "orders", labelFr: "Bons de commande" },
      { id: "receipts", labelFr: "Réceptions" },
      { id: "invoices", labelFr: "Factures & paiements" },
      { id: "suppliers", labelFr: "Fournisseurs" },
    ],
  },
  {
    key: "purchase_settings",
    level: "C",
    titleFr: "Paramètres achats",
    titleAr: "إعدادات المشتريات",
    whereFr: "Achats → Paramètres",
    items: [
      { id: "profiles", labelFr: "Profils d’impression" },
      { id: "situations", labelFr: "Types de situation" },
      { id: "stamp", labelFr: "Timbre légal" },
      { id: "sequences", labelFr: "Numérotation" },
    ],
  },
  {
    key: "decisions",
    level: "C",
    titleFr: "Centre de décisions",
    titleAr: "مركز القرارات",
    whereFr: "Centre de décisions",
    items: [
      { id: "open", labelFr: "À traiter" },
      { id: "closed", labelFr: "Décisions confirmées et closes" },
    ],
  },
  {
    key: "client_contract",
    level: "D",
    titleFr: "Fiche contrat client",
    titleAr: "بطاقة عقد الزبون",
    whereFr: "Contrats clients → un contrat",
    items: [
      { id: "header", labelFr: "En-tête & financier" },
      { id: "contre", labelFr: "Contre-facturation" },
      { id: "labor", labelFr: "Main-d'œuvre" },
      { id: "spares", labelFr: "Pièces" },
      { id: "consumption", labelFr: "Consommation" },
      { id: "invoicing", labelFr: "Facturation" },
      { id: "balance", labelFr: "Solde" },
      { id: "pilotage", labelFr: "Pilotage" },
      { id: "penalties", labelFr: "Pénalités" },
      { id: "clauses", labelFr: "Clauses & résiliation" },
      { id: "documents", labelFr: "Documents" },
      { id: "margin", labelFr: "Gardes de marge" },
      { id: "rh", labelFr: "RH / AN" },
      { id: "canva", labelFr: "Canva Excel" },
    ],
  },
  {
    key: "client_fiche",
    level: "D",
    titleFr: "Fiche client",
    titleAr: "بطاقة الزبون",
    whereFr: "Clients → un client",
    items: [
      { id: "identite", labelFr: "Identité" },
      { id: "contrats", labelFr: "Contrats" },
      { id: "penalites", labelFr: "Pénalités" },
      { id: "correspondances", labelFr: "Correspondances" },
    ],
  },
  {
    key: "hr_contract_page",
    level: "D",
    titleFr: "Page Contrats RH",
    titleAr: "صفحة عقود العمل",
    whereFr: "RH → Contrats",
    items: [
      { id: "contrat", labelFr: "Contrat de travail" },
      { id: "rubriques", labelFr: "Rubriques de salaire" },
      { id: "legal", labelFr: "Cotisations & impôts" },
    ],
  },
  {
    key: "hr_contract_form",
    level: "D",
    titleFr: "Fenêtre d'un contrat RH",
    titleAr: "نافذة عقد العمل",
    whereFr: "RH → Contrats → ouvrir un contrat",
    items: [
      { id: "contrat", labelFr: "Contrat de travail" },
      { id: "affectations", labelFr: "Affectations" },
      { id: "avenants", labelFr: "Avenants salaire" },
      { id: "rubriques", labelFr: "Rubriques de salaire" },
      { id: "legal", labelFr: "Cotisations & impôts" },
    ],
  },
  {
    key: "hr_documents",
    level: "D",
    titleFr: "Documents RH",
    titleAr: "وثائق الموارد البشرية",
    whereFr: "RH → Documents",
    items: [
      { id: "corr", labelFr: "أوامر المهمة — Ordres de mission" },
      { id: "files", labelFr: "الوثائق الرسمية — Pièces officielles" },
    ],
  },
  {
    key: "hr_attendance",
    level: "D",
    titleFr: "Pointage",
    titleAr: "الحضور",
    whereFr: "RH → Présence",
    items: [
      { id: "site", labelFr: "Par chantier" },
      { id: "employee", labelFr: "Par employé" },
    ],
  },
];

/** Pseudo tabset of the settings screen: the side menu groups (order and titles). */
export const NAV_GROUPS_TABSET = "nav_groups";

export function itemKey(tabset: string, id: string): string {
  return `${tabset}.${id.replace(/-/g, "_")}`;
}

export function findTabset(key: string): UiTabsetDef | undefined {
  return UI_TABSETS.find((t) => t.key === key);
}

const ITEM_INDEX = new Map<string, { tabset: UiTabsetDef; item: UiItemDef; index: number }>();
for (const tabset of UI_TABSETS) {
  tabset.items.forEach((item, index) => ITEM_INDEX.set(itemKey(tabset.key, item.id), { tabset, item, index }));
}

export function findItem(key: string) {
  return ITEM_INDEX.get(key);
}

export function isGroupKey(key: string): boolean {
  return UI_NAV_GROUPS.some((g) => g.key === key);
}

export function isLockedKey(key: string): boolean {
  return Boolean(ITEM_INDEX.get(key)?.item.locked);
}
