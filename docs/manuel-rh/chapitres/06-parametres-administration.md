# 6 Paramètres RH & administration — الإعدادات والإدارة

**Dans ce chapitre** — Vous apprenez à régler le module Ressources Humaines et à l'administrer : les paramètres RH (rubriques de salaire, modèle de fiche, listes et codes, codes de présence, modèle de bulletin, feuille de présence, pièces exigées), la wilaya datée des chantiers, le Centre de décisions (consulter, demander, décider, suivre les notifications), puis les droits (rôles, matrice des permissions, accès par compte, interface par rôle, utilisateurs), la clôture des périodes et le journal d'audit. Beaucoup de ces réglages sont réservés au SUPER_ADMIN : chaque fiche indique le public concerné. Les décisions D1 à D15 sont récapitulées dans l'Annexe A.

| Fonction | Vidéo | Public |
|---|---|---|
| 6.1 Consulter la vue d'ensemble des paramètres RH | V6.1 | Tous les rôles RH (lecture) |
| 6.2 Créer une rubrique de salaire | V6.2 | SUPER_ADMIN |
| 6.3 Modifier, masquer ou supprimer une rubrique | V6.2 | SUPER_ADMIN |
| 6.4 Choisir le mode de calcul et la classe d'une rubrique | V6.4 | SUPER_ADMIN, ADMIN_RH, GERANT |
| 6.5 Saisir les valeurs d'une rubrique | V6.5 | SUPER_ADMIN, ADMIN_RH, GERANT |
| 6.6 Importer des rubriques depuis un fichier | V6.6 | SUPER_ADMIN |
| 6.7 Paramétrer le modèle de fiche employé | V6.7 | ADMIN_RH, GERANT, SUPER_ADMIN |
| 6.8 Choisir les pièces exigées pour la fiche employé | V6.7 | SUPER_ADMIN |
| 6.9 Gérer les listes et codes | V6.9 | ADMIN_RH, GERANT, SUPER_ADMIN |
| 6.10 Gérer les codes de présence | V6.10 | SUPER_ADMIN |
| 6.11 Demander le changement d'un coefficient (décision D14) | V6.10 | SUPER_ADMIN, comptes autorisés |
| 6.12 Paramétrer le modèle de bulletin | V6.12 | ADMIN_RH, GERANT, SUPER_ADMIN |
| 6.13 Configurer les colonnes de la feuille de présence | V6.13 | SUPER_ADMIN |
| 6.14 Confirmer ou changer la wilaya d'un chantier | V6.14 | SUPER_ADMIN |
| 6.15 Consulter le Centre de décisions | V6.15 | Tous les rôles |
| 6.16 Demander une décision | V6.15 | ADMIN_RH, GERANT, SUPER_ADMIN |
| 6.17 Prendre une décision (approuver ou refuser) | V6.17 | SUPER_ADMIN, décideurs délégués |
| 6.18 Suivre les notifications | V6.17 | Tous les rôles |
| 6.19 Consulter et créer les rôles | V6.19 | SUPER_ADMIN (GERANT en lecture) |
| 6.20 Régler la matrice des permissions | V6.20 | SUPER_ADMIN (GERANT en lecture) |
| 6.21 Définir l'accès par compte | V6.21 | SUPER_ADMIN |
| 6.22 Régler l'interface par rôle | V6.22 | SUPER_ADMIN |
| 6.23 Gérer les utilisateurs | V6.23 | SUPER_ADMIN, ADMIN_RH |
| 6.24 Clôturer ou rouvrir une période | V6.24 | SUPER_ADMIN, GERANT, ADMIN_FINANCE |
| 6.25 Consulter le journal d'audit | V6.24 | SUPER_ADMIN, GERANT, ADMIN_RH, ADMIN_FINANCE |

---

## 6.0 L'écran en un coup d'œil

Ce chapitre utilise deux pages principales : la page « Paramètres RH » (réglages du module RH) et la page « Paramètres » (administration de toute l'application). Le Centre de décisions est décrit dans la fiche 6.15.

**La page « Paramètres RH »** (`/rh/parametres`) — de haut en bas :

1. Le titre de la barre supérieure : « Paramètres RH ».
2. L'en-tête : sur-titre « Configuration du module RH », titre « Paramètres ».
3. La **vue d'ensemble** : cartes de synthèse en lecture seule (fiche 6.1).
4. Le titre « Configuration détaillée ».
5. La **barre d'onglets** :

| Onglet | Contenu | Visible pour |
|---|---|---|
| « Rubriques de salaire » (ouvert par défaut) | Dictionnaire, valeurs et import des rubriques (fiches 6.2 à 6.6) | Tous ceux qui ouvrent la page |
| « Cotisations & impôts » | Taux CNAS, CACOBATPH, barème IRG, SNMG (voir chapitre 5 Juridique) | Comptes autorisés à lire les paramètres légaux |
| « Modèle de fiche » | Impression de la fiche employé et pièces exigées (fiches 6.7 et 6.8) | Tous |
| « Listes et codes » | Listes de valeurs et codes de présence (fiches 6.9 à 6.11) | Tous |
| « Modèle de bulletin » | En-tête, codes et employeur du bulletin (fiche 6.12) | Tous |
| « Feuille de présence » | Colonnes et droits de la grille de présence (fiche 6.13) | SUPER_ADMIN uniquement |

6. Le contenu de l'onglet choisi. Les messages s'affichent en haut de l'onglet : en vert pour un succès, en rouge pour une erreur.

**La page « Paramètres »** (`/parametres`, menu latéral « Paramètres ») — en-tête « Administration · الإدارة » et « Paramètres · الإعدادات », texte « Tous les réglages de l'application au même endroit. Chaque écran garde ses propres droits d'accès. ». Elle présente une carte par écran, selon vos droits :

| Carte | Description affichée | Fiche |
|---|---|---|
| « Interface » | « Modules et onglets visibles par rôle, ordre, libellés et couleurs. » | 6.22 |
| « Accès par compte » | « Choisir un compte, ouvrir ses modules puis les onglets de chaque module. » | 6.21 |
| « Utilisateurs » | « Comptes, invitations, rôles et chantiers de chaque utilisateur. » | 6.23 |
| « Rôles » | « Rôles disponibles et leur niveau. » | 6.19 |
| « Matrice des permissions » | « Droits lire / créer / modifier / supprimer / imprimer / exporter par rôle et par écran. » | 6.20 |
| « Clôture des périodes » | « Verrouillage des mois clôturés. » | 6.24 |
| « Journal d'audit » | « Historique des modifications. » | 6.25 |
| « Paramètres RH » | « Rubriques de salaire, cotisations & impôts, modèle de fiche, listes et codes, bulletin. » | 6.1 |
| « Cotisations & impôts » | « CNAS, CACOBATPH, barème IRG, SNMG et variables légales. » | chapitre 5 |

Les cartes « Interface » et « Accès par compte » ne sont visibles que pour le SUPER_ADMIN. Les codes de présence se gèrent dans « Paramètres RH » › « Listes et codes » (fiche 6.10).

**Bon à savoir sur l'affichage**

- Dans le module RH, les écrans s'affichent en français. Certains écrans d'administration affichent le libellé en français et en arabe (par exemple « Paramètres · الإعدادات »).
- Un astérisque rouge « * » après un libellé signale un champ obligatoire.
- Les onglets peuvent être masqués, réordonnés ou renommés par l'administrateur (fiches 6.21 et 6.22). **Si un onglet décrit ici n'apparaît pas, voyez avec l'administrateur.**
- Si vous ouvrez une page masquée pour votre rôle, l'application vous renvoie au Tableau de bord avec le message « Cette page n'est pas affichée pour votre rôle (Paramètres → Interface). ». Si votre rôle n'a pas le droit d'ouvrir la page : « Accès refusé pour votre rôle. ».

---

## 6.1 Consulter la vue d'ensemble des paramètres RH

> **Vidéo V6.1** · durée estimée 3 min · Public : tous les rôles RH (lecture)

**Où la trouver** — Ressources Humaines › onglet « Paramètres » (`/rh/parametres`), ou Paramètres › carte « Paramètres RH ».

**À quoi ça sert** — Lire en un coup d'œil les chiffres clés du paramétrage RH (taux de cotisation, barème IRG du mois, nombre de rubriques et de codes) avant d'entrer dans les onglets. Cette partie est en lecture seule.

**Avant de commencer**
- [ ] Avoir le droit de lire l'écran « Paramètres RH » (accordé par défaut à la plupart des rôles RH).

**Étapes**
1. Ouvrez la page « Paramètres RH ». La vue d'ensemble s'affiche en haut de la page.
2. Lisez la carte « Cotisations sociales » : lignes « CNAS — part salariale », « CNAS — part patronale », « Œuvres sociales » et « CACOBATPH », avec leur taux en %.
   - Si aucun taux n'est saisi, la carte affiche « Taux non renseignés ».
   - Le lien « Modifier » ouvre l'onglet « Cotisations & impôts », section CNAS (voir chapitre 5).
3. Lisez la carte « Barème IRG mensuel » : une ligne par tranche du barème en vigueur pour le mois en cours, avec une barre proportionnelle et le taux.
   - Les bornes sont celles du barème annuel **divisées par 12**. Exemple : une tranche annuelle de 240 000 à 480 000 DA s'affiche « 20 000 – 40 000 DA ». La dernière tranche s'affiche « > a DA ».
   - Sans barème en vigueur : « Aucun barème en vigueur ». Le lien « Modifier » ouvre la section IRG.
4. Lisez la carte « Paramétrage » : nombre de « Rubriques de salaire », de « Listes et codes » (nombre de types de listes), de « Champs de la fiche employé » actifs et de « Légendes de pointage ».
5. Utilisez au besoin les quatre tuiles de raccourci :
   - « Chantiers » (« N site(s) ») : annuaire des chantiers ;
   - « Postes & grille » (« Postes et salaires ») : postes et grille salariale (chapitre 1) ;
   - « Cotisations & impôts » (« CNAS, IRG, régimes ») : chapitre 5 ;
   - « Qualité des données » (« Fiches à compléter ») : chapitre 0.
6. Descendez jusqu'au titre « Configuration détaillée » et choisissez l'onglet à régler.

**Résultat** — Vous savez quels taux et quel barème s'appliquent ce mois-ci et combien d'éléments sont paramétrés. Rien n'est modifié.

**Attention**
- La vue d'ensemble montre le barème du mois en cours seulement. Pour un autre mois, ouvrez « Cotisations & impôts ».
- Un bandeau rouge sous « Configuration détaillée » signale une erreur de chargement : rechargez la page ; si le message persiste, prévenez l'administrateur.

**Voir aussi** — 6.2 Créer une rubrique de salaire · 6.10 Gérer les codes de présence · chapitre 5 Juridique (cotisations et impôts)

---

## 6.2 Créer une rubrique de salaire

> **Vidéo V6.2** · durée estimée 5 min · Public : SUPER_ADMIN

**Où la trouver** — Ressources Humaines › « Paramètres » › onglet « Rubriques de salaire » › sous-onglet « Dictionnaire » (`/rh/parametres`).

**À quoi ça sert** — Définir une ligne de bulletin (prime, indemnité, rappel, remboursement ou retenue) : son code, ses libellés, sa classe fiscale (CNAS et IRG), son mode de calcul et le niveau auquel on saisit sa valeur. Une fois créée, la rubrique peut recevoir des valeurs (fiche 6.5), être posée sur un contrat et entrer dans la paie.

**Avant de commencer**
- [ ] Être connecté avec le rôle SUPER_ADMIN (le dictionnaire lui est réservé).
- [ ] Avoir choisi avec le responsable paie le code, la classe fiscale et le mode de calcul (fiche 6.4).

**Étapes**
1. Ouvrez le sous-onglet « Dictionnaire ». Le formulaire est en haut, le tableau des rubriques en dessous.
2. Saisissez le « Code » (obligatoire), par exemple « 302 ». 1 à 40 caractères ; il est mis en majuscules.
   - Pour une nouvelle rubrique, le premier chiffre du code propose la classe : 1xx → classe 1, 2xx → classe 2 … 5xx → classe 5. Vérifiez la classe proposée.
3. Saisissez le « Libellé FR » (obligatoire, 160 caractères au plus) et le « Libellé AR » (obligatoire ; la saisie se fait de droite à gauche).
4. Choisissez « S'applique à » (obligatoire, « Chantier » par défaut) : « Chantier », « Contrat », « Employé » ou « Poste ». C'est le niveau proposé par défaut quand on saisit les valeurs.
5. Choisissez la « Nature » (obligatoire, « Indemnité » par défaut) : « Indemnité », « Prime », « Rappel », « Remboursement » ou « Retenue ». En classe 5, la nature devient automatiquement « Retenue ».
6. Choisissez le mode dans « Mode (نسبة / مبلغ / برام) » (obligatoire, « Journalier *J » par défaut) : « Pourcentage *% », « Montant /F », « Journalier *J », « Journalier présence » ou « Mensuel ÷ jours du mois ». Voir la fiche 6.4.
7. Choisissez la « Classe fiscale » (obligatoire) : « 1 · CNAS + IRG », « 2 · CNAS », « 3 · IRG », « 4 · Ni CNAS ni IRG » ou « 5 · Retenues ».
   - Les cases « Cotisable CNAS (classe) » et « Imposable IRG (classe) » sont grisées : elles se cochent seules selon la classe.
8. Saisissez éventuellement un « Montant par défaut » (0 si vide). En classe 5, la zone s'appelle « Montant positif (retenu du net) ».
   - Un montant négatif n'est accepté qu'en classe 5.
9. Cliquez sur « Ajouter une rubrique ».

**Résultat** — Le message « Rubrique enregistrée. » s'affiche et le formulaire se vide. La rubrique apparaît dans le tableau, trié par classe puis par code. Elle est active : elle est proposée dans l'onglet « Valeurs », dans les contrats et dans la paie.

**Attention**
- « Saisissez le code et les deux libellés. » : un des trois champs est vide.
- « Montant négatif accepté seulement en classe 5 (retenues). » : saisissez un montant positif, ou passez en classe 5 s'il s'agit d'une retenue.
- « Contrôle des rubriques réservé à SUPER_ADMIN. » ou « Enregistrement refusé (droits). » : votre compte n'a pas le rôle SUPER_ADMIN.
- Un code déjà utilisé est refusé : choisissez un autre code, ou modifiez la rubrique existante (fiche 6.3).
- L'ordre d'affichage d'une rubrique créée à la main n'est pas réglable dans ce formulaire.
- Si vous n'êtes pas SUPER_ADMIN, l'onglet affiche « Consultation uniquement. » ou « Le dictionnaire reste SUPER_ADMIN. Vous pouvez saisir les montants (contrat / chantier / employé). » : vous pouvez consulter le dictionnaire et saisir des valeurs (fiche 6.5).

**Voir aussi** — 6.3 Modifier, masquer ou supprimer une rubrique · 6.4 Choisir le mode de calcul et la classe · 6.5 Saisir les valeurs d'une rubrique · 6.6 Importer des rubriques

---

## 6.3 Modifier, masquer ou supprimer une rubrique

> **Vidéo V6.2** · durée estimée 5 min (avec 6.2) · Public : SUPER_ADMIN

**Où la trouver** — Ressources Humaines › « Paramètres » › « Rubriques de salaire » › « Dictionnaire », boutons de la ligne de la rubrique.

**À quoi ça sert** — Corriger une rubrique existante, la retirer temporairement de la paie (masquer) ou la supprimer définitivement avec ses valeurs.

**Avant de commencer**
- [ ] Être SUPER_ADMIN (les autres rôles peuvent seulement afficher la rubrique dans le formulaire, champs grisés).
- [ ] Repérer la rubrique avec la recherche « Rechercher une rubrique… ».

**Étapes**

*Modifier*
1. Dans le tableau (colonnes « Code », « FR », « AR », « Application », « Unité », « Classe », « Défaut »), cliquez sur « Modifier » sur la ligne de la rubrique. Elle se charge dans le formulaire (et se présélectionne dans l'onglet « Valeurs »).
2. Corrigez les champs voulus. En modification, la classe n'est plus proposée automatiquement à partir du code : choisissez-la vous-même.
3. Cliquez sur « Modifier la rubrique ». Message : « Rubrique enregistrée. ».
4. Pour repartir d'un formulaire vide, cliquez sur « Nouveau ».

*Masquer ou afficher*
1. Cliquez sur « Masquer » sur la ligne. La rubrique passe en grisé.
2. Pour la remettre en service, cliquez sur « Afficher ».

*Supprimer*
1. Cliquez sur « Supprimer » sur la ligne.
2. Confirmez le message « Supprimer {libellé FR} / {libellé AR} et ses valeurs ? ».
3. Message : « Rubrique supprimée. ».

**Résultat** — Modification : la rubrique est mise à jour dans le tableau. Masquage : elle n'est plus proposée dans l'onglet « Valeurs » et n'est plus calculée en paie, mais elle reste dans le dictionnaire. Suppression : la rubrique et toutes ses valeurs disparaissent.

**Attention**
- La suppression efface aussi toutes les valeurs de la rubrique (chantiers, postes, contrats, employés). Préférez « Masquer » si la rubrique a déjà servi.
- « Suppression refusée. » : la rubrique ne peut pas être supprimée (par exemple parce qu'elle est déjà utilisée) ; masquez-la.
- « Mise à jour refusée. » : vos droits ne permettent pas l'opération.
- Enregistrer une rubrique masquée avec « Modifier la rubrique » la rend de nouveau active.
- Après un changement de « S'applique à », ouvrez l'onglet « Valeurs » et vérifiez les valeurs de la rubrique.
- La paie n'est jamais recalculée automatiquement : pour qu'un changement s'applique à une paie brouillon déjà calculée, il faut une décision D3 (Recalcul des paies brouillon) (fiche 6.17).

**Voir aussi** — 6.2 Créer une rubrique de salaire · 6.5 Saisir les valeurs d'une rubrique · 6.17 Prendre une décision

---

## 6.4 Choisir le mode de calcul et la classe d'une rubrique

> **Vidéo V6.4** · durée estimée 4 min · Public : SUPER_ADMIN, ADMIN_RH, GERANT

**Où la trouver** — Le mode et la classe se choisissent dans le « Dictionnaire » (fiche 6.2). Le choix entre rubrique de travail et rubrique de récupération se fait dans le contrat de travail (Documents › « Registre » › carte « Contrat de travail », voir chapitre 1).

**À quoi ça sert** — Comprendre comment la paie calcule le montant d'une rubrique, comment elle la soumet à la CNAS et à l'IRG, et quelle valeur elle retient quand plusieurs niveaux en ont une.

**Avant de commencer**
- [ ] Connaître le salaire de base et le nombre de jours du mois de l'exemple.
- [ ] Savoir distinguer les jours payés et les jours réellement travaillés (chapitre 2 Temps & présence).

**Étapes**
1. **Choisissez le mode de calcul** selon la façon dont la prime est due. Exemple pour un salarié au salaire de base de 60 000 DA, présent tout le mois :

| Mode à l'écran | Calcul | Exemple |
|---|---|---|
| « Pourcentage *% » | salaire de base mensuel × taux × part du mois payée | 10 % × 60 000 DA × 1 = 6 000 DA |
| « Montant /F » | montant mensuel × part du mois payée | 3 000 DA × 1 = 3 000 DA ; payé pour un demi-mois : 1 500 DA |
| « Journalier *J » | montant × jours payés | 200 DA × 26 jours payés = 5 200 DA |
| « Journalier présence » | montant × jours réellement travaillés | 200 DA × 22 jours travaillés = 4 400 DA |
| « Mensuel ÷ jours du mois » | montant mensuel × jours travaillés ÷ jours du mois | 3 100 DA × 25 jours ÷ 31 jours = 2 500 DA |

   - Les jours payés viennent des codes de présence et de leurs coefficients (fiche 6.10). Les jours de récupération (CRP) ne comptent pas pour les rubriques de travail.
2. **Choisissez la classe fiscale** :

| Classe | Soumise à la CNAS | Soumise à l'IRG | Exemple d'usage |
|---|---|---|---|
| « 1 · CNAS + IRG » | Oui | Oui | prime soumise à tout |
| « 2 · CNAS » | Oui | Non | |
| « 3 · IRG » | Non | Oui | |
| « 4 · Ni CNAS ni IRG » | Non | Non | |
| « 5 · Retenues » | Non | Non | montant retenu sur le net |

   - Une rubrique de classe 5 est toujours **déduite** du net. Saisissez son montant en positif. Exemple : retenue de 1 000 DA en « Montant /F », salarié ayant travaillé 15 jours sur un mois de 30 jours : 1 000 × 15 ÷ 30 = 500 DA retenus.
   - Une rubrique de nature « Retenue » dans une autre classe est également déduite.
   - La classe d'une rubrique relève du responsable paie ; en cas de doute, consultez-le avant de créer la rubrique.
3. **Comprenez la priorité des valeurs** : quand une rubrique a une valeur à plusieurs niveaux, la paie retient la première trouvée dans cet ordre : « Employé » > « Contrat » > « Poste » > « Chantier ».
   - Exemple : prime de panier de 300 DA par jour pour le chantier, 350 DA pour un employé précis de ce chantier → cet employé reçoit 350 DA par jour, ses collègues 300 DA.
4. **Distinguez rubriques de travail et rubriques de récupération** dans le formulaire du contrat de travail :
   - la section « Rubriques de salaire » (« Choisissez par classe, puis réglez le mode et la valeur de chaque rubrique. ») contient les rubriques payées sur les jours travaillés ;
   - la section « Rubriques de récupération (CRP) · بنود العطلة التعويضية » (« Payées seulement sur les jours pointés CRP. Le salaire de base reste dû ; les rubriques ci-dessus ne s'appliquent pas à ces jours. ») contient les rubriques payées seulement sur les jours pointés « CRP ».
   - Exemple : rubrique de récupération journalière de 500 DA, 4 jours pointés CRP dans le mois → 2 000 DA, sur une ligne du bulletin suivie de « (récupération) ». Une rubrique de récupération mensuelle ou en pourcentage est répartie sur les jours du mois.

**Résultat** — Vous savez quel mode et quelle classe choisir, et quel montant la paie calculera.

**Attention**
- Une rubrique « Chantier » ne se pose pas sur un contrat : « Les rubriques chantier restent héritées, elles ne se posent pas sur le contrat. ».
- Dans le contrat, les rubriques « Employé » sont enregistrées au niveau de l'employé, les autres au niveau du contrat. Enregistrer le contrat remplace toutes les valeurs du contrat et de l'employé.
- Les valeurs saisies dans l'onglet « Valeurs » (fiche 6.5) sont toujours des rubriques de travail. Les rubriques de récupération se règlent dans le contrat.

**Voir aussi** — 6.2 Créer une rubrique de salaire · 6.5 Saisir les valeurs d'une rubrique · 6.10 Gérer les codes de présence · chapitre 1 Personnel (contrats) · chapitre 3 Paie (calcul)

---

## 6.5 Saisir les valeurs d'une rubrique

> **Vidéo V6.5** · durée estimée 5 min · Public : SUPER_ADMIN, ADMIN_RH, GERANT

**Où la trouver** — Ressources Humaines › « Paramètres » › « Rubriques de salaire » › sous-onglet « Valeurs ».

**À quoi ça sert** — Fixer le montant d'une rubrique pour un chantier, un poste, un contrat ou un employé. C'est ce montant que la paie utilise.

**Avant de commencer**
- [ ] Avoir le rôle SUPER_ADMIN, ADMIN_RH ou GERANT.
- [ ] La rubrique existe et n'est pas masquée (fiches 6.2 et 6.3).
- [ ] La cible existe : chantier, poste, contrat ou employé.

**Étapes**
1. Ouvrez le sous-onglet « Valeurs ».
2. Choisissez la « Rubrique » (obligatoire). La liste affiche « code · FR — AR · Application ». Le montant se pré-remplit avec la valeur par défaut de la rubrique.
3. Vérifiez le « Niveau » (obligatoire) : « Chantier », « Poste » (affiché seulement s'il existe des postes), « Contrat » ou « Employé ». Il est réglé sur le « S'applique à » de la rubrique. L'aide rappelle « Priorité : employé > contrat > poste > chantier ».
   - Gardez de préférence le niveau proposé.
4. Dans « Cible », tapez quelques lettres dans « Rechercher », puis choisissez la cible dans la liste (obligatoire) :
   - employé : « matricule · NOM Prénom » ;
   - chantier : « code · nom » ;
   - contrat : « matricule · employé · chantier · poste » ;
   - poste : « code · libellé ».
5. Saisissez le « Montant » (obligatoire). Un montant négatif n'est accepté que pour une rubrique de classe 5.
6. Cliquez sur « Ajouter une valeur ».
7. Pour corriger une valeur : cliquez sur « Modifier » sur sa ligne, ajustez, puis cliquez sur « Modifier la valeur ». « Nouveau » revient en création.
8. Pour supprimer une valeur : cliquez sur « Supprimer » sur sa ligne et confirmez « Supprimer cette valeur ? ».

**Résultat** — Message « Valeur enregistrée. » (ou « Valeur supprimée. »). Le tableau (colonnes « Rubrique », « Application », « Cible », « Montant ») affiche les valeurs de la rubrique sélectionnée ; sans rubrique sélectionnée, il affiche toutes les valeurs. Recherche : « Rechercher une rubrique ou une cible… ».

Effet sur la paie : aucune paie n'est recalculée automatiquement.
- Si une paie brouillon concernée a déjà été calculée, elle est marquée « données modifiées depuis le calcul » et une décision D3 (Recalcul des paies brouillon) est demandée au Centre de décisions.
- S'il n'existe pas encore de paie pour le chantier et le mois concernés, une décision D4 (Génération de paie) peut être demandée.
- Pour une valeur au niveau « Poste », tous les contrats brouillon ou actifs de ce poste sont concernés.

**Attention**
- « Choisissez la rubrique et la cible (employé, chantier ou contrat). » : un des deux choix manque.
- « Cette valeur existe déjà pour cette cible. » : une seule valeur par rubrique et par cible ; modifiez la valeur existante.
- « Rubrique introuvable. » : la rubrique a été supprimée entre-temps ; rechargez la page.
- « Cette rubrique s'applique uniquement à un employé » (ou « … à un chantier », « … à un contrat ») : choisissez le niveau indiqué.
- « Enregistrement refusé (droits). » : votre rôle ne permet pas la saisie des montants.
- La recherche de cible affiche 300 résultats au plus : précisez votre saisie.

**Voir aussi** — 6.4 Choisir le mode de calcul et la classe · 6.17 Prendre une décision · chapitre 3 Paie (calcul)

---

## 6.6 Importer des rubriques depuis un fichier

> **Vidéo V6.6** · durée estimée 4 min · Public : SUPER_ADMIN

**Où la trouver** — Ressources Humaines › « Paramètres » › « Rubriques de salaire » › sous-onglet « Import » (visible pour le SUPER_ADMIN uniquement).

**À quoi ça sert** — Créer ou mettre à jour en une fois de nombreuses rubriques du dictionnaire, à partir d'un fichier Excel (modèle de l'application ou tableau téléchargé du site de la CNAS ou des impôts), d'un fichier CSV ou JSON, ou de l'adresse d'un fichier public. Le texte d'aide rappelle : « Importez un Excel téléchargé depuis le site de la CNAS ou des impôts, ou collez l'URL d'un fichier public. Prévisualisation puis confirmation. Aucune rubrique absente du fichier n'est supprimée. Le niveau d'application ne change que si vous cochez l'option. »

**Avant de commencer**
- [ ] Être SUPER_ADMIN.
- [ ] Préparer un fichier de 2 Mo au plus (.xlsx, .csv ou .json), ou une adresse « http » ou « https » publique.

**Étapes**
1. (Facultatif) Cliquez sur « Télécharger le modèle ». Message « Modèle téléchargé. ». Le modèle contient les colonnes code, label_fr, label_ar, nature, unit, category, cotisable, taxable, apply_scope, default_amount, sort_order et is_active. Remplissez-le dans Excel.
   - Les colonnes cotisable et taxable sont ignorées : seule la classe (category, de 1 à 5) compte.
   - Un niveau d'application (apply_scope) vide donne « Employé ».
2. Chargez le fichier avec « Charger Excel », **ou** saisissez l'« URL d'un fichier public » (« https://… ») puis cliquez sur « Importer depuis l'URL ».
3. Cochez si besoin « Remplacer le niveau d'application (chantier / contrat / employé) s'il figure dans le fichier ». L'aperçu se recalcule.
4. Lisez l'aperçu : « Aperçu : N nouveau(x), N mise(s) à jour, N inchangé(s), N rejeté(s). » et le tableau (colonnes « Statut », « Code », « FR », « AR », « Application », « Note »).
   - « Statut » : « Nouveau », « Mise à jour », « Inchangé » ou « Rejeté ».
   - « (conservé) » dans « Application » et « Niveau d'application actuel conservé. » dans « Note » : le niveau actuel est gardé.
   - Pour une ligne rejetée, la « Note » donne le motif.
5. Corrigez le fichier si nécessaire et rechargez-le.
6. Cliquez sur « Confirmer l'import ». Le compteur à côté du bouton rappelle « N nouveau · N maj · N inchangé · N rejeté ».

**Résultat** — Message « Import terminé : N créé(s), N mis à jour. ». Les rubriques reconnues par leur code sont mises à jour ; les nouvelles sont créées ; aucune n'est supprimée. Si l'option de l'étape 3 a changé le niveau de certaines rubriques, le message ajoute « Valeurs effacées pour N rubrique(s) (changement de niveau). ».

**Attention**
- Avec l'option « Remplacer le niveau d'application… », **toutes les valeurs** d'une rubrique dont le niveau change sont effacées. Ne la cochez que si vous comptez ressaisir ces valeurs.
- « Confirmer l'import » reste grisé s'il n'y a ni nouvelle rubrique ni mise à jour.
- 400 rubriques au plus par confirmation.
- Motifs de rejet d'une ligne : « Code manquant. », « Code trop long (40 caractères). », « Libellé manquant. », « Nature inconnue. », « Classe invalide (1 à 5). », « Niveau d'application inconnu (chantier / contrat / employé). », « Montant invalide. », « Montant négatif accepté seulement en classe 5 (retenues). », « Code dupliqué dans le fichier. ».
- Messages sur le fichier : « Fichier vide. », « Fichier supérieur à 2 Mo. », « Lecture du fichier impossible. », « Aucune rubrique trouvée dans le fichier. », « Choisissez un fichier Excel, CSV ou JSON. ».
- Messages sur l'adresse : « Saisissez l'URL. », « URL invalide. », « Le lien doit être http ou https. », « Lien non autorisé. » (adresse locale ou privée), « Téléchargement impossible depuis l'URL. » (pas de réponse en 15 secondes), « Le serveur a renvoyé {code}. ».
- « Import des rubriques réservé à SUPER_ADMIN. » : votre compte n'a pas le rôle SUPER_ADMIN.
- Un tableau au format des fichiers officiels à trois lignes d'en-tête (groupes « cotisable / imposable », codes 100 à 499) est reconnu : ses rubriques sont créées au niveau « Employé » avec un montant de 0. Saisissez ensuite les valeurs (fiche 6.5).

**Voir aussi** — 6.2 Créer une rubrique de salaire · 6.3 Modifier, masquer ou supprimer une rubrique · 6.5 Saisir les valeurs d'une rubrique

---

## 6.7 Paramétrer le modèle de fiche employé

> **Vidéo V6.7** · durée estimée 5 min · Public : ADMIN_RH, GERANT, SUPER_ADMIN

**Où la trouver** — Ressources Humaines › « Paramètres » › onglet « Modèle de fiche ». En-tête : « Modèle de fiche employé » — « En-tête, titre, champs, sections et signatures se règlent ici. L'impression lit cet écran. »

**À quoi ça sert** — Régler l'impression de la fiche de renseignements de l'employé (en-tête, titre, signatures, champs et sections) et les libellés des champs de la fiche à l'écran.

**Avant de commencer**
- [ ] Avoir le droit de modifier l'écran « Paramètres RH » pour le modèle (accordé par défaut à SUPER_ADMIN, ADMIN_RH et GERANT).
- [ ] Avoir le droit de modifier l'écran « Employés » pour les libellés des champs.
- [ ] Avoir l'image de l'en-tête de l'entreprise (JPG, PNG ou WEBP, 8 Mo au plus).

**Étapes**
1. **En-tête et titre** :
   - cliquez sur « Charger l'en-tête » et choisissez l'image. Elle est enregistrée aussitôt : « En-tête entreprise chargé. » ;
   - saisissez le « Titre du document » (obligatoire, 160 caractères au plus) et le « Libellé matricule » (obligatoire, 80 caractères au plus) ;
   - réglez le « Préfixe téléphone » (« +213 » par défaut) et les « Champs téléphone (codes) » (codes des champs séparés par des virgules, 20 au plus).
2. **Signatures** : remplissez au besoin « Gauche · titre », « Gauche · 2ᵉ ligne », « Droite · titre », « Droite · ligne 1 », « Droite · ligne 2 » (80 caractères chacun, facultatifs).
3. **Identité en haut de page** : dans « Colonne gauche » et « Colonne droite », choisissez les champs affichés (« libellé (code) »). « Ajouter un champ » ajoute une ligne, « Supprimer » la retire. 20 champs au plus par colonne.
4. **Sections d'impression** :
   - « Ajouter une section » crée une section « NOUVELLE SECTION » ; renommez-la dans « Titre de section » ;
   - dans chaque ligne, choisissez 1 à 4 champs avec « Champ sur la même ligne » ; « Nouvelle ligne » ajoute une ligne ; « Supprimer la ligne » et « Supprimer la section » retirent les éléments ;
   - 20 sections au plus, 30 lignes par section.
5. Cliquez sur « Aperçu impression » pour voir une fiche exemple (NOM / Prenom, matricule « 00/00 ») avec le modèle affiché à l'écran.
6. Cliquez sur « Enregistrer le modèle ». Message : « Modèle d'impression enregistré. ».
7. **Libellés des champs (fiche et impression)** : dans le tableau (« FR », « AR », « Section FR », « Section AR », « Ordre », « Visible », « Obligatoire »), modifiez une ligne puis cliquez sur « Enregistrer le champ » **sur cette ligne**. Message : « {libellé} enregistré. ».
   - Décocher « Visible » retire le champ de la fiche sans effacer les données.
   - La colonne « Obligatoire » ne se modifie que par le SUPER_ADMIN.

**Résultat** — Les prochaines impressions de la fiche employé utilisent le nouveau modèle ; les libellés modifiés apparaissent dans la fiche.

**Attention**
- Les réglages d'en-tête, de titre, de signatures et de sections ne sont pas conservés tant que vous n'avez pas cliqué sur « Enregistrer le modèle » (seule l'image d'en-tête est enregistrée dès son envoi). L'aperçu peut montrer un modèle non enregistré.
- Les lignes vides des listes de champs sont retirées à l'enregistrement.
- Chaque ligne du tableau des libellés s'enregistre séparément.
- « Image trop volumineuse (8 Mo max). », « Formats acceptés: JPG, PNG, WEBP. », « Choisissez une image d'en-tête. » : changez d'image.
- « Réservé à SUPER_ADMIN. » : la bascule obligatoire / optionnel est réservée au SUPER_ADMIN. « Mise à jour refusée. » : vos droits ne le permettent pas.

**Voir aussi** — 6.8 Choisir les pièces exigées · 6.12 Paramétrer le modèle de bulletin · chapitre 4 Documents (fiche de renseignements)

---

## 6.8 Choisir les pièces exigées pour la fiche employé

> **Vidéo V6.7** · durée estimée 5 min (avec 6.7) · Public : SUPER_ADMIN

**Où la trouver** — Ressources Humaines › « Paramètres » › onglet « Modèle de fiche », bloc « Documents obligatoires (fiche employé) » en bas de la page.

**À quoi ça sert** — Choisir les documents qu'il faut avoir téléversés pour pouvoir enregistrer une fiche employé (par exemple une copie de pièce d'identité).

**Avant de commencer**
- [ ] Être SUPER_ADMIN. Les autres rôles voient « Consultation seule. Seul SUPER_ADMIN peut rendre un document obligatoire ou optionnel. ».
- [ ] Les types de documents à téléverser existent dans la liste « Document officiel » (fiche 6.9).

**Étapes**
1. Descendez jusqu'au bloc « Documents obligatoires (fiche employé) ». Le texte rappelle : « Cochez les documents exigés avant tout nouvel enregistrement de la fiche (après la première création). Réservé à SUPER_ADMIN. ».
2. Repérez le document dans le tableau (« Document », « Code », « Obligatoire pour enregistrer »).
3. Cochez ou décochez « Obligatoire pour enregistrer ».
4. Cliquez sur « Enregistrer » **sur la même ligne**.

**Résultat** — Message « {document} mis à jour. ». Le compteur « Obligatoires actuellement : N » se met à jour. À partir du prochain enregistrement d'une fiche, le document est exigé.

**Attention**
- Cocher la case ne suffit pas : cliquez sur « Enregistrer » de la ligne.
- L'exigence s'applique aux enregistrements qui suivent la première création de la fiche : la toute première création d'un employé n'est pas bloquée.
- « Aucun type de document à téléverser. Ajoutez-les dans « Listes et codes ». » : la liste « Document officiel » ne contient aucun type à téléverser.
- « Réservé à SUPER_ADMIN. », « Type de document introuvable. », « Mise à jour refusée. » : vérifiez votre rôle ou rechargez la page.

**Voir aussi** — 6.7 Paramétrer le modèle de fiche employé · 6.9 Gérer les listes et codes · chapitre 1 Personnel (fiche employé)

---

## 6.9 Gérer les listes et codes

> **Vidéo V6.9** · durée estimée 3 min · Public : ADMIN_RH, GERANT, SUPER_ADMIN

**Où la trouver** — Ressources Humaines › « Paramètres » › onglet « Listes et codes ». En-tête : « Les listes et codes s'ajoutent ici. Rien n'est figé dans le programme. »

**À quoi ça sert** — Ajouter ou corriger les valeurs proposées dans les listes déroulantes du module RH : sexe, situation familiale, type de contrat, régime de travail, poste, niveau d'études, document officiel, mode de paiement, wilaya, etc.

**Avant de commencer**
- [ ] Avoir le droit de modifier l'écran « Paramètres RH » (accordé par défaut à SUPER_ADMIN, ADMIN_RH et GERANT).

**Étapes**

*Ajouter une valeur à une liste existante*
1. Dans « Liste », choisissez la liste (affichée « libellé FR — libellé AR »).
2. Saisissez le « Code » (obligatoire, 1 à 40 caractères), le « Libellé FR » (obligatoire) et le libellé arabe dans « التسمية » (obligatoire), 160 caractères au plus chacun.
3. Si la liste le demande, saisissez des données complémentaires dans « Extra JSON {"work_days":28} », par exemple le nombre de jours de travail d'un régime.
4. Cliquez sur « Enregistrer ». Message : « Valeur enregistrée. ».

*Corriger une valeur*
1. Cherchez-la avec « Code, libellé… » dans le tableau (« Code », « FR », « AR »).
2. Cliquez sur « Modifier » : la valeur se recharge dans les zones de saisie.
3. Corrigez puis cliquez sur « Enregistrer ».

*Créer un nouveau type de liste*
1. Dans le panneau « Types de listes », saisissez le code (zone « code (job_title) ») : 2 à 40 caractères, commençant par une lettre, lettres, chiffres ou « _ » ; il est mis en minuscules.
2. Saisissez le libellé français (« Libellé FR ») et le libellé arabe (« التسمية »), obligatoires, 120 caractères au plus.
3. Cliquez sur « Ajouter le type ». Message : « Type de liste enregistré. ». Le nouveau type devient la liste sélectionnée.

**Résultat** — La valeur est proposée dans les formulaires RH qui utilisent cette liste.

**Attention**
- Si le code d'un type existe déjà, ses libellés sont mis à jour (pas de doublon).
- « JSON extra invalide. » : la zone « Extra JSON » doit respecter la forme de l'exemple, avec accolades et guillemets.
- L'écran permet d'ajouter et de modifier des valeurs ; il ne propose pas de suppression.
- Les listes « Zone IRG », « Wilaya → zone IRG » et « Profil social » se gèrent aussi dans « Cotisations & impôts » (chapitre 5).
- Les types de documents à téléverser se trouvent dans la liste « Document officiel » ; leur caractère obligatoire se règle dans la fiche 6.8.
- Les codes de présence ont leur propre panneau sur cet onglet (fiche 6.10).

**Voir aussi** — 6.8 Choisir les pièces exigées · 6.10 Gérer les codes de présence · chapitre 5 Juridique

---

## 6.10 Gérer les codes de présence

> **Vidéo V6.10** · durée estimée 5 min · Public : SUPER_ADMIN

**Où la trouver** — Ressources Humaines › « Paramètres » › onglet « Listes et codes », panneau « Légendes de présence ».

**À quoi ça sert** — Créer les codes que l'on saisit dans la grille de présence (P, MS, CRP, CA…), régler leur libellé et leur couleur. Chaque code a un **coefficient** : le poids du jour dans le calcul des jours payés.

**Avant de commencer**
- [ ] Être SUPER_ADMIN (l'enregistrement des codes lui est réservé).
- [ ] Vérifier dans la liste des pastilles que le code n'existe pas déjà.

**Étapes**

*Créer un code*
1. Cliquez sur « Nouveau code » : le formulaire se vide.
2. Saisissez le code (zone « P ») : obligatoire, 16 caractères au plus, mis en majuscules.
3. Saisissez le libellé français (zone « Présent ») : obligatoire, 120 caractères au plus. Saisissez au besoin le libellé arabe (zone « حاضر »).
4. Saisissez le coefficient (zone « 0,5 ») au clavier, avec une virgule : obligatoire, de 0 à 999,999. Exemples : 1 pour un jour entier, 0,5 pour un demi-jour, 0 pour un jour non payé.
5. Choisissez la couleur de la pastille.
6. Cliquez sur « Enregistrer le code ». Message : « Légende enregistrée. ».

*Modifier le libellé ou la couleur d'un code*
1. Cliquez sur la pastille du code (« CODE · coefficient ») : il se charge dans le formulaire.
2. Modifiez le libellé ou la couleur. Le coefficient est grisé : il ne se change que par une demande datée (fiche 6.11).
3. Cliquez sur « Enregistrer le code ».

**Résultat** — La pastille apparaît (ou se met à jour) dans la liste. Le code est utilisable dans la grille de présence. Un nouveau code compte comme jour de présence.

Comment le coefficient agit sur la paie : les jours payés du mois sont la somme des coefficients des jours pointés et validés. Exemple : 20 jours « P » (coefficient 1) + 2 jours « P/2 » (coefficient 0,5) + 1 jour « AN » (coefficient 0) = 20 + 1 + 0 = 21 jours payés.

Codes livrés à l'installation (ils ont pu être modifiés depuis) :

| Code | Libellé | Coefficient |
|---|---|---|
| P | Présent | 1 |
| P/2 | Demi présent | 0,5 |
| MS | Mission | 1 |
| CRP | Récupération | 1 |
| CA | Congé annuel | 1 |
| CM | Congé maladie | 0 |
| CSS | Congé sans solde | 0 |
| AN | Absence injustifiée | 0 |
| AJ | Absence justifiée | 0 |
| AOP | Absence autorisée payée | 1 |
| W | Week-end | 0 |
| JF | Jour férié | 1 |
| AP | Abandon de poste | 0 |

**Attention**
- Taper un autre code dans un code existant **crée un nouveau code** : l'ancien n'est pas renommé.
- « Ce code existe déjà. Sélectionnez-le dans la liste pour modifier son coefficient. » : cliquez sur sa pastille.
- « Ce code est déjà utilisé dans le pointage. Il ne peut pas être renommé : enregistrez un nouveau code. » : créez un nouveau code.
- « Coefficient : nombre attendu (ex. 0,5). », « Coefficient ≥ 0. », « Coefficient ≤ 999,999. », « Coefficient refusé par la base (0 à 999,999). Exemple : 0,5. » : corrigez le coefficient.
- « Enregistrement refusé (droits). » : seul le SUPER_ADMIN enregistre les codes.
- N'enregistrez pas à nouveau le code « AN » (Absence injustifiée) depuis ce panneau : il a un effet particulier sur les ajustements commerciaux. Pour toute modification de ce code, voyez avec l'administrateur.
- Le texte d'aide du panneau est rédigé en arabe ; il résume les règles de cette fiche et de la fiche 6.11.

**Voir aussi** — 6.11 Demander le changement d'un coefficient · 6.13 Configurer les colonnes de la feuille de présence · chapitre 2 Temps & présence (saisie des codes)

---

## 6.11 Demander le changement d'un coefficient (décision D14)

> **Vidéo V6.10** · durée estimée 5 min (avec 6.10) · Public : SUPER_ADMIN, comptes autorisés

**Où la trouver** — Ressources Humaines › « Paramètres » › « Listes et codes » › « Légendes de présence » › cliquer sur la pastille du code : cadre « Changer le coefficient de {CODE} (en vigueur ce mois : x) » sous le formulaire.

**À quoi ça sert** — Changer le coefficient d'un code de présence à partir d'un mois donné, sans toucher aux mois passés. Le changement est une **demande** : il ne s'applique qu'après la décision D14 (Coefficient d'un code de présence).

**Avant de commencer**
- [ ] Être SUPER_ADMIN, ou avoir le droit de modifier l'écran « Légendes de présence », ou le droit de créer sur l'écran « Décision D14 » de la matrice des permissions.
- [ ] Connaître le premier mois concerné : il ne doit pas déjà avoir une paie validée ou clôturée.

**Étapes**
1. Cliquez sur la pastille du code. Le cadre de demande apparaît. Il rappelle : « Le changement est une demande : il ne s'applique qu'après la décision D14, à partir du mois choisi. Les mois déjà validés ou clôturés gardent l'ancien coefficient ; les paies brouillon concernées seront signalées (recalcul sur décision D3). ».
   - La ligne « Déjà programmé : x à partir de MM/AAAA » liste les changements futurs déjà décidés.
2. Saisissez le « Nouveau coefficient » (obligatoire), par exemple 0,5.
3. Choisissez le « Mois d'effet demandé » (obligatoire ; le mois prochain par défaut).
4. Saisissez le « Motif (10 caractères minimum) » (obligatoire, 500 caractères au plus).
5. Cliquez sur « Demander le changement (D14) ».

**Résultat** — Message « Demande enregistrée : aucun effet tant que la décision D14 n'est pas prise. » et lien « Ouvrir la décision ». Les décideurs reçoivent une notification. Après la décision « Appliquer à partir du mois demandé » :
- le nouveau coefficient s'applique à partir du 1er du mois d'effet ;
- les mois antérieurs et les mois déjà validés ou clôturés gardent l'ancien coefficient ;
- les paies brouillon qui utilisent ce code sont signalées et attendent une décision D3 (Recalcul des paies brouillon) ;
- la préparation du mois affiche « Changement(s) en vigueur à partir de ce mois : CODE ancien → nouveau ».

**Attention**
- Une nouvelle demande pour le même code remplace la demande précédente encore ouverte (elle passe « Remplacée »).
- Vous ne pouvez pas décider votre propre demande (sauf SUPER_ADMIN) : un autre décideur doit la trancher.
- « Une paie de ce mois ou d'un mois suivant est déjà validée ou clôturée : le premier mois d'effet possible est MM/AAAA. » : choisissez le mois indiqué ou un mois plus tardif.
- « Mois d'effet trop lointain (24 mois au plus). » ; « Le mois d'effet commence le 1er du mois. » ; « Mois d'effet attendu (mois/année). » : corrigez le mois.
- « Le coefficient du code X vaut déjà Y pour ce mois. » : aucun changement à demander.
- « Coefficient invalide (0 à 999,999, trois décimales au plus). » ; « Motif obligatoire (10 à 500 caractères). » : corrigez la saisie.
- « Demande de changement de coefficient non autorisée. » : demandez le droit au SUPER_ADMIN.

**Voir aussi** — 6.10 Gérer les codes de présence · 6.17 Prendre une décision · Annexe A (D14) · chapitre 3 Paie (préparation du mois)

---

## 6.12 Paramétrer le modèle de bulletin

> **Vidéo V6.12** · durée estimée 3 min · Public : ADMIN_RH, GERANT, SUPER_ADMIN

**Où la trouver** — Ressources Humaines › « Paramètres » › onglet « Modèle de bulletin ». En-tête : « Données du bulletin : en-tête, unités, codes (100, 990, 995), variables légales, employeur et mois. Les taux CSS viennent des variables légales. »

**À quoi ça sert** — Régler les données imprimées sur le bulletin de paie : en-tête de l'entreprise, unités, codes et libellés des lignes fixes, identité de l'employeur reprise dans les déclarations, noms des mois.

**Avant de commencer**
- [ ] Avoir le droit de modifier l'écran « Paramètres RH ».
- [ ] Avoir sous la main la raison sociale, l'adresse, le NIF, le NIS, le n° employeur CNAS et le n° d'adhérent CACOBATPH.

**Étapes**
1. **En-tête entreprise** : cliquez sur « Utiliser l'en-tête de la fiche » pour reprendre l'en-tête du modèle de fiche (fiche 6.7). Ce bouton n'apparaît que si le modèle de fiche a déjà un en-tête ; sinon, chargez d'abord l'image dans l'onglet « Modèle de fiche ».
2. Laissez cochée « Masquer les lignes à 0 » si vous ne voulez pas imprimer les lignes nulles. Vérifiez les unités : « Unité montant » (« DA »), « Unité pourcentage » (« % »), « Unité journalier » (« DA/j »).
3. **Codes et libellés** : vérifiez « Code salaire de base » (100) et « Libellé salaire de base » (SALAIRE DE BASE), « Code retenue SS » (990) et « Libellé SS » (RET.SECURITE SOCIALE), « Code IRG » (995) et « Libellé IRG » (RET. I.R.G.), « Code intempéries » (991) et « Libellé intempéries » (RET. INTEMPERIES).
   - Les zones « Variable … » (CSS salarié, CSS patronale, FOS, congés / CACOBATPH, intempéries) relient le bulletin aux taux légaux. Laissez les valeurs proposées.
4. Choisissez le « Paiement par défaut » (« Virement »).
5. **Employeur — déclarations CNAS / G50 / CACOBATPH** : saisissez « Raison sociale », « Adresse », « NIF », « NIS », « N° employeur CNAS », « N° adhérent CACOBATPH ».
6. **Mois** : vérifiez les 12 noms de mois imprimés (Janvier … Décembre).
7. Cliquez sur « Aperçu impression » : un bulletin exemple d'un salarié fictif s'affiche avec l'en-tête choisi et les taux légaux.
8. Cliquez sur « Enregistrer le modèle ». Message : « Modèle enregistré. ».

**Résultat** — Les prochains bulletins imprimés et les déclarations reprennent ces données.

**Attention**
- Les titres, colonnes, marges, polices et libellés de bas de bulletin ne se règlent pas ici : cliquez sur « Ouvrir l'éditeur » (panneau « Mise en page, textes et styles ») pour les modifier dans l'éditeur de documents du simulateur.
- « Revenir au modèle GAS » remet seulement le formulaire aux valeurs d'origine ; rien n'est enregistré tant que vous ne cliquez pas sur « Enregistrer le modèle ».
- Pour l'en-tête, passez de préférence par l'onglet « Modèle de fiche » puis « Utiliser l'en-tête de la fiche ».
- « Enregistrement refusé (droits). » : vos droits sur « Paramètres RH » ne permettent pas la modification.
- Les taux de cotisation ne se saisissent pas ici : ils viennent de « Cotisations & impôts » (chapitre 5).

**Voir aussi** — 6.7 Paramétrer le modèle de fiche employé · chapitre 3 Paie (bulletins, déclarations) · chapitre 5 Juridique

---

## 6.13 Configurer les colonnes de la feuille de présence

> **Vidéo V6.13** · durée estimée 4 min · Public : SUPER_ADMIN

**Où la trouver** — Ressources Humaines › « Paramètres » › onglet « Feuille de présence » (visible pour le SUPER_ADMIN uniquement). En-tête : « Feuille de présence — colonnes et droits ».

**À quoi ça sert** — Choisir les colonnes de la grille de présence, leur ordre et leurs libellés, et décider pour chaque rôle qui peut les voir et qui peut les modifier. Ajouter des colonnes de saisie libre (texte, nombre ou date).

**Avant de commencer**
- [ ] Être SUPER_ADMIN. Les autres comptes reçoivent « Réservé à SUPER_ADMIN. ».

**Étapes**
1. Lisez le tableau : « Ordre » (flèches ↑ / ↓), « Code », « Libellé FR », « Libellé AR », « Nature », « Active », puis pour chaque rôle deux colonnes « Voir » et « Modifier », puis « Supprimer ».
   - « Nature » : « Dossier » (identité), « Jours » (grille des jours), « Totaux codes », « Calcul », « Saisie ». « POSTE OCCUPE » est « Dossier · saisissable ».
2. Réordonnez les colonnes avec les flèches ↑ et ↓.
3. Modifiez au besoin les libellés français et arabe.
4. Activez ou désactivez une colonne avec « Active ». La grille des jours reste toujours active (« La grille des jours reste toujours active. »).
5. Pour chaque rôle, cochez « Voir » et « Modifier ».
   - Cocher « Modifier » coche aussi « Voir » ; décocher « Voir » décoche « Modifier ».
   - « Modifier » n'est proposé que pour la grille des jours, les colonnes de saisie et « POSTE OCCUPE » ; ailleurs, la case affiche « — ».
6. Pour ajouter une colonne, remplissez le panneau « Ajouter une colonne de saisie · إضافة عمود » : « Code » (exemple « HEURES_SUP » : majuscules, chiffres ou « _ », commence par une lettre, 32 caractères au plus), « Libellé FR » (obligatoire), « Libellé AR », « Type de valeur » (Texte / Nombre / Date), puis cliquez sur « Ajouter ». Message : « Colonne CODE ajoutée — enregistrez pour l'appliquer. ».
7. Pour supprimer une colonne ajoutée, cliquez sur « Supprimer » et confirmez « Supprimer la colonne CODE ? Les valeurs saisies ne seront plus affichées. ».
8. Cliquez sur « Enregistrer » (actif seulement après une modification).

**Résultat** — Message « Colonnes et droits enregistrés. ». La grille de présence affiche les colonnes dans le nouvel ordre, avec les droits choisis pour chaque rôle.

Colonnes livrées : N°, MAT, NOM, PRENOM, POSTE OCCUPE, AFFECTATION, Jours du mois, Totaux par code, NJ, Coef, Début contrat, HS 50 % (h), HS 75 % (h), HS 100 % (h), COMMENTAIRE et VALIDATION. Les colonnes d'heures supplémentaires alimentent la paie des heures supplémentaires.

**Attention**
- Rien n'est appliqué avant « Enregistrer » : une colonne ajoutée ou supprimée reste en attente jusque-là.
- Une nouvelle colonne est visible par tous les rôles et modifiable par aucun : réglez ses droits avant d'enregistrer.
- Le SUPER_ADMIN voit et modifie toujours toutes les colonnes.
- Aucune colonne financière n'est proposée sur la feuille de présence.
- Ces droits s'ajoutent au droit d'écran « Présence » sur le chantier : un rôle sans ce droit ne voit pas la grille.
- « Colonne système ou introuvable : suppression refusée. » : les colonnes livrées ne se suppriment pas ; désactivez-les.
- « Code : lettres majuscules, chiffres ou _ (ex. HEURES_SUP). », « Le code X existe déjà. », « Libellé FR requis. », « Codes de colonne en double. », « Colonne introuvable : CODE. » : corrigez la saisie.

**Voir aussi** — 6.10 Gérer les codes de présence · chapitre 2 Temps & présence (grille de présence)

---

## 6.14 Confirmer ou changer la wilaya d'un chantier

> **Vidéo V6.14** · durée estimée 3 min · Public : SUPER_ADMIN

**Où la trouver** — Menu latéral « Chantiers » (`/referentiels/chantiers`) › « Menu » de la ligne du chantier › « Modifier ».

**À quoi ça sert** — La RH dépend du chantier pour l'affectation des contrats, les valeurs de rubriques « Chantier », la grille et la paie par chantier, le régime BTPH ou Maintenance et surtout la **zone IRG**. La zone IRG d'un mois suit la wilaya du chantier **datée** : chaque changement de wilaya a une date d'effet, et les mois passés ne changent pas.

**Avant de commencer**
- [ ] Être SUPER_ADMIN (ou disposer du droit de modification sur l'écran « Chantiers » de la matrice des permissions).
- [ ] Pour un changement officiel : connaître le mois d'effet et la référence du texte.

**Étapes**

*Le tableau des chantiers* — colonnes « Code », « Nom », « Activité » (« BTPH » ou « Maintenance »), « Wilaya » (par exemple « 16 · Alger », ou la mention « non confirmée »), « Statut », « Actions ». Recherche : « Code, nom, wilaya ».

*Confirmer une wilaya « non confirmée »*
1. Ouvrez « Modifier le chantier ».
2. Choisissez la wilaya.
3. Saisissez le « Motif (ex. reprise du référentiel) » (3 caractères au moins).
4. Cliquez sur « Confirmer la wilaya ». Elle s'applique depuis l'origine du chantier.

*Enregistrer un changement officiel (par exemple un nouveau découpage)*
1. Ouvrez « Modifier le chantier ». L'historique s'affiche : « Depuis l'origine », « À partir du JJ/MM/AAAA », avec les mentions « en vigueur » ou « à venir ».
2. Lisez le rappel « Changement officiel (ex. nouveau découpage) : effet au 1er d'un mois, à partir du {premier mois modifiable} ; les mois antérieurs ne changent pas. ».
3. Choisissez le mois d'effet et la nouvelle wilaya, saisissez le « Motif » et le « Document (réf.) ».
4. Cliquez sur « Enregistrer le changement ».
5. Pour annuler un changement à venir, cliquez sur « Supprimer » sur sa ligne et confirmez.

**Résultat** — La wilaya, et donc la zone IRG, s'applique à partir de la date indiquée. Les paies brouillon concernées sont signalées « données modifiées depuis le calcul » (origine « Wilaya du chantier ») et attendent une décision D3 (Recalcul des paies brouillon). Aucune paie n'est recalculée automatiquement.

**Attention**
- Un changement officiel prend effet le 1er d'un mois, au plus tôt au premier mois modifiable (mois sans paie validée ou clôturée).
- Le code d'un chantier ne se modifie plus après sa création.
- Une wilaya non confirmée peut aussi être confirmée depuis le rapport « Qualité des données » (chapitre 0).
- Si l'enregistrement est refusé pour des raisons de droits, demandez au SUPER_ADMIN.

**Voir aussi** — 6.17 Prendre une décision · chapitre 0 Prise en main (qualité des données) · chapitre 5 Juridique (zones IRG)

---

## 6.15 Consulter le Centre de décisions

> **Vidéo V6.15** · durée estimée 5 min · Public : tous les rôles

**Où la trouver** — Menu latéral « Centre de décisions » (`/decisions`), lien « Centre de décisions » du panneau des notifications, ou liens « Ouvrir la décision » des écrans RH.

**À quoi ça sert** — Voir les demandes de décision en cours et passées. Le principe est affiché en haut de la page : « Rien ne s'exécute de soi-même : chaque génération ou recalcul de paie, correction d'affectation ou traitement d'un contrat hors du 1er du mois attend ici une décision motivée, enregistrée et tracée. »

**Avant de commencer**
- [ ] Vous voyez une décision si vous avez le droit de lire le « Centre de décisions », **ou** si vous l'avez demandée, **ou** si vous avez le droit de décider ce type.

**Étapes**
1. Ouvrez le « Centre de décisions ».
2. Choisissez l'onglet :
   - « À traiter » : demandes « En attente » et décisions « Décidée, à exécuter » ;
   - « Décisions confirmées et closes » : décisions « Exécutée », « Invalidée » ou « Remplacée ».
3. Filtrez au besoin par type : « Tous les types » ou une pastille D1 à D15.
4. Lisez le tableau (200 lignes au plus, les plus récentes d'abord) : « Décision », « Période · chantier », « Origine », « Demandée » (date et demandeur), « Statut », puis « Décidée » (onglet « À traiter ») ou « Choix / clôture » (onglet des décisions closes).
5. Cliquez sur le nom d'une décision pour ouvrir sa page détail :
   - lien « ← Toutes les décisions » ;
   - en-tête : type, description, pastille de statut ;
   - faits : « Période », « Chantier », « Origine », « Classe » (« Ordinaire » ou « À risque »), « Demandée » ; selon le type, « Pointages validés du mois » ou « Bulletins brouillon » ;
   - un lien vers l'écran concerné (par exemple « Ouvrir l'écran Paie », « Ouvrir l'écran Virements », « Ouvrir la proposition ») ;
   - pour une décision de paie, le rappel de la nature du mois : « Mois antérieur à septembre 2026 : paie versée et déclarée hors de l'application. Une paie générée ici ne vaut ni paiement ni déclaration. » ou « Paie opérationnelle : les virements et déclarations de ce mois sont préparés dans l'application. » ;
   - le contexte propre au type (par exemple, pour D3, la liste « Modifications depuis le calcul ») ;
   - le panneau « Votre décision » (fiche 6.17) ou, si la décision est prise, le panneau « Décision » : « Choix », « Décidée », « Justification », « Exécutée », « Clôture ».

**Résultat** — Vous savez quelles demandes attendent une décision, qui les a demandées et pourquoi, et ce qui a été décidé.

Les statuts :

| Statut | Signification |
|---|---|
| « En attente » | La demande attend un décideur. |
| « Décidée, à exécuter » | Le choix est fait ; l'opération reste à lancer (par exemple depuis l'écran Virements). |
| « Exécutée » | La décision est prise et appliquée. |
| « Invalidée » | Les données ont changé : la demande a été remplacée par une nouvelle. |
| « Remplacée » | Une demande plus récente sur le même sujet l'a remplacée, ou la situation est dépassée. |

Les classes :
- **« Ordinaire »** : décision courante (par exemple D3, D4).
- **« À risque »** : décision aux conséquences lourdes (par exemple D7 Réouverture d'une paie) ; le décideur doit cocher une case de reconnaissance des conséquences.

**Attention**
- « Aucune décision en attente » / « Aucune décision close » — « Seules les décisions que vos droits permettent de voir sont listées. ».
- Une décision prise est définitive : elle ne se modifie ni ne se supprime. Pour changer d'avis, il faut une nouvelle demande.
- Une décision exécutée ne peut pas resservir.
- Il n'existe qu'une seule demande ouverte par sujet.

**Voir aussi** — 6.16 Demander une décision · 6.17 Prendre une décision · Annexe A Les décisions D1 à D15

---

## 6.16 Demander une décision

> **Vidéo V6.15** · durée estimée 5 min (avec 6.15) · Public : ADMIN_RH, GERANT, SUPER_ADMIN

**Où la trouver** — Une demande ne se crée pas dans le Centre de décisions : elle naît d'un bouton « Demander … » dans l'écran métier concerné, ou automatiquement quand l'application détecte une situation qui exige une décision.

**À quoi ça sert** — Soumettre à un décideur une opération sensible (générer ou recalculer une paie, réouvrir une paie, changer un coefficient…) avec un motif tracé.

**Avant de commencer**
- [ ] Avoir les droits de l'écran d'où part la demande (par exemple le droit de modifier la paie pour demander une génération).

**Étapes**
1. Dans l'écran concerné, cliquez sur le bouton de demande :

| Demande | Écran et bouton |
|---|---|
| D1 Paie d'un mois aux règles non approuvées | Paie › « Préparation du mois » › « Demander la décision D1 » |
| D2 Date d'application d'une règle légale | « Propositions légales » › proposition approuvée › « Demander la décision » |
| D3 Recalcul des paies brouillon | Paie › « Calcul de la paie » › « Demander un recalcul » (sinon automatique) |
| D4 Génération de paie | Paie › « Calcul de la paie » › « Demander la génération », ou « Préparation du mois » › « Demander la génération (D4) » |
| D6 Clôture des mois de reprise | Paie › « Calcul de la paie » › « Demander la décision D6 » |
| D7 Réouverture d'une paie | Paie › « Calcul de la paie » › « Demander la réouverture (D7) » |
| D9 Virement bloqué | Paie › « Virements » › « Demander la décision D9 (N) » |
| D10 Déclaration bloquée | fenêtre d'export d'une déclaration › « Demander la décision D10 » |
| D11 Correspondance des codes d'un import | « Imports de présences » › « Codes inconnus : demander une correspondance » › « Demander la décision » |
| D12 Validation d'un import par son auteur | « Imports de présences » › onglet « Politique de validation » › « Demander une décision sur cette politique » |
| D13 Contrat ne commençant pas le 1er | « Qualité des données » › « Demander D13 » |
| D14 Coefficient d'un code de présence | « Paramètres » › « Listes et codes » › « Demander le changement (D14) » (fiche 6.11) |
| D15 Voie de saisie d'un document | « Extraction IA » › « Demander la décision D15 » |

2. Remplissez le motif s'il est demandé (par exemple « Motif de la réouverture », 10 à 500 caractères).
3. Validez. Selon l'écran, l'application ouvre la page de la décision ou affiche un message avec le lien « Ouvrir la décision ».
4. Suivez la demande dans le Centre de décisions (fiche 6.15) ou par les notifications (fiche 6.18).

Demandes ouvertes automatiquement :
- **D3** : dès qu'une donnée de paie change après le calcul d'une paie brouillon (présences, contrat, rubriques, avenant, exception, sortie, congé, avance, dérogations, affectation, wilaya du chantier, règle légale appliquée, coefficient d'un code) ;
- **D4** : quand des données changent (par exemple un pointage validé) pour un chantier et un mois sans paie ; si une règle légale du mois est en attente, c'est D1 qui est ouverte à la place ;
- **D5** : quand l'analyse d'un import d'archives trouve des présences déjà saisies en conflit.

**Résultat** — La demande apparaît dans l'onglet « À traiter » avec le statut « En attente ». Tous les détenteurs du droit de décider ce type reçoivent une notification. **Rien n'est exécuté à ce stade.**

**Attention**
- Vous ne pourrez pas décider vous-même une demande que vous avez faite (sauf SUPER_ADMIN).
- Si une demande identique est déjà ouverte, aucune seconde demande n'est créée : la demande existante est mise à jour ou remplacée.
- Le bouton de demande peut être grisé ou absent si la situation ne le permet pas (par exemple « Demander un recalcul » sur une paie qui n'est plus brouillon).

**Voir aussi** — 6.15 Consulter le Centre de décisions · 6.17 Prendre une décision · Annexe A · chapitre 3 Paie

---

## 6.17 Prendre une décision (approuver ou refuser)

> **Vidéo V6.17** · durée estimée 6 min · Public : SUPER_ADMIN, décideurs délégués

**Où la trouver** — Centre de décisions › onglet « À traiter » › cliquer sur la décision › panneau « Votre décision ».

**À quoi ça sert** — Trancher une demande : choisir une option, la justifier et, le cas échéant, lancer l'opération (génération de paie, recalcul, réouverture…).

**Avant de commencer**
- [ ] Avoir le droit de décider ce type : SUPER_ADMIN, ou droit « Modifier » sur l'écran « Décision Dx … » dans la matrice des permissions (fiche 6.20). Par défaut, seul le SUPER_ADMIN a ce droit.
- [ ] Ne pas être l'auteur de la demande (sauf SUPER_ADMIN). Pour D2, ne pas avoir contribué à la règle.
- [ ] La demande est « En attente ».

**Étapes**
1. Ouvrez la décision et lisez tout le contexte, en particulier les encadrés orange ou rouges (avertissements).
2. Dans « Votre décision », choisissez une **option**. Chaque carte affiche le libellé de l'option et sa conséquence.
   - Une option peut être grisée avec son motif en rouge (par exemple « Réouvrir » si un lot de virement est en cours).
3. Saisissez la « Justification (obligatoire, tracée) » : 10 à 2000 caractères.
4. Pour une décision « À risque », cochez « J'ai pris connaissance des conséquences de cette décision à risque. ».
5. Cliquez sur le bouton :
   - « Décider et exécuter » si l'option lance une opération ;
   - « Enregistrer la décision » si l'option ne lance rien.
   Le rappel sous le bouton indique : « La décision est définitive : elle ne peut être ni modifiée ni supprimée. ».

*Refuser une demande* — Il n'existe pas de bouton « Rejeter ». Pour refuser, choisissez l'option négative du type (« Ne pas générer », « Conserver les bulletins tels quels », « Ne pas réouvrir », « Ne pas appliquer pour l'instant », « Attendre », « Refuser », « Aucun virement », « Ne pas corriger », « Refuser la correspondance », « Rejeter le lot »…), justifiez puis enregistrez.

**Résultat** — Selon l'option :
- « Décision enregistrée. Aucune opération de paie n'a été lancée. » : option sans opération ; statut « Exécutée ».
- « Décision enregistrée et appliquée dans la même opération. » : l'effet est appliqué tout de suite (par exemple D14, D7, D13).
- « Décision enregistrée et exécutée : N bulletin(s) calculé(s). » : D3 ou D4, avec d'éventuels avertissements du calcul.
- « Décision enregistrée : simulation « règles non approuvées » calculée pour N salarié(s). Aucun bulletin créé. » : D1.
- « Décision enregistrée. Elle s'exécute une seule fois, depuis l'écran opérationnel. » : D9, D10 ou D5 « Trancher ligne par ligne ». Utilisez le lien proposé (« Exécuter depuis l'écran Virements », « Produire le fichier depuis le registre des déclarations », « Trancher ligne par ligne depuis l'écran des imports »).
Le demandeur reçoit la notification « Décision prise : {type} ».

**Attention**
- Si le panneau affiche, à la place des options :
  - « Cette décision n'est plus en attente. » : elle a déjà été tranchée ou close ;
  - « Vous n'avez pas le droit de prendre cette décision. Le SUPER_ADMIN peut vous le déléguer depuis la matrice des droits. » ;
  - « Séparation des tâches : vous êtes à l'origine de cette demande, un autre décideur doit la trancher. » ;
  - « Séparation des tâches : vous avez contribué à cette règle, un autre décideur doit fixer sa date d'application. » (D2).
- D5, D7 et D12 sont réservées au SUPER_ADMIN et ne se délèguent pas.
- « Choisissez une option. », « Justification obligatoire (10 caractères minimum). », « Justification trop longue (2000 caractères maximum). », « Décision à risque : confirmez avoir pris connaissance des conséquences. » : complétez le panneau.
- « Les données ont changé depuis l'affichage : la demande a été mise à jour. Relisez-la avant de décider. » : relisez le contexte, puis décidez à nouveau.
- « La situation a changé : cette demande est close (voir le motif de clôture). Aucune opération n'a été faite. » : par exemple « La paie n'est plus en brouillon. » ou « Une paie existe déjà pour ce mois. ».
- « Décision enregistrée, mais l'exécution a échoué : … » : lisez le motif. Le bouton « Exécuter la décision » permet de relancer (auteur de la décision ou SUPER_ADMIN ; les autres voient « En attente d'exécution par l'auteur de la décision ou le SUPER_ADMIN. »). Si la demande a été invalidée, suivez le lien « Ouvrir la nouvelle demande ».

**Voir aussi** — 6.15 Consulter le Centre de décisions · 6.18 Suivre les notifications · 6.20 Régler la matrice des permissions · Annexe A

---

## 6.18 Suivre les notifications

> **Vidéo V6.17** · durée estimée 6 min (avec 6.17) · Public : tous les rôles

**Où la trouver** — Bouton cloche en haut à droite de toutes les pages.

**À quoi ça sert** — Être prévenu des demandes à trancher et des décisions prises sur vos demandes, sans ouvrir le Centre de décisions.

**Avant de commencer**
- [ ] Aucun prérequis : chaque utilisateur voit ses propres notifications.

**Étapes**
1. Regardez la cloche : un badge rouge indique le nombre de notifications non lues (« 9+ » au-delà de 9).
2. Cliquez sur la cloche : le panneau « Notifications » s'ouvre avec les 30 dernières notifications. Toutes passent en « lu ».
3. Cliquez sur une notification pour ouvrir la décision concernée, ou sur le lien « Centre de décisions ».

**Résultat** — Vous ouvrez directement la décision à traiter ou à consulter.

Types de notifications :
- **demande en attente** : envoyée à toutes les personnes qui ont le droit de décider ce type ;
- **décision prise** : envoyée au demandeur (« Décision prise : {type} » et l'option choisie) ;
- **décision invalidée** ;
- les écrans RH envoient aussi des notifications de suivi, par exemple « Paie brouillon MM/YYYY — {chantier} modifiée depuis son calcul ».

**Attention**
- Aucune notification n'est envoyée par e-mail : consultez la cloche régulièrement.
- Panneau vide : « Aucune notification. ».

**Voir aussi** — 6.15 Consulter le Centre de décisions · 6.17 Prendre une décision

---

## 6.19 Consulter et créer les rôles

> **Vidéo V6.19** · durée estimée 3 min · Public : SUPER_ADMIN (GERANT en lecture)

**Où la trouver** — Menu latéral « Rôles & droits », ou Paramètres › carte « Rôles » (`/administration/roles`).

**À quoi ça sert** — Voir les rôles de l'application, leur niveau et leurs options, et créer un nouveau rôle. Les droits de chaque rôle se règlent ensuite dans la matrice des permissions (fiche 6.20).

**Avant de commencer**
- [ ] Être SUPER_ADMIN pour créer ou modifier. Le GERANT consulte seulement.

**Étapes**
1. Ouvrez la page. Le texte rappelle : « Le niveau hiérarchique ordonne les rôles (100 = SUPER_ADMIN). Les rôles système gardent leur code : ils sont utilisés par les règles d'accès en base. Les droits par écran se règlent dans la matrice des droits. ».
2. Lisez le tableau : « Code » (badge « système » pour les rôles livrés), « Libellé », « Niveau », « Options » (« MFA », « par chantier » ou « global », « inactif »), « Utilisateurs ».

Rôles livrés :

| Code | Libellé | Niveau | Double authentification |
|---|---|---|---|
| SUPER_ADMIN | Super administrateur | 100 | Oui |
| ADMIN_FINANCE | Admin finance | 80 | Oui |
| ADMIN_RH | Admin RH | 80 | Oui |
| GERANT | Gérant | 70 | Oui |
| CHEF_CHANTIER | Chef de chantier | 40 | Non |
| READ_ONLY | Lecture seule | 10 | Non |

3. Pour créer un rôle, cliquez sur « Nouveau rôle », puis remplissez :
   - « Code » (aide « A-Z, 0-9, _ » ; 3 à 31 caractères) ;
   - « Niveau hiérarchique (0-99) » ;
   - « Libellé (FR) » et « Libellé (AR) » ;
   - cases « Double authentification exigée », « Attribution par chantier autorisée », « Actif ».
4. Cliquez sur « Enregistrer » (ou « Fermer » pour abandonner).
5. Pour modifier un rôle, cliquez sur « Modifier » sur sa ligne, corrigez puis « Enregistrer ».

**Résultat** — Le rôle apparaît dans le tableau. Il apparaît aussi dans la matrice des permissions, où il faut lui donner ses droits.

**Attention**
- Le SUPER_ADMIN ne se modifie pas. Le code et la case « Actif » d'un rôle système ne se modifient pas.
- « Code : 3 à 31 caractères A-Z, 0-9, _. », « Libellé obligatoire. », « Niveau entre 0 et 99 (100 réservé au SUPER_ADMIN). », « Ce code de rôle existe déjà. » : corrigez la saisie.
- « Réservé au SUPER_ADMIN. » : votre compte ne peut que consulter.
- Un nouveau rôle n'a aucun droit tant que vous ne les avez pas cochés dans la matrice.

**Voir aussi** — 6.20 Régler la matrice des permissions · 6.23 Gérer les utilisateurs · chapitre 0 Prise en main (rôles)

---

## 6.20 Régler la matrice des permissions

> **Vidéo V6.20** · durée estimée 5 min · Public : SUPER_ADMIN (GERANT en lecture)

**Où la trouver** — Paramètres › carte « Matrice des permissions » (`/administration/permissions`). Titre de la page : « Matrice des droits ».

**À quoi ça sert** — Donner à chaque rôle, écran par écran, les droits lire, créer, modifier, supprimer, imprimer et exporter. C'est aussi ici que l'on délègue le droit de décider un type de décision. Ces droits protègent les données elles-mêmes.

**Avant de commencer**
- [ ] Être SUPER_ADMIN. Le GERANT voit « Lecture seule : seul le SUPER_ADMIN modifie la matrice. ».

**Étapes**
1. Ouvrez la page. La légende rappelle : « L = lire, C = créer, M = modifier, S = supprimer, I = imprimer, E = exporter. ». Le SUPER_ADMIN a toujours tous les droits ; toute modification est journalisée.
2. Filtrez avec « Module » : « Tous » ou un module (par exemple hr pour les Ressources humaines, decisions pour les décisions, admin pour l'administration).
3. Repérez la ligne de l'écran (libellé de l'écran, puis son code et son chemin) et le groupe de six cases du rôle voulu.
4. Cliquez sur une case pour accorder ou retirer le droit. **L'enregistrement est immédiat** (pas de bouton Enregistrer).
   - Cocher un droit autre que L coche aussi L.
   - Décocher L décoche tous les droits de l'écran pour ce rôle.
5. Pour **déléguer une décision**, cochez « M » sur la ligne « Décision Dx … » dans la colonne du rôle. Exemple : cocher « M » sur « Décision D3 · Recalcul des paies brouillon (classe : ordinaire) » pour ADMIN_RH permet aux comptes ADMIN_RH de trancher les décisions D3.
   - Pour D14 : « C » permet de demander le changement de coefficient, « M » permet de décider.

Écrans utiles à la RH (exemples) : « Paramètres RH », « Légendes de présence », « Chantiers », « Employés », « Contrats de travail », « Présence », « Paie », « Bulletins », « Centre de décisions », « Décision D1 » à « Décision D15 », « Propositions de règles légales », « Approbation des règles légales », « Préparation de la paie par mois », « Extraction IA », « Opérations externes », « Journal d'audit », « Clôture des périodes ».

**Résultat** — Le droit est enregistré tout de suite pour tous les comptes du rôle.

**Attention**
- En cas d'erreur, la case revient à son état précédent et un message s'affiche (par exemple « Droit inconnu. », « Paramètres invalides. »).
- La colonne SUPER_ADMIN est toujours cochée et grisée : « SUPER_ADMIN a tous les droits (non modifiable). ».
- Les décisions D5, D7 et D12 n'apparaissent pas dans la matrice : elles restent réservées au SUPER_ADMIN (« La réouverture d'une paie (D7) est réservée au SUPER_ADMIN et ne se délègue pas. »).
- Masquer un onglet (fiches 6.21 et 6.22) ne retire pas un droit : seule la matrice protège les données.
- Certaines actions restent réservées à des rôles précis quelle que soit la matrice (par exemple le dictionnaire des rubriques au SUPER_ADMIN, la clôture de la paie au SUPER_ADMIN et au GERANT).
- Le SUPER_ADMIN voit l'encadré « Pour choisir les modules et onglets d'un compte précis : Accès par compte. » (fiche 6.21).

**Voir aussi** — 6.19 Consulter et créer les rôles · 6.21 Définir l'accès par compte · 6.17 Prendre une décision

---

## 6.21 Définir l'accès par compte

> **Vidéo V6.21** · durée estimée 4 min · Public : SUPER_ADMIN

**Où la trouver** — Paramètres › carte « Accès par compte » (`/parametres/acces`). En-tête : « Accès par compte · صلاحيات الحسابات » — « Choisissez le compte, ouvrez ses modules (tous fermés au départ), puis cochez les onglets de chaque module ouvert. »

**À quoi ça sert** — Choisir précisément les modules et les onglets qu'un compte donné voit, indépendamment des autres comptes du même rôle.

**Avant de commencer**
- [ ] Être SUPER_ADMIN.
- [ ] Le compte existe (fiche 6.23).

**Étapes**
1. **Choisir le compte** — Dans « 1. Compte · الحساب », choisissez le compte dans « — Choisir un compte — » (nom · e-mail · rôles ; la mention « accès personnalisé » signale un compte déjà réglé).
   - Pour un compte SUPER_ADMIN : « Ce compte est SUPER_ADMIN : il voit toujours tout, aucun réglage ne s'applique. ».
2. **Ouvrir les modules** — Dans « 2. Modules · الوحدات », activez l'interrupteur de chaque module voulu. Ouvrir un module coche tous ses onglets ; le fermer les décoche. « Tableau de Bord » et « Paramètres » sont « Toujours ouvert ».
   - Le texte indique « Aucun accès personnalisé pour l'instant : le compte suit ses rôles. Ouvrez les modules voulus puis enregistrez. » ou « Accès personnalisé : seuls les modules et onglets cochés sont affichés. », avec « N module(s) ouvert(s). ».
3. **Cocher les onglets** — Dépliez un module ouvert avec le chevron. Cochez ou décochez chaque onglet, ou utilisez « Tout cocher » / « Tout décocher ». Le compteur indique « x/y onglet(s) ».
   - Le module « Ressources Humaines » regroupe les onglets du module RH (Tableau de bord, Employés, Présence, Calcul de la paie, Paramètres…), ceux de « Paramètres RH », de « Cotisations & impôts », des « Imports de présences » et du « Pointage ».
   - Le module « Centre de décisions » contient « À traiter » et « Décisions confirmées et closes ».
4. **Enregistrer** — Cliquez sur « Enregistrer ». Message : « Accès enregistrés. Ils s'appliquent à sa prochaine page. ».
5. **Revenir aux rôles** — Pour supprimer le réglage personnalisé, cliquez sur « Revenir aux rôles ». Message : « Le compte suit de nouveau les choix de ses rôles. ».

**Résultat** — Le compte ne voit que les modules et onglets cochés, dès sa prochaine page.

**Attention**
- Rappel affiché : « Ces réglages choisissent ce que le compte voit. Les données restent protégées par la matrice des permissions de son rôle. ». Cocher un onglet ne donne pas de droit sur les données.
- Changer de compte avant d'enregistrer fait perdre les modifications : « Des modifications non enregistrées seront perdues. Continuer ? ».
- « Réservé au SUPER_ADMIN. », « Compte invalide. » : vérifiez votre rôle et le compte choisi.

**Voir aussi** — 6.20 Régler la matrice des permissions · 6.22 Régler l'interface par rôle · 6.23 Gérer les utilisateurs

---

## 6.22 Régler l'interface par rôle

> **Vidéo V6.22** · durée estimée 4 min · Public : SUPER_ADMIN

**Où la trouver** — Paramètres › carte « Interface » (`/parametres/interface`). En-tête : « Interface · الواجهة » — « Choisissez, pour chaque rôle, les modules et les onglets affichés ; changez leur ordre, leurs libellés et les couleurs. Le SUPER_ADMIN voit toujours tout. Masquer un élément ne remplace pas la matrice des permissions, qui protège les données. »

**À quoi ça sert** — Simplifier l'écran de chaque rôle : masquer les modules et onglets inutiles, réordonner et renommer le menu et les onglets pour tout le monde.

**Avant de commencer**
- [ ] Être SUPER_ADMIN.

**Étapes**

*Onglet « Visibilité par rôle · الإظهار حسب الدور »*
1. Choisissez le rôle dans « Rôle · الدور ».
2. Parcourez les sections : A. Menu latéral, B. Onglets Ressources humaines, C. Onglets des autres modules (dont Paramètres RH, Rubriques de salaire, Centre de décisions…), D. Onglets internes des fiches.
3. Cochez ou décochez chaque élément, ou utilisez « Tout afficher » / « Tout masquer » sur un bloc. Un élément masqué apparaît barré ; « toujours visible » signale un élément qu'on ne peut pas masquer. **L'enregistrement est immédiat.**
4. Lisez le compteur : « N élément(s) masqué(s) pour ce rôle. » ou « Tout est affiché pour ce rôle. ».

*Onglet « Ordre et libellés · الترتيب والأسماء »*
1. Choisissez la « Liste à organiser · القائمة » (menu latéral, onglets RH, etc.).
2. Faites glisser les lignes par leur poignée (au clavier : Espace, flèches, Espace).
3. Saisissez au besoin un libellé français et arabe (80 caractères au plus ; vide = nom d'origine). Pour le menu latéral, choisissez aussi le groupe.
4. Cliquez sur « Enregistrer · حفظ ». Message : « Enregistré. · تم الحفظ. ». « Rétablir par défaut · استرجاع الأصل » revient à l'ordre et aux noms d'origine.

*Onglet « Apparence · المظهر »* — thèmes, formes, polices et couleurs de l'application (hors module RH).

**Résultat** — Les comptes du rôle ne voient plus les éléments masqués ; l'ordre et les libellés s'appliquent à tout le monde.

**Attention**
- Un utilisateur qui a plusieurs rôles voit un élément dès qu'un de ses rôles l'affiche.
- Masquer un élément bloque aussi sa page : un utilisateur qui l'ouvre est renvoyé au Tableau de bord.
- Masquer n'enlève aucun droit sur les données : utilisez la matrice des permissions (fiche 6.20).
- « Cet ordre s'applique à tout le monde ; chaque utilisateur peut ensuite le changer pour lui-même avec « Réorganiser la page ». ».
- Les boutons d'action des pages peuvent être réordonnés mais pas renommés.

**Voir aussi** — 6.21 Définir l'accès par compte · 6.20 Régler la matrice des permissions

---

## 6.23 Gérer les utilisateurs

> **Vidéo V6.23** · durée estimée 3 min · Public : SUPER_ADMIN, ADMIN_RH

**Où la trouver** — Menu latéral « Utilisateurs », ou Paramètres › carte « Utilisateurs » (`/parametres/utilisateurs`). En-tête « Administration des utilisateurs ».

**À quoi ça sert** — Créer le compte d'un collaborateur, lui donner un rôle et un périmètre de chantier, réinitialiser son mot de passe ou désactiver son compte.

**Avant de commencer**
- [ ] Être SUPER_ADMIN ou ADMIN_RH.
- [ ] Connaître le nom, l'e-mail, le rôle et le chantier du collaborateur.

**Étapes**

*Créer un utilisateur*
1. Cliquez sur « Nouvel utilisateur ».
2. Saisissez « Nom complet * », « E-mail * » et « Mot de passe initial * » (8 caractères au moins ; le collaborateur le changera à la première connexion).
3. Choisissez le « Rôle * » et le « Périmètre site » : « Global (tous les sites) » ou un chantier.
4. Cliquez sur « Créer ».

*Réinitialiser un mot de passe*
1. Sur la ligne de l'utilisateur, ouvrez « Menu » › « Réinit. mot de passe ».
2. Saisissez le « Mot de passe temporaire * » (8 caractères au moins), puis cliquez sur « Enregistrer ».

*Désactiver ou réactiver un compte*
1. Ouvrez « Menu » › « Désactiver (INACTIVE) », ou « Réactiver » pour un compte désactivé.

**Résultat** — Création : « Utilisateur créé. Communiquez-lui le mot de passe saisi ; il devra le changer à la première connexion. ». Réinitialisation : « Nouveau mot de passe temporaire enregistré pour … ». Le tableau (« Nom », « E-mail », « Rôle », « Site(s) », « Statut », « Actions ») se met à jour ; la mention « Réinit. mot de passe requise » apparaît sous le nom tant que le mot de passe n'a pas été changé.

**Attention**
- Un ADMIN_RH ne peut attribuer que des rôles de niveau inférieur à 80 : il ne peut pas créer de SUPER_ADMIN, d'ADMIN_RH ni d'ADMIN_FINANCE.
- « Global » dans la colonne « Site(s) » signifie que le compte n'est limité à aucun chantier.
- Transmettez le mot de passe initial au collaborateur par un moyen sûr.

**Voir aussi** — 6.19 Consulter et créer les rôles · 6.21 Définir l'accès par compte

---

## 6.24 Clôturer ou rouvrir une période

> **Vidéo V6.24** · durée estimée 4 min · Public : SUPER_ADMIN, GERANT, ADMIN_FINANCE

**Où la trouver** — Paramètres › carte « Clôture des périodes » (`/administration/periodes`).

**À quoi ça sert** — Figer les ajustements commerciaux (AN) d'un mois. L'écran rappelle aussi l'état de la paie de chaque mois, en lecture.

**Avant de commencer**
- [ ] Avoir le rôle SUPER_ADMIN, GERANT ou ADMIN_FINANCE et le droit « Clôture des périodes ». Un ADMIN_RH n'y a pas accès par défaut.

**Étapes**
1. Choisissez l'année avec « ← année-1 » / « année+1 → ».
2. Lisez le texte : « La clôture fige les ajustements commerciaux (AN) du mois ; seul le SUPER_ADMIN peut encore y écrire. La paie a son propre circuit (valider → clôturer) dans le module RH ; son état est rappelé ici. ».
3. Lisez le tableau des 12 mois : « Mois », « Ajustements (AN) » (« Ouvert » ou « Clôturé », avec date et auteur), « Paie (chantiers) » (« N clôturée(s) », « N validée(s) », « N brouillon(s) »).
4. Cliquez sur « Clôturer » sur la ligne du mois et confirmez « Clôturer {Mois} {année} ? Les ajustements commerciaux (AN) du mois seront figés. ».
5. Pour rouvrir, cliquez sur « Rouvrir » et confirmez « Rouvrir {Mois} {année} ? ».

**Résultat** — La colonne « Ajustements (AN) » passe à « Clôturé » (ou « rouvert le … par … »).

**Attention**
- **Cette clôture ne verrouille pas la paie.** La paie se valide puis se clôture dans Ressources Humaines › Paie › « Calcul de la paie » (chapitre 3) ; sa réouverture passe par la décision D7 (Réouverture d'une paie).
- « Droit « Clôture des périodes » requis. » : demandez le droit au SUPER_ADMIN. « Période invalide. » : rechargez la page.

**Voir aussi** — 6.25 Consulter le journal d'audit · chapitre 3 Paie (valider et clôturer)

---

## 6.25 Consulter le journal d'audit

> **Vidéo V6.24** · durée estimée 4 min (avec 6.24) · Public : SUPER_ADMIN, GERANT, ADMIN_RH, ADMIN_FINANCE

**Où la trouver** — Paramètres › carte « Journal d'audit » (`/administration/audit`).

**À quoi ça sert** — Retrouver qui a créé, modifié, supprimé, imprimé ou exporté une donnée, et quand, avec la valeur avant et après. Les décisions, les rubriques, les paies, les bulletins et les présences y sont tracés.

**Avant de commencer**
- [ ] Avoir accès à la page (SUPER_ADMIN, GERANT, ADMIN_RH, ADMIN_FINANCE) **et** le droit de lire l'écran « Journal d'audit » dans la matrice des permissions.

**Étapes**
1. Réglez les filtres :
   - « Table » : la catégorie de données ;
   - « Action » : CREATE (création), UPDATE (modification), DELETE (suppression), LOGIN (connexion), PRINT (impression), EXPORT (export), REVERSE (annulation) ;
   - « Identifiant ciblé » : l'identifiant d'un élément précis ;
   - « Du » et « Au » : la période.
2. Cliquez sur « Filtrer ».
3. Lisez le tableau : « Date », « Utilisateur » (« système » pour une opération automatique), « Action », « Table », « Champs modifiés » (les 6 premiers).
4. Cliquez sur « Détail » pour ouvrir la fenêtre de l'opération : date, auteur, cible, et tableau « Champ / Avant / Après ».
5. Naviguez avec « Précédent » / « Page N » / « Suivant » (50 lignes par page).

**Résultat** — Vous retrouvez l'historique complet d'une donnée. Une modification de paie ou de présence faite dans le cadre d'une décision D3, D4 ou D7 est rattachée à cette décision.

**Attention**
- « Aucune entrée » avec la mention « Ou droit « Journal d'audit » manquant. » : votre rôle ouvre la page mais n'a pas le droit de lire le journal ; demandez ce droit au SUPER_ADMIN.
- Le journal est en lecture seule ; les décisions ne peuvent pas être supprimées (« Registre des décisions : suppression interdite. »).

**Voir aussi** — 6.24 Clôturer ou rouvrir une période · 6.15 Consulter le Centre de décisions · 6.20 Régler la matrice des permissions
