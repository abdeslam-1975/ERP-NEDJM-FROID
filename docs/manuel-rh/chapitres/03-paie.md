# 3 Paie — الأجور

**Dans ce chapitre** — Vous apprenez à conduire un mois de paie de bout en bout : contrôler que le mois est prêt, demander puis décider la génération ou le recalcul des bulletins, consulter et imprimer les bulletins, comprendre comment chaque montant est calculé, valider puis clôturer la paie, et la réouvrir si nécessaire. Vous apprenez aussi à gérer les éléments variables (rubriques exceptionnelles, avances et prêts), à préparer les virements des salaires, à produire les déclarations (G50, CNAS, DAS), à enregistrer les paiements et déclarations faits hors de l'application, à analyser le coût de la paie et à tester un changement dans le simulateur sans rien enregistrer.

Règle d'or du module : **aucune paie n'est créée ni recalculée automatiquement**. Chaque génération ou recalcul passe par une décision du Centre de décisions.

| Fonction | Vidéo | Public |
|---|---|---|
| 3.0 L'écran en un coup d'œil | V3.0 | Tous les utilisateurs de la paie |
| 3.1 Préparer le mois de paie | V3.1 | Gestionnaire de paie |
| 3.2 Demander la génération ou un recalcul de la paie | V3.2 | Gestionnaire de paie |
| 3.3 Décider la génération, le recalcul ou la simulation | V3.3 | Décideur habilité |
| 3.4 Consulter la paie du mois (Fiches, Social, Fiscal) | V3.4 | Gestionnaire de paie |
| 3.5 Afficher et imprimer les bulletins depuis l'écran Paie | V3.5 | Gestionnaire de paie |
| 3.6 Comprendre le calcul du bulletin | V3.6 | Tous les utilisateurs de la paie |
| 3.7 Consulter la traçabilité d'un bulletin | V3.7 | Gestionnaire de paie |
| 3.8 Valider la paie | V3.8 | ADMIN_RH, GERANT, SUPER_ADMIN |
| 3.9 Demander la décision D6 (mois de reprise ouverts) | V3.9 | ADMIN_RH, GERANT, SUPER_ADMIN |
| 3.10 Clôturer le mois | V3.10 | GERANT, SUPER_ADMIN |
| 3.11 Demander la réouverture d'une paie (D7) | V3.11 | ADMIN_RH, GERANT, SUPER_ADMIN |
| 3.12 Consulter l'historique des bulletins | V3.11 | ADMIN_RH, GERANT, SUPER_ADMIN |
| 3.13 Afficher, imprimer ou recalculer un bulletin depuis Documents | V3.12 | Gestionnaire de paie |
| 3.14 Établir un nouveau bulletin de paie | V3.13 | Gestionnaire de paie, SUPER_ADMIN |
| 3.15 Saisir et approuver une rubrique exceptionnelle | V3.14 | ADMIN_RH, GERANT, SUPER_ADMIN |
| 3.16 Enregistrer une avance ou un prêt | V3.15 | ADMIN_RH, GERANT, SUPER_ADMIN |
| 3.17 Préparer et suivre un lot de virements | V3.16 | ADMIN_RH, GERANT, SUPER_ADMIN |
| 3.18 Débloquer des virements (décision D9) | V3.17 | ADMIN_RH, GERANT, SUPER_ADMIN |
| 3.19 Produire les déclarations depuis l'écran Paie | V3.18 | ADMIN_RH, GERANT, SUPER_ADMIN |
| 3.20 Débloquer une déclaration (décision D10) | V3.19 | ADMIN_RH, GERANT, SUPER_ADMIN |
| 3.21 Consulter le registre des déclarations | V3.20 | ADMIN_RH, GERANT, SUPER_ADMIN |
| 3.22 Enregistrer et suivre une opération externe | V3.21 | Utilisateurs autorisés aux opérations externes |
| 3.23 Analyser les coûts de la paie et exporter l'écriture comptable | V3.22 | ADMIN_RH, GERANT, ADMIN_FINANCE, SUPER_ADMIN |
| 3.24 Paramétrer le plan de comptes de la paie | V3.22 | ADMIN_FINANCE, GERANT, SUPER_ADMIN |
| 3.25 Simuler une fiche de paie | V3.23 | Utilisateurs autorisés à lire la paie |

---

## 3.0 L'écran en un coup d'œil

> **Vidéo V3.0** · durée estimée 3 min · Public : tous les utilisateurs de la paie

**Où la trouver** — Ressources Humaines › barre d'onglets en haut des pages RH › section « Paie ».

### Les sous-onglets de la section « Paie »

| Sous-onglet | Ce que vous y faites | Fiches |
|---|---|---|
| « Préparation du mois » | Contrôler le mois avant de lancer la paie | 3.1 |
| « Calcul de la paie » | Demander la génération ou le recalcul, consulter, imprimer, valider, clôturer, exporter les déclarations | 3.2 à 3.12, 3.19 |
| « Simulateur » (raccourci, flèche ↗) | Tester une fiche de paie sans rien enregistrer | 3.25 |
| « Exceptions » | Saisir les primes, indemnités ou retenues ponctuelles | 3.15 |
| « Avances » | Enregistrer les avances sur salaire et les prêts | 3.16 |
| « Virements » | Préparer les fichiers de virement CCP ou banque | 3.17, 3.18 |
| « Déclarations » | Registre des fichiers de déclaration produits | 3.21 |
| « Opérations externes » | Enregistrer les paiements et déclarations faits hors de l'application | 3.22 |
| « Coûts » | Coût employeur par chantier et par contrat, écriture comptable | 3.23, 3.24 |

- L'ordre des onglets peut être personnalisé (fonction « Réorganiser ») : leur position peut donc varier d'un utilisateur à l'autre.
- Les bulletins déjà établis se retrouvent aussi dans Documents › « Registre » › carte « Bulletin de paie » (fiche 3.13).
- Le barème IRG se consulte dans Cotisations & impôts › onglet IRG (chapitre 5).
- Le « Simulateur » est aussi accessible depuis le menu général, groupe « Pilotage ».

### L'écran « Calcul de la paie » (titre « Paie »), de haut en bas

1. **En-tête** « Paie » avec un rappel : les taux viennent des variables légales (CNAS, IRG, CACOBATPH), les coefficients viennent des légendes de présence, les rubriques viennent du dictionnaire et du contrat.
2. **Barre de raccourcis** : « Fiches », « Social », « Fiscal », « Cotisations & impôts », « Simulateur », « Exceptions », « Avances & prêts », « Virements », « Rubriques ».
3. **Alertes** selon le cas : bandeau « Paie de reprise » pour les mois avant septembre 2026, salariés en régime manuel (IRG / CNAS / CACOBATPH), bulletins calculés avec des valeurs légales jamais vérifiées (lien « faire approuver ces valeurs »).
4. **Bandeau des taux** : « CNAS salarié », « CNAS employeur », « FOS », « Congés CACOBATPH », « Intempéries » salarié et patronal, « IRG barème + règles ».
5. **Barre d'état du mois** pour le chantier choisi : « Paie MM/AAAA · {chantier} », statut, nombre de bulletins, alertes, et les boutons « Historique (N) », « Demander la décision D6 », « Valider la paie », « Demander la réouverture (D7) », « Clôturer le mois » (selon le statut et votre rôle). S'il n'y a pas encore de paie : « Pas encore générée pour ce chantier. »
6. **Barre des déclarations** (ADMIN_RH, GERANT, SUPER_ADMIN) : « CNAS · G50 · CACOBATPH · Virements (Excel) », « Ce chantier seulement », « DAS annuelle AAAA », « Fichier CNAS (CSV) », « Fichier DAS (CSV) », « État G50 (imprimer) », liens « Registre des déclarations » et « Virements CCP / banque ».
7. **Barre de période** : « Chantier », « Année », « Mois », boutons « Voir ce mois », « Demander la génération » (ou « Demander un recalcul »), « Afficher Bulletin de Paie », « Imprimer les bulletins ».
8. **Recherche** « Rechercher un employé (matricule, nom, NSS)… » et compteur « x / y bulletin(s) ».
9. **Tableau des bulletins**, 40 par page (« Précédent » / « Suivant »).

**Important** — Le tableau liste **tous les bulletins du mois, tous chantiers confondus** (chaque ligne a son propre statut). La barre d'état et ses boutons portent seulement sur la paie **du chantier sélectionné**.

### Les statuts d'une paie

Une paie est établie pour un mois et un chantier. Elle passe par trois statuts, sans retour arrière direct :

| Statut | Signification |
|---|---|
| « Brouillon » | Bulletins calculés, encore modifiables par un recalcul (décision D3). |
| « Validée » | Bulletins et pointage du mois figés, PDF archivés. Réouverture seulement par la décision D7. |
| « Clôturée » | Mois clôturé définitivement. Les corrections passent en rappel le mois suivant. |

### Mois de reprise et mois opérationnels

- Les mois **de janvier à août 2026** sont des « mois de reprise » : leur paie a été payée et déclarée hors de l'application. Un virement d'un mois de reprise exige la décision D9 ; une déclaration d'un mois de reprise exige la décision D10. Cette mention « reprise » s'affiche à l'écran seulement : elle n'est jamais imprimée sur les bulletins.
- À partir de **septembre 2026**, les mois sont des « mois opérationnels ».

### Le signal « Données modifiées depuis le calcul »

Un bulletin déjà calculé **n'est jamais modifié automatiquement**. Si, après le calcul d'une paie brouillon, une donnée qui entre dans la paie change (pointage, contrat, salaire, exception, sortie, congé, avance, régime manuel, affectation, wilaya du chantier, règle légale, coefficient de présence), l'application :
- affiche dans la barre d'état le chip « Données modifiées depuis le calcul (N) · décision requise » ;
- affiche « Données modifiées depuis le calcul » sous le nom des employés concernés ;
- ouvre ou met à jour une demande de décision D3 (Recalcul des paies brouillon) et prévient les décideurs ;
- désactive « Valider la paie » tant que la décision n'est pas prise.

Pour obtenir des montants à jour, il faut **recalculer** (fiches 3.2, 3.3 et 3.13).

Quand le pointage d'un mois est validé et qu'aucune paie n'existe encore, une demande de décision D4 (Génération de paie) est ouverte automatiquement.

### Les décisions utilisées dans ce chapitre

| Décision | Objet | Fiche |
|---|---|---|
| D1 | Paie d'un mois aux règles non approuvées | 3.1, 3.3 |
| D3 | Recalcul des paies brouillon | 3.2, 3.3, 3.13 |
| D4 | Génération de paie | 3.1, 3.2, 3.3 |
| D6 | Clôture des mois de reprise | 3.9 |
| D7 | Réouverture d'une paie (SUPER_ADMIN uniquement) | 3.11 |
| D9 | Virement bloqué | 3.18 |
| D10 | Déclaration bloquée | 3.20 |

Celui qui demande une décision ne peut pas la trancher lui-même (sauf le SUPER_ADMIN) : « Séparation des tâches : vous êtes à l'origine de cette demande, un autre décideur doit la trancher. »

**Voir aussi** — Annexe A Décisions D1–D15 · Annexe B Le mois de paie pas à pas

---

## 3.1 Préparer le mois de paie

> **Vidéo V3.1** · durée estimée 4 min · Public : gestionnaire de paie (droit de préparer la paie)

**Où la trouver** — Ressources Humaines › Paie › « Préparation du mois » (`/rh/paie/preparation`).

**À quoi ça sert** — Contrôler, en lecture seule, que tout est prêt avant de lancer la paie du mois, puis demander la génération. Rien n'est calculé sur cet écran.

**Avant de commencer**
- [ ] Vous avez le droit de préparer la paie (sinon : « Préparation de la paie non autorisée. »).
- [ ] Le chantier fait partie de votre périmètre (sinon : « Chantier hors de votre périmètre. »).
- [ ] Le pointage du mois a été saisi et, de préférence, validé (chapitre 2).

**Étapes**
1. Choisissez le « Mois » et, si besoin, le « Chantier » (« Tous les chantiers » ou un chantier).
   - Le chip indique « Mois de reprise » ou « Mois opérationnel », et le statut de la paie si elle existe (« Paie brouillon », « Paie validée »…).
2. Lisez l'alerte qui indique le chemin à suivre :
   - « Aucun blocage : la génération peut être demandée (décision D4). »
   - « Règles en attente : la génération réelle est bloquée. Demandez la décision D1 (attendre ou simulation non validable). »
   - « Une paie brouillon existe : recalcul depuis l'écran Paie (décision D3). »
   - « Paie de ce mois validée ou clôturée : aucune génération possible. »
3. Parcourez le bloc « Contrôles du mois ». Chaque contrôle a un niveau : « Conforme », « Information », « À vérifier » ou « Bloquant ». Les contrôles portent sur :
   - les règles légales du mois ;
   - les coefficients de présence en attente (décision D14, Coefficient d'un code de présence) ;
   - les présences : jours proposés non validés (ignorés par la paie), imports en cours, contrats sans présence ;
   - la qualité des données : contrats ne commençant pas le 1er du mois (décision D13, Contrat ne commençant pas le 1er), chantiers sans wilaya ;
   - les décisions ouvertes du mois ;
   - le mois précédent.
4. Pour chaque point « À vérifier » ou « Bloquant », cliquez sur « Ouvrir » : l'écran concerné s'ouvre. Corrigez, puis revenez à la préparation.
5. Consultez au besoin les panneaux :
   - « Règles en attente (bloquent la paie réelle) » : Règle, Famille, Statut, Mois concerné, lien « Décision D2 » ou « Proposition » ;
   - « Valeurs héritées non vérifiées (avertissement) » ;
   - les compteurs Présences validées, Présences proposées, Contrats sans présence, Imports en cours ;
   - « Décisions ouvertes pour ce mois » ;
   - « Coefficients en attente de décision (D14) » ;
   - « Simulations « règles non approuvées » » : Calculée le, Salariés, Brut, IRG, Net simulé, Règles en attente, bouton « Exporter (Excel) ».
6. Cliquez sur « Demander la génération (D4) » ou, si des règles sont en attente, sur « Demander la décision D1 ». Le bouton n'apparaît que si vous avez le droit de faire la demande.

**Résultat** — Une demande de décision D4 (Génération de paie) ou D1 (Paie d'un mois aux règles non approuvées) est créée au Centre de décisions et les décideurs sont prévenus. Aucun bulletin n'est encore calculé : il faut que la décision soit prise (fiche 3.3).

**Attention**
- Une vraie paie n'est jamais créée ni validée si une règle légale du mois attend son approbation ou sa date d'application. Message : « N règle(s) légale(s) attendent leur approbation ou leur date d'application pour MM/AAAA : génération de la paie bloquée (décision D1). Une simulation non validable peut être demandée depuis la préparation du mois. »
- « La paie de ce mois est déjà validée ou clôturée. » → aucune génération possible ; voir la réouverture (fiche 3.11).
- « Aucune règle en attente pour ce mois : la génération peut être demandée directement (D4). » → utilisez « Demander la génération (D4) ».
- « Demande D1 non autorisée. » → vos droits ne le permettent pas ; adressez-vous à un responsable de la paie.
- Le tableau « Simulations « règles non approuvées » » affiche « Montants réservés aux profils autorisés à lire les salaires. » si vous n'avez pas ce droit.
- Le fichier de simulation exporté porte le bandeau « SIMULATION — RÈGLES NON APPROUVÉES » : ce n'est pas une paie et il ne doit servir ni au paiement ni à la déclaration.

**Voir aussi** — 3.2 Demander la génération ou un recalcul de la paie · 3.3 Décider la génération, le recalcul ou la simulation · 2.x Valider le pointage · 5.x Règles légales et décision D2

---

## 3.2 Demander la génération ou un recalcul de la paie

> **Vidéo V3.2** · durée estimée 4 min · Public : gestionnaire de paie (droit de modifier la paie)

**Où la trouver** — Ressources Humaines › Paie › « Calcul de la paie » › barre de période (`/rh/paie`).

**À quoi ça sert** — Ouvrir, pour un chantier et un mois, la décision D4 (Génération de paie) s'il n'existe pas encore de paie, ou la décision D3 (Recalcul des paies brouillon) si une paie brouillon existe déjà.

**Avant de commencer**
- [ ] Vous avez le droit de modifier la paie.
- [ ] Le pointage du mois du chantier est validé.
- [ ] Pour un recalcul : la paie du chantier est au statut « Brouillon ».

**Étapes**
1. Choisissez le « Chantier », l'« Année » et le « Mois », puis cliquez sur « Voir ce mois » (le bouton n'est actif que si vous avez changé la période).
2. Cliquez sur « Demander la génération » (pas encore de paie) ou « Demander un recalcul » (paie brouillon existante).
   - Infobulle : « Ouvre la décision de génération (D4) ou de recalcul (D3) au Centre de décisions. »
   - Le bouton est désactivé si la paie n'est pas au statut « Brouillon ».
3. L'application ouvre directement la page de la décision au Centre de décisions. Si vous êtes décideur, et que vous n'êtes pas l'auteur de la demande, poursuivez avec la fiche 3.3. Sinon, un autre décideur la tranchera.

**Cas particulier — salarié sans bulletin**
1. Tapez au moins 2 caractères dans « Rechercher un employé (matricule, nom, NSS)… ».
2. Si aucun bulletin ne correspond, l'alerte « Pas encore de bulletin pour MM/AAAA : » liste les employés trouvés :
   - bouton « Demander la paie {chantier} MM/AAAA » pour ouvrir la demande ;
   - ou « Aucun contrat principal : créez son contrat de travail d'abord. » avec un lien « Contrats ».

**Résultat** — Une demande de décision D4 (ou D1 si des règles du mois sont en attente) ou D3 est créée. Un recalcul demandé depuis l'écran Paie porte sur **toute la paie du chantier pour le mois**. Les décideurs reçoivent la notification « Recalcul demandé depuis l'écran Paie. Aucun recalcul n'a été fait : votre décision est requise. » Aucun montant ne change tant que la décision n'est pas prise.

**Attention**
- « Paie clôturée : aucun recalcul possible. » → les corrections passent en rappel le mois suivant (rubrique exceptionnelle, fiche 3.15).
- « Paie validée : aucun recalcul possible sans réouverture. » → demandez la réouverture (fiche 3.11).
- « Mois déjà validé ou clôturé : aucune paie à générer. »
- « Demande de recalcul non autorisée. » / « Demande de génération de paie non autorisée. » → vos droits ne le permettent pas.
- « Le serveur n'a pas répondu. Rechargez la page et réessayez. »
- S'il existe déjà une demande de génération, le chip « Génération demandée · en attente de décision » apparaît dans la barre d'état.

**Voir aussi** — 3.1 Préparer le mois de paie · 3.3 Décider la génération, le recalcul ou la simulation · 3.13 Afficher, imprimer ou recalculer un bulletin depuis Documents

---

## 3.3 Décider la génération, le recalcul ou la simulation

> **Vidéo V3.3** · durée estimée 5 min · Public : décideur habilité (droit de modifier la paie ; SUPER_ADMIN)

**Où la trouver** — Centre de décisions › page de la décision (`/decisions/…`), ouverte depuis la préparation du mois (3.1), l'écran Paie (3.2), une notification, ou automatiquement après la validation du pointage.

**À quoi ça sert** — Trancher une demande de paie : générer les bulletins (décision D4, Génération de paie), les recalculer (décision D3, Recalcul des paies brouillon) ou, si des règles du mois ne sont pas approuvées, attendre ou calculer une simulation (décision D1, Paie d'un mois aux règles non approuvées).

**Avant de commencer**
- [ ] Vous avez le droit de modifier la paie (sinon, à l'exécution : « Calcul de la paie non autorisé pour votre rôle. »).
- [ ] Vous n'êtes pas l'auteur de la demande (sauf SUPER_ADMIN).
- [ ] Vous avez relu les faits affichés : « Période », « Chantier », « Origine », « Classe », « Demandée », « Pointages validés du mois », « Bulletins brouillon ».

**Les options possibles**

| Décision | Option | Effet |
|---|---|---|
| D4 Génération de paie | « Générer la paie du mois » | Crée la paie brouillon avec les règles en vigueur au 1er du mois ; s'exécute aussitôt. |
| | « Ne pas générer » | Aucune paie n'est créée. |
| D3 Recalcul des paies brouillon | « Recalculer les bulletins concernés » | Seuls les bulletins brouillon concernés sont recalculés ; si la demande vient de l'écran Paie, toute la paie est recalculée. |
| | « Conserver les bulletins tels quels » | Les montants ne changent pas ; la paie redevient validable en l'état. |
| D1 Règles non approuvées | « Attendre l'approbation des règles » | Rien n'est calculé. |
| | « Calculer une simulation non validable » | Aucun bulletin réel ; une simulation est enregistrée et exportable depuis la préparation du mois. |

**Étapes**
1. Dans le bloc « Votre décision », choisissez une option (carte avec bouton radio). Une option grisée affiche le motif pour lequel elle n'est pas disponible.
2. Saisissez la « Justification (obligatoire, tracée) » : de 10 à 2000 caractères.
3. Pour une décision « À risque », cochez « J'ai pris connaissance des conséquences de cette décision à risque. »
4. Cliquez sur « Décider et exécuter » (option qui s'exécute aussitôt) ou sur « Enregistrer la décision ».
   - Rappel affiché : « La décision est définitive : elle ne peut être ni modifiée ni supprimée. »

**Résultat**
- « Décision enregistrée et exécutée : N bulletin(s) calculé(s). » : la paie brouillon est créée ou remplacée. Chaque bulletin garde une photographie des règles utilisées et sa traçabilité (fiche 3.7). Le signal « Données modifiées depuis le calcul » disparaît.
- Simulation D1 : « Décision enregistrée : simulation « règles non approuvées » calculée pour N salarié(s). Aucun bulletin créé. »
- « Décision enregistrée. Aucune opération de paie n'a été lancée. » pour les options « Ne pas générer » ou « Attendre ».
- Le calcul peut afficher des avertissements à relire : « Barème IRG introuvable pour la période : IRG = 0 », salariés en régime manuel, plusieurs contrats principaux dans le mois, jours pointés supérieurs aux jours de contrat, salaire de base inférieur à la grille, NSS manquant, salaire de base inférieur au SNMG, retenue d'avance réduite, « N j de congé annuel payés par la CACOBATPH, exclus du bulletin ».

**Attention**
- « Justification obligatoire (10 caractères minimum). »
- « Décision à risque : confirmez avoir pris connaissance des conséquences. »
- « Les données ont changé depuis l'affichage : la demande a été mise à jour. Relisez-la avant de décider. »
- « Les données ont changé depuis la décision : elle est invalidée et une nouvelle demande est ouverte. » → cliquez sur « Ouvrir la nouvelle demande ».
- « Décision enregistrée, mais l'exécution a échoué : … » → corrigez la cause puis cliquez sur « Exécuter la décision ». Seul l'auteur de la décision ou le SUPER_ADMIN peut le faire (« Seul l'auteur de la décision ou le SUPER_ADMIN peut l'exécuter. »).
- « Paie validée : réouvrez-la avant de régénérer. » / « Paie clôturée : régénération impossible. »
- « Calcul de paie refusé : décision D3 ou D4 valide requise (Centre de décisions). »
- Statuts d'une décision : « En attente », « Décidée, à exécuter », « Exécutée », « Invalidée », « Remplacée ».

**Voir aussi** — 3.1 Préparer le mois de paie · 3.6 Comprendre le calcul du bulletin · 6.x Centre de décisions

---

## 3.4 Consulter la paie du mois (Fiches, Social, Fiscal)

> **Vidéo V3.4** · durée estimée 4 min · Public : gestionnaire de paie

**Où la trouver** — Ressources Humaines › Paie › « Calcul de la paie » (`/rh/paie`), puis raccourcis « Fiches », « Social », « Fiscal ».

**À quoi ça sert** — Contrôler les bulletins du mois : jours, rubriques, net, cotisations sociales et IRG, avant la validation.

**Avant de commencer**
- [ ] La paie du mois a été générée (fiche 3.3).

**Étapes**
1. Choisissez « Chantier », « Année », « Mois », puis « Voir ce mois ».
2. Lisez la barre d'état : statut (« Brouillon », « Validée », « Clôturée »), nombre de bulletins, alertes éventuelles.
3. Choisissez la vue :
   - « Fiches » (titre « Paie ») : colonne « Employé », « Jours », « Net », une colonne par rubrique utilisée (groupées par classe, avec code, libellé et unité) et la colonne « Statut » ;
   - « Social » (titre « Déclarations sociales ») : « Jours », « Net », « SS salarié », « SS employeur », « CACOBATPH », « Intemp. sal. », « Intemp. pat. », « Autres cot. sal. », « Autres cot. pat. » ; la mention « NSS manquant » signale un salarié sans numéro de sécurité sociale ;
   - « Fiscal » (titre « Retenue IRG ») : « Jours », « Base IRG », « IRG ».
4. Pour retrouver un salarié, tapez son matricule, son nom ou son NSS dans « Rechercher un employé (matricule, nom, NSS)… ». Le compteur affiche « x / y bulletin(s) ».
5. Naviguez entre les pages avec « Précédent » et « Suivant » (40 bulletins par page).
6. Utilisez les actions de ligne : « Bulletin de Paie », « Imprimer », « PDF archivé », « Traçabilité » (fiches 3.5 et 3.7).

**Résultat** — Vous voyez les montants calculés de chaque bulletin. La consultation ne modifie rien.

**Attention**
- Le tableau montre tous les bulletins du mois, tous chantiers confondus ; les boutons de la barre d'état portent sur le chantier sélectionné.
- « Aucun bulletin pour cette période. » → la paie n'a pas encore été générée (fiche 3.2).
- « Aucun bulletin ne correspond à « … ». » → vérifiez l'orthographe ou la période.
- Une ligne marquée « Données modifiées depuis le calcul » affiche des montants qui ne tiennent pas compte des dernières modifications : demandez un recalcul.
- Le bandeau « N salarié(s) en régime manuel (IRG / CNAS / CACOBATPH) » se déplie pour voir le détail.

**Voir aussi** — 3.5 Afficher et imprimer les bulletins · 3.6 Comprendre le calcul du bulletin · 3.19 Produire les déclarations

---

## 3.5 Afficher et imprimer les bulletins depuis l'écran Paie

> **Vidéo V3.5** · durée estimée 3 min · Public : gestionnaire de paie

**Où la trouver** — Ressources Humaines › Paie › « Calcul de la paie » › barre de période et actions de ligne du tableau.

**À quoi ça sert** — Voir un bulletin tel qu'il sera imprimé, l'imprimer ou l'enregistrer en PDF, un par un ou par page.

**Avant de commencer**
- [ ] Des bulletins existent pour la période choisie.

**Étapes**
1. Choisissez la période et recherchez l'employé si besoin.
2. Pour un salarié : cliquez sur « Bulletin de Paie » dans sa ligne. L'aperçu « Bulletin de Paie » s'ouvre avec les boutons « Imprimer / PDF » et « Fermer ».
3. Pour imprimer directement un salarié : cliquez sur « Imprimer » dans sa ligne.
4. Pour plusieurs salariés : cliquez sur « Afficher Bulletin de Paie » ou « Imprimer les bulletins » dans la barre de période. Ces boutons portent sur **la page affichée** (40 bulletins au plus). Changez de page pour imprimer les suivants.
5. Pour un bulletin validé ou clôturé : cliquez sur « PDF archivé » pour ouvrir le PDF figé créé lors de la validation.

**Contenu du bulletin imprimé**
- Employeur : nom, adresse, NIF, NIS, numéro CNAS, numéro CACOBATPH. Salarié : identité.
- Colonnes : Nbr, Base, Taux, Gain, Retenue.
- Ordre des lignes : classe 1, classe 2, cotisation CNAS salarié, classe 3, IRG, classe 4, classe 5 (retenues).
- Ligne du salaire de base : Nbr = jours payés hors récupération, Base = salaire mensuel, Taux = salaire mensuel ÷ jours du mois.
- Ligne CNAS : taux en % du brut cotisable ; ligne IRG selon le barème (le taux n'est pas affiché) ; lignes intempéries et cotisations supplémentaires s'il y a lieu.
- Totaux, charges salariales et patronales (FOS séparé), coût global (net + charges), explication de l'IRG (mode « Exonéré », « Taux fixe » ou « Barème », abattement, exonération, lissage), mode de paiement et compte.
- Les lignes à zéro peuvent être masquées selon le paramétrage du bulletin.

**Résultat** — Le bulletin s'imprime ou s'enregistre en PDF par la fenêtre d'impression du navigateur. La mention « reprise » n'est jamais imprimée.

**Attention**
- Un bulletin brouillon peut encore changer (recalcul). Pour un document définitif, imprimez après la validation ou utilisez « PDF archivé ».
- « PDF archivé » n'existe que pour les bulletins validés ou clôturés.

**Voir aussi** — 3.6 Comprendre le calcul du bulletin · 3.13 Afficher, imprimer ou recalculer un bulletin depuis Documents · 6.x Modèles de documents

---

## 3.6 Comprendre le calcul du bulletin

> **Vidéo V3.6** · durée estimée 6 min · Public : tous les utilisateurs de la paie

**Où la trouver** — Le résultat du calcul se lit dans l'aperçu « Bulletin de Paie » (fiche 3.5) et dans la vue « Fiches » de l'écran Paie (fiche 3.4). Le calcul lui-même est lancé par une décision D4 ou D3 (fiche 3.3).

**À quoi ça sert** — Comprendre, avec des mots simples, d'où vient chaque ligne du bulletin, pour pouvoir le vérifier et répondre à un salarié.

**Avant de commencer**
- [ ] Ayez sous les yeux le bulletin à vérifier et le pointage validé du mois.
- [ ] Connaissez les rubriques du contrat du salarié (chapitre 1) et leur classe (chapitre 6).

### Ce que le calcul prend en compte

Pour un mois donné, le calcul utilise :
- les règles en vigueur **au 1er du mois** : variables légales (SNMG, diviseur journalier, heures mensuelles…), taux CNAS, barème et règles IRG, cotisations supplémentaires ;
- le contrat de travail principal payable dans le mois (les contrats d'intérim ne sont pas payés par ce module) et la version de salaire en vigueur ;
- **le pointage validé uniquement** (pour une paie de chantier, seulement les jours pointés sur ce chantier) ;
- les rubriques du contrat, du salarié, du poste et du chantier (priorité : salarié, puis contrat, puis poste, puis chantier) ;
- les rubriques exceptionnelles **approuvées**, les heures supplémentaires du pointage, les avances et prêts en cours, la sortie validée du mois.

### L'ordre du calcul

1. **Les jours**
   - **Jours payés** : somme des coefficients des codes de présence des jours validés (un jour normal compte 1), sans dépasser les jours couverts par le contrat. Si la CACOBATPH prend en charge les congés pour ce chantier, les jours de congé annuel sont retirés : ils sont payés par la caisse (« N j de congé annuel payés par la CACOBATPH, exclus du bulletin »).
   - **Jours de récupération (CRP)** : un jour « CRP » compte 1, un jour « CRP/2 » compte 0,5.
   - **Jours travaillés** : jours de présence effective, **jours de récupération exclus**.
2. **La part du mois payée** — Un mois entièrement couvert et payé vaut 1, qu'il ait 28, 30 ou 31 jours. Elle diminue seulement si le contrat commence ou finit en cours de mois (jours couverts ÷ jours du mois) ou s'il y a des jours non payés (chaque jour non payé retire 1/30 ; le diviseur 30 est un paramètre légal).
3. **SALAIRE DE BASE** — salaire mensuel ÷ jours du mois × jours payés hors récupération. Les jours de récupération ne sont pas payés par le salaire de base : ils sont payés par les rubriques de récupération (étape 5).
4. **Les rubriques permanentes**, selon leur mode :

| Mode | Calcul | Réduit par les jours CRP ? |
|---|---|---|
| « Montant /F » (montant fixe du mois) | montant × part du mois payée (mois complet = montant entier) | Non |
| « Pourcentage *% » | salaire mensuel × taux × part du mois payée | Non |
| « Journalier *J » | montant par jour × jours payés hors récupération | Oui |
| « Journalier présence » | montant par jour × jours travaillés | Oui |
| « Mensuel ÷ jours du mois » | montant ÷ jours du mois × jours travaillés | Oui |
| Heures supplémentaires (à l'heure) | heures × (salaire mensuel ÷ heures mensuelles) × (1 + majoration) | Non concerné |

   - Les heures mensuelles valent 173,33 par défaut. Les heures supplémentaires apparaissent en classe 1 sous le libellé « Heures supplémentaires X % ».
5. **Les rubriques de récupération** — Rubriques prévues dans le contrat pour les jours « CRP » seulement. Leur libellé est suivi de « (récupération) ».
   - « Journalier *J » : montant × jours CRP.
   - « Montant /F » : montant ÷ jours du mois × jours CRP.
   - « Pourcentage *% » : salaire mensuel × taux × jours CRP ÷ jours du mois.
   - Rien n'est payé s'il n'y a aucun jour CRP dans le mois.
   - **Pas de double paiement** : si la même rubrique est déjà payée en entier dans le mois (« Montant /F » ou « Pourcentage *% »), sa version récupération n'est pas ajoutée.
   - Une rubrique de nature « Remboursement » se calcule exactement comme une indemnité : c'est un gain, avec les mêmes modes ; placée dans les rubriques de récupération, elle n'est payée que pour les jours CRP.
6. **Les retenues de classe 5** — Le montant est saisi en positif et il est déduit du net. Une retenue de classe 5 exprimée par mois est proratisée comme le salaire de base : montant ÷ jours du mois × jours payés hors récupération.
7. **Les rubriques exceptionnelles approuvées** du mois s'ajoutent avec les mêmes modes de calcul (fiche 3.15), avec deux différences : en « Journalier *J », tous les jours payés comptent, jours de récupération compris ; une retenue exceptionnelle de classe 5 en « Montant /F » est retenue en entier pour un mois complet.
8. **Les cotisations** — Brut cotisable = lignes des classes 1 et 2. Imposable = lignes des classes 1 et 3. Les classes 4 et 5 ne sont ni cotisables ni imposables.
   - CNAS salarié = brut cotisable × taux salarié du régime.
   - CNAS employeur = brut cotisable × (taux employeur + FOS). C'est une charge de l'employeur : elle n'est pas retenue sur le salaire.
   - CACOBATPH congés et intempéries : seulement si l'activité du chantier les prévoit.
9. **L'IRG** — Base IRG = imposable − CNAS salarié (− cotisations salariales supplémentaires déductibles). L'IRG suit le mode du salarié : exonéré, taux fixe, ou barème (barème annuel appliqué à la base × 12 puis divisé par 12, abattement, seuil d'exonération, lissage, abattement de zone le cas échéant).
10. **Le net** = gains + retenues − CNAS salarié − intempéries salarié − autres cotisations salariales − IRG.
11. **Les avances et prêts** — La mensualité est retenue **après l'IRG**, dans la limite du reste dû et du net disponible : le net ne devient jamais négatif. Le mois de sortie du salarié, tout le reste dû est retenu (dans la limite du net).

### Exemple chiffré

M. Karim Benali (salarié fictif), septembre 2026 (30 jours), contrat couvrant tout le mois, salaire mensuel 45 000 DA. Pointage validé : 22 jours de présence, 4 jours « CRP », 4 jours de repos hebdomadaire payés. Pas de congé payé par la caisse. Taux de l'exemple : CNAS salarié 9 %, CNAS employeur 25 % + FOS 0,5 %. Le chantier n'est pas concerné par la CACOBATPH.

**Étape 1 — Les jours**
- Jours payés = 30.
- Jours CRP = 4.
- Jours payés hors récupération = 30 − 4 = 26.
- Jours travaillés = 22 (présence hors CRP).
- Part du mois payée = 1 (mois complet, aucun jour non payé).

**Étape 2 — Le salaire de base**
- 45 000 ÷ 30 × 26 = **39 000 DA**. Sur le bulletin : Nbr 26, Base 45 000, Taux 1 500 DA par jour.

**Étape 3 — Les rubriques** (rubriques et classes choisies pour l'exemple)

| Rubrique (exemple) | Classe | Mode | Calcul | Montant |
|---|---|---|---|---|
| Prime de rendement | 1 | « Montant /F » 3 000 | 3 000 × 1 | 3 000,00 |
| Indemnité de nuisance | 1 | « Pourcentage *% » 10 | 45 000 × 10 % | 4 500,00 |
| Indemnité de zone | 1 | « Mensuel ÷ jours du mois » 3 000 | 3 000 ÷ 30 × 22 | 2 200,00 |
| Indemnité de transport | 4 | « Journalier *J » 100 | 100 × 26 | 2 600,00 |
| Prime de panier | 4 | « Journalier présence » 300 | 300 × 22 | 6 600,00 |
| Indemnité de récupération (récupération) | 1 | « Journalier *J » 750, jours CRP | 750 × 4 | 3 000,00 |
| Retenue de garantie | 5 | « Montant /F » 9 000 par mois | 9 000 ÷ 30 × 26 | − 7 800,00 |

- Si la « Prime de rendement » figurait aussi dans les rubriques de récupération, elle ne serait pas ajoutée une seconde fois : elle est déjà payée en entier.
- Heures supplémentaires (pour information, M. Benali n'en a pas ce mois) : 8 heures à 50 % donneraient 45 000 ÷ 173,33 = 259,62 DA de l'heure, puis 8 × 259,62 × 1,5 = 3 115,44 DA.

**Étape 4 — Les totaux et les cotisations**
- Gains = 39 000 + 3 000 + 4 500 + 2 200 + 2 600 + 6 600 + 3 000 = **60 900,00 DA**.
- Brut cotisable (classes 1 et 2) = 39 000 + 3 000 + 4 500 + 2 200 + 3 000 = **51 700,00 DA**.
- Imposable (classes 1 et 3) = 51 700,00 DA.
- CNAS salarié = 51 700 × 9 % = **4 653,00 DA** (retenu sur le salaire).
- CNAS employeur + FOS = 51 700 × 25,5 % = 13 183,50 DA (charge de l'employeur, non retenue).

**Étape 5 — L'IRG**
- Base IRG = 51 700 − 4 653 = **47 047,00 DA**.
- Dans cet exemple, le barème paramétré est supposé être : 0 % jusqu'à 240 000 DA par an, 23 % jusqu'à 480 000 DA, 27 % jusqu'à 960 000 DA, avec un abattement de 40 % de l'impôt, borné entre 1 000 et 1 500 DA par mois.
- Base annuelle = 47 047 × 12 = 564 564 DA. Impôt annuel = 240 000 × 23 % + 84 564 × 27 % = 78 032,28 DA, soit 6 502,69 DA par mois.
- Abattement = 40 % de 6 502,69 = 2 601,08, ramené au maximum de 1 500 DA.
- IRG = 6 502,69 − 1 500 = **5 002,69 DA**. Le détail de ce calcul est imprimé sous le bulletin.

**Étape 6 — Le net**
- Net = 60 900,00 − 7 800,00 − 4 653,00 − 5 002,69 = **43 444,31 DA**.

**Étape 7 — L'avance**
- M. Benali a une avance de 15 000 DA avec une retenue mensuelle de 5 000 DA. Ligne « Retenue avance » : − 5 000 DA.
- **Net à payer = 38 444,31 DA**. Reste à retenir sur l'avance : 10 000 DA.

### Un bulletin calculé ne change pas tout seul

Un bulletin déjà calculé garde ses montants, même si vous modifiez ensuite une règle, une rubrique, un contrat, un salaire ou le pointage. L'application signale seulement « Données modifiées depuis le calcul ». Pour appliquer les nouvelles données :
- depuis l'écran Paie : « Demander un recalcul » (fiche 3.2) ;
- depuis Documents › « Registre » › « Bulletin de paie » : « Recalculer » (fiche 3.13).

Le recalcul passe toujours par une décision D3. Un bulletin validé ou clôturé n'est jamais recalculé sans réouverture (décision D7, fiche 3.11).

**Résultat** — Vous savez retrouver l'origine de chaque montant : jours, salaire de base, rubriques, récupération, retenues, cotisations, IRG, net et avance.

**Attention**
- Les taux et le barème de l'exemple sont donnés pour illustrer le calcul. Les taux réels sont ceux affichés dans le bandeau des taux de l'écran Paie et dans Cotisations & impôts.
- Une rubrique « Pourcentage *% » se calcule sur le salaire mensuel du contrat, pas sur le montant de la ligne SALAIRE DE BASE.
- Le salaire de base inférieur au SNMG ou à la grille déclenche un avertissement, pas un blocage.
- Un montant négatif n'est accepté qu'en classe 5 : « Montant négatif accepté seulement en classe 5 (retenues). »

**Voir aussi** — 3.7 Consulter la traçabilité d'un bulletin · 3.15 Saisir et approuver une rubrique exceptionnelle · 3.16 Enregistrer une avance ou un prêt · 3.25 Simuler une fiche de paie · 1.x Contrats et rubriques · 5.x Barème IRG

---

## 3.7 Consulter la traçabilité d'un bulletin

> **Vidéo V3.7** · durée estimée 3 min · Public : gestionnaire de paie

**Où la trouver** — Ressources Humaines › Paie › « Calcul de la paie » › action de ligne « Traçabilité ».

**À quoi ça sert** — Justifier chaque montant d'un bulletin : quelle décision l'a calculé, quel contrat, quelle affectation, quelle version de salaire et quelles règles légales (avec leur version) ont servi.

**Avant de commencer**
- [ ] Le bulletin a été calculé.

**Étapes**
1. Repérez la ligne du salarié. Une icône d'alerte sur « Traçabilité » signale que des règles non vérifiées ont servi au calcul.
2. Cliquez sur « Traçabilité ». La fenêtre « Traçabilité du bulletin » s'ouvre.
3. Lisez les rubriques :
   - « Décision de paie (D4 / D3) » : lien vers la décision qui a calculé le bulletin ;
   - « Contrat » (avec l'exception de début de contrat, décision D13 (Contrat ne commençant pas le 1er), le cas échéant) ;
   - « Affectation du mois » : « chantier de la fiche contrat » ou affectation corrigée par la décision D8 (Correction d'affectation) ;
   - « Version de salaire » : « salaire de la fiche contrat » ou version datée ;
   - le tableau des règles : « Règle » (Variable légale, Taux CNAS du régime, Barème IRG, Règles IRG, Périmètre de zone IRG), « Version », « Statut », « Décision D2 » (Date d'application d'une règle légale).
4. Si un avertissement signale des règles reprises non vérifiées, cliquez sur « Cotisations & impôts » pour les faire approuver.

**Résultat** — Vous disposez de la justification complète du bulletin. La fenêtre est en lecture seule.

**Attention**
- Des règles non vérifiées n'empêchent pas le calcul, mais elles doivent être approuvées avant de considérer les montants comme sûrs.

**Voir aussi** — 3.3 Décider la génération, le recalcul ou la simulation · 3.6 Comprendre le calcul du bulletin · 5.x Propositions légales et décision D2

---

## 3.8 Valider la paie

> **Vidéo V3.8** · durée estimée 4 min · Public : ADMIN_RH, GERANT, SUPER_ADMIN

**Où la trouver** — Ressources Humaines › Paie › « Calcul de la paie » › barre d'état du mois › bouton « Valider la paie ».

**À quoi ça sert** — Figer les bulletins et le pointage du mois pour le chantier sélectionné, et archiver les bulletins en PDF. Après la validation, la paie peut être virée et déclarée.

**Avant de commencer**
- [ ] La paie du chantier est au statut « Brouillon » et contient au moins un bulletin.
- [ ] Aucun chip « Données modifiées depuis le calcul » : la décision D3 (Recalcul des paies brouillon) a été prise.
- [ ] Aucun jour « proposé » (ordres de mission) n'est resté non validé dans le pointage du mois.
- [ ] Aucune règle légale du mois n'attend son approbation (décision D1, Paie d'un mois aux règles non approuvées).
- [ ] Aucun mois de reprise n'est resté ouvert ; sinon voir la fiche 3.9.
- [ ] Vous avez contrôlé les bulletins (fiches 3.4 à 3.7).

**Étapes**
1. Sélectionnez le « Chantier », l'« Année » et le « Mois », puis « Voir ce mois ».
2. Vérifiez la barre d'état : statut « Brouillon », nombre de bulletins, absence d'alerte bloquante.
3. Cliquez sur « Valider la paie ». La validation est immédiate.

**Résultat** — Message « Paie validée : bulletins et pointage du mois figés (réouverture seulement sur décision D7 du SUPER_ADMIN). » suivi de « N bulletin(s) archivé(s) en PDF. ». Tous les bulletins du chantier passent au statut « Validée » et le pointage du mois n'est plus modifiable. Le bouton « PDF archivé » apparaît sur chaque ligne.

**Attention**
- Le bouton est désactivé s'il n'y a aucun bulletin ou si des modifications attendent une décision (infobulle : « Validation bloquée tant qu'une décision de recalcul n'a pas été prise. »).
- « Aucun bulletin à valider : générez la paie d'abord. »
- « N jour(s) proposé(s) (ordres de mission) non validé(s) dans le pointage. » → validez ou refusez ces jours dans le pointage (chapitre 2).
- « Données modifiées depuis le calcul : décidez de recalculer ou de conserver les bulletins (Centre de décisions) avant de valider. »
- « Validation bloquée : des mois de reprise (janvier à août 2026) restent ouverts. Décision D6 requise (Centre de décisions) : attendre, figer leurs paramètres ou séparer la chaîne de reprise. » → fiche 3.9.
- « Validation réservée à SUPER_ADMIN, ADMIN_RH et GERANT. »
- « Paie déjà validée. » / « Paie introuvable. » → rechargez la page.
- « Archive PDF non créée : … » → la paie est validée, mais l'archive a échoué ; elle sera complétée à la clôture.

**Voir aussi** — 3.9 Demander la décision D6 · 3.10 Clôturer le mois · 3.11 Demander la réouverture d'une paie · 3.17 Préparer et suivre un lot de virements

---

## 3.9 Demander la décision D6 (mois de reprise ouverts)

> **Vidéo V3.9** · durée estimée 3 min · Public : ADMIN_RH, GERANT, SUPER_ADMIN

**Où la trouver** — Ressources Humaines › Paie › « Calcul de la paie » › barre d'état › bouton « Demander la décision D6 » (il remplace « Valider la paie » quand des mois de reprise restent ouverts).

**À quoi ça sert** — Obtenir la décision D6 (Clôture des mois de reprise) avant de valider une paie opérationnelle alors que des mois de janvier à août 2026 ne sont pas encore clôturés.

**Avant de commencer**
- [ ] Le chip « Validation soumise à décision D6 (mois de reprise ouverts) » est affiché.
- [ ] La paie est au statut « Brouillon », contient des bulletins et n'a pas de modification en attente.
- [ ] Aucune décision D6 n'existe déjà.

**Étapes**
1. Cliquez sur « Demander la décision D6 ». La demande est créée et les décideurs sont prévenus (« Validation de la paie … : mois de reprise encore ouverts »).
2. Le décideur choisit au Centre de décisions l'une des options : « Attendre », « Valider en figeant les paramètres des mois de reprise » ou « Chaîne de clôture séparée pour les mois de reprise ». Il s'agit d'une décision « À risque » (case de confirmation obligatoire, fiche 3.3).
3. Une fois la décision prise, revenez sur l'écran Paie et validez la paie (fiche 3.8) si l'option choisie le permet.

**Résultat** — Pendant l'attente, le chip « Validation bloquée · décision D6 en attente » est affiché. Après la décision, la validation se fait depuis l'écran Paie.

**Attention**
- « Politique de clôture (D6) définitive : elle ne se modifie ni ne se supprime. » Choisissez l'option avec soin.
- Le bouton est désactivé s'il n'y a aucun bulletin ou si des modifications attendent une décision D3.

**Voir aussi** — 3.8 Valider la paie · 3.3 Décider la génération, le recalcul ou la simulation · Annexe A Décisions

---

## 3.10 Clôturer le mois

> **Vidéo V3.10** · durée estimée 2 min · Public : GERANT, SUPER_ADMIN

**Où la trouver** — Ressources Humaines › Paie › « Calcul de la paie » › barre d'état › bouton « Clôturer le mois ».

**À quoi ça sert** — Clôturer définitivement la paie d'un mois pour un chantier. Toute correction ultérieure passera en rappel sur le mois suivant.

**Avant de commencer**
- [ ] La paie du chantier est au statut « Validée ».
- [ ] Les virements et déclarations du mois sont préparés ou vérifiés.

**Étapes**
1. Sélectionnez le chantier et le mois, puis « Voir ce mois ».
2. Cliquez sur « Clôturer le mois ».
3. Lisez la confirmation « Clôturer définitivement la paie MM/AAAA — {chantier} ? Bulletins et pointage du mois seront figés ; les corrections passeront en rappel le mois suivant. » puis cliquez sur « OK ».

**Résultat** — Message « Paie clôturée définitivement. ». Les bulletins passent au statut « Clôturée ». Les bulletins qui n'avaient pas encore d'archive PDF sont archivés.

**Attention**
- « Validez la paie avant de la clôturer. »
- « Clôture réservée à SUPER_ADMIN et GERANT. »
- Après la clôture, toute modification est refusée : « Paie clôturée : aucune modification sans décision D7 du SUPER_ADMIN. »

**Voir aussi** — 3.8 Valider la paie · 3.11 Demander la réouverture d'une paie · 3.15 Saisir et approuver une rubrique exceptionnelle (rappel)

---

## 3.11 Demander la réouverture d'une paie (D7)

> **Vidéo V3.11** · durée estimée 5 min · Public : ADMIN_RH, GERANT, SUPER_ADMIN (demande) ; SUPER_ADMIN (décision)

**Où la trouver** — Ressources Humaines › Paie › « Calcul de la paie » › barre d'état › bouton « Demander la réouverture (D7) ».

**À quoi ça sert** — Remettre en brouillon une paie validée ou clôturée pour la corriger. La réouverture passe par la décision D7 (Réouverture d'une paie), réservée au SUPER_ADMIN.

**Avant de commencer**
- [ ] La paie est au statut « Validée » ou « Clôturée ».
- [ ] Aucune demande D7 n'est déjà ouverte pour cette paie.
- [ ] **Aucun lot de virement généré ou déposé** n'existe pour cette paie : annulez-le, ou enregistrez son exécution (fiche 3.17).
- [ ] Vous connaissez le motif précis de la correction.

**Étapes**
1. Cliquez sur « Demander la réouverture (D7) ». La fenêtre « Demander la réouverture — MM/AAAA · {chantier} » s'ouvre (sous-titre « Paie {statut} · décision D7 du SUPER_ADMIN »).
2. Lisez l'avertissement : la paie reste validée ou clôturée jusqu'à la décision ; une copie figée de chaque bulletin sera conservée ; les virements exécutés, les déclarations et les certificats ne sont pas annulés.
3. Saisissez le « Motif de la réouverture » (obligatoire, de 10 à 500 caractères, visible du décideur).
4. Cliquez sur « Envoyer la demande » (ou « Annuler »). La page de la décision s'ouvre.
5. Le SUPER_ADMIN consulte le contexte affiché (statut, bulletins, Brut / IRG / Net, copies figées déjà conservées, virements, exports de déclaration, opérations externes, documents émis, mois suivants validés, décisions antérieures) et choisit « Réouvrir la paie » ou « Ne pas réouvrir ».

**Résultat**
- Pendant l'attente : chip « Réouverture demandée · décision D7 en attente ».
- Après « Réouvrir la paie » : une copie figée de chaque bulletin est conservée (fiche 3.12), la paie et ses bulletins repassent en « Brouillon », le pointage du mois redevient modifiable. **Aucun recalcul n'est fait** : corrigez les données puis demandez un recalcul (décision D3, fiche 3.2). Les virements déjà exécutés sont conservés et un nouveau virement est bloqué ; les déclarations et certificats ne sont pas modifiés.

**Attention**
- « Motif de la réouverture obligatoire (10 caractères minimum). » / « Motif trop long (500 caractères maximum). »
- « Seule une paie validée ou clôturée se réouvre (décision D7). »
- « Lot de virement généré ou déposé pour cette paie : annulez-le, ou enregistrez son exécution, avant de demander la réouverture. »
- « Demande de réouverture non autorisée. » → vos droits ne le permettent pas.
- La décision D7 est « À risque » et ne peut être déléguée : seul le SUPER_ADMIN la tranche.

**Voir aussi** — 3.12 Consulter l'historique des bulletins · 3.2 Demander la génération ou un recalcul · 3.17 Préparer et suivre un lot de virements

---

## 3.12 Consulter l'historique des bulletins

> **Vidéo V3.11** · durée estimée 5 min (vidéo commune avec 3.11) · Public : ADMIN_RH, GERANT, SUPER_ADMIN

**Où la trouver** — Ressources Humaines › Paie › « Calcul de la paie » › barre d'état › bouton « Historique (N) ».

**À quoi ça sert** — Retrouver les copies figées des bulletins conservées avant chaque réouverture (décision D7), pour comparer l'ancien et le nouveau calcul.

**Avant de commencer**
- [ ] La paie a déjà été réouverte au moins une fois (sinon le compteur est à 0).

**Étapes**
1. Cliquez sur « Historique (N) ». La fenêtre « Historique des bulletins — … » s'ouvre, sous-titre « Copies figées conservées avant chaque réouverture (D7) ».
2. Tapez un nom dans « Rechercher un salarié… ».
3. Lisez les colonnes : Salarié, V. (numéro de version), Statut, Brut, IRG, Net, « Figée le » (avec le lien vers la décision D7).

**Résultat** — Vous voyez les montants tels qu'ils étaient avant chaque réouverture. Si aucune copie n'existe : « Aucune copie figée pour cette paie. »

**Attention**
- L'historique est en lecture seule. Une copie figée n'est jamais restaurée automatiquement.

**Voir aussi** — 3.11 Demander la réouverture d'une paie

---

## 3.13 Afficher, imprimer ou recalculer un bulletin depuis Documents

> **Vidéo V3.12** · durée estimée 4 min · Public : gestionnaire de paie

**Où la trouver** — Ressources Humaines › Documents › « Registre » › carte « Bulletin de paie » (`/rh/documents?onglet=bulletins`). L'ancienne adresse des bulletins de la paie mène aussi ici.

**À quoi ça sert** — Retrouver tous les bulletins déjà établis, tous mois confondus, les afficher, les imprimer et, s'ils sont encore en brouillon, les recalculer avec les données actuelles.

**Avant de commencer**
- [ ] Des bulletins ont déjà été calculés.
- [ ] Pour recalculer : la paie du mois est au statut « Brouillon ».

**Étapes**
1. Ouvrez la carte « Bulletin de paie » (résumé « Par période de paie »). L'écran « Bulletins de paie » s'affiche.
2. Recherchez dans « Rechercher (matricule, nom, chantier)… » et/ou choisissez une période (« Toutes les périodes » ou un mois). Le compteur indique le nombre de bulletins (50 par page).
3. Lisez les colonnes : Période, Employé, Chantier, Jours, Net à payer, Statut.
4. Cliquez sur « Afficher » : la fenêtre « Bulletin de paie MM/AAAA » s'ouvre avec « Fermer » et « Imprimer ». Ou cliquez directement sur « Imprimer ».
5. Bulletin brouillon dont les données ont changé depuis le calcul : « Afficher » et « Imprimer » ouvrent d'abord une fenêtre de décision « Décision D3 — MM/AAAA » avec le texte « Son bulletin brouillon a été calculé avant les dernières modifications (contrat, rubriques ou pointage) : il doit être recalculé pour être juste. » Choisissez :
   - « Recalculer et afficher » (SUPER_ADMIN) : saisissez la « Justification de la décision » (pré-remplie, 10 caractères minimum), la paie est recalculée puis le bulletin à jour s'affiche ;
   - « Afficher sans recalculer » : le bulletin s'affiche avec ses anciens montants.
6. Pour forcer un recalcul d'un bulletin brouillon : cliquez sur « Recalculer » (infobulle « Recalculer ce bulletin brouillon avec les règles et données actuelles »). La même fenêtre de décision s'ouvre.
7. Pour un bulletin validé ou clôturé : cliquez sur « PDF archivé ».

**Résultat** — Le bulletin s'affiche ou s'imprime. Après « Recalculer et afficher », la paie brouillon du mois est recalculée par une décision D3 (Recalcul des paies brouillon) : le recalcul porte sur toute la paie du mois concernée, pas seulement sur ce salarié.

**Attention**
- Un bulletin calculé n'est jamais mis à jour automatiquement : sans recalcul, il garde les montants de son calcul.
- Seul le SUPER_ADMIN peut décider directement depuis cette fenêtre. Les autres utilisateurs voient : « Vous êtes à l'origine de la demande : un autre décideur doit la trancher au Centre de décisions. Le bulletin apparaîtra ensuite dans cette liste. » La demande D3 reste ouverte au Centre de décisions.
- « Recalculer » n'apparaît pas pour un bulletin validé ou clôturé : « Bulletin validé : montants figés. Une réouverture (décision D7) est nécessaire pour recalculer. »
- « Décision prise, calcul échoué : … » → lisez le motif, corrigez puis relancez.
- « Aucun bulletin ne correspond à la recherche. » / « Aucun bulletin établi pour le moment. »

**Voir aussi** — 3.14 Établir un nouveau bulletin de paie · 3.6 Comprendre le calcul du bulletin · 3.11 Demander la réouverture d'une paie · 4.x Registre des documents

---

## 3.14 Établir un nouveau bulletin de paie

> **Vidéo V3.13** · durée estimée 4 min · Public : gestionnaire de paie (décision directe : SUPER_ADMIN)

**Où la trouver** — Ressources Humaines › Documents › « Registre » › « Bulletin de paie » › bouton « Nouveau bulletin de paie ».

**À quoi ça sert** — Obtenir le bulletin d'un salarié pour un mois donné. S'il existe et qu'il est à jour, il s'affiche ; sinon, l'application ouvre la décision nécessaire pour générer ou recalculer la paie du mois.

**Avant de commencer**
- [ ] Le salarié a un contrat de travail payable dans le mois.
- [ ] Son pointage du mois est validé.

**Étapes**
1. Cliquez sur « Nouveau bulletin de paie ». La fenêtre s'ouvre avec le sous-titre « Choisissez l'employé et le mois. La paie du mois couvre tous les chantiers où il a travaillé. »
2. Renseignez « Employé » (obligatoire, recherche « Matricule ou nom… »), « Mois » (obligatoire, 01 à 12) et « Année » (obligatoire).
3. Cliquez sur « Établir le bulletin » (le bouton affiche « Recherche… » pendant la vérification).
   - Si le bulletin existe et qu'il est à jour, il s'affiche directement.
4. Sinon, un encadré « Décision Dx — MM/AAAA » explique la décision ouverte :
   - D4 : « Générer la paie du mois (tous les chantiers). Une paie brouillon est créée ; rien n'est validé, payé ni déclaré. »
   - D3 : « Recalculer la paie brouillon du mois avec les données actuelles (contrats, rubriques, pointage). »
   - D1 : « Des règles du mois attendent une approbation : la paie ne peut pas encore être générée. La demande (D1) est ouverte au Centre de décisions. »
5. Si vous êtes SUPER_ADMIN (et pour D4 ou D3 seulement) : vérifiez la « Justification de la décision » pré-remplie (« Bulletin de paie MM/AAAA de {matricule} {nom}. »), puis cliquez sur « Générer et afficher » ou « Recalculer et afficher » (le bouton affiche « Calcul de la paie… »). Pour un bulletin existant mais ancien, vous pouvez aussi choisir « Afficher sans recalculer ».
6. Sinon, cliquez sur « Fermer » : un décideur tranchera la demande au Centre de décisions, puis le bulletin apparaîtra dans la liste.

**Résultat** — Le bulletin s'affiche. Si aucune paie par chantier n'existe pour ce mois, ce chemin crée une paie brouillon pour toute l'entreprise (sans chantier).

**Attention**
- « Choisissez l'employé, le mois et l'année. »
- « Aucun contrat de travail payable en MM/AAAA pour cet employé : enregistrez d'abord son contrat. »
- « La paie de MM/AAAA est établie par chantier (…) et ce salarié n'y figure pas : ajoutez son pointage validé sur ce chantier puis recalculez depuis l'écran Paie. »
- « La paie de MM/AAAA est déjà validée ou clôturée sans ce salarié : réouvrez-la depuis l'écran Paie. »
- « Paie de MM/AAAA calculée, mais sans bulletin pour cet employé (contrat ou pointage du mois à vérifier). »
- « Justification obligatoire (10 caractères minimum). »
- Une paie validée ou clôturée ne se recalcule pas depuis cette fenêtre.

**Voir aussi** — 3.13 Afficher, imprimer ou recalculer un bulletin depuis Documents · 3.2 Demander la génération ou un recalcul · 1.x Créer un contrat de travail

---

## 3.15 Saisir et approuver une rubrique exceptionnelle

> **Vidéo V3.14** · durée estimée 5 min · Public : ADMIN_RH, GERANT, SUPER_ADMIN

**Où la trouver** — Ressources Humaines › Paie › « Exceptions » (`/rh/paie/exceptions`), écran « Rubriques exceptionnelles ».

**À quoi ça sert** — Ajouter à un salarié, pour un mois ou jusqu'à un mois de fin, un élément hors contrat permanent : prime, indemnité, retenue, rappel. Seules les exceptions **approuvées** entrent dans le bulletin.

**Avant de commencer**
- [ ] La rubrique existe dans le dictionnaire des rubriques (chapitre 6).
- [ ] Le mois visé n'est ni validé ni clôturé pour ce salarié.
- [ ] Un second responsable est disponible pour approuver (double validation).

**Étapes — saisir**
1. Cliquez sur « Nouvelle exception ». La fenêtre « Exception salariale » s'ouvre.
2. Choisissez l'« Employé » (obligatoire), la « Classe », puis la « Rubrique » (obligatoire, filtrée par classe). Le montant et l'unité par défaut de la rubrique sont pré-remplis.
3. Choisissez le « Mode » : Pourcentage (*%), Montant (/F), Journalier (*J) ou Mensuel ÷ jours du mois.
4. Saisissez la « Valeur » (suffixe %, DA, DA/j ou DA/mois). En classe 5, la mention « · retenue » rappelle que le montant, saisi en positif, est déduit du net.
5. Renseignez l'« Année », le « Mois » et la « Durée » : « Une fois ce mois » ou « Jusqu'au mois » (puis « Fin année » et « Fin mois »).
6. Saisissez le « Motif obligatoire » (8 caractères minimum).
7. Cliquez sur « Enregistrer ».

**Étapes — approuver et gérer**
1. Recherchez l'exception (« Employé, rubrique, motif… »).
2. Une autre personne que l'auteur clique sur « Approuver ». Le GERANT et le SUPER_ADMIN peuvent approuver leurs propres saisies.
3. Selon le statut, utilisez aussi :
   - « Modifier » (brouillon seulement) ;
   - « Supprimer » (brouillon seulement, confirmation « Supprimer ce brouillon ? ») ;
   - « Annuler » (exception approuvée, « Motif de l'annulation (facultatif) »).

**Résultat** — Après l'enregistrement : « Brouillon enregistré : il doit être approuvé pour entrer en paie. » Le tableau affiche Employé, Rubrique, Période (MM/AAAA → fin, ou « une fois », et motif), Montant (avec le mode), Statut (« Brouillon », « Approuvée », « Annulée », auteur, approbateur et date). L'approbation ou l'annulation signale la paie brouillon « Données modifiées depuis le calcul » : un recalcul (décision D3) est nécessaire pour que le bulletin en tienne compte.

**Attention**
- « Choisissez l'employé. » / « Choisissez la rubrique. » / « Motif obligatoire (8 caractères). »
- « Indiquez le mois de fin. » / « La fin doit être après le début. »
- « Mois MM/AAAA déjà validé ou clôturé pour cet employé : choisissez un mois ouvert (rappel). »
- « Double validation : l'exception doit être approuvée par une autre personne (Gérant ou autre responsable). » ; l'écran affiche « À approuver par un autre responsable » sur vos propres saisies.
- « Seul un brouillon est modifiable : annulez l'exception puis recréez-la. »
- « Exception déjà payée sur une paie validée / clôturée : corrigez par une retenue ou un rappel. »
- « Mois déjà validés conservés : l'exception est arrêtée au dernier mois figé. »
- « Montant négatif accepté seulement en classe 5 (retenues). »

**Voir aussi** — 3.6 Comprendre le calcul du bulletin · 3.2 Demander la génération ou un recalcul · 6.x Dictionnaire des rubriques

---

## 3.16 Enregistrer une avance ou un prêt

> **Vidéo V3.15** · durée estimée 4 min · Public : ADMIN_RH, GERANT, SUPER_ADMIN

**Où la trouver** — Ressources Humaines › Paie › « Avances » (`/rh/paie/avances`), écran « Avances & prêts ».

**À quoi ça sert** — Enregistrer une avance sur salaire ou un prêt accordé à un salarié. Chaque mois, la paie retient la mensualité jusqu'au remboursement complet, sans rendre le net négatif.

**Avant de commencer**
- [ ] Le montant, la mensualité et le premier mois de retenue sont connus.

**Étapes — créer**
1. Dans le formulaire « Nouvelle avance / prêt », choisissez l'« Employé » (obligatoire).
2. Choisissez le « Type » : « Avance sur salaire » ou « Prêt ».
3. Saisissez le « Montant accordé » (obligatoire).
4. Saisissez la « Retenue mensuelle ». L'écran indique le nombre de mois correspondant. Pour une avance, laissez vide pour retenir tout le montant en une fois (« = montant (1 mois) »).
5. Choisissez la « Première retenue (mois) » et la « Date d'octroi ».
6. Saisissez le « Motif » (obligatoire, 3 caractères minimum).
7. Cliquez sur « Enregistrer ».

**Étapes — suivre et annuler**
1. Filtrez « En cours » ou « Toutes ». Le total « Reste à retenir : X DA » s'affiche.
2. Lisez les colonnes : Employé, Type (avec « Annulée » ou « Soldée »), Montant, Mensualité, Retenu, Reste, Début, Motif.
3. Pour arrêter les retenues, cliquez sur « Annuler » et confirmez « Annuler {type} de {employé} ? Le reste ne sera plus retenu. »

**Résultat** — « Enregistré : la retenue sera appliquée sur les prochaines paies. » Sur le bulletin, la ligne s'appelle « Retenue avance » ou « Remboursement prêt » ; elle n'est ni cotisable ni imposable et elle est retenue après l'IRG (voir l'exemple de la fiche 3.6). Toute création ou annulation signale la paie brouillon « Données modifiées depuis le calcul » (décision D3).

**Attention**
- « Employé requis » / « Montant requis » / « Mensualité requise » / « Date invalide » / « Motif requis (3 caractères min.) » / « La mensualité dépasse le montant. »
- La retenue est limitée au reste dû et au net disponible : si le net ne suffit pas, elle est réduite (avertissement « retenue d'avance réduite pour garder un net ≥ 0 »).
- Le mois de sortie du salarié, tout le reste dû est retenu, dans la limite du net.
- « Retenu » additionne les retenues de toutes les paies du salarié, y compris les paies encore en brouillon.

**Voir aussi** — 3.6 Comprendre le calcul du bulletin · 3.8 Valider la paie · 1.x Enregistrer une sortie

---

## 3.17 Préparer et suivre un lot de virements

> **Vidéo V3.16** · durée estimée 6 min · Public : ADMIN_RH, GERANT, SUPER_ADMIN

**Où la trouver** — Ressources Humaines › Paie › « Virements » (`/rh/paie/virements`), écran « Virements des salaires ». Aussi par le lien « Virements CCP / banque » de l'écran Paie.

**À quoi ça sert** — Produire le fichier de virement des salaires (CCP ou banque) à partir des bulletins validés ou clôturés, puis suivre son dépôt et son exécution.

**Avant de commencer**
- [ ] Les bulletins du mois sont « Validée » ou « Clôturée » (fiche 3.8).
- [ ] Le compte de chaque salarié est renseigné dans sa fiche, et son mode de paiement correspond au mode du lot (chapitre 1).
- [ ] Le compte donneur d'ordre de l'entreprise (CCP ou RIB) est connu.
- [ ] Le format du fichier a été validé une première fois par votre banque ou Algérie Poste (le format proposé est générique).

**Étapes**
1. Choisissez l'« Année », le « Mois », le « Mode » (« CCP · texte à positions fixes » ou « Banque · CSV (;) ») et le « Chantier » (ou « Tous les chantiers »).
2. Saisissez le « Compte donneur d'ordre » (« CCP / RIB entreprise ») et la « Date de valeur ».
3. Cliquez sur « Préparer le lot ». L'aperçu affiche « N virement(s) · X DA » et, le cas échéant, les bulletins écartés : brouillons exclus, déjà dans un lot, comptes à corriger (« Compte CCP manquant », « Compte CCP > 10 chiffres », « Clé CCP (2 chiffres) manquante », « RIB bancaire incomplet (20 chiffres attendus) »).
4. Corrigez au besoin les comptes dans les fiches des salariés, puis préparez de nouveau.
5. Cliquez sur « Générer le fichier » et confirmez « Générer le lot {mode} : N virement(s), total X DA ? Les bulletins inclus ne pourront plus être réouverts tant que le lot n'est pas annulé. »
6. Dans le tableau des lots, cliquez sur « Fichier » pour télécharger le fichier, puis remettez-le à la banque ou à Algérie Poste.
7. Suivez le lot :
   - « Déposé » : fenêtre « Dépôt du lot X », saisissez la « Référence du bordereau / accusé » (obligatoire) et la « Date de dépôt », puis « Enregistrer le dépôt » ;
   - « Exécuté » : quand la banque confirme le paiement ;
   - « Annuler le dépôt » : pour revenir sur un dépôt enregistré ;
   - « Annuler le lot » : saisissez le « Motif de l'annulation (obligatoire) : ».
8. Cliquez sur « Détail » pour voir le contenu d'un lot.

**Résultat** — Un lot numéroté est créé avec son fichier (nom du type VIR_mode_numéro_date, libellé « SALAIRE MM/AAAA ») et son empreinte de contrôle. Le tableau affiche Lot, Mode, Chantier, Virements, Total (DA), Statut / dépôt (« Généré », « Déposé », « Exécuté », « Annulé »). Le chip « N lot(s) actif(s) · X DA » résume le mois.

**Attention**
- Un bulletin ne peut figurer que dans un seul lot actif.
- Tant qu'un lot est généré ou déposé, la paie ne peut pas être réouverte (fiche 3.11).
- « Aucun bulletin virable par un lot ordinaire pour ce mode (déjà en lot, brouillon, compte manquant ou bloqué D9). »
- « Numéro de lot pris par une création simultanée : réessayez. » / « Un bulletin vient d'être inclus dans un autre lot : régénérez. »
- Les bulletins d'un mois de reprise, déjà virés par un lot exécuté ou couverts par un paiement externe sont bloqués : voir la fiche 3.18.

**Voir aussi** — 3.18 Débloquer des virements (décision D9) · 3.22 Enregistrer et suivre une opération externe · 1.x Fiche employé (compte et mode de paiement)

---

## 3.18 Débloquer des virements (décision D9)

> **Vidéo V3.17** · durée estimée 4 min · Public : ADMIN_RH, GERANT, SUPER_ADMIN

**Où la trouver** — Ressources Humaines › Paie › « Virements » › zone des bulletins bloqués et liste « Décisions D9 du mois ».

**À quoi ça sert** — Traiter les bulletins qu'aucun lot ordinaire ne peut virer, pour éviter un double paiement. La décision D9 (Virement bloqué) choisit entre aucun virement, un état de rapprochement ou un vrai lot de virement.

**Avant de commencer**
- [ ] La zone « N bulletin(s) bloqué(s) · X DA — aucun virement sans décision D9 » apparaît.
- [ ] Vous avez vérifié pourquoi chaque bulletin est bloqué : paie de reprise, « Salaire du mois déjà viré par un lot exécuté » ou « Paiement externe enregistré ».

**Étapes**
1. Cochez les bulletins concernés.
2. Saisissez le « Motif de la demande D9 » (10 à 500 caractères).
3. Cliquez sur « Demander la décision D9 (N) ». Message : « Décision D9 demandée : aucun virement tant qu'elle n'est pas tranchée par un décideur habilité. » Cliquez sur « Ouvrir la décision » pour la suivre.
4. Un autre décideur choisit une option (décision « À risque ») : « Aucun virement », « État de rapprochement non bancaire » ou « Lot de virement réel — risque de double paiement ».
5. Revenez sur « Virements ». Dans « Décisions D9 du mois » :
   - « Générer le lot (D9) » : confirmez le message qui rappelle le « RISQUE DE DOUBLE PAIEMENT » ;
   - ou « Produire l'état de rapprochement » : confirmez « …(une seule fois) ? Ce n'est pas un ordre de paiement. ». Un fichier CSV est téléchargé.

**Résultat** — Selon l'option : aucun fichier ; un état de rapprochement portant l'en-tête « ETAT DE RAPPROCHEMENT NON BANCAIRE - CE N'EST PAS UN ORDRE DE PAIEMENT - NE PAS DEPOSER » ; ou un lot réel marqué « Risque de double paiement » avec le lien vers la décision D9. La décision s'exécute une seule fois.

**Attention**
- « Motif de la demande obligatoire (10 à 500 caractères). »
- « Décision D9 « lot de virement réel » requise (décidée, non encore utilisée). »
- « Lot différent du périmètre de la décision D9 (mois, chantier ou mode). » → reprenez les mêmes mois, chantier et mode que la demande.
- « Certains bulletins de la décision D9 ne peuvent plus être virés… » → demandez une nouvelle décision.
- Ne déposez jamais un état de rapprochement à la banque.

**Voir aussi** — 3.17 Préparer et suivre un lot de virements · 3.22 Enregistrer et suivre une opération externe · 3.3 Décider (procédure du Centre de décisions)

---

## 3.19 Produire les déclarations depuis l'écran Paie

> **Vidéo V3.18** · durée estimée 5 min · Public : ADMIN_RH, GERANT, SUPER_ADMIN

**Où la trouver** — Ressources Humaines › Paie › « Calcul de la paie » › barre des déclarations.

**À quoi ça sert** — Produire les fichiers et états de déclaration du mois ou de l'année : classeur mensuel (CNAS, G50, CACOBATPH, virements), DAS annuelle, fichiers CNAS et DAS, état G50 imprimable. Chaque fichier produit est inscrit au registre des déclarations.

**Avant de commencer**
- [ ] De préférence, la paie est validée (chip « Paie validée »). Sinon le chip « Provisoire : paie non validée » s'affiche et les fichiers sont marqués provisoires.
- [ ] Les numéros de sécurité sociale et les comptes des salariés sont renseignés.

**Étapes**
1. Choisissez l'« Année » et le « Mois » dans la barre de période.
2. Cliquez sur le bouton voulu :
   - « CNAS · G50 · CACOBATPH · Virements (Excel) » : classeur mensuel, tous chantiers ; « Ce chantier seulement » : le même classeur limité au chantier sélectionné ;
   - « DAS annuelle AAAA » : classeur annuel ;
   - « Fichier CNAS (CSV) » : fichier des cotisations du mois ;
   - « Fichier DAS (CSV) » : fichier annuel ;
   - « État G50 (imprimer) » : « État IRG sur salaires — report sur G50 ».
3. La fenêtre d'export s'ouvre (« {type} · MM/AAAA » ou « Année AAAA », chantier ou « Tous les chantiers ») et affiche « Vérification du registre et des décisions… ».
4. Lisez les sections : « Registre des exports de l'application », « Déclarations externes enregistrées », et l'avertissement éventuel « N fichier(s) officiel(s) déjà produit(s)… double déclaration ».
5. Si un mois est soumis à décision D10 (section « Mois soumis à décision D10 »), voir la fiche 3.20.
6. Cliquez sur « Produire le fichier » (ou « Produire et imprimer » pour l'état G50). Cliquez sur « Fermer » pour abandonner.

**Résultat** — « Fichier produit et inscrit au registre des exports de déclaration. » Le fichier est téléchargé :
- classeur mensuel Declarations_paie_AAAA-MM.xlsx : feuilles « Récapitulatif » (avec la liste « À corriger avant dépôt » : N° SS ou compte manquant), « Livre de paie », « CNAS », « IRG (G50) », « CACOBATPH », « Cotisations supp. » (si besoin), « Virements » ;
- DAS DAS_CNAS_AAAA.xlsx (trimestres, cumul annuel) ;
- fichier CNAS CNAS_COTISATIONS_AAAA_MM.csv ; fichier DAS CNAS_DAS_AAAA.csv ;
- état G50 imprimable.

**Attention**
- Paie non validée : le nom du fichier commence par PROVISOIRE_ et l'état G50 porte « Paie non validée : montants susceptibles de changer. Ne pas déposer. »
- « Aucun bulletin pour cette période. » → générez la paie d'abord.
- Un mois de reprise ou un mois déjà déclaré hors de l'application bloque l'export : « Export bloqué : décision D10 requise. » (fiche 3.20).
- Vérifiez la feuille « Récapitulatif » avant tout dépôt : un N° SS « MANQUANT » doit être corrigé dans la fiche du salarié.

**Voir aussi** — 3.20 Débloquer une déclaration (décision D10) · 3.21 Consulter le registre des déclarations · 5.x Cotisations & impôts

---

## 3.20 Débloquer une déclaration (décision D10)

> **Vidéo V3.19** · durée estimée 4 min · Public : ADMIN_RH, GERANT, SUPER_ADMIN

**Où la trouver** — Fenêtre d'export des déclarations (écran Paie, fiche 3.19, ou registre des déclarations, fiche 3.21).

**À quoi ça sert** — Éviter une double déclaration quand un mois a déjà été déclaré hors de l'application (mois de reprise, ou déclaration externe enregistrée). La décision D10 (Déclaration bloquée) fixe ce que le fichier peut contenir.

**Avant de commencer**
- [ ] La fenêtre d'export affiche « Export bloqué : décision D10 requise. » et la section « Mois soumis à décision D10 » avec les motifs (« Mois de reprise, déclaré hors de l'application », « Déclaration externe enregistrée »).

**Étapes**
1. Saisissez le « Motif de la demande D10 » (10 à 500 caractères).
2. Cliquez sur « Demander la décision D10 ». Message : « Décision D10 demandée : aucun fichier tant qu'elle n'est pas tranchée. » Si une demande existe déjà, cliquez sur « Ouvrir la décision ».
3. Un autre décideur choisit (décision « À risque ») : « Exclure les mois concernés » (ou « Exclure les mois concernés — aucun fichier » si tous les mois sont concernés), « État de contrôle interne » ou « Fichier officiel — risque de double déclaration ».
4. Rouvrez la fenêtre d'export. Elle affiche « Décision D10 : {option}. Mois inclus… · exclus… ».
5. Cliquez sur « Produire (D10 · option) — une seule fois ».

**Résultat** — Le fichier est produit une seule fois et inscrit au registre. Avec l'option « État de contrôle interne », le nom commence par CONTROLE_ et le fichier porte « ÉTAT DE CONTRÔLE — reconstitution, non déclaratif (décision D10). NE PAS DÉPOSER. » Les mois exclus sont mentionnés dans le fichier.

**Attention**
- Un état de contrôle ne doit jamais être déposé.
- L'option « Fichier officiel » crée un vrai risque de double déclaration : elle est signalée dans le registre (« Risque de double déclaration »).
- La décision s'exécute une seule fois : un second fichier exige une nouvelle décision.

**Voir aussi** — 3.19 Produire les déclarations · 3.21 Consulter le registre des déclarations · 3.22 Enregistrer et suivre une opération externe

---

## 3.21 Consulter le registre des déclarations

> **Vidéo V3.20** · durée estimée 3 min · Public : ADMIN_RH, GERANT, SUPER_ADMIN

**Où la trouver** — Ressources Humaines › Paie › « Déclarations » (`/rh/paie/declarations`), écran « Registre des exports de déclaration ». Aussi par le lien « Registre des déclarations » de l'écran Paie.

**À quoi ça sert** — Voir la liste horodatée de tous les fichiers de déclaration produits par l'application et en produire un nouveau.

**Avant de commencer**
- [ ] Vous savez que les déclarations faites hors de l'application doivent être enregistrées dans les opérations externes (fiche 3.22), sinon elles ne laissent aucune trace.

**Étapes**
1. Choisissez l'« Année ».
2. Consultez le tableau : Type, Période, Chantier, Nature (« Officiel » ou « État de contrôle », « Risque de double déclaration », « Paie non validée »), Mois inclus (et exclus), Fichier (empreinte de contrôle), Produit (date, auteur, décision D10).
3. Pour produire un fichier : choisissez « Nouvel export » (type), le « Mois » (sauf exports annuels), le « Chantier » (export mensuel seulement), puis cliquez sur « Préparer l'export ». La fenêtre d'export de la fiche 3.19 s'ouvre.
4. Si vous arrivez depuis une décision D10, le panneau « Produire le fichier de la décision (une seule fois) » s'affiche : utilisez-le pour produire le fichier décidé.

**Résultat** — Vous retrouvez qui a produit quel fichier, quand, pour quels mois, et s'il était officiel ou provisoire.

**Attention**
- Le registre ne contient que les fichiers produits par l'application.

**Voir aussi** — 3.19 Produire les déclarations · 3.20 Débloquer une déclaration (décision D10)

---

## 3.22 Enregistrer et suivre une opération externe

> **Vidéo V3.21** · durée estimée 6 min · Public : utilisateurs autorisés aux opérations externes (saisie, confirmation, examen des pièces)

**Où la trouver** — Ressources Humaines › Paie › « Opérations externes » (`/rh/paie/operations-externes`), écran « Opérations externes (paiements et déclarations) ».

**À quoi ça sert** — Enregistrer les paiements de salaires et les déclarations faits en dehors de l'application, pour que l'application bloque les doublons : un virement couvert par un paiement externe exige la décision D9, une déclaration couverte par une déclaration externe exige la décision D10.

**Avant de commencer**
- [ ] Vous avez le droit de consulter les opérations externes (sinon vous êtes renvoyé à l'accueil).
- [ ] Vous avez les informations de l'opération : période, chantiers, salariés, date, référence, organisme, montant, et si possible la pièce justificative.

**Étapes — enregistrer**
1. Choisissez l'« Année » (2026 par défaut) et le « Type » (Tous, Paiements, Déclarations) pour filtrer la liste.
2. Cliquez sur « Nouvelle opération externe ».
3. Renseignez :
   - « Type » : Paiement ou Déclaration ;
   - « Sous-type » : pour un paiement, Salaires ou Autre ; pour une déclaration, G50 (IRG), CNAS, DAS annuelle ou Autre ;
   - « Période : du mois » et « au mois » (12 mois au plus) ;
   - « Chantiers » (Tous ou une sélection) et « Salariés » (Tous ou une recherche) ;
   - « Date de l'opération », « Référence », « Organisme », « Montant (DA) » ;
   - « Origine de l'information » : « Déclaratif (sans pièce) » ou « Sur pièce (à joindre ensuite) » ;
   - « Description » (obligatoire, 10 à 1000 caractères).
4. Cliquez sur « Enregistrer ».

**Étapes — suivre une opération active**
1. « Confirmer l'enregistrement » : confirmez « Confirmer l'enregistrement ? Vous attestez que l'entrée est correctement saisie ; l'application ne vérifie pas la réalité du paiement ou de la déclaration. »
2. « Joindre une pièce » : PDF, JPEG, PNG ou WebP, 15 Mo au plus. Pour chaque pièce : « Voir », « Examiner » (observation de 10 caractères minimum), « Remplacer ».
3. « Corriger » : crée une nouvelle version (« Motif de la correction », 10 à 500 caractères).
4. « Retirer » : saisissez un motif (10 caractères minimum).

**Résultat** — Chaque opération apparaît sous forme de carte : type et sous-type, période, chantiers, salariés, « Version N », statut éventuel (« Remplacée par une correction », « Retirée · compte toujours pour le blocage »), description, informations, et trois indicateurs (« Information déclarée » ; « Enregistrement confirmé » ou « non confirmé » ; « Aucune pièce », « Pièce jointe, non examinée » ou « Pièce examinée »). Messages : « Opération externe enregistrée. », « Correction enregistrée : nouvelle version créée, l'ancienne est conservée. », « Enregistrement confirmé. », « Opération retirée (conservée dans le registre). », « Pièce jointe, non examinée. », « Pièce remplacée : la nouvelle pièce n'est pas examinée. », « Pièce examinée. »

**Attention**
- **Une opération, même retirée, remplacée ou non confirmée, continue de bloquer** les virements et déclarations correspondants. Rien n'est jamais supprimé.
- La saisie, la confirmation et l'examen des pièces sont des droits distincts ; ils peuvent être confiés à des personnes différentes.
- « Description obligatoire (10 caractères minimum). » / « Sous-type incompatible avec le type. » / « Période invalide (fin avant début). »
- « Motif du retrait obligatoire (10 à 500 caractères). » / « Observation obligatoire (10 à 1000 caractères). »
- « Pièce refusée : PDF, JPEG, PNG ou WebP uniquement. » / « Pièce trop volumineuse (15 Mo maximum). »

**Voir aussi** — 3.18 Débloquer des virements (décision D9) · 3.20 Débloquer une déclaration (décision D10)

---

## 3.23 Analyser les coûts de la paie et exporter l'écriture comptable

> **Vidéo V3.22** · durée estimée 4 min · Public : ADMIN_RH, GERANT, ADMIN_FINANCE, SUPER_ADMIN

**Où la trouver** — Ressources Humaines › Paie › « Coûts » (`/rh/couts`), écran « Coûts de la paie par chantier et par contrat ».

**À quoi ça sert** — Connaître le coût employeur de la paie par chantier et par contrat client, et produire l'écriture comptable de paie à importer en comptabilité.

**Avant de commencer**
- [ ] La paie du mois est calculée, idéalement validée.

**Étapes**
1. Choisissez l'« Année » et le « Mois ».
2. Lisez les indicateurs : Bulletins, Coût employeur total (DA), Chantiers.
3. Consultez les tableaux :
   - par chantier : Chantier, Effectif, Brut, Charges patronales, Coût employeur, Part ;
   - par contrat client : Contrat client (ou « Non affecté »), Chantier, Quote-part du chantier, Coût imputé ;
   - « Écriture de paie · journal {code} » : Compte, Libellé, Analytique, Débit, Crédit, totaux, et le chip « Équilibrée » ou « Déséquilibre ».
4. Cliquez sur « Répartition (CSV) » pour exporter la répartition des coûts, ou sur « Écritures comptables (CSV) » pour exporter l'écriture.

**Comment les chiffres sont calculés**
- Brut = somme des lignes du bulletin hors retenues.
- Charges patronales = CNAS employeur (avec FOS) + CACOBATPH + intempéries part patronale + cotisations supplémentaires patronales.
- Coût employeur = Brut + Charges patronales. Il est imputé au chantier de la paie, puis réparti entre les contrats clients actifs dans le mois, au prorata de leurs jours d'activité. Exemple : un chantier coûte 300 000 DA ; le contrat A est actif 30 jours et le contrat B 15 jours ; A reçoit 300 000 × 30 ÷ 45 = 200 000 DA et B 100 000 DA.
- Écriture (comptes par défaut) : au débit 631 (salaires bruts) et 635 (charges), ventilés par chantier ; au crédit 431 (CNAS), 4318 (CACOBATPH), 442 (IRG), 425 (avances), 427 (retenues), 421 (net à payer).

**Résultat** — Fichiers ECRITURES_PAIE_AAAA_MM.csv (journal, date du dernier jour du mois, pièce PAIE-AAAAMM, compte, libellé, analytique, débit, crédit) et COUTS_PAIE_AAAA_MM.csv.

**Attention**
- « Paie du mois non validée : chiffres provisoires. » Les fichiers commencent alors par PROVISOIRE_.
- « Écriture déséquilibrée : export bloqué. » → vérifiez le plan de comptes (fiche 3.24) et les bulletins.
- « Contrats clients non accessibles avec votre profil : répartition par chantier uniquement. »

**Voir aussi** — 3.24 Paramétrer le plan de comptes de la paie · 3.8 Valider la paie

---

## 3.24 Paramétrer le plan de comptes de la paie

> **Vidéo V3.22** · durée estimée 4 min (vidéo commune avec 3.23) · Public : ADMIN_FINANCE, GERANT, SUPER_ADMIN

**Où la trouver** — Ressources Humaines › Paie › « Coûts » › bouton « Plan de comptes ».

**À quoi ça sert** — Adapter le code journal et les numéros de comptes utilisés par l'écriture comptable de paie à votre plan comptable.

**Avant de commencer**
- [ ] Vous êtes ADMIN_FINANCE, GERANT ou SUPER_ADMIN (« Réservé à la finance / gérance. »).
- [ ] Les numéros de comptes ont été validés par le service comptable.

**Étapes**
1. Cliquez sur « Plan de comptes ». La fenêtre « Plan de comptes de la paie » s'ouvre.
2. Saisissez le « Code journal » (2 à 10 lettres majuscules ou chiffres ; par défaut PAIE).
3. Pour chaque ligne, saisissez le numéro de compte (2 à 10 chiffres) ; la valeur par défaut est rappelée :
   - « Rémunérations du personnel » (défaut 631) ;
   - « Cotisations aux organismes sociaux » (défaut 635) ;
   - « CNAS (parts salariale et patronale) » (défaut 431) ;
   - « CACOBATPH (congés et intempéries) » (défaut 4318) ;
   - « État, IRG retenu à la source » (défaut 442) ;
   - « Personnel, avances et acomptes » (défaut 425) ;
   - « Personnel, oppositions et autres retenues » (défaut 427) ;
   - « Personnel, rémunérations dues » (défaut 421).
4. Cliquez sur « Enregistrer » (ou « Fermer » pour abandonner).

**Résultat** — « Plan de comptes enregistré. » Les prochaines écritures utilisent ces comptes.

**Attention**
- « Compte invalide pour « … » (chiffres uniquement). »

**Voir aussi** — 3.23 Analyser les coûts de la paie

---

## 3.25 Simuler une fiche de paie

> **Vidéo V3.23** · durée estimée 6 min · Public : utilisateurs autorisés à lire la paie

**Où la trouver** — Menu général › groupe « Pilotage » › « Simulateur » ; ou Paie › sous-onglet « Simulateur » ; ou raccourci « Simulateur » de l'écran Paie (`/simulateur`).

**À quoi ça sert** — Tester l'effet d'un changement (salaire, pointage, taux, barème IRG, rubriques…) sur une fiche de paie **sans rien enregistrer**.

**Avant de commencer**
- [ ] Vous avez le droit de lire la paie (sinon : « Accès au simulateur non autorisé pour votre rôle (lecture de la paie requise). »).

**Étapes**
1. Dans « Élément à tester » (recherche « Fiche de paie, pointage, congé, mission… »), choisissez « Fiche de paie ». Sans élément choisi, la galerie « Quel élément voulez-vous tester ? » s'affiche.
2. Choisissez un « Salarié » (recherche « Matricule ou nom… ») ou laissez vide pour un « scénario libre » (bouton « Scénario libre »). Choisissez le « Mois » et l'« Année ».
3. Facultatif : dans « Afficher à côté », choisissez un second élément, par exemple « Pointage mensuel ». Les deux documents sont « Liés » : « Cliquez une case d'un document ou changez une variable : l'autre se recalcule aussitôt. »
4. Modifiez les données :
   - ajoutez des variables dans les zones « Gauche », « Droite » ou « Bas » (« + Variable » ou « Chercher et ajouter une variable ») ;
   - ou cliquez une case du bulletin pour changer sa valeur ; la valeur réelle est rappelée (« ERP : … »).
   - Groupes de variables : Contrat de travail, Jours & pointage, Pointage (code de chaque jour), Heures supplémentaires, CNAS & cotisations, IRG, Barème IRG, Règles IRG, Rubriques, Exceptions de paie, Avances & sortie, Variables légales.
5. Lisez les indicateurs : « Brut cotisable », « Imposable », « CNAS salarié », « Base IRG », « IRG », « Net à payer », « Coût employeur », « Écart net / contrat » (et l'écart « vs réf. »).
6. Cliquez sur « Figer comme référence » pour comparer les prochains changements à l'état actuel. Cliquez sur « Tout rétablir » pour revenir aux valeurs réelles.

**Résultat** — Vous voyez immédiatement l'effet de vos changements sur le bulletin. Rien n'est enregistré : aucun bulletin, aucune règle, aucun contrat n'est modifié.

**Attention**
- « Valeurs légales modifiées dans cette simulation (valeurs non officielles). Rien n'est enregistré. »
- « Modifiées hors panneaux : … » liste les valeurs changées en cliquant dans le document ; utilisez « afficher » ou la flèche de retour pour les retrouver ou les annuler.
- Le simulateur sert à comprendre et à tester. Pour appliquer un changement, modifiez la vraie donnée (contrat, rubrique, règle…), puis demandez un recalcul (fiche 3.2).
- Le bouton « Éditer la mise en page » ouvre l'éditeur du modèle de bulletin (chapitre 6).

**Voir aussi** — 3.6 Comprendre le calcul du bulletin · 6.x Modèles de documents · 2.x Pointage mensuel
