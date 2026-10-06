import { SETTINGS_GROUPS } from "@/lib/ui/settings-center";

export type AppPage = { href: string; fr: string; ar: string; keywords?: string };

/** Pages reachable from the global search and the HR assistant; each one is filtered with `isPathBlocked`. */
export const APP_PAGES: AppPage[] = [
  { href: "/", fr: "Tableau de bord", ar: "لوحة القيادة" },
  { href: "/rh", fr: "Ressources humaines", ar: "الموارد البشرية" },
  { href: "/rh/employes", fr: "Employés", ar: "العمال", keywords: "fiche salarie personnel" },
  { href: "/rh/postes", fr: "Postes & grille", ar: "المناصب" },
  { href: "/rh/presence", fr: "Présence / pointage", ar: "الحضور" },
  { href: "/rh/presence/imports", fr: "Imports de présences", ar: "استيراد الحضور", keywords: "pointeuse badge" },
  { href: "/rh/conges", fr: "Congés", ar: "العطل" },
  { href: "/rh/paie/preparation", fr: "Préparation du mois", ar: "تحضير الشهر" },
  { href: "/rh/paie", fr: "Paie", ar: "الأجور", keywords: "salaire" },
  { href: "/rh/paie/social", fr: "Paie — social (CNAS)", ar: "الضمان الاجتماعي" },
  { href: "/rh/paie/fiscal", fr: "Paie — fiscal (IRG)", ar: "الضريبة" },
  { href: "/rh/paie/exceptions", fr: "Exceptions de paie", ar: "استثناءات" },
  { href: "/rh/paie/avances", fr: "Avances & prêts", ar: "التسبيقات والقروض" },
  {
    href: "/simulateur",
    fr: "Simulateur",
    ar: "المحاكي",
    keywords: "test fiche de paie pointage conge stc ordre de mission contrat variables",
  },
  { href: "/rh/paie/virements", fr: "Virements des salaires", ar: "تحويل الأجور" },
  { href: "/rh/paie/declarations", fr: "Déclarations", ar: "التصريحات", keywords: "cnas das g50" },
  { href: "/rh/couts", fr: "Coûts de la paie", ar: "التكاليف" },
  { href: "/rh/interim", fr: "Intérim", ar: "العمل المؤقت" },
  { href: "/rh/sorties", fr: "Sorties", ar: "الخروج", keywords: "depart stc fin de contrat" },
  {
    href: "/rh/documents",
    fr: "Documents RH",
    ar: "الوثائق",
    keywords:
      "contrat de travail bulletin de paie kashf ajr كشف الاجر العقود ordre de mission titre de conge fiche de renseignements",
  },
  { href: "/rh/attestations", fr: "Attestations", ar: "الشهادات" },
  { href: "/rh/qualite-donnees", fr: "Qualité des données", ar: "جودة البيانات" },
  { href: "/referentiels/clients", fr: "Clients", ar: "العملاء", keywords: "fiche client nif" },
  { href: "/referentiels/contrats", fr: "Contrats clients", ar: "عقود العملاء", keywords: "commercial" },
  { href: "/referentiels/chantiers", fr: "Chantiers", ar: "الورشات", keywords: "sites" },
  { href: "/referentiels/activites", fr: "Codes d'activité", ar: "رموز النشاط" },
  { href: "/finance", fr: "Banque & caisse", ar: "البنك والصندوق" },
  { href: "/achats", fr: "Achats", ar: "المشتريات" },
  { href: "/parametres/utilisateurs", fr: "Utilisateurs", ar: "المستخدمون" },
  { href: "/administration/roles", fr: "Rôles & droits", ar: "الأدوار" },
  { href: "/parametres", fr: "Paramètres", ar: "إعدادات عامة" },
  // Sections open to every role (the others are found from the settings center itself).
  ...SETTINGS_GROUPS.flatMap((g) =>
    g.sections
      .filter((s) => !s.roles && !s.superAdminOnly)
      .map((s) => ({ href: s.href, fr: `Paramètres — ${s.labelFr}`, ar: s.labelAr, keywords: s.keywords })),
  ),
];
