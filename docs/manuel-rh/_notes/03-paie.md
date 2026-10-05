# 03 — Module RH · Paie (notes de documentation)

> Notes de travail pour le futur **Manuel d'utilisation** et les **scripts de tutoriels vidéo**.
> Source : lecture du code de `nedjm-froid-erp` (Next.js 16) et des migrations Supabase (`supabase/migrations`). Aucun code applicatif n'a été modifié.
> Les libellés entre guillemets « … » sont les libellés exacts de l'interface. Les points non vérifiés sont signalés **⚠ À vérifier**.

---

## 0. Conventions et remarques générales

- **Langue affichée** : le code prévoit des libellés bilingues via la fonction `bi(fr, ar)`, mais cette fonction renvoie **uniquement le français** (commentaire du code : « UI RH : libellés d'action / chrome en français uniquement »). Les libellés arabes figurant dans le code ne sont donc **pas affichés** sur les boutons, en-têtes de colonnes et messages. L'arabe n'apparaît qu'aux endroits où il est rendu explicitement (ex. paragraphe arabe de la description de l'écran Paie, libellé arabe des rubriques dans la liste des exceptions, libellés arabes des éléments du simulateur, contenu des bulletins imprimés). Dans ces notes, l'arabe est indiqué entre parenthèses quand il existe dans le code, à titre indicatif. **⚠ À vérifier à l'écran** pour chaque capture.
- **Montants** : en dinars algériens (DA), arrondis à 2 décimales.
- **Statuts de paie (mois × chantier)** : « Brouillon » (DRAFT) → « Validée » (VALIDATED) → « Clôturée » (LOCKED). Aucun retour arrière direct : la réouverture passe par la décision **D7**.
- **Nature de la période** :
  - mois **avant septembre 2026** = « mois de reprise » (paie de janvier à août 2026 payée/déclarée hors de l'application) ;
  - à partir de septembre 2026 = « mois opérationnel ».
- **Principe central** : « Aucune paie n'est créée ni recalculée automatiquement : chaque génération ou recalcul passe par une décision du Centre de décisions. »

### 0.1 Navigation (barre d'onglets RH)

Section **« Paie »** (icône portefeuille, AR الأجور) de la barre d'onglets en haut des pages RH. Sous-onglets, dans l'ordre par défaut :

| Sous-onglet | URL |
|---|---|
| « Préparation du mois » | `/rh/paie/preparation` |
| « Calcul de la paie » | `/rh/paie` |
| « Simulateur » (raccourci, flèche ↗) | `/simulateur` |
| « Exceptions » | `/rh/paie/exceptions` |
| « Avances » | `/rh/paie/avances` |
| « Virements » | `/rh/paie/virements` |
| « Déclarations » | `/rh/paie/declarations` |
| « Opérations externes » | `/rh/paie/operations-externes` |
| « Coûts » | `/rh/couts` |

Remarques :
- L'ordre et le rangement des onglets sont personnalisables (fonction « Réorganiser »), donc la position peut différer selon l'utilisateur.
- Les bulletins déjà établis sont consultables dans la section **Documents → « Registre »**, carte « Bulletin de paie » (`/rh/documents?onglet=bulletins`). L'ancienne URL `/rh/paie/bulletins` redirige vers cette carte.
- `/rh/paie/irg` redirige vers **Cotisations & impôts → onglet IRG** (`/rh/legal?tab=irg`) — documenté dans le chapitre « Cotisations & impôts » (voir §5.20 pour un résumé).
- `/rh/paie/simulateur` redirige vers `/simulateur?cible=paie` (avec année, mois, salarié si fournis).
- Le Simulateur est aussi accessible depuis le menu général (groupe « Pilotage », libellé « Simulateur »).

### 0.2 Rôles et droits (constatés dans le code)

| Action | Rôles / permission |
|---|---|
| Consulter la paie, demander génération / recalcul | permission `hr_payroll` (lecture / mise à jour) selon chantier |
| **Valider la paie**, demander D6, demander la réouverture D7, exports de déclarations depuis l'écran Paie | SUPER_ADMIN, ADMIN_RH, GERANT (« valeurs salariales ») |
| **Clôturer le mois** | SUPER_ADMIN, GERANT uniquement |
| Exceptions : créer / modifier / approuver | SUPER_ADMIN, ADMIN_RH, GERANT ; seuls GERANT et SUPER_ADMIN peuvent approuver leurs propres saisies |
| Avances & prêts : créer / annuler | SUPER_ADMIN, ADMIN_RH, GERANT |
| Virements : préparer / générer / suivre | SUPER_ADMIN, ADMIN_RH, GERANT (⚠ à vérifier : droits exacts côté base pour dépôt/exécution) |
| Registre des déclarations : produire un export | SUPER_ADMIN, ADMIN_RH, GERANT |
| Opérations externes | permissions `hr_external_operations` (lecture / création / mise à jour), `hr_external_operations_confirm` (confirmer), `hr_external_operations_examine` (examiner une pièce) |
| Coûts par chantier / contrat | SUPER_ADMIN, ADMIN_RH, GERANT, ADMIN_FINANCE |
| Plan de comptes de la paie (modifier) | SUPER_ADMIN, ADMIN_FINANCE, GERANT (« Réservé à la finance / gérance. ») |
| Simulateur | lecture de la paie (`hr_payroll` read) ; sinon : « Accès au simulateur non autorisé pour votre rôle (lecture de la paie requise). » |
| Décider une décision (Centre de décisions) | SUPER_ADMIN ou permission « update » sur l'écran lié au type de décision ; **D7 réservée au SUPER_ADMIN (non délégable)** |
| Exécuter une décision D3/D4 | permission `hr_payroll` update ; sinon « Calcul de la paie non autorisé pour votre rôle. » |

**Séparation des tâches** : celui qui a demandé une décision ne peut pas la trancher (sauf SUPER_ADMIN) : « Séparation des tâches : vous êtes à l'origine de cette demande, un autre décideur doit la trancher. »

---

## 1. Concepts transverses à expliquer dans le manuel

### 1.1 Le signal « Données modifiées depuis le calcul »

Quand une donnée qui entre dans la paie change **après** le calcul d'une paie brouillon, l'application ne recalcule rien : elle marque la paie comme modifiée et ouvre (ou met à jour) une demande de décision **D3**.

Sources de modification suivies : présence (pointage), contrat, salaire, historique de salaire, exception, sortie, congé, avance, conformité (régime manuel IRG/CNAS/CACOBATPH), affectation, wilaya du chantier, règle légale, coefficient de légende de présence.

Effets visibles :
- chip « Données modifiées depuis le calcul (N) · décision requise » dans la barre d'état de l'écran Paie (lien vers la décision D3) ; infobulle « Validation bloquée tant qu'une décision de recalcul n'a pas été prise. » ;
- note « Données modifiées depuis le calcul » sous le nom de l'employé dans le tableau ;
- boutons « Valider la paie » / « Demander la décision D6 » désactivés ;
- côté base, toute validation est refusée : « Données modifiées depuis le calcul : décidez de recalculer ou de conserver les bulletins (Centre de décisions) avant de valider. »
- notification « Paie brouillon MM/YYYY — {chantier} modifiée depuis son calcul » : « Des données ont changé depuis le calcul. Aucun recalcul automatique : votre décision est requise. »

Quand un **pointage du mois est validé** et qu'il n'existe pas encore de paie, une demande **D4** (génération) est ouverte.

### 1.2 Le Centre de décisions (rappel utile pour la paie)

Page `/decisions/{id}`. Éléments affichés : titre (type de décision), statut (chip), faits « Période », « Chantier », « Origine », « Classe » (« À risque » / « Ordinaire »), « Demandée », « Pointages validés du mois », « Bulletins brouillon », etc.

Bloc **« Votre décision »** (si la décision est en attente) :
1. choisir une **option** (cartes avec boutons radio : libellé + conséquence ; certaines options peuvent être grisées avec leur motif) ;
2. saisir « Justification (obligatoire, tracée) » — 10 à 2000 caractères (« Justification obligatoire (10 caractères minimum). ») ;
3. pour une décision à risque : cocher « J'ai pris connaissance des conséquences de cette décision à risque. » (sinon : « Décision à risque : confirmez avoir pris connaissance des conséquences. ») ;
4. cliquer « Décider et exécuter » (option qui exécute immédiatement) ou « Enregistrer la décision ». Mention : « La décision est définitive : elle ne peut être ni modifiée ni supprimée. »

Messages après décision :
- « Décision enregistrée et exécutée : N bulletin(s) calculé(s). » (+ avertissements du calcul)
- D1 simulation : « Décision enregistrée : simulation « règles non approuvées » calculée pour N salarié(s). Aucun bulletin créé. »
- « Décision enregistrée. Elle s'exécute une seule fois, depuis l'écran opérationnel. » (D9 / D10 : lien « … (une seule fois) »)
- « Décision enregistrée et appliquée dans la même opération. »
- « Décision enregistrée. Aucune opération de paie n'a été lancée. »
- « Décision enregistrée, mais l'exécution a échoué : … » → bouton « Exécuter la décision » pour relancer (auteur de la décision ou SUPER_ADMIN ; sinon « En attente d'exécution par l'auteur de la décision ou le SUPER_ADMIN. »)
- Données changées entre l'affichage et la décision : « Les données ont changé depuis l'affichage : la demande a été mise à jour. Relisez-la avant de décider. » ; si la décision est invalidée à l'exécution : « Les données ont changé depuis la décision : elle est invalidée et une nouvelle demande est ouverte. » + lien « Ouvrir la nouvelle demande ».

Statuts d'une décision : « En attente », « Décidée, à exécuter », « Exécutée », « Invalidée », « Remplacée ».

### 1.3 Mois de reprise (janvier → août 2026)

Bandeau sur l'écran Paie : « Paie de reprise (janvier à août 2026)… risque de double paiement ou de double déclaration (décisions D9 / D10). Mention affichée à l'écran seulement, jamais imprimée sur les bulletins. »
- Tout virement d'un mois de reprise est bloqué sans **D9** ; toute déclaration d'un mois de reprise est bloquée sans **D10**.
- Valider une paie opérationnelle alors que des mois de reprise sont encore ouverts exige **D6** : « Validation bloquée : des mois de reprise (janvier à août 2026) restent ouverts. Décision D6 requise (Centre de décisions) : attendre, figer leurs paramètres ou séparer la chaîne de reprise. »

---

## 2. Description des pages (mise en page)

### 2.1 « Préparation de la paie » — `/rh/paie/preparation`

- **En-tête** : sur-titre « Paie », titre « Préparation — {mois en toutes lettres} », description : « Tableau de contrôle du mois, en lecture seule. Le lancement de la paie reste manuel et passe par une décision (D4, ou D1 si des règles sont en attente). »
- **Filtres** : « Mois » (sélecteur de mois AAAA-MM, paramètre `?mois=`), « Chantier » (« Tous les chantiers » ou un chantier, paramètre `?chantier=`).
- **Chips** : « Mois de reprise » / « Mois opérationnel » ; statut de la paie (« Paie brouillon », « Paie validée »…) si elle existe.
- **Alerte « chemin de génération »** + bouton d'action (voir F-01).
- **Bloc « Contrôles du mois »** : liste de contrôles avec niveau « Conforme » / « Information » / « À vérifier » / « Bloquant » et lien « Ouvrir » vers l'écran concerné :
  - Règles légales ;
  - Coefficients de présence (D14) ;
  - Présences (jours proposés non validés ignorés, imports en cours, contrats sans présence) ;
  - Qualité des données (contrats ne commençant pas le 1er — D13 ; chantiers sans wilaya → `/rh/qualite-donnees`) ;
  - Décisions du mois ;
  - Mois précédent.
- **Panneaux** :
  - « Règles en attente (bloquent la paie réelle) » — colonnes Règle, Famille, Statut, Mois concerné, lien « Décision D2 » ou « Proposition » ;
  - « Valeurs héritées non vérifiées (avertissement) » ;
  - statistiques : Présences validées, Présences proposées, Contrats sans présence, Imports en cours ;
  - « Décisions ouvertes pour ce mois » ;
  - « Coefficients en attente de décision (D14) » ;
  - « Simulations « règles non approuvées » » — colonnes Calculée le, Salariés, Brut, IRG, Net simulé, Règles en attente, bouton « Exporter (Excel) ». Sans droit de lecture des salaires : « Montants réservés aux profils autorisés à lire les salaires. »

### 2.2 « Paie » (Calcul de la paie) — `/rh/paie`

Même composant pour trois vues : **Fiches** (`/rh/paie`, titre « Paie »), **Social** (`/rh/paie/social`, titre « Déclarations sociales »), **Fiscal** (`/rh/paie/fiscal`, titre « Retenue IRG »). Période choisie par `?year=&month=` (année 2020–2100, sinon année courante ; mois 1–12, sinon mois courant).

De haut en bas :
1. **En-tête « Paie »** + description : taux issus des variables légales (CNAS / IRG / CACOBATPH), coefficients issus des légendes de présence, rubriques issues du dictionnaire et du contrat ; « Aucune paie n'est créée ni recalculée automatiquement : chaque génération ou recalcul passe par une décision du Centre de décisions. » (+ paragraphe arabe).
2. **Barre de raccourcis** : « Fiches », « Social », « Fiscal », « Cotisations & impôts » (→ `/rh/legal`), « Simulateur » (→ `/simulateur?cible=paie`), « Exceptions », « Avances & prêts », « Virements », « Rubriques » (→ `/rh/parametres`).
3. **Alertes** (selon le cas) : erreur / information ; bandeau « Paie de reprise… » (mois avant 09/2026) ; « N salarié(s) en régime manuel (IRG / CNAS / CACOBATPH) » (détail dépliable) ; « N bulletin(s) calculé(s) avec des valeurs légales reprises jamais vérifiées » + lien « faire approuver ces valeurs » (→ `/rh/legal`).
4. **Bandeau des taux** (chips) : « CNAS salarié », « CNAS employeur », « FOS », « Congés CACOBATPH », « Intempéries » salarié / patronal, « IRG barème + règles ».
5. **Barre d'état du mois** (pour le chantier choisi) : « Paie MM/YYYY · {chantier} » ; chip de statut « Brouillon » / « Validée » / « Clôturée » ; « N bulletin(s) » ; chips d'alerte (« Données modifiées depuis le calcul (N) · décision requise », « Réouverture demandée · décision D7 en attente », « Validation bloquée · décision D6 en attente », « Validation soumise à décision D6 (mois de reprise ouverts) ») ; boutons « Historique (N) », « Demander la décision D6 », « Valider la paie », « Demander la réouverture (D7) », « Clôturer le mois » (selon statut et rôle). Sans paie : « Pas encore générée pour ce chantier. » (+ chip « Génération demandée · en attente de décision » si une demande existe).
6. **Barre des déclarations** (rôles SUPER_ADMIN, ADMIN_RH, GERANT) : chip « Provisoire : paie non validée » ou « Paie validée » ; boutons « CNAS · G50 · CACOBATPH · Virements (Excel) », « Ce chantier seulement », « DAS annuelle YYYY », « Fichier CNAS (CSV) », « Fichier DAS (CSV) », « État G50 (imprimer) » ; liens « Registre des déclarations », « Virements CCP / banque ».
7. **Barre de période** : « Chantier » (liste des chantiers actifs, premier par défaut), « Année », « Mois », boutons « Voir ce mois », « Demander la génération » / « Demander un recalcul », « Afficher Bulletin de Paie », « Imprimer les bulletins ».
8. **Recherche** : « Rechercher un employé (matricule, nom, NSS)… » + compteur « x / y bulletin(s) ».
9. **Tableau des bulletins** (40 par page, « Précédent » / « Suivant ») :
   - colonne fixe « Employé » (matricule, nom ; notes « Données modifiées depuis le calcul », et en vue Social « NSS manquant ») ;
   - « Jours », « Net » (sauf vue Fiscal) ;
   - vue **Social** : « SS salarié », « SS employeur », « CACOBATPH », « Intemp. sal. », « Intemp. pat. », « Autres cot. sal. », « Autres cot. pat. » (infobulle de détail) ;
   - vue **Fiscal** : « Base IRG », « IRG » ;
   - vue **Fiches** : une colonne par rubrique utilisée, groupées par classe (code, libellé, unité) ; colonne « Statut » ;
   - actions par ligne : « Bulletin de Paie », « Imprimer », « PDF archivé » (bulletin non brouillon archivé), « Traçabilité » (⚠ si règles non vérifiées).
   - Vide : « Aucun bulletin pour cette période. » / « Aucun bulletin ne correspond à « … ». »

   **Important** : le tableau liste **tous les bulletins du mois, tous chantiers confondus** (chaque ligne a son propre statut), alors que la barre d'état et ses boutons portent sur la paie **du chantier sélectionné**.

### 2.3 « Bulletins de paie » — Documents → Registre → carte « Bulletin de paie » (`/rh/documents?onglet=bulletins`)

- Carte « Bulletin de paie » (résumé « Par période de paie ») parmi les cartes du Registre (Fiches, Contrat de travail, Ordre de mission, Titre de congé, Bulletin de paie).
- En-tête « Bulletins de paie », description « Bulletins déjà établis, tous mois confondus… » ; bouton « Nouveau bulletin de paie ».
- Barre : recherche « Rechercher (matricule, nom, chantier)… », sélecteur de période (« Toutes les périodes » ou un mois), compteur.
- Colonnes : Période, Employé, Chantier, Jours, Net à payer, Statut ; actions « Afficher », « Imprimer », « Recalculer » (brouillon seulement), « PDF archivé ». 50 lignes par page.

### 2.4 « Rubriques exceptionnelles » — `/rh/paie/exceptions`

- En-tête « Rubriques exceptionnelles » (AR بنود الأجر الاستثنائية) ; description : éléments hors contrat permanent, motif et période obligatoires, saisie en brouillon puis approbation par une autre personne (le Gérant / Super admin peuvent approuver leurs propres saisies), seules les exceptions approuvées alimentent le bulletin, un mois validé/clôturé n'est plus modifiable.
- Boutons : « Paie », « Nouvelle exception ».
- Recherche « Employé, rubrique, motif… ».
- Colonnes : Employé ; Rubrique (code · libellé, libellé arabe, classe) ; Période (MM/YYYY → fin ou « une fois », motif) ; Montant (+ mode) ; Statut (« Brouillon » / « Approuvée » / « Annulée », « Saisie : … », « Approuvée par … · date », note) ; actions.

### 2.5 « Avances & prêts » — `/rh/paie/avances`

- Alerte d'information : « Chaque mois, la paie retient la mensualité (classe 4, hors cotisations et IRG) jusqu'au remboursement complet, sans rendre le net négatif. » (⚠ voir Incertitudes : le moteur utilise la classe 5).
- Formulaire « Nouvelle avance / prêt » (rôles autorisés).
- Filtres « En cours » / « Toutes » ; total « Reste à retenir : X DA ».
- Colonnes : Employé, Type (+ « Annulée » / « Soldée »), Montant, Mensualité, Retenu, Reste, Début, Motif (· auteur), action « Annuler ».

### 2.6 « Virements des salaires » — `/rh/paie/virements`

- En-tête « Virements des salaires » ; description : préparés à partir des bulletins validés/clôturés, journal de dépôt, un seul lot actif par bulletin, format générique à faire valider par la banque / Algérie Poste ; lien « Opérations externes ». Bandeau « reprise » pour les mois avant 09/2026.
- Barre : « Année », « Mois », « Mode » (« CCP · texte à positions fixes » / « Banque · CSV (;) »), « Chantier » (« Tous les chantiers »), « Compte donneur d'ordre » (« CCP / RIB entreprise »), « Date de valeur », bouton « Préparer le lot ».
- Zone d'aperçu, zone « bulletins bloqués » (D9), liste « Décisions D9 du mois », chip « N lot(s) actif(s) · X DA ».
- Tableau des lots : Lot, Mode, Chantier, Virements, Total (DA), Statut / dépôt ; actions « Détail », « Fichier », « Déposé », « Exécuté », « Annuler le dépôt », « Annuler le lot ».

### 2.7 « Registre des exports de déclaration » — `/rh/paie/declarations`

- En-tête « Registre des exports de déclaration » + description (renvoi au registre des opérations externes, avertissement sur les déclarations faites hors application sans trace).
- Panneau D10 (si une décision D10 est ouverte via `?decision=`) : « Produire le fichier de la décision (une seule fois) ».
- Barre : « Année », « Nouvel export » (type), « Mois » (sauf exports annuels), « Chantier » (export mensuel seulement), « Préparer l'export ».
- Colonnes : Type, Période, Chantier, Nature (« Officiel » / « État de contrôle », « Risque de double déclaration », « Paie non validée »), Mois inclus (+ Exclus), Fichier (empreinte SHA-256), Produit (date · auteur, Décision D10).

### 2.8 « Opérations externes (paiements et déclarations) » — `/rh/paie/operations-externes`

- Accès : lecture `hr_external_operations`, sinon redirection vers l'accueil (erreur « forbidden »).
- En-tête + description : chaque entrée, même retirée, remplacée ou non confirmée, continue de bloquer (D9/D10).
- Bouton « Nouvelle opération externe » ; barre « Année » (2026 par défaut), « Type » (Tous / Paiements / Déclarations).
- Liste de cartes (voir F-17).

### 2.9 « Coûts de la paie par chantier et par contrat » — `/rh/couts`

- En-tête + description (coût employeur = brut + charges patronales ; imputé au chantier de la paie puis réparti entre les contrats clients actifs au prorata des jours d'activité ; écriture SCF ventilée en analytique).
- Barre : « Année », « Mois », « Répartition (CSV) », « Écritures comptables (CSV) », « Plan de comptes ».
- Alertes : « Paie du mois non validée : chiffres provisoires. », « Contrats clients non accessibles avec votre profil : répartition par chantier uniquement. »
- Indicateurs : Bulletins, Coût employeur total (DA), Chantiers.
- Tableaux : par chantier ; par contrat client ; « Écriture de paie · journal {code} » (chip « Équilibrée » / « Déséquilibre »).

### 2.10 « Simulateur » — `/simulateur`

- Barre : « Élément à tester » (recherche, placeholder « Fiche de paie, pointage, congé, mission… »), « Afficher à côté » (« — aucun » ou un autre élément), « Salarié » (« (vide = scénario libre) » pour la fiche de paie ; liste « Matricule ou nom… »), bouton « Scénario libre », « Mois » (Janvier…Décembre), « Année » (année courante −4 à +2), sélecteur de référence (selon l'élément).
- Sans élément choisi : galerie « Quel élément voulez-vous tester ? ».
- Espace de travail : bandeau d'indicateurs, document au centre, zones de variables « Gauche » / « Droite » / « Bas », boutons « Éditer la mise en page », « Figer comme référence », « Tout rétablir ».

---

## 3. Fonctions détaillées

### F-01 — Préparer le mois et demander la génération (D4) ou la décision D1

- **Titre** : « Préparation — {mois} » ; boutons « Demander la génération (D4) » / « Demander la décision D1 ».
- **Où** : Paie → « Préparation du mois ».
- **À quoi ça sert** : contrôler, en lecture seule, que tout est prêt avant de lancer la paie, et demander la génération.
- **Prérequis** : droit de préparation de la paie (sinon « Préparation de la paie non autorisée. ») ; chantier dans le périmètre (« Chantier hors de votre périmètre. »).
- **Étapes** :
  1. Choisir le « Mois » et éventuellement le « Chantier ».
  2. Lire l'alerte de chemin :
     - « Paie de ce mois validée ou clôturée : aucune génération possible. »
     - « Une paie brouillon existe : recalcul depuis l'écran Paie (décision D3). »
     - « Règles en attente : la génération réelle est bloquée. Demandez la décision D1 (attendre ou simulation non validable). »
     - « Aucun blocage : la génération peut être demandée (décision D4). »
  3. Parcourir « Contrôles du mois » et corriger via les liens « Ouvrir ».
  4. Cliquer « Demander la génération (D4) » ou « Demander la décision D1 » (visible seulement si l'utilisateur peut demander) → ouverture de la décision.
- **Erreurs possibles (D1)** : « La paie de ce mois est déjà validée ou clôturée. », « Aucune règle en attente pour ce mois : la génération peut être demandée directement (D4). », « Demande D1 non autorisée. ».
- **Résultat** : demande D4 ou D1 créée au Centre de décisions, notification aux décideurs ; rien n'est calculé à ce stade.
- **Règles** : une vraie paie n'est jamais créée ni validée si une règle légale du mois attend son approbation ou sa date d'application : « N règle(s) légale(s) attendent leur approbation ou leur date d'application pour MM/YYYY : génération|validation de la paie bloquée (décision D1). Une simulation non validable peut être demandée depuis la préparation du mois. »
- **Liens** : F-02, F-05 (D1/D4), Cotisations & impôts (règles, D2), Présence (validation du pointage), Qualité des données.

### F-02 — Demander la génération ou un recalcul depuis l'écran Paie

- **Titre** : « Demander la génération » / « Demander un recalcul ».
- **Où** : Paie → « Calcul de la paie », barre de période.
- **À quoi ça sert** : ouvrir la décision D4 (pas encore de paie) ou D3 (paie brouillon existante) pour le chantier et le mois choisis.
- **Prérequis** : permission `hr_payroll` update ; pour un recalcul, paie au statut Brouillon ; pointage du mois validé.
- **Étapes** :
  1. Choisir « Chantier », « Année », « Mois » puis « Voir ce mois » (bouton actif seulement si la période a changé).
  2. Cliquer « Demander la génération » (ou « Demander un recalcul » si une paie existe). Infobulle : « Ouvre la décision de génération (D4) ou de recalcul (D3) au Centre de décisions. » Le bouton est désactivé si la paie n'est pas brouillon.
  3. L'application ouvre la page de la décision (`/decisions/{id}`).
- **Erreurs** : « Paie clôturée : aucun recalcul possible. », « Paie validée : aucun recalcul possible sans réouverture. », « Mois déjà validé ou clôturé : aucune paie à générer. », « Le serveur n'a pas répondu. Rechargez la page et réessayez. », « Demande de recalcul non autorisée. », « Demande de génération de paie non autorisée. »
- **Résultat** : décision D4 (ou D1 si règles en attente) ou D3 « tout le mois » (recalcul manuel = paie entière) ; notification « Recalcul demandé depuis l'écran Paie. Aucun recalcul n'a été fait : votre décision est requise. »
- **Variante — salarié sans bulletin** : si la recherche (≥ 2 caractères) ne trouve aucun bulletin, l'alerte « Pas encore de bulletin pour MM/YYYY : » liste les employés trouvés avec un bouton « Demander la paie {chantier} MM/YYYY », ou « Aucun contrat principal : créez son contrat de travail d'abord. » + lien « Contrats ».
- **Liens** : F-05, F-03.

### F-03 — Consulter, afficher et imprimer les bulletins (écran Paie)

- **Titre** : « Afficher Bulletin de Paie », « Imprimer les bulletins », actions de ligne « Bulletin de Paie », « Imprimer », « PDF archivé ».
- **Où** : Paie → « Calcul de la paie » (vues Fiches / Social / Fiscal).
- **Étapes** :
  1. Choisir la période, rechercher un employé si besoin.
  2. « Bulletin de Paie » (ligne) ouvre l'aperçu « Bulletin de Paie » (AR كشف الأجر) avec « Imprimer / PDF » et « Fermer ».
  3. « Afficher Bulletin de Paie » / « Imprimer les bulletins » portent sur **la page courante** (40 bulletins max).
  4. « PDF archivé » ouvre le PDF figé créé lors de la validation (bulletins non brouillon).
- **Contenu du bulletin imprimé** : identité employeur (nom, adresse, NIF, NIS, n° CNAS, n° CACOBATPH) ; identité salarié ; colonnes Nbr / Base / Taux / Gain / Retenue ; ligne de base : nombre = jours payés hors récupération, taux = base / jours du mois ; ligne CNAS (taux en % du brut cotisable) ; intempéries ; cotisations supplémentaires ; ligne IRG (barème, taux non affiché) ; lignes à zéro masquées selon le paramètre ; totaux ; charges salariales / patronales (FOS séparé) ; coût global = net + charges ; explication IRG (barème, abattement, exonération, lissage ; mode Exonéré / Taux fixe / Barème) ; mode de paiement et compte. Ordre des lignes : classe 1, classe 2, CNAS salarié, classe 3, IRG, classe 4, classe 5.
- **Résultat** : impression / PDF navigateur. La mention « reprise » n'est jamais imprimée.

### F-04 — Traçabilité d'un bulletin

- **Titre** : « Traçabilité » → fenêtre « Traçabilité du bulletin ».
- **Où** : action de ligne du tableau Paie (icône ⚠ si des règles non vérifiées ont servi).
- **Contenu** :
  - avertissement si des règles reprises non vérifiées ont servi (lien « Cotisations & impôts ») ;
  - « Décision de paie (D4 / D3) » (lien) ;
  - « Contrat » (+ exception de début D13 le cas échéant) ;
  - « Affectation du mois » (« chantier de la fiche contrat » ou corrigée par D8) ;
  - « Version de salaire » (« salaire de la fiche contrat » ou version datée) ;
  - tableau des règles : « Règle » (famille : Variable légale, Taux CNAS du régime, Barème IRG, Règles IRG, Périmètre de zone IRG (D16)), « Version », « Statut » (chip vérifiée / lien « proposition »), « Décision D2 ».
- **À quoi ça sert** : justifier chaque montant (quelles règles, quelle version, quelle décision).

### F-05 — Décisions de paie D4 / D3 / D1 (générer, recalculer, simuler)

- **Où** : Centre de décisions (`/decisions/{id}`), ouvert depuis F-01, F-02, F-07 ou automatiquement.
- **Options** :
  - **D4 « Génération de paie »** : « Générer la paie du mois » (brouillon, règles en vigueur au 1er du mois — exécute aussitôt) ; « Ne pas générer ».
  - **D3 « Recalcul des paies brouillon »** : « Recalculer les bulletins concernés » (seuls les bulletins brouillon concernés sont recalculés, les autres restent inchangés ; si la demande vient de l'écran Paie, toute la paie) ; « Conserver les bulletins tels quels » (la paie devient validable en l'état).
  - **D1 « Paie d'un mois aux règles non approuvées »** : « Attendre l'approbation des règles » ; « Calculer une simulation non validable » (aucun bulletin réel ; résultat stocké comme simulation, exportable en Excel depuis la Préparation).
- **Étapes** : voir §1.2 (option → justification → « Décider et exécuter »).
- **Erreurs à l'exécution** : « Calcul de paie refusé : décision D3 ou D4 valide requise (Centre de décisions). », « Données modifiées depuis la décision : rechargez la décision. », « Paie clôturée : régénération impossible. », « Paie validée : réouvrez-la avant de régénérer. », « Décision D1 « simulation » décidée requise. », « Seul l'auteur de la décision ou le SUPER_ADMIN peut l'exécuter. », « Les règles ou les présences du mois ont changé… » (D1 invalidée).
- **Avertissements possibles du calcul** : « Barème IRG introuvable pour la période : IRG = 0 », salariés en régime manuel, contrats principaux multiples, jours pointés > jours de contrat, base < grille, NSS manquant, base < SNMG, avance plafonnée, « N j de congé annuel payés par la CACOBATPH, exclus du bulletin ».
- **Résultat** : paie brouillon créée/remplacée (D4/D3) avec une photographie des règles (« legal_snapshot ») et une trace par bulletin ; les modifications en attente sont soldées.
- **Simulation D1 — export Excel** : fichier `simulation_regles_non_approuvees_YYYY_MM.xlsx`, bandeau « SIMULATION — RÈGLES NON APPROUVÉES… », feuilles « Synthèse » et « Salariés ».

### F-06 — Valider la paie

- **Titre** : « Valider la paie ».
- **Où** : barre d'état de l'écran Paie (chantier sélectionné).
- **Prérequis** : rôle SUPER_ADMIN, ADMIN_RH ou GERANT ; paie Brouillon ; au moins un bulletin ; aucune donnée modifiée en attente (D3) ; aucun jour « proposé » (ordres de mission) non validé dans le pointage du mois ; aucune règle légale en attente (D1) ; pas de mois de reprise ouvert (sinon D6, voir F-08).
- **Étapes** : cliquer « Valider la paie » (désactivé si 0 bulletin ou modifications en attente).
- **Erreurs** : « Aucun bulletin à valider : générez la paie d'abord. », « N jour(s) proposé(s) (ordres de mission) non validé(s) dans le pointage. », « Paie déjà validée. », « Validation réservée à SUPER_ADMIN, ADMIN_RH et GERANT. », « Paie introuvable. », message D1 (§F-01), message D6 (§1.3), message « Données modifiées… » (§1.1).
- **Résultat** : « Paie validée : bulletins et pointage du mois figés (réouverture seulement sur décision D7 du SUPER_ADMIN). » + « N bulletin(s) archivé(s) en PDF. » (ou « Archive PDF non créée : … »). Tous les bulletins passent « Validée » ; le pointage du mois n'est plus modifiable.

### F-07 — Clôturer le mois

- **Titre** : « Clôturer le mois ».
- **Prérequis** : SUPER_ADMIN ou GERANT ; paie au statut Validée (« Validez la paie avant de la clôturer. »).
- **Étapes** : cliquer « Clôturer le mois » → confirmation « Clôturer définitivement la paie MM/YYYY — {chantier} ? Bulletins et pointage du mois seront figés ; les corrections passeront en rappel le mois suivant. » → OK.
- **Erreurs** : « Clôture réservée à SUPER_ADMIN et GERANT. »
- **Résultat** : « Paie clôturée définitivement. » ; bulletins « Clôturée » ; archivage PDF des bulletins qui n'avaient pas encore d'archive. Toute modification ensuite : « Paie clôturée : aucune modification sans décision D7 du SUPER_ADMIN. »

### F-08 — Demander la décision D6 (mois de reprise encore ouverts)

- **Titre** : « Demander la décision D6 ».
- **Où** : barre d'état, à la place de « Valider la paie » quand des mois de reprise restent ouverts (chip « Validation soumise à décision D6 (mois de reprise ouverts) »).
- **Prérequis** : paie Brouillon, droit de validation, pas de D6 existante ; bouton désactivé si 0 bulletin ou modifications en attente.
- **Décision D6 « Clôture des mois de reprise »** (à risque, définitive) : « Attendre » ; « Valider en figeant les paramètres des mois de reprise » ; « Chaîne de clôture séparée pour les mois de reprise ». La validation elle-même se fait ensuite depuis l'écran Paie. Pendant l'attente : chip « Validation bloquée · décision D6 en attente ».
- **Notification** : « Validation de la paie … : mois de reprise encore ouverts ».
- **Règle** : « Politique de clôture (D6) définitive : elle ne se modifie ni ne se supprime. »

### F-09 — Demander la réouverture d'une paie (D7)

- **Titre** : « Demander la réouverture (D7) » → fenêtre « Demander la réouverture — MM/YYYY · {chantier} », sous-titre « Paie {statut} · décision D7 du SUPER_ADMIN ».
- **Prérequis** : paie Validée ou Clôturée ; droit de validation ; pas de D7 déjà ouverte ; **aucun lot de virement généré ou déposé** pour cette paie.
- **Étapes** :
  1. Lire l'avertissement (la paie reste validée/clôturée jusqu'à la décision ; une copie figée sera conservée ; virements exécutés, déclarations et certificats ne sont pas annulés).
  2. Saisir « Motif de la réouverture » (obligatoire, « 10 à 500 caractères, visible du décideur. »).
  3. « Envoyer la demande » (ou « Annuler ») → ouverture de la décision.
- **Erreurs** : « Motif de la réouverture obligatoire (10 caractères minimum). », « Motif trop long (500 caractères maximum). », « Seule une paie validée ou clôturée se réouvre (décision D7). », « Lot de virement généré ou déposé pour cette paie : annulez-le, ou enregistrez son exécution, avant de demander la réouverture. », « Demande de réouverture non autorisée. »
- **Décision D7 « Réouverture d'une paie »** (à risque, SUPER_ADMIN, non délégable) : « Réouvrir la paie » — copie figée de chaque bulletin et de ses lignes, paie et bulletins repassent en Brouillon, pointage de nouveau modifiable, **aucun recalcul sans D3**, virements exécutés conservés, nouveau virement bloqué, déclarations/certificats non modifiés ; « Ne pas réouvrir ». La page de décision affiche le contexte : statut, bulletins, Brut / IRG / Net, copies figées déjà conservées, virements, exports de déclaration, opérations externes, documents émis, mois suivants validés, décisions antérieures.
- **Résultat** : chip « Réouverture demandée · décision D7 en attente » puis, après exécution, paie Brouillon.

### F-10 — Historique des bulletins (copies figées)

- **Titre** : « Historique (N) » → « Historique des bulletins — … », sous-titre « Copies figées conservées avant chaque réouverture (D7) ».
- **Contenu** : recherche « Rechercher un salarié… » ; colonnes Salarié, V. (version), Statut, Brut, IRG, Net, « Figée le » (+ lien D7). Vide : « Aucune copie figée pour cette paie. »
- **Règle** : lecture seule, jamais restaurée automatiquement.

### F-11 — Exports de déclarations depuis l'écran Paie (fenêtre d'export)

- **Boutons** (barre des déclarations) et type produit :
  - « CNAS · G50 · CACOBATPH · Virements (Excel) » → « Déclarations mensuelles (G50 + CNAS) », tous chantiers ; « Ce chantier seulement » → même classeur limité au chantier ;
  - « DAS annuelle YYYY » → « DAS annuelle (classeur) » ;
  - « Fichier CNAS (CSV) » → « Fichier CNAS des cotisations » ;
  - « Fichier DAS (CSV) » → « Fichier DAS » ;
  - « État G50 (imprimer) » → « État G50 ».
- **Fenêtre** : titre « {type} · MM/YYYY » (ou « Année YYYY »), sous-titre chantier ou « Tous les chantiers ». Pendant le chargement : « Vérification du registre et des décisions… ».
  - Section « Mois soumis à décision D10 » avec motifs (« Mois de reprise, déclaré hors de l'application », « Déclaration externe enregistrée »).
  - Blocage : « Export bloqué : décision D10 requise. » → champ « Motif de la demande D10 » (10–500) + « Demander la décision D10 » → « Décision D10 demandée : aucun fichier tant qu'elle n'est pas tranchée. » ; si demande en cours : lien « Ouvrir la décision ».
  - Décision prise : « Décision D10 : {option}. Mois inclus… · exclus… · fichier marqué « ÉTAT DE CONTRÔLE — non déclaratif » ».
  - Avertissement « N fichier(s) officiel(s) déjà produit(s)… double déclaration ».
  - Sections « Registre des exports de l'application », « Déclarations externes enregistrées ».
  - Boutons « Fermer », « Produire le fichier » / « Produire et imprimer » (G50) / « Produire (D10 · option) — une seule fois ».
- **Résultat** : « Fichier produit et inscrit au registre des exports de déclaration. » ; chaque export est enregistré (empreinte SHA-256, totaux, statut de paie FINAL / PROVISOIRE).
- **Fichiers** :
  - Classeur mensuel `Declarations_paie_YYYY-MM.xlsx` : feuilles « Récapitulatif » (CNAS salarié / patronal / total, lignes G50, CACOBATPH congés / intempéries, cotisations supplémentaires, Net à payer, Coût global, effectif, « À corriger avant dépôt » : N° SS / compte manquant), « Livre de paie », « CNAS » (N°, N° SS ou « MANQUANT », Nom, Matricule, Jours, Assiette, Part salariale, Part patronale, Total), « IRG (G50) » (Régime IRG, Base imposable, IRG retenu), « CACOBATPH », « Cotisations supp. » (si besoin), « Virements » (Mode, Compte, Net, sous-totaux).
  - DAS `DAS_CNAS_YYYY.xlsx` (trimestres T1–T4 : jours / assiette ; cumul annuel ; CNAS salarié / employeur…).
  - CSV CNAS `CNAS_COTISATIONS_YYYY_MM.csv` (ligne E ; n° CNAS ; NIF ; MMYYYY ; effectif ; total assiette ; total cotisations) ; CSV DAS `CNAS_DAS_YYYY.csv`.
  - État G50 (HTML imprimable) « État IRG sur salaires — report sur G50 » ; si paie non validée : « Paie non validée : montants susceptibles de changer. Ne pas déposer. »
  - Préfixes de nom : `PROVISOIRE_` (paie non validée), `CONTROLE_` (état de contrôle D10) avec mention « ÉTAT DE CONTRÔLE — reconstitution, non déclaratif (décision D10). NE PAS DÉPOSER. » ; mention des mois exclus.
  - Erreur « Aucun bulletin pour cette période. »
- **Décision D10 « déclaration bloquée »** (à risque) : « Exclure les mois concernés » (si tous les mois sont concernés : « Exclure les mois concernés — aucun fichier ») ; « État de contrôle interne » ; « Fichier officiel — risque de double déclaration ». Exécutée une seule fois depuis l'écran opérationnel.

### F-12 — Registre des exports de déclaration

- **Où** : Paie → « Déclarations » (ou lien « Registre des déclarations »).
- **Étapes** : choisir « Année », « Nouvel export » (type), « Mois », « Chantier », puis « Préparer l'export » → même fenêtre d'export que F-11. Avec une décision D10 (`?decision=`) : panneau « Produire le fichier de la décision (une seule fois) ».
- **Résultat** : liste horodatée de tous les fichiers produits (Officiel / État de contrôle, risque de double déclaration, paie non validée, mois inclus / exclus, empreinte, auteur).

### F-13 — Bulletins de paie (registre Documents) : afficher, imprimer, recalculer

- **Où** : Documents → « Registre » → carte « Bulletin de paie ».
- **Étapes** :
  1. Rechercher (matricule, nom, chantier) ou filtrer par période.
  2. « Afficher » → fenêtre « Bulletin de paie MM/YYYY » (« Fermer » / « Imprimer ») ; « Imprimer » ; « PDF archivé ».
  3. Si le bulletin est **brouillon et périmé** (données modifiées depuis le calcul), « Afficher » / « Imprimer » ouvre d'abord la fenêtre de décision (voir F-14) avec les choix « Recalculer et afficher » ou « Afficher sans recalculer ».
  4. « Recalculer » (brouillon seulement ; infobulle « Recalculer ce bulletin brouillon avec les règles et données actuelles ») → même fenêtre de décision (recalcul forcé).
- **Règle** : un bulletin validé/clôturé n'est jamais recalculé (« Bulletin validé : montants figés. Une réouverture (décision D7) est nécessaire pour recalculer. »).

### F-14 — « Nouveau bulletin de paie » (établir le bulletin d'un salarié)

- **Titre** : « Nouveau bulletin de paie » ; sous-titre « Choisissez l'employé et le mois. La paie du mois couvre tous les chantiers où il a travaillé. »
- **Champs** : « Employé » (liste « Matricule ou nom… »), « Mois » (01–12), « Année ».
- **Étapes** :
  1. Remplir les champs puis « Établir le bulletin » (« Recherche… »).
  2. Si le bulletin existe et est à jour → il s'affiche.
  3. Sinon, étape de décision : encadré « Décision Dx — MM/YYYY » (D4 génération, D3 recalcul ou D1), texte explicatif, éventuel texte de péremption.
  4. Si l'utilisateur peut décider : « Justification de la décision » pré-remplie « Bulletin de paie MM/YYYY de {matricule} {nom}. » (≥ 10 caractères) → « Générer et afficher » ou « Recalculer et afficher » (« Calcul de la paie… ») ; ou « Afficher sans recalculer » (bulletin périmé) ; « Annuler » / « Fermer ».
  5. Si l'utilisateur ne peut pas décider : « Vous êtes à l'origine de la demande : un autre décideur doit la trancher… ».
- **Erreurs** : « Choisissez l'employé, le mois et l'année. », « Aucun contrat de travail payable en MM/YYYY pour cet employé : enregistrez d'abord son contrat. », « La paie de MM/YYYY est établie par chantier (…) et ce salarié n'y figure pas : ajoutez son pointage validé sur ce chantier puis recalculez depuis l'écran Paie. », « La paie de MM/YYYY est déjà validée ou clôturée sans ce salarié : réouvrez-la depuis l'écran Paie. », « Décision prise, calcul échoué : … », « Paie de MM/YYYY calculée, mais sans bulletin pour cet employé (contrat ou pointage du mois à vérifier). »
- **Règles** : la décision directe depuis cette fenêtre n'est possible que pour le **SUPER_ADMIN** et jamais pour D1 ; ce chemin crée une paie « toute l'entreprise » (sans chantier) quand aucune paie par chantier n'existe pour le mois.

### F-15 — Rubriques exceptionnelles (exceptions salariales)

- **Où** : Paie → « Exceptions ».
- **À quoi ça sert** : ajouter ponctuellement (un mois ou jusqu'à un mois de fin) une rubrique hors contrat : prime, indemnité, retenue…
- **Prérequis** : SUPER_ADMIN, ADMIN_RH ou GERANT ; mois non validé/clôturé.
- **Étapes — créer** :
  1. « Nouvelle exception » → fenêtre « Exception salariale ».
  2. « Employé », « Classe », « Rubrique » (filtrée par classe ; montant et unité par défaut pré-remplis).
  3. « Mode » : Pourcentage (*%), Montant (/F), Journalier (*J), Mensuel ÷ jours du mois.
  4. « Valeur » (suffixe %, DA, DA/j, DA/mois ; en classe 5 « · retenue » — montant positif déduit du net).
  5. « Année », « Mois », « Durée » (« Une fois ce mois » / « Jusqu'au mois » + « Fin année » / « Fin mois »).
  6. « Motif obligatoire » puis « Enregistrer » (ou « Fermer »).
- **Validations** : « Choisissez l'employé. », « Choisissez la rubrique. », « Motif obligatoire (8 caractères). », « Indiquez le mois de fin. », « La fin doit être après le début. », « Mois MM/YYYY déjà validé ou clôturé pour cet employé : choisissez un mois ouvert (rappel). »
- **Résultat** : « Brouillon enregistré : il doit être approuvé pour entrer en paie. »
- **Actions par ligne** :
  - « Modifier » (brouillon ; sinon « Seul un brouillon est modifiable : annulez l'exception puis recréez-la. ») ;
  - « Approuver » (brouillon ; si c'est sa propre saisie et qu'on n'est ni Gérant ni Super admin : texte « À approuver par un autre responsable » ; erreur « Double validation : l'exception doit être approuvée par une autre personne (Gérant ou autre responsable). », « Seul un brouillon peut être approuvé ») ;
  - « Supprimer » (brouillon ; confirmation « Supprimer ce brouillon ? ») ;
  - « Annuler » (approuvée ; invite « Motif de l'annulation (facultatif) » ; erreurs « Déjà annulée. », « Exception déjà payée sur une paie validée / clôturée : corrigez par une retenue ou un rappel. » ; si une partie est déjà figée : « Mois déjà validés conservés : l'exception est arrêtée au dernier mois figé. »).
- **Effet paie** : approbation et annulation signalent un changement (source EXCEPTION) → la paie brouillon passe « Données modifiées » (D3).

### F-16 — Avances & prêts

- **Où** : Paie → « Avances ».
- **Étapes — créer** : formulaire « Nouvelle avance / prêt » :
  - « Employé », « Type » (« Avance sur salaire » / « Prêt »), « Montant accordé », « Retenue mensuelle » (indication « N mois » ; placeholder « = montant (1 mois) » pour une avance — vide = tout le montant en une fois), « Première retenue (mois) », « Date d'octroi », « Motif » ;
  - « Enregistrer » (actif quand employé, montant et motif ≥ 3 caractères sont remplis).
- **Validations** : « Employé requis », « Montant requis », « Mensualité requise », « Date invalide », « Motif requis (3 caractères min.) », « La mensualité dépasse le montant. »
- **Résultat** : « Enregistré : la retenue sera appliquée sur les prochaines paies. »
- **Annuler** : bouton « Annuler » → confirmation « Annuler {type} de {employé} ? Le reste ne sera plus retenu. »
- **Règles** :
  - « Retenu » = somme des lignes de retenue liées à l'avance sur **toutes** les paies (y compris brouillons) ; « Reste » = montant − retenu.
  - Retenue mensuelle appliquée **après l'IRG**, limitée au reste dû et au net disponible (le net ne devient jamais négatif) ; libellés « Retenue avance » (code AVANCE) / « Remboursement prêt » (code PRET) ; ni cotisable ni imposable.
  - Le mois de sortie du salarié, le solde restant est retenu en totalité (dans la limite du net).
  - Toute création/annulation signale un changement (ADVANCE) → D3 si paie brouillon.

### F-17 — Opérations externes (paiements et déclarations faits hors application)

- **Où** : Paie → « Opérations externes ».
- **À quoi ça sert** : enregistrer les paiements et déclarations faits en dehors de l'application, afin de bloquer les doublons (virements → D9, déclarations → D10).
- **Créer** : « Nouvelle opération externe » (permission création) → champs « Type » (Paiement / Déclaration), « Sous-type » (Paiement : Salaires / Autre ; Déclaration : G50 (IRG) / CNAS / DAS annuelle / Autre), « Période : du mois », « au mois » (« 12 mois au plus »), « Chantiers » (Tous / sélection), « Salariés » (Tous / recherche), « Date de l'opération », « Référence », « Organisme », « Montant (DA) », « Origine de l'information » (« Déclaratif (sans pièce) » / « Sur pièce (à joindre ensuite) »), « Description » (10–1000).
- **Carte d'une opération** : type · sous-type, période, chantiers, salariés, « Version N », statut (« Remplacée par une correction », « Retirée · compte toujours pour le blocage »), description, Date / Référence / Organisme / Montant / Origine, 3 indicateurs (« Information déclarée » ; « Enregistrement confirmé » / « non confirmé » ; « Aucune pièce » / « Pièce jointe, non examinée » / « Pièce examinée »).
- **Actions (opération active)** : « Corriger » (nouvelle version ; « Motif de la correction » 10–500), « Confirmer l'enregistrement » (permission confirm, avec confirmation), « Joindre une pièce » (PDF, JPEG, PNG, WebP, 15 Mo max), par pièce « Voir », « Examiner » (permission examine ; observation ≥ 10 caractères), « Remplacer », et « Retirer » (motif ≥ 10). Séparation des tâches entre saisie, confirmation et examen (⚠ règle exacte à vérifier à l'écran).
- **Messages** : « Description obligatoire (10 caractères minimum). », « Sous-type incompatible avec le type. », « Période invalide (fin avant début). », « Motif de la correction obligatoire… », « Motif du retrait obligatoire (10 à 500 caractères). », « Observation obligatoire (10 à 1000 caractères). », « Pièce refusée : PDF, JPEG, PNG ou WebP uniquement. », « Pièce trop volumineuse (15 Mo maximum). » ; succès : « Opération externe enregistrée. », « Correction enregistrée : nouvelle version créée, l'ancienne est conservée. », « Enregistrement confirmé. », « Opération retirée (conservée dans le registre). », « Pièce jointe, non examinée. », « Pièce remplacée : la nouvelle pièce n'est pas examinée. », « Pièce examinée. »
- **Règle clé** : une opération, même retirée, remplacée ou non confirmée, continue de bloquer virements et déclarations correspondants.

### F-18 — Virements des salaires (lots CCP / banque) et décision D9

- **Où** : Paie → « Virements ».
- **Prérequis** : bulletins Validés ou Clôturés ; compte du salarié renseigné dans sa fiche ; mode de paiement du salarié = mode du lot ; net > 0 ; bulletin pas déjà dans un lot actif.
- **Étapes — lot ordinaire** :
  1. Choisir « Année », « Mois », « Mode », « Chantier », saisir « Compte donneur d'ordre » et « Date de valeur ».
  2. « Préparer le lot » → aperçu : « N virement(s) · X DA », chips « bulletin(s) brouillon exclus », « déjà dans un lot », « compte(s) à corriger » (motifs : « Compte CCP manquant », « Compte CCP > 10 chiffres », « Clé CCP (2 chiffres) manquante », « RIB bancaire incomplet (20 chiffres attendus) »).
  3. « Générer le fichier » → confirmation « Générer le lot {mode} : N virement(s), total X DA ? Les bulletins inclus ne pourront plus être réouverts tant que le lot n'est pas annulé. »
  4. Télécharger via « Fichier » ; suivre le lot : « Déposé » (fenêtre « Dépôt du lot X » : « Référence du bordereau / accusé » obligatoire, « Date de dépôt », « Enregistrer le dépôt »), « Exécuté », « Annuler le dépôt », « Annuler le lot » (invite « Motif de l'annulation (obligatoire) : »).
- **Bulletins bloqués (D9)** : section « N bulletin(s) bloqué(s) · X DA — aucun virement sans décision D9 » avec motifs (paie de reprise ; « Salaire du mois déjà viré par un lot exécuté » ; « Paiement externe enregistré »). Cocher les bulletins, saisir « Motif de la demande D9 » (10–500), « Demander la décision D9 (N) » → « Décision D9 demandée : aucun virement tant qu'elle n'est pas tranchée par un décideur habilité. » + « Ouvrir la décision ».
- **Décision D9** (à risque) : « Aucun virement » ; « État de rapprochement non bancaire » ; « Lot de virement réel — risque de double paiement ». Après décision, dans « Décisions D9 du mois » : « Générer le lot (D9) » (confirmation avec « RISQUE DE DOUBLE PAIEMENT ») ou « Produire l'état de rapprochement » (confirmation « …(une seule fois) ? Ce n'est pas un ordre de paiement. » → CSV).
- **Erreurs** : « Aucun bulletin virable par un lot ordinaire pour ce mode (déjà en lot, brouillon, compte manquant ou bloqué D9). », « Décision D9 « lot de virement réel » requise (décidée, non encore utilisée). », « Lot différent du périmètre de la décision D9 (mois, chantier ou mode). », « Certains bulletins de la décision D9 ne peuvent plus être virés… », « Numéro de lot pris par une création simultanée : réessayez. », « Un bulletin vient d'être inclus dans un autre lot : régénérez. », « Motif de la demande obligatoire (10 à 500 caractères). »
- **Formats de fichier** :
  - CCP (`CCP_TXT_V1`) : texte à positions fixes, enregistrements en-tête / détail / total, montants en centimes, noms en majuscules ASCII ;
  - Banque (`BANK_CSV_V1`) : en-tête « RIB;Beneficiaire;Montant;Libelle;Matricule » ;
  - libellé « SALAIRE MM/YYYY » ; nom `VIR_{mode}_{n° lot}_{date}.txt|csv` ; numéro de lot issu du registre « VIR » ; empreinte SHA-256 affichée ;
  - état de rapprochement : en-tête « ETAT DE RAPPROCHEMENT NON BANCAIRE - CE N'EST PAS UN ORDRE DE PAIEMENT - NE PAS DEPOSER ».
- **Tableau des lots** : Lot (n°, date, auteur, SHA-256, « Risque de double paiement » + lien D9), Mode (+ format), Chantier, Virements, Total (DA), Statut / dépôt (« Généré » / « Déposé » / « Exécuté » / « Annulé », Réf., date d'exécution, motif d'annulation).
- **Liens** : F-09 (un lot généré/déposé empêche la réouverture), F-17.

### F-19 — Coûts par chantier / contrat et écriture comptable

- **Où** : Paie → « Coûts ».
- **Étapes** : choisir « Année », « Mois » ; consulter les tableaux ; exporter « Répartition (CSV) » ou « Écritures comptables (CSV) » (désactivé si l'écriture est déséquilibrée : « Écriture déséquilibrée : export bloqué. ») ; « Plan de comptes » (finance / gérance / super admin).
- **Tableaux** :
  - par chantier : Chantier, Effectif, Brut, Charges patronales, Coût employeur, Part ;
  - par contrat client : Contrat client (ou « Non affecté »), Chantier, Quote-part du chantier, Coût imputé ;
  - « Écriture de paie · journal {code} » : Compte, Libellé, Analytique, Débit, Crédit, Totaux.
- **Formules** :
  - Brut = somme des lignes hors retenues ; Charges patronales = CNAS employeur (+ FOS) + CACOBATPH + intempéries part patronale + cotisations supplémentaires patronales ; Coût employeur = Brut + Charges.
  - Répartition chantier → contrats : contrats clients non brouillon actifs sur le mois ; quote-part = jours de chevauchement du contrat / total des jours.
  - Écriture (comptes par défaut) : Débit 631 salaires (brut) et 635 charges, ventilés par chantier (analytique) ; Crédit 431 CNAS (salarié + patronal + extras CNAS), 4318 CACOBATPH (congés + intempéries salarié et patronal + extras), 442 IRG (+ autres extras), 425 avances, 427 retenues, 421 net à payer.
- **Plan de comptes** : « Code journal » (2 à 10 caractères A-Z/0-9, défaut PAIE), comptes à 2–10 chiffres (« Compte invalide pour « … » (chiffres uniquement). ») ; succès « Plan de comptes enregistré. »
- **Fichiers** : `ECRITURES_PAIE_YYYY_MM.csv` (Journal ; Date = dernier jour du mois ; Pièce PAIE-YYYYMM ; Compte ; Libellé ; Analytique ; Débit ; Crédit) ; `COUTS_PAIE_YYYY_MM.csv` ; préfixe `PROVISOIRE_` si la paie n'est pas validée (au moins une paie brouillon).

### F-20 — Simulateur (fiche de paie)

- **Où** : menu « Simulateur », sous-onglet Paie « Simulateur », raccourci « Simulateur » de l'écran Paie (`/simulateur?cible=paie`).
- **À quoi ça sert** : tester l'effet d'un changement (salaire, pointage, taux, barème IRG, rubriques…) sur une fiche de paie **sans rien enregistrer**.
- **Éléments simulables** : « Fiche de paie » (كشف الأجر, RH · Paie), « Pointage mensuel », « Solde de congé », « Titre de congé », « Solde de tout compte (STC) », « Ordre de mission », « Contrat de travail ».
- **Étapes** :
  1. Dans « Élément à tester », choisir « Fiche de paie ».
  2. Choisir un « Salarié » (ou laisser vide = « scénario libre »), le « Mois » et l'« Année ».
  3. Facultatif : « Afficher à côté » un second élément (ex. Pointage mensuel) — les deux sont « Liés » : « Cliquez une case d'un document ou changez une variable : l'autre se recalcule aussitôt. »
  4. Ajouter des variables dans les zones « Gauche », « Droite », « Bas » (« + Variable » / « Chercher et ajouter une variable ») ou cliquer une case du bulletin pour la modifier (la valeur ERP est rappelée : « ERP : … »).
  5. Lire les indicateurs : « Brut cotisable », « Imposable », « CNAS salarié », « Base IRG », « IRG », « Net à payer », « Coût employeur », « Écart net / contrat » (écart « vs réf. »).
  6. « Figer comme référence » (comparer à partir d'un état), « Tout rétablir ».
- **Variables disponibles (groupes)** : Contrat de travail (Salaire de base, Net de référence, dates) ; Jours & pointage (jours de contrat dans le mois, jours payés, présence, travaillés, congé, absence, week-ends/fériés, abandon, rappels, congé annuel CA) ; Pointage (code de chaque jour) ; Heures supplémentaires ; CNAS & cotisations (Régime CNAS, parts, FOS, CACOBATPH congés / intempéries applicables) ; IRG (Option IRG : Automatique, Barème général, Zone, Handicapé/retraité, Exonéré, Taux libératoire ; catégorie, zone, taux libératoire) ; Barème IRG (tranches) ; Règles IRG ; Rubriques (active / valeur / mode : Mensuel, / jour payé, / jour présence, Mensuel ÷ jours du mois, % du base) ; Exceptions de paie ; Avances & sortie ; Variables légales (SNMG, Diviseur journalier, Heures mensuelles, CACOBATPH, CNAS…).
- **Avertissements** : « Valeurs légales modifiées dans cette simulation (valeurs non officielles). Rien n'est enregistré. » ; « Modifiées hors panneaux : … » (avec « afficher » / ↺).
- **Remarque** : « Éditer la mise en page » ouvre l'éditeur du modèle de document (bulletin) — fonctionnalité de paramétrage des modèles (⚠ à documenter avec le chapitre Documents/Paramètres).

### F-21 — Barème IRG (renvoi)

`/rh/paie/irg` redirige vers Cotisations & impôts → onglet IRG. Écran « Barème IRG » : « Version du barème », « Jeu de règles (catégorie) », « Simulation — base IRG mensuelle (DA) », « Tranches annuelles » (Min annuel, Max annuel, Taux %, « Ajouter une tranche », « Enregistrer les tranches du brouillon »), « Règles Art. 104 » (catégorie « Salarié » / « Handicapé / retraité », type, séquence, « S'applique à », Min/Max mensuel, Taux %, « Formule [IRG_AFTER_ABATEMENT] », « Jetons à déduire »). Tout changement est un brouillon « sans effet avant sa soumission, son approbation et la décision D2 » ; le mois d'application est fixé par D2. → À détailler dans le chapitre « Cotisations & impôts ».

---

## 4. Règles de calcul de la paie (ordre d'exécution)

Données prises en compte pour un mois (au 1er du mois pour les règles) : variables légales, barème et règles IRG, cotisations supplémentaires, contrats (affectation principale, statut brouillon/actif, ou terminé dans le mois ; intérim exclu), affectation du mois (chantier), légendes de présence et coefficients en vigueur, **pointage validé uniquement** (filtré par chantier pour une paie de chantier), activité du chantier (CACOBATPH congés / intempéries applicables), catégorie IRG et NSS du salarié, régimes manuels (conformité), rubriques actives et affectations de rubriques, grille salariale, exceptions **approuvées**, historique de salaire, heures supplémentaires du pointage, avances actives, sorties validées du mois (lignes de solde).

1. **Congé payé par la caisse** : si la CACOBATPH congés s'applique, les jours de congé annuel (CA) sont retirés des jours payés (« N j de congé annuel payés par la CACOBATPH, exclus du bulletin »).
2. **Jours** :
   - jours payés = Σ des coefficients des légendes des jours validés, plafonné aux jours couverts par le contrat ;
   - jours travaillés = présence (P, P/2, MS, CRP… ou codes « comptant comme présence ») hors CRP pleine ;
   - jours CRP (récupération) : CRP = 1, CRP/2 = 0,5.
3. **Fraction de mois** = jours couverts / jours calendaires − jours non payés / diviseur (variable `NJM_DIVISEUR_FIXED`, 30 par défaut), bornée entre 0 et 1 (mois complet = 1 ; contrats successifs dans le mois = somme 1).
4. **Contrôles / avertissements** : plusieurs contrats principaux (fusion sur le plus récent), jours pointés > jours de contrat (plafonnés), base < grille (poste / grade), NSS manquant, base < SNMG.
5. **Salaire de base** (code BASE, classe 1, cotisable et imposable) = base × fraction de mois × part travaillée, où part travaillée = (payés − CRP) / payés si des jours CRP existent.
6. **Rubriques permanentes** (priorité d'affectation : salarié > contrat > poste > chantier). Unités : par jour → quantité = jours payés travaillés (payés − CRP) ; par jour de présence / « mensuel ÷ jours du mois » → jours travaillés ; mensuel et pourcentage → fraction de mois. Pourcentage = base mensuelle × taux / 100 × quantité. Retenue de classe 5 en mensuel → convertie au prorata (montant × jours travaillés payés / jours calendaires). Les retenues (classe 5) sont toujours négatives. Les rubriques par jour travaillé sont ignorées quand il n'y a que des jours CRP.
7. **Rubriques de récupération** (portée CRP) : seulement sur les jours CRP, libellé suffixé « (récupération) » ; par jour → chaque jour CRP ; mensuel → réparti ; pourcentage → quantité = jours CRP / jours calendaires ; non ajoutées si la même rubrique fixe existe déjà.
8. **Exceptions approuvées** (une fois ou jusqu'au mois de fin) : quantité selon l'unité, sur la base des jours payés complets.
9. **Lignes supplémentaires** : heures supplémentaires — taux horaire = base / `HEURES_MENSUELLES` (173,33 par défaut) ; montant = heures × taux horaire × (1 + majoration) ; classe 1, libellé « Heures supplémentaires X % » ; lignes du solde de sortie.
10. **Classes** : 1 = cotisable + imposable ; 2 = cotisable seulement ; 3 = imposable seulement ; 4 et 5 = ni l'un ni l'autre. Montant négatif accepté seulement en classe 5 (« Montant négatif accepté seulement en classe 5 (retenues). »).
11. **Cotisations** :
    - brut cotisable = Σ lignes cotisables ; imposable = Σ lignes imposables ;
    - CNAS salarié = assiette × taux salarié du régime ;
    - CNAS employeur = assiette × (taux employeur + FOS) (Décret 15-236 : 25 % + 0,5 % FOS, affiché séparément) ;
    - CACOBATPH congés et intempéries (salarié / patronal) seulement si l'activité du chantier les prévoit ;
    - cotisations supplémentaires (définies dans les variables légales).
12. **IRG** : base IRG = max(0, imposable − CNAS salarié − cotisations salariales supplémentaires déductibles). Mode : Exonéré → 0 ; taux libératoire → base × taux ; sinon barème selon la catégorie (Standard / Handicapé-retraité), abattement de zone (sur la base ou sur l'impôt), seuil d'exonération mensuel, barème progressif annualisé (base × 12, puis ÷ 12), abattement sur l'impôt (taux borné min/max), formule de lissage entre deux seuils mensuels.
13. **Net** = gains + retenues − CNAS salarié − intempéries salarié − cotisations salariales supplémentaires − IRG.
14. **Avances / prêts** (après IRG) : mensualité limitée au reste dû et au net disponible, jamais de net négatif ; mois de sortie = solde total ; puis recalcul du récapitulatif.

Chaque bulletin conserve la photographie des règles utilisées et une trace (voir F-04).

---

## 5. Décisions liées à la paie — synthèse

| Code | Intitulé | Options | Qui décide | Remarques |
|---|---|---|---|---|
| D1 | Paie d'un mois aux règles non approuvées | Attendre l'approbation des règles · Calculer une simulation non validable | décideur habilité (`hr_payroll` update) | Simulation sans bulletin réel |
| D2 | Date d'application d'une règle légale | — | voir chapitre Cotisations & impôts | Référencée dans la traçabilité |
| D3 | Recalcul des paies brouillon | Recalculer les bulletins concernés · Conserver les bulletins tels quels | décideur habilité | Bloque la validation tant qu'elle n'est pas tranchée |
| D4 | Génération de paie | Générer la paie du mois · Ne pas générer | décideur habilité | Paie brouillon, règles au 1er du mois |
| D6 | Clôture des mois de reprise (à risque) | Attendre · Valider en figeant les paramètres des mois de reprise · Chaîne de clôture séparée | décideur habilité | Définitive |
| D7 | Réouverture d'une paie (à risque) | Réouvrir la paie · Ne pas réouvrir | **SUPER_ADMIN uniquement** | Copies figées, pas de recalcul sans D3 |
| D8 | Correction d'affectation | — | (autre chapitre) | Visible dans la traçabilité |
| D9 | Virement bloqué (à risque) | Aucun virement · État de rapprochement non bancaire · Lot de virement réel | décideur habilité | Exécutée une seule fois depuis Virements |
| D10 | Déclaration bloquée (à risque) | Exclure les mois concernés · État de contrôle interne · Fichier officiel | décideur habilité | Exécutée une seule fois depuis l'export |
| D13 | Contrat ne commençant pas le 1er | — | (autre chapitre) | Contrôle de la Préparation |
| D14 | Coefficient d'un code de présence | Appliquer · Refuser | (autre chapitre) | Mois d'effet daté |
| D16 | Périmètre de zone IRG | — | (autre chapitre) | Visible dans la traçabilité |

---

## 6. Incertitudes et points à vérifier

1. **Avances : classe 4 ou 5 ?** Le texte de l'écran « Avances & prêts » dit « classe 4, hors cotisations et IRG », mais le moteur de calcul crée les lignes AVANCE / PRET en **classe 5 (retenues)**. Sur le bulletin, elles apparaissent donc avec les retenues. À confirmer avec l'équipe avant rédaction.
2. **Arabe** : `bi()` ne renvoie que le français ; vérifier à l'écran quels libellés arabes sont réellement visibles (statuts, bulletin imprimé, description de l'écran Paie).
3. **Sélecteur « Chantier » de l'écran Paie** : non vérifié s'il propose une option « toute l'entreprise » (paie sans chantier créée par « Nouveau bulletin de paie »). Le tableau, lui, liste tous les bulletins du mois tous chantiers confondus.
4. **Droits exacts sur les virements** (dépôt, exécution, annulation) et sur la séparation des tâches des opérations externes : à vérifier dans les politiques de la base / à l'écran.
5. **Libellés exacts** de certains messages raccourcis par « … » dans ces notes (D9 « Certains bulletins… », bandeau reprise, description « Bulletins déjà établis… ») : à recopier depuis l'écran lors des captures.
6. **Vues Social / Fiscal** : la barre de déclarations et les demandes de génération n'y reçoivent pas toutes les données (demandes de génération, archives PDF non transmises) ; comportement exact du chip « Génération demandée » et du bouton « PDF archivé » dans ces vues à vérifier.
7. **Simulateur** : seules la fiche de paie et la barre générale ont été lues en détail ; les autres éléments (pointage, congés, STC, mission, contrat) relèvent d'autres chapitres. Le fonctionnement de « Éditer la mise en page » (éditeur de modèle, approbation) n'a pas été étudié.
8. **Format exact des fichiers CCP / CSV / DAS** : décrit d'après le code ; les spécifications officielles CCP / banque / CNAS ne sont pas validées (le code lui-même indique un « format générique » à faire valider par la banque / Algérie Poste).
