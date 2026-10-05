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
