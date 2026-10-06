export type GuideTopic = {
  /** Page the topic documents; the topic is only given to users who can open it. */
  path: string;
  title: string;
  body: string;
};

/** How the HR module works, written for the assistant. Keep it factual: the model answers only from this text. */
export const HR_GUIDE: GuideTopic[] = [
  {
    path: "/rh",
    title: "Vue d'ensemble",
    body: `Page d'accueil du module RH : effectif actif, contrats par type, alertes (contrats qui arrivent à échéance…), actions rapides et carte « Tableau de présence » qui ouvre directement la grille de pointage du mois.
La barre du haut regroupe les sections du module ; la recherche (Ctrl K) trouve un employé par nom ou matricule, ou une page.`,
  },
  {
    path: "/rh/employes",
    title: "Employés (base de données du personnel)",
    body: `Liste de tous les employés avec recherche, filtres et affichage liste / cartes / tableau complet.
Actions sur une ligne : « Ouvrir » affiche la fiche de renseignements telle qu'elle sera imprimée, avec un bouton Imprimer ; « Modifier » ouvre la fenêtre d'édition de la fiche ; « Dossier » regroupe les contrats, documents et historique de l'employé ; « Désactiver » retire l'employé de l'effectif actif sans supprimer son historique.
Nouvel employé : bouton d'ajout, le matricule est proposé automatiquement.
« Importer l'ancienne base » (vue tableau) : choisir un fichier Excel (.xlsx) ou CSV, vérifier la ligne d'en-tête et la correspondance des colonnes, puis lancer l'import. Seuls les nouveaux employés sont créés ; les doublons et les lignes invalides sont signalés et ignorés ; un matricule vide est attribué automatiquement.
Les champs de la fiche (et leur ordre) se règlent dans Paramètres RH > modèle de fiche.`,
  },
  {
    path: "/rh/employes",
    title: "Contrats de travail",
    body: `Chaque employé a un ou plusieurs contrats (CDD, CDI, intérim…) avec chantier, poste, dates de début et de fin, régime et salaire de base. Le contrat marqué « affectation principale » détermine le chantier où l'employé apparaît dans le pointage et la paie.
Un changement d'affectation peut être daté : il s'applique au début du mois choisi.
Un contrat qui arrive à échéance apparaît dans les alertes de la vue d'ensemble ; son renouvellement se fait depuis le dossier de l'employé. Le contrat imprimé se génère dans Documents RH.`,
  },
  {
    path: "/rh/postes",
    title: "Postes & grille",
    body: `Catalogue des postes (intitulé français / arabe, qualification) et grille des salaires de référence utilisée pour proposer le salaire d'un contrat.`,
  },
  {
    path: "/rh/presence",
    title: "Temps & présence (pointage)",
    body: `Grille mensuelle par chantier : une ligne par employé, une colonne par jour, chaque case reçoit une légende.
Légendes courantes : P présent, P/2 demi-journée, MS mission, CA congé annuel, CRP récupération, CM congé maladie, CSS congé sans solde, AJ absence justifiée, AN absence injustifiée, AOP absence autorisée payée, JF jour férié, W week-end, AP abandon de poste. La liste et les couleurs se règlent dans Paramètres RH.
Remplissage automatique : un ordre de mission remplit « MS » dès sa date de début et, s'il est ouvert, couvre les 12 mois suivants ; le remplissage s'arrête dès qu'un congé l'interrompt. Un titre de congé remplit « CA » sur sa période.
Le mois pointé alimente la préparation de la paie.`,
  },
  {
    path: "/rh/presence/imports",
    title: "Imports de présences",
    body: `Import des fichiers de la pointeuse : chaque import est contrôlé (employés reconnus, jours en conflit) avant d'être appliqué à la grille de présence. L'historique des imports reste consultable.`,
  },
  {
    path: "/rh/conges",
    title: "Congés",
    body: `Demandes de congé : annuel, récupération, maladie, sans solde, exceptionnel. Statuts : soumise, approuvée, refusée, annulée. Une demande approuvée produit le titre de congé et marque les jours dans le pointage.
Solde de congé annuel = reprises / ajustements + droits acquis (2,5 jours par mois travaillé par défaut, variable légale CONGE_JOURS_MOIS) − congés annuels approuvés. Les ajustements servent à saisir un solde d'ouverture ou une correction motivée.`,
  },
  {
    path: "/rh/paie/preparation",
    title: "Préparation du mois",
    body: `Tableau de contrôle du mois, en lecture seule, par mois et par chantier : chaque contrôle indique son niveau et un lien « Ouvrir » vers l'écran où corriger. Les règles légales en attente bloquent la paie réelle.
Le lancement de la paie reste manuel et passe par une décision : D4 (génération) ou D1 si des règles sont en attente.`,
  },
  {
    path: "/rh/paie",
    title: "Calcul de la paie",
    body: `Calcul des bulletins par mois et par chantier à partir du pointage, des contrats, des rubriques et des variables légales.
Cycle : Brouillon (recalculable) → Validé (peut revenir en brouillon) → Clôturé (définitif, réservé à la direction). Les bulletins s'impriment depuis la paie ou Documents RH.`,
  },
  {
    path: "/rh/paie/exceptions",
    title: "Exceptions de paie",
    body: `Primes, retenues ou rappels ponctuels pour un employé et un mois donnés ; ils s'ajoutent au calcul du bulletin de ce mois.`,
  },
  {
    path: "/rh/paie/avances",
    title: "Avances & prêts",
    body: `Avances sur salaire et prêts avec échéancier : la retenue du mois est reprise automatiquement dans la paie.`,
  },
  {
    path: "/rh/paie/virements",
    title: "Virements des salaires",
    body: `Prépare les ordres de virement des nets à payer d'un mois validé, par banque ou CCP.`,
  },
  {
    path: "/rh/paie/declarations",
    title: "Déclarations",
    body: `Déclarations sociales et fiscales (CNAS, IRG) établies à partir de la paie du mois.`,
  },
  {
    path: "/rh/couts",
    title: "Coûts de la paie",
    body: `Coût employeur par mois, chantier et activité (salaires bruts + charges patronales).`,
  },
  {
    path: "/rh/interim",
    title: "Intérim",
    body: `Travailleurs mis à disposition par une agence d'intérim, payés au taux journalier du contrat ; leurs jours sont pointés comme les autres employés.`,
  },
  {
    path: "/rh/sorties",
    title: "Sorties",
    body: `Départs (fin de contrat, démission, licenciement, abandon de poste) : la sortie ferme le contrat et prépare le reçu pour solde de tout compte (STC) et le certificat de travail.`,
  },
  {
    path: "/rh/documents",
    title: "Documents RH",
    body: `Génération et registre des documents : ordre de mission, titre de congé, récupération, attestation, contrat de travail, certificat de travail, STC, fiche de renseignements, bulletins de paie.
Chaque document reçoit une référence unique jamais réutilisée et une copie est archivée. Créer un ordre de mission ou un titre de congé met à jour le pointage automatiquement.`,
  },
  {
    path: "/rh/attestations",
    title: "Attestations",
    body: `Attestations de travail et de salaire générées à la demande pour un employé, avec numéro unique.`,
  },
  {
    path: "/parametres/rh/cotisations",
    title: "Cotisations & impôts",
    body: `Variables légales datées : taux CNAS, CACOBATPH, barème IRG, SNMG, droits à congé. Une nouvelle valeur s'applique à partir de sa date d'effet sans modifier les paies passées.
« Extraction IA » propose des valeurs à partir d'un texte juridique ; chaque proposition cite l'extrait source et doit être validée avant d'être appliquée.`,
  },
  {
    path: "/rh/qualite-donnees",
    title: "Qualité des données",
    body: `Contrôle du référentiel et des affectations datées : chantiers sans wilaya codée (la wilaya détermine la zone IRG) et contrats qui ne commencent pas le 1er du mois. Rien n'est corrigé d'office : chaque point est confirmé ou soumis à décision.`,
  },
  {
    path: "/parametres/rh",
    title: "Paramètres RH",
    body: `Tous les réglages RH sont dans Paramètres → Ressources humaines, une section chacun : rubriques de salaire, modèle de bulletin, cotisations & impôts, modèle de fiche employé (champs, ordre, obligatoires), listes et codes (dont les légendes de présence), feuille de présence et modèles de documents. Les pages de travail y renvoient directement.`,
  },
  {
    path: "/simulateur",
    title: "Simulateur",
    body: `Teste un calcul (bulletin, pointage, congé, STC, ordre de mission, contrat) sans rien enregistrer.`,
  },
];
