# 02 — Temps & présence (notes pour le manuel utilisateur RH)

> Notes de travail établies par lecture du code source (Next.js `nedjm-froid-erp`, migrations Supabase). Aucune
> donnée réelle n'a été consultée : les valeurs « par défaut » sont celles du code et des migrations ; elles peuvent
> avoir été modifiées dans la base de production (droits, codes, coefficients, libellés d'onglets personnalisés).
> Les points incertains sont signalés par **⚠ À vérifier**.

---

## 0. Repères généraux

### 0.1 Navigation (barre d'onglets en haut des pages RH)

Section « temps » du module RH (registre d'interface `src/lib/ui/registry.ts`) :

| Onglet RH | Route |
|---|---|
| Présence | `/rh/presence` |
| Imports de présences | `/rh/presence/imports` |
| Congés | `/rh/conges` |

Autres écrans utilisés dans ce périmètre :

- **Registre** (`/rh/documents`) : registres « Ordres de mission » (`?onglet=missions`) et « Titres de congé » (`?onglet=conges`).
- **Paramètres** (`/rh/parametres`) : onglet « Feuille de présence » (`?tab=attendance`) et onglet « Listes et codes » (légendes de présence et coefficients).
- **Centre de décisions** (`/decisions`) : décisions D3, D4, D5, D7, D11, D12, D14 citées plus bas.
- Recherche globale : entrées « Présence / pointage · الحضور » et « Congés · العطل ».
- Tableau de bord RH (`/rh`) : raccourcis « Pointage » et « Congé ».

⚠ À vérifier : le SUPER_ADMIN peut renommer, masquer ou réordonner les onglets par rôle (Paramètres → Interface) ;
les libellés ci-dessus sont les libellés d'origine.

### 0.2 Vocabulaire et statuts d'une présence (table `hr_attendance`)

Une case de la grille = un employé × un chantier × un jour × un **code de présence** (légende).

- **Origine** (`source_code`) :
  - `MANUAL` : saisie manuelle dans la grille ;
  - `OM` : proposée par un ordre de mission ;
  - `AUTO` : proposée automatiquement (congé approuvé) ;
  - `IMPORT` : importée depuis l'écran des imports d'archives.
- **Statut** : `PROPOSED` (proposée, non validée) ou `VALIDATED` (validée).
- **La paie ne lit que les présences validées.** La préparation du mois signale « N présences proposées non validée(s), ignorée(s) par la paie ».

### 0.3 Mois figés par la paie

Le statut de la paie du mois (chantier concerné, ou paie « toute l'entreprise ») détermine ce qui reste modifiable :

| Statut de la paie du mois | Effet sur la présence |
|---|---|
| Aucune paie, ou paie brouillon (DRAFT) | Tout est modifiable. Les brouillons concernés sont signalés « données modifiées depuis le calcul » (décision D3). |
| VALIDATED (validée) | La grille est figée en écriture. Les présences déjà validées ne peuvent pas être modifiées. Seules de nouvelles **propositions** (par exemple un nouvel OM) peuvent encore apparaître. |
| LOCKED (clôturée) | Rien n'est modifiable, ni ajoutable. |

Message de la base en cas de tentative : « Pointage figé du {date} : paie {VALIDATED|LOCKED}. » La réouverture d'une
paie passe par la décision **D7** (SUPER_ADMIN).

### 0.4 Week-end et fuseau horaire

Le week-end affiché (colonnes grisées) est vendredi + samedi. Les dates « aujourd'hui » sont calculées selon le
fuseau Africa/Algiers.

---

## 1. Description des pages (mise en page)

### 1.1 Page « Temps & présence » — `/rh/presence`

- **Titre de la barre RH** : « Pointage ». **Sur-titre** : « Pointage des équipes ». **Titre de la page** : « Temps & présence ».
- **Boutons d'en-tête** :
  - « Importer pointeuse » : lien vers `/rh/presence/imports` (imports d'archives) ;
  - « Nouveau congé » (bouton principal) : lien vers `/rh/conges`.
- **Indicateurs (KPI)**, 4 cartes : « Présents », « Absents », « En congé », « En mission ».
  - Elles portent sur le **dernier jour pointé des 31 derniers jours** (au plus 1000 présences lues).
  - Une ligne sous les cartes indique « Dernier jour pointé : {jour} », ou « Aucun pointage enregistré ces 30 derniers jours ».
  - Classement des codes :
    - MS, ou libellé commençant par « mission » → en mission ;
    - libellé commençant par « congé » → en congé ;
    - libellé commençant par « absence » ou « abandon » → absent ;
    - code comptant comme présence → présent.
  - ⚠ À vérifier : les KPI comptent toutes les présences (proposées comprises). Elles ne sont filtrées que par le paramètre d'URL `site`, pas par le chantier choisi dans la grille.
- **Barre d'outils de la grille** (de gauche à droite) :
  1. Onglets « **Par chantier** » / « **Par employé** ».
  2. Navigation de mois :
     - ◀ « Mois précédent » ;
     - bouton du mois en cours (ouvre « Choisir le mois » : flèches « Année précédente » / « Année suivante » et grille Janv. … Déc. ; le mois courant est entouré) ;
     - ▶ « Mois suivant ».
  3. Choix du périmètre :
     - mode Par chantier : liste « Chantier » (tous les chantiers visibles) ;
     - mode Par employé : champ de recherche « Matricule ou nom de l'employé ».
  4. Pastilles d'état (voir § 2.1).
  5. « **Importer** » : import rapide d'un classeur Excel dans la grille (voir § 2.8).
  6. Pastille de couleurs « **Légende des codes** » (popover).
  7. « … » « **Plus d'actions** » :
     - « Modèle Excel » ;
     - « Imprimer / archiver le mois » ;
     - interrupteur « Totaux par code » ;
     - liens « Fiche employé » (`/rh/employes`), « Imports d'archives » (`/rh/presence/imports`), « Paramètres » (`/rh/parametres`).
  8. Bouton principal « **Valider** » (infobulle « Valider les valeurs renseignées ») ; un point orange signale des modifications non validées.
- **Grille** :
  - Une ligne par employé (contrat couvrant au moins un jour du mois sur le chantier).
  - Colonnes configurables (voir § 1.4) : N°, MAT, NOM (figée à gauche), PRÉNOM, POSTE OCCUPE, AFFECTATION, Début contrat, colonnes de saisie, jours 1…28/31, totaux par code, NJ, Coef.
  - Ligne de pied « Total ».
- **Paramètres d'URL** : `?employee=<id>&site=<id>&mois=AAAA-MM`. Ce lien ouvre directement le mode « Par employé » sur cet employé et ce mois. Il est utilisé par « Voir le pointage » (ordres de mission) et par « Ouvrir le pointage » après l'enregistrement d'un OM.

### 1.2 Page « Imports de présences » — `/rh/presence/imports`

- **Titre de la barre RH** : « Imports de présences ». **En-tête** : « Imports d'archives de présence », avec une phrase d'explication.
- **Barre d'outils** : lien « Modèle « une ligne par jour » » et bouton « **Déposer un fichier** » (si droit de création).
- **Encadré d'information permanent** : un import ne crée ni ne recalcule aucune paie ; les lignes restent des propositions jusqu'à validation ; janvier–août 2026 = période de reprise.
- **Onglets** (paramètre `vue`) :
  - « **Lots (N)** » (`vue=lots`) ;
  - « **À valider (N)** » (`vue=validation`, lots au statut « Importé, à valider ») ;
  - « **Correspondances de codes (N à confirmer)** » (`vue=codes`) ;
  - « **Politique de validation** » (`vue=politique`).
- **Tableau des lots** :
  - Colonnes :
    - Lot : n° « IMP-AAAA-NNNN » + format « Grille » / « Lignes » ;
    - Période : + nature « Opérationnel » / « Reprise » / « Reprise et opérationnel » ;
    - Chantier(s) ;
    - Provenance ;
    - Lignes : « x lues · y acceptées · z rejetées · w en conflit » ;
    - Statut ;
    - Déposé : par / date.
  - Recherche « Rechercher un lot, un chantier… ».
  - Vides : « Aucun lot importé en attente de validation. » (onglet À valider) ou « Aucun lot d'import pour le moment. ».
- **Panneau de détail d'un lot** (`?lot=<id>`) : voir § 3.3.
- Accès refusé : redirection vers `/login` (non connecté) ou vers l'accueil avec erreur « forbidden ».

### 1.3 Page « Congés & absences » — `/rh/conges`

- **Titre de la barre RH** : « Congés & absences ».
- **Encadré d'information** : « Une demande approuvée génère un titre de congé numéroté et propose les jours (CA, CRP, CM, CSS, AOP) sur la feuille de présence. Le solde annuel = jours acquis (taux mensuel × mois travaillés) + ajustements − congés annuels approuvés. »
- **Boutons d'onglet** : « Demandes · الطلبات », « Soldes · الأرصدة », « Ajustements / reprise de solde · التعديلات ».
- **Onglet Demandes** :
  - formulaire « Nouvelle demande de congé · طلب عطلة جديد » ;
  - tableau des demandes, avec filtre « À traiter / en cours » / « Historique complet ».
- **Onglet Soldes** : tableau des soldes.
- **Onglet Ajustements** : formulaire d'ajustement (décideurs) et tableau des ajustements.

### 1.4 Paramètres RH → onglet « Feuille de présence » — `/rh/parametres?tab=attendance`

- Réservé au **SUPER_ADMIN**.
- Titre « Feuille de présence — colonnes et droits » (avec texte arabe). Mention : « Aucune colonne financière n'est proposée… ».
- Bouton « **Enregistrer** ».
- Tableau des colonnes :
  - Ordre (↑ « Monter » / ↓ « Descendre ») ;
  - Code, Libellé FR, Libellé AR ;
  - Nature ;
  - Active ;
  - une paire de cases **Voir / Modifier** par rôle ;
  - « Supprimer ».
- Bloc « Ajouter une colonne de saisie · إضافة عمود ».
- Autres onglets de Paramètres RH (hors périmètre) : Rubriques de salaire, Cotisations & impôts, Modèle de fiche, Listes et codes, Modèle de bulletin.

### 1.5 Paramètres RH → onglet « Listes et codes » → panneau « Légendes de présence · رموز الحضور »

- Formulaire : code, libellé FR, libellé AR, coefficient, couleur.
- Boutons « Enregistrer le code » et « Nouveau code ».
- Liste des codes en pastilles « CODE · coef ».
- Sous le formulaire, quand un code existant est sélectionné : bloc de demande de changement de coefficient (D14).
- ⚠ Important : l'entrée de menu **Paramètres → « Légendes de présence »** (`/referentiels/legendes`, description « Codes du pointage et leurs coefficients. ») ouvre **un écran d'attente non fonctionnel**. Cet écran affiche « Légendes de présence » et « P, MS, CRP, AN, CM, AOP — coefficient et effet pass-through AN. ». La gestion réelle se fait dans Paramètres RH → Listes et codes.

### 1.6 Registre → « Ordres de mission » et « Titres de congé » — `/rh/documents`

- Cartes d'accès : Fiche de renseignements, Contrat de travail, Ordre de mission, Titre de congé, Bulletin de paie.
- **Ordres de mission** :
  - description « Archivés à l'enregistrement et consultables à tout moment. » ;
  - bouton « **Nouvel ordre de mission** » ;
  - colonnes : Référence (+ « Établi le »), Employé, Mission (destination + période, ou « Fin de mission »), Établi par ;
  - actions de ligne : « Consulter », « Modifier », « Voir le pointage ».
- **Titres de congé** :
  - description « Un titre numéroté par congé approuvé : complétez-le, puis imprimez. » ;
  - bouton « **Nouveau titre de congé** » ;
  - colonnes : Référence (+ « Émis le »), Employé, Nature, Période (+ jours), État (Annulé / Complété / À compléter) ;
  - actions : « Ouvrir le PDF archivé », « Ouvrir le titre », « Imprimer ».
- Liens directs : `?onglet=conges&titre=<id>` ouvre un titre ; `?nouveau=om` ouvre un nouvel OM.

---

## 2. Grille de présence (`/rh/presence`)

### 2.1 Consulter la grille d'un chantier pour un mois

- **Titre** : Par chantier · (pas de libellé arabe dans l'onglet).
- **Où** : RH → Présence → onglet « Par chantier » → liste « Chantier » + navigation de mois.
- **À quoi ça sert** : voir et saisir le pointage mensuel de tous les employés d'un chantier.
- **Prérequis** :
  - droit écran « Présence » (`hr_attendance`, lecture) sur le chantier ;
  - au moins une colonne visible pour son rôle (voir § 5.1) ;
  - des contrats couvrant le mois sur ce chantier.
- **Étapes** :
  1. Choisir le chantier dans « Chantier ».
  2. Changer de mois avec ◀ / ▶, ou cliquer sur le mois → « Choisir le mois » → année (flèches) → mois.
  3. Si des modifications ne sont pas validées, un changement de mois ou de chantier demande confirmation : « Des modifications non validées seront perdues. Continuer ? ».
- **Résultat / affichage** :
  - **Lignes** : un employé par contrat couvrant au moins un jour du mois sur ce chantier, contrats terminés compris (une ligne par employé × chantier, le contrat le plus récent).
  - **En-têtes de jours** : numéro du jour + jour abrégé (Dim, Lun, Mar, Mer, Jeu, Ven, Sam). Le week-end (Ven, Sam) est ombré ; le jour courant est mis en évidence.
  - **Couleur des cases** : teinte de la couleur du code.
  - **Cases proposées** (OM, auto, import non validés) : *italique gris*. Une case **OM validée** est soulignée.
  - **Infobulle d'une case** : « CODE · libellé » + origine bilingue :
    - « Proposé par l'ordre de mission N° X — non validé · مقترح من أمر المهمة — غير معتمد » ;
    - « Ordre de mission N° X — validé · من أمر المهمة — معتمد » ;
    - « Importé des archives — à valider depuis l'écran des imports · مستورد — غير معتمد » ;
    - « Importé des archives — validé · مستورد — معتمد » ;
    - « Proposé automatiquement — non validé · مقترح تلقائيًا — غير معتمد » ;
    - « Automatique — validé » ;
    - « Saisie manuelle — non validée · إدخال يدوي — غير معتمد » ;
    - « Saisie manuelle — validée · إدخال يدوي — معتمد ».
  - **Pastilles d'état** :
    - « N proposé(s) OM » (gris) : propositions non manuelles et non importées, **y compris celles issues d'un congé (AUTO)** — ⚠ libellé « OM » trompeur ;
    - « N à valider » (orange) : saisies manuelles non validées ;
    - « N importée(s) » (bleu) : lien vers `/rh/presence/imports?vue=validation` ;
    - « Lecture seule » ;
    - « Tout est validé ».
  - **États vides** :
    - « Chargement… » ;
    - « Aucune colonne autorisée pour votre rôle sur ce chantier. » ;
    - « Aucun contrat sur ce chantier pour ce mois. ».
  - **Mois figé** : encadré d'avertissement avec le message de gel (voir § 2.6).
- **Colonnes de ligne** (si visibles pour le rôle) :
  - N° ;
  - MAT (matricule) ;
  - NOM (colonne figée) ;
  - PRÉNOM ;
  - POSTE OCCUPE (voir § 2.7) ;
  - AFFECTATION : « chantier · CONTRAT date » ;
  - Début contrat ;
  - colonnes de saisie (texte/nombre/date ; cellule modifiée surlignée en orange) ;
  - jours du mois ;
  - **Totaux par code** : une colonne par code utilisé dans le mois, avec le nombre de jours par employé ;
  - **NJ** : nombre de jours du mois ;
  - **Coef** : somme des coefficients des codes pointés, selon la version du coefficient en vigueur ce mois (D14).
- **Ligne « Total »** :
  - par jour : nombre d'employés pointés avec le « code de totalisation ». C'est **MS** s'il est actif, sinon le premier code « compte comme présence », sinon le premier code (⚠ par défaut c'est donc **MS** qui est compté par jour, pas P) ;
  - totaux par code ;
  - somme des Coef.
- **Règles** : seuls les codes actifs sont proposés ; la grille charge les présences du mois pour le chantier.

### 2.2 Consulter / saisir le mois d'un seul employé

- **Titre** : Par employé.
- **Où** : RH → Présence → onglet « Par employé » → champ « Matricule ou nom de l'employé ».
- **À quoi ça sert** : travailler sur la ligne d'un seul employé, notamment depuis un OM (« Voir le pointage »).
- **Prérequis** : identiques au § 2.1.
- **Étapes** :
  1. Taper un matricule, ou un nom (« nom prénom » ou « prénom nom »).
  2. Choisir parmi les suggestions (au plus 12) : matricule, nom, « chantier · poste ».
  3. Le chantier de la grille devient celui de l'employé ; confirmation demandée si des modifications ne sont pas validées.
- **Résultat** : une seule ligne. État vide : « Recherchez un employé par matricule ou par nom. ».
- **Règle** : en mode Par employé, « Valider » ne remplace que les jours de **cet employé** pour le mois et le chantier.

### 2.3 Saisir un code au clavier dans une case

- **Où** : grille → case d'un jour.
- **Prérequis** :
  - droit « Modifier » sur la colonne « Jours du mois » (DAYS) pour son rôle ;
  - droit écran présence (modification) ;
  - mois non figé.
- **Étapes** :
  1. Cliquer dans la case et taper le code (converti en majuscules automatiquement).
  2. Entrée, ou sortie de la case (Tab, clic ailleurs) : le code est appliqué.
  3. Case vidée : le jour est effacé.
- **Erreurs** : un code inconnu ou inactif affiche « Code non autorisé : X. Codes : A · B · … » ; la case reprend son ancienne valeur.
- **Résultat** : modification locale, **non enregistrée** tant que l'on n'a pas cliqué « Valider ». Le point orange apparaît sur « Valider ».
- **Règle d'origine** (« peinture ») :
  - si on remet **le même code**, la case garde son origine (un MS proposé par un OM et non touché reste « OM ») ;
  - tout changement de code fait passer la case en **saisie manuelle, proposée**.

### 2.4 Remplir une période avec la « carte du mois » (souris)

- **Où** : grille → **clic simple** sur une case. La carte s'ouvre après environ 0,3 s ; taper un code annule l'ouverture.
- **Prérequis** : identiques au § 2.3.
- **Étapes** :
  1. La carte affiche le nom de l'employé et le mois.
  2. Choisir un **code** parmi les boutons (codes actifs) ; son libellé s'affiche. Code présélectionné : celui de la case, sinon MS (code de totalisation), sinon le premier code actif.
  3. Basculer entre « **Du N** » et « **Au N** » pour indiquer quelle borne on choisit.
  4. Dans le mini-calendrier : cliquer un jour pour fixer le début (ou la fin en mode « Au ») ; **cliquer-glisser** pour sélectionner une plage.
  5. « **Appliquer** » : le code est posé du jour X au jour Y (message « CODE du X au Y. »).
  6. « **Effacer** » : la plage est vidée (message « Période effacée. »).
  7. « **Annuler** », touche Échap, ou clic à l'extérieur : fermeture sans effet.
- **Erreurs** : « Choisissez un code du référentiel uniquement. » ; « Jours invalides. ».
- **Résultat** : cases modifiées localement (même règle d'origine qu'au § 2.3) ; à valider ensuite.

### 2.5 Afficher la légende des codes

- **Où** : barre d'outils → pastille de couleurs « Légende des codes ».
- **Résultat** :
  - liste des codes actifs, avec leur couleur et leur libellé ;
  - ligne « Proposé par ordre de mission » (style italique gris).

### 2.6 Valider le pointage (enregistrer)

- **Titre** : « Valider ».
- **Où** : grille → bouton « Valider » (infobulle « Valider les valeurs renseignées »).
- **À quoi ça sert** : enregistrer les valeurs de la grille et **les valider**, pour que la paie les prenne en compte.
- **Prérequis** :
  - un chantier choisi et au moins une ligne ;
  - mois non figé ;
  - droit « Modifier » sur DAYS, **ou** des valeurs modifiées dans une colonne modifiable (poste occupé, colonnes de saisie).
  - Le bouton est désactivé sinon, et pendant un enregistrement.
- **Étapes** :
  1. Saisir ou modifier les cases et colonnes.
  2. Cliquer « Valider ».
  3. L'application enregistre d'abord les **colonnes de ligne** modifiées (message « N ligne(s) mise(s) à jour »).
  4. Si l'on a le droit sur DAYS, elle enregistre ensuite **tous les jours** du mois (message « N valeurs validées »), suivis, le cas échéant, d'un message paie (voir Liens).
  5. La grille est rechargée.
- **Messages d'erreur** :
  - Mois payé et validé : « Paie validée pour ce mois : le pointage est figé. Demandez la réouverture depuis Paie (décision D7 du SUPER_ADMIN). · … ».
  - Mois clôturé : « Paie clôturée pour ce mois : le pointage est figé (réouverture seulement sur décision D7 du SUPER_ADMIN). · … ».
  - « Saisie des jours non autorisée pour votre rôle. · تعبئة الأيام غير مسموحة لدورك. »
  - « Aucune colonne modifiable pour votre rôle. · … »
  - « Colonne % non modifiable pour votre rôle. »
  - « Feuille de pointage figée : paie clôturée. »
  - « Présences enregistrées, mais la paie n'a pas pu être signalée : … »
  - Au plus 4000 cases par enregistrement.
- **Résultat / règles** :
  - La grille **remplace le mois** du chantier (ou de l'employé en mode Par employé) : toutes les valeurs envoyées deviennent **VALIDÉES**.
  - Une valeur OM ou auto non modifiée **garde son origine** (OM/AUTO), mais devient validée.
  - **Valeurs importées** :
    - une valeur importée laissée identique **n'est pas validée par la grille** : elle reste « importée, à valider » et se valide uniquement depuis l'écran des imports ;
    - si on la modifie ou l'efface, elle devient une saisie manuelle.
  - **Jours effacés** : un jour proposé par un OM ou un congé effacé dans la grille est **mémorisé**. La reconstruction automatique ne le reproposera plus (table des « jours écartés »).
  - **Changement de code** : un code changé sur un jour d'OM/congé devient manuel et ne sera plus écrasé par les propositions.
  - **Travail simultané** : les propositions écrites après le chargement de la grille (par exemple un OM enregistré pendant la saisie) ne sont pas effacées.
  - **Aucune paie n'est créée.** Les paies brouillon du mois sont signalées (D3), ou une génération est demandée (D4).
- **Liens** — message affiché après validation :
  - « N paie(s) brouillon signalée(s) « données modifiées depuis le calcul » : aucun recalcul automatique, décision demandée au Centre de décisions. » ;
  - ou « Aucune paie n'a été créée : la génération est soumise à décision (Centre de décisions). ».

### 2.7 Saisir le poste occupé et les colonnes de saisie (commentaire, validation, heures sup.)

- **Où** : grille → colonnes « POSTE OCCUPE », « COMMENTAIRE », « VALIDATION », « HS 50 % (h) », « HS 75 % (h) », « HS 100 % (h) », et toute colonne ajoutée par le SUPER_ADMIN.
- **Prérequis** : droit « Modifier » sur la colonne pour son rôle (voir § 5.1) ; mois non clôturé.
- **Étapes** :
  1. Saisir la valeur (texte, nombre ou date selon la colonne ; la cellule modifiée devient orange).
  2. Cliquer « Valider ».
- **POSTE OCCUPE** :
  - liste de suggestions (catalogue « job_title ») ;
  - le texte d'aide grisé reprend le poste saisi le mois précédent (jusqu'à 2 ans en arrière), sinon le poste du contrat.
- **Règles** :
  - les valeurs sont enregistrées par employé × chantier × mois, en fusion clé par clé (seules les colonnes modifiables sont écrites) ;
  - **HS50 / HS75 / HS100** sont lues par la paie (heures supplémentaires aux taux légaux HS_TAUX_*).
- ⚠ À vérifier : bornes de saisie des HS dans la grille (l'import rapide les limite à 0–300 h).

### 2.8 Import rapide Excel dans la grille (« Importer ») et modèle

- **Où** :
  - modèle : barre d'outils → « Plus d'actions » → « **Modèle Excel** » ;
  - import : bouton « **Importer** » (infobulle « Classeur Excel : Matricule + jours 1..31 (+ HS50 / HS75 / HS100) »).
- **À quoi ça sert** : pré-remplir la grille du mois affiché à partir d'un classeur (pointeuse, tableau du chef de chantier).
- **Prérequis** : un chantier choisi, mois non figé, droit de modification. Bouton désactivé sinon.
- **Modèle** (`/api/rh/presence/modele`, fichier `pointage_AAAA_MM.xlsx`) :
  - feuille « Pointage » : ligne 1 « POINTAGE MM/AAAA » + chantier ; en-têtes Matricule, Nom, Prénom, 1…N, HS50, HS75, HS100 ; codes déjà pointés pré-remplis ;
  - feuille « Codes » : codes et libellés + ligne HS.
- **Étapes** :
  1. Remplir le classeur.
  2. « Importer » → choisir le fichier.
  3. Contrôler les cases remplies.
  4. Cliquer « Valider ».
- **Validations / erreurs** :
  - « Choisissez un fichier Excel. · اختر ملف إكسل. »
  - « Fichier trop volumineux (2 Mo max). »
  - « Format attendu : .xlsx · … »
  - « Chantier ou période invalide. »
  - « Fichier Excel illisible. · … »
  - « Classeur sans feuille. · … »
  - « Colonne « Matricule » introuvable. » (en-têtes acceptés : MATRICULE, MAT, MATR, الرقم التسلسلي)
  - « Aucune colonne de jour (1..31)… »
  - « Ligne N : matricule X absent de ce chantier pour ce mois. »
  - « … en double, ligne ignorée. »
  - « Ligne N, jour D : code « X » inconnu. »
  - « Ligne N : HS50 « x » invalide. » (0 à 300)
  - Au plus 30 erreurs listées ; zéros de tête du matricule ignorés ; **case vide = jour inchangé**.
- **Résultat** :
  - message « Import : N employé(s), N jour(s), N valeur(s) d'heures. Vérifiez puis validez. » ;
  - anomalies : « N anomalie(s) : … ».
  - Les jours importés deviennent des saisies **manuelles proposées**. **Rien n'est enregistré avant « Valider ».**
- **Différence avec l'écran « Imports de présences »** : celui-ci gère les **archives** avec traçabilité (lots, empreinte, conflits, validation séparée) ; voir § 3.

### 2.9 Imprimer / archiver le mois ; masquer les totaux

- **Où** : « Plus d'actions » → « Imprimer / archiver le mois » ; interrupteur « Totaux par code ».
- **Résultat** :
  - impression navigateur, avec l'en-tête « Pointage · Mois Année · Chantier » ;
  - l'interrupteur masque ou affiche les colonnes de totaux par code.
- ⚠ « Archiver » = impression ou PDF via le navigateur ; aucun archivage serveur n'a été trouvé.

### 2.10 Protection des modifications non validées

- Les modifications non validées déclenchent une confirmation « Des modifications non validées seront perdues. Continuer ? » :
  - au changement de mois, de chantier ou d'employé ;
  - au clic sur un lien de la page ;
  - à la fermeture ou au rechargement de l'onglet (avertissement du navigateur).

---

## 3. Imports d'archives de présence (`/rh/presence/imports`)

### 3.0 Droits et cycle de vie

- **Droits** (matrice des permissions) :
  - écran « Imports de présences » (`hr_attendance_import`) : lire = consulter ; créer = déposer, analyser, importer ; modifier = annuler un lot ;
  - écran « Validation des présences importées » (`hr_attendance_import_validate`) : modifier = valider ; c'est un droit distinct de l'import ;
  - D5 et D12 : SUPER_ADMIN uniquement, non délégables ;
  - D11 : décision ordinaire (délégable selon la matrice).
  - Par défaut seul le SUPER_ADMIN a ces droits ; ⚠ à vérifier dans la base.
- **Statuts d'un lot** :

| Statut | Libellé affiché |
|---|---|
| DRAFT | En préparation |
| ANALYZED | Analysé |
| PENDING_DECISION | En attente de décision (conflits) |
| IMPORTED | Importé, à valider |
| VALIDATED | Validé |
| REJECTED | Rejeté |
| CANCELLED | Annulé |

- **Actions possibles selon le statut** :
  - analyser à nouveau : DRAFT, ANALYZED ou PENDING_DECISION (lot complet) ;
  - demander une correspondance de codes : ANALYZED, PENDING_DECISION ;
  - importer : ANALYZED ;
  - valider : IMPORTED ;
  - rejeter : DRAFT, ANALYZED, PENDING_DECISION ;
  - annuler l'import : IMPORTED, VALIDATED ;
  - joindre une pièce : tout statut sauf rejeté ou annulé.

### 3.1 Télécharger le modèle « une ligne par jour »

- **Où** : barre d'outils → « Modèle « une ligne par jour » » (`/api/rh/presence/imports/modele`, droit de création requis).
- **Résultat** : fichier `modele_archives_presences.xlsx` avec quatre feuilles :
  - « Presences » : Matricule, Nom, Prénom, Date, Code, Chantier, HS50, HS75, HS100 ;
  - « Mode d'emploi » ;
  - « Codes » ;
  - « Chantiers ».
- Pour le format grille, le dialogue de dépôt propose « Télécharger la grille de ce chantier pour ce mois » (même modèle que § 2.8).

### 3.2 Déposer un fichier d'archives

- **Titre** : « Déposer un fichier d'archives de présence » (sous-titre : le fichier est conservé avec son empreinte, il ne peut pas être remplacé).
- **Où** : Imports de présences → « Déposer un fichier ».
- **Prérequis** : droit de création sur le ou les chantiers.
- **Champs** :
  - **Format du fichier** :
    - « Grille mensuelle (un chantier, un mois) » (par défaut) ;
    - ou « Une ligne par salarié et par jour ».
  - **Fichier** (obligatoire) : .xlsx ou .csv UTF-8, 10 Mo maximum.
  - **Feuille du classeur** : si le classeur contient plusieurs feuilles. Le mois peut être déduit du nom de feuille, par exemple « JANVIER 2026 ».
  - **Rapprochement des salariés** : « Par matricule » ou « Par nom et prénom… ».
  - **Mois** (grille), ou **Premier mois + Dernier mois** (lignes ; 12 mois au plus).
  - **Année de référence** (2000–2100) : doit correspondre à la période. Un encadré indique la nature : reprise / opérationnel.
  - **Chantier** : boutons radio (grille), ou **Chantiers couverts** : cases à cocher (lignes).
  - **Provenance** :
    - « Registre papier (saisi dans le fichier) » (par défaut) ;
    - « Logiciel source » ;
    - « Fichier transmis par une personne ou un service » ;
    - « Autre provenance ».
  - **Date du document source**.
  - **Précision sur la provenance** : obligatoire, 2 à 300 caractères.
  - **Total de contrôle** : présences / salariés (facultatif).
  - **Commentaire** : 1000 caractères maximum.
  - Encadré sur les heures supplémentaires.
- **Format du contenu attendu** :
  - Grille : en-têtes Matricule/MAT, Nom, Prénom, jours « 1 » ou « 1 Lun », HS.
  - Lignes : Matricule, Nom, Prénom, Date, **Code** et **Chantier** obligatoires, HS facultatives.
  - 200 000 lignes au plus.
- **Étapes** : remplir → « **Déposer et analyser** ». Progression : « Envoi du fichier… », puis « Lecture et contrôle des lignes… ». « Fermer » pour abandonner.
- **Erreurs** :
  - « Choisissez le fichier à importer. »
  - « Format accepté : classeur Excel .xlsx ou fichier CSV (UTF-8). »
  - « Fichier trop volumineux (10 Mo maximum). »
  - « Choisissez au moins un chantier. »
  - « Le dernier mois précède le premier. »
  - « Grille mensuelle : un seul chantier et un seul mois. »
  - « L'année de référence doit correspondre à la période couverte. »
  - erreur d'encodage CSV.
- **Résultat** :
  - le lot est créé (n° « IMP-AAAA-NNNN ») et analysé automatiquement ;
  - message « Fichier déposé et analysé : … Rien n'est encore enregistré dans le pointage. » ;
  - le même fichier déjà déposé (même empreinte SHA-256) donne l'avertissement « fichier en double » (DUPLICATE_FILE).

### 3.3 Lire le détail et le rapport d'analyse d'un lot

- **Où** : clic sur un lot dans le tableau (`?lot=<id>`).
- **Contenu** :
  - **Pastilles et titre** : « Lot X · période ».
  - **Boutons** :
    - « **Rapport complet (Excel)** » (feuilles « Synthèse » et « Lignes ») ;
    - « **Fichier source** » (lien de téléchargement valable 120 s).
  - **Informations** :
    - Année de référence, Nature, Provenance, Date du document source, Fichier ;
    - Empreinte SHA-256 ;
    - Déposé par ;
    - Totaux de contrôle déclarés ;
    - Importé par, Validé par ;
    - Rejeté/Annulé par + motif ;
    - Correspondances de codes (ce lot).
  - **Lot incomplet** : avertissement si toutes les lignes n'ont pas été reçues. Message de la base : « … toutes les lignes du fichier n'ont pas été reçues. Rejetez ce lot et déposez à nouveau le fichier. ».
  - **Compteurs** : Lues, Acceptées, Rejetées, Identiques, Doublons, En conflit, Importables.
  - **Avertissements du lot** :
    - fichier déjà déposé ;
    - total de contrôle des présences différent ;
    - total de contrôle des salariés différent.
  - **Listes** : « Motifs de rejet » et « Avertissements » (nombre par motif).
- **Contrôles réalisés à l'analyse**, par ligne :
  - **Rejet** :
    - matricule manquant, inconnu ou ambigu ;
    - chantier manquant, inconnu, ou hors du lot ;
    - code manquant ou inconnu (sauf correspondance D11) ;
    - date manquante ou invalide, jour hors du mois, date hors de la période, date future ;
    - mois dont la paie est validée ou clôturée ;
    - pas de contrat couvrant la date sur ce chantier ;
    - date après une sortie validée ;
    - heures hors bornes (0–24 h par jour et total ≤ 24 h ; colonnes mensuelles 0–300 h) ou total mensuel > 300 h par code ;
    - même salarié et même jour sur deux chantiers, ou avec deux codes différents ;
    - conflit avec un autre chantier dont la paie est figée.
  - **Avertissement** :
    - nom différent de la fiche ;
    - doublon identique ignoré (la première ligne est retenue).
  - **Identique** : déjà enregistrée à l'identique (rien à importer).
  - **Conflit** :
    - autre valeur déjà enregistrée sur le même chantier ;
    - présence sur un autre chantier le même jour ;
    - congé approuvé couvrant le jour.
- **Tableau des lignes** :
  - filtre : Toutes / Rejetée / En conflit / Acceptée avec avertissement / Acceptée / Déjà enregistrée à l'identique / Doublon ignoré ;
  - colonnes : Ligne, Salarié, Date, Chantier, Code, Statut, Détail ;
  - pagination « Précédente » / « Suivante ».

### 3.4 Rapprocher des noms (lignes sans matricule reconnu)

- **Titre** : « Noms à rapprocher · مطابقة الأسماء ».
- **Où** : détail du lot (si des lignes n'ont pas d'employé).
- **Étapes** :
  1. Pour chaque nom du fichier, choisir l'employé dans « Choisir l'employé… ».
  2. « Retirer » supprime un rapprochement.
- **Résultat** :
  - l'alias nom → employé est **conservé pour les prochains imports** ;
  - le lot est **réanalysé** automatiquement.

### 3.5 Demander une correspondance de codes inconnus (D11) et la confirmer comme politique

- **Où** :
  - détail du lot → « **Codes inconnus : demander une correspondance** » (statut Analysé ou En attente de décision) ;
  - onglet « Correspondances de codes ».
- **Étapes (demande)** :
  1. Pour chaque code inconnu, choisir « Ne pas convertir » ou un code du référentiel.
  2. Saisir le Motif.
  3. « **Demander la décision** ».
- **Options de la décision D11** (Centre de décisions) :
  - « Valider pour ce lot seulement » : conversion pour ce lot, puis réanalyse ;
  - « Valider et conserver comme politique » : conversion pour ce lot + correspondance proposée pour les prochains lots, **après une seconde confirmation** ;
  - « Refuser la correspondance » : lignes toujours rejetées.
- **Seconde confirmation** (onglet « Correspondances de codes ») :
  - Boutons « Confirmer », « Refuser », « Révoquer » (motif de 10 à 500 caractères pour la révocation).
  - Statuts : À confirmer / Active / Révoquée.
  - Droit de décision D11 requis : « Confirmation des correspondances de codes non autorisée (droit de décision D11 requis). ».
  - Erreurs : « Code de présence cible désactivé : révoquez cette correspondance. » ; « Correspondance introuvable ou déjà confirmée ou révoquée. ».
- **Règle** : tant que la correspondance n'est pas validée, les lignes concernées restent rejetées.

### 3.6 Trancher les conflits (D5)

- **Où** :
  - alerte de conflit dans le détail du lot → lien « ouvrir la décision » (D5) ;
  - si l'option est « ligne par ligne » : outil de résolution dans le détail du lot.
- **Prérequis** : SUPER_ADMIN (D5 non délégable).
- **Options D5** :
  - « Conserver l'existant » : lignes en conflit non importées ;
  - « Retenir l'import » : les présences existantes seront remplacées à l'import, en attente de validation ; les valeurs remplacées sont conservées et **restaurées si le lot est annulé** ;
  - « Trancher ligne par ligne » ;
  - « Rejeter le lot ».
- **Ligne par ligne** :
  - pour chaque ligne, choisir « Conserver l'existant » ou « Retenir l'import » ;
  - boutons « Tout conserver (cette page) » / « Tout retenir (cette page) » ;
  - « **Enregistrer N choix** » ;
  - pages de 200 lignes.
- **Règle** : le lot reste « En attente de décision » tant que des conflits ne sont pas tranchés. Une nouvelle analyse sans conflit clôt la demande D5.

### 3.7 Importer les présences acceptées

- **Titre** : « Importer le lot X ».
- **Où** : détail du lot (statut Analysé) → « **Importer les présences acceptées** ».
- **Prérequis** : droit de création ; aucun conflit non tranché.
- **Étapes** :
  1. L'application réanalyse le lot.
  2. Elle présente la liste des compteurs.
  3. Si des lignes sont rejetées, cocher la case de prise de connaissance des lignes rejetées.
  4. Cliquer « **Importer N présence(s)** ».
- **Erreurs** :
  - « N ligne(s) rejetée(s) ne seront pas importées : confirmez l'import des seules lignes acceptées. »
  - « Aucune ligne à importer dans ce lot. »
  - « Présences modifiées pendant l'import : rien n'a été importé. Relancez l'analyse du lot. »
  - Nouveaux conflits apparus : rien n'est importé et une décision est demandée.
- **Résultat** :
  - message « N présence(s) importée(s) en attente de validation, dont N en remplacement… » ;
  - statut **Importé, à valider** ;
  - les cases apparaissent dans la grille, *proposées*, origine « Importé des archives » ;
  - une notification est envoyée aux valideurs ;
  - aucune paie n'est créée ni recalculée.
- Si des présences **validées** ont été remplacées (D5 « Retenir l'import »), les paies du mois sont signalées.

### 3.8 Valider les présences importées

- **Où** : onglet « À valider » → lot → « **Valider les présences importées** ».
- **Prérequis** : droit « Validation des présences importées » (modifier) sur les chantiers du lot.
- **Séparation des tâches (D12)** : l'auteur du dépôt ne peut pas valider son propre lot, sauf si la politique D12 l'autorise ; le SUPER_ADMIN peut toujours valider. Message : « Séparation des tâches : vous avez importé ce lot, sa validation revient à une autre personne (politique D12). ».
- **Erreurs** :
  - « Paie validée ou clôturée depuis l'import pour un mois de ce lot : validation impossible sans réouverture (D7). »
  - « Lot X : rien à valider (statut …). »
- **Résultat** :
  - les présences importées encore intactes passent **validées** ;
  - celles **modifiées depuis l'import** (devenues manuelles) ne sont pas comptées ;
  - le lot passe « Validé » ;
  - les paies concernées sont signalées (D3 brouillons, ou D4 génération demandée).

### 3.9 Rejeter un lot / annuler un import

- **Où** : détail du lot → « **Rejeter le lot** » (avant import) ou « **Annuler l'import** » (après import ou validation).
- **Champ** : Motif, obligatoire, 10 à 500 caractères (« Motif obligatoire (10 à 500 caractères). »).
- **Résultat** :
  - **Rejet** : rien n'est importé ; lot conservé avec fichier et rapport ; demandes D5/D11 en cours closes.
  - **Annulation** :
    - suppression des présences importées encore « importées » ;
    - **restauration** des valeurs remplacées sur décision D5 (si le jour est resté libre) ;
    - signalement de la paie si le lot était validé ou si des valeurs ont été restaurées.
- **Erreur** : refus si une paie du mois est validée ou clôturée : « Paie validée ou clôturée pour au moins un mois de ce lot : annulation impossible sans réouverture (D7). ».

### 3.10 Joindre une pièce justificative

- **Où** : détail du lot → « **Joindre une pièce** ».
- **Champs** : fichier PDF, JPEG, PNG ou WebP (20 Mo au plus) ; Description.
- **Résultat** : la pièce apparaît dans la liste « Pièces justificatives » du lot.

### 3.11 Politique de validation par l'auteur (D12)

- **Titre** : « Validation d'un lot par son auteur (D12) ».
- **Où** : onglet « Politique de validation ».
- **Affichage** : état actuel. Jamais décidé = l'auteur ne peut pas valider son lot.
- **Action** : « **Demander une décision sur cette politique** » (SUPER_ADMIN, ou détenteur des droits d'annulation ou de validation).
- **Options** :
  - « L'auteur peut valider son propre lot » ;
  - « L'auteur ne peut pas valider son propre lot » ;
  - révocable par une nouvelle décision.

---

## 4. Congés (`/rh/conges`) et titres de congé

### 4.1 Saisir une demande de congé

- **Titre** : « Nouvelle demande de congé · طلب عطلة جديد ».
- **Où** : RH → Congés → onglet « Demandes ». Aussi via le bouton « Nouveau congé » de la page Présence.
- **Prérequis** :
  - utilisateur connecté (formulaire affiché pour tous) ;
  - la base exige le droit de modification « Présence » ou un droit d'écriture des valeurs de salaire (⚠ à vérifier selon les rôles).
- **Champs** :
  - **Employé** (obligatoire) : employés non sortis ; aide « Solde annuel : x j ».
  - **Nature** :
    - Congé annuel · عطلة سنوية (CA) ;
    - Récupération · عطلة تعويضية (CRP) ;
    - Congé maladie · عطلة مرضية (CM) ;
    - Congé sans solde · عطلة بدون أجر (CSS) ;
    - Absence autorisée payée · غياب مرخص مدفوع (AOP).
  - **Du**, **Au (inclus)** : obligatoires.
  - **Jours décomptés** : par défaut, nombre de jours calendaires, week-ends compris (aide « N j calendaires ») ; 0 à 366.
  - **Réf. arrêt / CNAS** : uniquement pour Congé maladie.
  - **Motif / observation**.
- **Bouton** : « Soumettre ».
- **Erreurs** :
  - « Employé requis · اختر العامل »
  - « La fin précède le début. · … »
  - « Chevauchement avec une autre demande. · تداخل مع طلب آخر » (demande en attente ou approuvée sur la même période).
- **Résultat** : « Demande enregistrée, en attente de décision. » ; statut « En attente ».

### 4.2 Approuver / refuser / annuler une demande

- **Où** : onglet Demandes → tableau → boutons de ligne.
- **Tableau** :
  - colonnes : Employé (+ motif), Nature (+ code, réf. CNAS), Période, Jours, Statut (En attente / Approuvé / Refusé / Annulé, bilingue + décideur et note), Titre (numéro) ;
  - filtre « À traiter / en cours » (demandes en attente + approuvées non terminées) / « Historique complet ».
- **Prérequis** :
  - décider : rôles **SUPER_ADMIN, ADMIN_RH, GERANT** ;
  - le demandeur peut annuler **sa propre** demande en attente.
- **Étapes** :
  - « **Approuver** » (demande en attente). Pour un congé annuel au solde insuffisant, confirmation : « Solde insuffisant (x j disponibles pour y j demandés). Approuver quand même ? ».
  - « **Refuser** » : invite « Motif (facultatif) » ; un clic sur Annuler dans l'invite abandonne le refus.
  - « **Annuler** » : décideur, sur une demande en attente ou approuvée ; demandeur, sur sa demande en attente.
- **Erreurs** :
  - « Décision réservée aux RH (SUPER_ADMIN, ADMIN_RH, GERANT). »
  - « Transition X → Y impossible. »
- **Résultat** :
  - **Approbation** :
    - message « Congé approuvé : les jours sont proposés sur la feuille de présence. » ;
    - création d'un **titre de congé numéroté** (numéro « 000123/26 », affiché « NF/CNG/0123/26 ») ;
    - jours **proposés** dans la grille avec le code de la nature (CA, CRP, CM, CSS, AOP), origine « auto ».
  - **Annulation d'un congé approuvé** : le titre est annulé et les jours proposés sont retirés de la grille, sauf mois figés et jours déjà validés d'un mois dont la paie est validée.
  - **Refus** : « Décision enregistrée. ».
  - Hors refus : la paie du mois de début est signalée (D3/D4).
- ⚠ Pour un non-décideur, le bouton « Annuler » apparaît sur toutes les demandes en attente ; la base refuse si ce n'est pas la sienne.

### 4.3 Imprimer le titre de congé depuis la liste

- **Où** : onglet Demandes → ligne approuvée → « **Titre de congé** ».
- **Résultat** :
  - ouvre le titre dans le Registre (`/rh/documents?onglet=conges&titre=<id>`) ;
  - à défaut, une fenêtre d'impression de lettre « Titre de congé ».
- **Fenêtre d'impression de lettre** :
  - champs : Nom et prénom (FR/AR), Matricule, Date du document, Poste FR/AR, Nature FR/AR, Du, Au, Nombre de jours, Date de reprise (lendemain de la fin), Reliquat après congé (j) (solde à la date de fin, congé annuel) ;
  - langue Français / العربية ; Monsieur / Madame ;
  - « Modifier le texte librement » ;
  - « Imprimer ».
- **Erreur** : « Seul un congé approuvé peut être imprimé. · يجب اعتماد العطلة أولاً ».

### 4.4 Consulter les soldes de congé annuel

- **Où** : onglet « Soldes · الأرصدة ».
- **Colonnes** : Employé, Mois travaillés, Acquis, Ajustements, Pris, En attente, Solde (en rouge si négatif).
- **Note affichée** : « Taux : 2.5 j / mois (variable légale CONGE_JOURS_MOIS, modifiable dans Paramètres RH). »
- **Calcul** :
  - mois travaillés : contrats principaux non brouillon et non annulés, fraction de mois comptée au prorata ;
  - acquis = mois travaillés × taux (arrondi à 0,1) ;
  - solde = acquis + ajustements − congés annuels approuvés (commencés à la date du jour) ;
  - « En attente » = congés annuels soumis.

### 4.5 Ajuster un solde (reprise de solde)

- **Où** : onglet « Ajustements / reprise de solde · التعديلات ».
- **Prérequis** : SUPER_ADMIN, ADMIN_RH, GERANT. Sinon : « Saisie des montants réservée à SUPER_ADMIN, ADMIN_RH et GERANT. ».
- **Champs** :
  - Employé ;
  - Jours (+ ou −) : non nul, |x| ≤ 400 ;
  - Date d'effet : aujourd'hui par défaut ;
  - Motif : au moins 3 caractères.
- **Bouton** : « Ajouter ».
- **Erreurs** : « Nombre de jours non nul » ; « Valeur hors limites » ; « Motif requis (3 caractères min.) ».
- **Tableau** :
  - colonnes : Employé, Jours (+x), Date, Motif · auteur ;
  - « Supprimer » avec confirmation « Supprimer l'ajustement de x j ? ».

### 4.6 Créer / compléter un titre de congé depuis le Registre

- **Titre** : « Titre de Congé ».
- **Où** : Registre → « Titres de congé » → « Nouveau titre de congé », ou « Ouvrir le titre ».
- **Fenêtre** :
  - recherche « Rechercher par N° titre, matricule ou nom... » ;
  - **Identification** : N° Titre de congé, Rechercher un employé (nouveau uniquement), Matricule (lecture seule), Nom, Prénom, Affectation, Fonction / Poste ;
  - **Congé — الإجازة**, pour un nouveau titre :
    - Nature du congé — طبيعة الإجازة ;
    - Du — من ;
    - Au (inclus) — إلى ;
    - Nombre de jours — عدد الأيام ;
    - Date de reprise — تاريخ الاستئناف (lecture seule, = fin + 1) ;
    - pour un titre existant, ces champs sont en lecture seule ;
  - **Transport** ;
  - **Pièce d'identité de l'intéressé(e) — وثيقة التعريف** ;
  - **Validation & émission — المصادقة والإصدار** : Établi par, Fonction, Fait à, Date du document.
  - Pied : NOUVEAU, IMPRIMER (désactivé si annulé), ENREGISTRER / MODIFIER, Fermer.
- **Erreurs** :
  - « Recherchez d'abord l'employé. »
  - « Dates du congé requises (du … au …). »
  - congé annuel au solde insuffisant : confirmation « Solde insuffisant (…). Enregistrer quand même ? ».
- **Résultat** :
  - Avec droit d'approbation : la demande est créée **et approuvée** ; message « Titre de congé X enregistré[ et archivé en PDF]. Jours proposés dans le pointage, à valider. » ; PDF archivé dans le dossier de l'employé.
  - Sans droit d'approbation : « Demande de congé enregistrée, en attente d'approbation : le titre sera établi à l'approbation. ».
  - Titre d'un congé annulé : alerte « Ce congé a été annulé : le titre ne peut plus être imprimé. · هذه الإجازة ملغاة. ».

---

## 5. Paramétrage

### 5.1 Configurer les colonnes et droits de la feuille de présence

- **Où** : RH → Paramètres → onglet « Feuille de présence ».
- **Prérequis** : SUPER_ADMIN. Sinon : « Réservé à SUPER_ADMIN. · محصور في SUPER_ADMIN. ».
- **Colonnes par défaut** :

| Code | Libellé FR | Libellé AR | Nature |
|---|---|---|---|
| ROW_NO | N° | الرقم | Dossier |
| MAT | MAT | الرقم التسلسلي | Dossier |
| NOM | NOM | اللقب | Dossier |
| PRENOM | PRÉNOM | الاسم | Dossier |
| POSTE_EFFECTIF | POSTE OCCUPE | المنصب الفعلي | Dossier · saisissable |
| AFFECTATION | AFFECTATION | التعيين | Dossier |
| DAYS | Jours du mois | أيام الشهر | Jours |
| CODE_COUNTS | Totaux par code | مجاميع الرموز | Totaux codes |
| NJ | NJ | عدد أيام الشهر | Calcul |
| COEF | Coef | مجموع المعاملات | Calcul |
| DEBUT_CONTRAT | Début contrat | بداية العقد | Dossier |
| COMMENTAIRE | COMMENTAIRE | ملاحظات | Saisie |
| VALIDATION | VALIDATION | المصادقة | Saisie |
| HS50 / HS75 / HS100 | HS 50 % (h) / HS 75 % (h) / HS 100 % (h) | — | Saisie (nombre), système |

  ⚠ Les libellés FR de NOM, PRENOM, AFFECTATION, NJ, COMMENTAIRE, VALIDATION sont déduits du code (non relus dans la migration).

- **Droits par défaut** :
  - **CHEF_CHANTIER** : voit tout sauf VALIDATION, DEBUT_CONTRAT, COEF ; modifie DAYS et COMMENTAIRE.
  - **ADMIN_RH / GERANT** : modifient DAYS, POSTE_EFFECTIF, COMMENTAIRE, VALIDATION.
  - **Autres rôles** : lecture seule.
  - **HS** : voir pour ADMIN_RH, GERANT, CHEF_CHANTIER, ADMIN_FINANCE, READ_ONLY ; modifier pour ADMIN_RH, GERANT, CHEF_CHANTIER.
  - **SUPER_ADMIN** : toujours tout.
  - Ces droits s'ajoutent au droit d'écran « Présence » sur le chantier.
- **Étapes** :
  1. Réordonner avec ↑ « Monter » / ↓ « Descendre ».
  2. Modifier les libellés FR / AR.
  3. Activer ou désactiver. **Jours du mois** ne se désactive pas : « La grille des jours reste toujours active. ».
  4. Cocher Voir / Modifier par rôle. Modifier implique Voir ; Modifier n'est possible que sur les colonnes modifiables (DAYS, colonnes de saisie, POSTE OCCUPE).
  5. Pour une colonne ajoutée, choisir « Saisie · Texte / Nombre / Date ».
  6. « **Enregistrer** » → « Colonnes et droits enregistrés. · تم حفظ الأعمدة والصلاحيات. ».
- **Ajouter une colonne** :
  - Champs : Code (exemple HEURES_SUP ; majuscules, chiffres, _ ; 32 caractères au plus), Libellé FR (obligatoire), Libellé AR, Type de valeur (Texte / Nombre / Date).
  - Bouton « Ajouter » → « Colonne X ajoutée — enregistrez pour l'appliquer. ». Par défaut, tous les rôles peuvent la voir.
  - Erreurs : « Code : lettres majuscules, chiffres ou _ (ex. HEURES_SUP). » ; « Libellé FR requis. » ; « Le code X existe déjà. » ; « Codes de colonne en double. » ; « Colonne introuvable : X. ».
- **Supprimer** (colonnes non système) :
  - confirmation « Supprimer la colonne X ? Les valeurs saisies ne seront plus affichées. » ;
  - refus : « Colonne système ou introuvable : suppression refusée. ».
- **Règle** : le code et le type des colonnes système ne sont pas modifiables.

### 5.2 Gérer les légendes (codes de présence)

- **Titre** : « Légendes de présence · رموز الحضور ».
- **Où** : RH → Paramètres → « Listes et codes ».
- **Champs** :
  - Code (exemple P ; 16 caractères au plus, mis en majuscules) ;
  - Libellé FR (exemple Présent ; obligatoire, 120 caractères au plus) ;
  - Libellé AR (exemple حاضر) ;
  - Coefficient (exemple 0,5 ; virgule décimale ; 0 à 999,999) ;
  - Couleur.
- **Étapes** :
  1. « Nouveau code », ou clic sur une pastille.
  2. Remplir.
  3. « **Enregistrer le code** » → « Légende enregistrée. ».
- **Règles** :
  - Pour un code existant, le **coefficient est grisé**. Infobulle : « Coefficient en vigueur ce mois — se modifie par une demande datée (D14) ci-dessous ».
  - Changer le code d'une légende existante crée un **nouveau code**.
  - Une nouvelle légende « compte comme présence » par défaut. ⚠ Ce réglage n'est pas modifiable dans le formulaire.
- **Erreurs** :
  - « Ce code est déjà utilisé dans le pointage. Il ne peut pas être renommé : enregistrez un nouveau code. »
  - « Ce code existe déjà. Sélectionnez-le dans la liste pour modifier son coefficient. »
  - « Coefficient refusé par la base (0 à 999,999). Exemple : 0,5. »
  - « Coefficient : nombre attendu (ex. 0,5). »
- **Codes livrés** (valeurs initiales de la migration ; ⚠ peuvent avoir changé en base) :

| Code | Libellé | Coef. | Compte comme présence | Remarque |
|---|---|---|---|---|
| P | Présent · حاضر | 1 | oui | |
| P/2 | Demi présent | 0,5 | oui | |
| MS | Mission · مهمة | 1 | oui | posé par les OM |
| CRP | Récupération · راحة تعويضية | 1 | oui | payé par les rubriques « CRP » |
| CA | Congé annuel | 1 | non | décompté du solde |
| CM | Congé maladie | 0 | non | |
| CSS | Congé sans solde | 0 | non | |
| AN | Absence injustifiée | 0 | non | effet « pass-through AN » |
| AJ | Absence justifiée | 0 | non | |
| AOP | Absence autorisée payée | 1 | non | |
| W | Week-end | 0 | non | |
| JF | Jour férié | 1 | non | |
| AP | Abandon de poste | 0 | non | |

  ⚠ **P/2-CRP/2** (demi-présence / demi-récupération) n'est **pas livré**. Le moteur de paie sait le traiter (0,5 jour de récupération pour tout code « …CRP/2 ») s'il est créé dans les légendes.

### 5.3 Demander le changement d'un coefficient (D14)

- **Titre** : « Changer le coefficient de X (en vigueur ce mois : c) ».
- **Où** : Listes et codes → sélectionner un code existant → bloc sous le formulaire.
- **Prérequis** : SUPER_ADMIN, droit de modification « légendes », ou droit de création « décision coefficient ». Sinon : « Demande de changement de coefficient non autorisée. ».
- **Champs** :
  - « Nouveau coefficient » (obligatoire) ;
  - « Mois d'effet demandé » (mois suivant par défaut) ;
  - « Motif (10 caractères minimum) ».
  - Le bloc affiche aussi « Déjà programmé : … » (versions futures).
- **Bouton** : « **Demander le changement (D14)** ».
- **Erreurs** :
  - « Coefficient invalide (0 à 999,999, trois décimales au plus). »
  - « Le mois d'effet commence le 1er du mois. »
  - « Mois d'effet trop lointain (24 mois au plus). »
  - « Une paie de ce mois ou d'un mois suivant est déjà validée ou clôturée : le premier mois d'effet possible est MM/AAAA. »
  - « Le coefficient du code X vaut déjà c pour ce mois. »
  - « Motif obligatoire (10 à 500 caractères). »
- **Résultat** : « Demande enregistrée : aucun effet tant que la décision D14 n'est pas prise. Ouvrir la décision ».
- **Décision D14** :
  - « Appliquer à partir du mois demandé » : nouvelle version datée ; les mois antérieurs et les paies validées ou clôturées gardent l'ancien coefficient ; les brouillons de paie de ce mois et des suivants utilisant le code sont signalés (D3), sans recalcul automatique ;
  - ou « Refuser ».
  - La préparation du mois affiche « Changement(s) en vigueur à partir de ce mois : CODE ancien → nouveau ».

---

## 6. Ordres de mission et remplissage automatique de la grille

### 6.1 Créer / modifier un ordre de mission

- **Titre** : « Ordre de Mission » (sous-titre : numéro, ou « Nouveau »).
- **Où** : Registre → « Ordres de mission » → « Nouvel ordre de mission », ou « Modifier » sur une ligne.
- **Prérequis** :
  - droit de création de correspondances RH (⚠ droit exact non relu) ;
  - l'employé doit avoir un chantier : celui choisi dans « Affectation », sinon celui de son contrat principal.
- **Recherche dans la fenêtre** :
  - « Rechercher par N° OM, matricule ou nom... » + « RECHERCHER » ;
  - navigation « ❮ Précédent » / « Suivant ❯ ».
- **Champs** :
  - **Identification** :
    - N° Ordre de Mission (lecture seule) ;
    - Rechercher un employé + « Chercher » (remplit les champs depuis la fiche et le contrat) ;
    - Nom, Prénom ;
    - Affectation (liste des chantiers) ;
    - Code affectation — رمز التعيين ;
    - Fonction / Poste.
  - **Déplacement** :
    - 1ère et 2ème destination (suggestions : chantiers) ;
    - Lieu de départ (par défaut « Hassi Messaoud ») ;
    - **Date de départ — تاريخ الذهاب** (obligatoire, au plus tôt aujourd'hui) ;
    - Heure de départ (ancien modèle seulement) ;
    - Lieu de retour ;
    - **Date de retour — تاريخ العودة**. Vide = mission ouverte, imprimée « Fin de mission » (« Vide = mission ouverte, imprimée « Fin de mission » · فارغ = مهمة مفتوحة ») ;
    - Heure de retour (ancien modèle) ;
    - Motif du déplacement ;
    - note : « À l'enregistrement, les jours du départ au retour sont proposés en « MS » dans le pointage… ».
  - **Transport** :
    - Moyen de transport (« Tous moyens de transport » / « Véhicule de service ») ;
    - Véhicule — Modèle, Immatriculation ;
    - Kilométrage au départ / au retour.
  - **Pièce d'identité du missionnaire** : Type de pièce, N° pièce, Délivré le / À (lieu) (ancien modèle).
  - **Donneur de l'OM & émission** :
    - Donneur de l'OM (par défaut « Service RH ») ;
    - Fonction du donneur ;
    - Fait à (par défaut « HMD ») ;
    - Date du document (aujourd'hui) ;
    - Modèle d'impression (Nouveau modèle / Ancien modèle).
- **Pied** : NOUVEAU, IMPRIMER, ENREGISTRER / MODIFIER, Fermer.
- **Erreurs** :
  - « Employé requis. »
  - « Le matricule et le nom sont obligatoires. »
  - « Date de départ obligatoire. · … »
  - « La date de départ doit être aujourd'hui ou une date future. · … »
  - « La date de retour doit être une date future. · … »
  - « La date de retour doit être postérieure à la date de départ. · … »
  - « La date de retour précède le départ. »
  - « Affectation introuvable : impossible de lier l'ordre au pointage. · … »
  - « Numéro déjà attribué, réessayez. »
  - En modification, les dates déjà enregistrées ne sont pas recontrôlées. Clôturer une mission ouverte exige seulement un retour postérieur au départ.
- **Résultat** :
  - Numéro « 000123/26 », affiché « NF/OM/0123/26 ».
  - Message « Ordre de mission N enregistré[ et archivé]. Jours MS proposés dans le pointage, à valider. » + lien « **Ouvrir le pointage** » (grille Par employé, mois du départ).
  - PDF archivé (consultable par « Consulter »).
- ⚠ Numérotation : un seul compteur annuel pour tous les documents RH numérotés (OM, congés, lettres…). Les numéros d'OM ne se suivent donc pas forcément.
- ⚠ Aucun bouton d'annulation d'OM n'a été trouvé dans ce périmètre.

### 6.2 Remplissage automatique de la grille par les OM et les congés

- **Déclenchement** : automatique à chaque création ou modification d'un OM ou d'un congé (dates, chantier, employé, statut, nature), et chaque nuit (§ 6.3). Aucune action de l'utilisateur.
- **Règles** :
  - **Chantier** : celui du document, sinon le chantier du contrat principal (actif, brouillon ou suspendu).
  - **Code** :
    - OM → **MS** ;
    - congé → code de la nature (CA, CRP, CM, CSS, AOP ; CA par défaut) ;
    - le code doit être actif.
  - **Durée** :
    - congé : du début à la fin ;
    - OM avec retour : jusqu'au retour ;
    - **OM ouvert** (sans retour) : jusqu'à la fin d'une fenêtre de 12 mois (mois courant + 11).
    - Dans les deux cas, un OM s'arrête **la veille du document suivant** (autre OM ou congé). Il ne reprend pas après.
  - **Chevauchements** : le document qui commence le plus tard l'emporte sur les jours communs.
  - **Statut des jours** : **proposés** (origine « OM » ou « auto »).
  - **Jamais écrasés** :
    - une saisie manuelle ;
    - une valeur importée ;
    - une valeur validée d'un mois dont la paie est validée ;
    - un mois clôturé.
  - **Jours effacés** à la main puis validés : ils ne sont plus reproposés.
  - **Document modifié ou annulé** : les jours devenus inutiles sont supprimés, sauf mois clôturés et jours validés d'un mois payé et validé.
- **Résultat visible** :
  - cases *italique gris* ;
  - infobulle « Proposé par l'ordre de mission N° X — non validé » ;
  - pastille « N proposé(s) OM ».
  - Il faut **« Valider »** la grille pour que la paie les prenne en compte.

### 6.3 Prolongation nocturne des missions ouvertes

- **Tâche planifiée** : `/api/cron/missions`, tous les jours à 00:00 UTC (01:00 heure d'Algérie).
- **Fonctionnement** : la fenêtre de 12 mois des OM ouverts avance, et les nouveaux jours MS sont proposés.
- **Sécurité** : jeton secret serveur. Réponses en cas d'erreur : « Tâche planifiée non configurée (CRON_SECRET absent). » (503) ; « Non autorisé. » (401).
- Aucune interface utilisateur.

---

## 7. Liens avec la paie et les bulletins (synthèse)

- **Présences prises en compte** : la paie du mois ne lit que les présences **validées** du chantier et du mois.
- **Calcul par employé** :
  - **jours payés** = somme des coefficients (version datée D14) ;
  - **jours de présence** = coefficients des codes « travaillés » (P, P/2, MS, CRP ou « compte comme présence ») ;
  - **jours de récupération** : CRP = 1, « …CRP/2 » = 0,5 ;
  - nombre de jours par code ;
  - jours de congé annuel (CA) comptés.
- **Récupération (CRP)** : les jours CRP sont payés par les rubriques de salaire de la section « CRP ». Le salaire de base et les rubriques « travail » au jour ne les comptent pas.
- **Classement des codes** (pour la paie) :
  - abandon : AP ;
  - week-end / férié : W, JF ;
  - absence : AN, AJ, AOP ;
  - congé : CA, CM, CSS ;
  - travaillé : P, P/2, MS, CRP, ou code « compte comme présence ».
- **Heures supplémentaires** : colonnes HS50 / HS75 / HS100 de la feuille, aux taux légaux.
- **Après toute modification** (grille, congé, import, coefficient) :
  - aucune paie n'est créée ni recalculée automatiquement ;
  - les brouillons sont signalés (décision **D3**), ou la génération est soumise à décision (**D4**) ;
  - une paie validée ou clôturée fige la présence ; réouverture par **D7**.
- **Préparation du mois** (`/rh/paie/preparation`), bloc « Présences » :
  - présences validées ;
  - présences proposées ignorées ;
  - imports en cours ;
  - contrats sans présence validée ;
  - lien vers `/rh/presence`.
- ⚠ Le détail du calcul du bulletin (fraction de mois payée, diviseur) relève des notes « Paie ».

---

## 8. Points à vérifier (récapitulatif)

1. L'écran `/referentiels/legendes` n'est pas fonctionnel (écran d'attente) ; les légendes se gèrent dans Paramètres RH → Listes et codes.
2. Le code P/2-CRP/2 n'est pas livré par défaut.
3. Libellé « N proposé(s) OM » : la pastille compte aussi les jours proposés par un congé.
4. La ligne « Total » par jour compte le code MS (par défaut), pas P.
5. Les KPI de la page Présence ne suivent pas le chantier choisi dans la grille et incluent les présences proposées.
6. Droits réels (rôles, matrice des permissions, onglets visibles) à confirmer dans la base de production.
7. Pas d'annulation d'OM trouvée dans l'interface ; compteur de numérotation commun à tous les documents RH.
8. Le bouton « Annuler » d'une demande de congé est visible pour un non-décideur même sur la demande d'un autre (refus par la base).
9. « Imprimer / archiver le mois » = impression navigateur uniquement.
10. Bornes des heures supplémentaires saisies directement dans la grille non vérifiées.
