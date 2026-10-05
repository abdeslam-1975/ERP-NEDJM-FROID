# 1 Personnel — العمال

**Dans ce chapitre** — Vous apprenez à tenir le fichier du personnel de bout en bout : retrouver un employé, créer et compléter sa fiche, archiver ses pièces, préparer les postes et la grille salariale, établir et imprimer son contrat de travail, gérer les intérimaires et leurs agences, puis enregistrer sa sortie avec le solde de tout compte et les documents de fin de contrat. Les fiches suivent l'ordre dans lequel un agent RH les utilise : d'abord l'employé, ensuite les postes, puis le contrat, l'intérim et enfin la sortie.

| Fonction | Vidéo | Public |
|---|---|---|
| 1.1 Consulter et rechercher le personnel | V1.1 | ADMIN_RH et comptes autorisés sur les employés |
| 1.2 Créer ou modifier une fiche employé | V1.2 | ADMIN_RH et comptes autorisés sur les employés |
| 1.3 Ajouter la photo et les pièces justificatives | V1.3 | ADMIN_RH et comptes autorisés sur les employés |
| 1.4 Consulter le dossier administratif | V1.4 | ADMIN_RH et comptes autorisés sur les employés |
| 1.5 Afficher et imprimer la fiche employé | V1.5 | ADMIN_RH et comptes autorisés sur les employés |
| 1.6 Activer ou désactiver un employé | V1.6 | ADMIN_RH et comptes autorisés sur les employés |
| 1.7 Ajouter ou masquer des colonnes de la fiche | V1.7 | ADMIN_RH et comptes autorisés sur les employés |
| 1.8 Importer l'ancienne base du personnel | V1.8 | ADMIN_RH et comptes autorisés sur les employés |
| 1.9 Importer les postes depuis les contrats | V1.9 | SUPER_ADMIN, ADMIN_RH, GERANT |
| 1.10 Créer ou modifier un poste | V1.10 | SUPER_ADMIN, ADMIN_RH, GERANT |
| 1.11 Gérer la grille salariale d'un poste | V1.11 | SUPER_ADMIN, ADMIN_RH, GERANT |
| 1.12 Supprimer un poste | V1.12 | SUPER_ADMIN, ADMIN_RH, GERANT |
| 1.13 Consulter le registre des contrats | V1.13 | ADMIN_RH et comptes autorisés sur les contrats |
| 1.14 Créer ou modifier un contrat de travail | V1.14 | ADMIN_RH et comptes autorisés sur les contrats |
| 1.15 Renseigner la rémunération et les cotisations du contrat | V1.15 | ADMIN_RH et comptes autorisés sur les contrats (IRG et CACOBATPH : droit « Cotisations & impôts ») |
| 1.16 Choisir les rubriques de salaire du contrat | V1.16 | SUPER_ADMIN, ADMIN_RH, GERANT |
| 1.17 Définir les rubriques de récupération (CRP) | V1.17 | SUPER_ADMIN, ADMIN_RH, GERANT |
| 1.18 Remplacer le contrat principal d'un employé | V1.18 | ADMIN_RH et comptes autorisés sur les contrats |
| 1.19 Imprimer et archiver le contrat | V1.19 | ADMIN_RH et comptes autorisés sur les contrats |
| 1.20 Modifier le modèle du contrat (articles) | V1.20 | SUPER_ADMIN, ADMIN_RH, GERANT |
| 1.21 Importer un contrat PDF lu par l'IA | V1.21 | ADMIN_RH et comptes autorisés sur les contrats |
| 1.22 Importer des contrats depuis Excel | V1.22 | ADMIN_RH et comptes autorisés sur les contrats |
| 1.23 Créer ou modifier une agence d'intérim | V1.23 | SUPER_ADMIN, ADMIN_RH, GERANT |
| 1.24 Calculer et émettre un relevé mensuel d'intérim | V1.24 | SUPER_ADMIN, ADMIN_RH, GERANT |
| 1.25 Imprimer, rapprocher ou annuler un relevé d'intérim | V1.25 | SUPER_ADMIN, ADMIN_RH, GERANT (impression : aussi ADMIN_FINANCE) |
| 1.26 Enregistrer une sortie et préparer le solde de tout compte | V1.26 | SUPER_ADMIN, ADMIN_RH, GERANT |
| 1.27 Valider une sortie | V1.27 | SUPER_ADMIN, ADMIN_RH, GERANT |
| 1.28 Annuler une sortie validée | V1.28 | SUPER_ADMIN, ADMIN_RH, GERANT |
| 1.29 Imprimer les documents de sortie | V1.29 | SUPER_ADMIN, ADMIN_RH, GERANT |

---

## 1.0 L'écran en un coup d'œil

**Où se trouve le Personnel** — Menu latéral « Ressources Humaines », puis la section « Personnel » de la barre d'onglets RH. Par défaut, elle contient quatre onglets :

- « Employés » : la liste du personnel et la fiche de chaque employé.
- « Postes & grille » : les postes et les salaires de base par grade.
- « Intérim » : les agences d'intérim et les relevés mensuels de prestations.
- « Sorties » : les départs et le solde de tout compte.

**Les contrats de travail ne sont pas dans la section Personnel.** Ils se trouvent dans Ressources Humaines › Documents › « Registre », carte « Contrat de travail ». Le tableau de bord RH y mène aussi par ses alertes « Fin de contrat », « Contrats à finaliser » et « Employés sans contrat ».

> Les sections et les onglets peuvent être réorganisés (mode « Réorganiser », voir chapitre 0). Ce chapitre décrit l'ordre par défaut.

**La recherche globale** (barre du haut) propose « Employés », « Postes & grille », « Intérim » et « Sorties ». Un employé trouvé par cette recherche ouvre directement la liste « Employés », avec son nom ou son matricule déjà saisi dans la recherche.

**Écran « Employés »** — En-tête « Personnel » avec le nombre « N employé(s) inscrit(s) ».
- Barre d'outils : « Colonnes », « Nouvel employé ». Seconde ligne : « Importer l'ancienne base » et le bouton « Actifs seulement · النشطون فقط ».
- Trois vues : « Liste » (12 lignes par page), « Cartes », « Tableau complet (toutes les colonnes) ».
- Vue « Liste » : recherche « Nom, matricule ou poste… », pastilles de chantier (« Tous les chantiers ») et de statut (« Tous statuts »), colonnes Employé, Matricule, Chantier, Contrat, Date d'entrée, Statut. Au survol d'une ligne : « Modifier la fiche », « Dossier administratif », « Désactiver » ou « Activer ».
- Vue « Tableau complet » : une colonne par champ de la fiche (libellés français et arabe), recherche « Rechercher dans toutes les colonnes », boutons « Ouvrir », « Modifier », « Dossier », « Désactiver » ou « Activer » sur chaque ligne.

**Écran « Postes & grille »** — Titre « Postes & grille salariale ». Recherche « Rechercher un poste… », boutons « Importer depuis les contrats » et « Nouveau poste ». Colonnes Code, Intitulé, Catégorie, Grille en vigueur, Contrats. Sur chaque ligne : « Grille », « Modifier », « Supprimer ».

**Registre des contrats** (Documents › « Registre » › carte « Contrat de travail ») — Bloc « Contrats de travail ».
- Barre d'outils : « Exceptions » (mène aux exceptions de paie, chapitre 3), « Importer des contrats », « Contrat PDF », « Nouveau contrat ».
- Recherche « Employé, matricule, affectation… », colonnes Employé, Affectation, Type, Net chantier, Statut (Brouillon, Actif, Suspendu, Clôturé).
- Sur chaque ligne : « Afficher », « Modifier », « Imprimer » et, s'il existe, « PDF archivé ».
- 25 lignes par page, tri en cliquant sur un en-tête, menu « Colonnes » pour choisir les colonnes affichées.

**Écran « Intérim »** — En-tête « Intérim — agences et relevés de prestations ». Deux sections : « Agences d'intérim » (bouton « Nouvelle agence ») et « Relevés mensuels » (sélection « Année », « Mois », « Agence », « Chantier », bouton « Calculer le relevé », puis tableau des relevés).

**Écran « Sorties »** — Titre « Sorties & solde de tout compte ». Bouton « Nouvelle sortie », recherche « Rechercher un employé… », colonnes Employé, Date de sortie, Motif, Reliquat congé, Solde (DA), Statut (Brouillon, Validée, Annulée). L'écran affiche les 500 sorties les plus récentes.

---

## 1.1 Consulter et rechercher le personnel

> **Vidéo V1.1** · durée estimée 4 min · Public : ADMIN_RH et comptes autorisés sur les employés

**Où la trouver** — Ressources Humaines › Personnel › « Employés » (`/rh/employes`).

**À quoi ça sert** — Retrouver rapidement un employé, voir son chantier, son poste, son type de contrat et son statut, puis ouvrir sa fiche ou son dossier administratif.

**Avant de commencer**
- [ ] Vos droits vous permettent de consulter les employés.

**Étapes**
1. Choisissez la vue en haut de la liste : « Liste » (par défaut), « Cartes » ou « Tableau complet (toutes les colonnes) ».
2. Tapez un texte dans « Nom, matricule ou poste… ». La recherche porte sur le nom, le matricule, le poste et le N° NSS.
3. Filtrez par chantier : cliquez sur la pastille d'un chantier, ou sur « Tous les chantiers » pour tout revoir.
4. Filtrez par statut : cliquez sur la pastille d'un statut (Actif, Invité, Suspendu, Inactif, Désactivé), ou sur « Tous statuts ».
5. Cliquez sur « Actifs seulement · النشطون فقط » pour n'afficher que les employés au statut Actif. Le nombre d'employés affichés apparaît entre parenthèses. Cliquez de nouveau pour tout revoir.
6. En vue « Tableau complet », utilisez « Rechercher dans toutes les colonnes » : la recherche porte alors sur tous les champs de la fiche.
7. Passez d'une page à l'autre avec la pagination « x–y sur N ».
8. Pour agir sur un employé :
   - cliquez sur sa ligne (ou sur « Ouvrir » en vue « Tableau complet ») pour voir sa fiche au format A4 (voir 1.5) ;
   - survolez la ligne et cliquez sur « Modifier la fiche » (voir 1.2), « Dossier administratif » (voir 1.4), ou « Désactiver » / « Activer » (voir 1.6).

**Résultat** — La liste affiche uniquement les employés qui répondent à vos critères. Par défaut, elle est triée par matricule, du plus récent au plus ancien (année du matricule, puis numéro).

**Attention**
- Les colonnes Chantier, Poste et Contrat viennent du **contrat principal en cours** de l'employé (Brouillon, Actif ou Suspendu). Si l'employé n'a pas de contrat, elles reprennent l'« Affectation » et le « Poste Occupé » saisis dans sa fiche. En cas de doute, c'est le contrat qui fait foi.
- « Aucun employé trouvé » : aucun employé ne correspond à vos critères. Cliquez sur « Réinitialiser les filtres ».
- Les matricules qui ne suivent pas le format habituel (numéro/année, par exemple 15/26) sont placés en fin de liste.

**Voir aussi** — 1.2 Créer ou modifier une fiche employé · 1.4 Consulter le dossier administratif · 1.13 Consulter le registre des contrats

---

## 1.2 Créer ou modifier une fiche employé

> **Vidéo V1.2** · durée estimée 6 min · Public : ADMIN_RH et comptes autorisés sur les employés

**Où la trouver** — Ressources Humaines › Personnel › Employés › bouton « Nouvel employé » (`/rh/employes`). Autres accès :
- raccourci « Nouvel employé » du tableau de bord RH ;
- pour modifier : icône « Modifier la fiche » au survol d'une ligne, ou bouton « Modifier » en vue « Tableau complet » ;
- Ressources Humaines › Documents › « Registre » › carte « Fiche de renseignements » › bouton « Fiche employé » ou « Modifier la fiche ».

**À quoi ça sert** — Saisir l'état civil, la pièce d'identité, l'adresse, la situation professionnelle et les coordonnées bancaires d'un salarié. À chaque enregistrement, l'application génère et archive automatiquement sa fiche de renseignements en PDF.

**Avant de commencer**
- [ ] Vos droits vous permettent de créer et de modifier les employés.
- [ ] Les listes de choix sont remplies (postes, situation familiale, wilaya, type de pièce…) : voir chapitre 6, « Listes et codes ».
- [ ] Vous avez sous la main les pièces de l'employé (pièce d'identité, acte de naissance, attestation CNAS, relevé d'identité bancaire).

**Étapes**
1. Cliquez sur « Nouvel employé ». La fenêtre « Fiche employé » s'ouvre avec :
   - la pastille « Brouillon » (l'employé n'a pas encore de matricule enregistré) ;
   - le « Matricule » proposé automatiquement (format numéro/année, par exemple 15/26), en lecture seule ;
   - le « Statut » à « ACTIVE » et la « Nationalité » à « Algérienne ».
2. Dans l'en-tête, renseignez :
   - « Nom » (obligatoire) et « Prénom » (obligatoire) en caractères latins. Ils sont mis en majuscules automatiquement.
   - « Nom AR » et « Prénom AR » : la saisie se fait de droite à gauche.
   - « N° NSS » : exactement 12 chiffres.
   - « Statut » (obligatoire). Valeurs possibles : « ACTIVE » (actif), « INACTIVE » (inactif), « SUSPENDED » (suspendu), « DISABLED » (désactivé).
3. Section « I. Informations personnelles » : « Né(e) le », « à », « N° Acte naiss » (exactement 5 chiffres), « Situation », « Sexe », « G.Sanguin », « Prénom du Père », « Nom/Prénom Mère », « Nationalité », « Commune de naiss ».
   - Le champ « Nombre d'enfants » n'apparaît que si la situation familiale est marié(e), divorcé(e) ou veuf(ve). Pour un célibataire, il est masqué et vidé.
4. Section « II. Pièce d'identité & adresse » : « Type de la pièce », « N° Pièce » (exactement 9 chiffres), « Délivré le » (au plus tard aujourd'hui), « Expire le » (au plus tôt demain), « Par la Daïra de », « NIN » (exactement 18 chiffres), « Commune (Résidence) », « Wilaya », « Code postal », « Adresse Résidentielle ».
5. Section « III. Situation professionnelle » : « Poste Occupé », « Affectation » (« Administration » ou un chantier actif), « Date de recrutement », « Date de déclaration », « CCP / RIP » (exactement 20 chiffres, commençant par 00799999), « Email », « Niveau » (CEP, BEM, CAP, BT, BAC, TS, LICENCE, MASTER), « Diplôme », « Expérience », « Tél », « WhatsApp (+213) », « Langues ».
   - Sous chaque champ numérique, une indication rappelle le nombre de chiffres attendu (par exemple « 12 chiffres »).
6. Si votre entreprise a ajouté des champs (voir 1.7), complétez la section « Extra / إضافي ».
7. Cliquez sur « Enregistrer ». Le bouton affiche « Enregistrement… » pendant la sauvegarde.

**Pour modifier une fiche existante**
1. Ouvrez la fiche par « Modifier la fiche » (ou « Modifier »).
   - Astuce : dans une fiche déjà ouverte, vous pouvez en charger une autre avec la barre « Rechercher par matricule, N°SS ou NIN… » puis « Rechercher ». La valeur doit être exacte (matricule, N° NSS ou NIN complet). Sinon : « Aucun employé pour cette recherche. »
2. Corrigez les champs puis cliquez sur « Enregistrer ».

**Autres boutons du pied de fenêtre**
- « Imprimer » : imprime la fiche officielle.
- « Nouveau » : vide le formulaire pour saisir un autre employé.
- « Fermer » : ferme la fenêtre.

**Résultat** — La fiche est enregistrée en une seule fois (tout ou rien) et la fenêtre reste ouverte avec les valeurs rechargées. La fiche de renseignements PDF est archivée dans les documents RH. Messages possibles :
- « Fiche enregistrée. PDF : … » : tout est fait.
- « Fiche enregistrée. PDF plus tard : … » ou « Fiche enregistrée. Génération PDF reportée. » : la fiche est bien enregistrée, seul le PDF n'a pas pu être créé tout de suite.

**Attention**
- « Champs obligatoires manquants : … » : complétez les champs cités, puis enregistrez de nouveau.
- « N° NSS : exactement 12 chiffres. », « NIN : exactement 18 chiffres. », « N° acte de naissance : exactement 5 chiffres. », « N° pièce : exactement 9 chiffres. », « N° compte : exactement 20 chiffres. », « N° compte : doit commencer par 00799999 » : corrigez le nombre de chiffres du champ cité.
- « Date de délivrance : une date future n'est pas autorisée. » : la date de délivrance ne peut pas dépasser aujourd'hui.
- « Date d'expiration : … » : la pièce doit expirer au plus tôt demain. Une pièce expirée doit être renouvelée.
- « Documents obligatoires manquants : …. Onglet Documents. » : ce contrôle s'applique **à partir de la deuxième sauvegarde**. Importez les pièces citées dans le bloc des documents en haut de la fiche (voir 1.3), puis enregistrez.
- « Matricule déjà utilisé. » : un autre employé porte ce matricule. Fermez la fiche et recommencez avec « Nouvel employé ».
- « Création refusée (RBAC). » ou « Employé introuvable ou accès refusé. » : vos droits ne le permettent pas. Adressez-vous à votre administrateur.
- L'« Affectation » et le « Poste Occupé » de la fiche ne servent que si l'employé n'a pas de contrat. **Le chantier et le poste officiels sont ceux du contrat** (voir 1.14).
- Votre administrateur peut ajouter, masquer ou rendre obligatoires certains champs : votre fiche peut donc légèrement différer de cette description.

**Voir aussi** — 1.3 Ajouter la photo et les pièces justificatives · 1.4 Consulter le dossier administratif · 1.14 Créer ou modifier un contrat de travail · chapitre 4 (Fiche de renseignements)

---

## 1.3 Ajouter la photo et les pièces justificatives

> **Vidéo V1.3** · durée estimée 4 min · Public : ADMIN_RH et comptes autorisés sur les employés

**Où la trouver** — Fenêtre « Fiche employé » (voir 1.2) : la photo se trouve dans l'en-tête, les pièces dans le bloc des documents en haut de la fenêtre (liste « Type de document » et bouton « Importer »).

**À quoi ça sert** — Archiver les pièces du dossier du salarié (pièce d'identité, acte de naissance, attestation CNAS…). Pour certaines pièces, l'application lit le document et propose de remplir automatiquement les champs de la fiche.

**Avant de commencer**
- [ ] La fiche de l'employé est **déjà enregistrée** au moins une fois (voir 1.2).
- [ ] Les fichiers sont prêts : PDF, JPG, PNG, WEBP ou GIF, 15 Mo maximum. Pour la pièce d'identité (CNI), l'acte de naissance et l'attestation CNAS, préparez une **image** (JPG, PNG ou WEBP).

**Étapes — photo**
1. Cliquez sur l'avatar (la photo ou la silhouette) dans l'en-tête de la fiche.
2. Choisissez une image JPG, PNG ou WEBP de 5 Mo maximum.
3. Cliquez sur « Enregistrer » pour conserver la photo sur la fiche.

**Étapes — pièces justificatives**
1. Ouvrez la liste « Type de document » (« — Choisir un document — »).
   - Les types obligatoires sont suivis d'une astérisque « * ».
   - Un type déjà fourni n'apparaît plus dans la liste.
2. Cliquez sur « Importer » et choisissez le fichier.
3. Pour une pièce à lecture automatique (CNI, Acte de naissance, Attestation CNAS) :
   - une barre de progression s'affiche pendant la lecture ;
   - le panneau « Vérification — … » liste les champs proposés, chacun avec une case à cocher et une valeur modifiable ;
   - décochez les champs à ne pas reprendre, corrigez les valeurs si nécessaire, puis cliquez sur « Valider » (ou « Annuler » pour tout ignorer).
4. Cliquez sur « Enregistrer » pour enregistrer la fiche et archiver le fichier.

**Résultat** — Les pièces fournies s'affichent en pastilles vertes avec un lien « Voir ». Elles apparaissent aussi dans le dossier administratif (voir 1.4).

**Attention**
- « Enregistrez d'abord la fiche, puis importez le document. » ou « Document noté. Enregistrez la fiche pour l'archiver définitivement. » : la fiche n'a jamais été enregistrée. Le fichier n'est pas archivé. Enregistrez la fiche, fermez-la, rouvrez-la, puis importez de nouveau le document.
- « Champs appliqués. Enregistrez la fiche pour archiver le fichier. » : les valeurs lues ont été reportées dans la fiche ; cliquez sur « Enregistrer ».
- « Fichier trop volumineux (15 Mo max). » ou « Photo trop volumineuse (5 Mo max). » : réduisez la taille du fichier (scan en résolution plus basse).
- « Formats: PDF, JPG, PNG, WEBP. » ou « Formats acceptés: JPG, PNG, WEBP. » : convertissez le fichier dans un format accepté.
- « Type de document requis. · نوع الوثيقة مطلوب. » : choisissez d'abord le type dans la liste.
- Les messages qui parlent d'un « onglet Documents » désignent le bloc des documents en haut de la fiche.
- Vérifiez toujours les valeurs proposées par la lecture automatique avant de cliquer sur « Valider ».

**Voir aussi** — 1.2 Créer ou modifier une fiche employé · 1.4 Consulter le dossier administratif · chapitre 6 (Listes et codes : types de document)

---

## 1.4 Consulter le dossier administratif

> **Vidéo V1.4** · durée estimée 2 min · Public : ADMIN_RH et comptes autorisés sur les employés

**Où la trouver** — Ressources Humaines › Personnel › Employés : icône « Dossier administratif » au survol d'une ligne, ou bouton « Dossier » en vue « Tableau complet » (`/rh/employes`).

**À quoi ça sert** — Vérifier d'un coup d'œil si le dossier d'un salarié est complet : quelles pièces sont fournies, lesquelles manquent, lesquelles sont obligatoires.

**Avant de commencer**
- [ ] L'employé existe dans la liste.

**Étapes**
1. Cliquez sur « Dossier administratif » (ou « Dossier »). La fenêtre « Fichier administratif » s'ouvre, avec le matricule, le nom et le prénom.
2. Lisez les compteurs « x / y documents » et « n obligatoire(s) manquant(s) ».
3. Parcourez la liste : une ligne par type de document, avec les mentions « Obligatoire » et « Non téléversé », ou le lien « Voir » si la pièce est fournie.
4. Cliquez sur le lien « Fiche de renseignements : … » pour ouvrir la dernière fiche PDF archivée.
5. Pour ajouter une pièce manquante, cliquez sur « Ouvrir la fiche » (voir 1.3). De retour dans le dossier, cliquez sur « Actualiser ».
6. Cliquez sur « Fermer ».

**Résultat** — Vous savez quelles pièces réclamer à l'employé. Rien n'est modifié : cette fenêtre est en lecture seule.

**Attention**
- « Aucun type de document dans le référentiel. » : aucun type de pièce n'est paramétré. Adressez-vous à votre administrateur (chapitre 6, « Listes et codes »).
- Tant qu'une pièce obligatoire manque, la fiche employé ne peut plus être enregistrée après modification (voir 1.2).

**Voir aussi** — 1.3 Ajouter la photo et les pièces justificatives · 1.5 Afficher et imprimer la fiche employé

---

## 1.5 Afficher et imprimer la fiche employé

> **Vidéo V1.5** · durée estimée 2 min · Public : ADMIN_RH et comptes autorisés sur les employés

**Où la trouver** — Ressources Humaines › Personnel › Employés : cliquez sur la ligne d'un employé, ou sur « Ouvrir » en vue « Tableau complet » (`/rh/employes`). Autre accès : Documents › « Registre » › carte « Fiche de renseignements » › « Afficher la fiche » ou « Imprimer la fiche ».

**À quoi ça sert** — Voir la fiche officielle de l'employé au format A4 et l'imprimer.

**Avant de commencer**
- [ ] La fiche de l'employé est enregistrée.
- [ ] Une imprimante est installée sur votre poste.

**Étapes**
1. Cliquez sur la ligne de l'employé. L'aperçu s'ouvre : son nom en titre, « Matricule … » en sous-titre.
2. Vérifiez les informations affichées.
3. Cliquez sur « Imprimer », puis lancez l'impression dans la fenêtre du navigateur.
   - Pour corriger une information, cliquez sur « Modifier » : la fiche s'ouvre en saisie (voir 1.2).
4. Cliquez sur « Fermer ».

**Résultat** — La fiche est imprimée avec la mise en page définie dans les paramètres de la fiche.

**Attention**
- La mise en page de la fiche imprimée se règle dans les paramètres RH (chapitre 6, « Modèle de fiche »).

**Voir aussi** — 1.2 Créer ou modifier une fiche employé · chapitre 4 (Fiche de renseignements)

---

## 1.6 Activer ou désactiver un employé

> **Vidéo V1.6** · durée estimée 2 min · Public : ADMIN_RH et comptes autorisés sur les employés

**Où la trouver** — Ressources Humaines › Personnel › Employés : icône « Désactiver » / « Activer » au survol d'une ligne, ou bouton du même nom en vue « Tableau complet » (`/rh/employes`).

**À quoi ça sert** — Retirer un employé de la liste des actifs sans le supprimer, ou le remettre actif.

**Avant de commencer**
- [ ] Vos droits vous permettent de modifier les employés.
- [ ] S'il s'agit d'un départ définitif, utilisez plutôt une sortie (voir 1.26).

**Étapes**
1. Repérez l'employé dans la liste (voir 1.1).
2. Cliquez sur « Désactiver » (employé actif) ou « Activer » (employé non actif). Le changement est immédiat, sans demande de confirmation.

**Résultat** — Le statut passe de Actif à Inactif, ou de n'importe quel autre statut à Actif. La pastille de statut change aussitôt dans la liste.

**Attention**
- Ce bouton ne connaît que deux statuts : Actif et Inactif. Pour mettre un employé en Suspendu ou en Désactivé, changez le champ « Statut » dans sa fiche (voir 1.2). Un employé Suspendu sur lequel vous cliquez « Activer » redevient Actif.
- **Désactiver n'est pas une sortie.** La désactivation ne clôture pas les contrats et ne calcule pas le solde de tout compte. Pour un départ, enregistrez une sortie (voir 1.26).

**Voir aussi** — 1.2 Créer ou modifier une fiche employé · 1.26 Enregistrer une sortie et préparer le solde de tout compte

---

## 1.7 Ajouter ou masquer des colonnes de la fiche

> **Vidéo V1.7** · durée estimée 3 min · Public : ADMIN_RH et comptes autorisés sur les employés

**Où la trouver** — Ressources Humaines › Personnel › Employés › bouton « Colonnes » (`/rh/employes`). La fenêtre s'appelle « Colonnes base employés ».

**À quoi ça sert** — Ajouter à la fiche employé un champ propre à votre entreprise (par exemple « Taille de bleu de travail »), ou masquer un champ standard inutile.

**Avant de commencer**
- [ ] Vos droits vous permettent de modifier le paramétrage de la fiche.
- [ ] Pour une colonne de type « Liste », la liste de valeurs existe déjà (chapitre 6, « Listes et codes »).

**Étapes — ajouter une colonne**
1. Cliquez sur « Colonnes ».
2. Saisissez le « Libellé AR » et le « Libellé » (français).
3. Choisissez le « Type » : Texte, Date, Nombre ou Liste.
   - Pour « Liste », choisissez la liste de valeurs à utiliser.
4. Cliquez sur « Ajouter une colonne ».

**Étapes — masquer ou supprimer une colonne**
1. Dans la liste des colonnes existantes, cliquez sur « Supprimer » en face de la colonne.
   - Colonne standard : elle est seulement masquée (mention « Masqué »). Ses données sont conservées. Cliquez sur « Afficher » pour la rétablir.
   - Colonne ajoutée par votre entreprise : elle est supprimée.

**Résultat** — Message « Colonne ajoutée. » La nouvelle colonne apparaît dans la section « Extra / إضافي » de la fiche employé et dans la vue « Tableau complet (toutes les colonnes) ».

**Attention**
- « Choisissez une liste pour cette colonne. » : vous avez choisi le type « Liste » sans indiquer la liste de valeurs.
- Supprimer une colonne ajoutée par votre entreprise est définitif. En cas de doute, demandez à votre administrateur avant de cliquer.

**Voir aussi** — 1.2 Créer ou modifier une fiche employé · 1.8 Importer l'ancienne base du personnel

---

## 1.8 Importer l'ancienne base du personnel

> **Vidéo V1.8** · durée estimée 5 min · Public : ADMIN_RH et comptes autorisés sur les employés

**Où la trouver** — Ressources Humaines › Personnel › Employés › bouton « Importer l'ancienne base » (seconde ligne de la barre d'outils) (`/rh/employes`).

**À quoi ça sert** — Reprendre en une seule fois le fichier du personnel existant (Excel ou CSV). Les employés déjà présents (même matricule ou même NIN) ne sont jamais modifiés.

**Avant de commencer**
- [ ] Fichier Excel (.xlsx, seule la première feuille est lue) ou CSV, 5 Mo maximum, 3 000 lignes maximum.
- [ ] Une ligne par employé, avec une ligne d'en-tête (Matricule, Nom, Prénom…). Depuis Google Sheets : Fichier › Télécharger › Microsoft Excel (.xlsx).
- [ ] Si votre fichier contient des colonnes particulières, créez d'abord les colonnes correspondantes (voir 1.7).

**Étapes**
1. Cliquez sur « Importer l'ancienne base ».
2. Dans la zone « Choisir le fichier de l'ancienne base », sélectionnez votre fichier, puis cliquez sur « Lire le fichier ».
3. Contrôlez l'aperçu :
   - les compteurs « À importer », « Déjà présent », « Doublon », « Incomplet » ;
   - la « Ligne d'en-tête » : l'application la détecte seule ; corrigez-la si besoin (choix parmi les 15 premières lignes).
4. Vérifiez la « Correspondance des colonnes » : pour chaque colonne du fichier, choisissez le champ de la fiche à remplir, « N° (ancienne base) », ou « — Ignorer — ». L'application propose une correspondance à partir des noms usuels.
   - Si le message « Colonnes obligatoires non trouvées : … Choisissez-les ci-dessous. » apparaît, associez ces colonnes à la main.
5. Parcourez le tableau d'aperçu (300 premières lignes) : Ligne, Matricule, Nom, État, Remarques. « auto » dans la colonne Matricule signifie que le matricule sera attribué automatiquement.
6. Cliquez sur « Importer N employé(s) ». (« Retour » permet de revenir à l'étape précédente.)
7. Attendez la fin de l'import : la progression « Import en cours… x / y » s'affiche.

**Résultat** — Bilan « N employé(s) créé(s) » et « N refusé(s) », avec le détail « Ligne n » et la raison de chaque refus. Les employés créés portent la mention « importée de l'ancienne base » avec leur numéro d'origine.

**Attention**
- Matricule absent : il est attribué automatiquement (remarque « Matricule absent : attribué automatiquement »).
- Date, nombre ou statut non reconnu : un avertissement s'affiche. Les statuts reconnus sont les mots usuels : actif, en poste, inactif, sorti, démission, licencié, suspendu…
- Valeur absente d'une liste de choix (par exemple une wilaya mal orthographiée) : elle est ignorée. Pour les colonnes ajoutées par votre entreprise, la valeur est conservée telle quelle.
- Valeur au mauvais format (NSS, NIN…) : elle est ignorée, avec un avertissement. Corrigez ensuite la fiche à la main (voir 1.2).
- L'import ne crée pas la fiche de renseignements PDF. Elle sera créée au premier enregistrement de chaque fiche.

**Voir aussi** — 1.2 Créer ou modifier une fiche employé · 1.7 Ajouter ou masquer des colonnes de la fiche · 1.22 Importer des contrats depuis Excel

---

## 1.9 Importer les postes depuis les contrats

> **Vidéo V1.9** · durée estimée 2 min · Public : SUPER_ADMIN, ADMIN_RH, GERANT

**Où la trouver** — Ressources Humaines › Personnel › « Postes & grille » › bouton « Importer depuis les contrats » (`/rh/postes`).

**À quoi ça sert** — Démarrer la liste des postes à partir des intitulés déjà saisis dans les contrats existants, sans tout ressaisir.

**Avant de commencer**
- [ ] Des contrats existent déjà (par exemple après un import, voir 1.22).
- [ ] Vous avez le rôle SUPER_ADMIN, ADMIN_RH ou GERANT.

**Étapes**
1. Ouvrez « Postes & grille ».
2. Cliquez sur « Importer depuis les contrats ».

**Résultat** — Un poste est créé pour chaque intitulé différent trouvé dans les contrats qui n'étaient rattachés à aucun poste. Ces contrats sont ensuite rattachés au poste créé. Message : « N poste(s) créé(s), M contrat(s) rattaché(s). »

**Attention**
- Deux orthographes différentes d'un même métier (par exemple « SOUDEUR » et « SOUDEUR QUALIFIE ») donnent deux postes. Corrigez ensuite les intitulés (voir 1.10).
- Si la liste est vide, l'écran affiche « Aucun poste. Utilisez « Importer depuis les contrats » pour démarrer. »

**Voir aussi** — 1.10 Créer ou modifier un poste · 1.11 Gérer la grille salariale d'un poste

---

## 1.10 Créer ou modifier un poste

> **Vidéo V1.10** · durée estimée 3 min · Public : SUPER_ADMIN, ADMIN_RH, GERANT

**Où la trouver** — Ressources Humaines › Personnel › « Postes & grille » › bouton « Nouveau poste », ou « Modifier » sur la ligne d'un poste (`/rh/postes`).

**À quoi ça sert** — Tenir la liste officielle des postes. Le contrat reprend l'intitulé du poste et propose le salaire de la grille.

**Avant de commencer**
- [ ] Vous avez le rôle SUPER_ADMIN, ADMIN_RH ou GERANT.

**Étapes**
1. Cliquez sur « Nouveau poste » (fenêtre « Nouveau poste ») ou sur « Modifier » (fenêtre « Modifier le poste »).
2. Renseignez :
   - « Code » (obligatoire) : 2 à 20 caractères parmi A-Z, 0-9, « _ » et « - ». Il est mis en majuscules automatiquement. Exemple : SOUD-01.
   - « Catégorie » (obligatoire) : Exécution, Maîtrise, Cadre ou Direction. Par défaut : Exécution.
   - « Intitulé (FR) » (obligatoire) : 2 caractères minimum.
   - « التسمية بالعربية » : l'intitulé en arabe.
   - « Qualification (code) » : facultatif.
   - « Ordre » : de 0 à 9999, pour classer les postes dans les listes.
   - « Actif » : cochée par défaut.
3. Cliquez sur « Enregistrer ».

**Résultat** — Le poste apparaît dans le tableau et dans la liste « Poste (référentiel) » de la fiche contrat (voir 1.14).

**Attention**
- En modification, la note « L'intitulé est recopié sur les contrats ouverts rattachés à ce poste. » vous prévient : changer l'intitulé change aussi celui des contrats en Brouillon, Actif ou Suspendu rattachés à ce poste.
- « Code : 2 à 20 caractères A-Z, 0-9, _ ou - » : retirez les espaces et les caractères accentués du code.
- « Le code … existe déjà. » : choisissez un autre code.
- « Libellé requis · التسمية مطلوبة » : saisissez l'intitulé français.
- Un poste décoché « Actif » n'est plus proposé dans les nouveaux contrats ; il s'affiche avec la pastille « Inactif ».

**Voir aussi** — 1.11 Gérer la grille salariale d'un poste · 1.12 Supprimer un poste · 1.14 Créer ou modifier un contrat de travail

---

## 1.11 Gérer la grille salariale d'un poste

> **Vidéo V1.11** · durée estimée 4 min · Public : SUPER_ADMIN, ADMIN_RH, GERANT

**Où la trouver** — Ressources Humaines › Personnel › « Postes & grille » › bouton « Grille » sur la ligne du poste (`/rh/postes`).

**À quoi ça sert** — Fixer le salaire de base mensuel (et un net de référence) de chaque grade d'un poste, avec une date d'effet. Le contrat propose ce salaire et la paie signale tout salaire inférieur à la grille.

**Avant de commencer**
- [ ] Le poste existe (voir 1.10).
- [ ] Vous avez le rôle SUPER_ADMIN, ADMIN_RH ou GERANT.

**Étapes**
1. Cliquez sur « Grille ». Le tableau de la grille se déplie sous le poste : Grade, Base mensuelle, Net de référence, En vigueur au, Note.
2. Dans le formulaire sous le tableau, renseignez :
   - « Grade » : 1 à 6 caractères (A, B, 1, 2…). Par défaut : A.
   - « Base » (obligatoire) : salaire de base mensuel en DA, supérieur à 0.
   - « Net réf. » : facultatif.
   - « En vigueur au » : date d'effet ; par défaut, aujourd'hui.
   - « Note » : facultatif.
3. Cliquez sur « Ajouter ».
4. Pour retirer une ligne, cliquez sur « Supprimer » et confirmez « Supprimer cette ligne de grille ? ».
5. Cliquez sur « Fermer la grille ».

**Résultat** — La ligne est ajoutée. La colonne « Grille en vigueur » affiche, pour chaque grade, le salaire actuellement applicable sous la forme « grade : salaire de base ».

Exemple : pour le poste Soudeur, grade A, vous saisissez 40 000 DA en vigueur au 01/01/2026, puis 43 000 DA en vigueur au 01/07/2026. Jusqu'au 30 juin, « Grille en vigueur » affiche « A : 40 000 » ; à partir du 1er juillet, elle affiche « A : 43 000 ».

**Attention**
- Le bouton « Ajouter » reste grisé tant que la base vaut 0 (message « Salaire de base requis »).
- « Grade : 1 à 6 caractères (A, B, 1, 2…) » : raccourcissez le grade.
- Saisir de nouveau le même grade avec la même date d'effet **remplace** la ligne existante. Pour une augmentation, utilisez une nouvelle date d'effet : l'historique reste ainsi lisible.

**Voir aussi** — 1.10 Créer ou modifier un poste · 1.14 Créer ou modifier un contrat de travail (bouton « Appliquer » de la grille) · chapitre 3 (Paie)

---

## 1.12 Supprimer un poste

> **Vidéo V1.12** · durée estimée 2 min · Public : SUPER_ADMIN, ADMIN_RH, GERANT

**Où la trouver** — Ressources Humaines › Personnel › « Postes & grille » › bouton « Supprimer » sur la ligne du poste (`/rh/postes`).

**À quoi ça sert** — Retirer un poste créé par erreur et jamais utilisé.

**Avant de commencer**
- [ ] Le poste n'est rattaché à aucun contrat (colonne « Contrats » à zéro).

**Étapes**
1. Repérez le poste dans le tableau (recherche « Rechercher un poste… »).
2. Cliquez sur « Supprimer ».
3. Confirmez « Supprimer le poste … ? ».

**Résultat** — Le poste disparaît du tableau et des listes de choix.

**Attention**
- Le bouton « Supprimer » n'apparaît que pour un poste sans contrat.
- « Poste utilisé par N contrat(s) : désactivez-le plutôt. » : le poste sert déjà. Ouvrez-le avec « Modifier » et décochez « Actif » (voir 1.10).

**Voir aussi** — 1.10 Créer ou modifier un poste

---

## 1.13 Consulter le registre des contrats

> **Vidéo V1.13** · durée estimée 3 min · Public : ADMIN_RH et comptes autorisés sur les contrats

**Où la trouver** — Ressources Humaines › Documents › « Registre » › carte « Contrat de travail » (`/rh/documents?onglet=contrats`). Les alertes « Fin de contrat », « Contrats à finaliser » et « Employés sans contrat » du tableau de bord RH mènent au même registre.

**À quoi ça sert** — Retrouver un contrat, voir son affectation, son type, son net chantier et son statut, puis l'afficher, le modifier, l'imprimer ou ouvrir son PDF archivé.

**Avant de commencer**
- [ ] Vos droits vous permettent de consulter les contrats des chantiers concernés.

**Étapes**
1. Ouvrez Documents › « Registre », puis cliquez sur la carte « Contrat de travail ». Le message « Chargement du registre… » s'affiche quelques instants.
2. Tapez un texte dans « Employé, matricule, affectation… ».
3. Triez en cliquant sur un en-tête de colonne. Choisissez les colonnes visibles avec le menu « Colonnes » (« Colonnes affichées »).
4. Sur la ligne d'un contrat :
   - « Afficher » : ouvre le contrat au format A4 en lecture seule (titre « matricule · nom », sous-titre « chantier · type · statut »), avec les boutons « Fermer », « Modifier », « Imprimer » ;
   - « Modifier » : ouvre la fiche contrat (voir 1.14) ;
   - « Imprimer » : ouvre la fenêtre d'impression (voir 1.19) ;
   - « PDF archivé » : ouvre le dernier PDF archivé du contrat (affiché seulement s'il existe).

**Résultat** — Vous retrouvez le contrat recherché et son statut : Brouillon, Actif, Suspendu ou Clôturé.

**Attention**
- À l'ouverture du registre, l'application met à jour automatiquement les changements d'affectation programmés dont la date est arrivée.
- La colonne « Type » affiche le code du type de contrat (par exemple CDD).
- **Un contrat en Brouillon entre aussi dans la paie.** Ne laissez pas traîner de brouillons erronés.

**Voir aussi** — 1.14 Créer ou modifier un contrat de travail · 1.19 Imprimer et archiver le contrat · chapitre 4 (Registres)

---

## 1.14 Créer ou modifier un contrat de travail

> **Vidéo V1.14** · durée estimée 6 min · Public : ADMIN_RH et comptes autorisés sur les contrats

**Où la trouver** — Ressources Humaines › Documents › « Registre » › carte « Contrat de travail » › bouton « Nouveau contrat », ou « Modifier » sur la ligne d'un contrat (`/rh/documents?onglet=contrats`).

**À quoi ça sert** — Définir où travaille le salarié (chantier et activité), à quel poste, sous quel type de contrat et pour quelle période. Cette fiche décrit les deux premières sections et l'enregistrement. La rémunération, les cotisations et les rubriques sont décrites en 1.15, 1.16 et 1.17.

**Avant de commencer**
- [ ] La fiche de l'employé existe (voir 1.2).
- [ ] Le chantier existe et porte un code d'activité.
- [ ] Le poste existe dans « Postes & grille » (voir 1.10), de préférence avec sa grille (voir 1.11).
- [ ] Pour un intérimaire, l'agence d'intérim existe (voir 1.23).
- [ ] Vos droits vous permettent de modifier les contrats de ce chantier.

**Étapes**
1. Cliquez sur « Nouveau contrat ». La fenêtre « Nouveau contrat de travail » s'ouvre. À droite, l'« Aperçu du contrat » se met à jour pendant la saisie (« Masquer l'aperçu » / « Afficher l'aperçu » en bas de la fenêtre).
2. Section « Employé, affectation et poste » :
   - « Employé » (obligatoire) : cliquez sur « Choisir l'employé… » et tapez un matricule, un nom ou un prénom dans « Matricule, nom ou prénom… ».
   - « Affectation » (obligatoire) : choisissez le chantier. Son activité est remplie automatiquement.
   - « Activité » (obligatoire) : vérifiez le code d'activité proposé (« code · libellé »).
   - « Affectation principale » : activé par défaut. Laissez-le activé pour le contrat principal de l'employé (voir 1.18).
   - « Poste » : choisissez le poste dans la liste ; les intitulés français et arabe se remplissent.
   - « Poste (référentiel) » et « Grade / échelon » : choisissez le poste et le grade. L'indication « Grille : X DA » affiche le salaire de la grille ; cliquez sur « Appliquer » pour recopier la base et le net de la grille dans la rémunération. « Pas de grille pour ce grade » signifie qu'aucun salaire n'est défini pour ce grade.
   - « Intitulé (français) » et « Intitulé (arabe) » : modifiables si besoin.
3. Section « Contrat » :
   - « Type de contrat » : CDI, CDD, CDD Chantier, Intérim (mise à disposition)… selon votre paramétrage.
   - « Régime de travail » : Administration, 4x4, Familial… selon votre paramétrage.
   - Pour un intérimaire uniquement : « Agence d'intérim » (obligatoire) et « Taux journalier facturé » (vide = taux de l'agence).
   - « Début (1er du mois) » (obligatoire) : toujours le 1er d'un mois. Exemple : 01/03/2026.
   - « Fin » : vide = durée indéterminée.
   - « Statut » : Brouillon (par défaut), Actif, Suspendu ou Clôturé.
4. Complétez la rémunération, les cotisations et les rubriques (voir 1.15, 1.16, 1.17).
5. Cliquez sur « Enregistrer ». Ou cliquez sur « Aperçu et impression » pour enregistrer puis ouvrir directement l'impression (voir 1.19).

**Pour modifier un contrat** — Cliquez sur « Modifier » dans le registre. La fenêtre « Contrat de travail » affiche le matricule, le nom, le chantier et le statut. Corrigez les champs, puis cliquez sur « Enregistrer ».

**Résultat** — Message « Contrat enregistré. » Le contrat apparaît dans le registre avec son statut. Un complément vous informe de l'effet sur la paie :
- « Les bulletins seront calculés à la génération de la paie, sur décision. » : la paie du mois n'existe pas encore ; elle sera générée après la décision D4 (Génération de paie).
- « N paie(s) brouillon signalée(s) « données modifiées depuis le calcul »… » : une paie déjà calculée est concernée. Un recalcul doit être décidé dans le Centre de décisions, décision D3 (Recalcul des paies brouillon).
- « Aucune paie n'a été créée : la génération est soumise à décision » : idem, la génération attend une décision.

**Attention**
- L'enregistrement ne recalcule jamais la paie : il la signale. Suivez le Centre de décisions (chapitre 6).
- **Le chantier d'un contrat ne se modifie pas après sa création.** En modification, l'« Affectation » est grisée (« Affectation en vigueur : elle ne se modifie pas depuis le contrat. »). Si le chantier a été saisi par erreur, adressez-vous à votre administrateur : une correction relève de la décision D8 (Correction d'une affectation). Pour un vrai changement de chantier, voir 1.18.
- « Un contrat commence le 1er du mois : aucun contrat ne débute en milieu de mois. … » : corrigez la date de début au 1er du mois.
- « Choisissez l'employé. », « Choisissez l'affectation. », « Date de début obligatoire. » : complétez le champ cité.
- « Activité vide. Choisissez-la, ou renseignez-la sur la fiche chantier. » : choisissez l'activité, ou faites compléter la fiche du chantier.
- « Aucun code d'activité : ajoutez-en dans Référentiels › Codes d'activité. » : aucun code d'activité n'existe. Adressez-vous à votre administrateur.
- « Contrat d'intérim : choisissez l'agence. » : pour le type Intérim, l'agence est obligatoire.
- « Contrat principal déjà ouvert (début jj/mm/aaaa). » : l'employé a déjà un contrat principal en cours. Voir 1.18, ou cliquez sur « Ouvrir ce contrat » pour le modifier.
- « Chargement des choix IRG / CACOBATPH en cours… » : patientez un instant puis cliquez de nouveau sur « Enregistrer ».
- « Le serveur n'a pas répondu. Rechargez la page… » : rechargez la page et vérifiez dans le registre si le contrat a été enregistré avant de recommencer.
- Seul SUPER_ADMIN peut ajouter un régime de travail (bouton « + », « Nouveau régime (ex. 4/4, 6/2…) ») ou en retirer un (corbeille). Messages : « Ce régime existe déjà. », « Libellé du régime obligatoire. », « Régime utilisé par des contrats : il est archivé et n'est plus proposé. »

**Voir aussi** — 1.15 Renseigner la rémunération et les cotisations du contrat · 1.16 Choisir les rubriques de salaire du contrat · 1.18 Remplacer le contrat principal d'un employé · 1.19 Imprimer et archiver le contrat

---

## 1.15 Renseigner la rémunération et les cotisations du contrat

> **Vidéo V1.15** · durée estimée 5 min · Public : ADMIN_RH et comptes autorisés sur les contrats (IRG et CACOBATPH : droit « Cotisations & impôts »)

**Où la trouver** — Fiche contrat (voir 1.14) › sections « Rémunération » et « Cotisations et impôts ».

**À quoi ça sert** — Fixer les montants mensuels du contrat et le régime de cotisations et d'impôt appliqué au salarié.

**Avant de commencer**
- [ ] La fiche contrat est ouverte, avec l'employé et l'affectation choisis.
- [ ] Pour modifier l'IRG et le CACOBATPH, vous avez le droit « Cotisations & impôts » (en général SUPER_ADMIN, ADMIN_RH, ADMIN_FINANCE).

**Étapes — section « Rémunération »** (montants en DA)
1. « Salaire de base » : montant mensuel. Vide = 0. Le bouton « Appliquer » de la grille (voir 1.14) le remplit automatiquement.
2. « Net chantier » : net mensuel de référence du chantier.
3. « Net récupération » : montant de récupération.
4. « Retenue / jour d'absence » : montant retenu par jour d'absence non justifiée. Il est imprimé dans le contrat. Exemple : 1 500.

**Étapes — section « Cotisations et impôts »**
1. « CNAS » : laissez « Automatique (fiche employé) », ou choisissez un régime dans le tableau (Code, Régime, Salarié, Patronal, Œuvres soc.). Les taux retenus s'affichent en vignettes sous le champ.
2. « IRG » : laissez l'option « Automatique », ou choisissez :
   - « Barème général » ;
   - « Zone Sud / Extrême Sud », puis la zone ;
   - « Handicapé / retraité » ;
   - « Exonération totale : 0 % » ;
   - « Taux libératoire », puis 10 % ou 15 %. Cette option n'apparaît que si le type de contrat l'autorise.
3. « CACOBATPH » (affiché seulement si l'activité du chantier y est soumise) : « Automatique (selon l'activité) », « Congés payés + intempéries », « Congés payés seulement », « Intempéries seulement » ou « Non assujetti ».
4. Vérifiez les taux affichés sous chaque champ, puis enregistrez le contrat.

**Résultat** — Les montants sont enregistrés sur le contrat. Les choix IRG et CACOBATPH sont enregistrés comme des réglages datés, avec le motif « Choix de la fiche contrat » :
- nouveau contrat : ils s'appliquent dès la date de début du contrat ;
- contrat existant : ils s'appliquent au 1er du mois en cours (ou à la date de début du contrat si elle est plus tardive).

Exemple : le 15 avril 2026, vous passez un contrat commencé le 01/01/2026 en « Zone Sud / Extrême Sud ». Le nouveau choix s'applique à partir du 01/04/2026 ; janvier à mars restent au régime précédent.

**Attention**
- « Réservé aux droits « Cotisations & impôts » » : IRG et CACOBATPH sont verrouillés pour votre compte. Demandez à un utilisateur autorisé.
- « Retenue / jour d'absence : saisissez un montant en DA. » : saisissez un nombre (jusqu'à 9 chiffres et 2 décimales), sans lettres.
- « Contrat enregistré, mais IRG / CACOBATPH non appliqué : … » : le contrat est enregistré mais pas le choix d'impôt ou de cotisation. Lisez la raison affichée et corrigez-la.
- « Contrat enregistré, … la retenue / jour d'absence ne l'a pas été… » : ressaisissez la retenue et enregistrez de nouveau.
- « Taux de ce régime non renseignés dans les paramètres. » : les taux du régime CNAS manquent dans les paramètres (chapitre 5, Cotisations et impôts).

**Voir aussi** — 1.14 Créer ou modifier un contrat de travail · 1.16 Choisir les rubriques de salaire du contrat · chapitre 5 (Cotisations et impôts)

---

## 1.16 Choisir les rubriques de salaire du contrat

> **Vidéo V1.16** · durée estimée 5 min · Public : SUPER_ADMIN, ADMIN_RH, GERANT

**Où la trouver** — Fiche contrat (voir 1.14) › section « Rubriques de salaire ».

**À quoi ça sert** — Attacher au contrat les primes, indemnités et retenues qui seront calculées sur le bulletin de paie, avec leur mode de calcul et leur valeur.

**Avant de commencer**
- [ ] La fiche contrat est ouverte.
- [ ] Vous avez le rôle SUPER_ADMIN, ADMIN_RH ou GERANT.
- [ ] Les rubriques existent dans les paramètres RH (chapitre 6, « Rubriques de salaire »).

**Étapes**
1. Cliquez sur « Choisir les rubriques… ». Les rubriques sont rangées par classe :
   - CLASSE 1 — CNAS + IRG : soumise aux cotisations et à l'impôt ;
   - CLASSE 2 — CNAS seulement ;
   - CLASSE 3 — IRG seulement ;
   - CLASSE 4 — Ni CNAS ni IRG : versée telle quelle ;
   - CLASSE 5 — RETENUE DE GARANTIE.
2. Survolez une classe et cochez les rubriques voulues. Un compteur indique le nombre de rubriques cochées par classe.
3. Pour chaque rubrique choisie, réglez le mode et la valeur :
   - « Pourcentage *% » : pourcentage du salaire de base. Exemple : 10 % d'une base de 40 000 DA = 4 000 DA.
   - « Montant /F » : montant fixe versé une fois par mois, quel que soit le nombre de jours. Exemple : 3 000 DA = 3 000 DA.
   - « Journalier *J » : montant par jour payé du mois, récupération exclue. Exemple : 200 DA pour un mois de 31 jours entièrement payé = 31 × 200 = 6 200 DA.
   - « Mensuel ÷ jours du mois » : montant mensuel proratisé sur les jours travaillés. Exemple : 6 000 DA, mois de 30 jours, 20 jours travaillés = 6 000 ÷ 30 × 20 = 4 000 DA ; mois complet = 6 000 DA.
4. Lisez l'aide « Bulletin : … » sous chaque ligne : elle explique le calcul qui sera fait.
5. Pour retirer une rubrique, cliquez sur la croix « Retirer » de la ligne.
6. Enregistrez le contrat.

**Résultat** — Les rubriques sont enregistrées et seront reprises au prochain calcul de paie.

**Attention**
- Pour un nouveau contrat, les rubriques actives qui ont un montant par défaut sont déjà cochées. Vérifiez-les.
- Les rubriques propres au chantier ne sont pas proposées ici : elles s'appliquent automatiquement par le chantier.
- Ordre de priorité quand une même rubrique est définie à plusieurs endroits : employé, puis contrat, puis poste, puis chantier.
- Classe 5 : saisissez le montant en positif ; il est déduit du net sur le bulletin. Dans les classes 1 à 4, un montant négatif est refusé : « Montant négatif accepté seulement en classe 5 (retenues). … »
- Certaines rubriques sont rattachées à l'employé lui-même plutôt qu'au contrat. À chaque enregistrement d'un contrat, ces rubriques sont remplacées par celles affichées dans ce contrat. Si l'employé a plusieurs contrats, vérifiez les rubriques avant d'enregistrer.
- « Contrat enregistré, mais les rubriques de salaire ne l'ont pas été… » : le contrat est enregistré sans les rubriques (souvent faute de rôle SUPER_ADMIN, ADMIN_RH ou GERANT). Faites compléter par un utilisateur autorisé.
- « Paie brouillon non signalée… » : la paie déjà calculée n'a pas pu être marquée comme à recalculer. Prévenez le responsable de la paie.

**Voir aussi** — 1.17 Définir les rubriques de récupération (CRP) · 1.15 Renseigner la rémunération et les cotisations du contrat · chapitre 3 (Paie) · chapitre 6 (Rubriques de salaire)

---

## 1.17 Définir les rubriques de récupération (CRP)

> **Vidéo V1.17** · durée estimée 3 min · Public : SUPER_ADMIN, ADMIN_RH, GERANT

**Où la trouver** — Fiche contrat (voir 1.14) › section « Rubriques de récupération (CRP) · بنود العطلة التعويضية », sous la section « Rubriques de salaire ».

**À quoi ça sert** — Définir ce qui est payé en plus du salaire de base pendant les jours de récupération (jours pointés CRP), par exemple pour un régime 4x4.

**Avant de commencer**
- [ ] La fiche contrat est ouverte.
- [ ] Vous avez le rôle SUPER_ADMIN, ADMIN_RH ou GERANT.
- [ ] Les jours de récupération sont pointés avec le code CRP (chapitre 2).

**Étapes**
1. Cliquez sur « Choisir les rubriques… » dans la section « Rubriques de récupération (CRP) ».
2. Cochez les rubriques à payer sur les jours de récupération (même rangement par classe qu'en 1.16).
3. Réglez le mode et la valeur de chaque ligne. L'aide « Bulletin : … » change selon le mode :
   - Pourcentage : « % du salaire de base × jours de récupération ÷ jours du mois ». Exemple : 20 % d'une base de 45 000 DA, 15 jours CRP, mois de 30 jours = 45 000 × 20 % × 15 ÷ 30 = 4 500 DA.
   - Mensuel : « DA ÷ jours du mois × jours CRP ». Exemple : 9 000 DA ÷ 30 × 15 = 4 500 DA.
   - Journalier : « DA × jours CRP ». Exemple : 300 DA × 15 = 4 500 DA.
4. Enregistrez le contrat.

**Résultat** — Les rubriques de récupération sont enregistrées. Elles sont payées uniquement sur les jours pointés CRP.

**Attention**
- Les rubriques de la section « Rubriques de salaire » ne s'appliquent pas aux jours de récupération ; le salaire de base, lui, reste dû.
- « Aucune rubrique de récupération : les jours CRP ne reçoivent que le salaire de base. » : c'est normal si vous n'avez rien choisi.
- Rien n'est versé si aucun jour CRP n'est pointé dans le mois.

**Voir aussi** — 1.16 Choisir les rubriques de salaire du contrat · chapitre 2 (pointage et codes de présence) · chapitre 3 (Paie)

---

## 1.18 Remplacer le contrat principal d'un employé

> **Vidéo V1.18** · durée estimée 3 min · Public : ADMIN_RH et comptes autorisés sur les contrats

**Où la trouver** — Fiche contrat (voir 1.14) › interrupteur « Affectation principale » (section « Employé, affectation et poste »).

**À quoi ça sert** — Un employé ne peut avoir qu'**un seul contrat principal ouvert** sur une même période. Cette fiche explique comment établir un nouveau contrat principal (renouvellement, nouveau poste, nouveau chantier) et ce que devient l'ancien.

**Avant de commencer**
- [ ] Vous connaissez la date de début du nouveau contrat (toujours un 1er du mois).
- [ ] Vous avez vérifié l'ancien contrat dans le registre (voir 1.13).

**Étapes**
1. Cliquez sur « Nouveau contrat » et choisissez l'employé. Le message « Contrat principal déjà ouvert (début jj/mm/aaaa). » s'affiche avec le lien « Ouvrir ce contrat ».
2. Pour remplacer l'ancien contrat : laissez « Affectation principale » activé et saisissez une date de début **postérieure** au début de l'ancien contrat.
3. Pour un contrat secondaire qui s'ajoute au contrat principal : désactivez « Affectation principale ».
4. Complétez le contrat (voir 1.14 à 1.17) et cliquez sur « Enregistrer ».

**Résultat** — Si l'ancien contrat principal a commencé avant le nouveau, il est **clôturé automatiquement la veille** du début du nouveau. Message : « Contrat enregistré. L'ancien contrat principal a été clôturé la veille. »

Exemple : l'ancien contrat principal a commencé le 01/01/2026 sur le chantier A. Vous créez un contrat principal sur le chantier B au 01/07/2026. L'ancien contrat reçoit la date de fin 30/06/2026 et passe au statut Clôturé.

**Attention**
- « Ce salarié a déjà un contrat principal ouvert (début …). Fermez cette fenêtre et ouvrez-le avec « Modifier »…, ou décochez « Affectation principale » » : le nouveau contrat commence le même jour que l'ancien, ou avant. Modifiez l'ancien contrat au lieu d'en créer un autre, ou créez un contrat secondaire.
- La règle s'applique aux contrats en Brouillon, Actif ou Suspendu.
- L'import Excel ne clôture jamais un contrat existant (voir 1.22).

**Voir aussi** — 1.14 Créer ou modifier un contrat de travail · 1.13 Consulter le registre des contrats

---

## 1.19 Imprimer et archiver le contrat

> **Vidéo V1.19** · durée estimée 4 min · Public : ADMIN_RH et comptes autorisés sur les contrats

**Où la trouver** — Registre des contrats › « Imprimer » sur la ligne du contrat, ou bouton « Aperçu et impression » de la fiche contrat (`/rh/documents?onglet=contrats`). La fenêtre s'appelle « Imprimer le contrat de travail ».

**À quoi ça sert** — Produire le contrat officiel en arabe, numéroté, prêt à signer, et l'archiver en PDF.

**Avant de commencer**
- [ ] Le contrat est enregistré (voir 1.14).
- [ ] Les champs arabes de la fiche employé sont remplis (nom, prénom, lieu de naissance…) : c'est la meilleure source pour le contrat.

**Étapes**
1. Cliquez sur « Imprimer ». La fenêtre est pré-remplie depuis la fiche employé et le contrat.
2. Si le message « Champs vides : … » apparaît, complétez les champs cités.
3. Vérifiez ou corrigez :
   - « Type · النوع » : CDD (عقد عمل محدد المدة) ou CDI (عقد عمل غير محدد المدة) ;
   - « Motif CDD (art. 12 loi 90-11) · سبب التوظيف » : 5 motifs au choix ; par défaut, le motif n° 5 ;
   - « N° du contrat » : laissez vide pour une numérotation automatique (année/NNN) ;
   - l'identité, l'état civil, la pièce d'identité et l'adresse ;
   - le poste, le début et la fin (la fin est masquée pour un CDI) ;
   - la période d'essai (par défaut « شهرا واحدا ») et le préavis (par défaut « ثلاثة أشهر ») ;
   - les montants : net à payer, indemnité de récupération, retenue par jour d'absence (en DA).
4. Cliquez sur « Enregistrer et imprimer ».
5. Lancez l'impression dans la fenêtre du navigateur.

**Résultat**
- Vos corrections sont gardées pour ce contrat uniquement ; la fiche employé n'est pas modifiée.
- Un numéro de contrat (par exemple 2026/014) est attribué si le champ était vide.
- Le contrat est archivé en PDF : « Archivage du contrat en PDF… », puis « Contrat archivé en PDF. Ouvrir le PDF ». Le lien « PDF archivé » apparaît dans le registre.

**Attention**
- « Le numéro … est déjà utilisé. » : videz le champ « N° du contrat » pour obtenir un numéro libre.
- « Contrat enregistré, archive PDF non créée : … » : le contrat est imprimé mais pas archivé. Relancez « Imprimer » plus tard.
- Pour une correction durable (nom arabe, date de naissance…), corrigez plutôt la fiche employé (voir 1.2), comme le rappelle le bandeau de la fenêtre.

**Voir aussi** — 1.20 Modifier le modèle du contrat (articles) · 1.13 Consulter le registre des contrats · chapitre 4 (Registres)

---

## 1.20 Modifier le modèle du contrat (articles)

> **Vidéo V1.20** · durée estimée 4 min · Public : SUPER_ADMIN, ADMIN_RH, GERANT

**Où la trouver** — Fenêtre « Imprimer le contrat de travail » (voir 1.19) › bouton « Modifier le modèle (articles) ». La fenêtre s'appelle « Modèle du contrat de travail ».

**À quoi ça sert** — Adapter le texte imprimé de tous les contrats : titres, préambule, articles, signatures. Le texte d'origine s'appuie sur la loi 90-11.

**Avant de commencer**
- [ ] Vous avez le rôle SUPER_ADMIN, ADMIN_RH ou GERANT.
- [ ] Le nouveau texte a été validé par la direction : **le modèle est commun à tous les contrats**.

**Étapes**
1. Cliquez sur « Modifier le modèle (articles) ».
2. Modifiez les blocs : titre CDD / CDI, préambule légal, phrase d'ouverture CDD / CDI, bloc « L'employeur », introduction de l'article 2 (CDD) et motifs, remarque, phrase finale, signatures employé / employeur, nombre d'exemplaires.
3. Pour les articles :
   - cochez « CDD seulement » si l'article ne doit apparaître que dans les CDD ;
   - « Supprimer » retire un article ; « Ajouter un article » en crée un nouveau.
4. Utilisez les variables pour insérer les valeurs du contrat : {essai}, {preavis}, {net}, {net_lettres}, {recup}, {recup_lettres}, {retenue}, {retenue_lettres}. Encadrez un texte de deux astérisques de chaque côté (\*\*texte\*\*) pour l'imprimer en gras.
   - Exemple : « يتقاضى العامل أجرا صافيا قدره {net} دج ({net_lettres}) » imprime le montant en chiffres puis en lettres.
5. Cliquez sur « Enregistrer le modèle ».

**Résultat** — Les prochains contrats imprimés utilisent le nouveau texte.

**Attention**
- « Texte d'origine » remet le texte par défaut, après confirmation. Vos modifications sont alors perdues.
- Écrivez les variables exactement comme dans la liste ci-dessus, accolades comprises. Faites un essai d'impression après chaque modification.
- Le bloc employeur par défaut indique Hassi Messaoud : vérifiez-le.

**Voir aussi** — 1.19 Imprimer et archiver le contrat

---

## 1.21 Importer un contrat PDF lu par l'IA

> **Vidéo V1.21** · durée estimée 4 min · Public : ADMIN_RH et comptes autorisés sur les contrats

**Où la trouver** — Registre des contrats › bouton « Contrat PDF » (`/rh/documents?onglet=contrats`). La fenêtre s'appelle « Importer un contrat PDF · استيراد عقد PDF ».

**À quoi ça sert** — Saisir un contrat signé existant à partir de son scan : l'IA remplit la fiche contrat, vous vérifiez avant d'enregistrer. Le scan est archivé avec le contrat.

**Avant de commencer**
- [ ] La fiche de l'employé existe (voir 1.2).
- [ ] Le scan est un PDF ou une photo (JPG, PNG, WEBP) de 14 Mo maximum, avec **une seule personne par fichier**.
- [ ] La lecture IA est configurée dans votre application.

**Étapes**
1. Cliquez sur « Contrat PDF ».
2. Choisissez le fichier, puis cliquez sur « Lire le contrat ». Patientez : « Envoi du fichier… », puis « Lecture du contrat par l'IA… (jusqu'à une minute) ».
3. La fiche contrat s'ouvre pré-remplie, au statut Actif, avec le bandeau « Lu par l'IA depuis « … » — vérifiez chaque champ avant d'enregistrer ».
4. Lisez les avertissements affichés et vérifiez **chaque champ** : employé, chantier, dates, net, retenue, rubriques (voir 1.14 à 1.17).
5. Cliquez sur « Enregistrer ».

**Résultat** — Le contrat est créé et le scan est archivé comme PDF du contrat (lien « PDF archivé » dans le registre).

**Attention**
- Employé non identifié : l'application propose une liste de noms proches ; choisissez le bon employé. « Employé introuvable : créez d'abord sa fiche… » : créez la fiche (voir 1.2), puis recommencez.
- L'employé est reconnu grâce à la date de naissance, au nom arabe ou latin, au nom du fichier et au numéro de série comparé au matricule. Nommer le fichier avec le nom de l'employé aide la reconnaissance.
- Date de début ramenée au 1er du mois, ou non lue : vérifiez la date.
- Chantier non lu, net non lu, « Vérifiez la retenue… » : complétez ces champs à la main.
- « Lecture IA non configurée… » : la fonction n'est pas disponible. Adressez-vous à votre administrateur, ou saisissez le contrat à la main (voir 1.14).

**Voir aussi** — 1.14 Créer ou modifier un contrat de travail · 1.22 Importer des contrats depuis Excel

---

## 1.22 Importer des contrats depuis Excel

> **Vidéo V1.22** · durée estimée 5 min · Public : ADMIN_RH et comptes autorisés sur les contrats

**Où la trouver** — Registre des contrats › bouton « Importer des contrats » (`/rh/documents?onglet=contrats`).

**À quoi ça sert** — Créer en une fois les contrats de nombreux employés à partir d'un fichier Excel ou CSV (une ligne par contrat). Les contrats déjà enregistrés ne sont jamais modifiés.

**Avant de commencer**
- [ ] Les fiches employés existent (voir 1.2 ou 1.8).
- [ ] Les chantiers existent avec leur code d'activité.
- [ ] Fichier Excel (.xlsx) ou CSV de 5 Mo et 2 000 lignes maximum. Colonnes utiles : Matricule ou Nom/Prénom, Chantier, Poste, Type, Date de début, Date de fin, Salaire de base, Salaire net. Une feuille de pointage convient aussi.

**Étapes**
1. Cliquez sur « Importer des contrats ». La fenêtre « Importer des contrats de travail » s'ouvre. Choisissez le fichier, puis cliquez sur « Lire le fichier ». Si le classeur contient plusieurs feuilles, choisissez la « Feuille ».
2. Réglez les « Valeurs par défaut (colonne absente ou vide) » :
   - « Rapprochement des employés » : Par matricule ou Par nom et prénom (l'application propose le plus probable) ;
   - « Chantier » ;
   - « Activité » : utilisée si le chantier n'en porte pas ;
   - « Type de contrat » : CDD par défaut ;
   - « Régime de travail » ;
   - « Statut » : Actif ou Brouillon. Un contrat dont la fin est déjà passée est clôturé.
3. Vérifiez la correspondance des colonnes : Matricule, Nom, Prénom, Nom et prénom (une seule colonne), Chantier / affectation, Poste, Type de contrat, Date de début, Date de fin, Salaire de base mensuel, Salaire net mensuel (référence chantier).
4. Contrôlez l'aperçu (colonnes Ligne, Dans le fichier, Employé dans l'application, Contrat, État, Remarques) :
   - « À importer » : prêt ;
   - « Employé à choisir » : choisissez l'employé dans la liste de la colonne « Employé dans l'application » ;
   - « Déjà sous contrat », « Doublon », « Incomplet » : la ligne ne sera pas importée.
5. Cliquez sur « Importer N contrat(s) » (« Retour » permet de revenir à l'étape précédente). Attendez la fin : « Import en cours… x / y ».

**Résultat** — Bilan « N contrat(s) créé(s) » et, le cas échéant, « N refusé(s) », avec le détail « Ligne n » et la raison. Les contrats sont créés comme contrats principaux.

**Attention**
- Date de début absente : la date de recrutement de la fiche employé est utilisée. Elle est toujours ramenée au 1er du mois.
- Le poste est mis en majuscules.
- « Contrat principal déjà enregistré sur cette période » : l'employé a déjà un contrat principal qui chevauche. **L'import ne clôture jamais un contrat existant** : traitez ce cas à la main (voir 1.18).
- Après l'import, ouvrez chaque contrat pour compléter les rubriques de salaire et le régime CNAS (voir 1.15 et 1.16).
- Pour rattacher ensuite ces contrats à des postes, voir 1.9.

**Voir aussi** — 1.9 Importer les postes depuis les contrats · 1.14 Créer ou modifier un contrat de travail · 1.21 Importer un contrat PDF lu par l'IA

---

## 1.23 Créer ou modifier une agence d'intérim

> **Vidéo V1.23** · durée estimée 3 min · Public : SUPER_ADMIN, ADMIN_RH, GERANT

**Où la trouver** — Ressources Humaines › Personnel › « Intérim » › section « Agences d'intérim » › bouton « Nouvelle agence », ou « Modifier » sur la ligne d'une agence (`/rh/interim`).

**À quoi ça sert** — Enregistrer les agences qui mettent des intérimaires à disposition, avec leur taux journalier, leur coefficient et la TVA. Les intérimaires apparaissent au pointage mais sont exclus de la paie : ils sont facturés par l'agence.

**Avant de commencer**
- [ ] Vous avez le rôle SUPER_ADMIN, ADMIN_RH ou GERANT.
- [ ] Vous disposez des informations de l'agence (NIF, RC, contact, conditions tarifaires).

**Étapes**
1. Cliquez sur « Nouvelle agence » (fenêtre « Nouvelle agence d'intérim »), ou sur « Modifier ».
2. Renseignez :
   - « Code » (obligatoire) : 2 à 20 caractères parmi A-Z, 0-9, « _ » et « - ». Exemple : INT-SUD.
   - « Raison sociale » (obligatoire).
   - « NIF », « NIS », « RC », « Téléphone », « E-mail », « Contact », « Adresse ».
   - « Taux journalier par défaut (DA) » : utilisé quand le contrat n'a pas de taux propre. Exemple : 2 500.
   - « Coefficient agence (%) » : de 0 à 100 ; par défaut 0.
   - « TVA (%) » : de 0 à 100 ; par défaut 19.
   - « Notes ».
   - « Active » : cochée par défaut.
3. Cliquez sur « Enregistrer ».

**Résultat** — Message « Agence … enregistrée. » L'agence apparaît dans le tableau (colonne « Intérimaires » : nombre de contrats Intérim en Brouillon ou Actif). Elle devient sélectionnable dans un contrat de type Intérim (voir 1.14).

**Attention**
- « Code : 2 à 20 caractères A-Z, 0-9, _ ou -. » : retirez les espaces et les accents du code.
- « Ce code d'agence existe déjà. » : choisissez un autre code.
- « Raison sociale obligatoire. » : complétez la raison sociale.
- « Taux, coefficient ou TVA invalide. » : le taux doit être positif ou nul ; le coefficient et la TVA entre 0 et 100.
- Une agence décochée « Active » n'est plus proposée pour les relevés (pastille « Inactive »).

**Voir aussi** — 1.14 Créer ou modifier un contrat de travail · 1.24 Calculer et émettre un relevé mensuel d'intérim

---

## 1.24 Calculer et émettre un relevé mensuel d'intérim

> **Vidéo V1.24** · durée estimée 5 min · Public : SUPER_ADMIN, ADMIN_RH, GERANT

**Où la trouver** — Ressources Humaines › Personnel › « Intérim » › section « Relevés mensuels » (`/rh/interim`).

**À quoi ça sert** — Calculer ce que l'agence doit facturer pour un mois, à partir des présences validées de ses intérimaires, puis émettre un relevé numéroté qui servira à contrôler sa facture.

**Avant de commencer**
- [ ] Les intérimaires ont un contrat de type Intérim rattaché à l'agence (voir 1.14).
- [ ] Leurs présences du mois sont **validées** au pointage, sur le chantier de leur contrat (chapitre 2).
- [ ] Vous avez le rôle SUPER_ADMIN, ADMIN_RH ou GERANT.

**Étapes**
1. Choisissez l'« Année » (l'écran se met à jour quand vous quittez le champ), le « Mois », l'« Agence » et, si besoin, le « Chantier » (« Tous les chantiers » par défaut).
2. Cliquez sur « Calculer le relevé ». L'aperçu affiche :
   - le résumé « N intérimaire(s) · J jour(s) · X DA TTC » ;
   - les pastilles « N contrat(s) INTERIM sur la période » et, le cas échéant, « Taux manquant : … » ;
   - une ligne par intérimaire : Matricule, Intérimaire, Chantier, Jours, Taux (DA), Montant (DA) ;
   - la ligne de totaux « Sous-total · coefficient · HT · TVA ».
3. Vérifiez l'aperçu, puis cliquez sur « Émettre le relevé ».
4. Confirmez « Émettre le relevé : n intérimaire(s), X DA TTC ? ».

**Le calcul**
- Seules les présences validées, sur le chantier du contrat et entre ses dates, sont comptées.
- Jours = quantité de présence, selon le coefficient du code de pointage (chapitre 2).
- Taux = taux journalier du contrat, ou à défaut le taux par défaut de l'agence.
- Sous-total = somme des jours × taux ; Coefficient = sous-total × coefficient agence ; HT = sous-total + coefficient ; TVA = HT × taux de TVA ; TTC = HT + TVA.

Exemple : deux intérimaires, 22 et 20 jours validés, taux 2 500 DA, coefficient 10 %, TVA 19 %.
Sous-total = 42 × 2 500 = 105 000 DA ; coefficient = 10 500 DA ; HT = 115 500 DA ; TVA = 21 945 DA ; TTC = 137 445 DA.

**Résultat** — Le relevé est créé au statut Émis, avec un numéro unique (format NNNNNN/AA). Il apparaît dans le tableau des relevés (Relevé, Agence, Chantier, Jours, HT / TTC, Statut). La pastille « N relevé(s) actif(s) · X DA TTC » est mise à jour.

**Attention**
- « Aucune présence validée à facturer pour cette agence sur la période. » : faites valider les présences au pointage, puis recalculez.
- « Taux journalier manquant : … » : le bouton « Émettre le relevé » est grisé. Renseignez un taux sur le contrat ou un taux par défaut sur l'agence (voir 1.23).
- « Un relevé actif existe déjà pour cette agence et cette période : annulez-le d'abord. » : un seul relevé non annulé est permis par agence, mois et chantier (« Tous » compte comme un chantier). Annulez l'ancien (voir 1.25) avant d'en émettre un nouveau.
- « Numéro de relevé pris par une création simultanée : réessayez. » : cliquez de nouveau sur « Émettre le relevé ».
- Un relevé émis est figé : il ne se modifie ni ne se supprime. Pour le corriger, annulez-le puis émettez-en un nouveau.

**Voir aussi** — 1.25 Imprimer, rapprocher ou annuler un relevé d'intérim · 1.23 Créer ou modifier une agence d'intérim · chapitre 2 (validation des présences)

---

## 1.25 Imprimer, rapprocher ou annuler un relevé d'intérim

> **Vidéo V1.25** · durée estimée 4 min · Public : SUPER_ADMIN, ADMIN_RH, GERANT (impression : aussi ADMIN_FINANCE)

**Où la trouver** — Ressources Humaines › Personnel › « Intérim » › tableau des relevés, boutons sur la ligne du relevé (`/rh/interim`).

**À quoi ça sert** — Imprimer le relevé pour l'agence, puis contrôler la facture reçue (rapprochement), ou annuler un relevé erroné.

**Avant de commencer**
- [ ] Le relevé est émis (voir 1.24).
- [ ] Pour rapprocher : vous avez la facture de l'agence (numéro et montant TTC).

**Étapes — imprimer**
1. Retrouvez le relevé (recherche « N° de relevé, agence, chantier… »).
2. Cliquez sur « Imprimer », puis lancez l'impression A4 dans le navigateur.

**Étapes — rapprocher la facture** (relevé au statut Émis)
1. Cliquez sur « Rapprocher ». La fenêtre « Rapprochement du relevé … » s'ouvre.
2. Saisissez le « N° de facture de l'agence » (obligatoire).
3. Saisissez le « Montant TTC facturé (DA) ». L'indication « Relevé : X DA » rappelle le montant attendu.
4. Cliquez sur « Rapprocher ».

**Étapes — annuler un relevé** (statut Émis)
1. Cliquez sur « Annuler ».
2. Saisissez le motif à l'invite « Motif de l'annulation (obligatoire) : » et validez.

**Étapes — annuler un rapprochement** (statut Rapproché)
1. Cliquez sur « Annuler le rapprochement ». Le relevé revient au statut Émis.

**Résultat**
- Rapproché : la colonne « Statut / facture agence » affiche « Facture … · montant », et, s'il y a une différence, « Écart X DA » en rouge.
- Annulé : le relevé passe au statut Annulé, avec son motif. Vous pouvez émettre un nouveau relevé pour la même période.

**Attention**
- « Écart de X DA avec le relevé : vérifiez la facture avant de rapprocher. » : la facture ne correspond pas au relevé. Vérifiez avec l'agence avant de valider.
- « Référence de la facture de l'agence obligatoire. » : le bouton « Rapprocher » reste grisé tant que le numéro de facture est vide.
- Un relevé annulé ne peut plus être modifié.
- Chemins possibles : Émis vers Rapproché ou Annulé ; Rapproché vers Émis.

**Voir aussi** — 1.24 Calculer et émettre un relevé mensuel d'intérim

---

## 1.26 Enregistrer une sortie et préparer le solde de tout compte

> **Vidéo V1.26** · durée estimée 6 min · Public : SUPER_ADMIN, ADMIN_RH, GERANT

**Où la trouver** — Ressources Humaines › Personnel › « Sorties » › bouton « Nouvelle sortie », ou « Modifier » sur une sortie en Brouillon (`/rh/sorties`).

**À quoi ça sert** — Enregistrer le départ d'un salarié et préparer les éléments de son solde de tout compte (indemnité compensatrice de congé, primes, retenues). Le solde est payé sur le bulletin du mois de sortie.

**Avant de commencer**
- [ ] Vous avez le rôle SUPER_ADMIN, ADMIN_RH ou GERANT.
- [ ] L'employé n'est pas déjà sorti et n'a pas de sortie ouverte.
- [ ] Ses présences et congés sont à jour jusqu'à la date de sortie (chapitre 2).
- [ ] En cas d'abandon de poste, les deux mises en demeure ont été envoyées (voir 1.29).

**Étapes**
1. Cliquez sur « Nouvelle sortie ». La fenêtre « Nouvelle sortie » s'ouvre.
2. Renseignez :
   - « Employé » (obligatoire) : liste « matricule · nom prénom » des employés non sortis ;
   - « Date de sortie (dernier jour travaillé) » (obligatoire) ;
   - « Motif » (obligatoire) : Fin de contrat (CDD) (par défaut), Démission, Licenciement, Abandon de poste, Rupture à l'amiable, Fin de période d'essai, Retraite, Décès, Autre ;
   - « Reliquat de congé (jours) » : de −400 à 400 ;
   - « Observations » : 1 000 caractères maximum.
3. Dans le bloc « Éléments du solde de tout compte », cliquez sur « Calculer le reliquat de congé ». L'application :
   - retrouve le contrat principal et le salaire de base à la date de sortie (mention « Salaire de base à la date de sortie : X DA (indemnité = base / 30 × jours). ») ;
   - reprend le solde de congé à cette date ;
   - propose la ligne ICP « Indemnité compensatrice de congé (N j) », en classe 1.
   Exemple : base 42 000 DA, 12 jours de reliquat : 42 000 ÷ 30 × 12 = 16 800 DA.
4. Ajoutez les autres éléments avec « Ajouter un élément » (30 lignes maximum). Pour chaque ligne : Code, Libellé (obligatoire), التسمية, catégorie, montant (obligatoire). Catégories :
   - 1 · Cotisable + imposable ;
   - 2 · Cotisable, non imposable ;
   - 3 · Imposable, non cotisable ;
   - 4 · Ni cotisable ni imposable (par exemple une indemnité de licenciement).
   Un montant négatif est une retenue. « Retirer » supprime une ligne. Le total s'affiche en bas.
5. Cliquez sur « Enregistrer le brouillon ».

**Résultat** — Message « Sortie enregistrée (brouillon). Validez-la pour clôturer les contrats. » La sortie apparaît au statut Brouillon. Rien n'est encore changé sur les contrats ni sur la paie.

**Attention**
- « Employé requis · اختر العامل » ou « Date de sortie invalide » : le bouton « Enregistrer le brouillon » reste grisé sans employé ni date.
- « Libellé requis · التسمية مطلوبة », « Montant non nul · المبلغ مطلوب » : chaque élément doit avoir un libellé et un montant différent de zéro.
- « Une sortie est déjà ouverte pour cet employé. · توجد وضعية خروج مفتوحة لهذا العامل » : une sortie en Brouillon ou Validée existe déjà. Ouvrez-la au lieu d'en créer une autre.
- Relancer « Calculer le reliquat de congé » remplace la ligne ICP existante.
- Motif « Abandon de poste » : l'avertissement « Abandon de poste : envoyer d'abord deux mises en demeure. » s'affiche avec les boutons « 1ère mise en demeure » et « 2ème mise en demeure » (voir 1.29).
- Le reste des avances de l'employé sera retenu en totalité sur la paie du mois de sortie, à la validation.
- Supprimer un brouillon : bouton « Supprimer » sur la ligne, confirmation « Supprimer ce brouillon ? ». Seul un brouillon peut être supprimé (« Seul un brouillon peut être supprimé. »).
- « Modification refusée (sortie validée ou droits insuffisants). » : une sortie validée ne se modifie plus.

**Voir aussi** — 1.27 Valider une sortie · 1.29 Imprimer les documents de sortie · chapitre 3 (Paie, Avances)

---

## 1.27 Valider une sortie

> **Vidéo V1.27** · durée estimée 3 min · Public : SUPER_ADMIN, ADMIN_RH, GERANT

**Où la trouver** — Ressources Humaines › Personnel › « Sorties » › bouton « Valider » sur une sortie en Brouillon (`/rh/sorties`).

**À quoi ça sert** — Rendre la sortie définitive : clôturer les contrats de l'employé et envoyer le solde de tout compte dans la paie du mois de sortie.

**Avant de commencer**
- [ ] La sortie est en Brouillon et ses éléments sont vérifiés (voir 1.26).

**Étapes**
1. Cliquez sur « Valider ».
2. Lisez la confirmation : « Valider la sortie de … au jj/mm/aaaa ? Ses contrats seront clôturés (ENDED) et le solde (X DA) sera ajouté à la paie du mois de sortie, avec retenue du reste des avances. »
3. Cliquez sur « OK ».

**Résultat** — Message « Sortie validée. »
- Les contrats en cours de l'employé reçoivent la date de sortie comme date de fin et passent au statut Clôturé.
- L'employé est enregistré comme sorti, à la date de sortie.
- La sortie passe au statut Validée, avec le nom de la personne qui l'a validée.
- Les paies du mois de sortie sont signalées comme modifiées : un recalcul devra être décidé dans le Centre de décisions, décision D3 (Recalcul des paies brouillon).
- Les boutons « Certificat de travail » et « Solde de tout compte » apparaissent sur la ligne (voir 1.29).

**Attention**
- « Réservé aux RH (SUPER_ADMIN, ADMIN_RH, GERANT). » : vos droits ne le permettent pas.
- « Transition … → … impossible. » : la sortie n'est plus en Brouillon (déjà validée ou annulée). Actualisez la page.
- La validation ne change pas le champ « Statut » de la fiche employé. Si vous souhaitez le retirer de la liste des actifs, utilisez aussi « Désactiver » (voir 1.6).

**Voir aussi** — 1.28 Annuler une sortie validée · 1.29 Imprimer les documents de sortie · chapitre 3 (Paie)

---

## 1.28 Annuler une sortie validée

> **Vidéo V1.28** · durée estimée 2 min · Public : SUPER_ADMIN, ADMIN_RH, GERANT

**Où la trouver** — Ressources Humaines › Personnel › « Sorties » › bouton « Annuler » sur une sortie Validée (`/rh/sorties`).

**À quoi ça sert** — Revenir sur une sortie validée par erreur (date erronée, départ finalement annulé).

**Avant de commencer**
- [ ] La sortie est au statut Validée.
- [ ] Vous avez noté les contrats clôturés par cette sortie (registre des contrats, voir 1.13).

**Étapes**
1. Cliquez sur « Annuler ».
2. Lisez la confirmation : « Annuler la sortie de … ? L'employé redevient actif ; les contrats clôturés restent à rouvrir manuellement. »
3. Cliquez sur « OK ».
4. Ouvrez le registre des contrats et rouvrez à la main chaque contrat clôturé par la sortie (voir 1.14 : statut et date de fin).

**Résultat** — Message « Sortie annulée. » La sortie passe au statut Annulée et l'employé redevient actif (sa date de sortie est effacée).

**Attention**
- **Les contrats clôturés ne sont pas rouverts automatiquement.** Sans l'étape 4, l'employé reste sans contrat en cours.
- Pour enregistrer ensuite une sortie corrigée, créez une nouvelle sortie (voir 1.26).

**Voir aussi** — 1.27 Valider une sortie · 1.14 Créer ou modifier un contrat de travail

---

## 1.29 Imprimer les documents de sortie

> **Vidéo V1.29** · durée estimée 5 min · Public : SUPER_ADMIN, ADMIN_RH, GERANT

**Où la trouver** — Ressources Humaines › Personnel › « Sorties » (`/rh/sorties`) :
- « Certificat de travail » et « Solde de tout compte » : sur la ligne d'une sortie **Validée** ;
- « 1ère mise en demeure » et « 2ème mise en demeure » : dans la fenêtre de sortie, quand le motif est « Abandon de poste ».

**À quoi ça sert** — Établir les courriers de fin de relation de travail : certificat de travail, reçu pour solde de tout compte, et les deux mises en demeure qui précèdent un abandon de poste. Chaque courrier reçoit un numéro unique et est enregistré au registre des documents RH.

**Avant de commencer**
- [ ] Pour le certificat et le reçu : la sortie est validée (voir 1.27).
- [ ] Pour les mises en demeure : la sortie en brouillon porte le motif « Abandon de poste » (voir 1.26), et vous connaissez la date de début d'absence et l'adresse de l'employé.

**Étapes**
1. Cliquez sur le bouton du document voulu. La fenêtre correspondante s'ouvre :
   - « Certificat de travail · شهادة عمل » ;
   - « Reçu pour solde de tout compte · وصل تصفية كل حساب » ;
   - « Mise en demeure (1ère) · إعذار أول » ;
   - « Mise en demeure (2ème et dernière) · إعذار ثانٍ وأخير ».
2. Choisissez la langue (« Français » ou « العربية ») et la civilité (« Monsieur · السيد » ou « Madame · السيدة »).
3. Vérifiez les champs communs : nom et prénom (français et arabe), matricule, date du document, poste (français et arabe).
4. Complétez les champs propres au document :
   - certificat : date et lieu de naissance, « Du » (début) et « Au » (date de sortie) ;
   - reçu de solde : « Du », « Au », « Somme reçue (DA) » et, si vous le souhaitez, le bloc « Détail du solde (facultatif) » (Désignation, البيان, montant ; « Ajouter une ligne », « Retirer ») ;
   - mises en demeure : adresse (français et arabe), « Absent depuis le », « Délai (jours) ». Pour la 2ème, ajoutez le « N° 1ère mise en demeure » et la « Date 1ère mise en demeure ».
5. Si besoin, cochez « Modifier le texte librement » pour retoucher le texte complet.
6. Vérifiez l'aperçu à droite, puis cliquez sur « Enregistrer et imprimer ».

**Résultat** — Le courrier est enregistré au registre des documents RH avec un numéro unique (« N° … »), puis imprimé. L'en-tête porte « E.U.R.L. NEDJM FROID », avec le lieu Hassi Messaoud.

**Attention**
- Envoyez la 1ère mise en demeure, attendez le délai, puis envoyez la 2ème en reprenant le numéro et la date de la 1ère. Validez la sortie pour abandon de poste seulement après.
- Le montant du reçu doit correspondre au solde réellement payé sur le bulletin du mois de sortie (chapitre 3).
- Vérifiez l'aperçu avant de cliquer : le courrier est enregistré au registre, avec son numéro, dès le clic sur « Enregistrer et imprimer ». Un numéro attribué n'est jamais réutilisé.

**Voir aussi** — 1.26 Enregistrer une sortie et préparer le solde de tout compte · 1.27 Valider une sortie · chapitre 4 (Attestations et courriers)
