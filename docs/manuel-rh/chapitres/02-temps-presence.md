# 2 Temps & présence — الوقت والحضور

**Dans ce chapitre** — Vous apprenez à tenir la feuille de présence mensuelle de chaque chantier : consulter la grille, saisir les codes jour par jour ou par période, renseigner le poste occupé et les heures supplémentaires, puis « Valider » le mois pour que la paie en tienne compte. Vous apprenez aussi à reprendre des présences d'archives avec traçabilité (dépôt d'un fichier, rapport d'analyse, codes inconnus, conflits, validation par une autre personne), à gérer les congés (demandes, décisions, soldes) et à contrôler les jours proposés automatiquement par les ordres de mission et les congés. Enfin, la fiche 2.28 explique comment chaque code de présence compte pour la paie : lisez-la avant votre premier mois de paie. Les documents eux-mêmes (ordre de mission, titre de congé) sont décrits au chapitre 4 ; ici, nous traitons leur effet sur la présence et sur les soldes.

| Fonction | Vidéo | Public |
|---|---|---|
| 2.1 Consulter la grille d'un chantier | V2.1 | ADMIN_RH, GERANT, CHEF_CHANTIER, lecteurs autorisés |
| 2.2 Consulter et saisir le mois d'un seul employé | V2.2 | ADMIN_RH, GERANT, CHEF_CHANTIER |
| 2.3 Saisir un code dans une case | V2.3 | ADMIN_RH, GERANT, CHEF_CHANTIER |
| 2.4 Remplir une période avec la carte du mois | V2.3 | ADMIN_RH, GERANT, CHEF_CHANTIER |
| 2.5 Valider le pointage du mois | V2.5 | ADMIN_RH, GERANT, CHEF_CHANTIER |
| 2.6 Saisir le poste occupé, le commentaire et les heures supplémentaires | V2.6 | ADMIN_RH, GERANT, CHEF_CHANTIER |
| 2.7 Importer un classeur Excel dans la grille | V2.7 | ADMIN_RH, GERANT, CHEF_CHANTIER |
| 2.8 Imprimer ou archiver le mois | V2.7 | Tous les utilisateurs de la grille |
| 2.9 Télécharger le modèle d'archives « une ligne par jour » | V2.9 | SUPER_ADMIN (ou rôle autorisé à importer) |
| 2.10 Déposer un fichier d'archives de présence | V2.9 | SUPER_ADMIN (ou rôle autorisé à importer) |
| 2.11 Lire le rapport d'analyse d'un lot | V2.11 | SUPER_ADMIN (ou rôle autorisé à consulter les imports) |
| 2.12 Rapprocher les noms non reconnus | V2.11 | SUPER_ADMIN (ou rôle autorisé à importer) |
| 2.13 Demander une correspondance pour des codes inconnus (D11) | V2.13 | SUPER_ADMIN (ou rôle autorisé à importer) |
| 2.14 Confirmer, refuser ou révoquer une correspondance de codes | V2.13 | Détenteur du droit de décision D11 |
| 2.15 Trancher les conflits d'un lot (D5) | V2.15 | SUPER_ADMIN |
| 2.16 Importer les présences acceptées | V2.16 | SUPER_ADMIN (ou rôle autorisé à importer) |
| 2.17 Valider les présences importées | V2.16 | Valideur des imports (autre personne que l'auteur) |
| 2.18 Rejeter un lot ou annuler un import | V2.18 | SUPER_ADMIN (ou rôle autorisé à annuler) |
| 2.19 Joindre une pièce justificative à un lot | V2.18 | SUPER_ADMIN (ou rôle autorisé à importer) |
| 2.20 Définir la politique de validation par l'auteur (D12) | V2.20 | SUPER_ADMIN |
| 2.21 Saisir une demande de congé | V2.21 | ADMIN_RH, GERANT, utilisateurs autorisés |
| 2.22 Approuver, refuser ou annuler une demande de congé | V2.22 | SUPER_ADMIN, ADMIN_RH, GERANT |
| 2.23 Imprimer le titre de congé depuis la liste des demandes | V2.22 | SUPER_ADMIN, ADMIN_RH, GERANT |
| 2.24 Consulter les soldes de congé annuel | V2.24 | ADMIN_RH, GERANT |
| 2.25 Ajuster un solde de congé (reprise de solde) | V2.24 | SUPER_ADMIN, ADMIN_RH, GERANT |
| 2.26 Contrôler et valider les jours proposés par un ordre de mission ou un congé | V2.26 | ADMIN_RH, GERANT, CHEF_CHANTIER |
| 2.27 Suivre une mission ouverte (sans date de retour) | V2.27 | ADMIN_RH, GERANT |
| 2.28 Comprendre les codes de présence et leur effet sur la paie | V2.28 | Tous |
| 2.29 Créer ou modifier un code de présence | V2.29 | SUPER_ADMIN |
| 2.30 Demander le changement d'un coefficient (D14) | V2.29 | SUPER_ADMIN (ou rôle autorisé) |
| 2.31 Configurer les colonnes et les droits de la feuille de présence | V2.31 | SUPER_ADMIN |

---

## 2.0 L'écran en un coup d'œil

La section « Temps & présence » de la barre RH contient trois onglets : « Présence », « Imports de présences » et « Congés ». Vous y accédez aussi par la recherche globale (« Présence / pointage · الحضور », « Congés · العطل ») et par les raccourcis « Pointage » et « Congé » du tableau de bord RH. Votre administrateur peut avoir renommé, masqué ou réordonné ces onglets : les libellés ci-dessous sont ceux d'origine.

### La page « Temps & présence » (onglet « Présence », `/rh/presence`)

De haut en bas :

- **En-tête** : sur-titre « Pointage des équipes », titre « Temps & présence ». À droite, deux boutons :
  - « Importer pointeuse » : ouvre la page des imports d'archives (fiches 2.9 à 2.20) ;
  - « Nouveau congé » : ouvre la page des congés (fiche 2.21).
- **Quatre indicateurs** : « Présents », « Absents », « En congé », « En mission ». Ils portent sur le dernier jour pointé des 30 derniers jours, rappelé sous les cartes (« Dernier jour pointé : … »). S'il n'y a rien : « Aucun pointage enregistré ces 30 derniers jours ».
- **Barre d'outils de la grille**, de gauche à droite :
  1. les onglets « Par chantier » et « Par employé » ;
  2. la navigation de mois : ◀ « Mois précédent », le bouton du mois affiché (ouvre « Choisir le mois »), ▶ « Mois suivant » ;
  3. la liste « Chantier » (mode Par chantier) ou le champ « Matricule ou nom de l'employé » (mode Par employé) ;
  4. les pastilles d'état (voir plus bas) ;
  5. le bouton « Importer » (classeur Excel rapide, fiche 2.7) ;
  6. la pastille de couleurs « Légende des codes » ;
  7. le menu « … » « Plus d'actions » : « Modèle Excel », « Imprimer / archiver le mois », interrupteur « Totaux par code », liens « Fiche employé », « Imports d'archives », « Paramètres » ;
  8. le bouton principal « Valider ». Un point orange sur ce bouton signale des modifications non encore validées.
- **La grille** : une ligne par employé, une colonne par jour, puis les totaux. La colonne NOM reste visible quand vous faites défiler vers la droite. Une ligne « Total » termine le tableau.

**Colonnes possibles** (selon les droits de votre rôle, fiche 2.31) : N°, MAT, NOM, PRÉNOM, POSTE OCCUPE, AFFECTATION, Début contrat, COMMENTAIRE, VALIDATION, HS 50 % (h), HS 75 % (h), HS 100 % (h), les jours du mois, une colonne par code utilisé (« Totaux par code »), NJ (nombre de jours du mois) et Coef (somme des coefficients, c'est-à-dire les jours qui seront payés, fiche 2.28).

**Comment lire une case** — Une case = un employé, un chantier, un jour et un code. Chaque case a une origine et un état :

| Apparence de la case | Signification |
|---|---|
| Texte normal, couleur du code | Valeur validée : la paie la prend en compte |
| *Italique gris* | Valeur proposée, pas encore validée : la paie l'ignore |
| Souligné | Jour d'ordre de mission validé |
| Cellule orange (colonnes de saisie) | Valeur modifiée, pas encore enregistrée |

Passez la souris sur une case pour lire son origine, en français et en arabe : « Saisie manuelle — non validée », « Saisie manuelle — validée », « Proposé par l'ordre de mission N° … — non validé », « Ordre de mission N° … — validé », « Proposé automatiquement — non validé » (congé approuvé), « Automatique — validé », « Importé des archives — à valider depuis l'écran des imports », « Importé des archives — validé ».

**Pastilles d'état** de la barre d'outils :

- « N proposé(s) OM » (gris) : jours proposés automatiquement, par un ordre de mission ou par un congé approuvé ;
- « N à valider » (orange) : saisies manuelles pas encore validées ;
- « N importée(s) » (bleu) : présences d'archives en attente ; un clic ouvre l'onglet « À valider » des imports ;
- « Lecture seule » : vous ne pouvez pas modifier cette grille ;
- « Tout est validé » : rien n'est en attente.

**Mois figés par la paie** — Le statut de la paie du mois (pour le chantier, ou pour toute l'entreprise) décide de ce qui reste modifiable :

| Paie du mois | Effet sur la présence |
|---|---|
| Pas de paie, ou paie en brouillon | Tout est modifiable ; les brouillons sont signalés « données modifiées depuis le calcul » |
| Paie validée | Les valeurs validées ne se modifient plus ; seules de nouvelles propositions (un nouvel ordre de mission, par exemple) peuvent apparaître |
| Paie clôturée | Rien n'est modifiable ni ajoutable |

Un encadré d'avertissement s'affiche alors au-dessus de la grille. Pour modifier un mois figé, il faut demander la réouverture de la paie : décision D7 (Réouverture d'une paie), prise par le SUPER_ADMIN (chapitre 3).

**Week-end** — Le vendredi et le samedi sont ombrés. Les dates « aujourd'hui » suivent l'heure d'Algérie.

### La page « Imports de présences » (`/rh/presence/imports`)

- En-tête « Imports d'archives de présence », avec à droite le lien « Modèle « une ligne par jour » » et le bouton « Déposer un fichier ».
- Un encadré permanent rappelle qu'un import ne crée ni ne recalcule aucune paie, que les lignes restent des propositions jusqu'à leur validation, et que janvier à août 2026 est la période de reprise.
- Quatre onglets : « Lots (N) », « À valider (N) », « Correspondances de codes (N à confirmer) », « Politique de validation ».
- Le tableau des lots : Lot (numéro « IMP-AAAA-NNNN » et format « Grille » ou « Lignes »), Période (et nature « Opérationnel », « Reprise » ou « Reprise et opérationnel »), Chantier(s), Provenance, Lignes (« x lues · y acceptées · z rejetées · w en conflit »), Statut, Déposé (par, date). Un champ « Rechercher un lot, un chantier… » filtre la liste. Un clic sur un lot ouvre son détail (fiche 2.11).

**Le parcours d'un lot** — Un fichier d'archives suit toujours le même chemin : dépôt et analyse, correction éventuelle (noms, codes, conflits), import en propositions, puis validation par une autre personne.

| Statut affiché | Ce que vous pouvez faire |
|---|---|
| En préparation | Analyser à nouveau, rejeter |
| Analysé | Analyser à nouveau, demander une correspondance de codes, importer, rejeter |
| En attente de décision (conflits) | Analyser à nouveau, demander une correspondance de codes, trancher les conflits, rejeter |
| Importé, à valider | Valider, annuler l'import |
| Validé | Annuler l'import |
| Rejeté | Consulter seulement |
| Annulé | Consulter seulement |

Vous pouvez joindre une pièce justificative à tout lot qui n'est ni rejeté ni annulé.

**Droits** — Consulter, déposer et importer, annuler, et valider sont des droits distincts. Valider des présences importées est un droit à part (« Validation des présences importées »), séparé du droit d'importer. Par défaut, seul le SUPER_ADMIN possède ces droits ; votre administrateur peut les attribuer à d'autres rôles (chapitre 6).

### La page « Congés & absences » (onglet « Congés », `/rh/conges`)

- Un encadré rappelle : une demande approuvée génère un titre de congé numéroté et propose les jours (CA, CRP, CM, CSS, AOP) sur la feuille de présence ; le solde annuel = jours acquis (taux mensuel × mois travaillés) + ajustements − congés annuels approuvés.
- Trois onglets : « Demandes · الطلبات », « Soldes · الأرصدة », « Ajustements / reprise de solde · التعديلات ».

### Les réglages utilisés dans ce chapitre

- Ressources Humaines › Paramètres › onglet « Feuille de présence » : colonnes et droits par rôle (fiche 2.31).
- Ressources Humaines › Paramètres › onglet « Listes et codes » › panneau « Légendes de présence · رموز الحضور » : codes et coefficients (fiches 2.29 et 2.30).
- Registre (chapitre 4) : ordres de mission et titres de congé.
- Centre de décisions (chapitre 6) : décisions D3, D4, D5, D7, D11, D12 et D14 citées dans ce chapitre.

---

## 2.1 Consulter la grille d'un chantier

> **Vidéo V2.1** · durée estimée 4 min · Public : ADMIN_RH, GERANT, CHEF_CHANTIER, lecteurs autorisés

**Où la trouver** — Ressources Humaines › Temps & présence › Présence › onglet « Par chantier » (`/rh/presence`).

**À quoi ça sert** — Voir le pointage mensuel de tous les employés d'un chantier, repérer ce qui reste à valider et contrôler les totaux avant la paie.

**Avant de commencer**
- [ ] Vous avez le droit de consulter la présence sur ce chantier.
- [ ] Au moins une colonne est visible pour votre rôle (fiche 2.31).
- [ ] Des contrats couvrent le mois sur ce chantier (chapitre 1).

**Étapes**
1. Cliquez sur l'onglet « Par chantier ».
2. Choisissez le chantier dans la liste « Chantier ».
3. Choisissez le mois :
   - ◀ « Mois précédent » ou ▶ « Mois suivant » pour avancer d'un mois ;
   - ou cliquez sur le mois affiché : la fenêtre « Choisir le mois » s'ouvre. Changez d'année avec « Année précédente » / « Année suivante », puis cliquez sur le mois (Janv. … Déc.). Le mois en cours est entouré.
4. Lisez la grille :
   - une ligne par employé ayant un contrat sur ce chantier pendant au moins un jour du mois, contrats terminés compris ;
   - en-tête de chaque jour : numéro et jour abrégé (Dim, Lun, Mar, Mer, Jeu, Ven, Sam) ; le week-end est ombré et le jour courant mis en évidence ;
   - passez la souris sur une case pour lire « CODE · libellé » et son origine (voir 2.0).
5. Cliquez sur la pastille « Légende des codes » pour afficher la liste des codes actifs avec leur couleur et leur libellé. La dernière ligne montre le style « Proposé par ordre de mission » (italique gris).
6. Contrôlez les totaux en bout de ligne :
   - « Totaux par code » : nombre de jours de chaque code pour l'employé ;
   - « NJ » : nombre de jours du mois ;
   - « Coef » : somme des coefficients des codes pointés, selon le coefficient en vigueur ce mois-là. C'est le nombre de jours payés (fiche 2.28).
7. Contrôlez la ligne « Total » en bas : par jour, le nombre d'employés pointés avec le code de référence (MS lorsqu'il est actif) ; puis les totaux par code et la somme des Coef.
8. Pour alléger l'écran, ouvrez « Plus d'actions » et désactivez l'interrupteur « Totaux par code » (réactivez-le de la même façon).

**Résultat** — La grille du mois s'affiche. Les pastilles d'état indiquent ce qui reste à faire (« N à valider », « N proposé(s) OM », « N importée(s) ») ou « Tout est validé ».

**Attention**
- « Aucune colonne autorisée pour votre rôle sur ce chantier. » : votre rôle ne voit aucune colonne ; demandez au SUPER_ADMIN de régler la feuille de présence (fiche 2.31).
- « Aucun contrat sur ce chantier pour ce mois. » : aucun employé n'est affecté à ce chantier ce mois-là ; vérifiez les contrats (chapitre 1).
- Si vous avez des modifications non validées, changer de mois ou de chantier affiche « Des modifications non validées seront perdues. Continuer ? ». Répondez non, puis cliquez « Valider » (fiche 2.5).
- Seules les valeurs validées (texte normal) comptent pour la paie. Les cases en italique gris sont ignorées tant qu'elles ne sont pas validées.
- Les quatre indicateurs du haut de page portent sur le dernier jour pointé ; ils ne remplacent pas le contrôle de la grille.

**Voir aussi** — 2.2 Consulter et saisir le mois d'un seul employé · 2.5 Valider le pointage du mois · 2.28 Comprendre les codes de présence et leur effet sur la paie

---

## 2.2 Consulter et saisir le mois d'un seul employé

> **Vidéo V2.2** · durée estimée 2 min · Public : ADMIN_RH, GERANT, CHEF_CHANTIER

**Où la trouver** — Ressources Humaines › Temps & présence › Présence › onglet « Par employé » (`/rh/presence`). Vous y arrivez aussi depuis un ordre de mission (« Voir le pointage » ou « Ouvrir le pointage », fiche 2.26).

**À quoi ça sert** — Travailler sur la ligne d'un seul employé, sans être gêné par le reste du chantier : contrôle d'une mission, d'un congé, correction ponctuelle.

**Avant de commencer**
- [ ] Mêmes droits que pour la fiche 2.1 ; pour saisir, mêmes droits que pour la fiche 2.3.

**Étapes**
1. Cliquez sur l'onglet « Par employé ».
2. Dans « Matricule ou nom de l'employé », tapez un matricule, ou un nom (« nom prénom » ou « prénom nom »).
3. Choisissez l'employé dans les suggestions (12 au plus). Chaque suggestion montre le matricule, le nom et « chantier · poste ».
4. Choisissez le mois (◀, ▶ ou « Choisir le mois »).
5. Consultez ou modifiez la ligne comme dans la grille du chantier (fiches 2.3, 2.4, 2.6), puis cliquez « Valider ».

**Résultat** — Une seule ligne s'affiche, sur le chantier de l'employé. Quand vous cliquez « Valider », seuls les jours de cet employé, pour ce mois et ce chantier, sont enregistrés.

**Attention**
- Tant qu'aucun employé n'est choisi, la grille affiche « Recherchez un employé par matricule ou par nom. ».
- Choisir un autre employé avec des modifications non validées affiche « Des modifications non validées seront perdues. Continuer ? ».

**Voir aussi** — 2.1 Consulter la grille d'un chantier · 2.26 Contrôler et valider les jours proposés par un ordre de mission ou un congé

---

## 2.3 Saisir un code dans une case

> **Vidéo V2.3** · durée estimée 5 min (avec la fiche 2.4) · Public : ADMIN_RH, GERANT, CHEF_CHANTIER

**Où la trouver** — Ressources Humaines › Temps & présence › Présence › grille › case d'un jour (`/rh/presence`).

**À quoi ça sert** — Pointer un jour pour un employé avec un code de présence (P, MS, CRP, AN…), au clavier.

**Avant de commencer**
- [ ] Votre rôle peut modifier la colonne « Jours du mois » (par défaut : ADMIN_RH, GERANT, CHEF_CHANTIER).
- [ ] Vous avez le droit de modifier la présence sur ce chantier.
- [ ] La paie du mois n'est ni validée ni clôturée.

**Étapes**
1. Cliquez dans la case et tapez le code. Les minuscules sont converties en majuscules (« p » devient « P »).
2. Appuyez sur Entrée, ou quittez la case (touche Tab, clic ailleurs) : le code est appliqué.
3. Pour effacer un jour, videz la case puis quittez-la.
4. Continuez case par case, puis cliquez « Valider » (fiche 2.5).
   - Astuce : pour un même code sur plusieurs jours, la carte du mois est plus rapide (fiche 2.4).

**Résultat** — La case prend la couleur du code. La modification n'est pas encore enregistrée : le point orange apparaît sur « Valider » et la pastille « N à valider » augmente.

**Attention**
- « Code non autorisé : X. Codes : A · B · … » : le code tapé n'existe pas ou n'est plus actif. La case reprend son ancienne valeur. Utilisez un des codes listés (voir « Légende des codes »).
- Si vous retapez le même code sur une case proposée (par exemple MS proposé par un ordre de mission), la case garde son origine. Si vous mettez un autre code, la case devient une saisie manuelle.
- Rien n'est enregistré tant que vous n'avez pas cliqué « Valider ». Fermer l'onglet ou quitter la page déclenche un avertissement.

**Voir aussi** — 2.4 Remplir une période avec la carte du mois · 2.5 Valider le pointage du mois · 2.28 Comprendre les codes de présence et leur effet sur la paie

---

## 2.4 Remplir une période avec la carte du mois

> **Vidéo V2.3** · durée estimée 5 min (avec la fiche 2.3) · Public : ADMIN_RH, GERANT, CHEF_CHANTIER

**Où la trouver** — Ressources Humaines › Temps & présence › Présence › grille › clic simple sur une case (`/rh/presence`).

**À quoi ça sert** — Poser un même code sur plusieurs jours consécutifs (une rotation, une semaine de récupération…) ou effacer une période, à la souris.

**Avant de commencer**
- [ ] Mêmes conditions que pour la fiche 2.3.

**Étapes**
1. Cliquez une fois sur une case de l'employé et attendez un instant : la carte du mois s'ouvre, avec le nom de l'employé et le mois.
   - Si vous commencez à taper un code, la carte ne s'ouvre pas : vous êtes en saisie au clavier (fiche 2.3).
2. Choisissez le code parmi les boutons ; son libellé s'affiche. Le code présélectionné est celui de la case, sinon MS, sinon le premier code actif.
3. Choisissez la borne à régler avec « Du N » ou « Au N ».
4. Dans le mini-calendrier :
   - cliquez un jour pour fixer le début (ou la fin si « Au N » est actif) ;
   - ou cliquez-glissez d'un jour à un autre pour sélectionner toute la plage.
5. Cliquez « Appliquer » : le message « CODE du X au Y. » confirme la pose.
   - Pour vider la plage, cliquez « Effacer » : message « Période effacée. ».
   - Pour fermer sans rien changer : « Annuler », touche Échap, ou clic à l'extérieur de la carte.
6. Cliquez « Valider » pour enregistrer (fiche 2.5).

**Exemple** — Karim BENALI (employé fictif) part en récupération du 21 au 30 du mois. Cliquez sur sa case du 21, choisissez « CRP », réglez « Du 21 » et « Au 30 », cliquez « Appliquer », puis « Valider ».

**Résultat** — Les cases de la plage portent le code choisi (ou sont vides). Elles sont modifiées localement, avec la même règle d'origine qu'à la fiche 2.3, et attendent votre validation.

**Attention**
- « Choisissez un code du référentiel uniquement. » : sélectionnez un des boutons de code proposés.
- « Jours invalides. » : la plage choisie est incorrecte ; refaites la sélection.

**Voir aussi** — 2.3 Saisir un code dans une case · 2.5 Valider le pointage du mois

---

## 2.5 Valider le pointage du mois

> **Vidéo V2.5** · durée estimée 5 min · Public : ADMIN_RH, GERANT, CHEF_CHANTIER

**Où la trouver** — Ressources Humaines › Temps & présence › Présence › bouton « Valider » en haut à droite de la grille (infobulle « Valider les valeurs renseignées ») (`/rh/presence`).

**À quoi ça sert** — Enregistrer la grille et rendre ses valeurs **validées**. La paie ne lit que les présences validées : tant que vous n'avez pas cliqué « Valider », vos saisies ne comptent pas.

**Avant de commencer**
- [ ] Un chantier est choisi (ou un employé en mode Par employé) et la grille contient au moins une ligne.
- [ ] La paie du mois n'est ni validée ni clôturée.
- [ ] Votre rôle peut modifier les jours, ou vous avez modifié une colonne que votre rôle peut modifier (poste occupé, commentaire, heures supplémentaires…). Sinon le bouton reste grisé.

**Étapes**
1. Saisissez ou corrigez les cases et les colonnes (fiches 2.3, 2.4, 2.6).
2. Vérifiez les cases en italique gris (propositions d'ordres de mission et de congés) : gardez-les, changez-les ou effacez-les (fiche 2.26).
3. Cliquez « Valider ».
4. Lisez les messages :
   - « N ligne(s) mise(s) à jour » : les colonnes de ligne (poste occupé, commentaire, heures…) sont enregistrées ;
   - « N valeurs validées » : les jours du mois sont enregistrés et validés (si votre rôle peut modifier les jours) ;
   - puis un message sur la paie, par exemple « N paie(s) brouillon signalée(s) « données modifiées depuis le calcul » : aucun recalcul automatique, décision demandée au Centre de décisions. » ou « Aucune paie n'a été créée : la génération est soumise à décision (Centre de décisions). ».
5. La grille se recharge : les cases passent en texte normal et la pastille « Tout est validé » apparaît (sauf présences importées, voir ci-dessous).

**Résultat** — La grille **remplace le mois** du chantier (ou de l'employé en mode Par employé). Ce que vous voyez devient la référence validée pour la paie :
- les saisies manuelles deviennent validées ;
- un jour proposé par un ordre de mission ou un congé, que vous n'avez pas touché, garde son origine (« Ordre de mission N° … — validé », « Automatique — validé ») et devient validé ;
- un jour que vous avez **effacé** alors qu'il était proposé par un ordre de mission ou un congé est **mémorisé** : il ne sera plus reproposé automatiquement, même si le document est modifié plus tard ;
- un jour d'ordre de mission ou de congé dont vous avez **changé le code** devient une saisie manuelle : il ne sera plus jamais écrasé par les propositions automatiques ;
- aucune paie n'est créée ni recalculée : les paies brouillon du mois sont signalées (décision D3, Recalcul des paies brouillon), ou la génération est soumise à décision (décision D4, Génération de paie).

**Exemple** — Le 5 du mois, un ordre de mission propose MS du 1er au 10 pour un employé. Le chef de chantier sait que l'employé est revenu le 8 : il efface les jours 9 et 10 avec la carte du mois, met P le 8, et clique « Valider ». Les jours 1 à 7 restent « Ordre de mission — validé » ; le 8 devient une saisie manuelle validée ; les 9 et 10 sont vides et ne reviendront pas.

**Attention**
- **Présences importées** : une valeur importée des archives que vous laissez telle quelle n'est **pas** validée par ce bouton. Elle reste « Importé des archives — à valider depuis l'écran des imports » et se valide uniquement depuis la page des imports (fiche 2.17). Si vous la modifiez ou l'effacez, elle devient une saisie manuelle.
- **Jour effacé par erreur** : comme il ne sera plus reproposé, saisissez le code à la main (par exemple MS) puis validez.
- **Travail à plusieurs** : un jour proposé par un ordre de mission enregistré pendant que vous saisissiez n'est pas effacé par votre validation.
- **Changements non validés** : changer de mois, de chantier ou d'employé, cliquer sur un lien de la page, fermer ou recharger l'onglet affiche « Des modifications non validées seront perdues. Continuer ? » (ou l'avertissement du navigateur). Répondez non, puis validez.
- Messages de blocage :
  - « Paie validée pour ce mois : le pointage est figé. Demandez la réouverture depuis Paie (décision D7 du SUPER_ADMIN). » ou « Paie clôturée pour ce mois : le pointage est figé (réouverture seulement sur décision D7 du SUPER_ADMIN). » : le mois est figé ; voir décision D7 (Réouverture d'une paie) au chapitre 3 ;
  - « Feuille de pointage figée : paie clôturée. » : même cause ;
  - « Saisie des jours non autorisée pour votre rôle. » : votre rôle ne peut pas modifier les jours ;
  - « Aucune colonne modifiable pour votre rôle. » ou « Colonne … non modifiable pour votre rôle. » : voir la fiche 2.31 avec le SUPER_ADMIN ;
  - « Présences enregistrées, mais la paie n'a pas pu être signalée : … » : vos présences sont bien enregistrées ; prévenez le responsable paie pour qu'il vérifie le mois.
- Une validation porte au plus sur 4 000 cases à la fois.

**Voir aussi** — 2.26 Contrôler et valider les jours proposés par un ordre de mission ou un congé · 2.17 Valider les présences importées · 3 Paie (Préparation du mois, Calcul de la paie) · Annexe A Décisions

---

## 2.6 Saisir le poste occupé, le commentaire et les heures supplémentaires

> **Vidéo V2.6** · durée estimée 3 min · Public : ADMIN_RH, GERANT, CHEF_CHANTIER

**Où la trouver** — Ressources Humaines › Temps & présence › Présence › grille › colonnes « POSTE OCCUPE », « COMMENTAIRE », « VALIDATION », « HS 50 % (h) », « HS 75 % (h) », « HS 100 % (h) », et toute colonne ajoutée par le SUPER_ADMIN (`/rh/presence`).

**À quoi ça sert** — Compléter la ligne de chaque employé pour le mois : le poste réellement occupé sur le chantier, une observation, une mention de contrôle, et les heures supplémentaires qui seront payées.

**Avant de commencer**
- [ ] Votre rôle peut modifier la colonne concernée. Par défaut :
  - POSTE OCCUPE et VALIDATION : ADMIN_RH, GERANT ;
  - COMMENTAIRE : ADMIN_RH, GERANT, CHEF_CHANTIER ;
  - HS 50 %, HS 75 %, HS 100 % : ADMIN_RH, GERANT, CHEF_CHANTIER.
- [ ] La paie du mois n'est pas clôturée.

**Étapes**
1. Cliquez dans la cellule de la colonne et saisissez la valeur (texte, nombre ou date selon la colonne). La cellule modifiée devient orange.
2. Pour « POSTE OCCUPE » :
   - choisissez un poste dans les suggestions ;
   - le texte grisé dans une cellule vide reprend le poste saisi le mois précédent (jusqu'à deux ans en arrière), sinon le poste du contrat.
3. Pour les heures supplémentaires, saisissez le nombre d'heures du mois dans la colonne du taux : « HS 50 % (h) », « HS 75 % (h) » ou « HS 100 % (h) ».
4. Cliquez « Valider ». Message « N ligne(s) mise(s) à jour ».

**Exemple** — Pour un employé payé 60 000 DA de base, saisir 10 dans « HS 50 % (h) » donne en paie une ligne « Heures supplémentaires 50 % » : taux horaire = 60 000 ÷ 173,33 ≈ 346,16 DA ; montant ≈ 10 × 346,16 × 1,5 ≈ 5 192 DA (le nombre d'heures mensuelles, 173,33 par défaut, se règle dans les paramètres de paie, chapitre 3).

**Résultat** — Les valeurs sont enregistrées pour l'employé, le chantier et le mois. Seules les colonnes que votre rôle peut modifier sont écrites. Les heures HS 50 / 75 / 100 sont reprises par la paie du mois.

**Attention**
- Si votre rôle ne peut pas modifier les jours mais peut modifier une de ces colonnes, le bouton « Valider » enregistre seulement ces colonnes.
- Une valeur de colonne de saisie n'a aucun effet sur les jours pointés : seules les colonnes HS sont lues par la paie.

**Voir aussi** — 2.5 Valider le pointage du mois · 2.31 Configurer les colonnes et les droits de la feuille de présence · 3 Paie

---

## 2.7 Importer un classeur Excel dans la grille

> **Vidéo V2.7** · durée estimée 4 min (avec la fiche 2.8) · Public : ADMIN_RH, GERANT, CHEF_CHANTIER

**Où la trouver** — Ressources Humaines › Temps & présence › Présence :
- modèle : « Plus d'actions » › « Modèle Excel » ;
- import : bouton « Importer » (infobulle « Classeur Excel : Matricule + jours 1..31 (+ HS50 / HS75 / HS100) ») (`/rh/presence`).

**À quoi ça sert** — Pré-remplir la grille du mois affiché à partir d'un classeur (pointeuse, tableau du chef de chantier), au lieu de tout saisir à la main. C'est un outil rapide, pour le mois en cours. Pour reprendre des archives avec traçabilité, utilisez plutôt les imports d'archives (fiches 2.9 à 2.20).

**Avant de commencer**
- [ ] Un chantier et un mois sont choisis dans la grille.
- [ ] La paie du mois n'est ni validée ni clôturée.
- [ ] Vous avez le droit de modifier la grille (sinon « Importer » reste grisé).

**Étapes**
1. Ouvrez « Plus d'actions » et cliquez « Modèle Excel ». Le fichier « pointage_AAAA_MM.xlsx » se télécharge :
   - feuille « Pointage » : ligne de titre « POINTAGE MM/AAAA » et nom du chantier ; colonnes Matricule, Nom, Prénom, 1 … 31, HS50, HS75, HS100 ; les codes déjà pointés sont pré-remplis ;
   - feuille « Codes » : la liste des codes et leur libellé, plus une ligne pour les heures supplémentaires.
2. Remplissez les jours avec les codes, et les heures supplémentaires si besoin. Laissez vide un jour que vous ne voulez pas changer.
3. Cliquez « Importer » et choisissez le fichier (.xlsx, 2 Mo au plus).
4. Lisez le message : « Import : N employé(s), N jour(s), N valeur(s) d'heures. Vérifiez puis validez. » et, s'il y en a, « N anomalie(s) : … ».
5. Contrôlez les cases remplies dans la grille.
6. Cliquez « Valider » (fiche 2.5).

**Résultat** — Les jours du classeur apparaissent dans la grille comme saisies manuelles non validées. **Rien n'est enregistré avant « Valider ».**

**Attention**
- Une case vide dans le classeur laisse le jour inchangé dans la grille.
- La colonne du matricule peut s'appeler MATRICULE, MAT, MATR ou الرقم التسلسلي. Les zéros en tête du matricule sont ignorés.
- Messages possibles :
  - « Choisissez un fichier Excel. », « Format attendu : .xlsx », « Fichier trop volumineux (2 Mo max). », « Fichier Excel illisible. », « Classeur sans feuille. » : vérifiez le fichier ;
  - « Chantier ou période invalide. » : choisissez d'abord le chantier et le mois ;
  - « Colonne « Matricule » introuvable. » ou « Aucune colonne de jour (1..31)… » : repartez du modèle ;
  - « Ligne N : matricule X absent de ce chantier pour ce mois. » : l'employé n'a pas de contrat sur ce chantier ce mois-là ;
  - « … en double, ligne ignorée. » : le même matricule apparaît deux fois ; seule la première ligne compte ;
  - « Ligne N, jour D : code « X » inconnu. » : utilisez un code de la feuille « Codes » ;
  - « Ligne N : HS50 « x » invalide. » : les heures doivent être comprises entre 0 et 300.
- 30 anomalies au plus sont listées : corrigez le fichier et recommencez si la liste est longue.

**Voir aussi** — 2.5 Valider le pointage du mois · 2.10 Déposer un fichier d'archives de présence

---

## 2.8 Imprimer ou archiver le mois

> **Vidéo V2.7** · durée estimée 4 min (avec la fiche 2.7) · Public : tous les utilisateurs de la grille

**Où la trouver** — Ressources Humaines › Temps & présence › Présence › « Plus d'actions » › « Imprimer / archiver le mois » (`/rh/presence`).

**À quoi ça sert** — Obtenir une version papier ou PDF de la feuille de présence du mois, par exemple pour la faire signer ou la classer.

**Avant de commencer**
- [ ] Le chantier et le mois voulus sont affichés.
- [ ] Le mois est validé (recommandé, pour imprimer la version définitive).

**Étapes**
1. Si vous ne voulez pas des colonnes de totaux par code, désactivez l'interrupteur « Totaux par code » dans « Plus d'actions ».
2. Cliquez « Imprimer / archiver le mois ».
3. Dans la fenêtre d'impression de votre navigateur, choisissez votre imprimante, ou l'enregistrement au format PDF pour archiver.

**Résultat** — La feuille s'imprime avec l'en-tête « Pointage · Mois Année · Chantier ».

**Attention**
- L'archivage se fait par l'enregistrement PDF de votre navigateur : classez vous-même le fichier obtenu.

**Voir aussi** — 2.1 Consulter la grille d'un chantier

---

## 2.9 Télécharger le modèle d'archives « une ligne par jour »

> **Vidéo V2.9** · durée estimée 5 min (avec la fiche 2.10) · Public : SUPER_ADMIN (ou rôle autorisé à importer)

**Où la trouver** — Ressources Humaines › Temps & présence › Imports de présences › lien « Modèle « une ligne par jour » » (`/rh/presence/imports`).

**À quoi ça sert** — Préparer un fichier d'archives au bon format quand les présences couvrent plusieurs chantiers ou plusieurs mois.

**Avant de commencer**
- [ ] Vous avez le droit de déposer des imports.

**Étapes**
1. Cliquez « Modèle « une ligne par jour » ». Le fichier « modele_archives_presences.xlsx » se télécharge.
2. Ouvrez-le. Il contient quatre feuilles :
   - « Presences » : colonnes Matricule, Nom, Prénom, Date, Code, Chantier, HS50, HS75, HS100 ;
   - « Mode d'emploi » : les règles de remplissage ;
   - « Codes » : les codes de présence autorisés ;
   - « Chantiers » : les chantiers à utiliser.
3. Remplissez une ligne par salarié et par jour. Date, Code et Chantier sont obligatoires ; les heures supplémentaires sont facultatives.

**Résultat** — Vous disposez d'un fichier prêt à déposer (fiche 2.10).

**Attention**
- Pour une grille mensuelle (un chantier, un mois), le modèle se télécharge depuis la fenêtre de dépôt : « Télécharger la grille de ce chantier pour ce mois » (même modèle que la fiche 2.7).

**Voir aussi** — 2.10 Déposer un fichier d'archives de présence

---

## 2.10 Déposer un fichier d'archives de présence

> **Vidéo V2.9** · durée estimée 5 min (avec la fiche 2.9) · Public : SUPER_ADMIN (ou rôle autorisé à importer)

**Où la trouver** — Ressources Humaines › Temps & présence › Imports de présences › bouton « Déposer un fichier » (`/rh/presence/imports`). Le bouton « Importer pointeuse » de la page Présence mène aussi ici.

**À quoi ça sert** — Reprendre dans l'application des présences tenues ailleurs (registre papier, ancien logiciel, fichier transmis), en conservant le fichier source et sa provenance. Le dépôt lance automatiquement l'analyse ; rien n'est encore écrit dans la grille.

**Avant de commencer**
- [ ] Vous avez le droit de déposer des imports sur le ou les chantiers concernés.
- [ ] Le fichier est un classeur .xlsx ou un fichier .csv en UTF-8, de 10 Mo au plus, et de 200 000 lignes au plus.
- [ ] Les employés, leurs contrats et les chantiers existent dans l'application.

**Étapes**
1. Cliquez « Déposer un fichier ». La fenêtre « Déposer un fichier d'archives de présence » s'ouvre ; elle rappelle que le fichier est conservé avec son empreinte et ne peut pas être remplacé.
2. Choisissez le « Format du fichier » :
   - « Grille mensuelle (un chantier, un mois) » (par défaut) : colonnes Matricule ou MAT, Nom, Prénom, jours « 1 » ou « 1 Lun »…, heures supplémentaires ;
   - « Une ligne par salarié et par jour » : le modèle de la fiche 2.9.
3. Choisissez le « Fichier » (obligatoire).
4. Si le classeur contient plusieurs feuilles, choisissez la « Feuille du classeur ». Le mois peut être déduit du nom de la feuille (par exemple « JANVIER 2026 »).
5. Choisissez le « Rapprochement des salariés » : « Par matricule » ou « Par nom et prénom… ».
6. Indiquez la période :
   - grille : le « Mois » ;
   - lignes : « Premier mois » et « Dernier mois » (12 mois au plus).
7. Indiquez l'« Année de référence » ; elle doit correspondre à la période. Un encadré indique la nature : reprise ou opérationnel.
8. Choisissez le « Chantier » (grille, un seul) ou cochez les « Chantiers couverts » (lignes).
9. Renseignez la « Provenance » : « Registre papier (saisi dans le fichier) » (par défaut), « Logiciel source », « Fichier transmis par une personne ou un service » ou « Autre provenance ».
10. Renseignez la « Date du document source » et la « Précision sur la provenance » (obligatoire, 2 à 300 caractères ; par exemple « Registre de pointage du chantier, cahier n° 3, saisi par le chef de chantier »).
11. Facultatif : le « Total de contrôle » (nombre de présences et nombre de salariés attendus) et un « Commentaire » (1 000 caractères au plus).
12. Cliquez « Déposer et analyser ». L'écran affiche « Envoi du fichier… » puis « Lecture et contrôle des lignes… ». « Fermer » abandonne.

**Résultat** — Le lot est créé avec un numéro « IMP-AAAA-NNNN » et analysé. Message : « Fichier déposé et analysé : … Rien n'est encore enregistré dans le pointage. » Ouvrez le lot pour lire le rapport (fiche 2.11).

**Attention**
- « Choisissez le fichier à importer. », « Format accepté : classeur Excel .xlsx ou fichier CSV (UTF-8). », « Fichier trop volumineux (10 Mo maximum). » : vérifiez le fichier. Pour un CSV mal encodé, enregistrez-le de nouveau en UTF-8.
- « Choisissez au moins un chantier. », « Le dernier mois précède le premier. », « Grille mensuelle : un seul chantier et un seul mois. », « L'année de référence doit correspondre à la période couverte. » : corrigez les champs.
- Si le même fichier a déjà été déposé, le lot porte l'avertissement « fichier en double ». Vérifiez que vous n'importez pas deux fois les mêmes présences.
- Le total de contrôle est conseillé : l'analyse vous signale tout écart avec ce que contient réellement le fichier.

**Voir aussi** — 2.9 Télécharger le modèle d'archives · 2.11 Lire le rapport d'analyse d'un lot

---

## 2.11 Lire le rapport d'analyse d'un lot

> **Vidéo V2.11** · durée estimée 5 min (avec la fiche 2.12) · Public : SUPER_ADMIN (ou rôle autorisé à consulter les imports)

**Où la trouver** — Ressources Humaines › Temps & présence › Imports de présences › onglet « Lots » › clic sur un lot (`/rh/presence/imports`).

**À quoi ça sert** — Savoir, avant tout import, quelles lignes du fichier sont acceptées, rejetées, en conflit ou déjà présentes, et pourquoi.

**Avant de commencer**
- [ ] Un lot a été déposé (fiche 2.10).

**Étapes**
1. Cliquez sur le lot. Le panneau de détail s'ouvre avec le titre « Lot … · période ».
2. Lisez les informations : Année de référence, Nature, Provenance, Date du document source, Fichier, empreinte du fichier, Déposé par, totaux de contrôle déclarés, puis, selon l'avancement, Importé par, Validé par, Rejeté ou Annulé par avec le motif, et les correspondances de codes du lot.
3. Lisez les compteurs : Lues, Acceptées, Rejetées, Identiques, Doublons, En conflit, Importables.
4. Lisez les avertissements du lot (fichier déjà déposé, total de contrôle des présences ou des salariés différent) et les listes « Motifs de rejet » et « Avertissements » (nombre de lignes par motif).
5. Dans le tableau des lignes, filtrez par statut : Toutes, Rejetée, En conflit, Acceptée avec avertissement, Acceptée, Déjà enregistrée à l'identique, Doublon ignoré. Colonnes : Ligne, Salarié, Date, Chantier, Code, Statut, Détail. Naviguez avec « Précédente » / « Suivante ».
6. Pour travailler hors ligne, cliquez « Rapport complet (Excel) » (feuilles « Synthèse » et « Lignes »). Pour revoir le fichier d'origine, cliquez « Fichier source » (le lien n'est valable que deux minutes).

**Résultat** — Vous savez quoi faire ensuite :

| Situation | Action |
|---|---|
| Lignes sans employé reconnu | Rapprocher les noms (fiche 2.12) |
| Codes inconnus | Demander une correspondance (fiche 2.13) |
| Lignes en conflit | Trancher (fiche 2.15) |
| Tout est acceptable | Importer (fiche 2.16) |
| Le fichier est faux | Rejeter le lot (fiche 2.18) |

**Ce que l'analyse contrôle, ligne par ligne**
- **Rejet** :
  - matricule manquant, inconnu ou ambigu ;
  - chantier manquant, inconnu ou hors du lot ;
  - code manquant ou inconnu (sauf correspondance accordée, fiche 2.13) ;
  - date manquante, invalide, hors du mois ou de la période, ou dans le futur ;
  - mois dont la paie est validée ou clôturée ;
  - aucun contrat ne couvre la date sur ce chantier, ou la date suit une sortie validée ;
  - heures hors limites : 0 à 24 h par jour (total des trois taux 24 h au plus), 0 à 300 h pour les colonnes mensuelles, 300 h au plus par taux sur le mois ;
  - même salarié le même jour sur deux chantiers, ou avec deux codes différents dans le fichier ;
  - conflit avec un autre chantier dont la paie est figée.
- **Avertissement** (la ligne reste acceptée) : nom différent de la fiche employé ; doublon identique ignoré (la première ligne est retenue).
- **Identique** : la même valeur est déjà enregistrée ; il n'y a rien à importer.
- **Conflit** : une autre valeur existe déjà sur le même chantier, une présence existe sur un autre chantier le même jour, ou un congé approuvé couvre le jour.

**Attention**
- Lot incomplet : si toutes les lignes du fichier n'ont pas été reçues, un avertissement le signale (« … toutes les lignes du fichier n'ont pas été reçues. Rejetez ce lot et déposez à nouveau le fichier. »). Suivez ce conseil (fiche 2.18 puis 2.10).
- Une ligne rejetée ne sera jamais importée. Corrigez la cause (employé, contrat, code…) puis déposez à nouveau un fichier corrigé, ou acceptez de n'importer que les lignes valides.

**Voir aussi** — 2.12 Rapprocher les noms non reconnus · 2.13 Demander une correspondance pour des codes inconnus · 2.15 Trancher les conflits d'un lot · 2.16 Importer les présences acceptées

---

## 2.12 Rapprocher les noms non reconnus

> **Vidéo V2.11** · durée estimée 5 min (avec la fiche 2.11) · Public : SUPER_ADMIN (ou rôle autorisé à importer)

**Où la trouver** — Ressources Humaines › Temps & présence › Imports de présences › détail du lot › bloc « Noms à rapprocher · مطابقة الأسماء » (`/rh/presence/imports`). Le bloc apparaît quand des lignes n'ont pas pu être reliées à un employé.

**À quoi ça sert** — Indiquer à quel employé correspond un nom écrit autrement dans le fichier (orthographe, prénom inversé, nom en arabe…).

**Avant de commencer**
- [ ] Le lot contient des lignes sans employé reconnu.

**Étapes**
1. Pour chaque nom du fichier, ouvrez « Choisir l'employé… » et sélectionnez le bon employé.
2. Pour défaire un rapprochement, cliquez « Retirer ».

**Exemple** — Le fichier contient « BEN ALI KARIM » ; la fiche employé s'appelle « BENALI Karim ». Choisissez « BENALI Karim » dans la liste.

**Résultat** — Le lot est réanalysé automatiquement et les lignes concernées sont rattachées à l'employé. Le rapprochement est **conservé pour les prochains imports** : le même nom sera reconnu sans nouvelle intervention.

**Attention**
- Un rapprochement erroné servira aussi aux imports suivants : vérifiez bien l'employé choisi, et utilisez « Retirer » en cas d'erreur.

**Voir aussi** — 2.11 Lire le rapport d'analyse d'un lot

---

## 2.13 Demander une correspondance pour des codes inconnus (D11)

> **Vidéo V2.13** · durée estimée 5 min (avec la fiche 2.14) · Public : SUPER_ADMIN (ou rôle autorisé à importer)

**Où la trouver** — Ressources Humaines › Temps & présence › Imports de présences › détail du lot › « Codes inconnus : demander une correspondance » (`/rh/presence/imports`).

**À quoi ça sert** — Un fichier d'archives utilise parfois des codes qui n'existent pas dans l'application (par exemple « R » pour repos, « M » pour malade). Vous proposez la conversion vers un code de l'application ; la conversion s'applique après la décision D11 (Correspondance des codes d'un import).

**Avant de commencer**
- [ ] Le lot est au statut « Analysé » ou « En attente de décision (conflits) ».
- [ ] Le rapport montre des lignes rejetées pour code inconnu.

**Étapes**
1. Cliquez « Codes inconnus : demander une correspondance ».
2. Pour chaque code inconnu, choisissez « Ne pas convertir » ou un code de l'application.
3. Saisissez le « Motif » (par exemple « Dans le registre 2026, R signifie récupération »).
4. Cliquez « Demander la décision ».
5. Le décideur ouvre la décision D11 dans le Centre de décisions et choisit :
   - « Valider pour ce lot seulement » : la conversion s'applique à ce lot, qui est réanalysé ;
   - « Valider et conserver comme politique » : la conversion s'applique à ce lot, et elle est proposée pour les lots suivants après une seconde confirmation (fiche 2.14) ;
   - « Refuser la correspondance » : les lignes restent rejetées.

**Exemple** — « R » → « CRP » et « M » → « CM ». Après « Valider pour ce lot seulement », les lignes « R » du lot sont analysées comme des jours CRP.

**Résultat** — Une demande D11 est créée. Tant qu'elle n'est pas validée, les lignes concernées restent rejetées.

**Attention**
- La correspondance change le sens des données : CRP, CM ou AN n'ont pas du tout le même effet sur la paie (fiche 2.28). Vérifiez le sens du code d'origine avec le chantier avant de demander.

**Voir aussi** — 2.14 Confirmer, refuser ou révoquer une correspondance de codes · 2.28 Comprendre les codes de présence · 6 Centre de décisions

---

## 2.14 Confirmer, refuser ou révoquer une correspondance de codes

> **Vidéo V2.13** · durée estimée 5 min (avec la fiche 2.13) · Public : détenteur du droit de décision D11

**Où la trouver** — Ressources Humaines › Temps & présence › Imports de présences › onglet « Correspondances de codes (N à confirmer) » (`/rh/presence/imports`).

**À quoi ça sert** — Transformer une correspondance accordée « comme politique » en règle permanente pour les futurs imports, ou l'arrêter.

**Avant de commencer**
- [ ] Vous avez le droit de décision D11.
- [ ] Une décision D11 a été prise avec « Valider et conserver comme politique ».

**Étapes**
1. Ouvrez l'onglet « Correspondances de codes ». Chaque correspondance porte un statut : À confirmer, Active ou Révoquée.
2. Pour une correspondance « À confirmer », cliquez « Confirmer » (elle devient Active) ou « Refuser ».
3. Pour arrêter une correspondance Active, cliquez « Révoquer » et saisissez un motif (10 à 500 caractères).

**Résultat** — Une correspondance Active est appliquée automatiquement aux lots suivants. Une correspondance Révoquée ne s'applique plus.

**Attention**
- « Confirmation des correspondances de codes non autorisée (droit de décision D11 requis). » : demandez à une personne habilitée.
- « Code de présence cible désactivé : révoquez cette correspondance. » : le code d'arrivée n'est plus utilisable ; révoquez la correspondance.
- « Correspondance introuvable ou déjà confirmée ou révoquée. » : quelqu'un a déjà traité cette ligne ; actualisez la page.

**Voir aussi** — 2.13 Demander une correspondance pour des codes inconnus

---

## 2.15 Trancher les conflits d'un lot (D5)

> **Vidéo V2.15** · durée estimée 4 min · Public : SUPER_ADMIN

**Où la trouver** — Ressources Humaines › Temps & présence › Imports de présences › détail du lot › alerte de conflit › lien « ouvrir la décision » ; puis, si vous tranchez ligne par ligne, l'outil de résolution dans le détail du lot (`/rh/presence/imports`).

**À quoi ça sert** — Décider quoi faire quand le fichier contredit ce qui est déjà enregistré : autre code sur le même chantier, présence sur un autre chantier le même jour, ou congé approuvé. C'est la décision D5 (Conflit d'un import de présences), réservée au SUPER_ADMIN.

**Avant de commencer**
- [ ] Vous êtes SUPER_ADMIN.
- [ ] Le lot est « En attente de décision (conflits) ».

**Étapes**
1. Dans le détail du lot, cliquez « ouvrir la décision » sur l'alerte de conflit.
2. Choisissez une option D5 :
   - « Conserver l'existant » : les lignes en conflit ne seront pas importées ;
   - « Retenir l'import » : à l'import, les présences existantes seront remplacées par celles du fichier, en attente de validation ; les valeurs remplacées sont gardées et seront restaurées si le lot est annulé ;
   - « Trancher ligne par ligne » : vous choisissez pour chaque ligne ;
   - « Rejeter le lot » : rien n'est importé.
3. Si vous avez choisi « Trancher ligne par ligne », revenez dans le détail du lot :
   - pour chaque ligne en conflit, choisissez « Conserver l'existant » ou « Retenir l'import » ;
   - pour aller plus vite, utilisez « Tout conserver (cette page) » ou « Tout retenir (cette page) » (200 lignes par page) ;
   - cliquez « Enregistrer N choix ».

**Exemple** — La grille indique CA (congé approuvé) le 12 pour un employé ; le registre papier indique P. Si le congé a bien été pris, choisissez « Conserver l'existant » pour cette ligne.

**Résultat** — Le lot redevient importable quand tous les conflits sont tranchés. Si une nouvelle analyse ne trouve plus de conflit, la demande D5 se ferme d'elle-même.

**Attention**
- Le lot reste « En attente de décision » tant qu'un conflit n'est pas tranché.
- Si vous retenez l'import sur des présences déjà validées, les paies du mois seront signalées après l'import.

**Voir aussi** — 2.16 Importer les présences acceptées · 2.18 Rejeter un lot ou annuler un import · Annexe A Décisions

---

## 2.16 Importer les présences acceptées

> **Vidéo V2.16** · durée estimée 5 min (avec la fiche 2.17) · Public : SUPER_ADMIN (ou rôle autorisé à importer)

**Où la trouver** — Ressources Humaines › Temps & présence › Imports de présences › détail du lot › « Importer les présences acceptées » (`/rh/presence/imports`).

**À quoi ça sert** — Écrire dans la grille, comme propositions, les lignes acceptées du lot.

**Avant de commencer**
- [ ] Le lot est au statut « Analysé ».
- [ ] Aucun conflit n'est en attente (fiche 2.15).
- [ ] Vous avez le droit de déposer des imports.

**Étapes**
1. Cliquez « Importer les présences acceptées ». La fenêtre « Importer le lot … » s'ouvre ; l'application réanalyse le lot.
2. Lisez les compteurs.
3. Si des lignes sont rejetées, cochez la case qui confirme que vous en avez pris connaissance.
4. Cliquez « Importer N présence(s) ».

**Résultat** — Message « N présence(s) importée(s) en attente de validation, dont N en remplacement… ». Le lot passe « Importé, à valider ». Les jours apparaissent dans la grille en italique gris, avec l'infobulle « Importé des archives — à valider depuis l'écran des imports ». Les valideurs reçoivent une notification. Aucune paie n'est créée ni recalculée.

**Attention**
- « N ligne(s) rejetée(s) ne seront pas importées : confirmez l'import des seules lignes acceptées. » : cochez la case de prise de connaissance.
- « Aucune ligne à importer dans ce lot. » : toutes les lignes sont rejetées, identiques ou écartées.
- « Présences modifiées pendant l'import : rien n'a été importé. Relancez l'analyse du lot. » : quelqu'un a modifié la grille entre-temps ; relancez l'analyse puis l'import.
- Si de nouveaux conflits sont apparus, rien n'est importé et une décision D5 est demandée (fiche 2.15).
- Si des présences validées ont été remplacées (option « Retenir l'import »), les paies du mois sont signalées.

**Voir aussi** — 2.17 Valider les présences importées

---

## 2.17 Valider les présences importées

> **Vidéo V2.16** · durée estimée 5 min (avec la fiche 2.16) · Public : valideur des imports (autre personne que l'auteur du dépôt)

**Où la trouver** — Ressources Humaines › Temps & présence › Imports de présences › onglet « À valider » › lot › « Valider les présences importées » (`/rh/presence/imports`). La pastille bleue « N importée(s) » de la grille mène aussi à cet onglet.

**À quoi ça sert** — Rendre définitives, pour la paie, les présences importées des archives. Cette validation se fait ici et non par le bouton « Valider » de la grille.

**Avant de commencer**
- [ ] Vous avez le droit « Validation des présences importées » sur les chantiers du lot.
- [ ] Vous n'êtes pas l'auteur du dépôt, sauf si la politique D12 l'autorise (fiche 2.20). Le SUPER_ADMIN peut toujours valider.
- [ ] Le lot est « Importé, à valider ».

**Étapes**
1. Ouvrez l'onglet « À valider (N) ».
2. Cliquez sur le lot et relisez le rapport (fiche 2.11). Vous pouvez aussi contrôler les jours dans la grille.
3. Cliquez « Valider les présences importées ».

**Résultat** — Les présences importées encore intactes deviennent validées (« Importé des archives — validé »). Celles qui ont été modifiées dans la grille depuis l'import sont devenues des saisies manuelles et ne sont pas comptées. Le lot passe « Validé ». Les paies concernées sont signalées (décision D3, Recalcul des paies brouillon) ou la génération est soumise à décision (décision D4, Génération de paie).

**Attention**
- « Séparation des tâches : vous avez importé ce lot, sa validation revient à une autre personne (politique D12). » : demandez à un collègue habilité de valider.
- « Paie validée ou clôturée depuis l'import pour un mois de ce lot : validation impossible sans réouverture (D7). » : la paie a été figée entre-temps ; voir décision D7 (Réouverture d'une paie).
- « Lot … : rien à valider (statut …). » : le lot a déjà été traité ou annulé.

**Voir aussi** — 2.20 Définir la politique de validation par l'auteur · 2.18 Rejeter un lot ou annuler un import

---

## 2.18 Rejeter un lot ou annuler un import

> **Vidéo V2.18** · durée estimée 4 min (avec la fiche 2.19) · Public : SUPER_ADMIN (ou rôle autorisé à annuler)

**Où la trouver** — Ressources Humaines › Temps & présence › Imports de présences › détail du lot › « Rejeter le lot » (avant import) ou « Annuler l'import » (après import ou validation) (`/rh/presence/imports`).

**À quoi ça sert** — Écarter un fichier faux ou incomplet avant import, ou retirer de la grille des présences importées par erreur.

**Avant de commencer**
- [ ] Rejet : le lot est « En préparation », « Analysé » ou « En attente de décision (conflits) ».
- [ ] Annulation : le lot est « Importé, à valider » ou « Validé », et aucune paie d'un de ses mois n'est validée ou clôturée.

**Étapes**
1. Ouvrez le lot.
2. Cliquez « Rejeter le lot » ou « Annuler l'import ».
3. Saisissez le « Motif » (obligatoire, 10 à 500 caractères), par exemple « Fichier incomplet, mars manquant : nouveau dépôt prévu ».
4. Confirmez.

**Résultat**
- **Rejet** : rien n'est importé. Le lot reste consultable avec son fichier et son rapport. Les demandes D5 et D11 en cours pour ce lot sont closes.
- **Annulation** :
  - les présences importées encore au statut « importé » sont supprimées de la grille ;
  - les valeurs remplacées sur décision D5 sont restaurées, si le jour est resté libre ;
  - les paies du mois sont signalées si le lot était validé ou si des valeurs ont été restaurées.

**Attention**
- « Motif obligatoire (10 à 500 caractères). » : complétez le motif.
- « Paie validée ou clôturée pour au moins un mois de ce lot : annulation impossible sans réouverture (D7). » : demandez d'abord la réouverture (décision D7, Réouverture d'une paie).
- Une présence importée que quelqu'un a modifiée dans la grille est devenue une saisie manuelle : l'annulation ne la supprime pas.

**Voir aussi** — 2.10 Déposer un fichier d'archives · 2.15 Trancher les conflits d'un lot

---

## 2.19 Joindre une pièce justificative à un lot

> **Vidéo V2.18** · durée estimée 4 min (avec la fiche 2.18) · Public : SUPER_ADMIN (ou rôle autorisé à importer)

**Où la trouver** — Ressources Humaines › Temps & présence › Imports de présences › détail du lot › « Joindre une pièce » (`/rh/presence/imports`).

**À quoi ça sert** — Conserver avec le lot la preuve de la source : photo ou scan du registre papier, courrier d'envoi, etc.

**Avant de commencer**
- [ ] Le lot n'est ni rejeté ni annulé.
- [ ] La pièce est un PDF, JPEG, PNG ou WebP de 20 Mo au plus.

**Étapes**
1. Cliquez « Joindre une pièce ».
2. Choisissez le fichier.
3. Saisissez une « Description » (par exemple « Scan du registre de pointage, pages 12 à 15 »).
4. Validez l'envoi.

**Résultat** — La pièce apparaît dans la liste « Pièces justificatives » du lot.

**Voir aussi** — 2.11 Lire le rapport d'analyse d'un lot

---

## 2.20 Définir la politique de validation par l'auteur (D12)

> **Vidéo V2.20** · durée estimée 2 min · Public : SUPER_ADMIN

**Où la trouver** — Ressources Humaines › Temps & présence › Imports de présences › onglet « Politique de validation » (`/rh/presence/imports`).

**À quoi ça sert** — Décider si la personne qui a déposé un lot peut aussi le valider. Par défaut, tant qu'aucune décision n'a été prise, l'auteur ne peut pas valider son propre lot (séparation des tâches).

**Avant de commencer**
- [ ] Pour demander : vous êtes SUPER_ADMIN, ou vous avez le droit d'annuler ou de valider les imports.
- [ ] Pour décider : vous êtes SUPER_ADMIN (décision D12, Validation d'un import par son auteur, non délégable).

**Étapes**
1. Ouvrez l'onglet « Politique de validation ». Le bloc « Validation d'un lot par son auteur (D12) » affiche l'état actuel.
2. Cliquez « Demander une décision sur cette politique ».
3. Dans le Centre de décisions, le SUPER_ADMIN choisit « L'auteur peut valider son propre lot » ou « L'auteur ne peut pas valider son propre lot ».

**Résultat** — La politique s'applique à toutes les validations d'imports suivantes. Elle peut être changée plus tard par une nouvelle décision.

**Attention**
- Dans une petite équipe où une seule personne importe, autoriser l'auteur évite les blocages ; sinon, gardez la séparation des tâches.

**Voir aussi** — 2.17 Valider les présences importées · 6 Centre de décisions

---

## 2.21 Saisir une demande de congé

> **Vidéo V2.21** · durée estimée 3 min · Public : ADMIN_RH, GERANT, utilisateurs autorisés

**Où la trouver** — Ressources Humaines › Temps & présence › Congés › onglet « Demandes · الطلبات » › formulaire « Nouvelle demande de congé · طلب عطلة جديد » (`/rh/conges`). Aussi par le bouton « Nouveau congé » de la page Présence.

**À quoi ça sert** — Enregistrer une demande de congé ou d'absence autorisée. Une fois approuvée (fiche 2.22), elle produit un titre de congé et propose les jours dans la grille de présence.

**Avant de commencer**
- [ ] L'employé est actif (non sorti).
- [ ] Vous avez le droit de modifier la présence ou les valeurs de salaire.

**Étapes**
1. Choisissez l'« Employé » (obligatoire). L'aide affiche son « Solde annuel : x j ».
2. Choisissez la « Nature » :
   - « Congé annuel · عطلة سنوية » (code CA) ;
   - « Récupération · عطلة تعويضية » (code CRP) ;
   - « Congé maladie · عطلة مرضية » (code CM) ;
   - « Congé sans solde · عطلة بدون أجر » (code CSS) ;
   - « Absence autorisée payée · غياب مرخص مدفوع » (code AOP).
3. Saisissez « Du » et « Au (inclus) » (obligatoires).
4. Contrôlez les « Jours décomptés ». Par défaut, c'est le nombre de jours calendaires, week-ends compris (aide « N j calendaires »). Vous pouvez le corriger (0 à 366).
5. Pour un congé maladie, saisissez la « Réf. arrêt / CNAS ».
6. Saisissez si besoin un « Motif / observation ».
7. Cliquez « Soumettre ».

**Exemple** — Congé annuel du 3 au 16 du mois : 14 jours calendaires, décomptés du solde annuel à l'approbation.

**Résultat** — Message « Demande enregistrée, en attente de décision. ». La demande apparaît dans le tableau avec le statut « En attente ». Rien n'est encore proposé dans la grille.

**Attention**
- « Employé requis » : choisissez l'employé.
- « La fin précède le début. » : corrigez les dates.
- « Chevauchement avec une autre demande. » : une demande en attente ou approuvée couvre déjà une partie de ces dates pour cet employé.
- Seul le congé annuel (CA) est décompté du solde annuel. Les autres natures n'y touchent pas.

**Voir aussi** — 2.22 Approuver, refuser ou annuler une demande de congé · 2.24 Consulter les soldes de congé annuel · 4 Documents (Titres de congé)

---

## 2.22 Approuver, refuser ou annuler une demande de congé

> **Vidéo V2.22** · durée estimée 5 min (avec la fiche 2.23) · Public : SUPER_ADMIN, ADMIN_RH, GERANT

**Où la trouver** — Ressources Humaines › Temps & présence › Congés › onglet « Demandes · الطلبات » › tableau des demandes › boutons de ligne (`/rh/conges`).

**À quoi ça sert** — Décider des demandes de congé. L'approbation crée le titre de congé et propose les jours dans la grille de présence.

**Avant de commencer**
- [ ] Pour approuver ou refuser : vous êtes SUPER_ADMIN, ADMIN_RH ou GERANT.
- [ ] Pour annuler : vous êtes décideur (demande en attente ou approuvée), ou demandeur de votre propre demande en attente.

**Étapes**
1. Dans le tableau, gardez le filtre « À traiter / en cours » (demandes en attente et congés approuvés non terminés) ou choisissez « Historique complet ».
2. Lisez la ligne : Employé (et motif), Nature (code, réf. CNAS), Période, Jours, Statut, Titre.
3. Selon votre décision :
   - cliquez « Approuver ». Pour un congé annuel dont le solde ne suffit pas, l'application demande « Solde insuffisant (x j disponibles pour y j demandés). Approuver quand même ? » ;
   - ou cliquez « Refuser » et saisissez si besoin un « Motif (facultatif) ». Cliquer Annuler dans cette invite abandonne le refus ;
   - ou cliquez « Annuler » pour annuler une demande (en attente ou déjà approuvée).

**Résultat**
- **Approbation** : message « Congé approuvé : les jours sont proposés sur la feuille de présence. ». Un titre de congé numéroté est créé (affiché par exemple « NF/CNG/0123/26 ») ; la colonne Titre affiche son numéro. Les jours du congé apparaissent dans la grille avec le code de la nature (CA, CRP, CM, CSS ou AOP), en italique gris, origine « Proposé automatiquement — non validé ». Il faut ensuite les valider dans la grille (fiche 2.26).
- **Refus** : message « Décision enregistrée. » ; statut « Refusé » avec le décideur et la note.
- **Annulation d'un congé approuvé** : le titre est annulé et les jours proposés sont retirés de la grille, sauf dans les mois figés et sauf les jours déjà validés d'un mois dont la paie est validée.
- Sauf en cas de refus, la paie du mois de début du congé est signalée (décision D3, Recalcul des paies brouillon, ou décision D4, Génération de paie).

**Exemple** — Congé annuel approuvé du 3 au 16 : la grille de l'employé montre CA du 3 au 16 en italique gris. Le chef de chantier vérifie puis clique « Valider » : les jours deviennent « Automatique — validé » et la paie les compte (coefficient 1, fiche 2.28).

**Attention**
- « Décision réservée aux RH (SUPER_ADMIN, ADMIN_RH, GERANT). » : votre rôle ne peut pas décider.
- « Transition … impossible. » : la demande a déjà changé de statut (par exemple déjà approuvée) ; actualisez la page.
- Si vous n'êtes pas décideur, vous ne pouvez annuler que vos propres demandes en attente.
- Un jour proposé par le congé que vous effacez ou changez dans la grille n'est plus géré par le congé (fiche 2.5).

**Voir aussi** — 2.23 Imprimer le titre de congé · 2.26 Contrôler et valider les jours proposés · 4 Documents (Titres de congé)

---

## 2.23 Imprimer le titre de congé depuis la liste des demandes

> **Vidéo V2.22** · durée estimée 5 min (avec la fiche 2.22) · Public : SUPER_ADMIN, ADMIN_RH, GERANT

**Où la trouver** — Ressources Humaines › Temps & présence › Congés › onglet « Demandes » › ligne d'un congé approuvé › « Titre de congé » (`/rh/conges`).

**À quoi ça sert** — Ouvrir et imprimer le titre de congé remis à l'employé, sans quitter la liste des demandes.

**Avant de commencer**
- [ ] Le congé est approuvé.

**Étapes**
1. Cliquez « Titre de congé » sur la ligne.
2. Le titre s'ouvre dans le Registre (Documents › Titres de congé). Complétez-le et imprimez-le comme indiqué au chapitre 4.
3. Si le titre ne peut pas être ouvert dans le Registre, une fenêtre d'impression « Titre de congé » s'ouvre à la place :
   - vérifiez Nom et prénom (FR/AR), Matricule, Date du document, Poste FR/AR, Nature FR/AR, Du, Au, Nombre de jours, Date de reprise (lendemain du dernier jour) et, pour un congé annuel, Reliquat après congé (j) ;
   - choisissez la langue (Français ou العربية) et Monsieur ou Madame ;
   - si besoin, cliquez « Modifier le texte librement » ;
   - cliquez « Imprimer ».

**Résultat** — Le titre de congé est imprimé.

**Attention**
- « Seul un congé approuvé peut être imprimé. » : approuvez d'abord la demande (fiche 2.22).

**Voir aussi** — 2.22 Approuver, refuser ou annuler une demande · 4 Documents (Titres de congé)

---

## 2.24 Consulter les soldes de congé annuel

> **Vidéo V2.24** · durée estimée 4 min (avec la fiche 2.25) · Public : ADMIN_RH, GERANT

**Où la trouver** — Ressources Humaines › Temps & présence › Congés › onglet « Soldes · الأرصدة » (`/rh/conges`).

**À quoi ça sert** — Connaître, pour chaque employé, les jours de congé annuel acquis, pris, en attente et restants.

**Avant de commencer**
- [ ] Les contrats des employés sont à jour (ils déterminent les mois travaillés).

**Étapes**
1. Ouvrez l'onglet « Soldes ».
2. Lisez les colonnes : Employé, Mois travaillés, Acquis, Ajustements, Pris, En attente, Solde.
3. Repérez les soldes en rouge : ils sont négatifs.

**Comment le solde est calculé**
- **Mois travaillés** : durée des contrats principaux (hors brouillons et contrats annulés) jusqu'à aujourd'hui ; un mois incomplet compte au prorata de ses jours.
- **Acquis** = mois travaillés × taux mensuel, arrondi au dixième. Le taux est rappelé sous le tableau (« Taux : 2.5 j / mois… ») ; il se règle dans les Paramètres RH (chapitre 6).
- **Solde** = acquis + ajustements − congés annuels approuvés.
- **En attente** = congés annuels soumis, pas encore décidés (ils ne sont pas encore retirés du solde).

**Exemple** — Un employé a 10 mois travaillés : 10 × 2,5 = 25 j acquis. Une reprise de solde de + 6 j a été saisie (fiche 2.25). Il a pris un congé annuel approuvé de 12 j. Solde = 25 + 6 − 12 = 19 j. S'il a aussi une demande de 5 j en attente, la colonne « En attente » affiche 5 et le solde reste 19 j jusqu'à l'approbation.

**Résultat** — Vous connaissez le solde de chaque employé ; il est aussi rappelé dans le formulaire de demande (« Solde annuel : x j »).

**Attention**
- Seuls les congés annuels (CA) diminuent le solde. Une récupération (CRP), un congé maladie (CM), un congé sans solde (CSS) ou une absence autorisée payée (AOP) ne le modifient pas.
- Approuver un congé annuel au-delà du solde est possible après confirmation : le solde devient négatif.

**Voir aussi** — 2.25 Ajuster un solde de congé · 2.21 Saisir une demande de congé

---

## 2.25 Ajuster un solde de congé (reprise de solde)

> **Vidéo V2.24** · durée estimée 4 min (avec la fiche 2.24) · Public : SUPER_ADMIN, ADMIN_RH, GERANT

**Où la trouver** — Ressources Humaines › Temps & présence › Congés › onglet « Ajustements / reprise de solde · التعديلات » (`/rh/conges`).

**À quoi ça sert** — Corriger un solde : reprendre le reliquat d'avant l'application, enregistrer des jours accordés ou retirés.

**Avant de commencer**
- [ ] Vous êtes SUPER_ADMIN, ADMIN_RH ou GERANT.
- [ ] Vous avez le justificatif du nombre de jours (ancien registre, décision).

**Étapes**
1. Choisissez l'« Employé ».
2. Saisissez les « Jours (+ ou −) » : positif pour ajouter, négatif pour retirer (non nul, 400 au plus en valeur absolue).
3. Vérifiez la « Date d'effet » (aujourd'hui par défaut).
4. Saisissez le « Motif » (3 caractères au moins), par exemple « Reliquat 2025 selon registre papier ».
5. Cliquez « Ajouter ».

**Résultat** — L'ajustement apparaît dans le tableau (Employé, Jours, Date, Motif · auteur) et le solde de l'employé est mis à jour dans l'onglet « Soldes ».

**Attention**
- « Saisie des montants réservée à SUPER_ADMIN, ADMIN_RH et GERANT. » : votre rôle ne le permet pas.
- « Nombre de jours non nul », « Valeur hors limites », « Motif requis (3 caractères min.) » : corrigez la saisie.
- Pour corriger une erreur, cliquez « Supprimer » sur la ligne et confirmez « Supprimer l'ajustement de x j ? », puis saisissez le bon ajustement.

**Voir aussi** — 2.24 Consulter les soldes de congé annuel

---

## 2.26 Contrôler et valider les jours proposés par un ordre de mission ou un congé

> **Vidéo V2.26** · durée estimée 5 min · Public : ADMIN_RH, GERANT, CHEF_CHANTIER

**Où la trouver** — Ressources Humaines › Temps & présence › Présence (`/rh/presence`). Depuis un ordre de mission : Ressources Humaines › Documents › Registre › « Ordres de mission » › « Voir le pointage », ou lien « Ouvrir le pointage » après l'enregistrement de l'ordre (la grille s'ouvre en mode Par employé, sur le mois du départ).

**À quoi ça sert** — L'application remplit seule la grille à partir des ordres de mission (code MS) et des congés approuvés (CA, CRP, CM, CSS, AOP). Ces jours sont seulement **proposés** : vous devez les contrôler puis les valider pour que la paie les compte. L'établissement de l'ordre de mission lui-même est décrit au chapitre 4.

**Avant de commencer**
- [ ] Un ordre de mission a été enregistré (chapitre 4) ou un congé approuvé (fiche 2.22).
- [ ] Vous avez le droit de modifier la grille sur ce chantier.

**Comment la grille est remplie automatiquement**
- **Quand** : à chaque création ou modification d'un ordre de mission ou d'un congé (dates, chantier, employé, statut, nature), et chaque nuit. Vous n'avez rien à lancer.
- **Où** : sur le chantier du document (« Affectation » de l'ordre de mission), sinon sur le chantier du contrat principal de l'employé.
- **Quel code** : MS pour un ordre de mission ; pour un congé, le code de sa nature (CA par défaut). Le code doit être actif.
- **Quels jours** :
  - congé : du premier au dernier jour ;
  - ordre de mission avec date de retour : du départ au retour ;
  - ordre de mission sans date de retour : voir la fiche 2.27 ;
  - un ordre de mission s'arrête la veille du document suivant (autre ordre de mission ou congé) de l'employé et ne reprend pas après ;
  - si deux documents se chevauchent, celui qui commence le plus tard l'emporte sur les jours communs.
- **Ce qui n'est jamais écrasé** : une saisie manuelle, une valeur importée des archives, une valeur validée d'un mois dont la paie est validée, et tout mois clôturé.
- **Document modifié ou annulé** : les jours devenus inutiles sont retirés, sauf dans les mois clôturés et sauf les jours validés d'un mois payé et validé.

**Étapes**
1. Ouvrez la grille du chantier, ou cliquez « Voir le pointage » sur l'ordre de mission.
2. Repérez les jours proposés : italique gris, pastille « N proposé(s) OM ». Passez la souris sur une case : « Proposé par l'ordre de mission N° … — non validé » ou « Proposé automatiquement — non validé ».
3. Pour chaque jour proposé :
   - s'il est juste, ne touchez à rien ;
   - s'il est faux, mettez le bon code (le jour devient une saisie manuelle) ;
   - s'il ne doit pas être pointé, effacez-le (il ne sera plus reproposé).
4. Cliquez « Valider » (fiche 2.5).

**Exemple** — Ordre de mission de Samir HADDAD (fictif) du 10 au 14 vers un autre chantier, puis congé annuel approuvé du 15 au 20. La grille propose MS du 10 au 14 et CA du 15 au 20. Le chef de chantier valide : MS compte comme jour de présence et CA comme congé payé (fiche 2.28).

**Résultat** — Les jours validés passent en texte normal (un jour d'ordre de mission validé est souligné) et la paie les prend en compte.

**Attention**
- Tant que vous n'avez pas validé, la paie ignore ces jours : l'employé en mission serait payé comme s'il n'avait pas été pointé.
- Si la paie du mois est déjà validée, un nouvel ordre de mission peut encore ajouter des propositions, mais elles ne pourront être validées qu'après réouverture (décision D7, Réouverture d'une paie).
- « Affectation introuvable : impossible de lier l'ordre au pointage. » à l'enregistrement d'un ordre de mission : choisissez un chantier existant dans « Affectation » (chapitre 4).

**Voir aussi** — 2.5 Valider le pointage du mois · 2.27 Suivre une mission ouverte · 2.22 Approuver, refuser ou annuler une demande de congé · 4 Documents (Ordres de mission)

---

## 2.27 Suivre une mission ouverte (sans date de retour)

> **Vidéo V2.27** · durée estimée 3 min · Public : ADMIN_RH, GERANT

**Où la trouver** — Ressources Humaines › Documents › Registre › « Ordres de mission » › « Nouvel ordre de mission » ou « Modifier » (`/rh/documents`), champ « Date de retour — تاريخ العودة » ; effet visible dans Ressources Humaines › Temps & présence › Présence.

**À quoi ça sert** — Gérer un employé envoyé en mission sans date de fin connue. L'ordre est imprimé avec la mention « Fin de mission » et la grille est alimentée en MS automatiquement, mois après mois, jusqu'à la clôture de la mission.

**Avant de commencer**
- [ ] Vous avez le droit d'établir des ordres de mission (chapitre 4).

**Étapes**
1. Établissez l'ordre de mission en laissant « Date de retour » vide (« Vide = mission ouverte, imprimée « Fin de mission » »).
2. Enregistrez. La grille reçoit des jours MS proposés depuis le départ jusqu'à la fin d'une période de 12 mois (le mois en cours et les 11 suivants).
3. Chaque nuit, cette période avance automatiquement et les nouveaux jours MS sont proposés.
4. Chaque mois, contrôlez et validez les jours MS dans la grille (fiche 2.26).
5. Quand l'employé revient, ouvrez l'ordre de mission avec « Modifier », saisissez la « Date de retour » (postérieure au départ) et enregistrez.

**Résultat** — Après la saisie du retour, les jours MS proposés au-delà de la date de retour sont retirés de la grille (sauf mois clôturés et jours validés d'un mois payé et validé).

**Attention**
- Si un autre document commence pendant la mission (nouvel ordre de mission, congé), la mission ouverte s'arrête la veille de ce document et ne reprend pas ensuite.
- Pour clôturer une mission ouverte, la seule condition est un retour postérieur au départ.

**Voir aussi** — 2.26 Contrôler et valider les jours proposés · 4 Documents (Ordres de mission)

---

## 2.28 Comprendre les codes de présence et leur effet sur la paie

> **Vidéo V2.28** · durée estimée 6 min · Public : tous

**Où la trouver** — Liste des codes : pastille « Légende des codes » de la grille (`/rh/presence`) ; coefficients : Ressources Humaines › Paramètres › « Listes et codes » › « Légendes de présence » (`/rh/parametres`).

**À quoi ça sert** — Chaque code pointé décide de ce que l'employé touchera. Cette fiche explique les trois compteurs que la paie calcule à partir de la grille, avec des exemples.

**Avant de commencer**
- [ ] Ouvrez la « Légende des codes » pour voir les codes actifs dans votre entreprise.

**Les codes livrés avec l'application** (votre administrateur a pu les modifier ou en ajouter)

| Code | Libellé | Coefficient | Famille |
|---|---|---|---|
| P | Présent | 1 | Travaillé |
| P/2 | Demi présent | 0,5 | Travaillé |
| MS | Mission | 1 | Travaillé |
| CRP | Récupération | 1 | Travaillé (récupération) |
| CA | Congé annuel | 1 | Congé |
| CM | Congé maladie | 0 | Congé |
| CSS | Congé sans solde | 0 | Congé |
| AN | Absence injustifiée | 0 | Absence |
| AJ | Absence justifiée | 0 | Absence |
| AOP | Absence autorisée payée | 1 | Absence |
| W | Week-end | 0 | Week-end / férié |
| JF | Jour férié | 1 | Week-end / férié |
| AP | Abandon de poste | 0 | Abandon |

**Les règles à retenir**
1. **Seules les cases validées comptent.** Une case en italique gris est ignorée par la paie. La préparation du mois signale « N présences proposées non validée(s), ignorée(s) par la paie ».
2. **Jours payés = somme des coefficients** des jours pointés. C'est la colonne « Coef » de la grille. Un code à coefficient 1 paie un jour, 0,5 un demi-jour, 0 rien. Les jours payés ne peuvent pas dépasser les jours couverts par le contrat.
3. **Un jour non payé coûte 1/30 du salaire.** Tout jour du contrat sans code, ou pointé avec un code à coefficient 0, est un jour non payé. La part du mois payée vaut : jours du contrat dans le mois ÷ jours du mois − jours non payés ÷ 30 (le diviseur, 30 par défaut, se règle dans les paramètres de paie). Un mois entièrement payé vaut toujours 1, qu'il ait 28, 30 ou 31 jours.
4. **Jours de présence** = jours des codes de la famille « Travaillé » (P, P/2, MS, et tout code marqué « compte comme présence »), selon leur coefficient, hors récupération pleine. Ils servent aux primes payées par jour de présence (panier, par exemple). CA, AOP et JF sont payés mais ne sont pas des jours de présence.
5. **Jours de récupération** : CRP compte 1 jour de récupération ; un code demi-présence / demi-récupération (par exemple P/2-CRP/2, s'il est créé, fiche 2.29) compte 0,5. Les jours de récupération ne sont pas payés par le salaire de base : ils sont payés par les rubriques de salaire de la section « CRP », qui apparaissent sur le bulletin avec la mention « (récupération) » (chapitre 3).
6. **Congé annuel et caisse des congés** : si l'activité du chantier relève de la caisse des congés payés (CACOBATPH), les jours CA sont retirés des jours payés du bulletin, car la caisse les paie.
7. **Heures supplémentaires** : elles ne viennent pas des codes mais des colonnes HS 50 %, HS 75 %, HS 100 % (fiche 2.6).
8. **Coefficient daté** : le coefficient d'un code peut changer à partir d'un mois donné (décision D14, Coefficient d'un code de présence, fiche 2.30). Chaque mois utilise le coefficient en vigueur ce mois-là ; la colonne « Coef » en tient compte.

**Exemples** (mois de 30 jours, contrat couvrant tout le mois, salaire de base fictif de 60 000 DA)

- **Exemple 1 — mois complet** : 20 P + 10 MS. Jours payés = 30 ; jours non payés = 0 ; part payée = 1. Salaire de base : 60 000 DA. Jours de présence : 30.
- **Exemple 2 — absences** : 26 P + 2 P/2 + 2 AN. Jours payés = 26 + 2 × 0,5 + 2 × 0 = 27 ; jours non payés = 30 − 27 = 3 ; part payée = 1 − 3 ÷ 30 = 0,9. Salaire de base : 60 000 × 0,9 = 54 000 DA.
- **Exemple 3 — jours oubliés** : 25 P et 5 cases laissées vides. Jours payés = 25 ; part payée = 1 − 5 ÷ 30 ≈ 0,8333. Salaire de base ≈ 50 000 DA. Une case vide coûte autant qu'une absence : complétez toujours la grille.
- **Exemple 4 — récupération** : 24 P + 6 CRP. Jours payés = 30 ; part payée = 1 ; jours de récupération = 6. Le salaire de base ne paie que la part travaillée : 60 000 × 24 ÷ 30 = 48 000 DA. Les 6 jours CRP sont payés par les rubriques de récupération : par exemple, une rubrique de récupération réglée en montant mensuel de 60 000 DA paie 60 000 × 6 ÷ 30 = 12 000 DA, ligne « … (récupération) ». Total : 60 000 DA. Si aucune rubrique de récupération n'est prévue pour l'employé, les jours CRP ne sont pas payés : vérifiez le paramétrage avec le responsable paie (chapitres 3 et 6).
- **Exemple 5 — congés et absences payées** : 22 P + 4 CA + 2 AOP + 2 CM. Jours payés = 22 + 4 + 2 + 0 = 28 ; part payée = 1 − 2 ÷ 30 ≈ 0,9333 ; salaire de base ≈ 56 000 DA. Jours de présence = 22 seulement : une prime « par jour de présence » est payée sur 22 jours. Les 4 jours CA sont retirés du solde annuel (fiche 2.24) ; si le chantier relève de la caisse des congés, ils sont en plus retirés des jours payés du bulletin.
- **Exemple 6 — contrat commencé en cours de mois** : contrat à partir du 16 d'un mois de 30 jours, 15 P du 16 au 30. Part payée = 15 ÷ 30 − 0 = 0,5. Salaire de base : 30 000 DA.

**Résultat** — Vous savez quel code utiliser selon la situation :

| Situation de l'employé | Code |
|---|---|
| Travaille sur le chantier | P (ou P/2 pour une demi-journée) |
| En mission hors de son chantier | MS (posé par l'ordre de mission) |
| En repos de récupération après une période travaillée | CRP |
| En congé annuel | CA (posé par le congé approuvé) |
| Malade avec arrêt | CM |
| Absent sans justification | AN |
| Absent avec justificatif mais non payé | AJ |
| Absent avec autorisation payée | AOP |
| Jour férié | JF |
| A abandonné son poste | AP |

**Attention**
- Le code W (week-end) a un coefficient 0 : un jour du contrat pointé W n'est pas payé. Utilisez-le selon les consignes de votre service paie.
- Le bulletin ne se recalcule jamais tout seul après une modification de la grille : le brouillon est signalé et le recalcul passe par la décision D3 (Recalcul des paies brouillon).
- Le détail du calcul du bulletin (rubriques, cotisations, IRG) est expliqué au chapitre 3.

**Voir aussi** — 2.29 Créer ou modifier un code de présence · 2.30 Demander le changement d'un coefficient · 3 Paie · Annexe B Le mois de paie pas à pas

---

## 2.29 Créer ou modifier un code de présence

> **Vidéo V2.29** · durée estimée 5 min (avec la fiche 2.30) · Public : SUPER_ADMIN

**Où la trouver** — Ressources Humaines › Paramètres › onglet « Listes et codes » › panneau « Légendes de présence · رموز الحضور » (`/rh/parametres`).

**À quoi ça sert** — Ajouter un code de pointage (par exemple un code de demi-présence et demi-récupération) ou changer le libellé et la couleur d'un code existant.

**Avant de commencer**
- [ ] Vous êtes SUPER_ADMIN.
- [ ] Vous savez quel coefficient donner au nouveau code (fiche 2.28) : il sera difficile à changer ensuite (décision D14).

**Étapes — créer un code**
1. Cliquez « Nouveau code » : le formulaire se vide.
2. Saisissez le code (16 caractères au plus ; il est mis en majuscules), par exemple « P/2-CRP/2 ».
3. Saisissez le libellé FR (obligatoire, 120 caractères au plus), par exemple « Demi présence / demi récupération », et le libellé AR.
4. Saisissez le coefficient avec une virgule décimale (0 à 999,999), par exemple « 1 » (un jour payé : une moitié en travail, une moitié en récupération).
5. Choisissez la couleur.
6. Cliquez « Enregistrer le code ». Message « Légende enregistrée. ».

**Étapes — modifier un code existant**
1. Cliquez sur la pastille du code (« CODE · coef »).
2. Modifiez le libellé FR, le libellé AR ou la couleur. Le coefficient est grisé (infobulle « Coefficient en vigueur ce mois — se modifie par une demande datée (D14) ci-dessous ») : pour le changer, voir la fiche 2.30.
3. Cliquez « Enregistrer le code ».

**Exemple — effet d'un code P/2-CRP/2 de coefficient 1** — Un employé pointé 2 jours en P/2-CRP/2 : 2 jours payés, dont 1 jour de récupération (2 × 0,5) payé par les rubriques de récupération, et 1 jour payé par le salaire de base.

**Résultat** — Le code apparaît dans la liste des pastilles, dans la « Légende des codes » de la grille et dans les boutons de la carte du mois.

**Attention**
- Un nouveau code compte comme jour de présence.
- Si vous retapez un autre code sur un code existant, l'application crée un **nouveau** code ; l'ancien n'est pas renommé.
- « Ce code est déjà utilisé dans le pointage. Il ne peut pas être renommé : enregistrez un nouveau code. » : créez un nouveau code avec « Nouveau code ».
- « Ce code existe déjà. Sélectionnez-le dans la liste pour modifier son coefficient. » : cliquez sur sa pastille.
- « Coefficient : nombre attendu (ex. 0,5). » ou « Coefficient refusé par la base (0 à 999,999). Exemple : 0,5. » : corrigez le coefficient.
- « Enregistrement refusé (droits). » : seul le SUPER_ADMIN peut enregistrer les codes.

**Voir aussi** — 2.28 Comprendre les codes de présence · 2.30 Demander le changement d'un coefficient · 6 Paramètres RH (Listes et codes)

---

## 2.30 Demander le changement d'un coefficient (D14)

> **Vidéo V2.29** · durée estimée 5 min (avec la fiche 2.29) · Public : SUPER_ADMIN (ou rôle autorisé à demander la décision D14)

**Où la trouver** — Ressources Humaines › Paramètres › « Listes et codes » › « Légendes de présence » › clic sur la pastille d'un code › bloc « Changer le coefficient de … (en vigueur ce mois : …) » sous le formulaire (`/rh/parametres`).

**À quoi ça sert** — Changer le poids d'un code à partir d'un mois précis, sans toucher aux mois passés. Le changement ne s'applique qu'après la décision D14 (Coefficient d'un code de présence).

**Avant de commencer**
- [ ] Vous êtes SUPER_ADMIN, ou vous avez le droit de modifier les légendes de présence, ou le droit de créer une demande D14.
- [ ] Le mois d'effet voulu n'a pas de paie validée ou clôturée (ni les mois suivants).

**Étapes**
1. Cliquez sur la pastille du code. Le bloc de demande s'affiche ; il rappelle les changements déjà programmés (« Déjà programmé : … »).
2. Saisissez le « Nouveau coefficient » (obligatoire), par exemple « 0,5 ».
3. Choisissez le « Mois d'effet demandé » (le mois suivant par défaut ; 24 mois au plus dans le futur).
4. Saisissez le « Motif (10 caractères minimum) ».
5. Cliquez « Demander le changement (D14) ».
6. Le décideur ouvre la décision D14 (lien « Ouvrir la décision ») et choisit « Appliquer à partir du mois demandé » ou « Refuser ».

**Exemple** — Le code JF vaut 1. Vous demandez 2 à partir de janvier, avec le motif « Jour férié travaillé payé double selon accord ». Après « Appliquer à partir du mois demandé », un JF de janvier ou des mois suivants compte 2 jours payés ; un JF de décembre compte toujours 1.

**Résultat** — Message « Demande enregistrée : aucun effet tant que la décision D14 n'est pas prise. ». Après application :
- une nouvelle version du coefficient s'applique à partir du mois choisi ;
- les mois antérieurs et les paies validées ou clôturées gardent l'ancien coefficient ;
- les paies brouillon de ce mois et des suivants qui utilisent ce code sont signalées (décision D3), sans recalcul automatique ;
- la préparation du mois affiche « Changement(s) en vigueur à partir de ce mois : CODE ancien → nouveau ».

**Attention**
- Une nouvelle demande pour le même code remplace la demande précédente encore ouverte.
- Messages possibles :
  - « Demande de changement de coefficient non autorisée. » : votre rôle ne le permet pas ;
  - « Coefficient invalide (0 à 999,999, trois décimales au plus). » ;
  - « Le mois d'effet commence le 1er du mois. » ; « Mois d'effet trop lointain (24 mois au plus). » ;
  - « Une paie de ce mois ou d'un mois suivant est déjà validée ou clôturée : le premier mois d'effet possible est MM/AAAA. » : choisissez ce mois ou un mois plus tardif ;
  - « Le coefficient du code … vaut déjà … pour ce mois. » : rien à changer ;
  - « Motif obligatoire (10 à 500 caractères). ».

**Voir aussi** — 2.28 Comprendre les codes de présence · 6 Centre de décisions · Annexe A Décisions

---

## 2.31 Configurer les colonnes et les droits de la feuille de présence

> **Vidéo V2.31** · durée estimée 4 min · Public : SUPER_ADMIN

**Où la trouver** — Ressources Humaines › Paramètres › onglet « Feuille de présence » (`/rh/parametres`). Titre « Feuille de présence — colonnes et droits ».

**À quoi ça sert** — Choisir les colonnes de la grille de présence, leur ordre, leurs libellés, et ce que chaque rôle peut voir ou modifier. Vous pouvez aussi ajouter des colonnes de saisie libres. Aucune colonne financière n'est proposée.

**Avant de commencer**
- [ ] Vous êtes SUPER_ADMIN (sinon : « Réservé à SUPER_ADMIN. »).

**Les colonnes livrées**

| Colonne | Nature |
|---|---|
| N°, MAT, NOM, PRÉNOM, AFFECTATION, Début contrat | Dossier (lecture) |
| POSTE OCCUPE | Dossier, saisissable |
| Jours du mois | Jours (toujours active) |
| Totaux par code | Totaux des codes |
| NJ, Coef | Calcul |
| COMMENTAIRE, VALIDATION | Saisie |
| HS 50 % (h), HS 75 % (h), HS 100 % (h) | Saisie (nombre), système |

**Droits livrés**
- CHEF_CHANTIER : voit tout sauf VALIDATION, Début contrat et Coef ; modifie les jours et COMMENTAIRE.
- ADMIN_RH et GERANT : modifient les jours, POSTE OCCUPE, COMMENTAIRE et VALIDATION.
- Heures supplémentaires : visibles pour ADMIN_RH, GERANT, CHEF_CHANTIER, ADMIN_FINANCE et READ_ONLY ; modifiables par ADMIN_RH, GERANT et CHEF_CHANTIER.
- Autres rôles : lecture seule.
- SUPER_ADMIN : tous les droits, toujours.
- Ces droits s'ajoutent au droit d'accès à la présence sur le chantier (chapitre 6).

**Étapes**
1. Changez l'ordre des colonnes avec ↑ « Monter » et ↓ « Descendre ».
2. Modifiez si besoin le libellé FR et le libellé AR.
3. Cochez ou décochez « Active ».
4. Pour chaque rôle, cochez « Voir » et/ou « Modifier ». « Modifier » coche aussi « Voir » ; il n'est possible que sur les colonnes modifiables (jours du mois, POSTE OCCUPE, colonnes de saisie).
5. Pour ajouter une colonne, dans le bloc « Ajouter une colonne de saisie · إضافة عمود » :
   - saisissez le Code (lettres majuscules, chiffres ou _, 32 caractères au plus ; par exemple HEURES_SUP), le Libellé FR (obligatoire) et le Libellé AR ;
   - choisissez le Type de valeur : Texte, Nombre ou Date ;
   - cliquez « Ajouter » : message « Colonne … ajoutée — enregistrez pour l'appliquer. ». Par défaut, tous les rôles peuvent la voir.
6. Pour supprimer une colonne que vous avez ajoutée, cliquez « Supprimer » et confirmez « Supprimer la colonne … ? Les valeurs saisies ne seront plus affichées. ».
7. Cliquez « Enregistrer ». Message « Colonnes et droits enregistrés. ».

**Résultat** — La grille de présence affiche les colonnes dans le nouvel ordre ; chaque rôle voit et modifie ce que vous avez coché.

**Attention**
- « La grille des jours reste toujours active. » : la colonne Jours du mois ne peut pas être désactivée.
- Le code et le type des colonnes livrées ne se modifient pas ; elles ne se suppriment pas (« Colonne système ou introuvable : suppression refusée. »).
- « Code : lettres majuscules, chiffres ou _ (ex. HEURES_SUP). », « Libellé FR requis. », « Le code … existe déjà. », « Codes de colonne en double. » : corrigez la nouvelle colonne.
- Une colonne ajoutée n'est pas lue par la paie : pour payer des heures supplémentaires, utilisez les colonnes HS 50 %, HS 75 %, HS 100 %.
- Rien n'est appliqué avant « Enregistrer ».

**Voir aussi** — 2.6 Saisir le poste occupé, le commentaire et les heures supplémentaires · 6 Droits et accès
