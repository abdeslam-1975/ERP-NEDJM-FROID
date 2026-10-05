# Points à vérifier dans l'application (relevés pendant la rédaction du manuel)

Ces points ne figurent pas dans le manuel : écrans non développés, incohérences, doutes à confirmer en recette.


---

# Points à vérifier — chapitre 0, annexes B, C, D et vidéos V0.1 à V0.9

Points relevés pendant la rédaction. Ils ne figurent pas dans le manuel ; à lever avant publication.

## Renvois entre chapitres
1. **Titres des fiches des autres chapitres** : les renvois (chapitre 0, annexes B et D) citent des titres provisoires du type « chapitre 2, fiche « Valider le pointage du mois » ». Les titres et numéros définitifs écrits par les autres rédacteurs doivent être reportés. Titres utilisés : ch. 1 « Créer un employé », « Créer un contrat de travail », « Enregistrer une sortie », « Valider une sortie » ; ch. 2 « Consulter la grille de présence », « Saisir le pointage dans la grille », « Valider le pointage du mois », « Saisir une demande de congé », « Approuver ou refuser une demande de congé », « Établir un ordre de mission », « Déposer un fichier d'archives de présence », « Importer les présences acceptées », « Valider les présences importées » ; ch. 3 « Préparer le mois », « Demander la génération de la paie », « Décider une génération ou un recalcul », « Contrôler et imprimer les bulletins », « Consulter la traçabilité d'un bulletin », « Recalculer un bulletin », « Utiliser le simulateur », « Valider la paie », « Demander la décision D6 », « Préparer un lot de virements », « Demander la décision D9 », « Enregistrer une opération externe », « Produire les déclarations », « Consulter le registre des déclarations », « Demander la décision D10 », « Clôturer le mois », « Demander la réouverture d'une paie (D7) », « Saisir une rubrique exceptionnelle », « Approuver une exception », « Enregistrer une avance ou un prêt », « Consulter les coûts de la paie » ; ch. 4 « Établir un titre de congé », « Établir une attestation ou un courrier » ; ch. 5 « Proposer une nouvelle valeur », « Choisir la date d'application (décision D2) » ; ch. 6 « Décider au Centre de décisions ».
2. **Ordres de mission** : le charte les place à la fois au chapitre 2 (ordres de mission) et au chapitre 4 (registre OM). Décider quel chapitre porte la fiche de création pour aligner les renvois.

## Connexion et navigation
3. **Double authentification** : les rôles SUPER_ADMIN, ADMIN_RH, ADMIN_FINANCE et GERANT portent l'option « MFA » (« Double authentification exigée »), mais aucune étape de double authentification n'a été trouvée dans le parcours de connexion. Vérifier si elle est réellement demandée ; sinon, ne pas la mentionner (le manuel n'en parle pas).
4. **Messages de connexion techniques** visibles par l'utilisateur : « Compte Auth trouvé, mais aucun profil sys_users. Exécutez le bootstrap SUPER_ADMIN. » et « Profil ERP inaccessible: … ». Non repris dans le manuel ; suggérer une reformulation aux développeurs.
5. **« Site actif »** : l'effet exact du chantier choisi sur les écrans RH (filtrage des listes, du tableau de bord, de la grille) n'a pas été vérifié. Le manuel se limite à dire de choisir son chantier et de le vérifier en cas de refus d'accès.
6. **Section vide** : le code indique qu'une section de la barre RH ne s'affiche que si l'un de ses onglets est visible, alors que les notes disent la section « Autres » toujours présente. Vérifier à l'écran le comportement d'une section d'origine vidée par « Réorganiser » (affichée vide avec l'infobulle, ou masquée).
7. **Message technique de « Réorganiser »** : si l'enregistrement personnel n'est pas installé en base, l'utilisateur voit « Les onglets personnels ne sont pas encore installés : appliquez la migration … (ou enregistrez « Pour tout le monde ») ». Vérifier que l'installation de production ne déclenche pas ce message.
8. **« Pour tout le monde »** : confirmé dans le code comme réservé au SUPER_ADMIN (portée « Pour moi » seule pour les autres). Point 6 des notes 04 levé.
9. **Le libellé « Nouvel onglet »** crée en réalité une section de la barre (première rangée). Le manuel l'explique ; suggérer aux développeurs « Nouvelle section ».

## Tableau de bord RH
10. **Périmètre des chiffres** : les cartes portent sur les données visibles avec les droits de l'utilisateur. Pour un CHEF_CHANTIER (sans droit sur les contrats par défaut), « Masse salariale », « Couverture contractuelle », « Évolution des effectifs » et « Répartition des contrats » seraient vides ou nulles. À vérifier à l'écran ; envisager de masquer ces cartes pour ce rôle.
11. **Pastille de variation de l'« Effectif actif »** : elle compare l'effectif actif d'aujourd'hui aux employés actifs déjà recrutés à la fin du mois précédent (sur la date de recrutement), pas à l'effectif réel du mois précédent. Un départ du mois en cours ne la fait pas baisser. Le manuel décrit le calcul réel ; signaler l'écart aux développeurs.
12. **Masse salariale** : ne compte que les contrats au statut Actif, alors que la couverture et les contrats ouverts comptent aussi Brouillon et Suspendu. Le manuel le précise ; à confirmer comme voulu.
13. **Présence** : les cartes comptent aussi les jours proposés non validés et ne sont pas filtrées par chantier (comme les indicateurs de la page Présence, voir notes 02 point 5). Le pourcentage ignore les codes non classés (week-end, jour férié). La carte affiche « N présents » en additionnant présents et missions.
14. **Répartition des contrats** : un type de contrat absent du catalogue s'affiche avec son code brut (par exemple « CDD_CHANTIER ») ; seul un contrat sans type s'affiche « Non renseigné ».

## Qualité des données
15. **Droit exact pour confirmer une wilaya** : contrôlé par une fonction en base, non lisible dans le code de l'écran. Le manuel indique « droit de modifier les chantiers » ; à confirmer. Les messages d'erreur de cette action sont renvoyés tels quels par la base (texte à relever en recette).
16. **Paie brouillon signalée après confirmation de wilaya** : le manuel indique qu'une décision D3 est ouverte, conformément au principe général de signalement ; à confirmer en recette pour cette source.

## Rôles et droits
17. **Droits par défaut** : le tableau de la fiche 0.9 est établi à partir des migrations initiales (droits RH de base pour les six rôles, puis retrait des écrans contenant des montants pour CHEF_CHANTIER) et des contrôles de rôle du code. Vérifier la matrice réelle de production avant publication.
18. **READ_ONLY** : par défaut il lit les écrans de paie, de bulletins et de paramètres RH, donc les montants des salaires. À confirmer comme voulu.
19. **Journal d'audit** : un ADMIN_RH peut ouvrir la page mais n'aurait pas, par défaut, le droit de lire les lignes (notes 05, partie E point 6). Le manuel n'en parle pas au chapitre 0.
20. **Message « Accès refusé à l'écran Employés (RBAC). »** : contient un terme technique ; repris tel quel en annexe D (texte exact), suggérer une reformulation.
21. **Saisie d'un congé** : le droit exact (modification « Présence » ou rôle de saisie des montants) reste à vérifier (notes 02, 4.1). L'annexe B attribue la saisie à l'ADMIN_RH.

## Annexe B — cycle mensuel
22. **Ordre virements / déclarations / clôture** : l'application n'impose pas d'ordre entre virements, déclarations et clôture (la clôture exige seulement une paie validée). L'ordre proposé (validation → virements → déclarations → clôture) est une recommandation à valider avec le service RH. Rappel : un lot de virement généré ou déposé empêche la réouverture D7.
23. **Demande D4 automatique** : à la validation d'un pointage sans paie, une demande D4 est ouverte ; vérifier qu'elle n'entre pas en doublon avec celle demandée depuis la préparation (dédoublonnage par sujet annoncé dans les notes 05, C.5).
24. **Dates légales de dépôt** des déclarations (G50, CNAS) : non précisées dans les notes, donc non écrites dans le manuel. À ajouter si le service RH le souhaite.
25. **Avances** : écart classe 4 (texte de l'écran) / classe 5 (calcul) signalé dans les notes 03 ; le glossaire évite de citer la classe des avances.

## Glossaire et vidéos
26. **Termes arabes** : à faire relire par un locuteur arabophone du métier RH, en particulier la dénomination officielle de la CACOBATPH, « G50 », « DAS », « mois de reprise » (شهر استرجاع البيانات), « rappel » (استدراك) et « SUPER_ADMIN » (المدير العام للنظام).
27. **Vidéo V0.7** : la séquence suppose une base de démonstration contenant des contrats repris d'un ancien import qui ne commencent pas le 1er (la saisie normale le refuse). Préparer ce jeu de données avant le tournage.
28. **Fenêtre « Des modifications non validées seront perdues. Continuer ? »** : fenêtre de confirmation du navigateur ; les libellés des boutons dépendent du navigateur. L'annexe D ne cite donc pas les boutons entre « ».

---

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

---

# Points à vérifier — Chapitre 2 Temps & présence

Points relevés pendant la rédaction du chapitre 2 et de ses vidéos. Ils ne figurent pas dans le manuel. Pour chacun : constat, impact pour l'utilisateur, ce qu'il faut confirmer ou corriger. Sources : notes « 02-temps-presence », relecture ponctuelle du code (calcul de la paie, codes de présence, soldes de congé) et des migrations.

## A. Comportements à confirmer ou à corriger (bugs / incohérences)

1. **Écran « Légendes de présence » du menu Paramètres non développé** — L'entrée Paramètres › « Légendes de présence » (`/referentiels/legendes`) ouvre un écran d'attente. La gestion réelle est dans Paramètres RH › Listes et codes. La page d'une décision D14 renvoie aussi vers cet écran d'attente (lien « Ouvrir les codes de présence »). Le manuel ne cite que le bon chemin. À corriger : rediriger ou masquer l'entrée et le lien.
2. **Pastille « N proposé(s) OM »** — Elle compte aussi les jours proposés par un congé approuvé (origine automatique). Le manuel la décrit comme « jours proposés automatiquement, par un ordre de mission ou par un congé approuvé ». Suggestion : renommer la pastille (« N proposé(s) ») ou séparer OM et congés.
3. **Ligne « Total » de la grille** — Le total par jour compte le code MS lorsqu'il est actif (code de totalisation), pas P. Un chantier où personne n'est en mission affiche donc 0 par jour. Le manuel décrit ce comportement sans le commenter. À confirmer : est-ce voulu ? Sinon, compter les codes « compte comme présence ».
4. **Indicateurs de la page Présence** — Les quatre cartes comptent les présences proposées comme validées et ne suivent pas le chantier choisi dans la grille (seulement un paramètre d'adresse). À confirmer ou corriger.
5. **Bouton « Annuler » d'une demande de congé** — Il est affiché pour un non-décideur sur toutes les demandes en attente, y compris celles des autres ; le refus vient ensuite du serveur. Le manuel dit seulement « vous ne pouvez annuler que vos propres demandes en attente ». À corriger : masquer le bouton.
6. **Pas d'annulation d'ordre de mission** — Aucun bouton d'annulation d'OM n'a été trouvé. Pour retirer des jours MS proposés par erreur, la seule voie visible est de modifier l'OM ou d'effacer les jours dans la grille. À confirmer : comment annuler un OM ? Le manuel n'en parle pas.
7. **Numérotation commune** — Un seul compteur annuel pour tous les documents RH numérotés (OM, titres de congé, lettres). Les numéros d'OM ou de titres ne se suivent donc pas. À confirmer avec le métier (exigence de séquence par type de document ?).
8. **« Imprimer / archiver le mois »** — Simple impression du navigateur ; aucun archivage côté application. Le manuel indique d'enregistrer le PDF soi-même. Si un archivage serveur est attendu, il manque.
9. **Enregistrement d'un code depuis Listes et codes et effet AN** — À chaque « Enregistrer le code », l'indicateur « déclenche AN » (pass-through) est envoyé à faux et le code est réactivé. Modifier le libellé ou la couleur du code AN depuis cet écran supprimerait son effet. L'effet « pass-through AN » n'est pas utilisé dans le module RH (il concerne les ajustements commerciaux). Le manuel n'en parle pas. À corriger avant publication.
10. **« Compte comme présence » non réglable** — Un nouveau code compte toujours comme présence, sans case pour le changer. Un code d'absence créé par un utilisateur (par exemple « Absence formation ») serait classé « travaillé » si son libellé ne contient pas « absence », « congé », etc. Le classement par la paie se fait en partie sur le libellé (mots « absence », « congé », « abandon », « week-end », « férié »). À confirmer et, si besoin, ajouter la case dans le formulaire.
11. **Écriture des légendes réservée au SUPER_ADMIN** — Un ADMIN_RH peut remplir le formulaire mais l'enregistrement est refusé (« Enregistrement refusé (droits). »). Le manuel indique « Public : SUPER_ADMIN ». À vérifier : message exact, et faut-il masquer le bouton aux autres rôles ?

## B. Règles de paie à confirmer (impact direct sur les bulletins)

12. **Code W (week-end) à coefficient 0** — Avec la formule actuelle (part payée = jours couverts ÷ jours du mois − jours non payés ÷ 30), un jour du contrat pointé W, ou laissé vide, est déduit du salaire. Si les chantiers pointent W les vendredis et samedis, les salariés mensuels perdraient 8 à 9 jours par mois. Le manuel l'explique (« un jour pointé W n'est pas payé ») et renvoie aux consignes du service paie. À confirmer d'urgence : coefficient de W en production, et pratique réelle de pointage des week-ends (rotation ? P tous les jours ?).
13. **Jours CRP sans rubrique de récupération** — Le salaire de base ne paie que la part travaillée ((payés − CRP) ÷ payés). Les jours CRP ne sont payés que par les rubriques affectées en portée « CRP ». Sans rubrique de récupération affectée, les jours CRP ne sont pas payés du tout. Le manuel le signale. À confirmer : existe-t-il une rubrique de récupération par défaut ? Quel est le paramétrage de production ?
14. **Code P/2-CRP/2 non livré** — Le moteur sait traiter tout code contenant « CRP/2 » (0,5 jour de récupération), mais ce code n'existe pas par défaut. Le manuel propose de le créer avec le coefficient 1 (exemple). À confirmer : coefficient attendu par le métier (1 ou 0,5 ?) et libellé officiel.
15. **Jours de présence et demi-codes** — Pour un code demi-présence / demi-récupération, la part « récupération » n'est pas retirée des jours de présence (seule une récupération pleine, CRP, l'est). Une prime « par jour de présence » serait donc payée sur le jour entier. À confirmer.
16. **Arrondi de la part payée** — La part payée est arrondie à 4 décimales (exemple : 0,8333 au lieu de 5/6), ce qui donne 49 998 DA au lieu de 50 000 DA dans l'exemple 3 du manuel (affiché « ≈ 50 000 DA »). À confirmer que cet écart est accepté.
17. **Solde de congé : congés « commencés à la date du jour »** — Les notes parlent de congés annuels approuvés « commencés à la date du jour », mais le calcul relu retire tous les congés annuels approuvés. Le manuel écrit « congés annuels approuvés ». À confirmer sur l'écran.

## C. Droits et paramétrage à confirmer en production

18. **Droits réels** — Les droits par défaut (imports réservés au SUPER_ADMIN, colonnes par rôle, onglets visibles, droit de saisir une demande de congé, droit d'établir un OM) viennent des migrations. Ils peuvent avoir été modifiés. Le manuel donne les valeurs livrées. À confirmer avant publication, en particulier : qui peut saisir une demande de congé (CHEF_CHANTIER ?), qui importe et qui valide les archives.
19. **Bornes des heures supplémentaires dans la grille** — L'import rapide limite à 0–300 h ; les bornes de saisie directe dans les colonnes HS de la grille n'ont pas été vérifiées. Le manuel ne donne pas de borne pour la saisie directe.
20. **Limite de 4 000 cases par validation** — Un chantier de plus de 129 employés sur un mois de 31 jours dépasse la limite. Message affiché non vérifié ; aucun contournement documenté. À tester.
21. **Libellés des colonnes livrées** — Les libellés FR de NOM, PRÉNOM, AFFECTATION, NJ, COMMENTAIRE, VALIDATION ont été déduits du code, non relus dans la migration. À confirmer à l'écran.
22. **Libellés d'onglets personnalisables** — Les onglets et sections peuvent avoir été renommés par le SUPER_ADMIN ; le manuel utilise les libellés d'origine.
23. **Tâche nocturne de prolongation des missions** — Elle exige un secret serveur configuré. Si ce secret manque, les missions ouvertes ne sont plus prolongées, sans alerte visible pour l'utilisateur. À vérifier sur le serveur de production.

## D. Renvois entre chapitres à harmoniser

24. **Numéros des fiches du chapitre 4** — Le chapitre 2 renvoie à « 4 Documents (Ordres de mission) » et « 4 Documents (Titres de congé) » sans numéro de fiche, faute de numérotation définitive du chapitre 4. À remplacer par les numéros 4.x une fois le chapitre 4 rédigé.
25. **Chapitres 3 et 6** — Renvois génériques vers « 3 Paie » (préparation du mois, calcul, rubriques de récupération, paramètres d'heures mensuelles et de diviseur) et « 6 Paramètres RH / Centre de décisions / Droits ». À numéroter après rédaction de ces chapitres.
26. **Doublon possible avec le chapitre 6** — Les fiches 2.29 (codes de présence), 2.30 (D14) et 2.31 (feuille de présence) recouvrent la partie « Listes et codes » et « Feuille de présence » du chapitre 6. Décider où garder la fiche complète et où ne laisser qu'un renvoi.

---

# Points à vérifier — Chapitre 3 Paie

> Points relevés pendant la rédaction du chapitre 3 (manuel `chapitres/03-paie.md` et scripts `videos/03-paie.md`). Ils ne figurent pas dans le manuel. Sources : notes `_notes/03-paie.md` et lecture du code (lecture seule).

## A. Incohérences entre l'écran et le calcul

1. **Avances : classe 4 ou classe 5 ?** L'alerte de l'écran « Avances & prêts » dit « classe 4, hors cotisations et IRG », alors que le calcul crée les lignes « Retenue avance » / « Remboursement prêt » en classe 5 (retenues). Le manuel (3.16) évite de citer la classe et dit « ni cotisable ni imposable, retenue après l'IRG ». Corriger le texte de l'écran ou le calcul.
2. **Jours de récupération et salaire de base.** Dans la fiche contrat, le bloc « Rubriques de récupération (CRP) » indique « Le salaire de base reste dû » et, quand la liste est vide, « Aucune rubrique de récupération : les jours CRP ne reçoivent que le salaire de base. » Or le calcul **exclut** les jours CRP du salaire de base (base × jours payés hors récupération ÷ jours payés). Le manuel (3.6) suit le calcul et la consigne de rédaction. Corriger les textes de la fiche contrat (ou le calcul, si l'intention est autre). Conséquence actuelle : un salarié dont le contrat n'a aucune rubrique de récupération n'est pas payé pour ses jours CRP.
3. **« Montant /F » : vraiment fixe ?** L'aide de saisie des rubriques dit « une seule fois par mois (Nbr = 1), quel que soit le nombre de jours ». Le calcul multiplie le montant par la part du mois payée : il est donc réduit en cas d'entrée ou de sortie en cours de mois et en cas de jours non payés (1/30 par jour). Il n'est pas réduit par les jours CRP. Aligner le texte d'aide.
4. **Ligne SALAIRE DE BASE imprimée : Nbr × Taux ≠ montant dans certains cas.** Le bulletin imprime Nbr = jours payés hors récupération et Taux = base ÷ jours du mois. Le montant, lui, retire 1/30 (diviseur légal) par jour non payé. Exemple : mois de 31 jours, 1 jour non payé, base 45 000 → montant 45 000 × (1 − 1/30) = 43 501,50 ; affichage 30 × 45 000 ÷ 31 = 43 548,39. Même écart pour un contrat commencé en cours de mois avec absences. Vérifier l'affichage ou la règle.
5. **Rubriques « Pourcentage *% »** : calculées sur le salaire mensuel du contrat × part du mois payée, sans tenir compte des jours CRP (la ligne SALAIRE DE BASE, elle, les exclut). Confirmer que c'est voulu (le manuel 3.6 le présente ainsi).
6. **« Journalier *J »** : la quantité est celle des jours **payés** hors récupération (repos hebdomadaires et congés payés compris), pas des jours de présence. L'aide de saisie le dit (« jours payés du mois, récupération exclue »). Confirmer avec le métier que c'est bien l'intention pour les primes journalières (le mode « Journalier présence » existe pour les jours travaillés).
7. **Exceptions et jours CRP.** Les rubriques exceptionnelles en « Journalier *J » utilisent tous les jours payés, **récupération comprise**, alors que les rubriques permanentes les excluent. Une retenue exceptionnelle de classe 5 en « Montant /F » est appliquée × part du mois payée, sans prorata des jours travaillés (contrairement aux retenues permanentes de classe 5). Confirmer ou harmoniser. Le manuel (3.6, étape 7) décrit le comportement actuel.
8. **Nature « Remboursement »** : aucune règle propre dans le calcul ; elle se comporte exactement comme une indemnité (gain positif). Son caractère cotisable / imposable dépend uniquement de la classe choisie. Confirmer que c'est voulu (souvent un remboursement de frais n'est ni cotisable ni imposable : il faut alors le ranger en classe 4).
9. **Avances : colonne « Retenu ».** Elle additionne les retenues de toutes les paies, **y compris les brouillons**. Un brouillon recalculé ou abandonné peut fausser le « Reste » affiché. Vérifier.

## B. Comportements à confirmer avant l'enregistrement des vidéos

10. **Recalcul depuis Documents › Bulletins de paie.** « Recalculer » et « Recalculer et afficher » ouvrent une décision D3 sur la paie du chantier du bulletin : c'est **toute la paie du chantier pour le mois** qui est recalculée, pas seulement le bulletin. Le manuel (3.13) le précise. Confirmer que c'est l'intention, car le libellé « Recalculer ce bulletin brouillon… » laisse penser à un recalcul individuel.
11. **Message affiché aux non-SUPER_ADMIN dans la fenêtre de décision des bulletins.** Le texte « Vous êtes à l'origine de la demande : un autre décideur doit la trancher… » s'affiche à **tout** utilisateur non SUPER_ADMIN, même s'il n'est pas l'auteur de la demande (la décision directe n'est ouverte qu'au SUPER_ADMIN). Reformuler.
12. **Décision directe pour D1 dans « Nouveau bulletin de paie ».** Jamais possible, même pour le SUPER_ADMIN : vérifier que l'encadré D1 oriente bien vers le Centre de décisions.
13. **Paie « toute l'entreprise ».** « Nouveau bulletin de paie » crée une paie sans chantier si aucune paie par chantier n'existe. Vérifier que le sélecteur « Chantier » de l'écran Paie permet de voir, valider et clôturer cette paie (option dédiée ?).
14. **Barème IRG de l'exemple (fiche 3.6).** L'exemple suppose : 0 % jusqu'à 240 000 DA/an, 23 % jusqu'à 480 000, 27 % jusqu'à 960 000, abattement 40 % borné à 1 000–1 500 DA/mois, pas de lissage au-delà de 35 000 DA. Vérifier que le barème paramétré dans l'application est celui-ci avant de tourner la vidéo V3.6 ; sinon adapter les chiffres (IRG 5 002,69 ; net 43 444,31 ; net à payer 38 444,31).
15. **Coefficient des jours de repos hebdomadaire.** L'exemple suppose que les jours de repos ont un coefficient 1 (comptés comme payés). Si un code de repos a un coefficient 0, le calcul les traite comme des jours non payés (− 1/30 chacun). Vérifier le paramétrage des légendes de présence.
16. **Taux CNAS de l'exemple** : 9 % salarié, 25 % + 0,5 % FOS employeur. Vérifier les variables légales en vigueur.
17. **Vues « Social » et « Fiscal »** : certaines données (demandes de génération, archives PDF) ne semblent pas transmises ; comportement du chip « Génération demandée » et du bouton « PDF archivé » dans ces vues à vérifier.
18. **Droits exacts** sur les virements (dépôt, exécution, annulation du dépôt, annulation du lot) et séparation des tâches des opérations externes (saisie / confirmation / examen) : à confirmer à l'écran.
19. **Libellés tronqués dans les notes** (« … ») à recopier à l'écran lors des captures : message D9 « Certains bulletins de la décision D9 ne peuvent plus être virés… », confirmation de l'état de rapprochement, avertissement « N fichier(s) officiel(s) déjà produit(s)… double déclaration », texte complet du bandeau « Paie de reprise ».
20. **« Annuler le dépôt »** : effet exact (retour au statut « Généré » ?) non documenté dans les notes.
21. **« Retenue mensuelle » d'un prêt** : vérifier si le champ vide est accepté pour un prêt (le texte d'aide « = montant (1 mois) » n'est cité que pour l'avance).
22. **Archive PDF à la validation** : si « Archive PDF non créée : … » apparaît, vérifier qu'aucune autre action n'est nécessaire (le manuel indique que l'archive est complétée à la clôture).

## C. Hors périmètre du chapitre 3 (à traiter ailleurs)

23. **Arabe à l'écran** : les libellés d'action ne s'affichent qu'en français ; seuls certains contenus sont en arabe (paragraphe de l'écran Paie, libellés arabes des rubriques, bulletin imprimé). Vérifier lors des captures.
24. **« Éditer la mise en page »** du simulateur (éditeur du modèle de bulletin) : non étudié, à documenter au chapitre 6.
25. **Formats des fichiers CCP, banque, CNAS, DAS** : décrits d'après le code, présentés comme « format générique » ; à faire valider par la banque, Algérie Poste et la CNAS.
26. **Barème IRG** (`/rh/paie/irg` redirige vers Cotisations & impôts › IRG) : documenté au chapitre 5.

---

# Points à vérifier — chapitre 4 (Documents) et chapitre 5 (Juridique)

> Points relevés pendant la rédaction de `chapitres/04-documents.md`, `chapitres/05-juridique.md`, `videos/04-documents.md` et `videos/05-juridique.md`. Ils ne figurent pas dans le manuel. Source principale : `_notes/04-documents-juridique.md`, complétée par `_notes/02-temps-presence.md` (congés, ordres de mission), `_notes/03-paie.md` (bulletins) et une lecture du code (écrans Documents, Attestations, Juridique, propositions, documents juridiques, extraction IA, veille, calcul IRG).

## A. Incohérences et risques (à signaler aux développeurs)

1. **Réimpression d'un courrier : le contenu enregistré est remplacé.** « Réimprimer » puis « Enregistrer et imprimer » réenregistre le courrier sous le même numéro avec les valeurs éventuellement modifiées (champs, langue, texte libre). La date « Établi le » ne change pas et la colonne « Document » affiche la langue de la dernière sauvegarde. Aucune trace de la version imprimée initialement. Risque de traçabilité pour des courriers à valeur juridique (mises en demeure). Le manuel (fiche 4.12) le signale. Envisager un historique des versions ou un blocage de la modification en réimpression.
2. **Changement de langue d'un courrier : le texte libre est effacé sans confirmation.** Le manuel le signale (fiches 4.9 et 4.11). Envisager une confirmation.
3. **Ordre de mission : aucun moyen d'annuler ou de supprimer.** Un ordre saisi par erreur garde son numéro et continue de proposer des jours « MS » dans le pointage. Le manuel le constate (fiche 4.6) sans solution. À trancher (statut « Annulé » comme pour les titres de congé ?).
4. **Ordre de mission modifié : le PDF archivé est-il régénéré ?** Le code de la modification n'a pas permis de confirmer que le PDF du dossier employé est remplacé. Le manuel (fiche 4.6) ne le promet pas. À tester.
5. **Colonne « Établi par » d'un ordre juste enregistré** : affiche « — » jusqu'au rechargement de la page. Cosmétique.
6. **« Supprimer » d'une rubrique ajoutée** : selon qu'elle a déjà été appliquée ou non, le même bouton supprime (après confirmation) ou ouvre « Proposer l'arrêt ». Libellé ambigu. Envisager deux boutons distincts ou un libellé « Arrêter » quand la suppression est impossible.
7. **Règles IRG : « S'applique à » affiche les valeurs techniques GROSS / BASE / TAX** au lieu de libellés français (Salaire brut, Base imposable, Impôt). Le manuel les explique entre parenthèses (fiche 5.9). Même remarque pour le champ « Formule [IRG_AFTER_ABATEMENT] » et « Jetons à déduire ». Proposer des libellés utilisateur.
8. **Taille maximale différente entre import et analyse IA** : 25 Mo à l'import au registre, 14 Mo pour l'analyse IA. Un document importé peut donc être refusé à l'analyse. Le manuel cite les deux limites (fiches 5.15 et 5.19). Harmoniser ou afficher la limite IA à l'import.
9. **Libellés bilingues des écrans Documents et Attestations** : la note 04 annonce des titres doublés en arabe (par exemple « Établir un document / إعداد وثيقة »), mais la fonction d'affichage bilingue de l'interface RH ne rend que le français. Le manuel cite les libellés en français seul. Confirmer à l'écran ; si l'arabe doit apparaître, c'est un défaut d'affichage.
10. **Statuts des propositions légales : la note 04 et le code diffèrent.** Le manuel suit le code : « Brouillon », « Soumise, à approuver », « Approuvée, sans effet (date à décider) », « En vigueur », « Rejetée », « Retirée », « Caduque » (la note parlait de « Appliquée » / « Remplacée »). À relire à l'écran.
11. **Titre de congé : libellé du champ de fin.** « Au (inclus) — إلى » en création, « Au — إلى » à l'ouverture d'un titre existant (selon le code). Harmoniser.
12. **« Nombre de jours » d'un titre de congé modifiable à la main** alors que les dates fixent déjà la période et la date de reprise. Une valeur saisie différente des jours calendaires n'est pas contrôlée à l'écran. Vérifier l'effet sur le solde et sur les jours proposés au pointage.
13. **Message « Indiquez le groupement repris. »** (portée de zone IRG, mode « Reprendre un groupement enregistré ») : cité par la note 04, non retrouvé côté écran (peut venir du serveur). Le manuel le cite (fiche 5.10). À confirmer.
14. **Extraction IA : périmètre des suggestions.** La description de l'écran cite les taux CACOBATPH, mais les types de suggestions transformables sont « Variable légale », « Taux d'un régime CNAS », « Wilayas d'une zone IRG » et « Barème IRG (lecture seule) ». Confirmer qu'un taux CACOBATPH arrive bien comme « Variable légale ».
15. **Extraction IA : droits incohérents.** L'écran n'est ouvert qu'au SUPER_ADMIN, alors que la transformation d'une suggestion dépend du droit de modifier les propositions légales. Un ADMIN_RH délégué ne peut pas y accéder. Le manuel indique « Public : SUPER_ADMIN ». À trancher.
16. **Onglet « CNAS » sans panneau de rubriques** : impossible d'ajouter une rubrique côté CNAS (seulement des régimes). Le manuel le dit (fiche 5.6). Confirmer que c'est voulu.
17. **Libellés de l'onglet « Autres (SNMG…) »** : viennent de la base. Le manuel cite les paramètres d'après la note (SNMG, diviseur fixe, heures mensuelles, taux d'heures supplémentaires, congé acquis par mois). Relire les libellés exacts à l'écran.
18. **Veille planifiée et variable serveur CRON_SECRET** : le message d'avertissement affiché à l'utilisateur cite le nom d'une variable serveur, contraire à la charte. Le manuel le cite tel quel (fiche 5.22) faute d'alternative ; proposer un message sans nom technique (« Vérification automatique non configurée : prévenez l'administrateur »).

## B. Points à confirmer à l'écran ou en recette

19. **Compteur commun des courriers RH** : ordres de mission, titres de congé, attestations, certificats, reçus pour solde de tout compte et mises en demeure partagent le même compteur annuel (d'après la note 04 et le code). Confirmer en recette : les numéros d'un même type « sautent » (exemple du manuel : OM 000012/26, attestation 000013/26, OM 000014/26).
20. **Reçu pour solde de tout compte — somme pré-remplie** : net à payer des bulletins du mois de sortie, sinon total des lignes de solde. Faire valider la règle par le métier (cas d'un bulletin brouillon, de plusieurs bulletins sur le mois, d'indemnités payées hors bulletin). Format affiché « 48500.00 » (point décimal, sans séparateur de milliers) : vérifier qu'il s'imprime correctement en français et en arabe. Maximum de 30 lignes de détail.
21. **Deuxième mise en demeure** : les champs de rappel sont repris de la **dernière** première mise en demeure de l'employé. Vérifier le comportement s'il en existe plusieurs (absences successives).
22. **Titre de congé — refus côté serveur** (chevauchement avec un autre congé, employé sorti, mois clôturé…) : les messages exacts n'ont pas été lus. Le manuel ne cite que les messages de l'écran. Relever les messages en recette.
23. **Droits « Attestations & courriers »** : les rôles indiqués (ADMIN_RH) sont repris de la note 04 et des droits de l'écran Paie. Relever la matrice réelle.
24. **Droit de modification de la fiche de renseignements** : le manuel indique « droit de modifier les employés ». Confirmer quel droit conditionne le bouton « Modifier la fiche ».
25. **Registre des bulletins de paie** : colonnes, pagination (50 lignes) et actions repris de la note 04 / note 03 ; non relus dans le code en détail. Relire à l'écran.
26. **Droits par défaut du module Juridique** (unité 05, propositions, approbation, documents juridiques, extraction IA, veille) : issus des migrations initiales. Relever la matrice réelle avant publication, en particulier : approbation des règles légales réservée au SUPER_ADMIN à l'installation ; retrait d'un document juridique réservé au SUPER_ADMIN ; GERANT en lecture seule sur « Cotisations & impôts ».
27. **Message de vérification approuvée et message de demande de vérification** : textes renvoyés par le serveur, repris de la note 04. À relire à l'écran.
28. **Fréquences de la veille** (20 h, 164 h, 27 jours ; relecture quotidienne des sources en erreur) : reprises du code. Les présenter ainsi à l'utilisateur est peut-être trop précis ; à valider.
29. **Décision D2 pendant la période de reprise des paies** : affichage séparé des mois de reprise et de la paie opérationnelle, arrêt au 31/08/2026. Repris de la note 04 ; à vérifier à l'écran avant publication (la période de reprise peut être terminée).

## C. Coordination avec les autres chapitres

30. **Renvois vers les chapitres 0, 1, 2, 3 et 6** : écrits sous la forme « Chapitre N Nom (sujet) », car les numéros de fiches définitifs des autres chapitres n'étaient pas connus. À remplacer par les numéros définitifs (par exemple « 2.x Valider la feuille de présence », « 3.x Établir un bulletin de paie »).
31. **« Cotisations & impôts » aussi dans Paramètres RH** (onglet « Cotisations & impôts », même écran) : le chapitre 5 le mentionne désormais dans la fiche 5.2 ; le chapitre 6 doit renvoyer vers le chapitre 5 sans redécrire l'écran.
32. **Contrats** : le registre des contrats (fiche 4.3) renvoie au chapitre 1 pour la création, la modification et l'import. Vérifier que le chapitre 1 couvre bien les boutons « Exceptions », « Importer des contrats », « Contrat PDF » et « Nouveau contrat » depuis ce registre.
33. **Bulletins** : la fiche 4.4 renvoie au chapitre 3 pour « Recalculer », « Nouveau bulletin de paie » et les décisions D1, D3, D4. Vérifier la cohérence des libellés.
34. **Titres de congé et ordres de mission** : le chapitre 2 décrit l'approbation des congés et la validation des jours proposés (« MS », CA, CRP…) ; les fiches 4.5 à 4.8 y renvoient. Harmoniser les libellés des messages entre chapitres 2 et 4.
35. **Qualité des données** (wilaya codée des chantiers, utile aux zones IRG) : renvoi vers le chapitre 0 depuis la fiche 5.10, conformément à la consigne. Vérifier que la fiche existe au chapitre 0.
36. **D15 et D16** : D15 est une vraie décision (fiche 5.18) ; D16 n'est qu'un libellé de famille de proposition (« Portée d'une zone IRG (D16) »), sans écran de décision. Le chapitre 5 n'en parle que comme d'une famille ; harmoniser avec l'Annexe A.

---

# Points à vérifier — chapitre 6 (Paramètres RH & administration) et Annexe A

> Points relevés pendant la rédaction de `chapitres/06-parametres-administration.md`, `chapitres/annexe-a-decisions.md` et `videos/06-parametres-administration.md`. Ils ne figurent pas dans le manuel. Source principale : `_notes/05-parametres-gouvernance.md` (complétée par `_notes/02`, `_notes/03`, `_notes/04`, `_notes/01` et une lecture de `src/lib/decisions/catalog.ts` et `src/lib/ui/registry.ts`).

## A. Incohérences et risques (à signaler aux développeurs)

1. **Code de présence AN remis à « ne déclenche pas AN » à chaque enregistrement.** Le panneau « Légendes de présence » envoie toujours « déclenche AN » à faux et réactive le code. Ré-enregistrer AN (libellé ou couleur) depuis cet écran désactiverait son effet sur les ajustements commerciaux. Le manuel (fiche 6.10) se contente d'interdire de ré-enregistrer AN depuis ce panneau. **Ne pas recommander cette manipulation.** À corriger côté code.
2. **Écriture des légendes réservée au SUPER_ADMIN en base, alors que l'écran est ouvert aux autres rôles.** Un ADMIN_RH peut tout saisir puis reçoit un refus. Le manuel indique « Public : SUPER_ADMIN ». Relever le message exact affiché à un ADMIN_RH.
3. **Réglages de légende non disponibles à l'écran** : « compte comme présence », « déclenche AN », couleur du texte, mode de source (saisie, automatique, les deux). Un nouveau code compte toujours comme présence. Sans réglage possible, un code d'absence créé par l'écran compterait comme présence. À trancher (ajout des champs ou documentation d'une procédure administrateur).
4. **« S'applique à » modifié : message trompeur.** L'interface annonce « … Les anciennes valeurs ont été effacées car le niveau d'application a changé. », mais le serveur n'efface jamais les valeurs en modification manuelle. Le manuel (fiche 6.3) demande seulement de vérifier les valeurs.
5. **Niveau de valeur différent du « S'applique à »** : l'écran « Valeurs » propose tous les niveaux, mais une règle en base (déclencheur d'alignement, migration de septembre 2026) peut refuser avec « Cette rubrique s'applique uniquement à un employé / un chantier / un contrat ». Le manuel conseille de garder le niveau proposé et cite le message. À tester en recette ; si la règle est voulue, griser les autres niveaux à l'écran ; sinon, retirer la règle (ce qui contredirait aussi l'aide « Priorité : employé > contrat > poste > chantier »).
6. **« Charger l'en-tête » du « Modèle de bulletin » remplace aussi l'en-tête de la fiche employé** (même fonction, enregistrement immédiat). Le manuel (fiche 6.12) oriente vers « Utiliser l'en-tête de la fiche » et n'explique pas le bouton. À corriger (en-têtes séparés) ou à documenter si c'est voulu.
7. **Décision D14 : lien « Ouvrir les codes de présence »** vers `/referentiels/legendes`, qui est un écran réservé non développé (« Écran réservé · شاشة محجوزة »). Même problème pour la carte « Légendes de présence » de la page Paramètres et pour le droit « Légendes de présence » de la matrice. Le manuel renvoie toujours à « Paramètres RH › Listes et codes ». Rediriger le lien vers `/rh/parametres?tab=catalogs`.
8. **`/referentiels/activites` (Codes d'activité)** : écran réservé non développé, mais présent dans le menu latéral (« Codes d'activité »). Non documenté dans le manuel.
9. **Messages techniques visibles par l'utilisateur** (contraires à la charte, donc non cités dans le manuel) :
   - Chantiers : « Accès refusé (RLS). Vérifiez le rôle SUPER_ADMIN et l'écran « sites ». » ;
   - Matrice des permissions : la légende contient « (RLS) » ;
   - Accès par compte : « Table des accès absente : … » ;
   - Journal d'audit : filtre « Table » et colonne « Table » affichant des noms techniques de tables ;
   - Matrice : chaque ligne affiche « code · chemin » de l'écran ; filtre « Module » affichant des codes (hr, decisions, admin…).
   Proposer des libellés utilisateur.
10. **Code de rubrique en double** : le refus vient de la contrainte d'unicité de la base, avec un message technique. Relever le texte exact et prévoir un message clair (« Ce code existe déjà »).
11. **Suppression d'une rubrique utilisée par une exception de paie** : probablement refusée par la base (lien de type « restrict ») avec un message technique, alors que l'interface annonce seulement « Suppression refusée. ». Vérifier.
12. **Toute sauvegarde d'une rubrique la réactive** (envoyée « active »). Le manuel le mentionne (fiche 6.3). Confirmer que c'est voulu.
13. **Valeurs CRP créées depuis le contrat non distinguées dans l'onglet « Valeurs »** (pas de colonne travail / récupération) ; une valeur créée dans l'onglet « Valeurs » est toujours « jours travaillés ». Risque de confusion ou de doublon apparent.
14. **Le texte d'aide des « Légendes de présence » n'existe qu'en arabe**, alors que le reste du module RH est en français. Ajouter la version française.
15. **D16** : n'est pas un type de décision (aucun écran « Décision D16 », aucune demande), mais le libellé « Portée d'une zone IRG (D16) » / « Périmètre de zone IRG (D16) » laisse croire le contraire. Le manuel l'explique (Annexe A.3). Envisager un autre nom.
16. **D8 — aucun chemin visible pour la demander.** La note 05 cite « Contrat → affectations → « Demander la décision D8 » », mais la note 01 (§ 8) indique que l'onglet « Affectations » et le composant de correction d'affectation ne sont affichés nulle part. Le manuel (Annexe A) décrit la situation sans bouton. À confirmer à l'écran.
17. **Clôture des périodes ≠ clôture de la paie** : le nom peut tromper un utilisateur RH. Le manuel l'explique (fiche 6.24). Envisager de renommer la carte (« Clôture des ajustements commerciaux »).
18. **Page « Paramètres RH » sans contrôle de rôle** : tout compte qui l'ouvre voit les onglets (sauf Feuille de présence et Cotisations & impôts). Ce qui est modifiable dépend de contrôles dispersés (rôle en dur, droit « Paramètres RH », droit « Employés »). À harmoniser.

## B. Points à confirmer à l'écran ou en base de production

19. **Droits par défaut** issus des migrations : à relever dans la matrice réelle avant publication, en particulier :
    - « Paramètres RH » : lecture SA, ADMIN_RH, GERANT, ADMIN_FINANCE, CHEF_CHANTIER, READ_ONLY ; créer/modifier SA, ADMIN_RH, GERANT ; supprimer SA, ADMIN_RH ;
    - « Décision D1 … D15 » : seul le SUPER_ADMIN à l'installation ;
    - « Journal d'audit » : probablement seuls SA et READ_ONLY en lecture ; un ADMIN_RH verrait « Aucune entrée » — « Ou droit « Journal d'audit » manquant. ». Le manuel (fiche 6.25) explique la marche à suivre.
20. **Accès par compte + Interface** : combinaison exacte quand un compte a un accès personnalisé et que son rôle a des éléments masqués (lequel l'emporte ?). Non décrit dans le manuel.
21. **Paragraphe arabe des « Rubriques de salaire »** (rendu de droite à gauche) : vérifier qu'il s'affiche.
22. **Texte exact des erreurs de validation du « Modèle de fiche »** (« Données invalides » ou message standard).
23. **Wilaya datée — droits** : confirmer qui peut confirmer ou changer la wilaya (SUPER_ADMIN seul, ou droit « Chantiers » en modification). Le manuel indique « SUPER_ADMIN (ou droit de modification sur l'écran « Chantiers ») ».
24. **Libellés FR de certaines colonnes de la feuille de présence** (NOM, PRENOM / PRÉNOM, AFFECTATION, NJ, COMMENTAIRE, VALIDATION) déduits du code : à relire à l'écran. Les notes 02 et 05 diffèrent sur « PRENOM » / « PRÉNOM » et sur les droits par défaut de CHEF_CHANTIER (modifie DAYS et COMMENTAIRE selon la note 02).
25. **Codes de présence livrés** : liste et coefficients issus de la migration initiale, peuvent avoir changé en base. Le code « P/2-CRP/2 » n'est pas livré.
26. **Notifications** : vérifier le texte exact de la notification « décision invalidée » et celui de la notification « demande en attente ».
27. **Visibilité des cartes de la page Paramètres** selon les rôles (la note n'indique que les cartes réservées au SA).
28. **« Utilisateurs »** : la description de la carte parle d'« invitations », mais l'écran ne propose que la création avec mot de passe initial. Vérifier s'il existe une invitation par e-mail.
29. **Décision D2 — classe** : notée « À risque » dans le catalogue de la note 05, non précisée dans la note 03. Confirmer.
30. **D6 option « Valider en figeant les paramètres des mois de reprise »** : effet exact sur la validation (la note 03 indique que la validation se fait ensuite depuis l'écran Paie, quelle que soit l'option). Confirmer avant de détailler dans le chapitre 3.

## C. Coordination avec les autres chapitres

31. **Renvois de l'Annexe A et du chapitre 6 vers les chapitres 0 à 5** : écrits sous la forme « chapitre N Nom (sujet) » car les numéros de fiches des autres chapitres ne sont pas encore connus. À remplacer par les numéros définitifs (par exemple « 3.2 Calculer la paie »).
32. **Qualité des données (D13, wilayas non confirmées)** : placée au chapitre 0 selon le plan de la charte, mais documentée dans la note 04. Vérifier dans quel chapitre la fiche est finalement rédigée.
33. **Cotisations & impôts** : onglet présent dans Paramètres RH mais documenté au chapitre 5 ; vérifier que le chapitre 5 couvre aussi l'accès par « Paramètres RH › Cotisations & impôts ».
34. **Avances : classe 4 ou 5** (note 03, § 6.1) : sans effet direct sur le chapitre 6, mais la fiche 6.4 explique les classes ; harmoniser si le chapitre 3 tranche.
35. **Réinitialisation des données de test** (carte réservée au SA sur la page Paramètres) : volontairement exclue du manuel utilisateur.
