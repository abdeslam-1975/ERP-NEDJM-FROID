# Annexe A Les décisions D1 à D15 — القرارات من D1 إلى D15

**Dans cette annexe** — Une vue de référence des quinze types de décision du Centre de décisions : quand chacune est demandée, qui la tranche, quelles options sont proposées et ce que chaque option produit. L'utilisation pas à pas du Centre de décisions est décrite dans les fiches 6.15 (consulter), 6.16 (demander), 6.17 (décider) et 6.18 (notifications).

---

## A.1 Comment circule une décision

Dans NEDJM FROID ERP, aucune opération sensible ne s'exécute d'elle-même. Le Centre de décisions le rappelle : « Rien ne s'exécute de soi-même : chaque génération ou recalcul de paie, correction d'affectation ou traitement d'un contrat hors du 1er du mois attend ici une décision motivée, enregistrée et tracée. »

Une décision suit toujours le même chemin :

1. **La demande.** Elle naît d'un bouton « Demander … » dans un écran métier (Paie, Virements, Imports de présences, Listes et codes…), ou automatiquement quand l'application détecte une situation qui l'exige (par exemple une donnée de paie modifiée après le calcul d'un brouillon). La demande prend le statut « En attente ». Toutes les personnes qui ont le droit de décider ce type reçoivent une notification. Rien n'est encore exécuté.
2. **La lecture.** Le décideur ouvre la décision et lit les faits (période, chantier, origine, classe), le contexte propre au type et les avertissements.
3. **Le choix.** Le décideur choisit une option, écrit une justification de 10 à 2000 caractères et, pour une décision « À risque », coche « J'ai pris connaissance des conséquences de cette décision à risque. ». Refuser, c'est choisir l'option négative du type (« Ne pas générer », « Ne pas réouvrir », « Refuser »…) : il n'y a pas de bouton « Rejeter ».
4. **L'exécution.** Selon l'option :
   - l'opération est lancée tout de suite (« Décider et exécuter ») : génération ou recalcul de paie, simulation ;
   - l'effet est appliqué dans la même opération (« Décision enregistrée et appliquée dans la même opération. ») ;
   - rien n'est lancé (« Décision enregistrée. Aucune opération de paie n'a été lancée. ») ;
   - l'opération se fait une seule fois depuis l'écran opérationnel (D9, D10, D5 « Trancher ligne par ligne »).
   Le demandeur reçoit la notification « Décision prise : {type} ».
5. **La clôture.** La décision passe « Exécutée ». Elle peut aussi finir « Invalidée » (les données ont changé : une nouvelle demande est ouverte) ou « Remplacée » (une demande plus récente sur le même sujet l'a remplacée, ou la situation est dépassée).

**Les règles qui s'appliquent à toutes les décisions**

- **Définitive** : une décision prise ne se modifie ni ne se supprime. Pour changer d'avis, il faut une nouvelle demande.
- **Usage unique** : une décision exécutée ne peut pas resservir.
- **Une seule demande ouverte par sujet** : une demande identique met à jour ou remplace la précédente.
- **Données vérifiées au moment de décider** : si les données ont changé depuis l'affichage, la décision est refusée avec « Les données ont changé depuis l'affichage : la demande a été mise à jour. Relisez-la avant de décider. ».
- **Séparation des tâches** : celui qui a demandé ne décide pas sa propre demande (sauf SUPER_ADMIN). Pour D2, les personnes qui ont contribué à la règle ne décident pas non plus.
- **Traçabilité** : chaque demande, chaque décision et chaque exécution est inscrite au journal d'audit (fiche 6.25).

**Qui peut décider**

- Le SUPER_ADMIN peut décider tous les types.
- Les autres comptes décident un type s'ils ont le droit « Modifier » (M) sur l'écran « Décision Dx … » de la matrice des permissions (fiche 6.20). À l'installation, seul le SUPER_ADMIN a ces droits ; il peut les déléguer.
- Pour D14, le droit « Créer » (C) permet de demander et le droit « Modifier » (M) permet de décider.
- **D5, D7 et D12 sont réservées au SUPER_ADMIN et ne se délèguent pas.**

**Les deux classes**

- **« Ordinaire »** : décision courante.
- **« À risque »** : décision aux conséquences lourdes ou difficiles à corriger (double paiement, double déclaration, réouverture…). Le décideur doit cocher la case de reconnaissance des conséquences.

---

## A.2 Tableau de référence

| Code | Nom | Quand elle est demandée | Qui décide / classe | Options | Effet | Fiche du manuel |
|---|---|---|---|---|---|---|
| D1 | Paie d'un mois aux règles non approuvées | Une règle légale du mois attend son approbation ou sa date d'application. Demande depuis Paie › « Préparation du mois » › « Demander la décision D1 », ou ouverte à la place de D4 quand on demande une génération. | SUPER_ADMIN ou décideur délégué · Ordinaire | « Attendre l'approbation des règles » ; « Calculer une simulation non validable » | Attendre : rien n'est calculé. Simulation : calcul avec les règles déjà en vigueur, sans bulletin réel ; jamais validée, virée, déclarée ni comptée en coût ; exportable en Excel depuis la préparation du mois. | Chapitre 3 Paie (préparation du mois) · 6.17 |
| D2 | Date d'application d'une règle légale | Une proposition de règle légale (taux, barème, variable, zone IRG…) a été approuvée et il faut fixer son mois d'application. Demande depuis « Propositions légales » › « Demander la décision ». | SUPER_ADMIN ou décideur délégué, n'ayant pas contribué à la règle · À risque | « Appliquer à partir du mois indiqué » ; « Ne pas appliquer pour l'instant » | Appliquer : la règle est en vigueur au 1er du mois indiqué ; les paies brouillon concernées sont signalées et attendent D3 ; les paies validées ou clôturées ne changent jamais. Ne pas appliquer : la règle reste approuvée mais sans effet. | Chapitre 5 Juridique (propositions légales) · 6.17 |
| D3 | Recalcul des paies brouillon | Automatiquement, dès qu'une donnée de paie change après le calcul d'un brouillon (présences, contrat, rubriques, avenant, exception, sortie, congé, avance, dérogations, affectation, wilaya du chantier, règle D2, coefficient D14). Ou depuis Paie › « Calcul de la paie » › « Demander un recalcul ». | SUPER_ADMIN ou décideur délégué · Ordinaire | « Recalculer les bulletins concernés » ; « Conserver les bulletins tels quels » | Recalculer : seuls les bulletins brouillon concernés sont recalculés (toute la paie si la demande vient de l'écran Paie). Conserver : rien n'est recalculé et la paie peut être validée en l'état. Tant que D3 n'est pas tranchée, la validation de la paie est bloquée. | Chapitre 3 Paie (calcul) · 6.5 · 6.17 |
| D4 | Génération de paie | Il n'existe pas encore de paie pour le chantier et le mois. Demande depuis Paie › « Calcul de la paie » › « Demander la génération » ou « Préparation du mois » › « Demander la génération (D4) ». Ouverte aussi automatiquement quand des données (par exemple un pointage validé) changent pour un mois sans paie. | SUPER_ADMIN ou décideur délégué · Ordinaire | « Générer la paie du mois » ; « Ne pas générer » | Générer : une paie brouillon est calculée avec les règles en vigueur au 1er du mois. Ne pas générer : aucune paie n'est créée. | Chapitre 3 Paie (préparation et calcul) · 6.17 |
| D5 | Conflit d'un import de présences | Automatiquement, quand l'analyse d'un lot d'archives de présence trouve des présences déjà enregistrées (autre valeur, autre chantier le même jour, congé approuvé). | SUPER_ADMIN uniquement, non délégable · À risque | « Conserver l'existant » ; « Retenir l'import » ; « Trancher ligne par ligne » ; « Rejeter le lot » | Conserver : les lignes en conflit ne sont pas importées. Retenir : les présences existantes seront remplacées à l'import, en attente de validation, et restaurées si le lot est annulé. Ligne par ligne : choix ligne à ligne sur l'écran des imports, une seule fois. Rejeter : rien n'est importé. Aucune paie n'est créée ni recalculée. | Chapitre 2 Temps & présence (imports) · 6.17 |
| D6 | Clôture des mois de reprise | On veut valider une paie de septembre 2026 ou après alors que des mois de reprise (janvier à août 2026) sont encore ouverts. Demande depuis Paie › « Calcul de la paie » › « Demander la décision D6 ». | SUPER_ADMIN ou décideur délégué · À risque | « Attendre » ; « Valider en figeant les paramètres des mois de reprise » ; « Chaîne de clôture séparée pour les mois de reprise » | Attendre : la validation reste bloquée. Figer : les paramètres des mois de reprise sont figés. Chaîne séparée : les mois de reprise suivent leur propre circuit de clôture. Le choix est définitif ; aucun bulletin n'est modifié ; la validation se fait ensuite depuis l'écran Paie. | Chapitre 3 Paie (valider la paie) · 6.17 |
| D7 | Réouverture d'une paie | Une paie validée ou clôturée doit être corrigée. Demande depuis Paie › « Calcul de la paie » › « Demander la réouverture (D7) », avec un motif de 10 à 500 caractères. | SUPER_ADMIN uniquement, non délégable · À risque | « Réouvrir la paie » ; « Ne pas réouvrir » | Réouvrir : une copie figée de chaque bulletin est conservée ; paie et bulletins repassent en brouillon ; le pointage redevient modifiable ; aucun recalcul sans D3 ; les virements exécutés sont conservés et un nouveau virement reste bloqué ; déclarations et attestations ne changent pas. Option grisée si un lot de virement est généré ou déposé. | Chapitre 3 Paie (réouverture) · 6.17 |
| D8 | Correction d'une affectation | L'affectation (chantier) d'un contrat a été saisie par erreur et ne touche que des mois non traités. | SUPER_ADMIN ou décideur délégué · À risque | « Corriger l'affectation (erreur de saisie) » ; « Ne pas corriger » | Corriger : le chantier est corrigé pour la période ; si la zone IRG change, les bulletins brouillon concernés sont signalés et attendent D3. Ne pas corriger : rien ne change. | Chapitre 1 Personnel (contrats) · 6.17 |
| D9 | Virement bloqué (reprise, déjà viré ou payé hors application) | Des bulletins ne peuvent pas entrer dans un lot de virement ordinaire : mois de reprise, salaire déjà viré par un lot exécuté, ou paiement externe enregistré. Demande depuis Paie › « Virements » › « Demander la décision D9 (N) ». | SUPER_ADMIN ou décideur délégué · À risque | « Aucun virement » ; « État de rapprochement non bancaire » ; « Lot de virement réel — risque de double paiement » | Aucun virement : rien n'est produit. État de rapprochement : un fichier qui n'est pas un ordre de paiement. Lot réel : un lot de virement est généré malgré le risque de double paiement. Les deux dernières options s'exécutent une seule fois depuis l'écran Virements. | Chapitre 3 Paie (virements) · 6.17 |
| D10 | Déclaration bloquée (reprise ou déjà déclarée hors application) | Un export de déclaration couvre un mois de reprise ou un mois déjà déclaré hors application. Demande depuis la fenêtre d'export › « Demander la décision D10 ». | SUPER_ADMIN ou décideur délégué · À risque | « Exclure les mois concernés » ; « État de contrôle interne » ; « Fichier officiel — risque de double déclaration » | Exclure : les mois concernés sont retirés du fichier. État de contrôle : fichier marqué « non déclaratif », à ne pas déposer. Fichier officiel : produit malgré le risque de double déclaration. Exécution une seule fois depuis le registre des déclarations. | Chapitre 3 Paie (déclarations) · 6.17 |
| D11 | Correspondance des codes d'un import | Un lot d'archives de présence contient des codes inconnus. Demande depuis « Imports de présences » › « Codes inconnus : demander une correspondance » › « Demander la décision ». | SUPER_ADMIN ou décideur délégué · Ordinaire | « Valider pour ce lot seulement » ; « Valider et conserver comme politique » ; « Refuser la correspondance » | Ce lot seulement : les codes sont convertis pour ce lot, puis le lot est réanalysé. Politique : même effet, et la correspondance est proposée pour les prochains lots après une seconde confirmation dans l'onglet « Correspondances de codes ». Refuser : les lignes restent rejetées. | Chapitre 2 Temps & présence (imports) · 6.17 |
| D12 | Validation d'un import par son auteur | On veut fixer si la personne qui a importé un lot peut aussi le valider. Demande depuis « Imports de présences » › « Politique de validation » › « Demander une décision sur cette politique ». | SUPER_ADMIN uniquement, non délégable · À risque | « L'auteur peut valider son propre lot » ; « L'auteur ne peut pas valider son propre lot » | La politique choisie s'applique aux validations suivantes ; elle se change par une nouvelle décision. Tant qu'aucune décision n'a été prise, l'auteur ne peut pas valider son lot. | Chapitre 2 Temps & présence (imports) · 6.17 |
| D13 | Contrat ne commençant pas le 1er | Un contrat existant commence un autre jour que le 1er du mois. Demande depuis « Qualité des données » › « Demander D13 » (ou toutes les demandes d'un coup). | SUPER_ADMIN ou décideur délégué · Ordinaire | « Corriger la date de début au 1er du mois » ; « Marquer comme exception historique documentée » | Corriger : la date de début devient le 1er du même mois (l'affectation et le salaire initiaux suivent) ; option grisée si le mois est déjà traité ; les paies brouillon sont signalées. Exception : la date reste inchangée, la décision sert de justificatif, aucun montant ne change. | Chapitre 0 Prise en main (qualité des données) · 6.17 |
| D14 | Coefficient d'un code de présence | On veut changer le coefficient d'un code de présence à partir d'un mois. Demande depuis « Paramètres RH » › « Listes et codes » › « Demander le changement (D14) ». | SUPER_ADMIN ou décideur délégué (C = demander, M = décider) · Ordinaire | « Appliquer à partir du mois demandé » ; « Refuser » | Appliquer : nouveau coefficient à partir du 1er du mois d'effet ; les mois antérieurs et les mois validés ou clôturés gardent l'ancien ; les paies brouillon qui utilisent le code sont signalées et attendent D3. Refuser : rien ne change. | 6.11 · 6.17 |
| D15 | Voie de saisie d'un document à cheval sur 2025 et 2026 | Un document juridique a une période d'application qui chevauche 2025 et 2026. Demande depuis « Extraction IA » › « Demander la décision D15 ». | SUPER_ADMIN ou décideur délégué · Ordinaire | « Saisie manuelle » ; « Extraction IA possible » | Les deux options sont un simple enregistrement. Saisie manuelle : aucune analyse IA possible pour ce document. Extraction IA possible : l'analyse est autorisée. Dans les deux cas, chaque valeur suit ensuite le même circuit : proposition, approbation par une autre personne, puis D2. | Chapitre 5 Juridique (extraction IA) · 6.17 |

---

## A.3 Le cas de « D16 »

Vous rencontrerez la mention « D16 » dans l'application, par exemple « Portée d'une zone IRG (D16) » dans les propositions légales ou « Périmètre de zone IRG (D16) » dans la traçabilité d'un bulletin. **D16 n'est pas une décision du Centre de décisions** : il n'y a ni demande D16, ni droit « Décision D16 » dans la matrice.

D16 désigne la liste datée des wilayas qui composent une zone IRG. C'est un contenu légal, qui suit le circuit des propositions légales :

1. une proposition est rédigée (brouillon), puis soumise ;
2. une autre personne l'approuve ;
3. une décision D2 (Date d'application d'une règle légale) fixe le mois à partir duquel elle s'applique.

Pour la procédure, voir le chapitre 5 Juridique (propositions légales).
