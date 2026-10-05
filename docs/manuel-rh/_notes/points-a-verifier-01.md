# Points à vérifier — Chapitre 1 Personnel

> Points tenus **hors du manuel** : bugs probables, incohérences, écrans absents, doutes. Source : notes `01-personnel.md` (§8 et mentions [À VÉRIFIER]) et relecture ciblée du code pendant la rédaction.
> Pour chaque point : constat, impact sur le manuel, action proposée. La colonne « Fiche » renvoie au chapitre `chapitres/01-personnel.md`.

## A. Fonctions absentes de l'interface

| # | Constat | Fiche | Impact sur le manuel / action proposée |
|---|---|---|---|
| A1 | Aucun écran ne permet de changer le chantier d'un contrat existant. Le message serveur renvoie à un « onglet Affectations » (changement d'affectation daté) et à la décision D8 (Correction d'une affectation), mais aucun de ces écrans n'est affiché. Le registre applique pourtant au chargement les changements d'affectation datés arrivés à échéance. | 1.13, 1.14, 1.18 | Le manuel dit « adressez-vous à votre administrateur (décision D8) » et présente le nouveau contrat principal (fiche 1.18) comme moyen de changer de chantier. **Faire valider ce contournement par le métier**, ou développer l'onglet Affectations puis réécrire 1.14 et 1.18. |
| A2 | Composants présents dans le code mais affichés nulle part : historique des salaires / avenants, cartes de dérogations Cotisations & impôts (décision D16), champs de salaire détaillés du contrat. Une exception de date de début (décision D13, Contrat ne commençant pas le 1er) existe en base, sans interface. | 1.14, 1.15 | Rien n'est décrit dans le manuel. À trancher : développer ou retirer. D16 n'est pas dans la liste D1–D15 de la charte. |
| A3 | Le message de refus de modification du chantier mentionne un onglet inexistant (voir A1). | 1.14 | Corriger le message ou afficher l'onglet. |

## B. Bugs probables

| # | Constat | Fiche | Impact sur le manuel / action proposée |
|---|---|---|---|
| B1 | Pièce importée sur une fiche jamais enregistrée : elle est seulement « notée » à l'écran ; le fichier n'est pas conservé pour être envoyé après le premier enregistrement. Au deuxième enregistrement, le contrôle « Documents obligatoires manquants » bloque. | 1.3 | Le manuel demande d'enregistrer, fermer, rouvrir puis réimporter. **Corriger le code** (envoyer le fichier après le premier enregistrement) puis simplifier la fiche 1.3. |
| B2 | Les messages parlent d'un « onglet Documents » / « Onglet Documents » qui n'existe pas dans la fiche (c'est le bloc de téléversement en haut). | 1.2, 1.3 | Le manuel l'explique. Corriger le libellé des messages. |
| B3 | Après validation d'une sortie, la situation d'emploi passe à « sorti » mais le « Statut » de la fiche reste inchangé : un salarié sorti peut rester « Actif » dans la liste Employés et dans le filtre « Actifs seulement ». | 1.6, 1.27 | Le manuel conseille de désactiver aussi l'employé. **À confirmer en test** ; idéalement, aligner le statut de fiche lors de la validation. |
| B4 | L'annulation d'une sortie validée ne rouvre pas les contrats clôturés (le message le dit). Risque d'employé sans contrat. | 1.28 | Documenté (étape manuelle). Envisager une réouverture automatique. |
| B5 | Les boutons « Certificat de travail » et « Solde de tout compte » sont visibles pour tout utilisateur qui voit l'écran Sorties ; les droits d'émission des courriers ne sont pas vérifiés dans ce composant. | 1.29 | Le manuel indique le public SUPER_ADMIN, ADMIN_RH, GERANT. Vérifier le contrôle côté serveur. |
| B6 | « Activer » sur un employé Suspendu ou Désactivé le remet directement Actif, sans confirmation. « Désactiver » est aussi immédiat, sans confirmation. | 1.6 | Documenté tel quel. Une confirmation serait prudente. |
| B7 | Photo choisie sur une fiche non enregistrée : le fichier est envoyé avec un identifiant provisoire (« draft ») ; si la fiche n'est jamais enregistrée, le fichier reste orphelin. Le lien de la photo n'est conservé qu'au clic sur « Enregistrer » (déduit du code). | 1.3 | Le manuel demande d'enregistrer après la photo. À confirmer en test. |
| B8 | Validation d'une sortie : le sort des contrats non clôturés qui **commencent après** la date de sortie n'est pas décrit (seuls les contrats en cours ou déjà terminés à cette date sont traités). | 1.27 | À tester ; compléter la fiche si besoin. |

## C. Incohérences d'affichage et de libellés

| # | Constat | Fiche | Impact sur le manuel / action proposée |
|---|---|---|---|
| C1 | La liste « Statut » de la fiche affiche les codes bruts « ACTIVE », « INACTIVE », « SUSPENDED », « DISABLED » (confirmé dans le code), alors que la liste Employés affiche Actif, Inactif, Suspendu, Désactivé. | 1.2 | Le manuel cite les codes avec leur traduction. Traduire les options de la liste. |
| C2 | La colonne « Type » du registre des contrats affiche le code (ex. CDD_CHANTIER) et non le libellé. | 1.13 | Documenté. Afficher le libellé. |
| C3 | L'avertissement « Champs vides : … » de la fenêtre d'impression du contrat peut afficher des noms techniques (birth_date, id_number, poste, net). | 1.19 | Non cité dans le manuel. Traduire ces noms. |
| C4 | Classe 5 : le sélecteur de rubriques l'appelle « RETENUE DE GARANTIE », le reste de l'application « Retenues ». Le champ valeur porte l'info-bulle « Montant positif, déduit du net sur le bulletin », alors que le message d'erreur dit « Montant négatif accepté seulement en classe 5 (retenues) ». Convention de signe ambiguë (positif ou négatif ?). Les éléments de sortie utilisent la convention inverse (« Montant négatif = retenue »). | 1.16, 1.26 | Le manuel suit l'info-bulle (saisir en positif). **Clarifier la règle** et harmoniser libellés et messages. |
| C5 | IRG « Handicapé / retraité » : libellé « Handicapé / retraité : barème…, lissage… » dans la fiche contrat, mais « Handicapé / retraité (lissage étendu) » dans les cartes de dérogation (non affichées). L'option automatique change de libellé selon le contexte (« Automatique : barème… » ou « Automatique (zone du chantier) : … »). | 1.15 | Le manuel ne cite que le début des libellés (« Automatique », « Handicapé / retraité »). OK. |
| C6 | Le mode « Journalier présence » existe dans les paramètres des rubriques mais n'est pas proposé dans la fiche contrat (4 modes seulement). Comportement à vérifier pour une rubrique paramétrée dans ce mode puis ajoutée à un contrat. | 1.16 | Non décrit dans le manuel. À tester. |
| C7 | Dans la fiche, « Date de déclaration » et « CCP / RIP » ont le même numéro d'ordre : leur ordre d'affichage peut varier. | 1.2 | Le manuel les liste dans un ordre plausible. Corriger l'ordre en paramétrage. |
| C8 | « Nombre d'enfants » apparaît pour les situations codées M, D, V. Libellés exacts de ces codes (marié, divorcé, veuf ?) non vérifiés à l'écran. | 1.2 | Le manuel écrit « marié(e), divorcé(e) ou veuf(ve) ». À confirmer. |

## D. Paramétrage pouvant différer en production

| # | Constat | Fiche | Action proposée |
|---|---|---|---|
| D1 | Libellés, ordre, caractère obligatoire et affichage des champs de la fiche employé, types de document (et lesquels sont obligatoires ou lus automatiquement), types de contrat, régimes de travail et rubriques sont paramétrés en base. Le manuel décrit la configuration issue des migrations. | 1.2, 1.3, 1.14, 1.16 | Relever la configuration de production avant de figer le manuel et les vidéos. |
| D2 | Champs masqués par les migrations : mode de paiement, clé de compte, diplôme en arabe, wilaya de naissance, lieu de naissance en arabe, adresse en arabe, catégorie IRG, **profil social**. | 1.2, 1.15, 1.19 | Le régime CNAS « Automatique (fiche employé) » s'appuie sur le profil social de l'employé, masqué dans la fiche : il prend donc probablement toujours le régime par défaut. De même, l'impression du contrat recommande de compléter les champs arabes « dans la fiche employé », alors que lieu de naissance et adresse en arabe sont masqués. **À vérifier.** |
| D3 | Option IRG « Taux libératoire » proposée seulement si le type de contrat l'autorise ; l'endroit où l'on autorise cette option (paramètres des types de contrat) n'est pas décrit au chapitre 1. | 1.15 | Vérifier qu'il est traité au chapitre 6. |
| D4 | Modèle de contrat par défaut : bloc employeur « Hassi Messaoud » ; en-tête des courriers de sortie « E.U.R.L. NEDJM FROID », lieu Hassi Messaoud, écrits en dur. | 1.20, 1.29 | Confirmer l'exactitude des mentions légales de l'employeur. |

## E. Droits

| # | Constat | Fiche | Action proposée |
|---|---|---|---|
| E1 | La correspondance entre rôles et permissions « Employés » / « Contrats » / « Cotisations & impôts » est définie dans la matrice des permissions en base, pas dans le code des écrans. Le manuel écrit donc « ADMIN_RH et comptes autorisés sur les employés » ou « … sur les contrats ». | 1.1–1.8, 1.13–1.15, 1.18, 1.19, 1.21, 1.22 | Relever la matrice réelle et préciser la colonne « Public ». |
| E2 | Rôles autorisés à modifier les colonnes de la base employés (1.7) et à importer l'ancienne base (1.8) : non lisibles dans le code. | 1.7, 1.8 | Idem E1. |
| E3 | Impression d'un relevé d'intérim : bouton visible pour tout utilisateur qui voit l'écran (dont ADMIN_FINANCE) ; rapprochement et annulation réservés aux rôles RH salaires (déduit du code). | 1.25 | Confirmer. |

## F. Comportements non confirmés

| # | Constat | Fiche | Action proposée |
|---|---|---|---|
| F1 | L'import de l'ancienne base ne génère pas la fiche de renseignements PDF. | 1.8 | Le manuel l'indique. Confirmer qu'elle est bien créée au premier enregistrement manuel. |
| F2 | L'import de contrats ne crée aucune rubrique de salaire et laisse le régime CNAS « Automatique ». | 1.22 | Le manuel demande de compléter chaque contrat. Confirmer. |
| F3 | Le calcul du solde de sortie dans la paie (lignes « sortie », retenue du reste des avances) relève du module Paie et n'a pas été vérifié. | 1.26, 1.27 | Vérifier lors de la rédaction du chapitre 3. |
| F4 | Intérim : le champ « Année » ne recharge l'écran qu'à la sortie du champ. Le coefficient de présence vient de la légende de pointage (chapitre 2). | 1.24 | Documenté brièvement. |
| F5 | Courriers de sortie : chaque clic sur « Enregistrer et imprimer » crée-t-il un nouveau numéro au registre (réimpression = nouveau document) ? Les mises en demeure peuvent-elles être émises avant l'enregistrement du brouillon de sortie ? | 1.29 | Tester ; ajuster la mise en garde de la fiche. |
| F6 | Modèle de contrat : comportement d'une variable mal orthographiée (laissée telle quelle à l'impression ?). | 1.20 | Tester. |
| F7 | « Net récupération » (fiche contrat) et « Indemnité récupération » (impression) : lien éventuel avec les rubriques de récupération (CRP) non établi. | 1.15, 1.17, 1.19 | Clarifier avec le métier pour l'expliquer dans le manuel. |
| F8 | Liens exacts des alertes du tableau de bord RH (« Fin de contrat », « Contrats à finaliser », « Employés sans contrat ») vers le registre des contrats : filtre éventuel non vérifié. | 1.13 | À décrire au chapitre 0. |
| F9 | Écran Sorties limité aux 500 sorties les plus récentes, sans pagination au-delà. | 1.0 | Acceptable à court terme ; à surveiller. |
| F10 | La recherche globale ne propose pas les contrats (seulement Employés, Postes & grille, Intérim, Sorties). | 1.0 | Information ; ajout possible. |
