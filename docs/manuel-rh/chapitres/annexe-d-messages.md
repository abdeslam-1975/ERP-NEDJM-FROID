# Annexe D Messages fréquents et solutions — الرسائل الشائعة والحلول

**Dans cette annexe** — Les messages et situations que vous rencontrerez le plus souvent, classés par thème. Pour chacun : le texte exact affiché (entre « »), sa cause et ce qu'il faut faire. Dans les messages, « N » remplace un nombre, « MM/AAAA » un mois et « … » une partie variable. Certains messages sont suivis de leur traduction arabe à l'écran (« texte · النص ») ; seule la partie française est reprise ici.

Si un message n'est pas dans cette liste, notez son texte exact, l'écran et l'heure, et transmettez-les à votre administrateur.

---

## 1 Connexion et accès

### 1.1 « E-mail ou mot de passe incorrect. »
- **Cause** — L'adresse ou le mot de passe saisi est faux.
- **Que faire** — Vérifiez la langue du clavier et les majuscules, utilisez l'icône œil pour relire le mot de passe. En cas d'oubli, demandez à votre administrateur un mot de passe temporaire.
- **Voir** — 0.1

### 1.2 « Compte désactivé ou suspendu. Contactez un administrateur. »
- **Cause** — Votre compte a été désactivé.
- **Que faire** — Contactez un administrateur (SUPER_ADMIN ou ADMIN_RH) pour le réactiver.
- **Voir** — 0.1 · chapitre 6, écran « Utilisateurs »

### 1.3 « La confirmation ne correspond pas » · « Le nouveau mot de passe doit contenir au moins 10 caractères » · « Le nouveau mot de passe doit être différent de l'actuel »
- **Cause** — Le changement de mot de passe obligatoire de la première connexion est mal rempli.
- **Que faire** — Saisissez un nouveau mot de passe d'au moins 10 caractères, différent du mot de passe temporaire, et la même valeur dans « Confirmer le nouveau mot de passe ».
- **Voir** — 0.1

### 1.4 « Accès refusé pour votre rôle. »
- **Cause** — Vous avez ouvert un écran que votre rôle n'a pas le droit de consulter. L'application vous a renvoyé à la page d'accueil.
- **Que faire** — Vérifiez le chantier choisi dans « Site actif ». Si vous avez besoin de cet écran, demandez le droit au SUPER_ADMIN en précisant l'écran et l'action voulue.
- **Voir** — 0.9

### 1.5 « Cette page n'est pas affichée pour votre rôle (Paramètres → Interface). »
- **Cause** — L'écran a été masqué pour votre rôle par le SUPER_ADMIN. Un écran masqué est aussi bloqué.
- **Que faire** — Demandez au SUPER_ADMIN de l'afficher pour votre rôle ou pour votre compte.
- **Voir** — 0.2 · 0.9

### 1.6 « Saisie des montants réservée à SUPER_ADMIN, ADMIN_RH et GERANT. »
- **Cause** — Vous essayez de saisir un montant (rubrique de salaire, exception, avance, valeur de contrat) sans avoir l'un de ces rôles.
- **Que faire** — Faites faire la saisie par une personne autorisée.
- **Voir** — 0.9

### 1.7 « Accès refusé à l'écran Employés (RBAC). »
- **Cause** — Votre rôle n'a pas le droit de lire ou de modifier les employés.
- **Que faire** — Demandez le droit nécessaire au SUPER_ADMIN.
- **Voir** — 0.9 · chapitre 1

### 1.8 « Vous n'avez pas le droit de prendre cette décision. Le SUPER_ADMIN peut vous le déléguer depuis la matrice des droits. »
- **Cause** — Vous ouvrez une décision au Centre de décisions sans être habilité à la trancher. Par défaut, seul le SUPER_ADMIN décide.
- **Que faire** — Laissez le décideur habilité trancher, ou demandez une délégation au SUPER_ADMIN. Les décisions D5, D7 et D12 ne se délèguent pas.
- **Voir** — 0.9 · chapitre 6, fiche « Décider au Centre de décisions »

### 1.9 « Séparation des tâches : vous êtes à l'origine de cette demande, un autre décideur doit la trancher. »
- **Cause** — Vous avez vous-même demandé cette décision. La personne qui demande ne décide pas (sauf le SUPER_ADMIN).
- **Que faire** — Demandez à un autre décideur habilité de la trancher.
- **Voir** — 0.9

### 1.10 « Réservé au SUPER_ADMIN. »
- **Cause** — L'action est réservée au SUPER_ADMIN (par exemple ajouter la contrainte « début au 1er du mois », régler l'accès par compte).
- **Que faire** — Demandez au SUPER_ADMIN de la faire.
- **Voir** — 0.8 · 0.9

---

## 2 Grille de présence

### 2.1 « Des modifications non validées seront perdues. Continuer ? »
- **Cause** — Vous avez modifié des cases de la grille (point orange sur « Valider ») et vous changez de mois, de chantier ou d'employé, cliquez sur un lien ou fermez la page. Rien n'est enregistré avant « Valider ».
- **Que faire** — Refusez la confirmation (bouton d'annulation de la fenêtre), puis cliquez sur « Valider » pour enregistrer. Acceptez la confirmation seulement si vous voulez vraiment abandonner vos modifications.
- **Voir** — chapitre 2, fiche « Valider le pointage du mois »

### 2.2 Des jours effacés (mission ou congé) réapparaissent dans la grille
- **Cause** — Vous avez effacé des jours proposés par un ordre de mission ou un congé, mais vous n'avez pas cliqué sur « Valider ». L'effacement n'a pas été enregistré : les jours proposés sont toujours là au rechargement. Les missions sans date de retour sont en plus prolongées automatiquement chaque nuit.
- **Que faire** — Effacez de nouveau les jours puis cliquez sur « Valider ». Un jour effacé **et validé** est mémorisé : il ne sera plus reproposé. Si le congé ou la mission est faux, corrigez plutôt le document lui-même (dates de l'ordre de mission, annulation du congé).
- **Voir** — chapitre 2, fiches « Valider le pointage du mois » et « Établir un ordre de mission »

### 2.3 « Code non autorisé : X. Codes : … »
- **Cause** — Le code tapé dans la case n'existe pas ou n'est pas actif. La case reprend son ancienne valeur.
- **Que faire** — Tapez l'un des codes listés dans le message, ou ouvrez « Légende des codes ».
- **Voir** — chapitre 2, fiche « Saisir le pointage dans la grille »

### 2.4 « Saisie des jours non autorisée pour votre rôle. » · « Aucune colonne modifiable pour votre rôle. »
- **Cause** — Votre rôle n'a pas le droit de modifier les jours (ou les colonnes) de la feuille de présence.
- **Que faire** — Demandez au SUPER_ADMIN le droit de modification sur la feuille de présence, ou faites saisir par une personne autorisée.
- **Voir** — chapitre 6

### 2.5 « Aucune colonne autorisée pour votre rôle sur ce chantier. »
- **Cause** — Aucune colonne de la feuille de présence n'est visible pour votre rôle sur ce chantier.
- **Que faire** — Vérifiez le chantier choisi, puis demandez l'accès au SUPER_ADMIN.
- **Voir** — chapitre 2

### 2.6 « Aucun contrat sur ce chantier pour ce mois. »
- **Cause** — Aucun contrat ne couvre ce mois sur ce chantier : la grille n'a pas de ligne.
- **Que faire** — Vérifiez le chantier et le mois. Pour un salarié manquant, créez ou corrigez son contrat (chapitre 1).
- **Voir** — chapitre 1, fiche « Créer un contrat de travail »

### 2.7 « N paie(s) brouillon signalée(s) « données modifiées depuis le calcul » : aucun recalcul automatique, décision demandée au Centre de décisions. »
- **Cause** — Message d'information : vous avez validé un pointage d'un mois dont la paie brouillon existait déjà.
- **Que faire** — Rien sur la grille. La personne qui gère la paie fera trancher la décision D3 (Recalcul des paies brouillon).
- **Voir** — 3.1 de cette annexe · Annexe B, étape B.8

### 2.8 « Présences enregistrées, mais la paie n'a pas pu être signalée : … »
- **Cause** — Le pointage est bien enregistré, mais la paie brouillon n'a pas pu être marquée comme modifiée.
- **Que faire** — Prévenez la personne qui gère la paie : elle doit cliquer sur « Demander un recalcul » dans l'écran Paie pour ce chantier et ce mois.
- **Voir** — chapitre 3, fiche « Demander la génération de la paie »

### 2.9 Pastille « N importée(s) » qui ne disparaît pas après « Valider »
- **Cause** — Les jours importés depuis l'écran « Imports de présences » et laissés tels quels ne sont pas validés par le bouton « Valider » de la grille.
- **Que faire** — Faites valider le lot depuis Imports de présences › onglet « À valider » (par une autre personne que celle qui l'a importé).
- **Voir** — chapitre 2, fiche « Valider les présences importées »

---

## 3 Paie et décisions

### 3.1 « Données modifiées depuis le calcul (N) · décision requise »
- **Cause** — Une donnée qui entre dans la paie (pointage, contrat, rubrique, exception, avance, congé, sortie, wilaya, règle légale…) a changé après le calcul de la paie brouillon. L'application ne recalcule rien d'elle-même et a ouvert une décision D3 (Recalcul des paies brouillon). La note « Données modifiées depuis le calcul » apparaît aussi sous le nom des salariés concernés.
- **Que faire** — Cliquez sur la pastille pour ouvrir la décision D3. Le décideur choisit « Recalculer les bulletins concernés » ou « Conserver les bulletins tels quels ».
- **Voir** — Annexe B, étape B.8 · chapitre 3, fiche « Recalculer un bulletin »

### 3.2 « Données modifiées depuis le calcul : décidez de recalculer ou de conserver les bulletins (Centre de décisions) avant de valider. »
- **Cause** — Vous essayez de valider une paie alors qu'une décision D3 n'est pas tranchée. Le bouton « Valider la paie » est grisé pour la même raison.
- **Que faire** — Faites trancher la décision D3, puis validez.
- **Voir** — Annexe B, étapes B.8 et B.9

### 3.3 Le bulletin ne tient pas compte d'un nouveau taux, d'une rubrique ou d'une correction
- **Cause** — Le bulletin a été calculé **avant** le changement. Aucun recalcul n'est automatique. Autres causes possibles : la règle légale n'a pas encore de date d'application (décision D2) ou ne s'applique qu'à partir d'un mois plus tardif ; ou le bulletin est déjà validé (montants figés).
- **Que faire** — Pour un bulletin brouillon : Documents › Registre › « Bulletin de paie » › « Recalculer », ou écran Paie › « Demander un recalcul », puis faire trancher la décision D3. Pour une règle légale, vérifiez sa date d'application (chapitre 5). Pour un bulletin validé, voir 4.4.
- **Voir** — chapitre 3, fiche « Recalculer un bulletin » · chapitre 5, fiche « Choisir la date d'application (décision D2) »

### 3.4 « Pas encore générée pour ce chantier. » · « Génération demandée · en attente de décision »
- **Cause** — La paie de ce chantier et de ce mois n'existe pas encore. Si la seconde mention apparaît, une décision D4 (Génération de paie) attend le décideur.
- **Que faire** — Demandez la génération (« Demander la génération ») ou relancez le décideur au Centre de décisions.
- **Voir** — Annexe B, étape B.7

### 3.5 « Aucun bulletin à valider : générez la paie d'abord. »
- **Cause** — La paie n'a pas encore été calculée.
- **Que faire** — Demandez la génération (décision D4).
- **Voir** — Annexe B, étape B.7

### 3.6 « N jour(s) proposé(s) (ordres de mission) non validé(s) dans le pointage. »
- **Cause** — Des jours de mission proposés par un ordre de mission n'ont pas été validés dans la grille du mois.
- **Que faire** — Ouvrez la grille de présence du chantier et du mois, contrôlez ces jours et cliquez sur « Valider ». Puis validez la paie.
- **Voir** — Annexe B, étape B.3

### 3.7 « N règle(s) légale(s) attendent leur approbation ou leur date d'application pour MM/AAAA : génération de la paie bloquée (décision D1). … »
- **Cause** — Une règle légale du mois (taux, barème…) est proposée mais pas encore approuvée, ou approuvée sans date d'application. Le même message existe pour la validation.
- **Que faire** — Faites approuver la proposition et décider sa date d'application (décision D2), ou demandez la décision D1 depuis la préparation du mois (attendre ou calculer une simulation non validable).
- **Voir** — Annexe B, étape B.6 · chapitre 5

### 3.8 « Validation bloquée : des mois de reprise (janvier à août 2026) restent ouverts. Décision D6 requise (Centre de décisions) : attendre, figer leurs paramètres ou séparer la chaîne de reprise. »
- **Cause** — Vous validez un mois opérationnel (septembre 2026 ou après) alors que des mois de reprise ne sont pas clos.
- **Que faire** — Cliquez sur « Demander la décision D6 » et faites-la trancher, puis validez.
- **Voir** — Annexe B, étape B.9 · chapitre 3, fiche « Demander la décision D6 »

### 3.9 « Calcul de paie refusé : décision D3 ou D4 valide requise (Centre de décisions). »
- **Cause** — Aucune décision de génération ou de recalcul valide n'existe, ou elle a déjà servi (une décision ne sert qu'une fois).
- **Que faire** — Demandez une nouvelle génération ou un nouveau recalcul.
- **Voir** — Annexe B, étapes B.7 et B.8

### 3.10 « Les données ont changé depuis l'affichage : la demande a été mise à jour. Relisez-la avant de décider. »
- **Cause** — Les données de la demande ont changé entre l'ouverture de la page et votre clic. Votre décision n'a pas été enregistrée.
- **Que faire** — Relisez la demande mise à jour, puis décidez de nouveau.
- **Voir** — chapitre 6, fiche « Décider au Centre de décisions »

### 3.11 « Les données ont changé depuis la décision : elle est invalidée et une nouvelle demande est ouverte. »
- **Cause** — Les données ont changé entre la décision et son exécution. La décision est devenue « Invalidée ».
- **Que faire** — Cliquez sur « Ouvrir la nouvelle demande » et faites-la trancher.
- **Voir** — chapitre 6

### 3.12 « Décision enregistrée, mais l'exécution a échoué : … »
- **Cause** — La décision est prise mais l'opération (calcul, application) n'a pas abouti.
- **Que faire** — Lisez la fin du message, corrigez la cause si elle est indiquée, puis cliquez sur « Exécuter la décision » (auteur de la décision ou SUPER_ADMIN).
- **Voir** — chapitre 6

### 3.13 « La situation a changé : cette demande est close (voir le motif de clôture). Aucune opération n'a été faite. »
- **Cause** — La demande n'a plus d'objet (par exemple « La paie n'est plus en brouillon. » ou « Une paie existe déjà pour ce mois. »).
- **Que faire** — Lisez le motif de clôture. Rien n'a été modifié ; ouvrez une nouvelle demande si besoin.
- **Voir** — chapitre 6

### 3.14 « Justification obligatoire (10 caractères minimum). » · « Décision à risque : confirmez avoir pris connaissance des conséquences. » · « Choisissez une option. »
- **Cause** — Le panneau « Votre décision » est incomplet.
- **Que faire** — Choisissez une option, écrivez une justification d'au moins 10 caractères et, pour une décision à risque, cochez « J'ai pris connaissance des conséquences de cette décision à risque. »
- **Voir** — chapitre 6

### 3.15 « Aucun contrat de travail payable en MM/AAAA pour cet employé : enregistrez d'abord son contrat. »
- **Cause** — Le salarié n'a pas de contrat couvrant ce mois : il ne peut pas avoir de bulletin.
- **Que faire** — Créez ou corrigez son contrat, puis demandez la génération ou le recalcul.
- **Voir** — chapitre 1, fiche « Créer un contrat de travail »

### 3.16 « La paie de MM/AAAA est établie par chantier (…) et ce salarié n'y figure pas : ajoutez son pointage validé sur ce chantier puis recalculez depuis l'écran Paie. »
- **Cause** — Le salarié n'a pas de pointage validé sur le chantier de la paie.
- **Que faire** — Saisissez et validez son pointage, puis demandez un recalcul depuis l'écran Paie.
- **Voir** — Annexe B, étapes B.3 et B.8

### 3.17 « Barème IRG introuvable pour la période : IRG = 0 »
- **Cause** — Avertissement du calcul : aucun barème IRG n'est en vigueur pour ce mois. L'IRG des bulletins vaut 0.
- **Que faire** — Ne validez pas. Faites vérifier le barème IRG (chapitre 5), puis demandez un recalcul.
- **Voir** — chapitre 5, onglet IRG de « Cotisations & impôts »

### 3.18 « Double validation : l'exception doit être approuvée par une autre personne (Gérant ou autre responsable). »
- **Cause** — Vous essayez d'approuver une exception que vous avez saisie vous-même.
- **Que faire** — Demandez l'approbation à un autre responsable. Le GERANT et le SUPER_ADMIN peuvent approuver leurs propres saisies.
- **Voir** — Annexe B, étape B.5

---

## 4 Mois figés (paie validée ou clôturée)

### 4.1 « Paie validée pour ce mois : le pointage est figé. Demandez la réouverture depuis Paie (décision D7 du SUPER_ADMIN). »
- **Cause** — La paie du mois est validée : le pointage ne se modifie plus.
- **Que faire** — Si la correction peut attendre, faites-la en rappel sur le mois suivant. Sinon, la personne autorisée demande la réouverture (« Demander la réouverture (D7) ») et le SUPER_ADMIN décide.
- **Voir** — Annexe B, étape B.12 · chapitre 3, fiche « Demander la réouverture d'une paie (D7) »

### 4.2 « Paie clôturée pour ce mois : le pointage est figé (réouverture seulement sur décision D7 du SUPER_ADMIN). » · « Paie clôturée : aucune modification sans décision D7 du SUPER_ADMIN. »
- **Cause** — La paie du mois est clôturée.
- **Que faire** — Corrigez en rappel sur un mois ouvert ; la réouverture (D7) reste exceptionnelle.
- **Voir** — Annexe B, étape B.12

### 4.3 « Pointage figé du … : paie … »
- **Cause** — Vous tentez d'enregistrer une présence sur un jour dont la paie est validée ou clôturée.
- **Que faire** — Même conduite que 4.1 et 4.2.
- **Voir** — chapitre 2

### 4.4 « Bulletin validé : montants figés. Une réouverture (décision D7) est nécessaire pour recalculer. »
- **Cause** — Vous voulez recalculer un bulletin déjà validé.
- **Que faire** — Corrigez en rappel sur le mois suivant, ou demandez une réouverture (D7).
- **Voir** — chapitre 3, fiche « Demander la réouverture d'une paie (D7) »

### 4.5 « Mois MM/AAAA déjà validé ou clôturé pour cet employé : choisissez un mois ouvert (rappel). »
- **Cause** — Vous saisissez une exception sur un mois déjà validé ou clôturé.
- **Que faire** — Saisissez l'exception sur le premier mois encore ouvert, en précisant dans le motif qu'il s'agit d'un rappel.
- **Voir** — Annexe B, étape B.5

### 4.6 « Lot de virement généré ou déposé pour cette paie : annulez-le, ou enregistrez son exécution, avant de demander la réouverture. »
- **Cause** — Un lot de virement de cette paie est en cours : la réouverture est refusée pour éviter un double paiement.
- **Que faire** — Dans Paie › Virements, annulez le lot ou enregistrez son exécution, puis demandez la réouverture.
- **Voir** — Annexe B, étape B.10

### 4.7 « Validez la paie avant de la clôturer. » · « Clôture réservée à SUPER_ADMIN et GERANT. »
- **Cause** — La paie n'est pas encore validée, ou votre rôle ne permet pas de clôturer.
- **Que faire** — Validez d'abord la paie ; faites clôturer par le GERANT ou le SUPER_ADMIN.
- **Voir** — Annexe B, étapes B.9 et B.12

---

## 5 Contrats, congés, missions et imports

### 5.1 « Un contrat commence le 1er du mois : aucun contrat ne débute en milieu de mois. … »
- **Cause** — La date de début saisie n'est pas le 1er du mois.
- **Que faire** — Ramenez la date de début au 1er du mois.
- **Voir** — chapitre 1, fiche « Créer un contrat de travail » · 0.7

### 5.2 « Ce salarié a déjà un contrat principal ouvert (début …). … »
- **Cause** — Le salarié a déjà un contrat principal ouvert qui commence le même jour ou après le nouveau.
- **Que faire** — Fermez la fenêtre et ouvrez le contrat existant avec « Modifier », ou décochez « Affectation principale ».
- **Voir** — chapitre 1, fiche « Créer un contrat de travail »

### 5.3 « Demande non autorisée pour ce contrat. »
- **Cause** — Vous demandez une décision D13 sur un contrat d'un chantier que vous ne pouvez pas modifier.
- **Que faire** — Faites la demande par une personne ayant le droit de modifier les contrats de ce chantier.
- **Voir** — 0.7

### 5.4 « Chevauchement avec une autre demande. »
- **Cause** — Une demande de congé en attente ou approuvée couvre déjà une partie de ces dates pour ce salarié.
- **Que faire** — Consultez les demandes du salarié ; annulez ou corrigez celle qui chevauche.
- **Voir** — chapitre 2, fiche « Saisir une demande de congé »

### 5.5 « Solde insuffisant (x j disponibles pour y j demandés). Approuver quand même ? »
- **Cause** — Le congé annuel demandé dépasse le solde du salarié.
- **Que faire** — Vérifiez le solde (onglet « Soldes ») ; approuvez seulement si l'écart est justifié, sinon refusez ou réduisez la demande.
- **Voir** — chapitre 2, fiche « Approuver ou refuser une demande de congé »

### 5.6 « Décision réservée aux RH (SUPER_ADMIN, ADMIN_RH, GERANT). »
- **Cause** — Vous essayez d'approuver ou de refuser un congé sans avoir l'un de ces rôles.
- **Que faire** — Faites approuver le congé par une personne autorisée.
- **Voir** — chapitre 2

### 5.7 « La date de départ doit être aujourd'hui ou une date future. »
- **Cause** — Un ordre de mission ne peut pas être créé avec une date de départ passée.
- **Que faire** — Saisissez une date de départ égale ou postérieure à aujourd'hui.
- **Voir** — chapitre 2, fiche « Établir un ordre de mission »

### 5.8 « Affectation introuvable : impossible de lier l'ordre au pointage. »
- **Cause** — L'employé n'a ni chantier choisi dans « Affectation », ni contrat principal donnant un chantier.
- **Que faire** — Choisissez le chantier dans « Affectation », ou créez le contrat de l'employé.
- **Voir** — chapitre 2, fiche « Établir un ordre de mission »

### 5.9 « Séparation des tâches : vous avez importé ce lot, sa validation revient à une autre personne (politique D12). »
- **Cause** — Vous essayez de valider un lot de présences que vous avez vous-même importé.
- **Que faire** — Demandez la validation à une autre personne habilitée.
- **Voir** — Annexe B, étape B.4

### 5.10 « N ligne(s) rejetée(s) ne seront pas importées : confirmez l'import des seules lignes acceptées. »
- **Cause** — Le lot contient des lignes rejetées à l'analyse.
- **Que faire** — Lisez les motifs de rejet. Cochez la case de prise de connaissance pour importer les seules lignes acceptées, ou corrigez le fichier et déposez-le de nouveau.
- **Voir** — chapitre 2, fiche « Importer les présences acceptées »

### 5.11 « Présences modifiées pendant l'import : rien n'a été importé. Relancez l'analyse du lot. »
- **Cause** — Quelqu'un a modifié le pointage concerné pendant l'import.
- **Que faire** — Relancez l'analyse du lot, puis importez de nouveau.
- **Voir** — chapitre 2

---

## 6 Virements et déclarations

### 6.1 « Aucun bulletin virable par un lot ordinaire pour ce mode (déjà en lot, brouillon, compte manquant ou bloqué D9). »
- **Cause** — Aucun bulletin ne remplit les conditions : paie non validée, bulletins déjà dans un lot, comptes manquants, mode de paiement différent, ou bulletins bloqués (mois de reprise, déjà payés).
- **Que faire** — Validez la paie, complétez les comptes dans les fiches employés, vérifiez le « Mode » choisi. Pour les bulletins bloqués, voir la décision D9.
- **Voir** — Annexe B, étape B.10

### 6.2 « Compte CCP manquant » · « Clé CCP (2 chiffres) manquante » · « RIB bancaire incomplet (20 chiffres attendus) »
- **Cause** — Le compte de paiement du salarié est absent ou incomplet dans sa fiche.
- **Que faire** — Corrigez la fiche employé, puis préparez de nouveau le lot.
- **Voir** — chapitre 1, fiche « Créer un employé »

### 6.3 « Paie non validée : montants susceptibles de changer. Ne pas déposer. »
- **Cause** — Vous produisez une déclaration avant la validation de la paie : le fichier est provisoire.
- **Que faire** — Ne déposez pas ce fichier. Validez la paie, puis produisez de nouveau la déclaration.
- **Voir** — Annexe B, étape B.11

### 6.4 « Export bloqué : décision D10 requise. »
- **Cause** — Le mois concerné est un mois de reprise, ou une déclaration externe a déjà été enregistrée : un nouvel export risquerait une double déclaration.
- **Que faire** — Saisissez le « Motif de la demande D10 » et cliquez sur « Demander la décision D10 » seulement si un fichier est vraiment nécessaire ; sinon, ne produisez rien.
- **Voir** — chapitre 3, fiche « Demander la décision D10 »

---

**Voir aussi** — Annexe B Le mois de paie pas à pas · 0.9 Connaître votre rôle et vos droits
