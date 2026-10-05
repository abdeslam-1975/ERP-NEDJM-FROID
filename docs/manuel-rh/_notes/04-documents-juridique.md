# 04 — Vue d'ensemble, Documents et Juridique (notes pour le manuel RH)

> Notes de travail destinées à la rédaction du *Manuel d'utilisation* et des scripts de tutoriels vidéo.
> Établies par lecture du code (application `nedjm-froid-erp`, migrations `supabase/migrations`), **sans exécution de l'application**.
> Les libellés entre guillemets « … » sont recopiés de l'interface. Les points non certains sont signalés par **⚠ À vérifier**.

## 0. Conventions et remarques générales

- **Langue de l'interface** : dans le module RH, la fonction d'affichage bilingue `bi(fr, ar)` renvoie **uniquement le français** (« UI RH : libellés d'action / chrome en français uniquement »). L'arabe n'apparaît donc **que là où il est écrit en dur** : noms des sections (infobulle), certains titres de panneaux (« Établir un document / إعداد وثيقة »), libellés de champs des dialogues Ordre de mission / Titre de congé / Courriers, messages d'erreur bilingues du type « … · … ». Dans ces notes, l'arabe n'est indiqué que lorsqu'il est réellement affiché.
- **Tableaux standard** (composant `DataTable`) : champ de recherche, menu « Colonnes » (« Colonnes affichées »), tri par en-tête, pagination de 25 lignes par défaut avec « Précédent » / « Suivant » (sauf mention contraire).
- **Onglets configurables** : la plupart des jeux d'onglets portent une clé d'interface (`uiKey`) ; l'administrateur peut les masquer, les renommer ou les réordonner par rôle. Les libellés décrits ici sont les libellés **par défaut**.
- **Droits** : chaque écran est rattaché à un « écran » de la matrice des droits (`sys_screens`). Les droits par défaut donnés au § 5 proviennent des migrations initiales ; ils peuvent avoir été modifiés dans *Administration › Permissions*.
- **Codes de décision** utilisés dans ces écrans (Centre de décisions, `/decisions`) :
  - **D1** — paie d'un mois dont des règles attendent une approbation ;
  - **D2** — « Date d'application d'une règle légale » ;
  - **D3** — « Recalcul des paies brouillon » ;
  - **D4** — « Génération de paie » ;
  - **D13** — « Contrat ne commençant pas le 1er » ;
  - **D15** — « Voie de saisie d'un document à cheval sur 2025 et 2026 » ;
  - **D16** — portée d'une zone IRG (famille de proposition « Portée d'une zone IRG (D16) »).

---

## 1. Navigation du module RH (barre de sections et onglets)

### 1.1 Disposition

- En haut de toutes les pages RH, une **barre de sections** remplace le titre de page. Chaque section mène à son **premier onglet visible**.
- Sous la barre, une **seconde rangée d'onglets** n'apparaît que si la section active contient **au moins 2 onglets**.
- Le nom arabe de chaque section est affiché en infobulle.

| Section (FR) | Arabe | Onglets par défaut (route) |
|---|---|---|
| Vue d'ensemble | نظرة عامة | Tableau de bord (`/rh`), Qualité des données (`/rh/qualite-donnees`) |
| Personnel | العمال | Employés, Postes & grille, Intérim, Sorties |
| Temps & présence | الوقت والحضور | Présence, Imports de présences, Congés |
| Paie | الأجور | Préparation du mois, Calcul de la paie, Simulateur (raccourci, icône ↗), Exceptions, Avances, Virements, Déclarations, Opérations externes, Coûts |
| **Documents** | الوثائق | **Registre** (`/rh/documents` ; couvre aussi `/rh/contrats` et `/rh/paie/bulletins`), **Attestations** (`/rh/attestations`) |
| **Juridique** | القانوني | **Cotisations & impôts** (`/rh/legal`), **Propositions légales** (`/rh/legal/propositions`), **Documents juridiques** (`/rh/legal/documents`), **Extraction IA** (`/rh/legal/extraction-ia`), **Veille juridique** (`/rh/legal/veille`) |
| Autres | أخرى | (vide par défaut, toujours affichée) |
| Paramètres | الإعدادات | Paramètres |

- Anciennes adresses redirigées :
  - `/rh/contrats` → `/rh/documents?onglet=contrats` ;
  - `/rh/paie/bulletins` → `/rh/documents?onglet=bulletins` (les paramètres `year` / `month` sont conservés).

### 1.2 Fonction : Réorganiser la barre RH

- **Titre** : « Réorganiser » (bouton icône « déplacer », infobulle « Réorganiser la page : déplacer les onglets, le menu et les boutons · إعادة الترتيب »).
- **Où la trouver** : barre supérieure de l'application.
- **À quoi ça sert** : changer l'ordre des sections et des onglets, déplacer un onglet vers une autre section, renommer, créer ou supprimer des sections personnalisées.
- **Prérequis** : aucun pour « Pour moi ». Le choix « Pour tout le monde » n'apparaît que pour les utilisateurs autorisés à partager l'agencement (⚠ À vérifier : droit exact, a priori administrateur).
- **Étapes** :
  1. Cliquer sur « Réorganiser ». Un bandeau apparaît en bas de l'écran : « Réorganiser · إعادة الترتيب — faites glisser les onglets, les menus et les boutons encadrés. »
  2. Choisir éventuellement la portée « Pour moi » / « Pour tout le monde ».
  3. Faire glisser les onglets. Le bouton « Listes » ouvre un panneau latéral « Listes de la page · قوائم الصفحة » (« Faites glisser les lignes pour changer l'ordre. ») avec les rubriques « Menu latéral · القائمة الجانبية » et « Barre RH · شريط الموارد البشرية ».
  4. Une section peut être renommée (« Renommer · إعادة التسمية ») ou supprimée ; « Nouvel onglet · تبويب جديد » crée une section personnalisée (12 au maximum).
  5. Terminer par « Enregistrer · حفظ » (ou « Terminer » si rien n'a changé). « Annuler » abandonne ; « Ordre d'origine » / « Ordre de l'administrateur » réinitialise.
- **Résultat** : l'agencement est mémorisé.
- **Règles** :
  - Une section vide affiche l'infobulle « Vide : cliquez pour y ranger des onglets (Réorganiser) · فارغ، اضغط لنقل تبويبات إليه ».
  - La section « Autres » est toujours présente.
- **Liens** : le masquage d'un onglet (paramétrage de l'interface) **bloque aussi la route** correspondante. Les raccourcis du tableau de bord pointant vers une page bloquée sont retirés.

---

## 2. Section « Vue d'ensemble »

### 2.1 Page « Tableau de bord » (`/rh`) — disposition

Titre de l'onglet navigateur : « Espace RH ». La page est en lecture seule (indicateurs), sauf les boutons de navigation.

1. **En-tête** : date du jour, titre « Ressources humaines », boutons « Pointage » (→ `/rh/presence`) et « Nouvel employé » (→ `/rh/employes?nouveau=1`).
2. **Trois cartes d'indicateurs** :
   - « Effectif actif » ;
   - « Masse salariale » ;
   - « Présence ».
3. **Bandeau « Tableau de présence »** du mois, avec le bouton « Ouvrir le tableau ».
4. **Graphique « Évolution des effectifs »**, avec le sélecteur « 6 mois / 12 mois ».
5. **Anneau « Répartition des contrats »**.
6. **Panneau « Alertes »**, avec un badge indiquant le nombre d'alertes.
7. **Liste « Derniers recrutements »**, avec le lien « Voir tout ».
8. **Grille « Actions rapides »**.

#### Fonction : Lire les indicateurs du tableau de bord

- **Où** : RH › Vue d'ensemble › Tableau de bord.
- **À quoi ça sert** : vue synthétique de l'effectif, des contrats, de la masse salariale et de la présence.
- **Prérequis** : droit de lecture des écrans RH. Les chiffres sont limités aux données visibles avec les droits de l'utilisateur (⚠ À vérifier : filtrage par chantier selon le rôle).
- **Contenu et règles de calcul** :
  - **Effectif actif** :
    - nombre d'employés au statut *Actif* ou *Invité* ;
    - pastille d'évolution en % par rapport à la fin du mois précédent ;
    - texte « X inscrits · N contrats ouverts » ;
    - mini-courbe sur 12 mois.
  - **Masse salariale** :
    - somme des salaires de base mensuels des contrats *actifs*, affichée en « M DA » au-delà d'un million ;
    - « Couverture contractuelle » en % : part des employés actifs ayant un contrat ouvert (Actif, Brouillon ou Suspendu) ;
    - « Salaires de base mensuels · moyenne X ».
  - **Présence** :
    - pourcentage = (présents + en mission) ÷ salariés pointés, calculé sur le **dernier jour pointé** ;
    - anneau, et texte « N présents · date » ou « Aucun pointage ce mois-ci » ;
    - classement des codes : code MS ou libellé commençant par « mission » = mission ; « congé » = congé ; « absence » / « abandon » = absent ; code comptant comme présence = présent.
  - **Tableau de présence** :
    - mois en cours et « dernier jour pointé » ;
    - compteurs Présents / Absents / En congé / En mission ;
    - bouton « Ouvrir le tableau » ;
    - bandeau masqué si la page Présence est bloquée.
  - **Évolution des effectifs** : nombre d'employés distincts sous contrat à chaque fin de mois. Infobulle « N employés +écart ».
  - **Répartition des contrats** : contrats ouverts par type de contrat (libellé du catalogue). Un contrat sans type apparaît sous « Non renseigné ».
- **Liens** : chaque élément mène à l'écran détaillé (Présence, Employés, Registre des contrats).

#### Fonction : Traiter les alertes

- **Où** : panneau « Alertes » du tableau de bord.
- **À quoi ça sert** : repérer les contrats à régulariser.
- **Types d'alerte** (chaque ligne ouvre `/rh/documents?onglet=contrats`) :
  - « Fin de contrat » : contrat actif se terminant dans les 30 jours (« Dans N jours » ou « Aujourd'hui ») ;
  - « Contrats à finaliser » : contrats en brouillon ;
  - « Employés sans contrat » : « À régulariser ».
- **Résultat** : sans alerte, le panneau affiche « Tout est à jour ».
- **Liens** : Registre › Contrat de travail (§ 3.3).

#### Fonction : Derniers recrutements et actions rapides

- **Derniers recrutements** :
  - les 4 embauches les plus récentes ;
  - « Voir tout » → `/rh/employes` ;
  - chaque ligne → `/rh/employes?q=<matricule>`.
- **Actions rapides** :
  - Pointage ;
  - Nouvel employé ;
  - Attestation (→ `/rh/attestations`) ;
  - Congé ;
  - Avance (→ `/rh/paie/avances`) ;
  - Documents (→ `/rh/documents`).
- Une action dont la route est bloquée pour l'utilisateur n'est pas affichée.
- ⚠ À vérifier : la cible exacte du raccourci « Congé » (a priori `/rh/conges`).
- Remarque : le composant de compteurs de présence « Dernier jour pointé : … » / « Aucun pointage enregistré ces 30 derniers jours » est utilisé sur la page **Présence**, pas sur le tableau de bord.

### 2.2 Page « Qualité des données » (`/rh/qualite-donnees`)

**Disposition** :
- En-tête « Qualité des données / جودة البيانات ». La description explique que la page contrôle la wilaya codée de chaque chantier et les contrats ne commençant pas le 1er du mois, et que « Rien n'est corrigé d'office ».
- Trois panneaux :
  1. « Chantiers sans wilaya codée · N » ;
  2. « Contrats ne commençant pas le 1er du mois · N » ;
  3. « Contrainte « début au 1er du mois » ».

#### Fonction : Confirmer la wilaya codée d'un chantier

- **Où** : panneau 1.
- **À quoi ça sert** : remplacer une saisie libre de wilaya par une wilaya du référentiel. La wilaya codée détermine la **zone IRG** (Sud / Extrême Sud) des paies.
- **Prérequis** : droit de modification des chantiers ou affectations (⚠ À vérifier : droit exact contrôlé par la fonction serveur `confirmSiteWilaya`).
- **Colonnes** :
  - Chantier : code et nom, avec « (inactif) » si le chantier est désactivé ;
  - « Saisie libre actuelle » ;
  - « Wilaya codée » : liste « code · nom ».
- **Étapes** :
  1. Choisir la wilaya dans la liste. Une suggestion peut être pré-sélectionnée avec la mention « Proposée d'après la saisie libre : à vérifier. »
  2. Cliquer sur « Confirmer / تأكيد ».
- **Résultat** :
  - Message « CODE : wilaya confirmée. » La raison est enregistrée automatiquement : « Confirmation depuis le rapport de qualité des données ».
  - La wilaya s'applique depuis l'origine du chantier et fixe la zone IRG des mois non traités.
  - Les paies brouillon concernées sont **signalées** (pas recalculées). Si ce signalement échoue, le message ajoute « Paie brouillon non signalée : … ».
  - Quand la liste est vide : « Tous les chantiers ont une wilaya codée. »
- **Liens** : zones IRG (§ 4.2, onglet IRG) ; recalcul des brouillons via D3 (Paie).

#### Fonction : Demander une décision D13 (contrat ne commençant pas le 1er)

- **Où** : panneau 2.
- **À quoi ça sert** : régulariser les contrats existants dont la date de début n'est pas le 1er du mois.
- **Prérequis** : droit de modification des contrats sur le chantier du contrat (sinon « Demande non autorisée pour ce contrat. »).
- **Colonnes** :
  - Salarié ;
  - Chantier ;
  - Début ;
  - Fin ;
  - « Correction possible » : « Oui », ou « Mois traité : exception seulement » ;
  - Décision : pastille de statut cliquable vers `/decisions/<id>`, ou bouton « Demander D13 ».
- Recherche : « Rechercher un salarié ou un chantier… ».
- **Étapes** :
  - cliquer sur « Demander D13 » pour un contrat ;
  - ou sur « Demander les N décision(s) D13 » pour tous les contrats visibles sans demande ouverte.
- **Résultat** :
  - Message « Demande D13 envoyée au Centre de décisions : rien n'est modifié avant la décision. » (ou « N demande(s) D13 envoyée(s)… »).
  - Une notification est envoyée au décideur.
  - Liste vide : « Aucun contrat hors du 1er du mois — Parmi les contrats visibles avec vos droits. »
- **Règles métier (options de la décision D13)** :
  - « Corriger la date de début au 1er du mois » : la date de début devient le 1er du même mois, et l'affectation initiale et le salaire initial suivent. Option refusée si le mois est déjà traité (paie validée ou clôturée, ou mois antérieur à septembre 2026). Les paies brouillon sont signalées.
  - « Marquer comme exception historique documentée » : la date reste inchangée, la décision sert de justificatif et aucun montant ne change.
  - Une seule demande ouverte par contrat (dédoublonnage).
  - Refus si le contrat commence déjà le 1er (« Ce contrat commence déjà le 1er du mois. ») ou s'il est déjà documenté comme exception (« Ce contrat est déjà documenté comme exception historique. »).
- **Liens** : Centre de décisions ; Registre des contrats.

#### Fonction : Ajouter la contrainte « début au 1er du mois » à la base

- **Où** : panneau 3.
- **Contenu** :
  - « État » : « Active · date · auteur » ou « Pas encore ajoutée » ;
  - compteurs « Contrats sans décision » et « Exceptions documentées » ;
  - note : « Toute nouvelle date de début hors du 1er est déjà refusée… ».
- **Prérequis** : **SUPER_ADMIN** uniquement (sinon « Réservé au SUPER_ADMIN. »). Le bouton est désactivé tant que des contrats attendent une décision.
- **Étapes** : cliquer sur « Ajouter la contrainte à la base », puis confirmer.
- **Résultat** : « Contrainte ajoutée à la base. » (ou « Contrainte déjà active. »).

---

## 3. Section « Documents »

### 3.1 Page « Registre » (`/rh/documents`) — disposition

- Titre de l'onglet navigateur : « Documents RH ».
- En-tête : « Documents », avec la phrase « Chaque document reçoit une référence unique, jamais réutilisée. »
- **5 cartes-onglets** (cliquer sur une carte affiche le registre correspondant) :

| Carte | Compteur | Paramètre d'URL |
|---|---|---|
| Fiche de renseignements | nombre de fiches | `?onglet=fiches` |
| Contrat de travail | nombre de contrats | `?onglet=contrats` |
| Ordre de mission | nombre d'ordres | `?onglet=missions` (**onglet par défaut**) |
| Titre de congé | nombre de titres | `?onglet=conges` |
| Bulletin de paie | « Par période de paie » | `?onglet=bulletins` |

- Autres paramètres d'URL :
  - `?nouveau=om` ouvre directement un nouvel ordre de mission ;
  - `?titre=<id>` ouvre un titre de congé précis (lien utilisé depuis l'écran Congés).
- Les registres Contrats et Bulletins sont chargés à la demande (« Chargement du registre… »).

#### Règles communes de numérotation des documents RH

- Le numéro est attribué **par le serveur à l'enregistrement**, au format `NNNNNN/AA` (6 chiffres / 2 chiffres de l'année, fuseau horaire d'Alger).
- Le compteur **repart chaque année**.
- **Le compteur est commun à tous les types de courriers RH** (ordres de mission, titres de congé, attestations, certificats, reçus STC, mises en demeure). Le prochain numéro = plus grand numéro existant de l'année + 1. ⚠ À vérifier fonctionnellement (et à formuler prudemment dans le manuel) : les numéros d'un même type peuvent donc « sauter ».
- Le numéro est unique en base. En cas de conflit simultané, l'enregistrement est retenté jusqu'à 3 fois, sinon « Numéro déjà attribué, réessayez. »
- Aucun écran ne permet de supprimer un document numéroté. Un titre de congé peut être **annulé** (statut conservé, numéro non réutilisé).
- Formats imprimés :
  - ordre de mission : `NF/OM/0005/26` ;
  - titre de congé : `NF/CNG/0005/26` ;
  - attestations et courriers : « N° : 000005/26 ».

#### Règles communes d'archivage PDF

- À l'enregistrement d'une fiche, d'un ordre de mission ou d'un titre de congé, le serveur produit un **PDF** à partir du modèle d'impression et le range dans le dossier de l'employé (types FICHE_RENSEIGNEMENTS, OM_ARCHIVE, LEAVE_ARCHIVE).
- Si l'archivage échoue, l'enregistrement est **conservé** et un message l'indique (« Archive non créée : … », « PDF plus tard : … »).

### 3.2 Fonction : Fiche de renseignements

- **Où** : Registre › carte « Fiche de renseignements ».
- **À quoi ça sert** : afficher, imprimer ou compléter la fiche signalétique d'un employé (une fiche par employé).
- **Disposition** :
  - sous-titre « Une fiche par employé : affichez-la, imprimez-la ou complétez-la. » ;
  - bouton « Fiche employé » (nouvelle fiche, donc nouvel employé) ;
  - recherche « Matricule, nom, NSS, NIN… » ;
  - colonnes : Employé ; « PDF archivé » (« Ouvrir le PDF » ou « Pas encore archivée ») ;
  - actions par ligne : « Afficher la fiche », « Imprimer la fiche », « Modifier la fiche ».
- **Prérequis** :
  - lecture : droit « Documents RH » (`hr_documents`) ;
  - modification : droit de mise à jour des employés (⚠ À vérifier).
- **Étapes** :
  1. Afficher la fiche : un aperçu A4 s'ouvre (titre = nom, sous-titre « Matricule … »), avec les boutons « Fermer », « Modifier » et « Imprimer ».
  2. Modifier la fiche : le formulaire employé s'ouvre (détaillé dans les notes « Personnel »).
  3. Enregistrer.
- **Résultat** :
  - « Fiche enregistrée. PDF : <fichier> », ou « Fiche enregistrée. PDF plus tard : <erreur> » ;
  - le PDF archivé est ensuite accessible par « Ouvrir le PDF ».
- **Liens** : Personnel › Employés (même formulaire).

### 3.3 Fonction : Registre des contrats de travail

- **Où** : Registre › carte « Contrat de travail ». Aussi accessible par `/rh/contrats` et par les alertes du tableau de bord.
- **Disposition** :
  - en-tête « Contrats de travail / عقود العمل » ; la description rappelle que le chantier porte l'activité et le CACOBATPH, que les rubriques sont réparties en cinq classes, et que les contrats brouillon entrent aussi en paie ;
  - boutons de la barre d'outils (configurable) : « Exceptions » (→ `/rh/paie/exceptions`), « Importer des contrats », « Contrat PDF », « Nouveau contrat » ;
  - recherche « Employé, matricule, affectation… » ;
  - colonnes : Employé, Affectation, Type, Net chantier, Statut (Brouillon / Actif / Suspendu / Clôturé) ;
  - actions par ligne : « Afficher », « Modifier », « Imprimer », « PDF archivé ».
- **Formulaire** (aperçu seulement, détaillé dans les notes Personnel / Paie) :
  - sections Employé / affectation / poste ; Contrat (« Début (1er du mois) », « Fin » avec l'aide « Vide = durée indéterminée ») ; Rémunération ; Cotisations et impôts ; Rubriques de salaire ; Rubriques CRP ;
  - boutons « Aperçu et impression » et « Enregistrer ».
- **Règles** :
  - toute nouvelle date de début doit être le 1er du mois (voir D13, § 2.2) ;
  - les dérogations de conformité par contrat (zone IRG, taux libératoire 10 % / 15 %, régime CNAS, CACOBATPH personnalisé) se gèrent depuis la fiche contrat, avec un motif d'au moins 5 caractères et une date d'effet. Elles sont réservées aux personnes ayant le droit d'écriture « Conformité (unité 05) ». ⚠ Détails à documenter avec le formulaire contrat.

### 3.4 Fonction : Ordres de mission

#### Registre

- **Où** : Registre › carte « Ordre de mission » (onglet par défaut).
- **Disposition** :
  - sous-titre « Archivés à l'enregistrement et consultables à tout moment. » ;
  - bouton « Nouvel ordre de mission » ;
  - recherche « Référence, matricule, nom… » ;
  - colonnes :
    - Référence (`NF/OM/…`, « Établi le jj/mm/aaaa ») ;
    - Employé ;
    - Mission (destination et période ; « Fin de mission » s'il n'y a pas de date de retour) ;
    - Établi par.
  - actions par ligne :
    - « Consulter » (ouvre le PDF archivé, sinon lance l'impression) ;
    - « Modifier » ;
    - « Voir le pointage » (→ `/rh/presence?employee=…&site=…&mois=…`).
  - registre vide : « Aucun ordre de mission — Créez le premier avec « Nouvel ordre de mission ». »

#### Dialogue « Ordre de Mission »

- **Titre** : « Ordre de Mission », avec en sous-titre le numéro ou « Nouveau ».
- **Prérequis** :
  - droit de modification « Documents RH » sur le chantier ;
  - l'employé doit exister ;
  - l'affectation choisie doit correspondre à un chantier du référentiel (sinon le pointage ne peut pas être lié).
- **Barre de recherche** : « Rechercher par N° OM, matricule ou nom... », bouton « RECHERCHER », navigation « ❮ Précédent » / « Suivant ❯ » entre les ordres.
- **Champs**, par bloc :
  1. **Identification**
     - « N° Ordre de Mission » (lecture seule, attribué à l'enregistrement).
     - « Rechercher un employé » + « Chercher » : recherche par matricule exact, début de nom, ou contenu dès 3 lettres ; s'il y a plusieurs résultats, une liste permet de choisir.
     - Nom, Prénom.
     - Affectation (liste des chantiers).
     - « Code affectation — رمز التعيين ».
     - « Fonction / Poste » (catalogue des postes).
  2. **Déplacement**
     - « 1ère destination », « 2ème destination » (suggestions issues des chantiers).
     - « Lieu de départ » (défaut : Hassi Messaoud).
     - « Date de départ — تاريخ الذهاب ».
     - « Heure » (ancien modèle uniquement).
     - « Lieu de retour ».
     - « Date de retour — تاريخ العودة » : vide = mission ouverte, imprimée « Fin de mission ».
     - « Motif du déplacement ».
     - Note : à l'enregistrement, les jours de mission sont **proposés** en code « MS » dans le pointage, **sans être validés**.
  3. **Transport**
     - Moyen : « Tous moyens de transport » / « Véhicule de service ».
     - Véhicule — Modèle, Immatriculation, Kilométrage départ / retour.
  4. **Pièce d'identité du missionnaire**
     - Type, N°.
     - « Délivré le » et « À (lieu) » (ancien modèle uniquement).
  5. **Donneur de l'OM & émission**
     - Donneur (défaut : « Service RH »), Fonction du donneur.
     - « Fait à » (défaut : HMD).
     - « Date du document ».
     - « Modèle d'impression — نموذج الطباعة » : « Nouveau modèle » / « Ancien modèle ».
- **Boutons du pied** : « NOUVEAU », « IMPRIMER », « ENREGISTRER » (ou « MODIFIER » pour un ordre existant), « Fermer ».
- **Validations et messages d'erreur** :
  - « Employé requis. »
  - « Le matricule et le nom sont obligatoires. »
  - « Date de départ obligatoire. »
  - « La date de départ doit être aujourd'hui ou une date future. »
  - « La date de retour doit être une date future. »
  - « La date de retour doit être postérieure à la date de départ. » / « La date de retour précède le départ. »
  - « Affectation introuvable : impossible de lier l'ordre au pointage. »
  - « Numéro déjà attribué, réessayez. »
  - Lors d'une modification, les dates déjà enregistrées ne sont pas re-contrôlées par rapport à aujourd'hui.
- **Résultat** :
  - « Ordre NNN enregistré et archivé. » (variante « Ordre de mission N enregistré. ») ;
  - si l'archivage échoue : « Archive non créée : … » ;
  - « Jours MS proposés dans le pointage, à valider. » avec le lien « Ouvrir le pointage » ;
  - impression A4 (nouveau ou ancien modèle), référence imprimée `NF/OM/NNNN/AA`.
- **Règles métier** :
  - numérotation commune (§ 3.1) ;
  - la génération des jours de mission dans le pointage dépend du paramétrage du type de courrier (catalogue `correspondence_type`, légende générée) ;
  - les jours proposés restent à valider dans Présence.
- **Liens** : Temps & présence › Présence (validation des jours MS) ; dossier de l'employé (PDF archivé).

### 3.5 Fonction : Titres de congé

#### Registre

- **Où** : Registre › carte « Titre de congé ».
- **Disposition** :
  - sous-titre « Un titre numéroté par congé approuvé : complétez-le, puis imprimez. » ;
  - bouton « Nouveau titre de congé » ;
  - colonnes :
    - Référence (`NF/CNG/…`, « Émis le ») ;
    - Employé ;
    - Nature ;
    - Période (et nombre de jours) ;
    - État (« Annulé » / « Complété » / « À compléter ») ;
  - actions par ligne : « Ouvrir le PDF archivé », « Ouvrir le titre », « Imprimer ».

#### Dialogue « Titre de Congé »

- **Prérequis** :
  - droit « Documents RH » ;
  - pour un nouveau titre, droit de créer une demande de congé ;
  - pour que le titre soit numéroté immédiatement, droit d'**approuver** les congés.
- **Recherche** : « Rechercher par N° titre, matricule ou nom... », navigation « Précédent » / « Suivant ».
- **Champs** :
  1. **Identification**
     - « N° Titre de congé ».
     - « Rechercher un employé » (nouveau titre uniquement).
     - Matricule (lecture seule), Nom, Prénom, Affectation, « Fonction / Poste ».
  2. **« Congé — الإجازة »**
     - « Nature du congé — طبيعة الإجازة » : Congé annuel (CA), Récupération (CRP), Congé maladie (CM), Congé sans solde (CSS), Absence autorisée payée (AOP).
     - « Du — من ».
     - « Au (inclus) — إلى ».
     - « Nombre de jours — عدد الأيام » (aide « N j calendaires »).
     - « Date de reprise — تاريخ الاستئناف » (lecture seule, = lendemain du dernier jour).
     - Ces champs sont **en lecture seule** pour un titre existant.
  3. **Transport.**
  4. **« Pièce d'identité de l'intéressé(e) ».**
  5. **« Validation & émission »** : Établi par, Fonction, « Fait à », « Date du document ».
- **Étapes (nouveau titre)** :
  1. Rechercher l'employé.
  2. Choisir la nature et les dates.
  3. Compléter les champs d'impression.
  4. Enregistrer. L'application crée la demande de congé, l'**approuve** (ce qui attribue le numéro), puis enregistre les champs du titre.
- **Validations et messages** :
  - « Recherchez d'abord l'employé. »
  - « Dates du congé requises (du … au …). »
  - « Le matricule et le nom sont obligatoires. »
  - Congé annuel : en cas de solde insuffisant, « Solde insuffisant (X j disponibles pour Y j demandés). Enregistrer quand même ? »
  - Sans droit d'approbation : « Demande de congé enregistrée, en attente d'approbation : le titre sera établi à l'approbation. »
  - Congé annulé : « Ce congé a été annulé : le titre ne peut plus être imprimé. »
  - ⚠ À vérifier : autres refus possibles côté serveur (chevauchement de congés, etc.), non relus ici.
- **Résultat** :
  - « Titre de congé NF/CNG/… enregistré et archivé en PDF. … Jours proposés dans le pointage, à valider. »
  - Impression A4 ; PDF archivé dans le dossier de l'employé.
- **Liens** : Temps & présence › Congés (demandes, approbation, annulation, solde) ; Présence (jours proposés).

### 3.6 Fonction : Registre des bulletins de paie

- **Où** : Registre › carte « Bulletin de paie » (ou `/rh/paie/bulletins`).
- **Disposition** :
  - en-tête « Bulletins de paie » (« Bulletins déjà établis, tous mois confondus… ») ;
  - bouton « Nouveau bulletin de paie » ;
  - recherche « Rechercher (matricule, nom, chantier)… », sélecteur de période (« Toutes les périodes ») et compteur ;
  - colonnes : Période (MM/AAAA), Employé, Chantier, Jours, Net à payer DA, Statut (Brouillon / Validée / Clôturée) ;
  - actions par ligne : « Afficher », « Imprimer », « Recalculer » (brouillon uniquement), « PDF archivé » (hors brouillon) ;
  - pagination de 50 lignes.
- **Dialogue « Nouveau bulletin de paie »** :
  - champs : Employé (liste avec recherche), Mois, Année (2000–2100) ;
  - bouton « Établir le bulletin ».
- **Règles métier** :
  - selon la situation, l'établissement passe par une décision :
    - D4 « Générer la paie du mois… » ;
    - D3 « Recalculer… » ;
    - D1 « Des règles du mois attendent une approbation… » ;
  - une justification d'au moins 10 caractères est exigée ;
  - boutons : « Générer et afficher » / « Recalculer et afficher » / « Afficher sans recalculer » ;
  - l'ouverture d'un brouillon devenu obsolète déclenche aussi une demande de décision ;
  - si l'utilisateur est lui-même le demandeur : « Vous êtes à l'origine de la demande : un autre décideur doit la trancher. »
- **Liens** : section Paie (calcul, validation, clôture), détaillée dans les notes « 03 — Paie ».

### 3.7 Page « Attestations » (`/rh/attestations`)

**Disposition** :
- Titre : « Attestations & courriers ».
- Panneau « Établir un document / إعداد وثيقة » : champs Employé et Document, bouton « Préparer / تحضير ».
- Note : « Les titres de congé s'impriment depuis le Registre ; certificat et solde de tout compte sont aussi accessibles depuis Sorties. »
- **Historique** :
  - colonnes : N°, Document (avec la langue FR / AR), Employé (« matricule · nom »), « Établi le » ;
  - bouton « Réimprimer / إعادة الطباعة » ;
  - 300 lignes au maximum ; les courriers annulés sont exclus.

#### Fonction : Établir une attestation ou un courrier

- **Prérequis** : droit « Attestations & courriers » (`hr_letters`).
- **Documents disponibles** :
  - « Attestation de travail / إفادة عمل » ;
  - « Certificat de travail / شهادة عمل » ;
  - « Reçu pour solde de tout compte / وصل تصفية كل حساب » ;
  - « Mise en demeure (1ère) / إعذار أول » ;
  - « Mise en demeure (2ème et dernière) / إعذار ثانٍ وأخير ».
- **Étapes** :
  1. Choisir l'employé (un employé sorti est marqué « (sorti) ») et le document, puis cliquer sur « Préparer / تحضير ».
  2. Dans le dialogue (titre FR · AR), choisir la langue « Français » / « العربية » et la civilité (Monsieur / Madame).
  3. Vérifier les champs pré-remplis :
     - **communs** : « Nom et prénom » (FR), « الاسم واللقب », Matricule, « Date du document », Poste (FR), « المنصب » ;
     - **attestation de travail** : « Né(e) le », lieu de naissance FR / AR, « En poste depuis le » ;
     - **certificat de travail** : naissance, « Du », « Au (date de sortie) » ;
     - **reçu pour solde de tout compte** : « Du », « Au », « Somme reçue (DA) », « Détail du solde (facultatif) » avec « Ajouter une ligne » / « Retirer » ;
     - **mise en demeure (1ère)** : Adresse FR / AR, « Absent depuis le », « Délai (jours) » ;
     - **mise en demeure (2ème)** : idem, plus « N° 1ère mise en demeure » et « Date 1ère mise en demeure », pré-remplis depuis la dernière 1ère mise en demeure.
  4. Facultatif : cocher « Modifier le texte librement ». L'« Aperçu » se met à jour en direct.
  5. Cliquer sur « Enregistrer et imprimer / حفظ وطباعة ».
- **Pré-remplissage** :
  - « En poste depuis » = date de début du premier contrat ;
  - certificat et solde de tout compte : date de sortie issue de la sortie enregistrée de l'employé ;
  - montant du solde de tout compte = net des bulletins du mois de sortie, sinon somme des lignes de solde.
- **Résultat** :
  - courrier enregistré au statut émis, avec un **numéro du compteur commun** (§ 3.1), imprimé « N° : 000005/26 » ;
  - « Réimprimer » conserve le **même numéro**.
- **Liens** : Personnel › Sorties (certificat, solde de tout compte) ; Congés (titres de congé).

---

## 4. Section « Juridique »

### 4.1 Circuit commun d'une règle légale (à expliquer une fois dans le manuel)

1. **Proposition** : depuis « Cotisations & impôts » ou « Extraction IA », une modification de taux ou de variable, un arrêt, une vérification, un barème IRG, des règles IRG ou une portée de zone **ne s'applique jamais directement**. Elle crée une **proposition**.
   - Bandeau type : « Ce changement devient une proposition : un approbateur la valide, puis le SUPER_ADMIN décide de sa date d'application (D2). La paie ne change pas avant. »
   - Message type : « Proposition envoyée pour approbation : aucun effet sur la paie avant l'approbation, puis la décision de sa date d'application (D2). »
2. **Approbation** par une **autre personne** que les contributeurs (séparation des tâches). Le SUPER_ADMIN peut approuver sa propre proposition ; c'est alors signalé.
3. **Décision D2** : choix du mois d'application, toujours au **1er d'un mois non traité**, jamais sur une paie validée ou clôturée. Options de la décision :
   - « Appliquer à partir du mois indiqué » ;
   - « Ne pas appliquer pour l'instant ».
   Les paies brouillon concernées sont signalées et ne sont recalculées que sur décision **D3**.
4. **Statuts d'une proposition** : Brouillon → Soumise → Approuvée → Appliquée ; ou Rejetée, Retirée, Remplacée.
5. **Familles de propositions** :
   - « Taux ou variable légale » ;
   - « Taux d'un régime CNAS » ;
   - Barème IRG ;
   - « Règles IRG (art. 104) » ;
   - « Portée d'une zone IRG (D16) ».
6. **Actions** : « Nouvelle valeur », « Arrêt », « Vérification d'une valeur existante ».

**Sources et justificatifs (champs communs « Source légale »)** :
- « Source légale » : obligatoire, 3 caractères minimum.
- « Date d'effet du texte » : obligatoire.
- « Justificatifs * » : au moins 1, au plus 20. Chaque justificatif comprend :
  - un document **du registre des documents juridiques** (§ 4.4) ;
  - « Article » ;
  - « Page » (1–5000) ;
  - « Extrait du texte » (10 à 2000 caractères).
- Boutons « Ajouter un justificatif » / « Retirer ce justificatif ».
- Un avertissement s'affiche si le mois demandé sort de la période d'application du document.

**Écart à la réglementation** :
- Si une valeur saisie s'écarte des valeurs légales de référence, le dialogue « Écart à la réglementation » s'ouvre : « La valeur proposée s'écarte du barème légal en vigueur. Le dépassement est enregistré dans le journal d'audit. »
- Boutons : « Fermer », « Respecter la réglementation » (remet la valeur légale), « Autoriser le dépassement ».
- **Valeurs de référence** (code `statutory.ts`) :
  - **CNAS** : 9 % salarié, 25 % employeur, 0,5 % FOS (décret 15-236). Un taux employeur de 25,5 % ou 26 % pour le régime général est signalé comme comptant deux fois le FOS.
  - **CACOBATPH** : congés payés 12,21 % employeur ; intempéries 0,75 %, répartis 0,375 % / 0,375 %.
  - **Barème IRG annuel** :
    - 0–240 000 : 0 % ;
    - 240 001–480 000 : 23 % ;
    - 480 001–960 000 : 27 % ;
    - 960 001–1 920 000 : 30 % ;
    - 1 920 001–3 840 000 : 33 % ;
    - au-delà de 3 840 001 : 35 %.
  - **Règles IRG (art. 104)** :
    - exonération jusqu'à 30 000 DA/mois ;
    - abattement de 40 % (minimum 1 000, maximum 1 500) ;
    - lissage des salariés entre 30 001 et 35 000 : `IRG×137/51 − 27925/8` ;
    - lissage des handicapés / retraités entre 30 001 et 42 500 : `×93/61 − 81213/41` ;
    - retenue non mensuelle : 10 % ;
    - base : déduction de la CNAS salariale.

### 4.2 Page « Cotisations & impôts » (`/rh/legal`) — disposition

- **Accès** : lecture du droit « Conformité fiscale & sociale (unité 05) ». Sans ce droit, redirection vers l'accueil avec une erreur « forbidden ».
- **En-tête** : surtitre « Juridique », titre « Cotisations & impôts ». Description : « Proposez l'ajout, la modification ou l'arrêt d'une rubrique : après approbation, le SUPER_ADMIN décide du mois d'application, jamais sur les paies passées. »
- **Onglets** (configurables) :

| Onglet | Paramètre d'URL |
|---|---|
| CNAS | `?tab=cnas` |
| CACOBATPH | `?tab=cacobatph` |
| Impôts (IRG) | `?tab=irg` |
| Autres (SNMG…) | `?tab=other` |

- **Bandeau de période** : « Paies validées ou clôturées jusqu'à X… Toute modification s'applique au plus tôt à partir de Y… devient une proposition : approbation, puis décision de sa date d'application (D2). »
- **Lecture seule** : « Lecture seule : modification réservée à SUPER_ADMIN, ADMIN_RH et ADMIN_FINANCE (unité 05). »

#### Onglet CNAS — Fonction : Gérer les régimes CNAS

- **Disposition** :
  - panneau « Régimes CNAS ». Le régime d'un salarié se choisit dans le contrat (« Régime CNAS ») ou dans la fiche employé (« Profil social »), sinon STANDARD. Un taux vide = taux légal du mois ;
  - colonnes :
    - Code (+ « Historique (n) ») ;
    - Libellé (+ pastille « Approuvée » / « Reprise non vérifiée », lien « Faire vérifier ») ;
    - « % salarié », « % employeur », « % FOS » ;
    - « À venir » ;
    - « Actif » ;
    - Modifier / Supprimer ;
  - bouton « + Ajouter un régime ».
- **Étapes** :
  1. Cliquer sur « + Ajouter un régime » ou « Modifier ». Le dialogue s'appelle « Nouveau régime CNAS » ou « Régime CODE ».
  2. Remplir :
     - Code (lettres A–Z, chiffres, « _ » ; non modifiable après création) ;
     - Libellé FR / AR ;
     - « Régime actif » ;
     - taux (indication « légal X »).
  3. Si les taux changent : le bandeau de proposition s'affiche, puis le champ « Nouveaux taux demandés à partir de la paie de » (mois) et les champs Source légale / justificatifs.
- **Erreurs** :
  - « Code : au moins 2 caractères… » ;
  - « … : saisissez un nombre entre 0 et 100 ».
- **Résultat** :
  - « Régime X enregistré. » (libellés et activation : effet immédiat) ;
  - si les taux changent : « Régime X : nouveaux taux demandés dès … » (ou « taux légaux (9 % / 25 % / FOS 0,5 %) demandés dès … »), suivi du message de proposition envoyée.
- **Règles** : le régime STANDARD ne peut pas être supprimé ; tout changement de taux passe par le circuit § 4.1.
- ⚠ À vérifier : l'onglet CNAS n'affiche que le panneau des régimes dans le code actuel (pas de panneau « Rubriques » CNAS).

#### Onglet CACOBATPH — Fonction : Gérer les rubriques CACOBATPH

- Panneau « Rubriques CACOBATPH » : « Congés payés et intempéries, appliqués aux salariés des activités assujetties (codes d'activité). »
- Fonctionne comme le panneau Rubriques décrit ci-dessous.

#### Onglet Impôts (IRG)

- Panneau « Rubriques impôts » : abattements par zone Sud / Extrême Sud, à 0 % tant que non confirmés.
- Gestionnaire « Barème IRG ».
- Panneau « Portée des zones IRG ».

#### Onglet Autres (SNMG…)

- Panneau « Paramètres liés à la paie » : valeurs (et non pourcentages), sans ligne personnalisée.
- Paramètres :
  - SNMG (DA) ;
  - diviseur fixe (« Diviseur fixe (si mode FIXED) ») ;
  - heures mensuelles ;
  - taux d'heures supplémentaires 50 / 75 / 100 ;
  - « Congé annuel acquis par mois de travail ».
- ⚠ À vérifier : les libellés exacts affichés proviennent de la base (`ref_global_vars`) et peuvent différer.

#### Panneau « Rubriques » (CACOBATPH, IRG, Autres) — disposition

- **Colonnes** :
  - Rubrique : pastilles « Ajoutée » / « Légale » / code / « Arrêtée depuis » / « Démarre en », et ligne « Assiette : … » ;
  - Part (Salariale / Patronale) ;
  - « Taux · paie de <mois> » : « depuis le … », pastille vérifiée, « Faire vérifier », « Historique (n) » ;
  - « À venir » : « X dès <mois> », « Arrêt dès », et les propositions en attente, cliquables vers l'écran Propositions ;
  - Modifier / Supprimer.
- **Bouton** : « + Ajouter une rubrique » (absent de l'onglet Autres).

#### Fonction : Proposer une nouvelle valeur (taux ou paramètre)

- **Dialogue** : « Proposer une valeur — X ».
- **Champs** :
  - « Nouveau taux (%) » ou « Nouvelle valeur » ;
  - « Demandé à partir de la paie de » (mois ; l'aide rappelle la décision D2 et le premier mois ouvert) ;
  - Source légale / justificatifs.
- **Erreurs** : « Saisissez une valeur numérique. », « Choisissez le mois d'effet. ».
- **Bouton** : « Proposer ».
- **Résultat** : proposition soumise (circuit § 4.1). Le dialogue « Écart à la réglementation » s'ouvre si la valeur s'écarte du légal.

#### Fonction : Ajouter ou modifier une rubrique (cotisation)

- **Dialogue** : « Nouvelle rubrique » / « Modifier — X ».
- **Champs** :
  - « Libellé (FR) » (2 caractères minimum), « Libellé (AR) » ;
  - « Code sur le bulletin » (12 caractères maximum, « Vide = code technique ») ;
  - « Ordre d'affichage » ;
  - case « Reprendre le calcul » (rubrique arrêtée) ;
  - bloc « Calcul sur le bulletin » : Part, « Taux (%) », « Salariés concernés » (CACOBATPH), mois, sources ;
  - « Options avancées » : assiette (brut cotisable / imposable), « Déductible de l'assiette IRG ».
- **Erreur** : « Saisissez un taux supérieur à 0 %. »
- **Boutons** : « Ajouter et proposer » / « Proposer » / « Enregistrer ».
- **Règles** :
  - les changements de **libellé** s'appliquent immédiatement aux paies futures ;
  - les changements de **taux** deviennent une proposition ;
  - une nouvelle rubrique est ajoutée au catalogue **sans calcul** tant que sa proposition n'est pas appliquée.

#### Fonction : Proposer l'arrêt / supprimer une rubrique

- **Dialogue** : « Proposer l'arrêt — X », avec le champ « Retirer à partir de la paie de » et le bouton « Proposer l'arrêt ».
- **Règles** :
  - une rubrique **jamais appliquée** en paie est supprimée directement, après confirmation ;
  - un taux légal ne se supprime pas (« Taux légal obligatoire : modifiable, non supprimable. ») ;
  - suppression refusée si une proposition est en cours (« … retirez-la d'abord (écran Propositions) »).

#### Fonction : Faire vérifier une valeur reprise

- **Dialogue** : « Faire vérifier — X ». « La valeur ne change pas… ». Bouton « Demander la vérification ».
- **Résultat** : « Vérification demandée : la valeur reste inchangée ; un approbateur la confirmera comme référence. »
- **Règle** : une proposition « Vérification » approuvée ne passe **pas** par D2.

#### Fonction : Barème IRG et règles art. 104

- **Disposition** :
  - titre « Barème IRG » ;
  - sélecteurs « Version du barème » et « Jeu de règles (catégorie) » (Salarié / Handicapé-retraité) ;
  - bloc « Simulation — base IRG mensuelle (DA) » (défaut 40 000), qui affiche l'« IRG mensuel estimé » ;
  - tableau « Tranches annuelles » : « Min annuel », « Max annuel » (∞), « Taux % ».
- **Étapes (nouveau barème)** :
  1. Cliquer sur « Nouveau brouillon (copie de ce barème) », ou remplir le formulaire de brouillon : Code, Libellé, « Référence légale », « Mois envisagé » (indicatif), « Copier les tranches de ».
  2. Cliquer sur « Créer le brouillon » / « Enregistrer le brouillon ».
  3. Modifier les tranches (« Ajouter une tranche »), puis « Enregistrer les tranches du brouillon ». Les tranches ne sont modifiables qu'en **brouillon**.
  4. « Soumettre à approbation » ouvre le dialogue « Soumettre le barème / le jeu de règles » : « Le brouillon est figé dès la soumission. S'il est retiré ou rejeté, il redevient un brouillon modifiable. » Il comprend le champ « Demandé à partir de la paie de », les sources, et le bouton « Soumettre ».
- **Règles art. 104** :
  - colonnes : #, Règle, Paramètres ;
  - types : Exonération, « Abattement 40 % », Lissage, « Base (déductions) », « Retenue non mensuelle » ;
  - champs : Type, Séquence, « S'applique à » (brut / base / impôt), minimum / maximum mensuel, « Taux % », « Formule [IRG_AFTER_ABATEMENT] », « Jetons à déduire » ;
  - boutons « Ajouter la règle » / « Mettre à jour ».
- **Statuts** : « Reprise, non vérifiée », Brouillon, « Soumis à approbation », Approuvé, Remplacé.
- **Autres actions** : « Supprimer le brouillon » (confirmation « Supprimer le brouillon CODE ? »), « Faire vérifier » (versions reprises uniquement).
- **Messages** :
  - « Brouillon de barème enregistré : sans effet avant sa soumission, son approbation et la décision D2. » (idem pour les règles) ;
  - « Tranches enregistrées. » ;
  - « Règle enregistrée. » ;
  - « Règle supprimée. » ;
  - « Brouillon X supprimé. ».

#### Fonction : Proposer la portée d'une zone IRG (wilayas concernées)

- **Disposition** :
  - panneau « Portée des zones IRG (wilayas concernées) » : « Une portée datée remplace la liste du catalogue à partir de son mois. Le choix de zone fait sur le site reste prioritaire. » ;
  - colonnes :
    - Zone ;
    - « Wilayas · paie de <mois> » (« Portée approuvée dès … » ou « Catalogue, non daté ») ;
    - « À venir » ;
    - bouton « Proposer une portée ».
- **Étapes** :
  1. Ouvrir le dialogue « Portée de la zone X ».
  2. Choisir le mode :
     - « Choisir les wilayas » : filtre « Filtrer (code ou nom) », puis cases à cocher ;
     - ou « Reprendre un groupement enregistré » (« Groupement repris »).
  3. Choisir le mois, renseigner les sources, puis cliquer sur « Proposer (N wilayas) ».
- **Erreurs** : « Sélectionnez au moins une wilaya. », « Choisissez le mois demandé. », « Indiquez le groupement repris. »
- **Liens** : wilaya codée des chantiers (§ 2.2) ; famille « Portée d'une zone IRG (D16) ».

### 4.3 Page « Propositions légales » (`/rh/legal/propositions`)

**Disposition** :
- Paramètres d'URL :
  - `?id=` met une proposition en évidence ;
  - `?vue=approbation` ouvre la vue « À approuver » ;
  - `?tout=1` affiche tout l'historique.
- En-tête « Propositions légales ». La description rappelle le circuit : soumission, approbation par une autre personne (le SUPER_ADMIN peut approuver sa propre proposition, c'est alors signalé), puis décision D2.
- Onglets avec compteurs :
  - « En cours (n) » ;
  - « À approuver (n) » ;
  - « Approuvées, date à décider (n) » ;
  - « Toutes (n) ».
- Lien « Afficher tout l'historique » / « Masquer les propositions closes anciennes ».
- Vue vide : « Aucune proposition dans cette vue. »
- **Carte d'une proposition** :
  - pastilles : statut, famille, action, « Brouillon IA, relu par un humain », « Auto-approbation SUPER_ADMIN » ;
  - titre, cible, « Créée le … par … » ;
  - champs : Source légale, Date d'effet du texte, Mois demandé, Soumise / Examinée / Appliquée ;
  - comparaison valeur actuelle / valeur proposée ;
  - origine IA (le cas échéant) : modèle, confiance, « Valeur présente dans l'extrait cité » / « Valeur corrigée par un humain », lien « Voir l'analyse » ;
  - justificatifs : « Voir le document », pastille « vN au registre » si une version plus récente existe ;
  - Contributeurs (création, modification, soumission, extraction IA ; « — vous en faites partie ») ;
  - « Note de l'approbateur », « Motif de clôture », lien « Décision D2 de date d'application ».

#### Fonction : Soumettre une proposition

- **Bouton** : « Soumettre », pour une proposition en brouillon, disponible aux contributeurs ou au SUPER_ADMIN.
- **Résultat** : la proposition passe au statut Soumise et entre dans la vue « À approuver ».

#### Fonction : Approuver

- **Prérequis** : droit « Approbation des règles légales », délégué par le SUPER_ADMIN.
- **Messages de blocage** :
  - « Approbation réservée aux approbateurs des règles légales (délégation par le SUPER_ADMIN). »
  - « Séparation des tâches : vous avez contribué à cette proposition, un autre approbateur doit l'approuver. »
- **Étapes** :
  1. Cliquer sur « Approuver ». Le dialogue affiche un texte d'information qui diffère pour une vérification et pour une nouvelle valeur.
  2. Un SUPER_ADMIN contributeur doit cocher la case d'auto-approbation.
  3. Saisir une « Note (facultative) », puis valider.
- **Résultat** :
  - « Valeur approuvée comme référence » (vérification) ;
  - « Proposition approuvée, sans effet tant que le SUPER_ADMIN n'a pas décidé sa date d'application. » avec le lien « Ouvrir la décision D2 » ;
  - ou « … sans effet : le mois demandé est déjà clos. Choisissez une date d'application. »
- **Erreur** : « La valeur a changé depuis la demande de vérification : la proposition est caduque… »

#### Fonction : Rejeter / Retirer

- **Rejeter** (approbateurs) : motif de 10 caractères minimum.
- **Retirer** : motif de 5 caractères minimum.
- **Notes affichées** : « Le brouillon IRG redevient modifiable. », « La décision D2 en attente sera close. »

#### Fonction : Choisir la date d'application (D2)

- **Bouton** : « Choisir la date d'application » / « Changer la date d'application ».
- **Disponibilité** : proposition approuvée (hors vérification), pour un approbateur ou un décideur D2.
- **Dialogue** : « Date d'application (D2) ». Il affiche la date d'effet du texte, le mois demandé et le premier mois non validé. Lorsque les chaînes de paie « reprise » et « opérationnelle » sont séparées, il les affiche distinctement (règle bornée au 31/08/2026).
- **Modes** :
  - « À partir d'un mois » : champ « Paie concernée à partir de » ;
  - « À partir d'une date », avec deux choix :
    - « Paie de mois suivant (recommandé : pas de rétroactivité implicite) » ;
    - « Paie de mois de la date, en entier ».
- **Erreurs** :
  - « Le mois d'application commence le 1er. »
  - « Mois déjà traité (paie validée ou clôturée) : choisissez … »
  - « La date choisie se rattache à son mois ou au mois suivant. »
- **Bouton** : « Demander la décision ».
- **Résultat** : « Décision D2 en attente : application à partir de la paie de X. Le SUPER_ADMIN la confirme dans l'écran Décisions. » Les bulletins validés ou clôturés ne changent jamais.
- **Liens** : Centre de décisions (D2, puis D3 pour recalculer les brouillons).

### 4.4 Page « Documents juridiques » (`/rh/legal/documents`)

**Disposition** :
- Paramètre d'URL `?annee=AAAA|tout` (défaut : année en cours).
- En-tête « Registre des documents juridiques » ; bouton « Importer un document » (droit de création).
- Barre d'outils : « Période d'application » (sélecteur d'année, dont « Toutes les années ») ; recherche « Rechercher (intitulé, référence, JO) ».
- Panneau « Couverture du registre en AAAA » : 12 mois, chacun avec « N doc. » ou « aucun ».
- **Carte d'un document** :
  - pastilles : type, statut (« En vigueur au registre » / « Version corrigée depuis » / « Retiré »), « Version N », langue ;
  - intitulé, « référence · JO n° … du … », « Importé le », nom et taille du fichier ;
  - champs : Période d'application, Publication, Provenance (+ lien), « Empreinte SHA-256 » ;
  - « Voie de saisie » :
    - **saisie manuelle** si l'application est entièrement avant 2026 ;
    - **IA possible** si elle commence en 2026 ou après ;
    - **D15** si elle chevauche 2025 et 2026 ;
  - notes, avis de retrait, « Cité par N proposition(s) », « Versions précédentes (n) », « Dernière correction » ;
  - boutons :
    - « Voir le document » (lien temporaire de 120 s) ;
    - « Extraction IA » (document en vigueur, voie non manuelle) ;
    - « Corriger les informations » ;
    - « Retirer ».

#### Fonction : Importer un document juridique

- **Prérequis** : droit de création « Documents juridiques » (par défaut SUPER_ADMIN, ADMIN_RH, ADMIN_FINANCE).
- **Bandeau** : « Importer un document n'a aucun effet sur les règles ni sur la paie… »
- **Champs** :
  - fichier PDF, JPEG, PNG ou WebP, **25 Mo maximum** ; le fichier **ne peut plus être remplacé** ensuite ;
  - « Type de texte » : Loi de finances, LF complémentaire, Loi, Ordonnance, Décret présidentiel, Décret exécutif, Arrêté, Décision, Circulaire, Instruction, Note, Convention collective, Autre texte ;
  - Langue : Français, Arabe, Français et arabe, Autre ;
  - Intitulé (3 caractères minimum), Référence (3 caractères minimum) ;
  - « N° du JO », « Date du JO », « Date de publication » ;
  - « Applicable à partir du » (obligatoire), « Applicable jusqu'au » ;
  - Provenance (3 caractères minimum), Lien (https), Notes.
- **Erreurs** :
  - « Choisissez le fichier du texte. »
  - « Format refusé… »
  - « Fichier trop volumineux (25 Mo maximum). »
  - « Fin de la période d'application antérieure à son début. »
- **Résultat** : document enregistré en version 1, avec l'empreinte SHA-256 calculée par le serveur.

#### Fonction : Corriger les informations

- Crée une **nouvelle version** des métadonnées. Motif de 10 caractères minimum.
- Message : « version N+1 enregistrée, la précédente reste consultable. »

#### Fonction : Retirer un document

- **Prérequis** : droit de modification (par défaut SUPER_ADMIN uniquement).
- Motif de 10 à 500 caractères.
- **Avertissement** : le document ne pourra plus être cité ; les propositions qui ne citent que lui ne pourront plus être soumises ni approuvées.

### 4.5 Page « Extraction IA » (`/rh/legal/extraction-ia`)

**Disposition** :
- Paramètre d'URL `?document=<id>`.
- En-tête « Extraction IA des documents juridiques » et bandeau d'avertissement IA.
- Si le serveur n'est pas configuré : « L'analyse IA n'est pas configurée sur le serveur (clé Gemini absente). »
- Sélecteur « Document du registre (version en vigueur) » : « ● analyse possible · ○ saisie manuelle / D15 / type exclu ».
- **Panneau du document** : voie IA du document :
  - type exclu : « Convention, note interne ou autre texte : jamais envoyé à l'IA… » ;
  - IA possible ;
  - D15 en attente, non décidée, décidée « manuelle » ou décidée « IA ».

#### Fonction : Demander la décision D15

- **Boutons** : « Demander la décision D15 » / « Demander une nouvelle décision D15 ».
- **Message** : « Décision D15 demandée : aucune analyse n'est possible avant la décision. » Quand une demande est en attente : « Décision D15 en attente — Ouvrir la demande ».
- **Options de D15** :
  - « Saisie manuelle » : aucune analyse IA possible ;
  - « Extraction IA possible ».
  « Les deux voies aboutissent au même circuit d'approbation. »

#### Fonction : Lancer une analyse

- **Prérequis** :
  - droit de création « Extraction IA » (par défaut SUPER_ADMIN) ;
  - document éligible ;
  - clé IA configurée.
- **Étapes** :
  1. Choisir le document. Le panneau « Lancer une analyse » indique que le fichier est envoyé au modèle Gemini (nom du modèle affiché) et qu'une nouvelle analyse remplace la précédente.
  2. Cocher « Je confirme que ce document est un texte officiel publié et ne contient aucune donnée personnelle… » (sinon « Confirmez l'absence de données personnelles avant l'analyse. »).
  3. Cliquer sur « Analyser le document ».
- **Erreurs** :
  - « Document trop volumineux pour l'analyse (14 Mo maximum) : saisissez ses valeurs à la main. »
  - « Lecture du document impossible. »
  - « L'analyse IA n'est pas configurée : ajoutez la clé GEMINI_API_KEY sur le serveur. »
- **Résultat** :
  - « Analyse terminée : N suggestion(s). Rien n'est appliqué… »
  - Bloc « Analyse du <date> » : pastille « Analyse en cours de relecture » / « Analyse close », modèle utilisé, et Référence / Intitulé / Publication / Date d'effet lues.
  - « Points d'attention signalés par la lecture » : OCR, Ambiguïté, Information manquante, Autre.
  - Liste « Analyses précédentes ».

#### Fonction : Relire une suggestion et créer la proposition

- **Carte de suggestion** :
  - type : « Variable légale », « Taux d'un régime CNAS », « Wilayas d'une zone IRG », « Barème IRG (lecture seule) » ;
  - confiance : élevée / moyenne / faible ;
  - « Valeur trouvée dans l'extrait » ou « Valeur absente de l'extrait : transformation bloquée ».
- **Boutons** : « Écarter », « Relire et créer la proposition ».
- **Dialogue** : « Relire la suggestion et créer la proposition ».
  - Champs :
    - cible ;
    - valeur, taux ou wilayas ;
    - « Extrait du texte », avec contrôle en direct « ✓ Valeur trouvée… » / « ✗ … création bloquée » ;
    - Article, Page ;
    - Source légale ;
    - « Date d'effet prévue par le texte » ;
    - « Mois d'application souhaité » (la date définitive est fixée par D2) ;
    - « Intitulé de la proposition » (pré-rempli) ;
    - case « Soumettre directement pour approbation ».
  - Validations :
    - « Choisissez la cible de la proposition. »
    - « Valeur numérique requise. »
    - « Indiquez au moins un taux. »
    - « Sélectionnez au moins une wilaya. »
    - « Article requis. », « Page requise. »
    - « Extrait requis (10 caractères minimum). »
    - « Intitulé requis (3 caractères minimum). »
    - « Les tranches d'un barème IRG se saisissent à la main dans un brouillon de barème. »
- **Résultat** :
  - « Proposition créée (origine IA) et envoyée pour approbation… » (ou création en brouillon) ;
  - la proposition porte la pastille « Brouillon IA, relu par un humain ».
- **Prérequis** : droit de mise à jour des propositions (par défaut SUPER_ADMIN, ADMIN_RH, ADMIN_FINANCE).

#### Fonction : Écarter une suggestion

- Motif de 5 à 500 caractères.
- Message : « Suggestion écartée : le motif est conservé dans l'historique. »

### 4.6 Page « Veille juridique » (`/rh/legal/veille`)

**Disposition** :
- Accès : droit de lecture « Veille juridique » (par défaut **SUPER_ADMIN** uniquement). Sinon, redirection « forbidden ».
- En-tête « Veille juridique » : « Pages officielles surveillées, textes nouvellement détectés et historique des vérifications. Un texte détecté se verse au registre des documents juridiques par un humain ; rien ne s'applique à la paie sans approbation puis décision. »
- Bouton « Vérifier maintenant » (droit de création).
- Bandeau d'information : « La veille aide à repérer les nouveaux textes ; elle ne garantit pas que tout texte publié est détecté et ne remplace pas la vérification juridique par une personne compétente. Un texte détecté n'a aucun effet : il faut l'importer au registre, l'analyser, puis faire approuver la valeur et décider de sa date d'application. »
- Avertissement possible : « Vérification planifiée inactive : la variable serveur CRON_SECRET n'est pas configurée sur cet environnement. Seul le bouton « Vérifier maintenant » fonctionne. »
- 4 compteurs :
  - « Dernière vérification » ;
  - « Textes pertinents à examiner » ;
  - « Sources actives » ;
  - « Sources en erreur ».
- Ligne de résumé : « Dernière vérification planifiée / manuelle (terminée / interrompue / en cours) : N source(s) vérifiée(s), N en erreur, N lien(s) nouveau(x). » ou « Aucune vérification enregistrée pour l'instant. »
- **Onglets** (paramètre `?onglet=`, défaut `textes`) :
  - « Textes détectés (n) » ;
  - « Sources surveillées » ;
  - « Domaines autorisés » ;
  - « Mots-clés » ;
  - « Historique ».

#### Fonction : Lancer une vérification manuelle

- **Bouton** : « Vérifier maintenant » (devient « Vérification en cours… »).
- **Résultat** : « Vérification terminée : X source(s) lue(s) sur Y, Z en erreur, N lien(s) nouveau(x) dont P pertinent(s). » + éventuellement « N source(s) reportée(s) faute de temps. »
- **Règles** :
  - fréquence de relecture d'une source : quotidienne (environ 20 h), hebdomadaire (164 h), mensuelle (27 jours). Une source en erreur est relue quotidiennement ;
  - la vérification planifiée (CRON) n'est active que si le serveur est configuré.

#### Fonction : Examiner les textes détectés

- **Filtres** :
  - « Pertinents à examiner » (défaut) ;
  - « Tous les nouveaux à examiner » ;
  - « Liens de référence (première lecture) » ;
  - « Importés au registre » ;
  - « Écartés » ;
  - « Tous ».
- **Recherche** : « Rechercher (titre, adresse, source) ».
- **Carte d'un texte** :
  - titre (ou « Lien sans titre »), adresse cliquable, « source · détecté le … » ;
  - pastilles : statut (« À examiner » / « Importé au registre » / « Écarté »), « Référence (première lecture) », mots-clés trouvés ou « Aucun mot-clé » ;
  - mentions « Écarté par … le … : motif » / « Importé par … le … · voir le registre ».
- **Règle de première lecture** : « La première lecture d'une page sert de référence : ses liens sont conservés (marqués « Référence ») sans notification. Seuls les liens apparus ensuite sont signalés comme nouveaux. »
- Vue vide : « Aucun texte détecté dans cette vue. »

#### Fonction : Importer un texte détecté au registre

- **Prérequis** : droits de création « Veille juridique » **et** « Documents juridiques ».
- **Étapes** :
  1. Cliquer sur « Importer ». Le dialogue s'appelle « Importer le texte détecté au registre » (sous-titre = adresse) : « Le serveur télécharge le fichier depuis ce lien (PDF ou image, 25 Mo au plus) et l'enregistre au registre avec les informations ci-dessous, à vérifier sur le texte lui-même… Aucune analyse IA n'est lancée automatiquement. »
  2. Compléter les métadonnées (mêmes champs que l'import manuel, § 4.4) : l'intitulé, la langue (arabe si le titre contient de l'arabe), la provenance et le lien sont pré-remplis.
  3. Cliquer sur « Télécharger et importer » (devient « Téléchargement… »).
- **Erreurs** :
  - téléchargement : « … Vous pouvez aussi télécharger le texte vous-même puis l'importer depuis le registre. » ;
  - « Ce lien ne mène pas à un fichier PDF ou image (page web ?) : ouvrez-le, téléchargez le texte, puis importez-le depuis le registre des documents juridiques. » ;
  - « Enregistrement du fichier impossible : … ».
- **Résultat** : « « Intitulé » importé au registre des documents juridiques. » suivi du rappel « aucun effet sur les règles ni sur la paie ».

#### Fonction : Écarter un texte détecté

- **Prérequis** : droit de création « Veille juridique ».
- **Dialogue** : « Écarter le texte détecté ». Champ « Motif » : 5 à 300 caractères, par exemple « sans rapport avec la paie », « déjà au registre ».
- **Résultat** : « Texte écarté. Il reste consultable dans la vue « Écartés ». »

#### Fonction : Gérer les sources surveillées

- **Prérequis** : droit de modification « Veille juridique ».
- **Disposition** :
  - texte « Pages lues à chaque vérification (liste de textes, rubrique « nouveautés »…), sur un domaine autorisé uniquement. » ;
  - bouton « Ajouter une source », désactivé tant qu'aucun domaine n'est autorisé ;
  - colonnes :
    - Source (libellé et adresse) ;
    - Fréquence ;
    - « Dernière vérification » ;
    - « Prochaine » (« après le … », « à la prochaine », « — ») ;
    - État : « Désactivée », « Lue » / « Inchangée » / « Erreur » / « Jamais vérifiée », « N échecs de suite », « Référence à établir », et le message d'erreur ;
    - « Modifier ».
  - liste vide : « Aucune source surveillée. Ajoutez l'adresse d'une page officielle qui liste les nouveaux textes (après avoir vérifié ses conditions d'utilisation). »
- **Dialogue** « Ajouter une source surveillée » / « Modifier la source » :
  - Libellé* (120 caractères maximum) ;
  - « Adresse de la page »* : https sur un domaine autorisé. « Changer l'adresse fait établir une nouvelle référence à la prochaine lecture. » ;
  - Fréquence* : Quotidienne / Hebdomadaire (défaut) / Mensuelle ;
  - case « Source active » ;
  - bouton « Enregistrer ».
- **Résultat** : « Source « X » ajoutée : sa première lecture servira de référence. » / « Source « X » modifiée. »

#### Fonction : Gérer les domaines autorisés

- **Disposition** :
  - texte : « Seuls ces domaines (et leurs sous-domaines) peuvent être lus par la veille, en https. Les adresses internes sont toujours refusées, même derrière un domaine autorisé. » ;
  - colonnes : Domaine, Organisme, État (« Autorisé » / « Désactivé »), « Modifier » ;
  - bouton « Ajouter un domaine » ;
  - liste vide : « Aucun domaine autorisé. ».
- **Dialogue** « Autoriser un domaine » / « Modifier le domaine autorisé » :
  - avertissement : « N'autorisez que des sites officiels ou expressément jugés fiables. Désactiver un domaine arrête la lecture de ses sources et l'import de ses liens. » ;
  - Domaine* : « Nom de domaine seul, sans https:// ni chemin (ex. joradp.dz). Ne se modifie plus ensuite. » ;
  - Organisme* ;
  - case « Domaine autorisé ».
- **Résultat** : « Domaine x autorisé. » / « Domaine x modifié. »

#### Fonction : Gérer les mots-clés

- **Règle** : « Un lien est signalé comme pertinent si son titre ou son adresse contient un mot-clé actif (sans tenir compte des majuscules ni des accents). Les mots-clés s'appliquent aux liens détectés après leur ajout ; aucun texte n'est envoyé à l'IA pendant la veille. »
- **Étapes** :
  - saisir un mot dans « Nouveau mot-clé (ex. allocation familiale, المنح) » (2 à 80 caractères), puis cliquer sur « Ajouter » ;
  - chaque mot-clé a un lien « Désactiver » / « Réactiver ».
- **Résultat** : « Mot-clé « X » ajouté. » / « … désactivé. » / « … réactivé. »

#### Fonction : Consulter l'historique des vérifications

- **Contenu** : les 15 dernières vérifications. Pour chacune :
  - date, pastille « Planifiée » / « Manuelle », statut (« Terminée » / « Interrompue » / « En cours »), « par <nom> » ;
  - résumé « N/M source(s) vérifiée(s), N en erreur, N lien(s) nouveau(x), N pertinent(s). » ;
  - détail par source : statut et erreur, ou « N lien(s) retenu(s), N nouveau(x), N pertinent(s) ».
- Liste vide : « Aucune vérification enregistrée. »

---

## 5. Droits par défaut (migrations initiales, modifiables dans la matrice)

| Écran (matrice) | Route | Lecture | Création / modification |
|---|---|---|---|
| Documents RH (`hr_documents`) | `/rh/documents` | SUPER_ADMIN, ADMIN_RH, GERANT, ADMIN_FINANCE, CHEF_CHANTIER, READ_ONLY | Création et modification : SUPER_ADMIN, ADMIN_RH, GERANT ; filtrage par chantier |
| Attestations & courriers (`hr_letters`) | `/rh/attestations` | droits recopiés de l'écran Paie (`hr_payroll`) | idem |
| Conformité fiscale & sociale, unité 05 (`hr_compliance`) | `/rh/legal` | + GERANT | SUPER_ADMIN, ADMIN_RH, ADMIN_FINANCE |
| Propositions de règles légales (`rule_proposals`) | `/rh/legal/propositions` | + GERANT | SUPER_ADMIN, ADMIN_RH, ADMIN_FINANCE |
| Approbation des règles légales (`rule_approval`) | `…?vue=approbation` | + GERANT | SUPER_ADMIN (délégable) |
| Décision D2 | `/decisions?type=D2` | SUPER_ADMIN | SUPER_ADMIN |
| Documents juridiques (`legal_documents`) | `/rh/legal/documents` | + GERANT | Import et correction : SUPER_ADMIN, ADMIN_RH, ADMIN_FINANCE ; retrait : SUPER_ADMIN |
| Extraction IA (`legal_ai_extraction`) et D15 | `/rh/legal/extraction-ia` | SUPER_ADMIN | SUPER_ADMIN |
| Veille juridique (`legal_watch`) | `/rh/legal/veille` | SUPER_ADMIN | SUPER_ADMIN |

Le SUPER_ADMIN a toujours tous les droits dans les fonctions qui le prévoient explicitement (contrôle `isSuperAdmin`).

---

## 6. Points d'incertitude à lever avant publication

1. **Compteur de numérotation commun** à tous les courriers RH (OM, congés, attestations…) : confirmé par lecture de la fonction `hr_next_doc_number` (plus grand numéro de l'année + 1, tous types confondus), mais à confirmer par un test en recette. Le manuel affirme « jamais réutilisée » ; cela reste vrai tant qu'aucun document n'est supprimé (aucun écran ne le permet).
2. **Règles d'accès** à `hr_correspondences` / `hr_employee_files` : lues dans la migration du 19/09/2026 ; d'éventuelles modifications ultérieures n'ont pas été vérifiées.
3. **Libellés des variables légales** (onglet Autres, rubriques) : stockés en base, ils peuvent avoir été renommés par des migrations ou des saisies ultérieures.
4. **Onglet CNAS** : seul le panneau « Régimes CNAS » est affiché ; aucun ajout de rubrique CNAS dans le code actuel.
5. **Raccourci « Congé »** du tableau de bord : cible supposée `/rh/conges`.
6. **Partage de l'agencement** « Pour tout le monde » : droit exact non vérifié.
7. **Refus serveur lors de la création d'un titre de congé** (chevauchements, statut de l'employé…) : non relus.
8. **Formulaire contrat et dérogations par contrat** : seulement survolés ; à documenter dans les notes Personnel / Paie.
9. **Droits par défaut** : ceux des migrations initiales ; vérifier la matrice réelle en production.

## 7. Découpage suggéré pour les tutoriels vidéo

1. Se repérer dans le module RH (sections, onglets, Réorganiser).
2. Lire le tableau de bord RH et traiter les alertes.
3. Rapport de qualité des données : wilayas et décisions D13.
4. Établir un ordre de mission (du registre jusqu'au pointage MS).
5. Établir un titre de congé.
6. Attestations, certificats et mises en demeure.
7. Proposer un changement de taux (Cotisations & impôts) avec justificatifs.
8. Approuver une proposition et demander la décision D2.
9. Importer un texte au registre des documents juridiques.
10. Extraction IA : D15, analyse, relecture des suggestions.
11. Veille juridique : domaines, sources, mots-clés, import.
