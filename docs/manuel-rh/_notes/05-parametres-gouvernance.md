# 05 — Paramètres RH et gouvernance (notes pour le Manuel d'utilisation RH)

> Notes de travail destinées à la rédaction du manuel et des scripts vidéo. Rédigées à partir du code source
> (Next.js, `nedjm-froid-erp/src`) et des migrations Supabase (`supabase/migrations`). Aucune donnée réelle n'a été consultée.
>
> Conventions :
> - Les libellés entre « » sont les textes exacts de l'interface.
> - **[À VÉRIFIER]** = point déduit du code mais non confirmé à l'écran ou en base de production.
> - **[INCOHÉRENCE]** = écart constaté entre deux parties du code (à signaler aux développeurs, à ne pas présenter comme une fonction).
> - « SA » = rôle SUPER_ADMIN.

## 0. Remarques générales sur l'interface

- **Langue des écrans RH** : dans tout le module RH, la fonction d'affichage des libellés (`bi()` dans `rh-ui.tsx`)
  affiche **uniquement le français** ; les traductions arabes présentes dans le code ne sont **pas affichées**.
  Exceptions où de l'arabe apparaît réellement :
  - certains libellés qui contiennent de l'arabe dans leur partie française (ex. « Mode (نسبة / مبلغ / برام) »),
  - la liste déroulante « Liste » des Listes et codes (affiche « libellé FR — libellé AR »),
  - les placeholders de saisie arabe (« التسمية », « حاضر »),
  - le paragraphe d'aide des Légendes de présence (rédigé **seulement en arabe**),
  - les écrans hors module RH (Paramètres, Interface, Accès par compte, Centre de décisions partiellement), qui affichent
    souvent « FR · AR » (ex. « Paramètres · الإعدادات »).
  - Les messages d'erreur renvoyés par le serveur sont souvent bilingues « FR · AR ».
- **Onglets masquables** : les barres d'onglets marquées d'une clé d'interface (Paramètres RH, Rubriques de salaire,
  Centre de décisions…) peuvent être masquées / réordonnées / renommées par rôle (Paramètres → Interface) ou par compte
  (Paramètres → Accès par compte). Le manuel doit donc préciser : « si un onglet n'apparaît pas, voir avec l'administrateur ».
- **Page masquée** : si un utilisateur ouvre une page masquée pour son rôle, il est renvoyé au Tableau de bord avec le message
  « Cette page n'est pas affichée pour votre rôle (Paramètres → Interface). · هذه الصفحة غير معروضة لدورك. ».
  Si la page est refusée par rôle : « Accès refusé pour votre rôle. · الوصول مرفوض لدورك. ».
- **Champs obligatoires** : dans les formulaires RH, un astérisque rouge « * » suit le libellé quand le champ est marqué obligatoire.
- **Notifications** : une cloche en haut à droite (voir § C.7).

---

# PARTIE A — Paramètres RH (`/rh/parametres`)

## A.0 Page « Paramètres RH » — accès et mise en page

**Où la trouver** : menu latéral « Ressources Humaines » → onglet « Paramètres » (section « Paramètres » de la barre RH) ;
ou carte « Paramètres RH » de la page Paramètres (`/parametres`) ; URL `/rh/parametres`.
Un onglet précis peut être ouvert directement par l'URL : `?tab=salary|legal|fiche|catalogs|bulletin|attendance`
(et pour Cotisations & impôts : `&section=cnas|cacobatph|irg|other`).

**Mise en page (de haut en bas)** :
1. Titre de la barre supérieure : « Paramètres RH ».
2. En-tête de page : sur-titre « Configuration du module RH », titre « Paramètres ».
3. **Vue d'ensemble** (cartes de synthèse, § A.1).
4. Titre « Configuration détaillée ».
5. Bandeau rouge d'erreur de chargement éventuel (message technique).
6. **Barre d'onglets** :
   | Onglet | Visible pour |
   |---|---|
   | « Rubriques de salaire » (par défaut) | tous ceux qui ouvrent la page |
   | « Cotisations & impôts » | seulement si l'utilisateur peut lire les paramètres légaux |
   | « Modèle de fiche » | tous |
   | « Listes et codes » | tous |
   | « Modèle de bulletin » | tous |
   | « Feuille de présence » | **SA uniquement** |
7. Contenu de l'onglet choisi.

**Droits** : la page elle‑même n'a pas de contrôle de rôle dans le code ; ce qui est modifiable dépend :
- du rôle (contrôles en dur, détaillés par onglet),
- du droit « Paramètres RH » (écran `hr_settings`, colonne « M » = Modifier) de la Matrice des permissions pour les listes,
  le modèle de fiche et le modèle de bulletin (règles d'accès en base).
- Par défaut (migration `grh_hub`) : Lire pour SUPER_ADMIN, ADMIN_RH, GERANT, ADMIN_FINANCE, CHEF_CHANTIER, READ_ONLY ;
  Créer/Modifier pour SUPER_ADMIN, ADMIN_RH, GERANT ; Supprimer pour SUPER_ADMIN, ADMIN_RH. **[À VÉRIFIER]** valeurs actuelles dans la matrice.

## A.1 Vue d'ensemble des paramètres (`rh-settings-overview`)

**À quoi ça sert** : lecture rapide des chiffres clés avant d'entrer dans les onglets. Lecture seule.

**Contenu** :
- Carte « Cotisations sociales » (lien « Modifier » → `/rh/parametres?tab=legal&section=cnas`) : lignes
  « CNAS — part salariale », « CNAS — part patronale », « Œuvres sociales », « CACOBATPH » avec le taux en %. Si aucun taux :
  « Taux non renseignés ».
- Carte « Barème IRG mensuel » (lien « Modifier » → `?tab=legal&section=irg`) : une ligne par tranche du barème en vigueur
  pour l'année/mois courants, bornes **annuelles divisées par 12** (« a – b DA », ou « > a DA » pour la dernière), barre
  proportionnelle et taux. Sinon « Aucun barème en vigueur ».
- Carte « Paramétrage » : compteurs « Rubriques de salaire », « Listes et codes » (nombre de **types** de listes),
  « Champs de la fiche employé » (champs actifs), « Légendes de pointage ».
- Quatre tuiles-liens : « Chantiers » (« N site(s) » → `/referentiels/chantiers`), « Postes & grille » (« Postes et salaires »
  → `/rh/postes`), « Cotisations & impôts » (« CNAS, IRG, régimes » → `?tab=legal`), « Qualité des données »
  (« Fiches à compléter » → `/rh/qualite-donnees`).

---

## A.2 Onglet « Rubriques de salaire » (`salary-rubrics-manager`)

### A.2.0 Mise en page et droits

- En-tête : titre « Rubriques de salaire » ; texte : « SUPER_ADMIN définit si la rubrique s'applique au contrat, au chantier
  ou à l'employé, puis gère le dictionnaire et les valeurs (ajout, modification, suppression). » (le paragraphe arabe
  qui suit dans le code est rendu en `dir=rtl` — **[À VÉRIFIER]** s'il s'affiche : il est écrit en dur, donc probablement oui).
- Bandeau selon le rôle :
  - ni SA ni rôle « valeurs » : « Consultation uniquement. »
  - ADMIN_RH / GERANT (non SA) : « Le dictionnaire reste SUPER_ADMIN. Vous pouvez saisir les montants (contrat / chantier / employé). »
- Sous-onglets : « Dictionnaire » | « Valeurs » | « Import » (Import **visible SA uniquement**).
- Droits (contrôlés côté serveur) :
  | Action | Qui |
  |---|---|
  | Créer / modifier / masquer / supprimer une rubrique (dictionnaire), import | **SUPER_ADMIN seul** (« Contrôle des rubriques réservé à SUPER_ADMIN. ») |
  | Saisir / modifier / supprimer une valeur | SUPER_ADMIN, ADMIN_RH, GERANT (« Saisie des montants réservée à SUPER_ADMIN, ADMIN_RH et GERANT. ») |
  | Consulter | toute personne ayant le droit de lire les données salariales (contrats, paie, bulletins, exceptions ou Paramètres RH) |
- Messages en haut de l'onglet : rouge = erreur, vert = succès.

### A.2.1 Créer une rubrique (Dictionnaire)

**Où** : Paramètres RH → Rubriques de salaire → « Dictionnaire ».
**À quoi ça sert** : définir une ligne de bulletin (prime, indemnité, retenue…) : son code, son libellé, sa classe
fiscale (CNAS/IRG), son mode de calcul et le niveau où l'on saisit sa valeur par défaut.
**Prérequis** : être SA.

**Champs du formulaire (panneau du haut)** :
| Libellé | Obligatoire | Valeurs / contrôle |
|---|---|---|
| « Code » (placeholder « 302 ») | Oui | 1 à 40 caractères, mis en **MAJUSCULES**. Pour une **nouvelle** rubrique, le 1er chiffre propose automatiquement la classe (1xx → classe 1 … 5xx → classe 5). |
| « Libellé FR » | Oui | 1 à 160 caractères |
| « Libellé AR » | Oui | 1 à 160 caractères (saisie de droite à gauche) |
| « S'applique à » | Oui (défaut « Chantier ») | « Chantier », « Contrat », « Employé », « Poste ». C'est le **niveau proposé par défaut** pour les valeurs. |
| « Nature » | Oui (défaut « Indemnité ») | « Indemnité », « Prime », « Rappel », « Remboursement », « Retenue ». Forcée à « Retenue » si classe 5. |
| « Mode (نسبة / مبلغ / برام) » | Oui (défaut « Journalier *J ») | « Pourcentage *% », « Montant /F », « Journalier *J », « Journalier présence », « Mensuel ÷ jours du mois » (voir A.2.5) |
| « Classe fiscale » | Oui (défaut 1) | « 1 · CNAS + IRG », « 2 · CNAS », « 3 · IRG », « 4 · Ni CNAS ni IRG », « 5 · Retenues » |
| « Montant par défaut » (devient « Montant positif (retenu du net) » en classe 5) | Non (0) | nombre entre −99 999 999 et 99 999 999 ; **négatif accepté seulement en classe 5** |
| « Cotisable CNAS (classe) » / « Imposable IRG (classe) » | — | cases **grisées, non modifiables** : déduites de la classe (1 = les deux, 2 = CNAS, 3 = IRG, 4 et 5 = aucune) |

**Étapes** :
1. Remplir Code, Libellé FR, Libellé AR.
2. Choisir « S'applique à », « Nature », le mode, la classe (vérifier la classe proposée).
3. Saisir éventuellement un montant par défaut.
4. Cliquer « Ajouter une rubrique ».

**Messages** :
- « Saisissez le code et les deux libellés. » (contrôle avant envoi)
- « Montant négatif accepté seulement en classe 5 (retenues). · المبلغ السالب مقبول فقط في الصنف 5 (الاقتطاعات). »
- « Contrôle des rubriques réservé à SUPER_ADMIN. · … »
- « Enregistrement refusé (droits). »
- Code déjà existant : erreur technique de la base (contrainte d'unicité) — **[À VÉRIFIER]** texte exact affiché.
- Succès : « Rubrique enregistrée. » ; le formulaire se vide.

**Résultat** : la rubrique apparaît dans le tableau (tri par classe puis par code). Elle devient disponible pour les valeurs,
les contrats et la paie.

**Points d'attention** :
- L'**ordre d'affichage** (sort_order) n'est pas modifiable dans le formulaire (10 par défaut pour une création manuelle ;
  l'import utilise le numéro du code).
- Toute sauvegarde **réactive** la rubrique (elle est envoyée « active »).

### A.2.2 Modifier, masquer/afficher, supprimer une rubrique

**Tableau du dictionnaire** — colonnes : « Code », « FR », « AR », « Application », « Unité », « Classe », « Défaut »,
puis boutons. Recherche : « Rechercher une rubrique… ». Vide : « Aucune rubrique pour le moment. ». Les rubriques
masquées sont affichées en grisé.

- **« Modifier »** (visible pour tous) : charge la rubrique dans le formulaire (et la présélectionne dans l'onglet Valeurs).
  Pour un non‑SA, les champs restent grisés. Pour le SA : modifier puis « Modifier la rubrique » ; « Nouveau » vide le formulaire.
  Message : « Rubrique enregistrée. ». En modification, la classe **n'est plus proposée** automatiquement à partir du code.
- **« Masquer » / « Afficher »** (SA) : désactive/réactive la rubrique. Une rubrique masquée n'est plus proposée dans
  l'onglet Valeurs et n'est plus calculée en paie (le calcul ne retient que les rubriques actives). Erreur possible :
  « Mise à jour refusée. ».
- **« Supprimer »** (SA) : confirmation navigateur « Supprimer {libellé FR} / {libellé AR} et ses valeurs ? ». Les valeurs
  (affectations) de la rubrique sont supprimées avec elle. Message : « Rubrique supprimée. ». Erreur : « Suppression refusée. ».
  **[À VÉRIFIER]** : la suppression est refusée par la base si la rubrique est utilisée par une exception de paie
  (lien « restrict ») — message technique probable.

**Point d'attention — changement de « S'applique à »** : l'interface annonce « Rubrique enregistrée. Les anciennes valeurs
ont été effacées car le niveau d'application a changé. », mais le code serveur actuel **n'efface jamais** les valeurs lors
d'une modification manuelle (indicateur toujours « faux »). **[INCOHÉRENCE]** Seul l'import avec l'option « Remplacer le
niveau d'application » efface les valeurs (A.2.4).

### A.2.3 Saisir les valeurs (onglet « Valeurs »)

**À quoi ça sert** : fixer le montant d'une rubrique pour un chantier, un poste, un contrat ou un employé.
**Prérequis** : rôle SUPER_ADMIN, ADMIN_RH ou GERANT ; rubrique active ; la cible existe (chantier, poste, contrat, employé).

**Champs** :
| Libellé | Obligatoire | Détail |
|---|---|---|
| « Rubrique » | Oui | liste des rubriques **actives** : « code · FR — AR · Application ». Choisir une rubrique pré‑remplit le montant avec la valeur par défaut. |
| « Niveau » (aide : « Priorité : employé > contrat > poste > chantier ») | Oui | « Chantier », « Poste » (affiché seulement s'il existe des postes), « Contrat », « Employé ». Par défaut = « S'applique à » de la rubrique. Grisé tant qu'aucune rubrique n'est choisie. |
| « Cible (Niveau) » | Oui | champ « Rechercher » + liste. Libellés : employé « matricule · NOM Prénom » ; chantier « code · nom » ; contrat « matricule · employé · chantier · poste » ; poste « code · libellé ». La recherche limite à 300 résultats. |
| « Montant » | Oui (0 par défaut) | nombre ; négatif seulement pour une rubrique de classe 5 |

**Étapes** : choisir la rubrique → (éventuellement) changer le niveau → rechercher et choisir la cible → saisir le montant →
« Ajouter une valeur ». Pour corriger : bouton « Modifier » de la ligne → ajuster → « Modifier la valeur » (« Nouveau » pour
revenir en création).

**Messages** :
- « Choisissez la rubrique et la cible (employé, chantier ou contrat). »
- « Cette valeur existe déjà pour cette cible. · هذه القيمة موجودة مسبقاً لهذا الهدف. » (une seule valeur par rubrique et par cible)
- « Rubrique introuvable. · البند غير موجود. »
- message classe 5 ci‑dessus ; « Enregistrement refusé (droits). »
- Succès : « Valeur enregistrée. » / suppression : confirmation « Supprimer cette valeur ? » puis « Valeur supprimée. »

**Tableau des valeurs** : colonnes « Rubrique », « Application », « Cible », « Montant », boutons « Modifier » /
« Supprimer » (seulement pour les rôles autorisés). Le tableau est **filtré sur la rubrique sélectionnée** dans le formulaire
(toutes les valeurs si aucune). Recherche : « Rechercher une rubrique ou une cible… ». Vide : « Aucune valeur. » /
« Ajoutez un montant pour l'employé, le chantier ou le contrat selon la rubrique. »

**Résultat / effet sur la paie** : la paie n'est **jamais recalculée automatiquement**. L'enregistrement signale le
changement (source « Rubriques de salaire ») : les paies **brouillon** concernées sont marquées « données modifiées depuis
le calcul » et une demande de décision **D3** (recalcul) est ouverte ; s'il n'existe pas encore de paie pour le
chantier/mois concerné, une demande **D4** (génération) peut être ouverte (voir Partie C). Pour une valeur au niveau
« Poste », tous les contrats brouillon/actifs de ce poste sont signalés.

**Règles métier** :
- **Priorité de résolution en paie** : valeur « Employé » > « Contrat » > « Poste » > « Chantier » (la première trouvée gagne).
- **[À VÉRIFIER / INCOHÉRENCE probable]** : une règle en base (déclencheur `hr_salary_asg_align`, migration de septembre 2026,
  jamais retirée) refuse une valeur dont le niveau diffère du « S'applique à » d'une rubrique Employé / Chantier / Contrat,
  avec les messages « Cette rubrique s'applique uniquement à un employé » (… « à un chantier », « à un contrat »).
  L'interface, elle, permet de choisir un autre niveau. À tester en recette : choisir un niveau différent peut échouer.
- La colonne WORK/CRP (voir A.2.6) **n'est pas affichée** ici ; une valeur créée depuis cet écran est toujours « jours travaillés » (WORK).

### A.2.4 Importer des rubriques (onglet « Import », SA uniquement)

**À quoi ça sert** : créer ou mettre à jour en masse le dictionnaire à partir d'un fichier Excel (modèle, ou tableau
téléchargé du site de la CNAS / des impôts), d'un CSV ou d'un JSON, ou d'une URL publique.
**Texte d'aide affiché** : « Importez un Excel téléchargé depuis le site de la CNAS ou des impôts, ou collez l'URL d'un
fichier public. Prévisualisation puis confirmation. Aucune rubrique absente du fichier n'est supprimée. Le niveau
d'application ne change que si vous cochez l'option. »

**Étapes** :
1. (Optionnel) « Télécharger le modèle » → fichier `rubriques-salaire.xlsx` ; message « Modèle téléchargé. ».
2. Soit « Charger Excel » (formats acceptés : .xlsx, .csv, .json), soit saisir « URL d'un fichier public » (placeholder
   « https://… ») puis « Importer depuis l'URL ».
3. Cocher si besoin « Remplacer le niveau d'application (chantier / contrat / employé) s'il figure dans le fichier »
   (cocher/décocher recalcule l'aperçu).
4. Lire l'aperçu : message « Aperçu : N nouveau(x), N mise(s) à jour, N inchangé(s), N rejeté(s). » et tableau
   (colonnes « Statut » [Nouveau / Mise à jour / Inchangé / Rejeté], « Code », « FR », « AR », « Application » — avec
   « (conservé) » si le niveau actuel est gardé —, « Note » = motif de rejet ou « Niveau d'application actuel conservé. »).
5. Cliquer « Confirmer l'import » (désactivé s'il n'y a ni nouveau ni mise à jour). Compteur affiché à côté :
   « N nouveau · N maj · N inchangé · N rejeté ».
6. Message final : « Import terminé : N créé(s), N mis à jour. » + éventuellement « Valeurs effacées pour N rubrique(s)
   (changement de niveau). »

**Colonnes reconnues dans le fichier** (en‑têtes souples, FR/AR acceptés) : code (aussi « code_rubrique », « rubrique »,
« رمز »…), label_fr (« libelle », « designation »…), label_ar (« التسمية »), nature, unit (« unite »), category
(« classe »), apply_scope (« scope », « application »), default_amount (« montant », « valeur »), sort_order (« ordre »),
is_active (« actif »). Le modèle contient exactement : code, label_fr, label_ar, nature, unit, category, cotisable,
taxable, apply_scope, default_amount, sort_order, is_active. Les colonnes cotisable/taxable sont **ignorées** : seule la
classe compte. Un tableau « style GAS » (3 lignes d'en‑tête, groupes « cotisable / imposable », codes 100–499) est aussi
reconnu ; ses rubriques sont alors créées au niveau « Employé » avec montant 0.

**Valeurs interprétées** :
- Nature : contient « rappel », « rembours », « retenue », « prime », « indemn » (ou équivalent arabe) ; vide = indemnité.
- Mode : « month_days » ou « ÷ » → mensuel ÷ jours ; « presence/حضور » → journalier présence ; « % »/« percent » →
  pourcentage ; « *J », « jour », « day » → journalier ; sinon montant mensuel.
- Classe : 1 à 5, ou textes « cotisable et imposable » (1), « cotisable non imposable » (2), « imposable non cotisable » (3),
  « non cotisable non imposable » (4) ; vide = 1.
- Niveau : site/chantier/atelier/ورشة, contrat/عقد, poste/fonction/منصب, employé/salarié/ouvrier/عامل ; **vide = Employé**.
- Booléens : 1/true/oui/yes/نعم/vrai ; 0/false/non/no/لا/faux.

**Messages de rejet par ligne** : « Code manquant. », « Code trop long (40 caractères). », « Libellé manquant. »,
« Nature inconnue. », « Classe invalide (1 à 5). », « Niveau d'application inconnu (chantier / contrat / employé). »,
« Montant invalide. », message classe 5, « Code dupliqué dans le fichier. » (tous suivis de leur traduction arabe).

**Messages globaux** : « Fichier vide. », « Fichier supérieur à 2 Mo. », « Lecture du fichier impossible. », « Aucune
rubrique trouvée dans le fichier. », « Choisissez un fichier Excel, CSV ou JSON. », « Saisissez l'URL. », « URL invalide. »,
« Le lien doit être http ou https. », « Lien non autorisé. » (adresses locales / privées refusées), « Téléchargement
impossible depuis l'URL. » (délai 15 s), « Le serveur a renvoyé {code}. », « Aucune rubrique nouvelle ou modifiée à
confirmer. », « JSON : liste de rubriques attendue. », « Import des rubriques réservé à SUPER_ADMIN. ».

**Règles** : aucune rubrique n'est supprimée ; une rubrique existante est reconnue par son code ; sans l'option, le niveau
d'application existant est conservé ; avec l'option, si le niveau change, **toutes les valeurs de cette rubrique sont effacées**.
Maximum 400 rubriques par confirmation.

### A.2.5 Comprendre les modes de calcul (unités) — à expliquer dans le manuel

D'après le moteur de paie (`payroll-calc.ts`) :
| Libellé écran | Code | Calcul du montant de la ligne |
|---|---|---|
| « Pourcentage *% » | percent | salaire de base mensuel × valeur % × fraction de mois payée |
| « Montant /F » | month | valeur mensuelle × fraction de mois payée |
| « Journalier *J » | day | valeur × **jours payés** |
| « Journalier présence » | presence_day | valeur × **jours réellement travaillés** |
| « Mensuel ÷ jours du mois » | month_days | valeur mensuelle × jours travaillés ÷ nombre de jours calendaires du mois |

- Classe 5 (retenues) : le montant est toujours **déduit** (signe négatif) ; une retenue de classe 5 saisie en « Montant /F »
  est proratisée par jour travaillé (traitée comme « Mensuel ÷ jours du mois »).
- Nature « Retenue » hors classe 5 : montant également négatif.
- Classes : 1 = soumis CNAS + IRG ; 2 = CNAS seulement ; 3 = IRG seulement ; 4 = ni l'un ni l'autre ; 5 = retenues sur le net.
- Les définitions précises de « jours payés » / « jours travaillés » relèvent du chapitre Paie / Présence.

### A.2.6 Rubriques WORK vs CRP (jours travaillés / récupération)

- Le choix ne se fait **pas** dans Paramètres RH mais dans le **formulaire de contrat de travail** : section « Rubriques de
  salaire » (« Choisissez par classe, puis réglez le mode et la valeur de chaque rubrique. ») = WORK, et section
  « Rubriques de récupération (CRP) · بنود العطلة التعويضية » (« Payées seulement sur les jours pointés CRP. Le salaire de
  base reste dû ; les rubriques ci-dessus ne s'appliquent pas à ces jours. ») = CRP.
- Effet en paie : les rubriques WORK ignorent les jours CRP ; une rubrique CRP journalière paie chaque jour CRP, une
  rubrique CRP mensuelle ou en % est répartie sur les jours du mois ; la ligne de bulletin porte le suffixe « (récupération) ».
- Une rubrique « Chantier » ne peut pas être posée sur un contrat : « Les rubriques chantier restent héritées, elles ne se
  posent pas sur le contrat. ».
- Les rubriques « Employé » choisies dans le contrat sont enregistrées au niveau employé ; les autres au niveau contrat.
  L'enregistrement du contrat **remplace** toutes les valeurs du contrat et de l'employé.

---

## A.3 Onglet « Cotisations & impôts » (simple mention)

Visible seulement si l'utilisateur a le droit de lire les paramètres légaux. Quatre sections : « CNAS », « CACOBATPH »,
« Impôts (IRG) », « Autres (SNMG…) ». Documenté dans un autre chapitre (taux, barème IRG, zones, variables légales,
propositions et décision D2). Lien direct : `/rh/parametres?tab=legal&section=…`.

---

## A.4 Onglet « Modèle de fiche » (`fiche-settings-manager`)

**Mise en page** : en-tête « Modèle de fiche employé » — « En-tête, titre, champs, sections et signatures se règlent ici.
L'impression lit cet écran. » ; puis panneaux « En-tête et titre », « Signatures », « Identité en haut de page »,
« Sections d'impression », « Libellés des champs », barre de boutons, puis « Documents obligatoires (fiche employé) » (§ A.5).

**Droits** : enregistrement du modèle = droit « Paramètres RH » / Modifier ; libellés des champs = droit « Employés » /
Modifier ; bascule obligatoire/optionnel d'un champ = **SA uniquement**.

### A.4.1 En-tête et titre
- Aperçu de l'image d'en-tête (image par défaut si aucune) + bouton « Charger l'en-tête » (JPG, PNG, WEBP ; 8 Mo max).
  L'image est **enregistrée immédiatement** : « En-tête entreprise chargé. ». Erreurs : « Choisissez une image d'en-tête. »,
  « Image trop volumineuse (8 Mo max). », « Formats acceptés: JPG, PNG, WEBP. ».
- « Titre du document » (obligatoire, ≤ 160), « Libellé matricule » (obligatoire, ≤ 80), « Préfixe téléphone » (≤ 20,
  défaut « +213 »), « Champs téléphone (codes) » (codes de champs séparés par des virgules, 20 max).

### A.4.2 Signatures
« Gauche · titre », « Gauche · 2ᵉ ligne », « Droite · titre », « Droite · ligne 1 », « Droite · ligne 2 » (≤ 80 caractères chacun, optionnels).

### A.4.3 Identité en haut de page
Deux listes « Colonne gauche » / « Colonne droite » (20 champs max chacune). Chaque ligne : liste des champs de la fiche
(« libellé (code) ») + « Supprimer » ; bouton « Ajouter un champ ».

### A.4.4 Sections d'impression
- « Ajouter une section » crée « NOUVELLE SECTION » ; chaque section : « Titre de section », « Supprimer la section ».
- Chaque ligne d'une section contient 1 à 4 champs : « Champ sur la même ligne » (jusqu'à 4), « Supprimer la ligne »,
  « Nouvelle ligne ». Limites : 20 sections, 30 lignes par section.

### A.4.5 Libellés des champs (fiche et impression)
Texte : « Modifiez le libellé, la section ou l'ordre ici. Masquer un champ le retire de la fiche sans effacer les données. »
+ « Obligatoire / optionnel : réservé à SUPER_ADMIN. » (ou « Le basculement obligatoire/optionnel est réservé à SUPER_ADMIN. »).
Tableau : « FR », « AR », « Section FR », « Section AR », « Ordre », « Visible », « Obligatoire » (grisé hors SA), bouton
**« Enregistrer le champ »** par ligne (chaque ligne s'enregistre séparément). Succès : « {libellé} enregistré. ».
Erreurs : « Réservé à SUPER_ADMIN. », « Mise à jour refusée. ».

### A.4.6 Enregistrer / prévisualiser
- « Enregistrer le modèle » → « Modèle d'impression enregistré. » (les champs vides des listes sont retirés).
- « Aperçu impression » → ouvre l'impression navigateur d'une fiche exemple (NOM / Prenom, matricule « 00/00 ») avec le
  modèle **affiché à l'écran** (même non enregistré).
- Erreurs de validation : messages génériques de validation (« Données invalides » ou message standard) **[À VÉRIFIER]** texte exact.

**Points d'attention** : les modifications d'en-tête/titre/sections ne sont pas sauvegardées tant que « Enregistrer le
modèle » n'est pas cliqué (sauf l'image d'en-tête, enregistrée à l'envoi).

## A.5 « Documents obligatoires (fiche employé) » (`document-requirements-manager`)

**Où** : bas de l'onglet « Modèle de fiche ».
**À quoi ça sert** : choisir les pièces à téléverser exigées pour enregistrer une fiche employé.
**Texte** : SA — « Cochez les documents exigés avant tout nouvel enregistrement de la fiche (après la première création).
Réservé à SUPER_ADMIN. » ; autres — « Consultation seule. Seul SUPER_ADMIN peut rendre un document obligatoire ou optionnel. »
**Contenu** : « Obligatoires actuellement : N » ; tableau « Document », « Code », « Obligatoire pour enregistrer » (case),
bouton « Enregistrer » par ligne (SA). Succès : « {document} mis à jour. ». Erreurs : « Réservé à SUPER_ADMIN. »,
« Type de document introuvable. », « Mise à jour refusée. ».
**Quels documents apparaissent** : les valeurs actives de la liste « Document officiel » (type `document_type`) marquées
comme emplacement de téléversement (`upload_slot`) et non générées automatiquement. Si aucune : « Aucun type de document à
téléverser. Ajoutez-les dans « Listes et codes ». ».
**Règle** : l'exigence s'applique aux enregistrements **suivant** la première création de la fiche.
**Étapes** : cocher/décocher → cliquer « Enregistrer » sur **la même ligne** (cocher seul ne suffit pas).

---

## A.6 Onglet « Listes et codes » (`catalogs-manager`)

**En-tête** : « Paramètres RH » — « Les listes et codes s'ajoutent ici. Rien n'est figé dans le programme. »
**Droits** : écriture des listes = droit « Paramètres RH » / Modifier (règle en base) ; légendes de présence = **SA
uniquement** en base (voir A.6.3) ; demande de changement de coefficient (D14) = voir C.

### A.6.1 Types de listes
Panneau « Types de listes » : trois zones sans libellé (placeholders « code (job_title) », « Libellé FR », « التسمية ») et
bouton « Ajouter le type ».
- Code : 2 à 40 caractères, commence par une lettre, lettres/chiffres/« _ », converti en minuscules. Libellés FR/AR obligatoires (≤ 120).
- Si le code existe déjà, ses libellés sont **mis à jour** (pas de doublon).
- Succès : « Type de liste enregistré. » (le type devient la liste sélectionnée).
- Types existants à l'installation (exemples) : Sexe, Situation familiale, Groupe sanguin, Type de pièce, Mode de paiement,
  Type de contrat, Régime de travail, Poste, Niveau d'études, Profil social, Document officiel, Correspondance, Statut
  correspondance, Moyen de transport, Source pointage, Statut bulletin, Niveau de blocage, Wilaya, Affectation, Zone IRG,
  Wilaya → zone IRG, Classe cotisable / imposable, Rubriques de salaire (ancienne liste).

### A.6.2 Valeurs d'une liste
- « Liste » : choisir le type (« libellé FR — libellé AR »).
- Zones : « Code », « Libellé FR », « التسمية », « Extra JSON {"work_days":28} » (données complémentaires au format JSON,
  ex. jours de travail d'un régime), bouton « Enregistrer ».
- Contrôles : code 1–40, libellés 1–160 obligatoires ; JSON invalide → « JSON extra invalide. ».
- Tableau « Code », « FR », « AR », bouton « Modifier » (recharge la ligne dans les zones). Recherche « Code, libellé… ».
  Vide : « Aucune valeur dans cette liste ».
- Succès : « Valeur enregistrée. ».
- **Non disponible à l'écran** : suppression, désactivation, ordre d'affichage (le code serveur existe mais n'est pas relié).
- Les listes « Zone IRG », « Wilaya → zone IRG », « Profil social » sont aussi gérées par les écrans Cotisations & impôts
  (droits « conformité »).

### A.6.3 Légendes de présence (codes de pointage)
**Panneau** « Légendes de présence ». Texte d'aide **en arabe uniquement** (traduction : « Les codes s'ajoutent ici. Le
coefficient se saisit au clavier avec chiffre et virgule, ex. 0,5 ou 1,5. Changer le code crée un nouveau code et ne modifie
pas un code utilisé en présence. Le changement de coefficient d'un code existant se fait par une demande datée (décision D14)
qui fixe le mois d'effet. »). Bouton « Nouveau code » (vide le formulaire).

**Créer un code** — zones (placeholders) :
| Zone | Obligatoire | Contrôle |
|---|---|---|
| Code (« P ») | Oui | 1–16 caractères, converti en MAJUSCULES |
| Libellé FR (« Présent ») | Oui | ≤ 120 |
| Libellé AR (« حاضر ») | Non | ≤ 120 |
| Coefficient (« 0,5 ») | Oui | nombre 0 à 999,999 (virgule acceptée) ; « Coefficient : nombre attendu (ex. 0,5). », « Coefficient ≥ 0. », « Coefficient ≤ 999,999. » |
| Couleur (sélecteur) | — | couleur de fond de la pastille |
Bouton « Enregistrer le code » → « Légende enregistrée. ». La liste des pastilles « CODE · coefficient » se met à jour ;
cliquer une pastille charge le code pour modification.

**Modifier un code existant** : cliquer sa pastille → modifier libellés / couleur → « Enregistrer le code ». Le coefficient
est **grisé** (infobulle « Coefficient en vigueur ce mois — se modifie par une demande datée (D14) ci-dessous »).
Si l'on retape un autre code, l'écran crée un **nouveau** code (l'ancien n'est pas renommé).

**Messages** : « Ce code existe déjà. Sélectionnez-le dans la liste pour modifier son coefficient. » ; « Ce code est déjà
utilisé dans le pointage. Il ne peut pas être renommé : enregistrez un nouveau code. » ; « Coefficient refusé par la base
(0 à 999,999). Exemple : 0,5. » ; « Enregistrement refusé (droits). ».

**Demander un changement de coefficient (D14)** — cadre affiché sous le formulaire quand un code est sélectionné :
- Titre « Changer le coefficient de {CODE} (en vigueur ce mois : x) » ; texte « Le changement est une demande : il ne
  s'applique qu'après la décision D14, à partir du mois choisi. Les mois déjà validés ou clôturés gardent l'ancien
  coefficient ; les paies brouillon concernées seront signalées (recalcul sur décision D3). » ; ligne « Déjà programmé : x à
  partir de MM/AAAA ; … » s'il y a des changements futurs.
- Champs : « Nouveau coefficient » * (0,5…), « Mois d'effet demandé » * (sélecteur mois, défaut = mois prochain),
  « Motif (10 caractères minimum) » * (500 max).
- Bouton « Demander le changement (D14) » → « Demande enregistrée : aucun effet tant que la décision D14 n'est pas prise. »
  + lien « Ouvrir la décision ».
- Erreurs (serveur) : « Demande de changement de coefficient non autorisée. » ; « Code de présence introuvable. » ;
  « Coefficient invalide (0 à 999,999, trois décimales au plus). » ; « Le mois d'effet commence le 1er du mois. » ;
  « Mois d'effet trop lointain (24 mois au plus). » ; « Une paie de ce mois ou d'un mois suivant est déjà validée ou
  clôturée : le premier mois d'effet possible est MM/AAAA. » ; « Le coefficient du code X vaut déjà Y pour ce mois. » ;
  « Motif obligatoire (10 à 500 caractères). » ; « Mois d'effet attendu (mois/année). ».
- Une nouvelle demande pour le même code **remplace** (clôt « Remplacée ») la demande précédente encore ouverte.
- Qui peut demander : SA, ou droit « Légendes de présence » / Modifier, ou droit « Décision D14 » / Créer.

**Points d'attention (importants)** :
- **Écriture des légendes réservée au SA en base** (règle `ref_leg_write`) : un ADMIN_RH qui clique « Enregistrer le code »
  obtiendra un refus, même si l'écran le laisse saisir. **[À VÉRIFIER]** message exact.
- L'écran ne permet pas de régler « compte comme présence » (`counts_as_presence`), « déclenche AN » (pass-through
  `triggers_an_passthrough`), la couleur du texte, ni le mode de source (MANUAL/AUTO/BOTH). À la création : compte comme
  présence = **oui**, texte blanc, source BOTH, actif.
- **[INCOHÉRENCE / risque]** : à chaque enregistrement depuis cet écran, « déclenche AN » est envoyé à **faux** et le code est
  réactivé. Modifier le libellé ou la couleur du code AN (Absence injustifiée) depuis cet écran **désactiverait son effet
  pass‑through AN**. À signaler ; ne pas recommander cette manipulation dans le manuel.
- Codes installés par défaut (migration `grh_hub`) : P Présent (1), P/2 Demi présent (0,5), MS Mission (1), CRP
  Récupération (1), CA Congé annuel (1), CM Congé maladie (0), CSS Congé sans solde (0), AN Absence injustifiée (0,
  déclenche AN), AJ Absence justifiée (0), AOP Absence autorisée payée (1), W Week-end (0, automatique), JF Jour férié (1),
  AP Abandon de poste (0). « Compte comme présence » = oui pour P, P/2, MS, CRP.

---

## A.7 Onglet « Modèle de bulletin » (`bulletin-settings-manager`)

**En-tête** : « Modèle de bulletin » — « Données du bulletin : en-tête, unités, codes (100, 990, 995), variables légales,
employeur et mois. Les taux CSS viennent des variables légales. »
**Droits** : droit « Paramètres RH » / Modifier (règle en base) ; sinon « Enregistrement refusé (droits). ».

**Panneaux et champs** :
1. « Mise en page, textes et styles » : « Titres, libellés, colonnes, marges, polices et tableaux se modifient directement
   sur le bulletin, dans l'éditeur de documents du simulateur. » + bouton « Ouvrir l'éditeur » (→ `/simulateur?cible=paie&edition=1`).
2. « En-tête entreprise » : aperçu, « Charger l'en-tête », « Utiliser l'en-tête de la fiche » (si la fiche en a un) ;
   case « Masquer les lignes à 0 » (cochée par défaut) ; « Unité montant » (« DA »), « Unité pourcentage » (« % »),
   « Unité journalier » (« DA/j »).
3. Codes et variables : « Code salaire de base » (100), « Libellé salaire de base » (SALAIRE DE BASE), « Code retenue SS »
   (990), « Libellé SS » (RET.SECURITE SOCIALE), « Code IRG » (995), « Libellé IRG » (RET. I.R.G.), « Variable CSS salarié »
   (CNAS_EMPLOYEE), « Variable CSS patronale » (CNAS_EMPLOYER_BASE), « Variable FOS » (CNAS_FOS), « Variable congés /
   CACOBATPH » (CACOBATPH_CONGES), « Code intempéries » (991), « Libellé intempéries » (RET. INTEMPERIES), « Variable
   intempéries salarié » (CACOBATPH_INTEMPERIES_SAL), « Variable intempéries employeur » (CACOBATPH_INTEMPERIES_EMP).
   Les « variables » sont des clés de variables légales (Cotisations & impôts) : ne pas modifier sans raison.
4. « Paiement par défaut » (« Virement »).
5. « Employeur — déclarations CNAS / G50 / CACOBATPH » : « Raison sociale », « Adresse », « NIF », « NIS »,
   « N° employeur CNAS », « N° adhérent CACOBATPH » (repris dans les déclarations).
6. « Mois » : 12 zones = noms des mois imprimés (Janvier … Décembre).

**Boutons** : « Enregistrer le modèle » → « Modèle enregistré. » ; « Aperçu impression » (bulletin exemple d'un salarié
fictif, avec l'en‑tête choisi et les taux légaux) ; « Revenir au modèle GAS » (remet **le formulaire** aux valeurs d'origine ;
rien n'est enregistré tant qu'on ne clique pas « Enregistrer le modèle »).

**Points d'attention** :
- **[INCOHÉRENCE]** « Charger l'en-tête » de cet onglet utilise la même fonction que la fiche : l'image envoyée devient aussi
  **l'en‑tête de la fiche employé** (enregistré immédiatement), puis elle est placée dans le formulaire du bulletin, qu'il faut
  encore enregistrer. Message : « En-tête enregistré. ».
- Les marges, titres, colonnes et libellés de pied (Base cotisable, C.S.S., Net à payer…) existent dans le modèle mais ne
  sont pas éditables ici : passer par l'éditeur du simulateur.

---

## A.8 Onglet « Feuille de présence » (`attendance-columns-manager`, SA uniquement)

**En-tête** : « Feuille de présence — colonnes et droits » ; texte (arabe puis français) : « … SUPER_ADMIN يرى ويعدّل كل
الأعمدة دائمًا. Aucune colonne financière n'est proposée sur la feuille de présence. » (traduction de l'arabe : colonnes de la
feuille de présence et droits de consultation/modification par rôle ; le SUPER_ADMIN voit et modifie toujours toutes les colonnes).
Bouton « Enregistrer » (actif seulement après une modification ; « Enregistrement… » pendant l'envoi).

**Tableau** : « Ordre » (flèches ↑ / ↓), « Code », « Libellé FR », « Libellé AR » (modifiables), « Nature »,
« Active », puis pour **chaque rôle** deux colonnes « Voir » / « Modifier », puis « Supprimer » (colonnes non système).
- « Nature » : « Dossier » (identité), « Jours » (grille des jours), « Totaux codes », « Calcul », « Saisie » ; une colonne
  de saisie ajoutée peut être « Saisie · Texte / Nombre / Date ». « POSTE OCCUPE » est marquée « Dossier · saisissable ».
- « Active » : la grille des jours reste toujours active (case grisée, « La grille des jours reste toujours active. »).
- « Modifier » n'est proposé que pour les colonnes modifiables (grille des jours, colonnes de saisie, POSTE OCCUPE) ; sinon « — ».
- Cocher « Modifier » coche aussi « Voir » ; décocher « Voir » décoche « Modifier ».

**Colonnes système installées** : N°, MAT, NOM, PRENOM, POSTE OCCUPE, AFFECTATION, Jours du mois, Totaux par code, NJ,
Coef, Début contrat, HS 50 % (h), HS 75 % (h), HS 100 % (h) ; colonnes non système : COMMENTAIRE, VALIDATION.
Droits initiaux : tout visible pour les rôles, sauf CHEF_CHANTIER qui ne voit pas VALIDATION, Début contrat, Coef ;
HS50/75/100 visibles pour ADMIN_RH, GERANT, CHEF_CHANTIER, ADMIN_FINANCE, READ_ONLY et modifiables par ADMIN_RH, GERANT, CHEF_CHANTIER.
(Les colonnes HS alimentent la paie des heures supplémentaires.)

**Ajouter une colonne de saisie** (panneau « Ajouter une colonne de saisie · إضافة عمود ») : « Code » (placeholder
« HEURES_SUP », majuscules, commence par une lettre, 32 car. max, lettres/chiffres/_), « Libellé FR » (obligatoire),
« Libellé AR », « Type de valeur » (Texte / Nombre / Date), bouton « Ajouter ». Message : « Colonne CODE ajoutée —
enregistrez pour l'appliquer. ». La nouvelle colonne est visible par tous les rôles, modifiable par aucun (à régler).
Erreurs : « Code : lettres majuscules, chiffres ou _ (ex. HEURES_SUP). », « Le code X existe déjà. », « Libellé FR requis. ».

**Supprimer** : confirmation « Supprimer la colonne CODE ? Les valeurs saisies ne seront plus affichées. » → « Colonne CODE
supprimée. » ; refus : « Colonne système ou introuvable : suppression refusée. ».

**Enregistrer** : « Colonnes et droits enregistrés. · تم حفظ الأعمدة والصلاحيات. » ; erreurs : « Codes de colonne en double. »,
« Colonne introuvable : CODE. », « Réservé à SUPER_ADMIN. ».

---

# PARTIE B — Référentiels utilisés par la RH

## B.1 `/referentiels/legendes` — « Légendes de présence »
- **État actuel : écran réservé (non développé)**. Il affiche « Écran réservé · شاشة محجوزة », le titre « Légendes de
  présence » et « P, MS, CRP, AN, CM, AOP — coefficient et effet pass-through AN. ».
- La gestion réelle des codes se fait dans **Paramètres RH → Listes et codes → Légendes de présence** (A.6.3).
- **[INCOHÉRENCE]** : la page d'une décision D14 propose le lien « Ouvrir les codes de présence » vers cet écran réservé.
- Définitions à reprendre dans le manuel : *code* (affiché dans la grille), *coefficient* (poids du jour ; daté depuis D14 :
  une version par mois d'effet), *compte comme présence* (le jour compte comme présent), *pass-through AN* (l'absence
  injustifiée est répercutée vers les ajustements commerciaux AN), *source* (MANUAL = saisie, AUTO = automatique, BOTH).
- Carte « Légendes de présence » de la page Paramètres et droit « Légendes de présence » de la matrice pointent vers cette URL.

## B.2 `/referentiels/chantiers` — « Chantiers »
**Mise en page** : sur-titre « Référentiels », titre « Chantiers », texte « Annuaire des sites pour la perspective Château.
L'affectation légale (BTPH / Maintenance) reste pilotée par le contrat RH (affectation principale). », bouton « Nouveau chantier ».
Tableau : « Code », « Nom » (FR + AR), « Activité » (badge « BTPH » / « Maintenance » + code), « Wilaya » (« 16 · Alger » ou
mention « non confirmée »), « Statut » (« Actif » / « Inactif »), « Actions » → « Menu » : « Modifier », « Désactiver » /
« Réactiver ». Recherche « Code, nom, wilaya ». Vide : « Aucun chantier enregistré » / « Créez le premier site BTPH ou
Maintenance pour activer la perspective Château. ». Si aucun code d'activité : « Aucun code d'activité actif. … » et bouton grisé.

**Créer / modifier** (fenêtre « Nouveau chantier » / « Modifier le chantier », « Les champs marqués * sont obligatoires. ») :
| Champ | Règle |
|---|---|
| « Code * » | 2–32 car., A-Z 0-9 « - » « _ », majuscules ; **non modifiable** après création ; « Le code doit contenir au moins 2 caractères », « Le code n'accepte que A-Z, 0-9, tiret et underscore », « Le code « X » existe déjà. » |
| « Nom (FR) * » | 2–120 ; « Le nom français est obligatoire (2–120 caractères) » |
| « Nom (AR) » | ≤ 120 |
| « Code d'activité * » | BTPH ou MAINTENANCE (détermine CACOBATPH / intempéries pour la paie) |
| « Wilaya » | liste des wilayas (création seulement) |
| « Commune » | ≤ 80 |
| « Zone IRG » | « Automatique (selon la wilaya) » ou zone explicite |
| « Latitude » / « Longitude » | −90..90 / −180..180 |
| « Chantier actif » | case |
Boutons « Annuler », « Enregistrer » (« Enregistrement… »). Refus de droits : « Accès refusé (RLS). Vérifiez le rôle
SUPER_ADMIN et l'écran « sites ». ».

**Wilaya datée** (en modification) : si la wilaya n'est pas confirmée → choisir la wilaya + « Motif (ex. reprise du référentiel) »
(3 car. min) → « Confirmer la wilaya » (s'applique depuis l'origine). Sinon : historique (« Depuis l'origine », « À partir du
JJ/MM/AAAA », « en vigueur », « à venir ») et « Changement officiel (ex. nouveau découpage) : effet au 1er d'un mois, à partir
du {premier mois modifiable} ; les mois antérieurs ne changent pas. » : mois, wilaya, « Motif », « Document (réf.) »,
« Enregistrer le changement » ; « Supprimer » un changement futur (confirmation). Effet : la zone IRG des mois suit la wilaya ;
les paies brouillon concernées sont signalées (source « Wilaya du chantier » → D3).

**Dépendances RH** : affectation des contrats, valeurs de rubriques « Chantier », zone IRG, feuilles de présence et paies
par chantier, régime BTPH (CACOBATPH) vs Maintenance.

## B.3 `/referentiels/activites` — « Codes d'activité »
**Écran réservé (non développé)** : « BTPH (CACOBATPH) vs Maintenance (613133) — formule CONGE_JOUR UI-driven. ».
Deux codes installés : BTPH (CACOBATPH congés, intempéries) et MAINTENANCE (code officiel 613133, congés provisionnés par
l'entreprise 2,5 j/mois). Non modifiables à l'écran.

---

# PARTIE C — Centre de décisions (`/decisions`)

## C.1 Principe (à expliquer en introduction)
Texte d'en-tête : « Rien ne s'exécute de soi-même : chaque génération ou recalcul de paie, correction d'affectation ou
traitement d'un contrat hors du 1er du mois attend ici une décision motivée, enregistrée et tracée. »
- Une **demande** est créée par une action dans un écran métier (ou automatiquement par l'application).
- Un **décideur** autorisé choisit une **option**, écrit une **justification** (10 à 2000 caractères) et, pour une décision
  « à risque », coche la reconnaissance des conséquences.
- La décision est **définitive** : ni modifiable ni supprimable ; changer d'avis = nouvelle demande.
- **Usage unique** : une décision exécutée ne peut pas resservir.
- **Empreinte des données** : si les données ont changé entre l'affichage et la décision, la décision est refusée et la
  demande mise à jour (voir C.5).

## C.2 Page liste — mise en page
- Titre « Centre de décisions ».
- Onglets (masquables par Interface) : « À traiter » (statuts En attente + Décidée, à exécuter) | « Décisions confirmées et
  closes » (Exécutée, Invalidée, Remplacée).
- Filtres par type : « Tous les types », puis une pastille par type D1…D15 (libellés du tableau C.8). URL `/decisions?tab=open|closed&type=Dx`.
- Tableau (200 lignes max, plus récentes d'abord) : « Décision » (lien vers le détail), « Période · chantier »,
  « Origine », « Demandée » (date + demandeur), « Statut » (pastille), « Décidée » (onglet À traiter) ou « Choix / clôture ».
- Vide : « Aucune décision en attente » / « Aucune décision close » — « Seules les décisions que vos droits permettent de voir sont listées. »
- **Visibilité** : on voit une décision si l'on a le droit « Centre de décisions » / Lire, **ou** si on l'a demandée,
  **ou** si on a le droit de décider ce type.

Statuts : « En attente » (orange), « Décidée, à exécuter », « Exécutée » (vert), « Invalidée » (rouge), « Remplacée » (gris).
Origines possibles (colonne « Origine ») : Présences, Contrat de travail, Rubriques de salaire, Avenant de salaire,
Exception de paie, Sortie, Congé, Avance ou prêt, Dérogation IRG / CNAS / CACOBATPH, Affectation du contrat, Wilaya du
chantier, Règle légale appliquée (décision D2), Coefficient d'un code de présence (décision D14), Demande depuis l'écran Paie,
Rapport de qualité des données, Approbation d'une règle légale, Demande de réouverture depuis l'écran Paie, Validation d'une
paie depuis l'écran Paie, Préparation d'un virement depuis l'écran Virements, Export d'une déclaration depuis l'écran Paie,
Analyse d'un import d'archives de présence, Écran des imports de présences, Document juridique du registre (extraction IA).

## C.3 Page détail d'une décision (`/decisions/{id}`)
1. Lien « ← Toutes les décisions ».
2. En-tête : libellé du type + description + pastille de statut.
3. Panneau de faits : « Période », « Chantier », « Origine », « Classe » (« À risque » / « Ordinaire »), « Demandée » ;
   selon le type : « Pointages validés du mois » (D4), « Bulletins brouillon » (D3) ; lien de contexte (« Ouvrir l'écran
   Paie », « Ouvrir l'écran Virements », « Ouvrir le registre des déclarations », « Ouvrir la préparation du mois »,
   « Ouvrir les codes de présence », « Ouvrir le document (extraction IA) », « Rapport de qualité des données »,
   « Ouvrir la proposition », « Ouvrir le lot d'import », « Ouvrir l'écran des imports », « Ouvrir les contrats »).
   Pour les décisions de paie : rappel de la nature du mois — mois **avant septembre 2026** : « Mois antérieur à septembre
   2026 : paie versée et déclarée hors de l'application. Une paie générée ici ne vaut ni paiement ni déclaration. » ;
   sinon « Paie opérationnelle : les virements et déclarations de ce mois sont préparés dans l'application. ».
4. Panneau de contexte propre au type (C.9).
5. Panneau **« Votre décision »** (si En attente) — ou panneau « Décision » (si décidée/close).

## C.4 Décider (approuver ou refuser)
**Prérequis** : avoir le droit de décider ce type (C.6) ; ne pas être le demandeur (sauf SA) ; pour D2, ne pas avoir
contribué à la règle (sauf SA) ; demande encore « En attente ».
Si un prérequis manque, le panneau affiche à la place (encadré bleu) :
- « Cette décision n'est plus en attente. »
- « Vous n'avez pas le droit de prendre cette décision. Le SUPER_ADMIN peut vous le déléguer depuis la matrice des droits. »
- « Séparation des tâches : vous êtes à l'origine de cette demande, un autre décideur doit la trancher. »
- « Séparation des tâches : vous avez contribué à cette règle, un autre décideur doit fixer sa date d'application. »

**Étapes** :
1. Lire le contexte et les avertissements (encadrés orange/rouge).
2. Choisir une **option** (cartes radio avec libellé + conséquence). Une option peut être grisée avec son motif en rouge
   (ex. D13 « Corriger la date de début… » si le mois est déjà traité ; D7 « Réouvrir » si un lot de virement est en cours).
3. Saisir « Justification (obligatoire, tracée) » (10 à 2000 caractères).
4. Décision à risque : cocher « J'ai pris connaissance des conséquences de cette décision à risque. ».
5. Cliquer **« Décider et exécuter »** (option qui lance une opération) ou **« Enregistrer la décision »** (option sans opération).
   Rappel sous le bouton : « La décision est définitive : elle ne peut être ni modifiée ni supprimée. ».

**Refuser / rejeter** : il n'existe pas de bouton « Rejeter ». Refuser = choisir l'option négative du type (« Conserver… »,
« Ne pas générer », « Ne pas appliquer pour l'instant », « Attendre », « Refuser », « Aucun virement », « Ne pas réouvrir »,
« Ne pas corriger », « Refuser la correspondance », « Rejeter le lot »…), avec justification.

**Messages après décision** :
- « Choisissez une option. » ; « Justification obligatoire (10 caractères minimum). » ; « Justification trop longue (2000 caractères maximum). » ;
  « Décision à risque : confirmez avoir pris connaissance des conséquences. »
- Succès sans opération : « Décision enregistrée. Aucune opération de paie n'a été lancée. » (statut direct « Exécutée »).
- Succès appliqué en base dans la même opération (D2, D5 hors ligne par ligne, D6, D7, D8, D11, D12, D13, D14) :
  « Décision enregistrée et appliquée dans la même opération. ».
- Succès calculé par l'application (D3, D4) : « Décision enregistrée et exécutée : N bulletin(s) calculé(s). » + avertissements ;
  D1 : « Décision enregistrée : simulation « règles non approuvées » calculée pour N salarié(s). Aucun bulletin créé. ».
- Décision à exécuter ailleurs (D9, D10, D5 « Trancher ligne par ligne ») : « Décision enregistrée. Elle s'exécute une
  seule fois, depuis l'écran opérationnel. » + lien « Exécuter depuis l'écran Virements » / « Produire le fichier depuis le
  registre des déclarations » / « Trancher ligne par ligne depuis l'écran des imports » suivi de « (une seule fois) ».
- Échec d'exécution : « Décision enregistrée, mais l'exécution a échoué : … » (+ lien « Ouvrir la nouvelle demande » si la
  demande a été invalidée et remplacée). La page propose ensuite « Exécuter la décision » (au décideur ou au SA), sinon
  « En attente d'exécution par l'auteur de la décision ou le SUPER_ADMIN. ».
- Données changées : « Les données ont changé depuis l'affichage : la demande a été mise à jour. Relisez-la avant de décider. »
- Situation close : « La situation a changé : cette demande est close (voir le motif de clôture). Aucune opération n'a été faite. »
  (ex. D3 : « La paie n'est plus en brouillon. » ; D4 : « Une paie existe déjà pour ce mois. » ; D14 : « Nouvelle demande de
  coefficient pour ce code. »).
- Erreurs base : « Vous n'avez pas le droit de prendre cette décision. », « Option inconnue pour cette décision. »,
  « Décision introuvable. », « Session requise. ».

**Panneau « Décision » (après)** : « Choix », « Décidée » (date · nom), « Justification », « Exécutée » (date · nom ·
N bulletin(s) · copies figées · politique · lot · fichier…), « Clôture » (motif et date).

## C.5 Cycle de vie
En attente → Décidée (à exécuter) → Exécutée ; ou En attente/Décidée → Invalidée (données changées, demande remplacée) ou
Remplacée (nouvelle demande identique, situation dépassée). Une seule demande ouverte par sujet (même clé). Toute écriture
est tracée dans le journal d'audit ; la suppression est interdite (« Registre des décisions : suppression interdite. »).

## C.6 Qui peut décider — classes et droits
- **Classe** : « Ordinaire » ou « À risque » (case de reconnaissance obligatoire pour « À risque »).
- **Droit de décider** = compte actif **et** (SUPER_ADMIN **ou** droit « Modifier » (M) sur l'écran « Décision Dx … » dans la
  Matrice des permissions). D14 : « Créer » (C) = demander, « Modifier » (M) = décider.
- **Par défaut (installation)** : seul le SUPER_ADMIN a ces droits pour tous les types. Le SA peut les déléguer dans la matrice.
- **Non délégables** (SA uniquement ; écrans retirés de la matrice et refusés en base) : **D5**, **D7**, **D12**
  (« La réouverture d'une paie (D7) est réservée au SUPER_ADMIN et ne se délègue pas. » / message équivalent pour D5 et D12).
- **Séparation des tâches** : le demandeur ne décide pas sa propre demande (sauf SA) ; pour D2 les contributeurs de la règle non plus.

## C.7 Notifications (cloche)
- Bouton cloche en haut (badge rouge = nombre non lus, « 9+ » au-delà de 9). Ouvrir la liste marque tout comme lu.
- Panneau « Notifications » + lien « Centre de décisions » ; 30 dernières ; vide : « Aucune notification. ». Chaque
  notification ouvre la décision.
- Types : demande en attente (envoyée à **tous les détenteurs du droit de décider** ce type), décision prise (envoyée au
  **demandeur** : « Décision prise : {type} » + option), décision invalidée. Aucune notification par e‑mail.

## C.8 Catalogue des types de décision

> Le catalogue de l'application contient **15 types : D1 à D15**. **D16 n'est pas un type de décision** : c'est le nom
> donné à la « Portée d'une zone IRG (D16) » (liste datée de wilayas d'une zone IRG), contenu légal qui passe par une
> **proposition de règle** (Propositions légales : brouillon → soumission → approbation par une autre personne), puis par
> une décision **D2** pour sa date d'application. Aucun écran « decision_… » n'existe pour D16.

| Code (libellé liste) | Écran de droit (matrice) | Classe | Options (libellé → effet) | Déclencheur côté RH |
|---|---|---|---|---|
| **D1** · Paie d'un mois aux règles non approuvées | « Décision D1 · Paie d'un mois dont les règles ne sont pas toutes approuvées (classe : ordinaire) » | Ordinaire | « Attendre l'approbation des règles » (rien) ; « Calculer une simulation non validable » (simulation à part, jamais bulletin/virement/déclaration/coût) | RH → Préparation du mois → « Demander la décision D1 » ; ou « Demander la génération » quand une règle du mois est soumise/approuvée non appliquée (la base ouvre D1 au lieu de D4) |
| **D2** · Date d'application d'une règle légale | « Décision D2 · Date d'application d'une règle approuvée (classe : à risque) » | À risque | « Appliquer à partir du mois indiqué » (en vigueur au 1er du mois ; brouillons signalés D3) ; « Ne pas appliquer pour l'instant » | RH → Propositions légales → proposition approuvée → « Demander la décision » |
| **D3** · Recalcul des paies brouillon | « Décision D3 · Recalcul des paies brouillon (classe : ordinaire) » | Ordinaire | « Recalculer les bulletins concernés » ; « Conserver les bulletins tels quels » (la paie pourra être validée en l'état) | **Automatique** dès qu'une donnée de paie change après calcul d'un brouillon (présences, contrat, rubriques, avenant, exception, sortie, congé, avance, dérogations, affectation, wilaya, règle D2, coefficient D14) ; ou Calcul de la paie → « Demander un recalcul » |
| **D4** · Génération de paie | « Décision D4 · Génération de paie (classe : ordinaire) » | Ordinaire | « Générer la paie du mois » (brouillon calculé avec les règles au 1er du mois) ; « Ne pas générer » | Calcul de la paie → « Demander la génération » ; Préparation → « Demander la génération (D4) » ; **automatique** quand des données (ex. présences) changent pour un chantier/mois sans paie brouillon |
| **D5** · Conflit d'un import de présences | « Décision D5 · … (SUPER_ADMIN uniquement, non délégable) » | À risque | « Conserver l'existant » ; « Retenir l'import » ; « Trancher ligne par ligne » (sur l'écran des imports) ; « Rejeter le lot » | **Automatique** : l'analyse d'un lot d'archives trouve des présences déjà saisies (autre valeur, autre chantier, congé approuvé) |
| **D6** · Clôture des mois de reprise | « Décision D6 · Validation d'un mois opérationnel avec des mois de reprise ouverts (classe : à risque) » | À risque | « Attendre » ; « Valider en figeant les paramètres des mois de reprise » ; « Chaîne de clôture séparée pour les mois de reprise » (définitif ; la validation reste à faire dans Paie) | Calcul de la paie → « Demander la décision D6 » (valider sept. 2026+ alors que janv.–août 2026 sont ouverts) |
| **D7** · Réouverture d'une paie | « Décision D7 · … (SUPER_ADMIN uniquement, non délégable) » | À risque | « Réouvrir la paie » (copies figées, retour en brouillon, pointage modifiable, pas de recalcul sans D3) ; « Ne pas réouvrir » | Calcul de la paie → « Demander la réouverture (D7) » : fenêtre « Demander la réouverture — {mois} », « Motif de la réouverture » * (10 à 500 caractères), « Envoyer la demande » |
| **D8** · Correction d'une affectation | « Décision D8 · Correction d'une affectation (classe : à risque) » | À risque | « Corriger l'affectation (erreur de saisie) » ; « Ne pas corriger » | Contrat → affectations → « Demander la décision D8 » (erreur de saisie touchant seulement des mois non traités) |
| **D9** · Virement bloqué | « Décision D9 · … (classe : à risque) » | À risque | « Aucun virement » ; « État de rapprochement non bancaire » ; « Lot de virement réel — risque de double paiement » (exécutés depuis l'écran Virements, une fois) | Virements → « Demander la décision D9 (N) » (bulletins de reprise, déjà virés ou payés hors application) |
| **D10** · Déclaration bloquée | « Décision D10 · … (classe : à risque) » | À risque | « Exclure les mois concernés » ; « État de contrôle interne » ; « Fichier officiel — risque de double déclaration » (produits depuis le registre des déclarations, une fois) | Export de déclaration → « Demander la décision D10 » |
| **D11** · Correspondance des codes d'un import | « Décision D11 · … (classe : ordinaire) » | Ordinaire | « Valider pour ce lot seulement » ; « Valider et conserver comme politique » (seconde confirmation sur l'écran des imports) ; « Refuser la correspondance » | Imports de présences → codes inconnus → « Demander la décision » |
| **D12** · Validation d'un import par son auteur | « Décision D12 · Politique … (SUPER_ADMIN uniquement, non délégable) » | À risque | « L'auteur peut valider son propre lot » ; « L'auteur ne peut pas valider son propre lot » | Imports de présences → onglet « Politique de validation » → « Demander une décision sur cette politique » |
| **D13** · Contrat ne commençant pas le 1er | « Décision D13 · Contrat existant ne commençant pas le 1er du mois (classe : ordinaire) » | Ordinaire | « Corriger la date de début au 1er du mois » ; « Marquer comme exception historique documentée » (les deux s'appliquent) | Qualité des données → « Demander D13 » (ou toutes les demandes d'un coup) |
| **D14** · Coefficient d'un code de présence | « Décision D14 · Coefficient d'un code de présence : demander (créer), choisir le mois d'effet (modifier) » | Ordinaire | « Appliquer à partir du mois demandé » (brouillons utilisant ce code signalés D3) ; « Refuser » | Paramètres RH → Listes et codes → légende → « Demander le changement (D14) » (A.6.3) |
| **D15** · Voie de saisie d'un document à cheval sur 2025 et 2026 | « Décision D15 · … (classe : ordinaire) » | Ordinaire | « Saisie manuelle » ; « Extraction IA possible » (les deux = enregistrement seul) | RH → Extraction IA → « Demander la décision D15 » |

## C.9 Contenu spécifique de la page détail (par type)
- **D3** : « Modifications depuis le calcul · recalcul de toute la paie / des salariés concernés » : liste source · salarié
  (ou « Toute la paie ») · détail · date ; sinon « Recalcul demandé manuellement, sans modification enregistrée. ».
- **D8** : « Correction demandée · aperçu » : Salarié, Période de l'affectation (initiale / changement daté), « Chantier actuel → corrigé »,
  Wilaya, Motif ; message de zone IRG (« Même zone IRG… » / « Zone IRG modifiée : A → B. N bulletin(s) brouillon… ») ;
  tableau des bulletins brouillon (Mois, Paie brouillon, IRG actuel, Net actuel).
- **D13** : « Contrat concerné » : Salarié, Début actuel, Fin, Début corrigé proposé.
- **D2** : règle, application demandée, date d'effet du texte, approbation (badge « Auto-approbation SUPER_ADMIN »), premier
  mois non validé, source légale, contributeurs, différence actuel/proposé, citations, tableau des bulletins concernés
  (« Signalée, recalcul sur décision D3 » / « Mois antérieur, inchangée » / « Pour information, jamais modifiée »).
- **D7** : « Paie à réouvrir · mois · chantier » : statut, bulletins, Brut/IRG/Net, copies figées, validée/clôturée par,
  motif ; avertissements (virement exécuté = risque de double paiement, lot en cours = refus, attestations émises, mois
  suivants validés, déclarations) ; virements, registre des exports, opérations externes, documents émis, décisions antérieures.
- **D6** : mois de reprise ouverts/figés (Mois, Paramètres, Paies, Validées, Bulletins) + rappel « Ce choix ne modifie aucun bulletin… Il est définitif. ».
- **D9** : bulletins et motifs, 1 · virements de l'application, 2 · paiements externes, 3 · nature de la période.
- **D10** : mois couverts (Paies (validées), Bulletins, Brut, IRG, Décision requise), registre des exports, déclarations externes, nature des mois.
- **D5** : lot, provenance, fichier, compteurs (lues, acceptées, rejetées, en conflit), tableau des conflits (Salarié, Date, Import, Déjà enregistré, Conflit).
- **D11** : paires « Code du fichier » → « Code du référentiel proposé », Lignes, Politique existante.
- **D12** : règle actuelle, dernière décision, lots en attente de validation.
- **D1** : règles en attente (Règle, Famille, Statut, Mois concerné), valeurs héritées non vérifiées, avertissements.
- **D14** : « Code X — libellé : ancien → nouveau à partir de MM/AAAA », coefficient en vigueur, présences concernées, premier
  mois modifiable, paies brouillon, historique des versions (« Origine » / « Décision D14 »), avertissements.
- **D15** : document (type, référence, période d'application, langue, version, analyses IA) + avertissements.

---

# PARTIE D — Droits et administration (vue utilisateur / administrateur RH)

## D.1 Rôles installés
| Code | Libellé | Niveau | MFA | Portée |
|---|---|---|---|---|
| SUPER_ADMIN | Super administrateur | 100 | oui | globale ; a toujours tous les droits ; voit tout |
| ADMIN_FINANCE | Admin finance | 80 | oui | par chantier possible |
| ADMIN_RH | Admin RH | 80 | oui | par chantier possible |
| GERANT | Gérant | 70 | oui | par chantier possible |
| CHEF_CHANTIER | Chef de chantier | 40 | non | par chantier possible |
| READ_ONLY | Lecture seule | 10 | non | par chantier possible |

Contrôles **en dur** (indépendants de la matrice) utiles au manuel RH :
- Dictionnaire et import des rubriques, documents obligatoires, champ obligatoire/optionnel, Feuille de présence,
  écriture des légendes : **SA**.
- Valeurs de rubriques (et montants sur contrats/exceptions) : SA, ADMIN_RH, GERANT.
- Clôture de la paie (irréversible) : SA, GERANT.
- Pages : Matrice des droits et Rôles : SA, GERANT (lecture seule pour GERANT) ; Journal d'audit : SA, GERANT, ADMIN_RH,
  ADMIN_FINANCE ; Clôture des périodes : SA, GERANT, ADMIN_FINANCE ; Utilisateurs : SA, ADMIN_RH ; Accès par compte et
  Interface : SA uniquement.

## D.2 « Rôles » (`/administration/roles`)
Accès : menu « Rôles & droits » ou carte « Rôles ». Texte : « Le niveau hiérarchique ordonne les rôles (100 = SUPER_ADMIN).
Les rôles système gardent leur code : ils sont utilisés par les règles d'accès en base. Les droits par écran se règlent dans
la matrice des droits. ». Bouton « Nouveau rôle » (SA).
Tableau : « Code » (badge « système »), « Libellé » (FR + AR), « Niveau », « Options » (« MFA », « par chantier » / « global »,
« inactif »), « Utilisateurs », « Modifier » (SA ; jamais sur SUPER_ADMIN).
Fenêtre : « Code » (aide « A-Z, 0-9, _ » ; non modifiable pour un rôle système), « Niveau hiérarchique (0-99) »,
« Libellé (FR) », « Libellé (AR) », cases « Double authentification exigée », « Attribution par chantier autorisée »,
« Actif » (non modifiable pour un rôle système). Boutons « Fermer », « Enregistrer ».
Erreurs : « Code : 3 à 31 caractères A-Z, 0-9, _. », « Libellé obligatoire. », « Niveau entre 0 et 99 (100 réservé au
SUPER_ADMIN). », « Ce code de rôle existe déjà. », « Réservé au SUPER_ADMIN. ».

## D.3 « Matrice des droits / Matrice des permissions » (`/administration/permissions`)
Titre de page « Matrice des droits » (carte « Matrice des permissions » : « Droits lire / créer / modifier / supprimer /
imprimer / exporter par rôle et par écran. »).
- SA : encadré « Pour choisir les modules et onglets d'un compte précis : Accès par compte. ».
- Filtre « Module » (« Tous » ou code module : hr, decisions, ref, admin, …).
- Légende : « L = lire, C = créer, M = modifier, S = supprimer, I = imprimer, E = exporter. Ces droits alimentent les règles
  d'accès en base (RLS) ; SUPER_ADMIN a toujours tous les droits. Toute modification est journalisée. »
- Tableau : une ligne par écran (« libellé » + « code · chemin »), un groupe de 6 cases par rôle **actif**.
- **Enregistrement immédiat** à chaque clic (pas de bouton Enregistrer) ; en cas d'erreur la case revient à son état.
- Règles : cocher un droit autre que L coche aussi L ; décocher L décoche tout ; colonne SUPER_ADMIN toujours cochée et grisée.
- Non‑SA (GERANT) : « Lecture seule : seul le SUPER_ADMIN modifie la matrice. ».
- Erreurs : « SUPER_ADMIN a tous les droits (non modifiable). », « Droit inconnu. », « Paramètres invalides. », message D7.
- Les écrans D5, D7, D12 n'apparaissent pas (non délégables).
- Écrans utiles à la RH (exemples) : Paramètres RH (`hr_settings`), Légendes de présence (`legendes`), Chantiers (`sites`),
  Employés, Contrats de travail, Présence, Paie, Bulletins, Centre de décisions (`decisions`), « Décision Dx … »,
  Propositions de règles légales, Approbation des règles légales, Préparation de la paie par mois, Extraction IA,
  Opérations externes (lire/saisir, confirmer, examiner), Journal d'audit (`audit`), Clôture des périodes (`period_locks`).
- Signification de M pour une décision : « Modifier » = **décider** ce type.

## D.4 « Accès par compte » (`/parametres/acces`, SA uniquement)
En-tête : « Accès par compte · صلاحيات الحسابات » — « Choisissez le compte, ouvrez ses modules (tous fermés au départ), puis
cochez les onglets de chaque module ouvert. »

**Étapes** :
1. « 1. Compte · الحساب » : choisir dans « — Choisir un compte — » (libellé : nom · e‑mail · rôles · « accès personnalisé » le cas échéant).
   Changer de compte avec des modifications non enregistrées : « Des modifications non enregistrées seront perdues. Continuer ? ».
   Compte SA : « Ce compte est SUPER_ADMIN : il voit toujours tout, aucun réglage ne s'applique. ».
2. « 2. Modules · الوحدات » : texte « Aucun accès personnalisé pour l'instant : le compte suit ses rôles. Ouvrez les modules
   voulus puis enregistrez. » (ou « Accès personnalisé : seuls les modules et onglets cochés sont affichés. ») + « N module(s)
   ouvert(s). ». Chaque module = interrupteur (« Toujours ouvert » pour Tableau de Bord et Paramètres). Ouvrir un module coche
   tous ses onglets ; le fermer les décoche.
3. Déplier un module ouvert (chevron) : « Tout cocher » · « Tout décocher », cases par onglet, compteur « x/y onglet(s) ».
   Le module « Ressources Humaines » regroupe : « Module Ressources humaines » (Tableau de bord, Employés, Postes & grille,
   Présence, Imports de présences, Congés, Préparation du mois, Calcul de la paie, Exceptions, Avances, Virements,
   Déclarations, Opérations externes, Coûts, Intérim, Sorties, Registre, Attestations, Cotisations & impôts, Propositions
   légales, Documents juridiques, Extraction IA, Veille juridique, Qualité des données, Paramètres), « Paramètres RH »
   (Rubriques de salaire, Cotisations & impôts, Modèle de fiche, Listes et codes, Modèle de bulletin, Feuille de présence),
   « Cotisations & impôts » (CNAS, CACOBATPH, Impôts (IRG), Autres (SNMG…)), « Imports de présences » (Lots, À valider,
   Correspondances de codes, Politique de validation), « Pointage » (Par chantier, Par employé). Le module « Centre de
   décisions » : À traiter, Décisions confirmées et closes. Le module « Paramètres » : Matrice des permissions, Clôture des
   périodes, Journal d'audit, Légendes de présence, Paramètres finance, Paramètres achats.
4. « Enregistrer » → « Accès enregistrés. Ils s'appliquent à sa prochaine page. ». « Revenir aux rôles » (si accès personnalisé)
   → « Le compte suit de nouveau les choix de ses rôles. ».
Rappel affiché : « Ces réglages choisissent ce que le compte voit. Les données restent protégées par la matrice des
permissions de son rôle. ». Erreurs : « Réservé au SUPER_ADMIN. », « Compte invalide. », « Table des accès absente : … ».
**[À VÉRIFIER]** combinaison exacte avec les masquages par rôle (Interface) quand les deux existent.

## D.5 « Interface » (`/parametres/interface`, SA uniquement)
En-tête : « Interface · الواجهة » — « Choisissez, pour chaque rôle, les modules et les onglets affichés ; changez leur ordre,
leurs libellés et les couleurs. Le SUPER_ADMIN voit toujours tout. Masquer un élément ne remplace pas la matrice des
permissions, qui protège les données. »
Trois onglets :
1. **« Visibilité par rôle · الإظهار حسب الدور »** : « Rôle · الدور » (tous sauf SA, « — inactif » le cas échéant) ;
   compteur « N élément(s) masqué(s) pour ce rôle. » / « Tout est affiché pour ce rôle. » + « Un utilisateur qui a plusieurs
   rôles voit un élément dès qu'un de ses rôles l'affiche. ». Sections A. Menu latéral, B. Onglets Ressources humaines,
   C. Onglets des autres modules (dont Page Paramètres, Paramètres RH, Cotisations & impôts, Rubriques de salaire, Imports de
   présences, Propositions légales, Veille juridique, Centre de décisions…), D. Onglets internes des fiches (dont Pointage).
   Chaque bloc : « Tout afficher », « Tout masquer », cases par élément (barré si masqué ; « toujours visible » pour les
   éléments verrouillés ; « lien » pour les raccourcis). Enregistrement immédiat. Masquer un élément bloque aussi sa page.
2. **« Ordre et libellés · الترتيب والأسماء »** : « Liste à organiser · القائمة » (Menu latéral — modules / groupes, puis
   chaque liste B, C, D, E « Boutons d'action des pages ») ; lignes glissables (poignée ; clavier : Espace, flèches, Espace),
   libellé FR et AR (80 car. max ; vide = nom d'origine), groupe du menu pour le menu latéral ; les boutons d'action (niveau E)
   ne se renomment pas. « Enregistrer · حفظ » (« Enregistré. · تم الحفظ. »), « Rétablir par défaut · استرجاع الأصل ».
   « Cet ordre s'applique à tout le monde ; chaque utilisateur peut ensuite le changer pour lui-même avec « Réorganiser la page ». »
3. **« Apparence · المظهر »** : « Thèmes prêts », « Formes et composants » (coins, forme/style des boutons, tableaux, cartes,
   densité), « Polices, mode et animations », « Couleurs et nom » (couleur principale, couleur du menu), « Aperçu en direct ».
   (Hors périmètre RH ; mention.)

## D.6 « Utilisateurs » (`/parametres/utilisateurs`, SA et ADMIN_RH)
En-tête « Paramètres · الإعدادات » / « Administration des utilisateurs ». Bouton « Nouvel utilisateur ».
Tableau : « Nom » (mention « Réinit. mot de passe requise »), « E-mail », « Rôle », « Site(s) » (« Global » si sans site),
« Statut », « Actions » → « Menu » : « Réinit. mot de passe », « Désactiver (INACTIVE) » / « Réactiver ».
Création : « Nom complet * », « E-mail * », « Mot de passe initial * » (8 caractères min ; « Saisi par l'administrateur ·
الموظف سيغيّره عند أول دخول »), « Rôle * », « Périmètre site » (« Global (tous les sites) » ou un chantier) ; boutons
« Annuler », « Créer ». Message : « Utilisateur créé. Communiquez-lui le mot de passe saisi ; il devra le changer à la première connexion. ».
Un ADMIN_RH ne voit que les rôles de niveau < 80 (pas SUPER_ADMIN, ADMIN_RH, ADMIN_FINANCE).
Réinitialisation : fenêtre « Réinitialiser le mot de passe », « Mot de passe temporaire * » (8 min), « Enregistrer » →
« Nouveau mot de passe temporaire enregistré pour … ».
(L'ancienne URL `/administration/utilisateurs` redirige ici.)

## D.7 « Clôture des périodes » (`/administration/periodes`)
Accès : SA, GERANT, ADMIN_FINANCE (et droit « Clôture des périodes »). **Un ADMIN_RH n'y a pas accès par défaut.**
Mise en page : navigation « ← année-1 » / année / « année+1 → » ; texte « La clôture fige les ajustements commerciaux (AN)
du mois ; seul le SUPER_ADMIN peut encore y écrire. La paie a son propre circuit (valider → clôturer) dans le module RH ;
son état est rappelé ici. » ; tableau 12 mois : « Mois », « Ajustements (AN) » (« Ouvert » / « Clôturé », « le … par … » /
« rouvert le … par … »), « Paie (chantiers) » (« N clôturée(s) », « N validée(s) », « N brouillon(s) »), bouton « Clôturer » /
« Rouvrir ». Confirmations : « Clôturer {Mois} {année} ? Les ajustements commerciaux (AN) du mois seront figés. » /
« Rouvrir {Mois} {année} ? ». Erreurs : « Période invalide. », « Droit « Clôture des périodes » requis. ».
**À dire clairement dans le manuel RH** : cette clôture ne verrouille **pas** la paie ; la paie se valide/clôture dans
RH → Calcul de la paie, et sa réouverture passe par D7.

## D.8 « Journal d'audit » (`/administration/audit`)
Accès page : SA, GERANT, ADMIN_RH, ADMIN_FINANCE ; lecture des lignes = droit « Journal d'audit » / Lire.
**[À VÉRIFIER]** : par défaut seuls SA (et READ_ONLY en lecture) ont ce droit ; un ADMIN_RH verrait « Aucune entrée » —
« Ou droit « Journal d'audit » manquant. » tant que le SA ne l'a pas accordé.
Filtres : « Table » (liste des tables présentes), « Action » (CREATE, UPDATE, DELETE, LOGIN, PRINT, EXPORT, REVERSE),
« Identifiant ciblé », « Du », « Au », bouton « Filtrer ». Tableau : « Date », « Utilisateur » (« système » si aucun),
« Action », « Table », « Champs modifiés » (6 premiers), « Détail » → fenêtre « ACTION · table » (date, auteur, cible ;
tableau « Champ / Avant / Après »). Pagination « Précédent » / « Page N » / « Suivant » (50 lignes).
Tables utiles RH (noms techniques) : `sys_decisions`, `hr_payroll_input_changes`, `hr_salary_assignments`, paies, bulletins,
lignes de bulletin, présences (chaque ligne rattachée à la décision D3/D4/D7 en cours quand il y en a une).

## D.9 Page « Paramètres » (`/parametres`)
En-tête « Administration · الإدارة » / « Paramètres · الإعدادات » — « Tous les réglages de l'application au même endroit.
Chaque écran garde ses propres droits d'accès. ». Cartes (selon droits et masquages) avec description : Interface*, Accès par
compte*, Utilisateurs, Rôles, Matrice des permissions, Clôture des périodes, Journal d'audit, Paramètres RH, Cotisations &
impôts, Légendes de présence, Paramètres finance, Paramètres achats (* SA uniquement). Le SA voit aussi la carte de
réinitialisation des données de test (« Réinitialiser » → « Réinitialiser les données de test », action définitive, mot de
confirmation à taper, « Tout supprimer ») — hors manuel utilisateur standard.

---

# PARTIE E — Récapitulatif des points à vérifier / incohérences

1. Légendes : écriture réservée au SA en base, alors que l'écran est ouvert aux autres rôles ; enregistrer un code depuis
   l'écran remet « déclenche AN » à faux (risque sur AN) et ne permet pas de régler « compte comme présence ».
2. `/referentiels/legendes` et `/referentiels/activites` sont des écrans réservés ; la décision D14 pointe vers le premier.
3. Rubriques : message « anciennes valeurs effacées » jamais déclenché en modification manuelle ; règle en base qui peut
   refuser une valeur à un niveau différent du « S'applique à » (alors que l'écran le propose).
4. Bulletin : « Charger l'en-tête » remplace aussi l'en‑tête de la fiche employé.
5. Code de rubrique en double : message technique de la base (texte à relever en recette).
6. Journal d'audit : droit de lecture probablement absent pour ADMIN_RH par défaut.
7. D16 n'est pas une décision du Centre (proposition légale + D2).
8. Droits par défaut issus des migrations ; vérifier la matrice réelle avant de rédiger les tableaux « qui peut faire quoi ».
9. Valeurs CRP créées depuis le contrat non distinguées dans l'onglet Valeurs.

# PARTIE F — Pistes de découpage vidéo (suggestion)
1. Tour des Paramètres RH (vue d'ensemble + onglets) — 3 min.
2. Créer une rubrique et saisir ses valeurs (chantier puis employé) ; priorité employé > contrat > poste > chantier — 5 min.
3. Importer le dictionnaire depuis Excel (modèle, aperçu, confirmation) — 4 min.
4. Modèle de fiche + documents obligatoires — 4 min. 5. Modèle de bulletin — 3 min.
6. Listes et codes ; légendes et demande D14 — 4 min. 7. Feuille de présence (SA) — 3 min.
8. Centre de décisions : lire, décider, refuser, notifications ; exemple D4 puis D3 — 6 min.
9. Droits : rôles, matrice, accès par compte, interface (SA) — 6 min. 10. Journal d'audit et clôture des périodes — 3 min.
