# 01 — Personnel (notes de rédaction pour le Manuel d'utilisation RH)

> **Statut** : notes brutes, extraites du code source (lecture seule, aucune modification de l'application).
> **Périmètre** : `/rh/employes`, `/rh/postes`, `/rh/contrats`, `/rh/interim`, `/rh/sorties`.
> **Application** : NEDJM FROID ERP (Next.js 16 + Supabase).
>
> **Conventions de ce document**
> - `*` = champ obligatoire.
> - « … » = libellé exact affiché à l'écran.
> - Les libellés arabes ne sont cités **que lorsqu'ils sont réellement affichés**. Dans le module RH, la fonction d'interface `bi(fr, ar)` n'affiche que le texte français : beaucoup de libellés bilingues dans le code n'apparaissent donc qu'en français à l'écran. L'arabe apparaît dans les libellés des champs de la fiche employé, les options de listes (référentiels), certains en-têtes et certains messages d'erreur serveur.
> - **[À VÉRIFIER]** = point ambigu, comportement déduit du code mais non confirmé, ou paramètre modifiable en base (donc pouvant différer en production).

---

## 0. Accès, navigation et droits

### 0.1 Où se trouvent les écrans

Menu principal **RH**, section **Personnel** (onglets dans l'ordre du registre de navigation) :

| Onglet affiché | Route | Remarque |
|---|---|---|
| « Employés » | `/rh/employes` | |
| « Postes & grille » | `/rh/postes` | |
| « Intérim » | `/rh/interim` | |
| « Sorties » | `/rh/sorties` | |

- **`/rh/contrats` n'est pas un écran propre** : la route redirige vers `/rh/documents?onglet=contrats`. Cet écran se trouve dans la section **Documents**, onglet « Registre », sur la carte « Contrat de travail ».
- Les sections et onglets peuvent être réorganisés par l'utilisateur (mode « Réorganiser »). Une section vide affiche l'info-bulle « Vide : cliquez pour y ranger des onglets (Réorganiser) · فارغ، اضغط لنقل تبويبات إليه ». **L'ordre décrit ici est l'ordre par défaut.**
- La recherche globale (barre du haut) propose « Employés » (العمال), « Postes & grille » (المناصب), « Intérim » (العمل المؤقت) et « Sorties » (الخروج). Un employé trouvé par la recherche globale ouvre `/rh/employes?q=<matricule ou nom>`, avec la recherche pré-remplie.
- Le tableau de bord RH contient un raccourci « Nouvel employé » (`/rh/employes?nouveau=1`, qui ouvre directement une fiche vierge). Ses alertes « Fin de contrat », « Contrats à finaliser » et « Employés sans contrat » mènent au registre des contrats.

### 0.2 Droits (rôles) relevés dans le code

| Action | Condition dans le code |
|---|---|
| Voir et modifier les employés | Permission RBAC `employees` (`read` / `update`) via les règles d'accès de la base (RLS). Message en cas de refus : « Accès refusé à l'écran Employés (RBAC). » |
| Voir et modifier les contrats | Permission RBAC `contracts` par chantier (RLS), plus visibilité du chantier. |
| Postes, grille salariale, rubriques de salaire d'un contrat, modèle de contrat, gestion de l'intérim, sorties | Rôles **SUPER_ADMIN, ADMIN_RH, GERANT** (`HR_SALARY_VALUE_ROLES`). Message : « Saisie des montants réservée à SUPER_ADMIN, ADMIN_RH et GERANT. » |
| Ouvrir l'écran Intérim (lecture) | SUPER_ADMIN, ADMIN_RH, GERANT ou ADMIN_FINANCE. |
| IRG / CACOBATPH sur le contrat | Droit d'écriture « Cotisations & impôts » (matrice `hr_compliance`). Le message de refus cite SUPER_ADMIN, ADMIN_RH, ADMIN_FINANCE. |
| Ajouter ou supprimer un régime de travail depuis le contrat | SUPER_ADMIN uniquement. |
| Valider ou annuler une sortie | Fonction serveur réservée aux RH ; message : « Réservé aux RH (SUPER_ADMIN, ADMIN_RH, GERANT). » |

> **[À VÉRIFIER]** La correspondance exacte entre rôles et permissions `employees` / `contracts` est paramétrée en base (matrice RBAC) ; elle n'est pas dans le code de l'écran.

---

## 1. Mise en page des écrans

### 1.1 `/rh/employes` — Employés

- **Titre de la barre** : « Employés RH ». **En-tête de page** : « Personnel », avec au-dessus « N employé(s) inscrit(s) ».
- **Barre d'outils** (réorganisable) : « Colonnes », « Nouvel employé ».
- **Seconde ligne** : « Importer l'ancienne base », interrupteur « Actifs seulement · النشطون فقط (n) ».
- **Trois vues** : « Liste », « Cartes », « Tableau complet (toutes les colonnes) ».
- **Vue Liste** (12 lignes par page) :
  - Recherche « Nom, matricule ou poste… » (porte aussi sur le N° NSS).
  - Filtres en pastilles : « Tous les chantiers » + un chantier par pastille ; « Tous statuts » + un statut par pastille.
  - Colonnes : **Employé** (photo/initiales, nom, poste), **Matricule**, **Chantier**, **Contrat**, **Date d'entrée**, **Statut**.
  - Icônes au survol d'une ligne : « Modifier la fiche », « Dossier administratif », « Désactiver » / « Activer ».
  - Clic sur la ligne : aperçu imprimable de la fiche.
  - Pagination « x–y sur N ».
  - Résultat vide : « Aucun employé trouvé » + bouton « Réinitialiser les filtres ».
- **Vue Cartes** : mêmes données sous forme de cartes.
- **Vue Tableau complet** :
  - Une colonne par champ actif de la fiche ; l'en-tête affiche le libellé français et le libellé arabe.
  - Recherche « Rechercher dans toutes les colonnes ».
  - Boutons par ligne : « Ouvrir », « Modifier », « Dossier », « Désactiver » / « Activer ».
- **Libellés de statut** : ACTIVE = Actif, INVITED = Invité, SUSPENDED = Suspendu, INACTIVE = Inactif, DISABLED = Désactivé.
- **Tri par défaut** : année du matricule (format NN/AA) décroissante, puis numéro décroissant ; les matricules d'un autre format sont placés à la fin.
- **Origine des colonnes Chantier / Poste / Contrat** : le contrat **principal ouvert** de l'employé (Brouillon, Actif ou Suspendu). À défaut, l'affectation et le poste saisis dans la fiche.

### 1.2 `/rh/postes` — Postes & grille salariale

- **Titre** : « Postes & grille salariale ».
- **Bandeau d'information** : « Référentiel des postes et grille salariale par poste et grade (versions datées). Le contrat reprend l'intitulé du poste et propose le salaire de la grille ; la paie signale tout salaire inférieur à la grille. Les rubriques peuvent aussi être affectées à un poste (priorité : employé > contrat > poste > chantier). »
- **Recherche** : « Rechercher un poste… ».
- **Barre d'outils** (rôles SUPER_ADMIN / ADMIN_RH / GERANT seulement) : « Importer depuis les contrats », « Nouveau poste ».
- **Colonnes** :
  - **Code**.
  - **Intitulé** (arabe en dessous, pastille « Inactif » si le poste est désactivé).
  - **Catégorie**.
  - **Grille en vigueur** (« grade : salaire de base » pour chaque grade en vigueur aujourd'hui).
  - **Contrats** (nombre de contrats rattachés).
- **Actions par ligne** : « Grille » / « Fermer la grille », « Modifier », « Supprimer » (uniquement si le poste n'a aucun contrat).
- **Sous-tableau Grille** (déplié sous la ligne) :
  - Colonnes : Grade, Base mensuelle, Net de référence, En vigueur au, Note, Supprimer.
  - Un formulaire d'ajout est placé sous le sous-tableau.
- **Liste vide** : « Aucun poste. Utilisez « Importer depuis les contrats » pour démarrer. »

### 1.3 `/rh/contrats` → Documents, carte « Contrat de travail »

- **Route effective** : `/rh/documents?onglet=contrats`.
- **En-tête de la page Documents** : « Documents », avec la mention « Chaque document reçoit une référence unique, jamais réutilisée. »
- **Cartes de sélection** (une par type de document) : « Fiche de renseignements », « Contrat de travail » (N contrats), « Ordre de mission », « Titre de congé », « Bulletin de paie ». La carte « Contrat de travail » affiche le registre des contrats (message de chargement : « Chargement du registre… »).
- **Bloc registre** :
  - Titre « Contrats de travail ».
  - Description : « Le chantier porte l'activité et le CACOBATPH. Les cinq classes de rubriques (dont la retenue de garantie) se règlent dans la fiche contrat. Un contrat brouillon entre aussi dans la paie. »
- **Barre d'outils** : « Exceptions » (lien vers `/rh/paie/exceptions`), « Importer des contrats », « Contrat PDF », « Nouveau contrat ».
- **Recherche** : « Employé, matricule, affectation… ».
- **Colonnes** :
  - **Employé** (matricule + nom).
  - **Affectation**.
  - **Type** (code du type de contrat, ex. CDD).
  - **Net chantier**.
  - **Statut** (Brouillon / Actif / Suspendu / Clôturé).
- **Actions par ligne** : « Afficher », « Modifier », « Imprimer », et « PDF archivé » quand une archive existe.
- **Fonctions du tableau** (composant standard) : 25 lignes par page, tri par colonne, menu « Colonnes » (« Colonnes affichées ») pour masquer ou afficher des colonnes.
- **Au chargement**, l'application applique automatiquement les changements d'affectation datés arrivés à échéance (fonction `hr_contract_assignments_refresh_due`).

### 1.4 `/rh/interim` — Intérim

- **En-tête** : « Intérim — agences et relevés de prestations ».
- **Texte d'introduction** : il explique que les contrats de type INTERIM apparaissent au pointage mais sont exclus de la paie. La facturation est calculée ainsi : présences validées (coefficient de la légende) × taux journalier, + coefficient de l'agence + TVA ; elle est ensuite rapprochée de la facture de l'agence.
- **Section « Agences d'intérim »** :
  - Bouton « Nouvelle agence ».
  - Recherche « Code, raison sociale, contact… ».
  - Colonnes :
    - **Code**.
    - **Raison sociale** (NIF, RC, pastille « Inactive »).
    - **Contact** (nom, téléphone · e-mail).
    - **Taux jour (DA)**.
    - **Coef. / TVA**.
    - **Intérimaires** (nombre de contrats INTERIM en Brouillon ou Actif).
    - Action « Modifier ».
  - Liste vide : « Aucune agence », « Créez-en une, puis choisissez-la dans le contrat (type INTERIM). ».
- **Section « Relevés mensuels »** :
  - Barre de sélection : « Année », « Mois » (01–12), « Agence » (agences actives), « Chantier » (« Tous les chantiers » ou un chantier), bouton « Calculer le relevé ».
  - Zone d'aperçu du relevé calculé (lignes + totaux + bouton « Émettre le relevé »).
  - Pastille « N relevé(s) actif(s) · X DA TTC ».
  - Tableau des relevés : **Relevé** (numéro + date), **Agence**, **Chantier** (ou « Tous »), **Jours**, **HT / TTC (DA)**, **Statut / facture agence**, actions.
  - Recherche « N° de relevé, agence, chantier… ».
  - Liste vide : « Aucun relevé pour MM/AAAA ».

### 1.5 `/rh/sorties` — Sorties & solde de tout compte

- **Titre** : « Sorties & solde de tout compte ».
- **Bandeau d'information** : le solde de tout compte (indemnité compensatrice de congé, primes, retenues) est payé sur le bulletin du mois de sortie, le reste des avances est retenu en totalité, et le certificat de travail et le reçu de solde de tout compte s'impriment depuis cet écran.
- **Bouton** : « Nouvelle sortie ».
- **Recherche** : « Rechercher un employé… » (porte sur l'employé, les observations et le motif).
- **Colonnes** :
  - **Employé** (« matricule · nom prénom », observations en dessous).
  - **Date de sortie**.
  - **Motif** (français · arabe).
  - **Reliquat congé**.
  - **Solde (DA)**.
  - **Statut** (Brouillon / Validée / Annulée, avec le nom du validateur en dessous).
- **Actions par ligne** :
  - Brouillon : « Modifier », « Valider », « Supprimer » (rôles RH salaires seulement).
  - Validée : « Certificat de travail », « Solde de tout compte », et « Annuler » (rôles RH salaires seulement).
- **Liste vide** : « Aucune sortie ». La liste affiche au maximum les 500 sorties les plus récentes (tri par date de sortie décroissante).

---

## 2. Employés — `/rh/employes`

### F-EMP-01 — Consulter et rechercher le personnel

- **Titre** : « Personnel » (vues « Liste », « Cartes », « Tableau complet (toutes les colonnes) »).
- **Où la trouver** : RH → Personnel → « Employés » (`/rh/employes`).
- **À quoi ça sert** : retrouver un employé, voir son chantier, son poste, son contrat et son statut, puis ouvrir sa fiche ou son dossier.
- **Prérequis** : permission de lecture `employees`.
- **Étapes** :
  1. Choisir la vue (Liste par défaut).
  2. Saisir un texte dans « Nom, matricule ou poste… » ; la recherche porte sur le nom, le matricule, le poste et le N° NSS.
  3. Filtrer par chantier (« Tous les chantiers » ou une pastille) et par statut (« Tous statuts » ou une pastille).
  4. Interrupteur « Actifs seulement · النشطون فقط (n) » : n'affiche que les employés au statut Actif.
  5. Vue Tableau complet : la recherche « Rechercher dans toutes les colonnes » porte sur tous les champs.
  6. Cliquer une ligne : aperçu A4 de la fiche (voir F-EMP-04).
- **Résultat** : liste filtrée et paginée (12 par page en vue Liste, pagination « x–y sur N »).
- **Règles / points d'attention** :
  - Si l'employé a un contrat principal ouvert, Chantier, Poste et Contrat viennent de ce contrat. Sinon, ils viennent de la fiche (Affectation, Poste occupé).
  - Aucun résultat : « Aucun employé trouvé » + « Réinitialiser les filtres ».
  - L'URL `?q=…` pré-remplit la recherche (lien depuis la recherche globale).
- **Liens** : F-EMP-02 (fiche), F-EMP-05 (dossier), F-CTR-02 (contrats).

### F-EMP-02 — Créer ou modifier une fiche employé

- **Titre** : bouton « Nouvel employé » ; icône « Modifier la fiche » ou bouton « Modifier ». Fenêtre « Fiche employé ».
- **Où la trouver** :
  - RH → Personnel → Employés → « Nouvel employé », ou icône crayon sur une ligne (`/rh/employes`).
  - Lien direct `/rh/employes?nouveau=1`.
  - Autre accès : RH → Documents → Registre → carte « Fiche de renseignements » → bouton « Fiche employé » ou action « Modifier la fiche ».
- **À quoi ça sert** : saisir l'état civil, l'identité, l'adresse, la situation professionnelle, les coordonnées bancaires et les pièces justificatives d'un salarié. La fiche de renseignements PDF est générée et archivée à chaque enregistrement.
- **Prérequis** :
  - Permission `employees` / `update`. Le téléversement de la photo demande aussi `employees` / `update`.
  - Les référentiels (catalogues) doivent être alimentés : Poste, Situation familiale, Wilaya, etc.

**Structure de la fenêtre**

- **Titre** : « Fiche employé », avec une pastille portant le matricule, ou « Brouillon » si l'employé n'a pas encore de matricule.
- **Barre de recherche interne** : « Rechercher par matricule, N°SS ou NIN… » + bouton « Rechercher ».
  - La correspondance doit être **exacte** (matricule, N° NSS ou NIN).
  - Sans résultat : « Aucun employé pour cette recherche. »
- **Bloc de téléversement des documents** (voir F-EMP-03).
- **En-tête (« hero »)** : photo cliquable, nom en caractères latins et en arabe, pastille de statut, NSS et NIN, puis les champs de la section « En-tête ».
- **Autres sections** : cartes numérotées I, II, III…
- **Pied de fenêtre** : « Fermer », « Imprimer », « Nouveau », « Enregistrer » (affiche « Enregistrement… » pendant la sauvegarde).

**Photo**
- Cliquer sur l'avatar pour choisir un fichier JPG, PNG ou WEBP de 5 Mo maximum.
- Erreurs : « Photo trop volumineuse (5 Mo max). », « Formats acceptés: JPG, PNG, WEBP. ».

**Champs** (configuration résultant des migrations ; **modifiable en base**, donc [À VÉRIFIER] sur l'environnement réel) :

*En-tête*

| Libellé FR | Libellé AR affiché | Oblig. | Contrôle / valeurs |
|---|---|---|---|
| Matricule | الرقم | * | Lecture seule, attribué automatiquement au format NN/AA (numéro / année d'Alger). |
| Statut | الحالة | * | Liste : ACTIVE, INACTIVE, SUSPENDED, DISABLED. Défaut ACTIVE. [À VÉRIFIER : codes bruts ou libellés traduits dans la liste] |
| Nom | اللقب باللاتينية | * | Converti en majuscules. |
| Prénom | الاسم باللاتينية | * | Converti en majuscules. |
| Nom AR | اللقب | | Saisie de droite à gauche. |
| Prénom AR | الاسم | | Saisie de droite à gauche. |
| N° NSS | رقم الضمان | | Exactement 12 chiffres. |

*I. Informations personnelles (معلومات شخصية)*

| Libellé FR | Libellé AR | Contrôle / valeurs |
|---|---|---|
| Né(e) le | تاريخ الميلاد | Date. |
| à | مكان الميلاد | Texte (majuscules). |
| N° Acte naiss | رقم عقد الميلاد | Exactement 5 chiffres. |
| Situation | الوضعية العائلية | Référentiel « situation familiale » (codes M, D, V, …). |
| Nombre d'enfants | عدد الأبناء | Affiché **uniquement** si Situation = M, D ou V ; sinon masqué et vidé. |
| Sexe | الجنس | Référentiel « sexe ». |
| G.Sanguin | فصيلة الدم | Référentiel « groupe sanguin ». |
| Prénom du Père | الأب | Texte. |
| Nom/Prénom Mère | الأم | Texte. |
| Nationalité | الجنسية | Défaut « Algérienne » (majuscules). |
| Commune de naiss | بلدية الميلاد | Texte. |

*II. Pièce d'identité & adresse (وثيقة الهوية والعنوان)*

| Libellé FR | Libellé AR | Contrôle / valeurs |
|---|---|---|
| Type de la pièce | نوع الوثيقة | Référentiel « type de pièce ». |
| N° Pièce | رقم الوثيقة | Exactement 9 chiffres. |
| Délivré le | تاريخ الإصدار | Date, au plus tard aujourd'hui. |
| Expire le | تاريخ الانتهاء | Date, au plus tôt demain. |
| Par la Daïra de | صادرة عن | Texte. |
| NIN | رقم التعريف | Exactement 18 chiffres. |
| Commune (Résidence) | بلدية الإقامة | Texte. |
| Wilaya | الولاية | Référentiel « wilaya ». |
| Code postal | الرمز البريدي | Texte. |
| Adresse Résidentielle | العنوان | Texte. |

*III. Situation professionnelle (الوضعية المهنية)*

| Libellé FR | Libellé AR | Contrôle / valeurs |
|---|---|---|
| Poste Occupé | المنصب | Référentiel des postes, groupé par catégorie : Ingénieurs/Cadres, Techniciens, Ouvriers, Aides. |
| Affectation | التعيين | « Administration » + chaque chantier actif. |
| Date de recrutement | تاريخ التوظيف | Date. |
| Date de déclaration | تاريخ التصريح | Date. |
| CCP / RIP | رقم الحساب | Exactement 20 chiffres, commençant par 00799999. |
| Email | البريد | Texte. |
| Niveau | المستوى | CEP, BEM, CAP, BT, BAC, TS, LICENCE, MASTER. |
| Diplôme | الشهادة | Texte. |
| Expérience | سنوات الخبرة | Nombre. |
| Tél | الهاتف | Texte. |
| WhatsApp (+213) | واتساب | Texte. |
| Langues | اللغات | Texte. |

> Champs **masqués** par les migrations : mode de paiement, clé de compte, diplôme en arabe, wilaya de naissance, lieu de naissance en arabe, adresse en arabe, catégorie IRG (valeur par défaut STANDARD conservée), profil social. Les colonnes ajoutées par « Colonnes » apparaissent dans une section « Extra / إضافي ».
>
> Les champs numériques affichent l'indication « N chiffres » (par exemple « 12 chiffres »).

**Étapes**
1. Cliquer « Nouvel employé » : la fiche s'ouvre vierge avec le matricule proposé automatiquement, le statut ACTIVE et la nationalité « Algérienne ».
2. Renseigner au minimum les champs obligatoires (Matricule, Statut, Nom, Prénom par défaut ; d'autres peuvent être rendus obligatoires en base).
3. (Facultatif) Ajouter la photo et les documents (F-EMP-03).
4. Cliquer « Enregistrer ».

**Validations et messages d'erreur**
- Champs manquants :
  - Contrôle à l'écran : « Champs obligatoires manquants : … ».
  - Contrôle serveur : « Champs obligatoires manquants · حقول إجبارية ناقصة: … ».
- Formats :
  - « N° NSS : exactement 12 chiffres. »
  - « NIN : exactement 18 chiffres. »
  - « N° acte de naissance : exactement 5 chiffres. »
  - « N° pièce : exactement 9 chiffres. »
  - « N° compte : exactement 20 chiffres. » ; « N° compte : doit commencer par 00799999 ».
- Dates :
  - « Date de délivrance : une date future n'est pas autorisée. »
  - « Date d'expiration : la date doit être postérieure à aujourd'hui (aujourd'hui et le passé sont refusés). »
  - Variante : « Date d'expiration : aujourd'hui et les dates passées sont refusées. Choisissez une date future. »
- Documents obligatoires (**uniquement en modification**, pas au premier enregistrement) :
  - « Documents obligatoires manquants : …. Onglet Documents. »
  - Variante serveur : « … Téléversez-les dans l'onglet Documents puis réessayez. »
- Unicité et droits :
  - « Matricule déjà utilisé. »
  - « Création refusée (RBAC). »
  - « Employé introuvable ou accès refusé. »

**Résultat**
- La fiche est enregistrée (identité, état civil, contacts, banque, social, qualification enregistrés ensemble : tout ou rien).
- La fenêtre reste ouverte avec les valeurs rechargées.
- La fiche de renseignements PDF est générée et archivée (document « FICHE_RENSEIGNEMENTS »). Messages :
  - « Fiche enregistrée. PDF : {fichier} »
  - « Fiche enregistrée. PDF plus tard : {erreur} »
  - « Fiche enregistrée. Génération PDF reportée. »

**Autres boutons**
- « Imprimer » : impression de la fiche officielle, avec la mise en page définie dans les paramètres de la fiche.
- « Nouveau » : vide le formulaire pour saisir un autre employé.

**Règles / points d'attention**
- Les noms latins sont forcés en majuscules ; les champs arabes sont saisis de droite à gauche.
- L'Affectation et le Poste de la fiche ne servent qu'à défaut de contrat : **c'est le contrat qui fait foi** pour le chantier et le poste (F-CTR-02).
- Les libellés, l'ordre, le caractère obligatoire et l'affichage des champs sont pilotés par la table des champs (paramétrage RH ; seul SUPER_ADMIN peut rendre un champ obligatoire).

**Liens** : F-EMP-03, F-EMP-05, F-CTR-02, Documents → Fiches de renseignements.

### F-EMP-03 — Téléverser les pièces justificatives (avec lecture automatique)

- **Titre** : liste « Type de document » (« — Choisir un document — ») + bouton « Importer ».
- **Où la trouver** : fenêtre « Fiche employé », bloc des documents en haut.
- **À quoi ça sert** : archiver les pièces du dossier (CNI, acte de naissance, attestation CNAS, etc.). Pour certaines pièces, l'application lit le document et propose de remplir automatiquement les champs de la fiche.
- **Prérequis** :
  - La fiche doit déjà être **enregistrée** pour archiver le fichier.
  - Les types proposés sont ceux du référentiel « document_type » marqués « emplacement de téléversement » et non générés automatiquement.
- **Étapes** :
  1. Choisir le type. Les types obligatoires sont suivis de « * » ; un type déjà fourni disparaît de la liste.
  2. Cliquer « Importer » et choisir le fichier.
     - Types courants : PDF, JPG, PNG, WEBP, GIF, 15 Mo maximum.
     - Types à lecture automatique (CNI, Acte de naissance, Attestation CNAS) : **images uniquement** (JPG, PNG, WEBP).
  3. Types à lecture automatique : une progression s'affiche, puis un panneau « Vérification — {document} » liste les champs proposés. Chaque champ a une case à cocher et une valeur modifiable. Cliquer « Valider » pour appliquer, ou « Annuler ».
- **Résultat** : les pièces fournies apparaissent en pastilles vertes avec un lien « Voir ».
- **Messages** :
  - « Enregistrez d'abord la fiche, puis importez le document. »
  - « Document noté. Enregistrez la fiche pour l'archiver définitivement. »
  - « Champs appliqués. Enregistrez la fiche pour archiver le fichier. »
  - Côté serveur : « Choisissez un fichier. · اختر ملفاً. », « Enregistrez d'abord la fiche employé. · احفظ بطاقة العامل أولاً. », « Type de document requis. · نوع الوثيقة مطلوب. », « Fichier trop volumineux (15 Mo max). », « Formats: PDF, JPG, PNG, WEBP. »
- **Points d'attention** :
  - **[À VÉRIFIER]** Sur une fiche jamais enregistrée, le document est seulement « noté » à l'écran. Le code ne garde pas le fichier pour l'envoyer après l'enregistrement. Il faut donc, après le premier enregistrement, **fermer et rouvrir la fiche puis réimporter le document**, sinon le contrôle « Documents obligatoires manquants » bloquera l'enregistrement suivant.
  - Les messages d'erreur parlent d'un « onglet Documents », mais la fiche n'a pas d'onglet de ce nom : il s'agit du bloc de téléversement en haut de la fenêtre.
- **Liens** : F-EMP-05 (dossier), paramétrage des types de document (référentiels).

### F-EMP-04 — Aperçu et impression de la fiche

- **Titre** : aperçu dont le titre est le nom de l'employé et le sous-titre « Matricule X ».
- **Où la trouver** :
  - Clic sur une ligne, ou bouton « Ouvrir » (vue Tableau complet).
  - Documents → Fiches de renseignements → « Afficher la fiche » / « Imprimer la fiche ».
- **À quoi ça sert** : voir la fiche officielle au format A4 et l'imprimer.
- **Étapes** : boutons « Fermer », « Modifier » (ouvre F-EMP-02), « Imprimer ».
- **Résultat** : impression via le navigateur.

### F-EMP-05 — Dossier administratif (Fichier administratif)

- **Titre** : icône « Dossier administratif », bouton « Dossier » ; fenêtre « Fichier administratif ».
- **Où la trouver** : liste des employés, au survol d'une ligne ou dans la vue Tableau complet.
- **À quoi ça sert** : contrôler la complétude des pièces d'un salarié.
- **Contenu de la fenêtre** :
  - Sous-titre « matricule · nom · prénom ».
  - Compteurs « x / y documents » et « n obligatoire(s) manquant(s) ».
  - Lien « Fiche de renseignements : {fichier} ».
  - Une ligne par type de document, avec les mentions « Obligatoire », « Non téléversé » et le lien « Voir ».
  - Aucun type paramétré : « Aucun type de document dans le référentiel. »
- **Boutons** : « Fermer », « Actualiser », « Ouvrir la fiche ».
- **Règle** : fenêtre en **lecture seule** ; les téléversements se font dans la fiche (F-EMP-03).

### F-EMP-06 — Activer / Désactiver un employé

- **Titre** : « Désactiver » / « Activer ».
- **Où la trouver** : icône au survol d'une ligne (vue Liste) ou bouton dans la vue Tableau complet.
- **À quoi ça sert** : retirer un employé de la liste active sans le supprimer.
- **Résultat** : le statut bascule entre **Actif (ACTIVE) et Inactif (INACTIVE)**.
- **Points d'attention** :
  - N'utilise pas les statuts Suspendu ou Désactivé ; ceux-ci se choisissent dans la fiche (champ Statut).
  - **Ne remplace pas une sortie** : une sortie (F-SOR-01) clôt les contrats et calcule le solde.
  - [À VÉRIFIER] La validation d'une sortie modifie la situation d'emploi de l'employé (EXITED) mais pas son « Statut » de fiche : un salarié sorti peut rester « Actif » dans la liste Employés.

### F-EMP-07 — Gérer les colonnes de la base employés

- **Titre** : bouton « Colonnes » ; fenêtre « Colonnes base employés ».
- **Où la trouver** : barre d'outils de `/rh/employes`.
- **À quoi ça sert** : ajouter des champs personnalisés à la fiche employé, ou masquer des champs système.
- **Sous-titre** : « Ajoutez une colonne ici. Masquer une colonne système la cache sans effacer les données. »
- **Étapes (ajout)** :
  1. « Libellé AR » et « Libellé ».
  2. « Type » : Texte / Date / Nombre / Liste. Pour Liste, choisir un référentiel.
  3. Cliquer « Ajouter une colonne ».
- **Erreur** : « Choisissez une liste pour cette colonne. »
- **Résultat** : « Colonne ajoutée. » La colonne apparaît dans la section « Extra / إضافي » de la fiche et dans la vue Tableau complet. Son code technique est dérivé du libellé.
- **Gestion des colonnes existantes** :
  - « Supprimer » sur une colonne système : elle est seulement **masquée** (mention « Masqué », bouton « Afficher » pour la rétablir).
  - « Supprimer » sur une colonne personnalisée : elle est **supprimée**.
- **Point d'attention** : [À VÉRIFIER] les rôles autorisés à modifier ce paramétrage dépendent des règles de la base.

### F-EMP-08 — Importer l'ancienne base (Excel / CSV)

- **Titre** : « Importer l'ancienne base ».
- **Où la trouver** : seconde ligne de la barre d'outils de `/rh/employes`.
- **À quoi ça sert** : reprendre en une fois le fichier du personnel existant.
- **Sous-titre** : « Excel (.xlsx) ou CSV. Les employés déjà présents (même matricule ou NIN) ne sont jamais modifiés. »
- **Prérequis** : fichier `.xlsx` (seule la première feuille est lue) ou `.csv`, 5 Mo maximum, 3000 lignes maximum, une ligne d'en-tête.
- **Étapes** :
  1. Zone « Choisir le fichier de l'ancienne base ». Indication : « Une ligne par employé, avec une ligne d'en-tête (Matricule, Nom, Prénom…). Depuis Google Sheets : Fichier → Télécharger → Microsoft Excel (.xlsx). » Puis cliquer « Lire le fichier ».
  2. Aperçu :
     - Compteurs « À importer », « Déjà présent », « Doublon », « Incomplet ».
     - Liste « Ligne d'en-tête » (choix parmi les 15 premières lignes ; détection automatique).
     - Si des colonnes obligatoires manquent : « Colonnes obligatoires non trouvées : … Choisissez-les ci-dessous. »
  3. « Correspondance des colonnes » : pour chaque colonne du fichier, choisir « — Ignorer — », « N° (ancienne base) » ou un champ de la fiche. La correspondance est proposée automatiquement à partir des noms usuels.
  4. Tableau d'aperçu (300 premières lignes) : Ligne, Matricule (« auto » si absent), Nom, État, Remarques.
  5. Cliquer « Importer N employé(s) ». Bouton « Retour » pour revenir à l'étape précédente.
- **Résultat** :
  - Traitement par lots de 25, avec la progression « Import en cours… x / y ».
  - Bilan « N employé(s) créé(s) » et « N refusé(s) », avec le détail « Ligne n » + erreur.
- **Règles** :
  - Matricule absent : attribué automatiquement (remarque « Matricule absent : attribué automatiquement »).
  - Dates, nombres et statuts non reconnus : avertissement. Mots de statut reconnus : actif, en poste, inactif, sorti, démission, licencié, suspendu, etc.
  - Valeur hors liste d'un référentiel : ignorée, sauf pour les colonnes personnalisées où la valeur brute est conservée.
  - Valeur au mauvais format (NSS, NIN…) : ignorée avec avertissement.
  - Les lignes importées sont marquées « importée de l'ancienne base » avec le N° d'origine.
  - [À VÉRIFIER] L'import ne génère pas la fiche de renseignements PDF (contrairement à l'enregistrement manuel).

---

## 3. Postes & grille — `/rh/postes`

### F-POS-01 — Créer ou modifier un poste

- **Titre** : « Nouveau poste » / « Modifier » ; fenêtre « Nouveau poste » / « Modifier le poste ».
- **Où la trouver** : RH → Personnel → « Postes & grille » (`/rh/postes`).
- **À quoi ça sert** : tenir le référentiel des postes repris dans les contrats.
- **Prérequis** : rôle SUPER_ADMIN, ADMIN_RH ou GERANT.
- **Champs** :

| Champ | Oblig. | Règles |
|---|---|---|
| Code | * | Converti en majuscules ; 2 à 20 caractères A-Z, 0-9, `_` ou `-`. Erreur : « Code : 2 à 20 caractères A-Z, 0-9, _ ou - ». |
| Catégorie | * | Exécution · تنفيذ / Maîtrise · تحكم / Cadre · إطار / Direction · إدارة. Défaut : Exécution. |
| Intitulé (FR) | * | 2 caractères minimum. Erreur : « Libellé requis · التسمية مطلوبة ». |
| التسمية بالعربية | | Intitulé arabe. |
| Qualification (code) | | Texte court. |
| Ordre | | 0 à 9999. |
| Actif | | Case à cocher (cochée par défaut). |

- **Résultat** : le poste apparaît dans le tableau et dans la liste « Poste (référentiel) » du contrat.
- **Règles** :
  - En modification, note affichée : « L'intitulé est recopié sur les contrats ouverts rattachés à ce poste. » (contrats Brouillon, Actif ou Suspendu).
  - Code en double : « Le code X existe déjà. »
  - Un poste inactif n'est plus proposé dans les nouveaux contrats.
- **Liens** : F-POS-02, F-POS-04, F-CTR-02.

### F-POS-02 — Gérer la grille salariale d'un poste

- **Titre** : « Grille » / « Fermer la grille ».
- **Où la trouver** : bouton sur la ligne du poste.
- **À quoi ça sert** : définir le salaire de base (et le net de référence) par grade, avec des versions datées.
- **Prérequis** : rôle RH salaires pour ajouter ou supprimer une ligne.
- **Champs du formulaire d'ajout** :
  - « Grade » : défaut A, 1 à 6 caractères. Erreur : « Grade : 1 à 6 caractères (A, B, 1, 2…) ».
  - « Base » * : doit être supérieure à 0. Erreur : « Salaire de base requis » ; le bouton « Ajouter » reste grisé tant que la base est à 0.
  - « Net réf. » : facultatif.
  - « En vigueur au » : défaut aujourd'hui (heure d'Alger).
  - « Note » : facultative.
- **Étapes** : renseigner le formulaire puis cliquer « Ajouter ».
- **Résultat** : nouvelle ligne Grade / Base mensuelle / Net de référence / En vigueur au / Note.
- **Règles** :
  - Une ligne est identifiée par le trio poste + grade + date d'effet : ressaisir le même trio **remplace** la ligne existante.
  - La colonne « Grille en vigueur » affiche, pour chaque grade, la version la plus récente dont la date d'effet est atteinte.
  - Suppression : confirmation « Supprimer cette ligne de grille ? ».
  - Selon le bandeau de la page, la paie signale tout salaire inférieur à la grille.
- **Liens** : F-CTR-02 (bouton « Appliquer » de la grille dans le contrat).

### F-POS-03 — Supprimer un poste

- **Titre** : « Supprimer ».
- **Règle** : visible seulement si le poste n'a aucun contrat. Confirmation : « Supprimer le poste X ? ».
- **Erreur serveur** : « Poste utilisé par N contrat(s) : désactivez-le plutôt. »

### F-POS-04 — Importer les postes depuis les contrats

- **Titre** : « Importer depuis les contrats ».
- **À quoi ça sert** : démarrer le référentiel à partir des intitulés déjà saisis dans les contrats.
- **Règle** : crée un poste pour chaque intitulé distinct trouvé dans les contrats qui ne sont rattachés à aucun poste, puis rattache ces contrats au poste créé.
- **Résultat** : « N poste(s) créé(s), M contrat(s) rattaché(s). »

---

## 4. Contrats de travail — `/rh/contrats` → `/rh/documents?onglet=contrats`

### F-CTR-01 — Consulter le registre des contrats

- Voir la mise en page en §1.3. Recherche « Employé, matricule, affectation… ».
- **Afficher** (fenêtre en lecture seule) :
  - Titre « matricule · nom », sous-titre « chantier · type · statut ».
  - Rendu A4 du contrat.
  - Boutons « Fermer », « Modifier », « Imprimer ».
- **PDF archivé** : ouvre le dernier PDF archivé du contrat.

### F-CTR-02 — Créer ou modifier un contrat de travail

- **Titre** : « Nouveau contrat » / « Modifier » ; fenêtre « Nouveau contrat de travail » / « Contrat de travail ».
- **Où la trouver** : RH → Documents → Registre → carte « Contrat de travail » → « Nouveau contrat ».
- **À quoi ça sert** : définir l'affectation, le poste, le type, la période, la rémunération, les cotisations et les rubriques de paie d'un salarié.
- **Prérequis** :
  - La fiche employé existe.
  - Le chantier existe et porte un code d'activité.
  - Permission `contracts` / `update` sur le chantier.
  - Les rubriques de salaire exigent un rôle RH salaires ; IRG et CACOBATPH exigent le droit « Cotisations & impôts ».
- **Structure de la fenêtre** :
  - Sous-titre : matricule, nom, chantier et pastille de statut ; pour un nouveau contrat : « Remplissez les sections puis enregistrez. »
  - À droite, un aperçu en direct « Aperçu du contrat » : « Mis à jour pendant la saisie » ou « Choisissez l'employé pour compléter le document ».
  - Pied : « Masquer l'aperçu » / « Afficher l'aperçu », « Annuler », « Aperçu et impression » (enregistre puis ouvre F-CTR-03), « Enregistrer ».

**Section « Employé, affectation et poste »** (« Qui, où, pour quelle activité et à quel poste. »)

| Champ | Oblig. | Règles |
|---|---|---|
| Employé | * | Liste avec recherche : « Choisir l'employé… », recherche « Matricule, nom ou prénom… », vide « Aucun employé trouvé ». Si l'employé a déjà un contrat principal ouvert, un avertissement s'affiche : « Contrat principal déjà ouvert (début jj/mm/aaaa). » + lien « Ouvrir ce contrat ». |
| Affectation | * | Liste des chantiers ; choisir un chantier renseigne aussi son activité. **Grisé en modification** : « Affectation en vigueur : elle ne se modifie pas depuis le contrat. » |
| Activité | * | « code · libellé ». Si la liste est vide : « Aucun code d'activité : ajoutez-en dans Référentiels › Codes d'activité. » |
| Affectation principale | | Interrupteur, activé par défaut. Mention : « Un seul contrat principal ouvert par employé. » |
| Poste (liste) | | Référentiel des postes ; remplit les intitulés français et arabe. |
| Poste (référentiel) | | Affiché seulement si des postes existent (postes actifs). Remplit les intitulés et le grade. |
| Grade / échelon | | Indication « Grille : X DA » ou « Pas de grille pour ce grade ». Le bouton « Appliquer » recopie la base et le net de la grille. |
| Intitulé (français) / Intitulé (arabe) | | Modifiables. |

**Section « Contrat »** (« Type, régime de travail, période et statut. »)

| Champ | Oblig. | Règles |
|---|---|---|
| Type de contrat | | Référentiel (CDI, CDD, CDD Chantier, Intérim (mise à disposition)… selon la base). |
| Régime de travail | | Référentiel (Administration, 4x4, Familial… selon la base). SUPER_ADMIN dispose d'un bouton « + » (« Nouveau régime (ex. 4/4, 6/2…) ») et d'une corbeille. |
| Agence d'intérim | * si type INTERIM | Indication : « Intérimaire : présent au pointage, hors paie, facturé par l'agence ». Erreur : « Contrat d'intérim : choisissez l'agence. » |
| Taux journalier facturé | | Type INTERIM seulement. Indication : « Vide = taux de l'agence (X DA) ». |
| Début (1er du mois) | * | Doit être le **1er du mois**. |
| Fin | | Indication : « Vide = durée indéterminée ». |
| Statut | | Boutons radio Brouillon / Actif / Suspendu / Clôturé. Défaut : Brouillon. |

Messages des régimes : « Ce régime existe déjà. », « Régime utilisé par des contrats : il est archivé et n'est plus proposé. », « Libellé du régime obligatoire. ».

**Section « Rémunération »** (« Montants mensuels et retenue d'absence. ») — montants en DA

| Champ | Règles |
|---|---|
| Salaire de base | Montant mensuel ; vide = 0. |
| Net chantier | Net mensuel de référence du chantier. |
| Net récupération | Montant de récupération. |
| Retenue / jour d'absence | Indication : « Par jour d'absence non justifiée, imprimée dans le contrat ». Format : jusqu'à 9 chiffres et 2 décimales. Erreur : « Retenue / jour d'absence : saisissez un montant en DA. » |

**Section « Cotisations et impôts »** (« Chaque option affiche ses taux ; les cadres sous chaque champ montrent les taux appliqués. »)

- **CNAS** : « Automatique (fiche employé) » ou un régime choisi dans un tableau (Code, Régime, Salarié, Patronal, Œuvres soc.). Les taux retenus s'affichent en vignettes.
- **IRG** :
  - « Automatique… »
  - « Barème général »
  - « Zone Sud / Extrême Sud » (avec choix de la zone)
  - « Handicapé / retraité » (lissage)
  - « Exonération totale : 0 % »
  - « Taux libératoire » 10 % ou 15 % — proposé **seulement** si le type de contrat l'autorise.
- **CACOBATPH** (affiché seulement si l'activité est soumise aux congés CACOBATPH) : « Automatique (selon l'activité) », « Congés payés + intempéries », « Congés payés seulement », « Intempéries seulement », « Non assujetti ».
- **Droits** : sans le droit « Cotisations & impôts », IRG et CACOBATPH sont verrouillés (« Réservé aux droits « Cotisations & impôts » »).
- **Date d'effet** : les choix IRG et CACOBATPH sont enregistrés comme des réglages datés, avec le motif « Choix de la fiche contrat ».
  - Nouveau contrat : effet à la date de début.
  - Contrat existant : effet au 1er du mois en cours, ou à la date de début si elle est postérieure.

**Section « Rubriques de salaire »** (« Choisissez par classe, puis réglez le mode et la valeur de chaque rubrique. »)

- **Liste « Choisir les rubriques… »**, groupée par classe :
  - CLASSE 1 — CNAS + IRG
  - CLASSE 2 — CNAS seulement
  - CLASSE 3 — IRG seulement
  - CLASSE 4 — Ni CNAS ni IRG
  - CLASSE 5 — RETENUE DE GARANTIE
- **Exclusions** : les rubriques de niveau « chantier » ne sont pas proposées ; elles restent héritées du chantier.
- **Réglage de chaque ligne** :
  - Mode : Pourcentage `*%` / Montant `/F` / Journalier `*J` / Mensuel ÷ jours du mois.
  - Valeur, avec le suffixe %, DA, DA/j ou DA/mois.
  - Une aide « Bulletin : … » explique le calcul.
- **Nouveau contrat** : les rubriques actives (hors chantier) qui ont un montant par défaut sont présélectionnées.
- **Montants négatifs** : acceptés seulement en classe 5 (« Montant négatif accepté seulement en classe 5 (retenues). … »).

**Section « Rubriques de récupération (CRP) · بنود العطلة التعويضية »**

- Description : « Payées seulement sur les jours pointés CRP. Le salaire de base reste dû ; les rubriques ci-dessus ne s'appliquent pas à ces jours. »
- Aucune rubrique : « Aucune rubrique de récupération : les jours CRP ne reçoivent que le salaire de base. »
- Aides de calcul :
  - pourcentage : « % du salaire de base × jours de récupération ÷ jours du mois » ;
  - mensuel : « DA ÷ jours du mois × jours CRP » ;
  - journalier : « DA × jours CRP » ;
  - dans tous les cas : « Rien si aucun CRP. »

**Validations (dans l'ordre)**
1. « Choisissez l'employé. »
2. « Choisissez l'affectation. »
3. « Activité vide. Choisissez-la, ou renseignez-la sur la fiche chantier. »
4. « Date de début obligatoire. »
5. Format de la retenue (voir ci-dessus).
6. « Chargement des choix IRG / CACOBATPH en cours… » (réessayer dans un instant).
7. Côté serveur :
   - « Un contrat commence le 1er du mois : aucun contrat ne débute en milieu de mois. … »
   - Agence obligatoire pour un intérim.
   - Règle du contrat principal (ci-dessous).

**Règle du contrat principal** (si « Affectation principale » est cochée et le statut est Brouillon, Actif ou Suspendu)
- Un autre contrat principal ouvert chevauche la période **et commence avant** le nouveau : il est **clôturé la veille** du début du nouveau contrat.
- Il commence **le même jour ou après** : refus. Message : « Ce salarié a déjà un contrat principal ouvert (début …). Fermez cette fenêtre et ouvrez-le avec « Modifier »…, ou décochez « Affectation principale » ».
- Message de contrôle en base : « Un seul contrat principal ouvert par employé sur une même période… »

**Résultat et messages**
- Succès :
  - « Contrat enregistré. »
  - « Contrat enregistré. L'ancien contrat principal a été clôturé la veille. »
- Complément sur la paie :
  - « Les bulletins seront calculés à la génération de la paie, sur décision. »
  - Ou : « N paie(s) brouillon signalée(s) « données modifiées depuis le calcul »… Centre de décisions ».
  - Ou : « Aucune paie n'a été créée : la génération est soumise à décision ».
- Avertissements (le contrat est enregistré, la fenêtre reste ouverte) :
  - « Contrat enregistré, mais les rubriques de salaire ne l'ont pas été… » (par exemple si l'utilisateur n'a pas un rôle RH salaires).
  - « Contrat enregistré, mais IRG / CACOBATPH non appliqué : … »
  - « … la retenue / jour d'absence ne l'a pas été… »
  - « Paie brouillon non signalée… »
  - « Le serveur n'a pas répondu. Rechargez la page… »

**Règles métier / points d'attention**
- **Le chantier d'un contrat ne se modifie pas après la création.** En base, la tentative est refusée avec ce message : « Le chantier d'un contrat ne se modifie pas directement : enregistrez un changement d'affectation daté (onglet Affectations) ou demandez une correction (décision D8). » **[À VÉRIFIER]** L'onglet « Affectations » n'est pas affiché dans l'interface actuelle (voir §8).
- Modifier la date de début impose aussi le 1er du mois. Le début ne peut pas dépasser un changement d'affectation daté déjà enregistré.
- La description du registre l'indique : « Un contrat brouillon entre aussi dans la paie. »
- Les rubriques de niveau « employé » sont enregistrées sur **l'employé**, pas sur le contrat. À chaque enregistrement d'un contrat, **toutes** les rubriques de niveau employé de ce salarié sont remplacées par celles de la fiche contrat, ainsi que toutes les rubriques du contrat.
- Priorité des rubriques (selon le bandeau Postes) : employé > contrat > poste > chantier.
- Pour la paie, l'enregistrement ne recalcule rien : les paies brouillon concernées sont signalées et une décision est demandée dans le Centre de décisions.
- **Liens** : F-POS-01/02, F-INT-01, F-CTR-03, module Paie (Exceptions, Centre de décisions), F-SOR-01.

### F-CTR-03 — Imprimer le contrat (et l'archiver en PDF)

- **Titre** : « Imprimer » (registre) ou « Aperçu et impression » (fenêtre contrat) ; fenêtre « Imprimer le contrat de travail ».
- **À quoi ça sert** : produire le contrat officiel en arabe, numéroté et archivé.
- **Bandeau d'information** : « Pré-rempli depuis la fiche employé et le contrat. Les corrections sont gardées pour ce contrat ; complétez de préférence les champs arabes dans la fiche employé. »
- **Avertissement** si des données manquent : « Champs vides : … ». La liste peut contenir des noms techniques : nom, birth_date, id_number, poste, net.
- **Champs** (libellés français + arabe affichés) :
  - « Type · النوع » : CDD عقد عمل محدد المدة / CDI عقد عمل غير محدد المدة.
  - « Motif CDD (art. 12 loi 90-11) · سبب التوظيف » : 5 motifs, défaut n° 5.
  - « N° du contrat » : indication « Vide = attribué automatiquement (année/NNN) ».
  - Identité et état civil : Nom et prénom, Matricule, Né(e) le, à, Fils/fille de, et de, Situation familiale.
  - Pièce : Pièce, N° pièce, Délivrée le, Autorité, Adresse.
  - Poste et période : Poste, Début, Fin (masqué pour un CDI).
  - Période d'essai (défaut « شهرا واحدا ») et Préavis (défaut « ثلاثة أشهر »).
  - Montants : Net à payer (DA), Indemnité récupération (DA), Retenue / jour d'absence (DA).
- **Boutons** : « Modifier le modèle (articles) » (rôles RH salaires), « Fermer », « Enregistrer et imprimer ».
- **Résultat** :
  1. Les valeurs modifiées par rapport aux données de la fiche sont gardées pour ce contrat.
  2. Un numéro AAAA/NNN est attribué si le champ est vide. Numéro déjà pris : « Le numéro X est déjà utilisé. »
  3. L'impression du navigateur s'ouvre.
  4. Le PDF est archivé : « Archivage du contrat en PDF… » puis « Contrat archivé en PDF. Ouvrir le PDF ». En cas d'échec : « Contrat enregistré, archive PDF non créée : … ».

### F-CTR-04 — Modifier le modèle du contrat (articles)

- **Titre** : « Modifier le modèle (articles) » ; fenêtre « Modèle du contrat de travail ».
- **Prérequis** : rôle SUPER_ADMIN, ADMIN_RH ou GERANT.
- **Champs** :
  - Titre CDD / CDI, Préambule légal, Phrase d'ouverture CDD / CDI, L'employeur.
  - Article 2 (CDD) introduction, Motif 1…n.
  - Articles : case « CDD seulement », bouton « Supprimer », bouton « Ajouter un article ».
  - Remarque, Phrase finale, Signature employé / employeur, Exemplaires.
- **Variables disponibles** : `{essai}` `{preavis}` `{net}` `{net_lettres}` `{recup}` `{recup_lettres}` `{retenue}` `{retenue_lettres}`. Le texte encadré par `**…**` est imprimé en gras.
- **Boutons** : « Texte d'origine » (avec confirmation), « Annuler », « Enregistrer le modèle ».
- **Règle** : le texte par défaut s'appuie sur la loi 90-11, avec un bloc employeur par défaut (Hassi Messaoud). Le modèle est commun à tous les contrats.

### F-CTR-05 — Importer un contrat PDF lu par l'IA

- **Titre** : « Contrat PDF » ; fenêtre « Importer un contrat PDF · استيراد عقد PDF ».
- **Sous-titre** : « Contrat signé scanné (PDF ou photo). L'IA remplit la fiche contrat ; vous vérifiez avant d'enregistrer. » Indication : « Une seule personne par fichier… ».
- **Prérequis** :
  - Fichier PDF, JPG, PNG ou WEBP de 14 Mo maximum.
  - Service de lecture IA configuré ; sinon : « Lecture IA non configurée… ».
  - La fiche de l'employé doit exister.
- **Étapes** :
  1. Choisir le fichier, puis « Lire le contrat ». Étapes affichées : « Envoi du fichier… », puis « Lecture du contrat par l'IA… (jusqu'à une minute) ».
  2. La fenêtre contrat (F-CTR-02) s'ouvre pré-remplie, statut Actif, avec le bandeau « Lu par l'IA depuis « fichier » — vérifiez chaque champ avant d'enregistrer ».
  3. Vérifier chaque champ et enregistrer.
- **Avertissements possibles** :
  - Employé non identifié (avec une liste de noms proches), ou « Employé introuvable : créez d'abord sa fiche… ».
  - Date de début ramenée au 1er du mois, ou date de début non lue.
  - Chantier non lu ; net non lu ; « Vérifiez la retenue… ».
- **Résultat** : à l'enregistrement, le scan est archivé comme PDF du contrat.
- **Règle** : l'employé est reconnu en comparant la date de naissance, le nom arabe, le nom latin ou le nom du fichier, et le numéro de série avec le matricule.

### F-CTR-06 — Importer des contrats (Excel / CSV)

- **Titre** : « Importer des contrats ».
- **Sous-titre** : « Excel (.xlsx) ou CSV, une ligne par contrat. Les contrats déjà enregistrés ne sont jamais modifiés. »
- **Colonnes reconnues** : Matricule ou Nom/Prénom, Chantier, Poste, Type, Date de début, Date de fin, Salaire de base, Salaire net. Une feuille de pointage convient aussi.
- **Prérequis** : 5 Mo maximum, 2000 lignes maximum ; liste « Feuille » si le classeur en contient plusieurs.
- **Bloc « Valeurs par défaut (colonne absente ou vide) »** :
  - « Rapprochement des employés » : Par matricule / Par nom et prénom (choix deviné automatiquement).
  - « Chantier ».
  - « Activité » : « Si le chantier n'en porte pas. »
  - « Type de contrat » : défaut CDD.
  - « Régime de travail ».
  - « Statut » : Actif / Brouillon ; indication « Un contrat dont la fin est passée est clôturé. »
- **Correspondance des colonnes** : Matricule, Nom, Prénom, Nom et prénom (une seule colonne), Chantier / affectation, Poste, Type de contrat, Date de début, Date de fin, Salaire de base mensuel, Salaire net mensuel (référence chantier).
- **Aperçu** :
  - Colonnes : Ligne, Dans le fichier, Employé dans l'application (liste pour corriger le rapprochement), Contrat, État, Remarques.
  - États : « À importer », « Employé à choisir », « Déjà sous contrat », « Doublon », « Incomplet ».
- **Règles** :
  - Traitement par lots de 20.
  - Début absent : date de recrutement de la fiche. Début toujours ramené au 1er du mois.
  - Contrats toujours principaux ; poste converti en majuscules.
  - Chevauchement avec un contrat principal ouvert : refusé (« Contrat principal déjà enregistré sur cette période »). **L'import ne clôture jamais un contrat existant.**
  - [À VÉRIFIER] Aucune rubrique de salaire n'est créée et le régime CNAS reste « Automatique ». Il faut compléter chaque contrat ensuite.

---

## 5. Intérim — `/rh/interim`

### F-INT-01 — Créer ou modifier une agence d'intérim

- **Titre** : « Nouvelle agence » / « Modifier ».
- **Prérequis** : rôle SUPER_ADMIN, ADMIN_RH ou GERANT.
- **Champs** :

| Champ | Oblig. | Règles |
|---|---|---|
| Code | * | 2 à 20 caractères A-Z, 0-9, `_` ou `-`. Erreur : « Code : 2 à 20 caractères A-Z, 0-9, _ ou -. » ; en double : « Ce code d'agence existe déjà. » |
| Raison sociale | * | « Raison sociale obligatoire. » |
| NIF, NIS, RC, Téléphone, E-mail, Contact, Adresse | | Texte. |
| Taux journalier par défaut (DA) | | Indication : « Utilisé quand le contrat n'a pas de taux propre ». Supérieur ou égal à 0. |
| Coefficient agence (%) | | 0 à 100, défaut 0. |
| TVA (%) | | 0 à 100, défaut 19. |
| Notes | | Texte. |
| Active | | Case cochée par défaut. |

- **Erreur** : « Taux, coefficient ou TVA invalide. »
- **Résultat** : « Agence X enregistrée. » L'agence devient sélectionnable dans un contrat de type INTERIM (F-CTR-02).

### F-INT-02 — Calculer et émettre un relevé mensuel de prestations

- **Titre** : « Calculer le relevé » puis « Émettre le relevé ».
- **Prérequis** :
  - Contrats INTERIM rattachés à l'agence.
  - Présences **validées** au pointage sur le chantier du contrat.
  - Rôle RH salaires.
- **Étapes** :
  1. Choisir « Année » (la page se recharge quand on quitte le champ), « Mois », « Agence », « Chantier » (facultatif).
  2. Cliquer « Calculer le relevé ». Aperçu affiché :
     - Résumé « N intérimaire(s) · J jour(s) · X DA TTC ».
     - Pastilles « N contrat(s) INTERIM sur la période » et, le cas échéant, « Taux manquant : … ».
     - Lignes : Matricule, Intérimaire, Chantier, Jours, Taux (DA), Montant (DA), puis la ligne de totaux « Sous-total · coefficient · HT · TVA ».
  3. Cliquer « Émettre le relevé ». Confirmation : « Émettre le relevé : n intérimaire(s), X DA TTC ? ». Le bouton est grisé si un taux manque.
- **Calcul** :
  - Seules les présences au statut VALIDÉ, sur le chantier du contrat et entre ses dates, sont comptées.
  - Jours = quantité de présence (coefficient de la légende de pointage).
  - Taux = taux du contrat, à défaut le taux par défaut de l'agence.
  - Sous-total = Σ jours × taux.
  - Coefficient = sous-total × coefficient agence %.
  - HT = sous-total + coefficient.
  - TVA = HT × TVA %.
  - TTC = HT + TVA.
- **Résultat** : relevé numéroté NNNNNN/AA (registre « ITM »), au statut Émis.
- **Erreurs** :
  - « Aucune présence validée à facturer… » ; aperçu vide : « Aucune présence validée à facturer pour cette agence sur la période. »
  - « Taux journalier manquant : … »
  - « Un relevé actif existe déjà pour cette agence et cette période : annulez-le d'abord. »
  - « Numéro de relevé pris par une création simultanée : réessayez. »
- **Règles** :
  - Un seul relevé non annulé par agence, période et chantier (« Tous » compte comme une valeur).
  - Un relevé émis est **figé** : ni modification ni suppression ; il faut l'annuler et le régénérer (message en base : « Relevé figé : annulez-le puis régénérez-le. »).
  - Les intérimaires sont exclus de la paie.

### F-INT-03 — Imprimer, rapprocher ou annuler un relevé

- **Imprimer** : document A4, avec le nom de l'employeur repris des paramètres du bulletin.
- **Rapprocher** (statut Émis) : fenêtre « Rapprochement du relevé X ».
  - « N° de facture de l'agence » * (en base : « Référence de la facture de l'agence obligatoire. »).
  - « Montant TTC facturé (DA) » : indication « Relevé : X DA ».
  - Si les montants diffèrent : « Écart de X DA avec le relevé : vérifiez la facture avant de rapprocher. »
  - Résultat : statut Rapproché ; la colonne affiche « Facture X · montant » et, s'il y a lieu, « Écart X DA » en rouge.
- **Annuler** (statut Émis) : demande « Motif de l'annulation (obligatoire) : ». Résultat : statut Annulé, motif affiché.
- **Annuler le rapprochement** (statut Rapproché) : retour au statut Émis.
- **Transitions autorisées** : Émis → Rapproché ou Annulé ; Rapproché → Émis. Un relevé annulé ne peut plus être modifié.

---

## 6. Sorties — `/rh/sorties`

### F-SOR-01 — Enregistrer une sortie (brouillon) et préparer le solde de tout compte

- **Titre** : « Nouvelle sortie » / « Modifier » ; fenêtre « Nouvelle sortie » / « Modifier la sortie ».
- **Prérequis** : rôle SUPER_ADMIN, ADMIN_RH ou GERANT. L'employé ne doit pas être déjà sorti.
- **Champs** :

| Champ | Oblig. | Règles |
|---|---|---|
| Employé | * | Liste « matricule · nom prénom » des employés non sortis. Grisé en modification. Erreur : « Employé requis · اختر العامل ». |
| Date de sortie (dernier jour travaillé) | * | Erreur : « Date de sortie invalide ». |
| Motif | * | Fin de contrat (CDD) · انتهاء مدة العقد (défaut) / Démission · استقالة / Licenciement · تسريح / Abandon de poste · إهمال المنصب / Rupture à l'amiable · فسخ بالتراضي / Fin de période d'essai · إنهاء فترة التجربة / Retraite · تقاعد / Décès · وفاة / Autre · أخرى. |
| Reliquat de congé (jours) | | Nombre de −400 à 400. |
| Observations | | 1000 caractères maximum. |

- **Abandon de poste** : avertissement « Abandon de poste : envoyer d'abord deux mises en demeure. » avec les boutons « 1ère mise en demeure » et « 2ème mise en demeure » (F-SOR-04).
- **Bloc « Éléments du solde de tout compte »** :
  - Bouton « Calculer le reliquat de congé » (nécessite l'employé et la date). Il fait trois choses :
    - il retrouve le contrat principal en vigueur à la date de sortie et le salaire de base à cette date (historique des salaires) ;
    - il reprend le solde de congé à cette date ;
    - si le solde et la base sont positifs, il propose la ligne **ICP** « Indemnité compensatrice de congé (N j) » = base ÷ 30 × jours, en classe 1. Une ligne ICP existante est remplacée.
  - Mention affichée : « Salaire de base à la date de sortie : X DA (indemnité = base / 30 × jours). »
  - Lignes d'éléments : Code, Libellé *, التسمية, catégorie, montant *, « Retirer ».
    - Catégories : 1 · Cotisable + imposable / 2 · Cotisable, non imposable / 3 · Imposable, non cotisable / 4 · Ni cotisable ni imposable.
    - Erreurs : « Libellé requis · التسمية مطلوبة », « Montant non nul · المبلغ مطلوب ».
  - « Ajouter un élément » ajoute une ligne de code AUTRE en classe 1 (30 lignes maximum). Le total s'affiche.
  - Note : « Montant négatif = retenue. Classe 1 : soumis aux cotisations et à l'IRG ; classe 4 : versé tel quel (ex. indemnité de licenciement). »
- **Boutons** : « Annuler », « Enregistrer le brouillon » (grisé sans employé ni date).
- **Résultat** : « Sortie enregistrée (brouillon). Validez-la pour clôturer les contrats. »
- **Erreurs** :
  - « Une sortie est déjà ouverte pour cet employé. · توجد وضعية خروج مفتوحة لهذا العامل » (une seule sortie Brouillon ou Validée par employé).
  - « Modification refusée (sortie validée ou droits insuffisants). »
- **Supprimer** (brouillon seulement) : confirmation « Supprimer ce brouillon ? » ; sinon « Seul un brouillon peut être supprimé. »

### F-SOR-02 — Valider une sortie

- **Titre** : « Valider ».
- **Confirmation** : « Valider la sortie de X au jj/mm/aaaa ? Ses contrats seront clôturés (ENDED) et le solde (X DA) sera ajouté à la paie du mois de sortie, avec retenue du reste des avances. »
- **Résultat** (« Sortie validée. ») :
  - Les contrats non clôturés de l'employé et en cours à la date de sortie reçoivent comme date de fin la date de sortie et passent au statut Clôturé.
  - Les contrats déjà terminés à cette date passent aussi au statut Clôturé.
  - La situation d'emploi de l'employé passe à « sorti » (EXITED), avec la date de sortie.
  - La sortie passe au statut Validée, avec le nom du validateur.
  - Les paies du mois de sortie sont signalées comme modifiées.
- **Erreurs (en base)** : « Réservé aux RH (SUPER_ADMIN, ADMIN_RH, GERANT). », « Sortie introuvable. », « Transition … → … impossible. »
- **Liens** : module Paie (le solde est versé sur le bulletin du mois de sortie, avec retenue du reste des avances).

### F-SOR-03 — Annuler une sortie validée

- **Titre** : « Annuler ».
- **Confirmation** : « Annuler la sortie de X ? L'employé redevient actif ; les contrats clôturés restent à rouvrir manuellement. »
- **Résultat** : « Sortie annulée. » L'employé redevient actif (situation d'emploi ACTIVE, date de sortie effacée).
- **Point d'attention** : les contrats clôturés **ne sont pas rouverts** ; il faut les rouvrir à la main dans le registre des contrats (F-CTR-02).

### F-SOR-04 — Documents de sortie : certificat, reçu de solde, mises en demeure

- **Titres** :
  - « Certificat de travail » → fenêtre « Certificat de travail · شهادة عمل ».
  - « Solde de tout compte » → fenêtre « Reçu pour solde de tout compte · وصل تصفية كل حساب ».
  - « 1ère mise en demeure » → fenêtre « Mise en demeure (1ère) · إعذار أول ».
  - « 2ème mise en demeure » → fenêtre « Mise en demeure (2ème et dernière) · إعذار ثانٍ وأخير ».
- **Où les trouver** :
  - Certificat et reçu : ligne d'une sortie **Validée**.
  - Mises en demeure : fenêtre de sortie avec le motif « Abandon de poste ».
- **Champs communs** : Nom et prénom (FR), الاسم واللقب, Matricule, Date du document, Poste (FR), المنصب.
- **Champs propres à chaque document** :
  - Certificat : Né(e) le, Lieu de naissance (FR), مكان الميلاد, Du, Au (date de sortie).
  - Reçu de solde : Du, Au (date de sortie), Somme reçue (DA), et un bloc « Détail du solde (facultatif) » (Désignation, البيان, montant, « Retirer », « Ajouter une ligne »).
  - Mises en demeure : Adresse (FR), العنوان, Absent depuis le, Délai (jours). La 2ème demande aussi N° 1ère mise en demeure et Date 1ère mise en demeure.
- **Options** :
  - Langue : boutons « Français » / « العربية ».
  - Civilité : « Monsieur · السيد » / « Madame · السيدة ».
  - Case « Modifier le texte librement » : affiche le texte complet modifiable.
  - Aperçu en direct à droite.
- **Boutons** : « Fermer », « Enregistrer et imprimer ».
- **Résultat** : le courrier est enregistré au registre des documents RH avec un numéro unique (affiché « N° … »), puis imprimé. L'en-tête de société est « E.U.R.L. NEDJM FROID », lieu Hassi Messaoud.

---

## 7. Liens entre les fonctions (vue d'ensemble)

1. **Fiche employé** (F-EMP-02) → **Contrat** (F-CTR-02) : le contrat reprend l'employé et ses données d'état civil pour l'impression (F-CTR-03).
2. **Postes & grille** (F-POS-01/02) → **Contrat** : liste « Poste (référentiel) », grade, bouton « Appliquer » de la grille.
3. **Agence d'intérim** (F-INT-01) → **Contrat** de type INTERIM → **Pointage** (présences validées) → **Relevé** (F-INT-02).
4. **Contrat** → **Paie** : rubriques, CNAS / IRG / CACOBATPH, signalement des paies brouillon, décision dans le Centre de décisions.
5. **Sortie** (F-SOR-02) → clôture des **contrats**, situation « sorti » de l'employé, solde versé en **paie** du mois de sortie, documents de sortie (F-SOR-04).
6. **Documents** : fiches de renseignements PDF (F-EMP-02), contrats archivés (F-CTR-03 / F-CTR-05), courriers numérotés (F-SOR-04).

---

## 8. Points à clarifier / anomalies relevées

1. **`/rh/contrats` redirige vers Documents** : les contrats ne sont pas un onglet de la section Personnel. Le manuel doit expliquer le chemin RH → Documents → Registre → « Contrat de travail ».
2. **Composants présents dans le code mais affichés nulle part** :
   - changement d'affectation daté et correction d'affectation (décision D8) ;
   - historique des salaires / avenants ;
   - cartes de dérogations Cotisations & impôts (décision D16) ;
   - champs de salaire détaillés du contrat (seules leurs constantes sont utilisées).

   Conséquence : **aucun chemin visible ne permet de changer le chantier d'un contrat existant**, alors que le message d'erreur renvoie à un « onglet Affectations ». Une exception historique de date de début (décision D13) est aussi mentionnée en base, sans interface.
3. **Documents notés avant le premier enregistrement** de la fiche : ils ne sont pas téléversés automatiquement (voir F-EMP-03).
4. Les messages parlent d'un « Onglet Documents » qui n'existe pas dans la fiche.
5. **Statut de fiche et situation d'emploi** : la sortie modifie la situation d'emploi (EXITED) mais pas le « Statut » de la fiche. Un salarié sorti peut apparaître « Actif » dans la liste Employés. À confirmer en test.
6. La liste « Statut » de la fiche semble afficher les codes bruts (ACTIVE, INACTIVE, SUSPENDED, DISABLED). À confirmer à l'écran.
7. La colonne « Type » du registre des contrats affiche le code (ex. CDD_CHANTIER) et non le libellé.
8. L'avertissement de la fenêtre d'impression peut afficher des noms techniques (birth_date, id_number).
9. **Paramétrage en base** : libellés, ordre, caractère obligatoire des champs employés, types de document obligatoires, types de contrat, régimes et rubriques peuvent différer de la configuration décrite. À relever sur l'environnement de production avant de figer le manuel. En particulier, « Date de déclaration » et « CCP / RIP » ont le même numéro d'ordre : leur ordre d'affichage peut varier.
10. **Import des employés** : pas de fiche PDF générée. **Import des contrats** : pas de rubriques ni de régime CNAS. À compléter manuellement ensuite.
11. **Sorties** :
    - les boutons « Certificat de travail » et « Solde de tout compte » sont visibles pour tout utilisateur qui voit l'écran ; les droits d'émission des courriers ne sont pas vérifiés dans ce composant ;
    - l'annulation d'une sortie validée ne rouvre pas les contrats ;
    - le calcul du solde dans la paie (lignes « sortie ») relève du module Paie et n'a pas été vérifié ici.
12. **Intérim** : le champ « Année » ne recharge la page qu'à la sortie du champ. Le coefficient de présence vient de la légende de pointage (module Pointage, non décrit ici).
13. **Droits fins** (`employees`, `contracts`, `hr_compliance`, paramétrage des colonnes) : définis dans la matrice RBAC en base, non lisibles dans le code des écrans.
