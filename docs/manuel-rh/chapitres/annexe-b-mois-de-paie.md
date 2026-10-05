# Annexe B Le mois de paie pas à pas — دورة الأجور الشهرية خطوة بخطوة

**Dans cette annexe** — Une liste de vérification chronologique de tout le mois RH, de l'embauche jusqu'à la clôture de la paie. Pour chaque étape : quand la faire, qui la fait (rôles par défaut, voir 0.9), ce qu'il faut cocher et quelle fiche du manuel consulter. Suivez les étapes dans l'ordre : chaque étape prépare la suivante. La paie se traite **par chantier et par mois** : refaites le parcours pour chaque chantier.

> **Vidéo V0.9** · durée estimée 5 min · Public : ADMIN_RH, GERANT, SUPER_ADMIN

---

## B.0 Le mois en un coup d'œil

| # | Étape | Quand | Qui | Fiche principale |
|---|---|---|---|---|
| B.1 | Embauches, contrats et sorties | Dès l'événement, au plus tard avant B.6 | ADMIN_RH | chapitre 1, « Créer un employé », « Créer un contrat de travail » |
| B.2 | Congés et ordres de mission | Au fil du mois | ADMIN_RH (approbation : ADMIN_RH, GERANT, SUPER_ADMIN) | chapitre 2, « Saisir une demande de congé », « Établir un ordre de mission » |
| B.3 | Pointage et validation | Chaque semaine, puis en fin de mois | CHEF_CHANTIER, ADMIN_RH | chapitre 2, « Valider le pointage du mois » |
| B.4 | Imports de présences | Si des archives ou une pointeuse sont utilisées | ADMIN_RH (dépôt) + une autre personne (validation) | chapitre 2, « Déposer un fichier d'archives de présence » |
| B.5 | Exceptions et avances | Avant B.6 | ADMIN_RH (saisie) + une autre personne (approbation) | chapitre 3, « Saisir une rubrique exceptionnelle », « Enregistrer une avance ou un prêt » |
| B.6 | Préparation du mois | Fin de mois, pointage validé | ADMIN_RH | chapitre 3, « Préparer le mois » |
| B.7 | Calcul (décision D4, ou D1) | Après B.6 sans blocage | ADMIN_RH (demande), décideur (décision) | chapitre 3, « Demander la génération de la paie » |
| B.8 | Contrôle des bulletins et recalcul (décision D3) | Juste après B.7 | ADMIN_RH, décideur | chapitre 3, « Contrôler et imprimer les bulletins », « Recalculer un bulletin » |
| B.9 | Validation (décision D6 si besoin) | Bulletins contrôlés | ADMIN_RH, GERANT, SUPER_ADMIN | chapitre 3, « Valider la paie » |
| B.10 | Virements | Après B.9 | ADMIN_RH, GERANT, SUPER_ADMIN | chapitre 3, « Préparer un lot de virements » |
| B.11 | Déclarations | Après B.9, avant les dates légales de dépôt | ADMIN_RH, GERANT, SUPER_ADMIN | chapitre 3, « Produire les déclarations » |
| B.12 | Clôture | Virements et déclarations faits | GERANT, SUPER_ADMIN | chapitre 3, « Clôturer le mois » |

« Décideur » désigne la personne habilitée à trancher la décision au Centre de décisions : par défaut le SUPER_ADMIN, ou une personne à qui il a délégué ce droit. La personne qui demande une décision ne peut pas la trancher elle-même (sauf le SUPER_ADMIN).

**Quatre règles à garder en tête tout le mois**
- **La paie ne lit que le pointage validé.** Un jour saisi ou proposé mais pas validé ne compte pas.
- **Rien n'est calculé automatiquement.** Chaque génération (D4) ou recalcul (D3) de la paie passe par une décision au Centre de décisions. Après une modification, l'application signale la paie brouillon « Données modifiées depuis le calcul » au lieu de la recalculer.
- **Une paie passe par trois statuts** : « Brouillon » → « Validée » → « Clôturée ». Il n'y a pas de retour en arrière direct : seule une décision D7 (Réouverture d'une paie) du SUPER_ADMIN rouvre une paie.
- **Une paie validée fige le mois** : les bulletins et le pointage du mois ne se modifient plus. Une correction tardive passe en rappel sur un mois encore ouvert.

---

## B.1 Enregistrer les embauches, les contrats et les sorties

**Quand** — Dès l'embauche, le changement ou le départ ; au plus tard avant la préparation du mois (B.6).

**Qui** — ADMIN_RH (création et modification des employés et des contrats ; saisie des montants : SUPER_ADMIN, ADMIN_RH, GERANT).

**À faire**
- [ ] Créer la fiche de chaque nouvel employé (NSS, NIN, compte CCP ou RIB et mode de paiement compris : ils servent aux déclarations et aux virements).
- [ ] Créer son contrat de travail : il **commence toujours le 1er du mois**. Cocher « Affectation principale » pour le contrat principal.
- [ ] Finaliser les contrats en brouillon : un contrat brouillon **entre aussi dans la paie**.
- [ ] Renouveler ou clôturer les contrats qui se terminent (alerte « Fin de contrat » du tableau de bord).
- [ ] Enregistrer puis valider les sorties du mois (démission, fin de contrat…) : le solde de tout compte est payé sur la paie du mois de sortie.
- [ ] Ouvrir « Qualité des données » : aucune wilaya de chantier à confirmer, aucun contrat hors du 1er sans décision D13.

**Fiches** — chapitre 1, fiches « Créer un employé », « Créer un contrat de travail », « Enregistrer une sortie », « Valider une sortie » · chapitre 0, fiches 0.5, 0.6 et 0.7.

**Si ça bloque**
- « Un contrat commence le 1er du mois : aucun contrat ne débute en milieu de mois. … » : ramenez la date de début au 1er du mois.
- « Ce salarié a déjà un contrat principal ouvert (début …). … » : ouvrez le contrat existant avec « Modifier », ou décochez « Affectation principale ».

---

## B.2 Saisir les congés et les ordres de mission

**Quand** — Au fil du mois, dès la demande de congé ou le départ en mission.

**Qui** — ADMIN_RH pour la saisie ; approbation des congés : SUPER_ADMIN, ADMIN_RH, GERANT.

**À faire**
- [ ] Saisir chaque demande de congé (Temps & présence › Congés › « Nouvelle demande de congé ») avec sa nature : CA, CRP, CM, CSS ou AOP.
- [ ] Approuver ou refuser les demandes « En attente ». L'approbation crée un **titre de congé numéroté** et propose les jours dans la grille de présence.
- [ ] Établir les ordres de mission (Documents › Registre › « Ordres de mission » › « Nouvel ordre de mission »). À l'enregistrement, les jours du départ au retour sont proposés en « MS » dans le pointage.
- [ ] Imprimer les titres de congé et les ordres de mission à remettre aux salariés.

**Fiches** — chapitre 2, fiches « Saisir une demande de congé », « Approuver ou refuser une demande de congé », « Établir un ordre de mission » · chapitre 4, fiches « Établir un titre de congé » et registre des ordres de mission.

**Attention** — Les jours proposés par un congé ou un ordre de mission apparaissent en *italique gris* dans la grille : ils ne comptent pour la paie qu'**après validation du pointage** (B.3). Une paie ne peut pas être validée tant que des jours proposés par un ordre de mission restent non validés.

**Si ça bloque**
- « Chevauchement avec une autre demande. » : une demande en attente ou approuvée couvre déjà ces dates.
- « La date de départ doit être aujourd'hui ou une date future. » : un ordre de mission ne se crée pas avec une date de départ passée.

---

## B.3 Saisir et valider le pointage

**Quand** — Saisie au fil du mois (idéalement chaque semaine) ; validation complète en fin de mois, avant la préparation (B.6).

**Qui** — CHEF_CHANTIER pour son chantier, ou ADMIN_RH.

**À faire**
- [ ] Ouvrir Temps & présence › Présence, onglet « Par chantier », choisir le chantier et le mois.
- [ ] Saisir les codes de chaque jour (au clavier ou avec la carte du mois). Contrôler les jours proposés (congés, missions) et les heures supplémentaires.
- [ ] Cliquer sur « Valider » (le point orange signale des modifications non enregistrées). Message attendu : « N valeurs validées ».
- [ ] Vérifier qu'il ne reste ni pastille « N à valider » ni pastille « N proposé(s) OM » : la pastille « Tout est validé » doit s'afficher.
- [ ] Lire le message après validation : « N paie(s) brouillon signalée(s) « données modifiées depuis le calcul »… » ou « Aucune paie n'a été créée : la génération est soumise à décision (Centre de décisions). »

**Fiches** — chapitre 2, fiches « Consulter la grille de présence », « Saisir le pointage dans la grille », « Valider le pointage du mois ».

**Attention**
- Tant que vous n'avez pas cliqué sur « Valider », rien n'est enregistré. Changer de mois, de chantier ou quitter la page affiche « Des modifications non validées seront perdues. Continuer ? ».
- Un jour proposé que vous effacez n'est définitivement écarté qu'après « Valider » ; sinon il réapparaît.
- Quand le pointage d'un mois sans paie est validé, une demande de génération (décision D4) est ouverte automatiquement au Centre de décisions.

**Si ça bloque** — « Paie validée pour ce mois : le pointage est figé. … » : le mois est déjà validé ; voir B.12 (rappel ou réouverture D7).

---

## B.4 Importer les présences d'archives (si besoin)

**Quand** — Si une partie du pointage vient d'un fichier (pointeuse, tableau Excel du chantier, registre papier ressaisi), avant la préparation (B.6).

**Qui** — Une personne dépose et importe le lot ; **une autre personne** le valide (séparation des tâches, sauf décision D12 contraire). Les droits d'import et de validation sont distincts et accordés dans la matrice.

**À faire**
- [ ] Temps & présence › Imports de présences › « Déposer un fichier » : choisir le format, le mois, le chantier, la provenance, puis « Déposer et analyser ».
- [ ] Lire le rapport du lot : lignes rejetées, en conflit, identiques. Rapprocher les noms inconnus.
- [ ] Codes inconnus : demander une correspondance (décision D11). Conflits avec des présences déjà saisies : décision D5 (SUPER_ADMIN uniquement).
- [ ] « Importer les présences acceptées » : le lot passe « Importé, à valider ».
- [ ] Faire valider par une autre personne : onglet « À valider » › « Valider les présences importées ».

**Fiches** — chapitre 2, fiches « Déposer un fichier d'archives de présence », « Importer les présences acceptées », « Valider les présences importées ».

**Attention** — Une valeur importée laissée telle quelle dans la grille n'est **pas** validée par le bouton « Valider » de la grille : elle se valide uniquement depuis l'écran des imports.

**Si ça bloque** — « Séparation des tâches : vous avez importé ce lot, sa validation revient à une autre personne (politique D12). » : demandez la validation à un collègue habilité.

---

## B.5 Saisir les exceptions et les avances

**Quand** — Avant la préparation du mois (B.6).

**Qui** — Saisie : SUPER_ADMIN, ADMIN_RH, GERANT. Approbation d'une exception : une autre personne que l'auteur (le GERANT et le SUPER_ADMIN peuvent approuver leurs propres saisies).

**À faire**
- [ ] Paie › Exceptions › « Nouvelle exception » pour chaque prime, indemnité ou retenue ponctuelle du mois, avec un motif.
- [ ] Faire approuver chaque exception : seules les exceptions **approuvées** entrent dans le bulletin (message à la saisie : « Brouillon enregistré : il doit être approuvé pour entrer en paie. »).
- [ ] Paie › Avances : enregistrer les nouvelles avances et nouveaux prêts. La retenue mensuelle est appliquée automatiquement sur les prochaines paies, sans jamais rendre le net négatif.

**Fiches** — chapitre 3, fiches « Saisir une rubrique exceptionnelle », « Approuver une exception », « Enregistrer une avance ou un prêt ».

**Si ça bloque**
- « Double validation : l'exception doit être approuvée par une autre personne (Gérant ou autre responsable). » : demandez l'approbation à un autre responsable.
- « Mois MM/AAAA déjà validé ou clôturé pour cet employé : choisissez un mois ouvert (rappel). » : saisissez l'exception sur le premier mois encore ouvert.

---

## B.6 Préparer le mois

**Quand** — Fin de mois, une fois B.1 à B.5 terminées.

**Qui** — ADMIN_RH.

**À faire**
- [ ] Ouvrir Paie › « Préparation du mois », choisir le « Mois » et le « Chantier ».
- [ ] Lire l'alerte de chemin en haut de page :
  - « Aucun blocage : la génération peut être demandée (décision D4). » → passer à B.7 ;
  - « Règles en attente : la génération réelle est bloquée. Demandez la décision D1 (attendre ou simulation non validable). » → faire approuver les règles légales et décider leur date d'application (chapitre 5), ou demander la décision D1 ;
  - « Une paie brouillon existe : recalcul depuis l'écran Paie (décision D3). » → passer à B.8 ;
  - « Paie de ce mois validée ou clôturée : aucune génération possible. » → le mois est déjà traité.
- [ ] Parcourir « Contrôles du mois » : traiter chaque ligne « Bloquant » et « À vérifier » avec le lien « Ouvrir » (règles légales, coefficients de présence, présences proposées non validées, imports en cours, contrats sans présence, qualité des données, décisions du mois, mois précédent).

**Fiches** — chapitre 3, fiche « Préparer le mois » · chapitre 5, fiches « Proposer une nouvelle valeur » et « Choisir la date d'application (décision D2) ».

**Attention** — La préparation se consulte seulement : elle ne calcule rien. Une vraie paie n'est jamais créée tant qu'une règle légale du mois attend son approbation ou sa date d'application.

---

## B.7 Calculer la paie (décision D4)

**Quand** — Juste après une préparation sans blocage.

**Qui** — ADMIN_RH demande ; le décideur tranche.

**À faire**
- [ ] Vérifier au Centre de décisions qu'une demande D4 n'a pas déjà été ouverte automatiquement à la validation du pointage.
- [ ] Sinon, cliquer sur « Demander la génération (D4) » (Préparation du mois) ou « Demander la génération » (Paie › Calcul de la paie, après avoir choisi « Chantier », « Année », « Mois » et cliqué sur « Voir ce mois »).
- [ ] Le décideur ouvre la décision D4 (Génération de paie), choisit « Générer la paie du mois », saisit la justification et clique sur « Décider et exécuter ».
- [ ] Lire le résultat : « Décision enregistrée et exécutée : N bulletin(s) calculé(s). » et les éventuels avertissements du calcul.

**Fiches** — chapitre 3, fiches « Demander la génération de la paie », « Décider une génération ou un recalcul » · chapitre 6, fiche « Décider au Centre de décisions ».

**Attention**
- La paie est créée au statut « Brouillon », avec les règles légales en vigueur au 1er du mois.
- Si des règles légales sont encore en attente, l'application ouvre une décision D1 au lieu de D4. L'option « Calculer une simulation non validable » donne une simulation exportable, jamais un vrai bulletin.

**Si ça bloque** — « Calcul de paie refusé : décision D3 ou D4 valide requise (Centre de décisions). » : la décision n'est pas encore prise ou a déjà servi ; ouvrez une nouvelle demande.

---

## B.8 Contrôler les bulletins et recalculer (décision D3)

**Quand** — Juste après le calcul, avant la validation.

**Qui** — ADMIN_RH contrôle et corrige ; le décideur tranche le recalcul.

**À faire**
- [ ] Paie › Calcul de la paie : parcourir les vues « Fiches », « Social » et « Fiscal ». Chercher les salariés manquants (« Rechercher un employé (matricule, nom, NSS)… »).
- [ ] Ouvrir quelques bulletins (« Bulletin de Paie ») et, en cas de doute, la « Traçabilité » (contrat, affectation, règles et décisions utilisées).
- [ ] Traiter les avertissements du calcul, par exemple : « Barème IRG introuvable pour la période : IRG = 0 », NSS manquant, salaire de base inférieur au SNMG, jours pointés supérieurs aux jours de contrat.
- [ ] Corriger à la source (contrat, pointage, exception, avance…). La paie affiche alors « Données modifiées depuis le calcul (N) · décision requise » et une décision D3 (Recalcul des paies brouillon) est ouverte automatiquement.
- [ ] Faire trancher la D3 : « Recalculer les bulletins concernés » (seuls les bulletins brouillon touchés sont recalculés) ou « Conserver les bulletins tels quels ». Pour tout recalculer, cliquer sur « Demander un recalcul » dans l'écran Paie.
- [ ] Après un changement de règle (taux, barème, rubrique), contrôler qu'aucun bulletin brouillon n'est resté « périmé » : dans Documents › Registre › « Bulletin de paie », le bouton « Recalculer » d'un bulletin brouillon ouvre la décision de recalcul.

**Fiches** — chapitre 3, fiches « Contrôler et imprimer les bulletins », « Consulter la traçabilité d'un bulletin », « Recalculer un bulletin » · chapitre 3, fiche « Utiliser le simulateur » (pour tester un changement sans rien enregistrer).

**Attention** — Tant qu'une décision D3 n'est pas tranchée, le bouton « Valider la paie » reste grisé (« Validation bloquée tant qu'une décision de recalcul n'a pas été prise. »).

---

## B.9 Valider la paie (décision D6 si besoin)

**Quand** — Quand tous les bulletins du chantier sont justes.

**Qui** — SUPER_ADMIN, ADMIN_RH ou GERANT.

**À faire**
- [ ] Vérifier les conditions : paie « Brouillon » avec au moins un bulletin ; aucune donnée modifiée en attente (B.8) ; aucun jour proposé par un ordre de mission non validé dans le pointage du mois ; aucune règle légale en attente.
- [ ] Si la barre d'état affiche « Validation soumise à décision D6 (mois de reprise ouverts) » : cliquer sur « Demander la décision D6 » et faire trancher la décision D6 (Clôture des mois de reprise), puis revenir valider.
- [ ] Cliquer sur « Valider la paie ».
- [ ] Lire le résultat : « Paie validée : bulletins et pointage du mois figés (réouverture seulement sur décision D7 du SUPER_ADMIN). » et « N bulletin(s) archivé(s) en PDF. »

**Fiches** — chapitre 3, fiches « Valider la paie », « Demander la décision D6 ».

**Attention** — Après validation, le pointage du mois et les bulletins ne se modifient plus. Les bulletins sont archivés en PDF (action « PDF archivé »).

**Si ça bloque**
- « N jour(s) proposé(s) (ordres de mission) non validé(s) dans le pointage. » : retournez en B.3 et cliquez sur « Valider » dans la grille.
- « Aucun bulletin à valider : générez la paie d'abord. » : retournez en B.7.

---

## B.10 Préparer les virements

**Quand** — Après la validation.

**Qui** — SUPER_ADMIN, ADMIN_RH ou GERANT.

**À faire**
- [ ] Paie › Virements : choisir « Année », « Mois », « Mode » (CCP ou banque), « Chantier », saisir « Compte donneur d'ordre » et « Date de valeur ».
- [ ] « Préparer le lot » : contrôler l'aperçu et corriger les comptes signalés (« Compte CCP manquant », « RIB bancaire incomplet (20 chiffres attendus) »…) dans les fiches employés.
- [ ] « Générer le fichier », puis le télécharger avec « Fichier » et le remettre à la banque ou à Algérie Poste.
- [ ] Enregistrer le dépôt (« Déposé », avec la référence du bordereau), puis l'exécution (« Exécuté »).
- [ ] Bulletins bloqués (mois de reprise, salaire déjà viré, paiement externe enregistré) : demander la décision D9 seulement si un virement est vraiment nécessaire.

**Fiches** — chapitre 3, fiches « Préparer un lot de virements », « Demander la décision D9 », « Enregistrer une opération externe ».

**Attention** — Seuls les bulletins validés ou clôturés sont virables. Tant qu'un lot est généré ou déposé, la paie ne peut pas être réouverte (D7) : annulez le lot, ou enregistrez son exécution, avant toute demande de réouverture.

---

## B.11 Produire les déclarations

**Quand** — Après la validation, avant les dates légales de dépôt.

**Qui** — SUPER_ADMIN, ADMIN_RH ou GERANT.

**À faire**
- [ ] Depuis l'écran Paie (barre des déclarations) ou Paie › Déclarations : produire le classeur « CNAS · G50 · CACOBATPH · Virements (Excel) », le « Fichier CNAS (CSV) » et l'« État G50 (imprimer) ».
- [ ] Vérifier la feuille « Récapitulatif » du classeur, notamment la partie « À corriger avant dépôt » (N° de sécurité sociale ou compte manquant).
- [ ] En fin d'année : produire la « DAS annuelle » et le « Fichier DAS (CSV) ».
- [ ] Si une déclaration a été faite hors de l'application, l'enregistrer dans Paie › Opérations externes.

**Fiches** — chapitre 3, fiches « Produire les déclarations », « Consulter le registre des déclarations », « Demander la décision D10 ».

**Attention**
- Avant la validation, les fichiers portent la mention provisoire (« Paie non validée : montants susceptibles de changer. Ne pas déposer. ») : ne les déposez jamais.
- Un mois de reprise ou un mois déjà déclaré hors de l'application bloque l'export : « Export bloqué : décision D10 requise. »

---

## B.12 Clôturer le mois

**Quand** — Quand la paie est validée, les virements exécutés et les déclarations produites.

**Qui** — SUPER_ADMIN ou GERANT uniquement.

**À faire**
- [ ] Paie › Calcul de la paie, chantier et mois concernés : cliquer sur « Clôturer le mois ».
- [ ] Lire et confirmer : « Clôturer définitivement la paie MM/AAAA — … ? Bulletins et pointage du mois seront figés ; les corrections passeront en rappel le mois suivant. »
- [ ] Lire le résultat : « Paie clôturée définitivement. » ; les bulletins passent « Clôturée ».

**Fiches** — chapitre 3, fiches « Clôturer le mois », « Demander la réouverture d'une paie (D7) ».

**Après la clôture**
- Une erreur découverte plus tard se corrige **en rappel** sur le mois suivant (par exemple une exception sur le premier mois ouvert), pas en modifiant le mois clos.
- En cas d'erreur grave, seul le SUPER_ADMIN peut rouvrir la paie par une décision D7 (Réouverture d'une paie), sur demande motivée. La paie réouverte n'est pas recalculée sans nouvelle décision D3.
- La « Clôture des périodes » de l'administration fige les ajustements commerciaux : elle ne verrouille **pas** la paie.
- Les coûts de la paie par chantier et par contrat, et l'écriture comptable, se consultent dans Paie › Coûts (chapitre 3, fiche « Consulter les coûts de la paie »).

**Si ça bloque**
- « Validez la paie avant de la clôturer. » : retournez en B.9.
- « Clôture réservée à SUPER_ADMIN et GERANT. » : demandez la clôture au Gérant.

---

**Voir aussi** — 0.9 Connaître votre rôle et vos droits · Annexe A Décisions D1–D15 · Annexe D Messages fréquents et solutions
