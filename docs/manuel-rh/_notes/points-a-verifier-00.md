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
