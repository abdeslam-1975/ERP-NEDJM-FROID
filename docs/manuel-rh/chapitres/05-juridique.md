# 5 Juridique — القانوني

**Dans ce chapitre** — La section « Juridique » contient les taux et les règles légales utilisés par la paie : cotisations CNAS et CACOBATPH, impôt sur le revenu global (IRG), salaire minimum et autres paramètres. Aucune de ces valeurs ne change directement : chaque modification devient une **proposition**, validée par une autre personne, puis appliquée à partir d'un mois choisi par décision. Vous apprendrez à proposer un changement avec ses justificatifs, à approuver ou rejeter une proposition, à choisir sa date d'application, à tenir le registre des textes officiels, à utiliser l'extraction par intelligence artificielle (IA) et à surveiller la publication de nouveaux textes avec la veille juridique.

| Fonction | Vidéo | Public |
|---|---|---|
| 5.1 Comprendre le circuit d'une modification légale | V5.1 | SUPER_ADMIN, ADMIN_RH, ADMIN_FINANCE, GERANT |
| 5.2 Consulter les cotisations et impôts | V5.2 | SUPER_ADMIN, ADMIN_RH, ADMIN_FINANCE, GERANT |
| 5.3 Proposer une nouvelle valeur | V5.3 | SUPER_ADMIN, ADMIN_RH, ADMIN_FINANCE |
| 5.4 Faire vérifier une valeur reprise | V5.3 | SUPER_ADMIN, ADMIN_RH, ADMIN_FINANCE |
| 5.5 Gérer les régimes CNAS | V5.5 | SUPER_ADMIN, ADMIN_RH, ADMIN_FINANCE |
| 5.6 Ajouter ou modifier une rubrique | V5.6 | SUPER_ADMIN, ADMIN_RH, ADMIN_FINANCE |
| 5.7 Proposer l'arrêt ou supprimer une rubrique | V5.6 | SUPER_ADMIN, ADMIN_RH, ADMIN_FINANCE |
| 5.8 Gérer le barème IRG | V5.8 | SUPER_ADMIN, ADMIN_RH, ADMIN_FINANCE |
| 5.9 Gérer les règles IRG (article 104) | V5.9 | SUPER_ADMIN, ADMIN_RH, ADMIN_FINANCE |
| 5.10 Proposer la portée d'une zone IRG | V5.10 | SUPER_ADMIN, ADMIN_RH, ADMIN_FINANCE |
| 5.11 Consulter les propositions légales | V5.11 | SUPER_ADMIN, ADMIN_RH, ADMIN_FINANCE, GERANT |
| 5.12 Soumettre ou retirer une proposition | V5.11 | SUPER_ADMIN, ADMIN_RH, ADMIN_FINANCE |
| 5.13 Approuver ou rejeter une proposition | V5.13 | Approbateurs des règles légales (SUPER_ADMIN par défaut) |
| 5.14 Choisir la date d'application (décision D2) | V5.14 | Approbateurs des règles légales, SUPER_ADMIN |
| 5.15 Importer un document juridique | V5.15 | SUPER_ADMIN, ADMIN_RH, ADMIN_FINANCE |
| 5.16 Consulter le registre et corriger un document juridique | V5.16 | SUPER_ADMIN, ADMIN_RH, ADMIN_FINANCE, GERANT |
| 5.17 Retirer un document juridique | V5.16 | SUPER_ADMIN |
| 5.18 Demander la décision D15 (voie de saisie) | V5.18 | SUPER_ADMIN |
| 5.19 Lancer une analyse IA d'un document | V5.19 | SUPER_ADMIN |
| 5.20 Relire une suggestion IA et créer la proposition | V5.20 | SUPER_ADMIN |
| 5.21 Écarter une suggestion IA | V5.20 | SUPER_ADMIN |
| 5.22 Suivre la veille juridique et lancer une vérification | V5.22 | SUPER_ADMIN |
| 5.23 Examiner et écarter les textes détectés | V5.23 | SUPER_ADMIN |
| 5.24 Importer un texte détecté au registre | V5.23 | SUPER_ADMIN |
| 5.25 Gérer les domaines autorisés | V5.25 | SUPER_ADMIN |
| 5.26 Gérer les sources surveillées | V5.25 | SUPER_ADMIN |
| 5.27 Gérer les mots-clés de la veille | V5.27 | SUPER_ADMIN |

## 5.0 L'écran en un coup d'œil

La section « Juridique » de la barre RH contient cinq onglets : « Cotisations & impôts », « Propositions légales », « Documents juridiques », « Extraction IA » et « Veille juridique ». Un onglet n'apparaît que si vos droits le permettent.

**« Cotisations & impôts »** (`/rh/legal`)
- Surtitre « Juridique », titre « Cotisations & impôts ». Description : « Proposez l'ajout, la modification ou l'arrêt d'une rubrique : après approbation, le SUPER_ADMIN décide du mois d'application, jamais sur les paies passées. »
- Quatre onglets : « CNAS », « CACOBATPH », « Impôts (IRG) », « Autres (SNMG…) ».
- Un bandeau bleu de période : « Paies validées ou clôturées jusqu'à … : leurs montants ne changent jamais. Toute modification s'applique au plus tôt à partir de … », suivi du rappel que toute modification devient une proposition.
- Selon l'onglet :
  - « CNAS » : panneau « Régimes CNAS » ;
  - « CACOBATPH » : panneau « Rubriques CACOBATPH » ;
  - « Impôts (IRG) » : panneau « Rubriques impôts », puis « Barème IRG » (tranches et règles de l'article 104), puis « Portée des zones IRG (wilayas concernées) » ;
  - « Autres (SNMG…) » : panneau « Paramètres liés à la paie ».
- Sans droit de modification, la mention « Lecture seule : modification réservée à SUPER_ADMIN, ADMIN_RH et ADMIN_FINANCE (unité 05). » s'affiche sous les tableaux et les boutons disparaissent.

**« Propositions légales »** (`/rh/legal/propositions`)
- Quatre vues avec compteurs : « En cours (n) », « À approuver (n) », « Approuvées, date à décider (n) », « Toutes (n) ». Lien « Afficher tout l'historique ».
- Une carte par proposition, avec ses boutons d'action en bas à droite.

**« Documents juridiques »** (`/rh/legal/documents`)
- Titre « Registre des documents juridiques », bouton « Importer un document ».
- Barre d'outils : sélecteur d'année (période d'application), recherche « Rechercher (intitulé, référence, JO) ».
- Panneau « Couverture du registre en AAAA » : 12 cases, une par mois.
- Une carte par document.

**« Extraction IA »** (`/rh/legal/extraction-ia`)
- Titre « Extraction IA des documents juridiques » et bandeau d'avertissement.
- Sélecteur « Document du registre (version en vigueur) », puis panneau du document, panneau « Lancer une analyse », résultats de l'analyse et « Analyses précédentes ».

**« Veille juridique »** (`/rh/legal/veille`)
- Titre « Veille juridique », bouton « Vérifier maintenant », bandeau d'information.
- Quatre compteurs : « Dernière vérification », « Textes pertinents à examiner », « Sources actives », « Sources en erreur ».
- Cinq onglets : « Textes détectés », « Sources surveillées », « Domaines autorisés », « Mots-clés », « Historique ».

---

## 5.1 Comprendre le circuit d'une modification légale

> **Vidéo V5.1** · durée estimée 4 min · Public : SUPER_ADMIN, ADMIN_RH, ADMIN_FINANCE, GERANT

**Où la trouver** — Tous les écrans de la section Ressources Humaines › Juridique. Le circuit se suit dans « Propositions légales » (`/rh/legal/propositions`) et se termine dans le Centre de décisions (`/decisions`).

**À quoi ça sert** — Comprendre pourquoi un taux modifié ne change pas tout de suite la paie, et qui fait quoi entre la proposition et l'application. Ce circuit protège les paies déjà validées et impose un contrôle par une deuxième personne.

**Avant de commencer**
- [ ] Le texte officiel qui justifie le changement est importé au registre des documents juridiques (fiche 5.15).

**Étapes du circuit**
1. **Proposer.** Depuis « Cotisations & impôts » (ou depuis « Extraction IA »), vous saisissez la nouvelle valeur, le mois souhaité et les justificatifs. Un bandeau le rappelle : « Ce changement devient une proposition : un approbateur la valide, puis le SUPER_ADMIN décide de sa date d'application (D2). La paie ne change pas avant. » Message après envoi : « Proposition envoyée pour approbation : aucun effet sur la paie avant l'approbation, puis la décision de sa date d'application (D2). »
2. **Approuver.** Une **autre personne** que celles qui ont contribué à la proposition l'approuve ou la rejette (fiche 5.13). Seul le SUPER_ADMIN peut approuver sa propre proposition ; c'est alors signalé.
3. **Décider la date d'application.** La décision D2 (Date d'application d'une règle légale) fixe le mois à partir duquel la nouvelle valeur s'applique, toujours au 1er d'un mois dont la paie n'est ni validée ni clôturée (fiche 5.14). Le SUPER_ADMIN confirme la décision dans le Centre de décisions.
4. **Recalculer si besoin.** Les paies brouillon concernées sont signalées. Elles ne sont recalculées que sur décision D3 (Recalcul des paies brouillon), voir chapitre 3.

**Les statuts d'une proposition**
- « Brouillon » : créée mais pas encore soumise.
- « Soumise, à approuver » : en attente d'un approbateur.
- « Approuvée, sans effet (date à décider) » : approuvée, en attente de la décision D2.
- « En vigueur » : appliquée à partir du mois décidé.
- « Rejetée », « Retirée », « Caduque » : propositions closes.

**Les familles et les actions**
- Familles : « Taux ou variable légale », « Taux d'un régime CNAS », « Barème IRG », « Règles IRG (art. 104) », « Portée d'une zone IRG (D16) ».
- Actions : « Nouvelle valeur », « Arrêt », « Vérification d'une valeur existante ».

**Les champs de source, communs à toutes les propositions**
1. « Source légale » (obligatoire, 3 caractères minimum) : texte, article, numéro et date du Journal officiel. Exemple affiché : « ex. LF 2026, art. 12 — JO n° 85 du 30/12/2025 ».
2. « Date d'effet du texte » (obligatoire) : la date prévue par le texte lui-même.
3. Bloc « Justificatifs * » (au moins 1, au plus 20). Pour chaque justificatif :
   - « Document 1 », « Document 2 »… (obligatoire) : choisissez un texte du registre des documents juridiques (« Choisir un document… ») ; sa période d'application s'affiche ;
   - « Article » (obligatoire), par exemple art. 104 ;
   - « Page » (obligatoire), de 1 à 5000 ;
   - « Extrait du texte » (obligatoire) : recopiez le passage exact, de 10 à 2000 caractères.
4. Boutons « Ajouter un justificatif » et « Retirer ce justificatif ». Le lien « Registre des documents juridiques » ouvre le registre dans un nouvel onglet.

**Le dialogue « Écart à la réglementation »**
- Si la valeur saisie s'écarte des valeurs légales de référence, un dialogue s'ouvre : « La valeur proposée s'écarte du barème légal en vigueur. Le dépassement est enregistré dans le journal d'audit. »
- Trois boutons :
  - « Fermer » : revenir à la saisie ;
  - « Respecter la réglementation » : remplacer votre valeur par la valeur légale ;
  - « Autoriser le dépassement » : garder votre valeur ; l'écart est tracé.
- Valeurs légales de référence utilisées pour ce contrôle :
  - CNAS : 9 % salarié, 25 % employeur, 0,5 % œuvres sociales (FOS). Un taux employeur de 25,5 % ou 26 % pour le régime général est signalé comme comptant deux fois les œuvres sociales.
  - CACOBATPH : congés payés 12,21 % à la charge de l'employeur ; intempéries 0,75 %, partagés 0,375 % salarié et 0,375 % employeur.
  - Barème IRG et règles de l'article 104 : voir les fiches 5.8 et 5.9.

**Résultat** — Une modification légale n'a jamais d'effet rétroactif sur une paie validée ou clôturée, et chaque valeur appliquée est justifiée par un texte du registre.

**Attention**
- Sans aucun document au registre, le message « Aucun document au registre : importez d'abord le texte dans le registre des documents juridiques. » s'affiche et le bouton « Ajouter un justificatif » est inactif.
- Avertissement « Le mois demandé sort de la période d'application de ce document (avertissement affiché à l'approbateur). » : vérifiez le document choisi ou le mois demandé.
- Les justificatifs sont figés au moment de la soumission.

**Voir aussi** — 5.13 Approuver ou rejeter une proposition · 5.14 Choisir la date d'application (décision D2) · 5.15 Importer un document juridique · Chapitre 6 (Centre de décisions)

---

## 5.2 Consulter les cotisations et impôts

> **Vidéo V5.2** · durée estimée 3 min · Public : SUPER_ADMIN, ADMIN_RH, ADMIN_FINANCE, GERANT

**Où la trouver** — Ressources Humaines › Juridique › Cotisations & impôts (`/rh/legal`). Onglets : `?tab=cnas`, `?tab=cacobatph`, `?tab=irg`, `?tab=other`. Le même écran, avec les mêmes fonctions, s'ouvre aussi depuis Ressources Humaines › Paramètres RH › onglet « Cotisations & impôts » (`/rh/parametres?tab=legal`).

**À quoi ça sert** — Voir, pour chaque cotisation, impôt ou paramètre, la valeur appliquée à la paie du mois en cours, son historique et les changements à venir.

**Avant de commencer**
- [ ] Disposer du droit de lecture « Conformité fiscale & sociale (unité 05) ». Sans ce droit, l'application vous renvoie à l'accueil.

**Étapes**
1. Cliquez sur « Juridique » dans la barre RH, puis sur « Cotisations & impôts ».
2. Lisez le bandeau de période : il indique le dernier mois validé ou clôturé et le premier mois auquel une modification peut s'appliquer.
3. Choisissez l'onglet : « CNAS », « CACOBATPH », « Impôts (IRG) » ou « Autres (SNMG…) ».
4. Dans un tableau de rubriques (onglets CACOBATPH, Impôts et Autres), lisez les colonnes :
   - « Rubrique » : libellé, pastille « Légale » (taux prévu par la loi) ou « Ajoutée » (rubrique créée par l'entreprise), code sur le bulletin, pastilles « Arrêtée depuis … » ou « Démarre en … », et ligne « Assiette : … » ;
   - « Part » : « Salariale » ou « Patronale » ;
   - « Taux · paie de <mois> » (ou « Valeur · paie de <mois> » dans l'onglet Autres) : valeur appliquée, mention « depuis le … », pastille « Approuvée » ou « Reprise non vérifiée » ;
   - « À venir » : valeurs déjà décidées pour un mois futur (« X dès <mois> », « Arrêt dès <mois> ») et propositions en attente. Cliquez sur une proposition pour l'ouvrir dans l'écran « Propositions légales ».
5. Cliquez sur « Historique (n) » sous une valeur pour afficher toutes ses versions : valeur, période, mention « approuvée » ou « reprise non vérifiée », et « période validée, figée » pour les mois déjà payés. Cliquez sur « Masquer l'historique » pour refermer.
6. Dans l'onglet « CNAS », lisez le tableau des régimes (fiche 5.5).

**Résultat** — Vous connaissez la valeur en vigueur et les changements programmés, sans rien modifier.

**Attention**
- « Reprise non vérifiée » signifie que la valeur a été reprise avant la mise en place du circuit d'approbation. Faites-la vérifier (fiche 5.4).
- L'onglet « Autres (SNMG…) » contient des valeurs (montants, heures, jours) et non des pourcentages : SNMG, diviseur fixe, heures mensuelles, taux d'heures supplémentaires, congé annuel acquis par mois de travail. On ne peut pas y ajouter de rubrique.
- Dans l'onglet « Impôts (IRG) », les abattements par zone Sud et Extrême Sud restent à 0 % tant que leur taux n'est pas confirmé.

**Voir aussi** — 5.3 Proposer une nouvelle valeur · 5.5 Gérer les régimes CNAS · 5.11 Consulter les propositions légales

---

## 5.3 Proposer une nouvelle valeur

> **Vidéo V5.3** · durée estimée 5 min (avec 5.4) · Public : SUPER_ADMIN, ADMIN_RH, ADMIN_FINANCE

**Où la trouver** — Ressources Humaines › Juridique › Cotisations & impôts › onglet « CACOBATPH », « Impôts (IRG) » ou « Autres (SNMG…) » › bouton « Modifier » sur une ligne marquée « Légale » (`/rh/legal`).

**À quoi ça sert** — Demander qu'un taux légal (par exemple un taux CACOBATPH ou un abattement de zone) ou un paramètre de paie (par exemple le SNMG) prenne une nouvelle valeur à partir d'un mois donné.

**Avant de commencer**
- [ ] Disposer du droit de modification « Conformité fiscale & sociale (unité 05) ».
- [ ] Le texte officiel est au registre des documents juridiques.

**Étapes**
1. Choisissez l'onglet, puis cliquez sur « Modifier » au bout de la ligne. Le dialogue « Proposer une valeur — <libellé> » s'ouvre, avec en sous-titre « Valeur actuelle : … ».
2. Saisissez « Nouveau taux (%) » ou, dans l'onglet Autres, « Nouvelle valeur » (obligatoire). Utilisez la virgule pour les décimales.
3. Choisissez « Demandé à partir de la paie de » : le mois souhaité. L'aide rappelle le premier mois encore ouvert ; la date définitive sera fixée par la décision D2 (Date d'application d'une règle légale).
4. Renseignez « Source légale », « Date d'effet du texte » et au moins un justificatif (fiche 5.1).
5. Cliquez sur « Proposer ».
6. Si le dialogue « Écart à la réglementation » s'ouvre, choisissez « Respecter la réglementation » ou « Autoriser le dépassement ».

**Résultat** — Message « <libellé> : <valeur> demandé dès <mois>. Proposition envoyée pour approbation : … ». La proposition apparaît dans la colonne « À venir » de la ligne et dans l'écran « Propositions légales », vue « À approuver ».

**Attention**
- « Saisissez une valeur numérique. » : le champ valeur est vide ou mal saisi.
- « Choisissez le mois d'effet. » : choisissez un mois.
- La note du dialogue précise : « Les paies des mois précédents gardent l'ancienne valeur. Une valeur approuvée pour un mois déjà prévu remplace celle de ce mois. »
- Pour une rubrique marquée « Ajoutée », le bouton « Modifier » ouvre un autre dialogue (fiche 5.6).

**Voir aussi** — 5.1 Comprendre le circuit d'une modification légale · 5.4 Faire vérifier une valeur reprise · 5.13 Approuver ou rejeter une proposition

---

## 5.4 Faire vérifier une valeur reprise

> **Vidéo V5.3** · durée estimée 5 min (avec 5.3) · Public : SUPER_ADMIN, ADMIN_RH, ADMIN_FINANCE

**Où la trouver** — Ressources Humaines › Juridique › Cotisations & impôts › lien « Faire vérifier » sous une valeur marquée « Reprise non vérifiée » (tableaux de rubriques et régimes CNAS), ou bouton « Faire vérifier » d'une version de barème IRG ou de règles IRG au statut « Reprise, non vérifiée » (`/rh/legal`).

**À quoi ça sert** — Faire confirmer, par un approbateur, qu'une valeur reprise de l'ancien système correspond bien au texte officiel, sans changer sa valeur. Elle devient alors une valeur de référence « Approuvée ».

**Avant de commencer**
- [ ] Disposer du droit de modification « Conformité fiscale & sociale (unité 05) ».
- [ ] Le texte officiel est au registre des documents juridiques.

**Étapes**
1. Cliquez sur « Faire vérifier ». Le dialogue « Faire vérifier — <libellé> » s'ouvre, avec en sous-titre « Valeur actuelle : … ». Il précise : « La valeur ne change pas. »
2. Renseignez « Source légale » (3 caractères minimum).
3. Ajoutez au moins un justificatif : document, « Article », « Page », « Extrait du texte ».
4. Cliquez sur « Demander la vérification ».

**Résultat** — Message de confirmation (« Vérification demandée : la valeur reste inchangée ; un approbateur la confirmera comme référence. »). Une proposition de type « Vérification d'une valeur existante » est créée. Une fois approuvée, la pastille de la valeur devient « Approuvée ».

**Attention**
- Une vérification approuvée ne passe **pas** par la décision D2 : rien ne change sur la paie.
- Si la valeur a changé entre la demande et l'approbation, la demande devient caduque.
- Le lien « Faire vérifier » disparaît tant qu'une vérification est déjà en attente pour cette valeur.

**Voir aussi** — 5.3 Proposer une nouvelle valeur · 5.13 Approuver ou rejeter une proposition

---

## 5.5 Gérer les régimes CNAS

> **Vidéo V5.5** · durée estimée 4 min · Public : SUPER_ADMIN, ADMIN_RH, ADMIN_FINANCE

**Où la trouver** — Ressources Humaines › Juridique › Cotisations & impôts › onglet « CNAS » › panneau « Régimes CNAS » (`/rh/legal?tab=cnas`).

**À quoi ça sert** — Définir les régimes de cotisation à la CNAS (taux salarié, employeur et œuvres sociales) et proposer un changement de taux. Le régime d'un salarié se choisit dans son contrat (« Régime CNAS ») ou, à défaut, dans sa fiche employé (« Profil social ») ; sinon le régime STANDARD s'applique.

**Avant de commencer**
- [ ] Disposer du droit de modification « Conformité fiscale & sociale (unité 05) ».
- [ ] Pour un changement de taux : le texte officiel est au registre des documents juridiques.

**Étapes**
1. Ouvrez l'onglet « CNAS ». Le tableau affiche, pour chaque régime : « Code » (et « Historique (n) »), « Libellé » (avec la pastille « Approuvée » ou « Reprise non vérifiée »), « % salarié », « % employeur », « % FOS », « À venir », « Actif », et les boutons « Modifier » et « Supprimer ». Une case vide affiche « légal (…) » : le taux légal du mois s'applique.
2. Pour créer un régime, cliquez sur « + Ajouter un régime » (dialogue « Nouveau régime CNAS ») ; pour modifier, cliquez sur « Modifier » (dialogue « Régime <code> »).
3. Renseignez :
   - « Code » (obligatoire) : lettres majuscules, chiffres ou « _ », 2 caractères minimum. Il ne se modifie plus après la création.
   - « Libellé (FR) » (obligatoire) et « Libellé (AR) ».
   - « Régime actif » : cochez pour rendre le régime utilisable.
4. Bloc « Taux (%) — case vide = taux légal du mois » : saisissez « % salarié », « % employeur », « % FOS », ou laissez vide pour suivre le taux légal.
5. Si vous changez un taux, le bandeau de proposition s'affiche. Choisissez « Nouveaux taux demandés à partir de la paie de », puis renseignez la source légale et les justificatifs (fiche 5.1). Sinon, la mention « Modifiez un taux pour choisir son mois d'effet. » reste affichée.
6. Cliquez sur « Proposer » (taux modifiés), « Enregistrer » (régime existant sans changement de taux) ou « Ajouter » (nouveau régime sans taux).

**Exemple de calcul** — Avec les taux légaux et un salaire cotisable de 50 000 DA : part salariale 9 % = 4 500 DA ; part employeur 25 % = 12 500 DA ; œuvres sociales 0,5 % = 250 DA.

**Résultat**
- Sans changement de taux : « Régime <code> enregistré. » Le libellé et l'activation s'appliquent tout de suite.
- Avec changement de taux : « Régime <code> : nouveaux taux demandés dès <mois>. » suivi du message de proposition envoyée. Les nouveaux taux s'appliquent après approbation et décision D2 (Date d'application d'une règle légale).

**Attention**
- « Code : au moins 2 caractères (lettres, chiffres ou _), ex. R10 ou R_10. » : corrigez le code.
- « <taux> : saisissez un nombre entre 0 et 100 (ex. 10,2). » : corrigez le taux.
- « Choisissez le mois d'effet. » : choisissez le mois des nouveaux taux.
- Un taux employeur de 25,5 % ou 26 % ouvre le dialogue « Écart à la réglementation » (les œuvres sociales seraient comptées deux fois). « Respecter la réglementation » remet 9 % / 25 % / 0,5 %.
- « Supprimer » demande une confirmation : « Supprimer le régime <code> (<libellé>) ? Les bulletins déjà générés ne changent pas. » Le régime STANDARD ne peut pas être supprimé.

**Voir aussi** — 5.1 Comprendre le circuit d'une modification légale · 5.4 Faire vérifier une valeur reprise · Chapitre 1 Personnel (contrat : « Régime CNAS »)

---

## 5.6 Ajouter ou modifier une rubrique

> **Vidéo V5.6** · durée estimée 5 min (avec 5.7) · Public : SUPER_ADMIN, ADMIN_RH, ADMIN_FINANCE

**Où la trouver** — Ressources Humaines › Juridique › Cotisations & impôts › onglet « CACOBATPH » ou « Impôts (IRG) » › bouton « + Ajouter une rubrique », ou bouton « Modifier » sur une ligne marquée « Ajoutée » (`/rh/legal`).

**À quoi ça sert** — Ajouter une cotisation, une retenue ou une taxe propre à l'entreprise (par exemple une retraite complémentaire), ou modifier son libellé, son code, son taux ou son mode de calcul.

**Avant de commencer**
- [ ] Disposer du droit de modification « Conformité fiscale & sociale (unité 05) ».
- [ ] Le texte ou l'accord qui justifie la rubrique est au registre des documents juridiques.

**Étapes**
1. Cliquez sur « + Ajouter une rubrique ». Le dialogue « Nouvelle rubrique » s'ouvre, avec en sous-titre l'onglet concerné (« Onglet CACOBATPH » ou « Onglet Impôts (IRG) »).
2. Renseignez l'affichage :
   - « Libellé (FR) » (obligatoire, 2 caractères minimum), par exemple Retraite complémentaire ;
   - « Libellé (AR) » ;
   - « Code sur le bulletin » : 12 caractères au maximum (« Vide = code technique ») ;
   - « Ordre d'affichage ».
3. Bloc « Calcul sur le bulletin » :
   - « Part » (obligatoire) : « Part salariale (retenue) » ou « Part patronale (charge) » ;
   - « Taux (%) » (obligatoire, supérieur à 0) ;
   - « Salariés concernés » (onglet CACOBATPH uniquement) : « Salariés assujettis CACOBATPH congés » ou « Salariés assujettis intempéries » ;
   - « Demandé à partir de la paie de » ;
   - source légale et justificatifs (fiche 5.1).
4. Facultatif — « Options avancées » :
   - « Assiette » : « Brut cotisable (comme la CNAS) » ou « Brut imposable (comme l'IRG) » ;
   - « Déductible de l'assiette IRG » (part salariale uniquement).
5. Relisez la phrase de résumé, par exemple « Retenue sur salaire de 0,5 % du brut cotisable, demandée à partir de la paie de … ».
6. Cliquez sur « Ajouter et proposer ».

**Pour modifier une rubrique ajoutée**
1. Cliquez sur « Modifier » au bout de la ligne. Le dialogue s'intitule « Modifier — <libellé> ».
2. Modifiez les libellés, le code ou l'ordre : ces changements s'appliquent tout de suite aux prochaines paies (« Libellés et code : mis à jour tout de suite pour les prochaines paies ; les bulletins déjà générés gardent leur texte. »).
3. Modifiez le taux, la part, l'assiette ou les salariés concernés : ces changements deviennent une proposition ; renseignez le mois et la source.
4. Pour une rubrique arrêtée, cochez « Reprendre le calcul (arrêtée depuis …) » pour proposer sa reprise.
5. Cliquez sur « Proposer » (calcul modifié) ou « Enregistrer » (libellés seulement ; la mention « Aucun changement de calcul. » s'affiche).

**Exemple de calcul** — Retenue salariale de 0,5 % sur un brut cotisable de 50 000 DA : 50 000 × 0,5 % = 250 DA retenus sur le bulletin.

**Résultat**
- Nouvelle rubrique : « « <libellé> » ajoutée au catalogue, sans calcul pour l'instant. » suivi du message de proposition envoyée. La rubrique apparaît avec la pastille « Ajoutée » et n'est calculée qu'après approbation et décision D2 (Date d'application d'une règle légale).
- Modification : « « <libellé> » : libellés mis à jour. » (et message de proposition si le calcul change).

**Attention**
- « Saisissez un taux supérieur à 0 %. » : le taux est vide ou nul.
- « Choisissez le mois d'effet. » : choisissez le mois.
- Le bouton « + Ajouter une rubrique » n'existe pas dans les onglets « CNAS » et « Autres (SNMG…) ».

**Voir aussi** — 5.7 Proposer l'arrêt ou supprimer une rubrique · 5.1 Comprendre le circuit d'une modification légale

---

## 5.7 Proposer l'arrêt ou supprimer une rubrique

> **Vidéo V5.6** · durée estimée 5 min (avec 5.6) · Public : SUPER_ADMIN, ADMIN_RH, ADMIN_FINANCE

**Où la trouver** — Ressources Humaines › Juridique › Cotisations & impôts › bouton « Supprimer » sur une ligne marquée « Ajoutée » (`/rh/legal`).

**À quoi ça sert** — Supprimer une rubrique ajoutée par erreur, ou arrêter à partir d'un mois une rubrique déjà appliquée en paie.

**Avant de commencer**
- [ ] Disposer du droit de modification « Conformité fiscale & sociale (unité 05) ».
- [ ] Aucune proposition n'est en cours sur cette rubrique.

**Étapes**
1. Cliquez sur « Supprimer » au bout de la ligne.
2. Cas 1 — la rubrique n'a jamais été appliquée à une paie : confirmez « Supprimer définitivement « <libellé> » ? Elle n'a encore été appliquée à aucune paie. » La rubrique est supprimée.
3. Cas 2 — la rubrique a déjà été appliquée : le dialogue « Proposer l'arrêt — <libellé> » s'ouvre.
   - Lisez l'avertissement : une fois l'arrêt approuvé et daté (D2), la rubrique est retirée des paies à partir de ce mois ; les paies précédentes la gardent.
   - Choisissez « Retirer à partir de la paie de ».
   - Renseignez la source légale et les justificatifs.
   - Cliquez sur « Proposer l'arrêt ».

**Résultat**
- Cas 1 : message « « <libellé> » supprimée. »
- Cas 2 : message « Arrêt de « <libellé> » demandé dès <mois>. » suivi du message de proposition envoyée. Après approbation et décision D2 (Date d'application d'une règle légale), la ligne affiche « Arrêtée depuis <mois> ».

**Attention**
- Un taux marqué « Légale » ne se supprime pas : le bouton est grisé avec l'infobulle « Taux légal obligatoire : modifiable, non supprimable. »
- Une rubrique déjà arrêtée affiche l'infobulle « Déjà arrêtée. »
- Si une proposition est en cours, la suppression est refusée : retirez d'abord la proposition dans l'écran « Propositions légales » (fiche 5.12).
- « Choisissez le mois d'arrêt. » : choisissez un mois.
- Une rubrique arrêtée peut être reprise plus tard : « Modifier », puis « Reprendre le calcul » (fiche 5.6).

**Voir aussi** — 5.6 Ajouter ou modifier une rubrique · 5.12 Soumettre ou retirer une proposition

---

## 5.8 Gérer le barème IRG

> **Vidéo V5.8** · durée estimée 5 min · Public : SUPER_ADMIN, ADMIN_RH, ADMIN_FINANCE

**Où la trouver** — Ressources Humaines › Juridique › Cotisations & impôts › onglet « Impôts (IRG) » › panneau « Barème IRG », bloc « Tranches annuelles » (`/rh/legal?tab=irg`).

**À quoi ça sert** — Consulter les tranches annuelles de l'IRG utilisées par la paie, simuler l'IRG d'un salaire, et préparer un nouveau barème (par exemple après une loi de finances) qui suivra le circuit d'approbation.

**Avant de commencer**
- [ ] Disposer du droit de modification « Conformité fiscale & sociale (unité 05) » pour créer un brouillon.
- [ ] Le texte officiel est au registre des documents juridiques.

**Étapes — consulter et simuler**
1. Ouvrez l'onglet « Impôts (IRG) » et descendez jusqu'au panneau « Barème IRG ».
2. Choisissez la « Version du barème » (code · libellé · statut) et le « Jeu de règles (catégorie) » (Salarié ou Handicapé / retraité).
3. Saisissez un montant dans « Simulation — base IRG mensuelle (DA) » (40 000 par défaut). La ligne « IRG mensuel estimé : … DA » se met à jour.
4. Lisez le tableau « Tranches annuelles » : « Min annuel », « Max annuel » (∞ pour la dernière tranche), « Taux % ».

**Étapes — préparer un nouveau barème**
1. Cliquez sur « Nouveau brouillon (copie de ce barème) ».
2. Renseignez « Code », « Libellé », « Référence légale », « Mois envisagé » (indicatif : le mois d'application est décidé après approbation) et, pour un nouveau brouillon, « Copier les tranches de ».
3. Cliquez sur « Créer le brouillon » (ou « Annuler »).
4. Modifiez les tranches : saisissez les montants et les taux, cliquez sur « Ajouter une tranche » ou sur « Retirer ». Laissez « Max annuel » vide pour la dernière tranche.
5. Cliquez sur « Enregistrer les tranches du brouillon ». Pour changer le code ou le libellé, cliquez sur « Enregistrer le brouillon ».
6. Cliquez sur « Soumettre à approbation ». Le dialogue « Soumettre le barème <code> » rappelle : « Le brouillon est figé dès la soumission. S'il est retiré ou rejeté, il redevient un brouillon modifiable. »
7. Choisissez « Demandé à partir de la paie de », renseignez la source légale et les justificatifs, puis cliquez sur « Soumettre ».

**Barème de référence (annuel)**

| Tranche annuelle (DA) | Taux |
|---|---|
| 0 à 240 000 | 0 % |
| 240 001 à 480 000 | 23 % |
| 480 001 à 960 000 | 27 % |
| 960 001 à 1 920 000 | 30 % |
| 1 920 001 à 3 840 000 | 33 % |
| au-delà de 3 840 000 | 35 % |

**Exemple de calcul** (base IRG mensuelle de 40 000 DA, règles de l'article 104 du jeu Salarié) :
1. Base annuelle : 40 000 × 12 = 480 000 DA.
2. Impôt annuel : la part entre 240 000 et 480 000, soit 240 000 DA, est taxée à 23 % : 55 200 DA. Impôt mensuel brut : 55 200 ÷ 12 = 4 600 DA.
3. Abattement de 40 % : 4 600 × 40 % = 1 840 DA, ramené au maximum de 1 500 DA.
4. IRG mensuel : 4 600 − 1 500 = 3 100 DA.

**Résultat**
- « Brouillon de barème enregistré : sans effet avant sa soumission, son approbation et la décision D2. »
- « Tranches enregistrées. »
- Après soumission, la version passe au statut « Soumis à approbation », puis « Approuvé » après approbation et décision D2 (Date d'application d'une règle légale) ; l'ancienne version devient « Remplacé » à partir de ce mois.

**Attention**
- Les tranches ne se modifient qu'au statut « Brouillon ».
- « Supprimer le brouillon » demande une confirmation : « Supprimer le brouillon <code> ? » Message : « Brouillon <code> supprimé. »
- Une version au statut « Reprise, non vérifiée » propose le bouton « Faire vérifier » (fiche 5.4).
- Des tranches qui s'écartent du barème de référence ouvrent le dialogue « Écart à la réglementation ».

**Voir aussi** — 5.9 Gérer les règles IRG (article 104) · 5.1 Comprendre le circuit d'une modification légale · Chapitre 3 Paie (simulateur)

---

## 5.9 Gérer les règles IRG (article 104)

> **Vidéo V5.9** · durée estimée 4 min · Public : SUPER_ADMIN, ADMIN_RH, ADMIN_FINANCE

**Où la trouver** — Ressources Humaines › Juridique › Cotisations & impôts › onglet « Impôts (IRG) » › panneau « Barème IRG », bloc « Règles Art. 104 » (`/rh/legal?tab=irg`).

**À quoi ça sert** — Consulter et faire évoluer les règles qui complètent le barème : exonération des bas salaires, abattement de 40 %, lissage, déductions de la base et retenue non mensuelle. Il existe un jeu de règles par catégorie : Salarié, Handicapé / retraité.

**Avant de commencer**
- [ ] Disposer du droit de modification « Conformité fiscale & sociale (unité 05) ».
- [ ] Le texte officiel est au registre des documents juridiques.

**Étapes**
1. Choisissez le jeu dans « Jeu de règles (catégorie) ».
2. Lisez le tableau : « # » (ordre d'application), « Règle », « Paramètres ».
3. Cliquez sur « Nouveau brouillon (copie de ce jeu) ». Renseignez « Code », « Libellé », « Catégorie contribuable » (« Salarié » ou « Handicapé / retraité »), « Mois envisagé » et « Copier les règles de ». Cliquez sur « Créer le brouillon ».
4. Dans le brouillon, ajoutez ou modifiez une règle :
   - « Type » : « Exonération », « Abattement 40 % », « Lissage », « Base (déductions) » ou « Retenue non mensuelle » ;
   - « Séquence » : ordre d'application ;
   - « S'applique à » : GROSS (salaire brut), BASE (base imposable) ou TAX (impôt) ;
   - selon le type : « Min mensuel », « Max mensuel », « Taux % », « Min mensuel (DA) », « Max mensuel (DA) », « Formule [IRG_AFTER_ABATEMENT] » (formule appliquée à l'IRG après abattement), « Jetons à déduire ».
5. Cliquez sur « Ajouter la règle » (ou « Mettre à jour » pour une règle existante ; « Annuler » pour abandonner). Les boutons « Modifier » et « Supprimer » de chaque ligne permettent de corriger le brouillon.
6. Cliquez sur « Soumettre à approbation ». Dans le dialogue « Soumettre le jeu de règles <code> », choisissez « Demandé à partir de la paie de », renseignez la source et les justificatifs, puis cliquez sur « Soumettre ».

**Règles de référence (article 104)**
- Exonération : IRG nul jusqu'à 30 000 DA de base mensuelle.
- Abattement de 40 % de l'impôt, au minimum 1 000 DA et au maximum 1 500 DA par mois.
- Lissage des salariés dont la base est entre 30 001 et 35 000 DA : IRG × 137/51 − 27925/8.
- Lissage des handicapés et retraités dont la base est entre 30 001 et 42 500 DA : IRG × 93/61 − 81213/41.
- Retenue non mensuelle : 10 %.
- Base : la cotisation CNAS salariale est déduite avant le calcul.

**Exemples de calcul** (jeu Salarié)
- Base de 28 000 DA : inférieure à 30 000 DA, l'IRG est de 0 DA.
- Base de 32 000 DA : base annuelle 384 000 DA ; impôt annuel (384 000 − 240 000) × 23 % = 33 120 DA, soit 2 760 DA par mois ; abattement 40 % = 1 104 DA (entre 1 000 et 1 500) ; IRG après abattement 1 656 DA ; lissage : 1 656 × 137/51 − 27925/8 = 4 448,47 − 3 490,63 = 957,85 DA.

**Résultat** — « Règle enregistrée. » / « Règle supprimée. » Le jeu soumis suit le circuit : approbation, puis décision D2 (Date d'application d'une règle légale).

**Attention**
- Les règles ne se modifient que dans un brouillon.
- Une règle qui s'écarte des valeurs de référence ouvre le dialogue « Écart à la réglementation ».
- « Supprimer le brouillon » et « Faire vérifier » fonctionnent comme pour le barème (fiche 5.8).

**Voir aussi** — 5.8 Gérer le barème IRG · 5.1 Comprendre le circuit d'une modification légale

---

## 5.10 Proposer la portée d'une zone IRG

> **Vidéo V5.10** · durée estimée 3 min · Public : SUPER_ADMIN, ADMIN_RH, ADMIN_FINANCE

**Où la trouver** — Ressources Humaines › Juridique › Cotisations & impôts › onglet « Impôts (IRG) » › panneau « Portée des zones IRG (wilayas concernées) » › bouton « Proposer une portée » (`/rh/legal?tab=irg`).

**À quoi ça sert** — Définir, à partir d'un mois, la liste des wilayas rattachées à une zone IRG (Sud, Extrême Sud). La zone IRG d'un chantier dépend de sa wilaya.

**Avant de commencer**
- [ ] Disposer du droit de modification « Conformité fiscale & sociale (unité 05) ».
- [ ] Le texte officiel est au registre des documents juridiques.

**Étapes**
1. Lisez le tableau : « Zone », « Wilayas · paie de <mois> » (pastille « Portée approuvée dès … » ou « Catalogue, non daté »), « À venir » (« Dès <mois> : N wilayas »).
2. Cliquez sur « Proposer une portée » sur la ligne de la zone. Le dialogue « Portée de la zone <code> » s'ouvre.
3. Choisissez le mode :
   - « Choisir les wilayas » : filtrez avec « Filtrer (code ou nom) », puis cochez les wilayas ;
   - ou « Reprendre un groupement enregistré » : choisissez la liste dans « Groupement repris » (obligatoire).
4. Vérifiez le récapitulatif « N wilaya(s) : … ».
5. Choisissez « Demandé à partir de la paie de ».
6. Renseignez la source légale et les justificatifs.
7. Cliquez sur « Proposer (N wilayas) ».

**Résultat** — La proposition, de la famille « Portée d'une zone IRG (D16) », est envoyée pour approbation. Après approbation et décision D2 (Date d'application d'une règle légale), la portée datée remplace la liste du catalogue à partir de son mois.

**Attention**
- « Sélectionnez au moins une wilaya. » / « Choisissez le mois demandé. » / « Indiquez le groupement repris. » : complétez le champ indiqué.
- Le choix de zone fait sur la fiche d'un chantier reste prioritaire sur la portée de la zone.

**Voir aussi** — 5.1 Comprendre le circuit d'une modification légale · Chapitre 0 Prise en main (qualité des données : wilaya codée des chantiers)

---

## 5.11 Consulter les propositions légales

> **Vidéo V5.11** · durée estimée 4 min (avec 5.12) · Public : SUPER_ADMIN, ADMIN_RH, ADMIN_FINANCE, GERANT

**Où la trouver** — Ressources Humaines › Juridique › Propositions légales (`/rh/legal/propositions`). La vue « À approuver » s'ouvre directement avec `?vue=approbation`.

**À quoi ça sert** — Suivre toutes les propositions de changement de taux, de barème ou de zone IRG, de leur création à leur application.

**Avant de commencer**
- [ ] Disposer du droit de lecture « Propositions de règles légales ».

**Étapes**
1. Cliquez sur « Propositions légales ». La description rappelle le circuit : soumission, approbation par une autre personne, puis décision D2 (Date d'application d'une règle légale).
2. Choisissez la vue :
   - « En cours (n) » ;
   - « À approuver (n) » ;
   - « Approuvées, date à décider (n) » ;
   - « Toutes (n) ».
3. Cliquez sur « Afficher tout l'historique » pour voir aussi les anciennes propositions closes (« Masquer les propositions closes anciennes » pour revenir).
4. Lisez une carte de proposition :
   - pastilles : statut, famille, action ; « Brouillon IA, relu par un humain » si elle vient de l'extraction IA ; « Auto-approbation SUPER_ADMIN » le cas échéant ;
   - titre, cible, « Créée le … par … » ;
   - « Source légale », « Date d'effet du texte », « Mois demandé », puis « Soumise », « Examinée » ou « Appliquée » ;
   - comparaison entre la valeur actuelle et la valeur proposée ;
   - origine IA le cas échéant (modèle, confiance, valeur trouvée dans l'extrait ou corrigée par un humain, lien « Voir l'analyse ») ;
   - justificatifs, avec le lien « Voir le document » et une pastille si une version plus récente du document existe au registre ;
   - « Contributeurs : … » (avec « — vous en faites partie. » si c'est votre cas) ;
   - « Note de l'approbateur », « Motif de clôture », lien « Décision D2 de date d'application ».

**Résultat** — Vous savez où en est chaque proposition et quelle action est attendue.

**Attention**
- Vue vide : « Aucune proposition dans cette vue. »
- Les boutons d'action affichés dépendent du statut et de vos droits (fiches 5.12 à 5.14).

**Voir aussi** — 5.12 Soumettre ou retirer une proposition · 5.13 Approuver ou rejeter une proposition · 5.14 Choisir la date d'application (décision D2)

---

## 5.12 Soumettre ou retirer une proposition

> **Vidéo V5.11** · durée estimée 4 min (avec 5.11) · Public : SUPER_ADMIN, ADMIN_RH, ADMIN_FINANCE

**Où la trouver** — Ressources Humaines › Juridique › Propositions légales › boutons « Soumettre » et « Retirer » d'une carte (`/rh/legal/propositions`).

**À quoi ça sert** — Envoyer à l'approbation une proposition restée en brouillon (par exemple créée depuis l'extraction IA), ou retirer une proposition qui n'a plus lieu d'être.

**Avant de commencer**
- [ ] Pour soumettre : être contributeur de la proposition ou SUPER_ADMIN.
- [ ] Pour retirer : être contributeur, approbateur ou SUPER_ADMIN.

**Étapes — soumettre**
1. Repérez la proposition au statut « Brouillon » (vue « En cours »).
2. Cliquez sur « Soumettre ».

**Étapes — retirer**
1. Repérez la proposition (« Brouillon », « Soumise, à approuver » ou « Approuvée, sans effet (date à décider) »).
2. Cliquez sur « Retirer ». Le dialogue « Retirer la proposition » s'ouvre.
3. Saisissez le « Motif (5 caractères min.) ».
4. Cliquez sur « Retirer ».

**Résultat**
- Soumission : la proposition passe au statut « Soumise, à approuver » et apparaît dans la vue « À approuver ».
- Retrait : message « « <titre> » retirée. » La proposition passe au statut « Retirée ».

**Attention**
- Pour un barème ou un jeu de règles IRG, le dialogue précise : « Le brouillon IRG redevient modifiable. »
- Si une décision D2 était en attente, le dialogue précise : « La décision D2 en attente sera close. »

**Voir aussi** — 5.11 Consulter les propositions légales · 5.13 Approuver ou rejeter une proposition

---

## 5.13 Approuver ou rejeter une proposition

> **Vidéo V5.13** · durée estimée 3 min · Public : approbateurs des règles légales (SUPER_ADMIN par défaut, ou personne déléguée par lui)

**Où la trouver** — Ressources Humaines › Juridique › Propositions légales › vue « À approuver » › boutons « Approuver » et « Rejeter » (`/rh/legal/propositions?vue=approbation`).

**À quoi ça sert** — Contrôler une proposition faite par une autre personne : vérifier la valeur et ses justificatifs, puis l'approuver ou la rejeter.

**Avant de commencer**
- [ ] Disposer du droit « Approbation des règles légales », délégué par le SUPER_ADMIN.
- [ ] Ne pas avoir contribué à la proposition (sauf SUPER_ADMIN).

**Étapes — approuver**
1. Ouvrez la vue « À approuver ».
2. Relisez la carte : valeur actuelle et valeur proposée, source légale, justificatifs. Cliquez sur « Voir le document » pour contrôler l'extrait dans le texte.
3. Cliquez sur « Approuver ». Le dialogue « Approuver la proposition » s'ouvre. Il rappelle :
   - pour une vérification : « Vous confirmez que la valeur affichée correspond au texte cité. Elle devient la référence approuvée, sans changer de montant. » ;
   - pour une nouvelle valeur : « L'approbation ne change pas encore la paie : la date d'application est décidée ensuite (D2). »
4. Si vous êtes SUPER_ADMIN et contributeur, cochez la case d'auto-approbation (« Vous avez contribué à cette proposition. En tant que SUPER_ADMIN vous pouvez l'approuver ; elle sera marquée « auto-approbation SUPER_ADMIN »… »).
5. Saisissez éventuellement une « Note (facultative) ».
6. Cliquez sur « Approuver ».

**Étapes — rejeter**
1. Cliquez sur « Rejeter ». Le dialogue « Rejeter la proposition » s'ouvre.
2. Saisissez le « Motif (10 caractères min.) ».
3. Cliquez sur « Rejeter ».

**Résultat**
- Vérification : « Valeur approuvée comme référence. »
- Nouvelle valeur : « Proposition approuvée, sans effet tant que le SUPER_ADMIN n'a pas décidé sa date d'application. » avec le lien « Ouvrir la décision D2 ». Une décision D2 (Date d'application d'une règle légale) est demandée au Centre de décisions.
- Mois demandé déjà clos : « Proposition approuvée, sans effet : le mois demandé est déjà clos. Choisissez une date d'application. » (fiche 5.14).
- Rejet : « « <titre> » rejetée. » Le statut devient « Rejetée ».

**Attention**
- « Approbation réservée aux approbateurs des règles légales (délégation par le SUPER_ADMIN). » : vous n'avez pas le droit d'approuver.
- « Séparation des tâches : vous avez contribué à cette proposition, un autre approbateur doit l'approuver. » : demandez à un autre approbateur.
- « La valeur a changé depuis la demande de vérification : la proposition est caduque… » : la vérification ne peut plus être approuvée.
- Une auto-approbation reste visible : pastille « Auto-approbation SUPER_ADMIN » sur la carte et sur la décision.

**Voir aussi** — 5.14 Choisir la date d'application (décision D2) · 5.11 Consulter les propositions légales

---

## 5.14 Choisir la date d'application (décision D2)

> **Vidéo V5.14** · durée estimée 4 min · Public : approbateurs des règles légales, SUPER_ADMIN (décideur D2)

**Où la trouver** — Ressources Humaines › Juridique › Propositions légales › vue « Approuvées, date à décider » › bouton « Choisir la date d'application » (ou « Changer la date d'application ») (`/rh/legal/propositions`).

**À quoi ça sert** — Fixer le mois de paie à partir duquel une proposition approuvée s'applique, sans jamais toucher une paie validée ou clôturée.

**Avant de commencer**
- [ ] La proposition est au statut « Approuvée, sans effet (date à décider) » (les vérifications ne sont pas concernées).
- [ ] Être approbateur des règles légales ou décideur D2 (SUPER_ADMIN par défaut).

**Étapes**
1. Cliquez sur « Choisir la date d'application ». Le dialogue « Date d'application (D2) » affiche la date d'effet du texte, le mois demandé et le premier mois non validé.
2. Choisissez le mode :
   - « À partir d'un mois » : choisissez « Paie concernée à partir de » ;
   - « À partir d'une date » : saisissez la « Date ». Le mois n'est jamais découpé : choisissez à quelle paie la date se rattache :
     - « Paie de <mois suivant> (mois suivant la date, recommandé : pas de rétroactivité implicite) » ;
     - « Paie de <mois de la date> (mois de la date, en entier) ».
3. Lisez le récapitulatif : « La règle s'appliquera à partir de la paie de … ».
4. Cliquez sur « Demander la décision ».
5. Le SUPER_ADMIN ouvre la décision D2 dans le Centre de décisions et choisit « Appliquer à partir du mois indiqué » ou « Ne pas appliquer pour l'instant ».

**Exemple** — Un texte prend effet le 15/03/2027. En mode « À partir d'une date », vous pouvez rattacher la nouvelle valeur à la paie d'avril 2027 (recommandé) ou à toute la paie de mars 2027.

**Résultat** — Message « Décision D2 en attente : application à partir de la paie de <mois>. Le SUPER_ADMIN la confirme dans l'écran Décisions. » Une fois la décision appliquée, la proposition passe « En vigueur ». Les bulletins validés ou clôturés ne changent jamais ; les bulletins brouillon concernés sont signalés et se recalculent sur décision D3 (Recalcul des paies brouillon).

**Attention**
- « Le mois d'application commence le 1er. » : choisissez un mois complet.
- « Mois déjà traité (paie validée ou clôturée) : choisissez … » : choisissez un mois plus tardif.
- « La date choisie se rattache à son mois ou au mois suivant. » : choisissez l'une des deux paies proposées.
- Pendant la période de reprise des paies, le dialogue peut afficher séparément les mois de reprise et la paie opérationnelle ; une règle appliquée à un mois de reprise s'arrête au 31/08/2026 et ne change pas la paie opérationnelle.

**Voir aussi** — 5.13 Approuver ou rejeter une proposition · Chapitre 6 (Centre de décisions) · Chapitre 3 Paie (recalcul, décision D3)

---

## 5.15 Importer un document juridique

> **Vidéo V5.15** · durée estimée 4 min · Public : SUPER_ADMIN, ADMIN_RH, ADMIN_FINANCE

**Où la trouver** — Ressources Humaines › Juridique › Documents juridiques › bouton « Importer un document » (`/rh/legal/documents`).

**À quoi ça sert** — Déposer au registre le texte officiel (loi de finances, décret, arrêté, convention…) qui servira de justificatif aux propositions. Le registre garde une copie infalsifiable de chaque texte.

**Avant de commencer**
- [ ] Disposer du droit de création « Documents juridiques ».
- [ ] Avoir le fichier du texte : PDF, JPEG, PNG ou WebP, 25 Mo au maximum.

**Étapes**
1. Cliquez sur « Importer un document ». Le dialogue « Importer un document juridique » rappelle : « Importer un document n'a aucun effet sur les règles ni sur la paie : les valeurs sont saisies dans une proposition qui cite le document, puis approuvées. »
2. « Fichier du texte » (obligatoire) : choisissez le fichier.
3. « Type de texte » (obligatoire) : Loi de finances, LF complémentaire, Loi, Ordonnance, Décret présidentiel, Décret exécutif, Arrêté, Décision, Circulaire, Instruction, Note, Convention collective, Autre texte.
4. « Langue » (obligatoire) : Français, Arabe, Français et arabe, Autre.
5. « Intitulé » (obligatoire, 3 caractères minimum).
6. « Référence » (obligatoire, 3 caractères minimum) : numéro et date du texte, par exemple « loi n° 25-xx du 24 décembre 2025 ».
7. « N° du Journal officiel », « Date du JO », « Date de publication » (facultatifs).
8. « Applicable à partir du » (obligatoire) et « Applicable jusqu'au » (laisser vide si la fin n'est pas fixée). La ligne « Voie de saisie : … » s'affiche aussitôt (voir ci-dessous).
9. « Provenance » (obligatoire, 3 caractères minimum) : organisme, site officiel ou transmission reçue.
10. « Lien de la source » (adresse https://, facultatif) et « Notes ».
11. Cliquez sur « Importer ».

**La voie de saisie, déduite de la période d'application**
- Période entièrement avant 2026 : « Saisie manuelle (application entièrement antérieure à 2026) ».
- Période commençant en 2026 ou après : « Saisie manuelle ou extraction IA (textes officiels, application à partir de 2026) ».
- Période à cheval sur 2025 et 2026 : « À cheval sur 2025 et 2026 : voie de saisie à décider (décision D15) » (fiche 5.18).

**Résultat** — Message « « <intitulé> » ajouté au registre. » Le document apparaît en version 1, au statut « En vigueur au registre », avec son empreinte numérique (« Empreinte SHA-256 ») calculée automatiquement.

**Attention**
- « Choisissez le fichier du texte. » : aucun fichier sélectionné.
- « Format refusé : PDF, JPEG, PNG ou WebP. » : convertissez le fichier.
- « Fichier trop volumineux (25 Mo maximum). » : réduisez le fichier.
- « Fin de la période d'application antérieure à son début. » : corrigez les dates.
- Le fichier ne peut plus être remplacé après l'import. Seules les informations (métadonnées) peuvent être corrigées (fiche 5.16).

**Voir aussi** — 5.16 Consulter le registre et corriger un document juridique · 5.18 Demander la décision D15 · 5.24 Importer un texte détecté au registre

---

## 5.16 Consulter le registre et corriger un document juridique

> **Vidéo V5.16** · durée estimée 4 min (avec 5.17) · Public : SUPER_ADMIN, ADMIN_RH, ADMIN_FINANCE (lecture : + GERANT)

**Où la trouver** — Ressources Humaines › Juridique › Documents juridiques (`/rh/legal/documents`). Filtre d'année : `?annee=AAAA` ou `?annee=tout`.

**À quoi ça sert** — Retrouver un texte officiel, l'ouvrir, voir quelles propositions le citent, vérifier qu'aucun mois n'est sans texte, et corriger ses informations en gardant la trace des versions.

**Avant de commencer**
- [ ] Lecture : droit de lecture « Documents juridiques ».
- [ ] Correction : droit de création « Documents juridiques ».

**Étapes — consulter**
1. Choisissez l'année dans le sélecteur de période d'application (année en cours par défaut, ou « Toutes les années »).
2. Tapez un mot dans « Rechercher (intitulé, référence, JO) ».
3. Lisez le panneau « Couverture du registre en AAAA » : chaque mois affiche « N doc. » ou « aucun ». Un mois « aucun » signale un texte manquant au registre.
4. Lisez une carte de document :
   - pastilles : type, statut (« En vigueur au registre », « Version corrigée depuis », « Retiré »), « Version N », langue ;
   - intitulé, « référence · JO n° … du … », « Importé le … », nom et taille du fichier ;
   - « Période d'application », « Publication », « Provenance » (avec lien), « Empreinte SHA-256 » ;
   - « Voie de saisie : … » ;
   - « Cité par N proposition(s) » (chaque proposition est cliquable), « Versions précédentes (n) », « Dernière correction : … ».
5. Cliquez sur « Voir le document » pour ouvrir le fichier (le lien est temporaire). Le bouton « Extraction IA » ouvre l'analyse du document (fiche 5.19).

**Étapes — corriger les informations**
1. Cliquez sur « Corriger les informations ». Le dialogue « Corriger les informations du document » s'ouvre (sous-titre : référence et version).
2. Modifiez les champs (mêmes champs que l'import, sans le fichier).
3. Saisissez le « Motif de la correction » (obligatoire, 10 caractères minimum).
4. Cliquez sur « Enregistrer la correction ».

**Résultat** — Message « « <intitulé> » corrigé : version N+1 enregistrée, la précédente reste consultable. » L'ancienne version apparaît dans « Versions précédentes ».

**Attention**
- La correction ne change pas le fichier. Les propositions déjà rédigées gardent la version qu'elles citent ; l'approbateur voit qu'une version plus récente existe.
- « Aucun document ne correspond à la recherche. » / « Aucun document au registre pour cette période. » : élargissez la recherche ou l'année.
- Un mois couvert ne prouve rien sur la loi applicable : la couverture ne compte que les documents présents au registre.

**Voir aussi** — 5.15 Importer un document juridique · 5.17 Retirer un document juridique · 5.11 Consulter les propositions légales

---

## 5.17 Retirer un document juridique

> **Vidéo V5.16** · durée estimée 4 min (avec 5.16) · Public : SUPER_ADMIN

**Où la trouver** — Ressources Humaines › Juridique › Documents juridiques › bouton « Retirer » d'une carte (`/rh/legal/documents`).

**À quoi ça sert** — Retirer du registre un texte importé par erreur ou abrogé, pour qu'il ne puisse plus être cité.

**Avant de commencer**
- [ ] Disposer du droit de modification « Documents juridiques » (SUPER_ADMIN par défaut).

**Étapes**
1. Cliquez sur « Retirer ». Le dialogue « Retirer le document » s'ouvre.
2. Lisez l'avertissement : « Le document reste consultable mais ne peut plus être cité. Une proposition qui ne cite que lui ne pourra plus être soumise ni approuvée ; celles déjà approuvées ou appliquées ne changent pas et affichent un avertissement. Rien ne change sur la paie. »
3. Saisissez le « Motif du retrait » (obligatoire, 10 à 500 caractères).
4. Cliquez sur « Retirer ».

**Résultat** — Message « « <intitulé> » retiré du registre. » La carte affiche la pastille « Retiré » et l'avis « Retiré le … : <motif>… ».

**Attention**
- Le retrait est définitif : aucun bouton ne permet de remettre le document en vigueur.

**Voir aussi** — 5.16 Consulter le registre et corriger un document juridique · 5.12 Soumettre ou retirer une proposition

---

## 5.18 Demander la décision D15 (voie de saisie)

> **Vidéo V5.18** · durée estimée 2 min · Public : SUPER_ADMIN

**Où la trouver** — Ressources Humaines › Juridique › Extraction IA › panneau du document › bouton « Demander la décision D15 » (`/rh/legal/extraction-ia?document=…`).

**À quoi ça sert** — Pour un texte dont la période d'application est à cheval sur 2025 et 2026, faire décider s'il peut être analysé par l'IA ou s'il doit être saisi à la main : décision D15 (Voie de saisie d'un document à cheval sur 2025 et 2026).

**Avant de commencer**
- [ ] Le document est au registre, avec une période d'application qui chevauche 2025 et 2026.
- [ ] Disposer du droit de demander la décision D15.

**Étapes**
1. Dans « Document du registre (version en vigueur) », choisissez le document (marqué ○).
2. Lisez la pastille de voie du document dans son panneau.
3. Cliquez sur « Demander la décision D15 ».
4. Le décideur choisit dans le Centre de décisions : « Saisie manuelle » (aucune analyse IA possible) ou « Extraction IA possible ». « Les deux voies aboutissent au même circuit d'approbation. »

**Résultat** — Message « Décision D15 demandée : aucune analyse n'est possible avant la décision. » Le panneau affiche « Décision D15 en attente. » avec le lien « Ouvrir la demande ». Une fois la décision prise, il affiche « Décision D15 : saisie manuelle » ou « Décision D15 : extraction IA possible », avec le lien « Voir la décision ».

**Attention**
- Pour changer de voie après une décision, cliquez sur « Demander une nouvelle décision D15 ».
- Sans droit : « La demande D15 est réservée aux personnes autorisées. »

**Voir aussi** — 5.19 Lancer une analyse IA d'un document · 5.15 Importer un document juridique · Chapitre 6 (Centre de décisions)

---

## 5.19 Lancer une analyse IA d'un document

> **Vidéo V5.19** · durée estimée 3 min · Public : SUPER_ADMIN

**Où la trouver** — Ressources Humaines › Juridique › Extraction IA (`/rh/legal/extraction-ia`), ou bouton « Extraction IA » d'une carte du registre des documents juridiques.

**À quoi ça sert** — Faire lire un texte officiel par un service d'IA pour repérer les valeurs utiles à la paie (variables légales, taux CNAS et CACOBATPH, wilayas d'une zone IRG, tranches de barème). L'analyse ne prépare que des **suggestions**, jamais des règles.

**Avant de commencer**
- [ ] Disposer du droit de création « Extraction IA » (SUPER_ADMIN par défaut).
- [ ] Le document est éligible : marqué ● dans la liste (texte officiel appliqué à partir de 2026, ou décision D15 « Extraction IA possible »).
- [ ] Le document ne contient aucune donnée personnelle.

**Étapes**
1. Lisez le bandeau : « L'analyse prépare des suggestions, jamais des règles : chaque suggestion est relue avec son extrait, corrigée si besoin, puis transformée en proposition par un humain. … »
2. Choisissez le document dans « Document du registre (version en vigueur) ». Légende : « ● analyse possible · ○ saisie manuelle, décision D15 à prendre ou type de texte exclu. »
3. Dans le panneau « Lancer une analyse », lisez que le fichier est envoyé au service Gemini et qu'une nouvelle analyse remplace la précédente.
4. Cochez « Je confirme que ce document est un texte officiel publié et ne contient aucune donnée personnelle (nom, NIN, salaire, adresse d'un salarié…). »
5. Cliquez sur « Analyser le document » (le bouton affiche « Analyse en cours… »).

**Résultat**
- Message « Analyse terminée : N suggestion(s). Rien n'est appliqué… »
- Bloc « Analyse du <date> » : pastille « Analyse en cours de relecture », modèle utilisé, puis « Référence lue », « Intitulé lu », « Publication lue », « Date d'effet lue ».
- « Points d'attention signalés par la lecture » : « Lecture (OCR) », « Ambiguïté », « Information manquante », « Autre ».
- La liste des suggestions (fiche 5.20) et, plus bas, « Analyses précédentes ».

**Attention**
- « Document trop volumineux pour l'analyse (14 Mo maximum) : saisissez ses valeurs à la main. »
- « Lecture du document impossible. » : le fichier n'a pas pu être lu ; saisissez les valeurs à la main.
- « L'analyse IA n'est pas configurée sur le serveur (clé Gemini absente). » : prévenez l'administrateur ; l'analyse est impossible.
- Les conventions, notes internes et autres textes ne sont jamais envoyés à l'IA.
- Une nouvelle analyse écarte les suggestions encore ouvertes de la précédente (celles déjà transformées en proposition restent).
- Si l'analyse porte sur une ancienne version des informations du document, un avertissement invite à relancer une analyse.

**Voir aussi** — 5.20 Relire une suggestion IA et créer la proposition · 5.18 Demander la décision D15

---

## 5.20 Relire une suggestion IA et créer la proposition

> **Vidéo V5.20** · durée estimée 5 min (avec 5.21) · Public : SUPER_ADMIN

**Où la trouver** — Ressources Humaines › Juridique › Extraction IA › carte d'une suggestion › bouton « Relire et créer la proposition » (`/rh/legal/extraction-ia`).

**À quoi ça sert** — Contrôler une valeur lue par l'IA dans le texte, la corriger si besoin, puis la transformer en proposition qui suivra le circuit habituel.

**Avant de commencer**
- [ ] Une analyse est ouverte pour le document (fiche 5.19).
- [ ] Disposer du droit de modifier les propositions légales.

**Étapes**
1. Lisez la carte de suggestion :
   - type : « Variable légale », « Taux d'un régime CNAS », « Wilayas d'une zone IRG » ou « Barème IRG (lecture seule) » ;
   - confiance : « Confiance élevée », « Confiance moyenne » ou « Confiance faible » ;
   - contrôle : « Valeur trouvée dans l'extrait » ou « Valeur absente de l'extrait : transformation bloquée » ;
   - cible, valeur, article et page, « Date d'effet lue », extrait cité.
2. Cliquez sur « Relire et créer la proposition ». Le dialogue « Relire la suggestion et créer la proposition » s'ouvre.
3. Vérifiez la valeur **dans le document lui-même** et corrigez-la si besoin :
   - « Variable légale » et « Taux (%) » ou « Valeur » ;
   - ou « Régime CNAS » et « Salarié (%) », « Employeur (%) », « FOS (%) » (vide = taux légal) ;
   - ou « Zone IRG » et les wilayas cochées.
4. « Extrait du texte » (obligatoire, 10 à 2000 caractères) : la valeur proposée doit y figurer. Le contrôle s'affiche en direct : « ✓ Valeur trouvée dans l'extrait. » ou « ✗ Valeur absente de l'extrait : création bloquée. »
5. « Article » et « Page » (obligatoires).
6. « Source légale » (obligatoire).
7. « Date d'effet prévue par le texte » et « Mois d'application souhaité » (obligatoires ; le mois définitif est fixé par la décision D2 (Date d'application d'une règle légale)).
8. « Intitulé de la proposition » (pré-rempli, 3 caractères minimum).
9. Cochez « Soumettre directement pour approbation » si la proposition est prête.
10. Cliquez sur « Créer la proposition ».

**Résultat**
- Case cochée : « Proposition créée (origine IA) et envoyée pour approbation : aucun effet sur la paie avant l'approbation par une autre personne, puis la décision D2. »
- Case non cochée : « Proposition créée en brouillon (origine IA) : complétez-la puis soumettez-la depuis l'écran des propositions. »
- La suggestion affiche « Proposition créée » et le lien « Ouvrir la proposition ». Dans l'écran des propositions, la carte porte la pastille « Brouillon IA, relu par un humain ».

**Attention**
- Messages de contrôle : « Choisissez la cible de la proposition. », « Valeur numérique requise. », « Indiquez au moins un taux. », « Taux invalides (0 à 100 %). », « Sélectionnez au moins une wilaya. », « Article requis. », « Page requise. », « Extrait requis (10 caractères minimum). », « Intitulé requis (3 caractères minimum). », « Contrôle bloquant : la valeur ne figure pas dans l'extrait cité. »
- Une suggestion « Barème IRG (lecture seule) » ne se transforme pas : « Les tranches d'un barème IRG se saisissent à la main dans un brouillon de barème. » (fiche 5.8).
- La personne qui crée la proposition en est contributrice : une autre personne devra l'approuver.

**Voir aussi** — 5.21 Écarter une suggestion IA · 5.12 Soumettre ou retirer une proposition · 5.13 Approuver ou rejeter une proposition

---

## 5.21 Écarter une suggestion IA

> **Vidéo V5.20** · durée estimée 5 min (avec 5.20) · Public : SUPER_ADMIN

**Où la trouver** — Ressources Humaines › Juridique › Extraction IA › carte d'une suggestion › bouton « Écarter » (`/rh/legal/extraction-ia`).

**À quoi ça sert** — Classer une suggestion fausse, mal lue ou sans rapport avec la paie, en gardant la raison dans l'historique.

**Avant de commencer**
- [ ] La suggestion est encore ouverte.

**Étapes**
1. Cliquez sur « Écarter ». Le dialogue « Écarter la suggestion » s'ouvre.
2. Saisissez le « Motif » (obligatoire, 5 à 500 caractères), par exemple « valeur mal lue » ou « hors sujet paie ».
3. Cliquez sur « Écarter ».

**Résultat** — Message « Suggestion écartée : le motif est conservé dans l'historique. » La carte affiche la pastille « Écartée » et le motif.

**Attention**
- Une suggestion écartée ne peut plus être transformée en proposition. Pour la reprendre, relancez une analyse du document ou saisissez la valeur à la main depuis « Cotisations & impôts ».

**Voir aussi** — 5.20 Relire une suggestion IA et créer la proposition · 5.19 Lancer une analyse IA d'un document

---

## 5.22 Suivre la veille juridique et lancer une vérification

> **Vidéo V5.22** · durée estimée 3 min · Public : SUPER_ADMIN

**Où la trouver** — Ressources Humaines › Juridique › Veille juridique (`/rh/legal/veille`). Onglet « Historique » : `?onglet=historique`.

**À quoi ça sert** — Surveiller automatiquement des pages officielles et repérer les nouveaux textes publiés. La veille aide à repérer ; elle ne remplace pas la vérification juridique par une personne compétente, et un texte détecté n'a aucun effet sur la paie.

**Avant de commencer**
- [ ] Disposer du droit de lecture « Veille juridique » (SUPER_ADMIN par défaut).
- [ ] Pour lancer une vérification : droit de création « Veille juridique ».
- [ ] Au moins un domaine autorisé et une source surveillée existent (fiches 5.25 et 5.26).

**Étapes**
1. Ouvrez « Veille juridique ». Lisez le bandeau d'information et les quatre compteurs : « Dernière vérification », « Textes pertinents à examiner », « Sources actives », « Sources en erreur ».
2. Lisez la ligne de résumé, par exemple « Dernière vérification manuelle (terminée) : 3 source(s) vérifiée(s), 0 en erreur, 2 lien(s) nouveau(x). »
3. Cliquez sur « Vérifier maintenant ». Le bouton affiche « Vérification en cours… ».
4. Ouvrez l'onglet « Historique » pour voir les 15 dernières vérifications : date, pastille « Planifiée » ou « Manuelle », statut (« Terminée », « Interrompue », « En cours »), auteur, résumé et détail par source.

**Résultat** — Message « Vérification terminée : X source(s) lue(s) sur Y, Z en erreur, N lien(s) nouveau(x) dont P pertinent(s). » Les nouveaux liens apparaissent dans l'onglet « Textes détectés ».

**Attention**
- Une source n'est relue que si sa fréquence le permet : environ toutes les 20 heures (quotidienne), toutes les 164 heures (hebdomadaire) ou tous les 27 jours (mensuelle). Une source en erreur est relue chaque jour.
- Message « … N source(s) reportée(s) faute de temps. » : relancez la vérification plus tard.
- Avertissement « Vérification planifiée inactive : la variable serveur CRON_SECRET n'est pas configurée sur cet environnement. Seul le bouton « Vérifier maintenant » fonctionne. » : prévenez l'administrateur ; en attendant, lancez les vérifications à la main.
- Aucune vérification : « Aucune vérification enregistrée pour l'instant. »

**Voir aussi** — 5.23 Examiner et écarter les textes détectés · 5.26 Gérer les sources surveillées

---

## 5.23 Examiner et écarter les textes détectés

> **Vidéo V5.23** · durée estimée 5 min (avec 5.24) · Public : SUPER_ADMIN

**Où la trouver** — Ressources Humaines › Juridique › Veille juridique › onglet « Textes détectés » (`/rh/legal/veille`).

**À quoi ça sert** — Passer en revue les liens nouvellement trouvés sur les sources surveillées, pour importer les textes utiles au registre et écarter les autres.

**Avant de commencer**
- [ ] Pour écarter : droit de création « Veille juridique ».

**Étapes — examiner**
1. Ouvrez l'onglet « Textes détectés (n) ».
2. Choisissez le filtre : « Pertinents à examiner » (par défaut), « Tous les nouveaux à examiner », « Liens de référence (première lecture) », « Importés au registre », « Écartés » ou « Tous ».
3. Tapez un mot dans « Rechercher (titre, adresse, source) ».
4. Lisez chaque carte : titre (ou « Lien sans titre »), adresse cliquable, « <source> · détecté le … », pastilles de statut (« À examiner », « Importé au registre », « Écarté »), « Référence (première lecture) », mots-clés trouvés ou « Aucun mot-clé ».
5. Cliquez sur l'adresse pour ouvrir le texte et juger de son intérêt.

**Étapes — écarter**
1. Sur une carte « À examiner », cliquez sur « Écarter ». Le dialogue « Écarter le texte détecté » s'ouvre.
2. Saisissez le « Motif » (obligatoire, 5 à 300 caractères), par exemple « sans rapport avec la paie » ou « déjà au registre ».
3. Cliquez sur « Écarter ».

**Résultat** — Message « Texte écarté. Il reste consultable dans la vue « Écartés ». » La carte affiche « Écarté par … le … : <motif> ».

**Attention**
- « La première lecture d'une page sert de référence : ses liens sont conservés (marqués « Référence ») sans notification. Seuls les liens apparus ensuite sont signalés comme nouveaux. »
- Un lien est « pertinent » si son titre ou son adresse contient un mot-clé actif (fiche 5.27).
- Vue vide : « Aucun texte détecté dans cette vue. »

**Voir aussi** — 5.24 Importer un texte détecté au registre · 5.27 Gérer les mots-clés de la veille

---

## 5.24 Importer un texte détecté au registre

> **Vidéo V5.23** · durée estimée 5 min (avec 5.23) · Public : SUPER_ADMIN

**Où la trouver** — Ressources Humaines › Juridique › Veille juridique › onglet « Textes détectés » › bouton « Importer » d'une carte (`/rh/legal/veille`).

**À quoi ça sert** — Verser directement au registre des documents juridiques un texte repéré par la veille, sans le télécharger soi-même.

**Avant de commencer**
- [ ] Disposer des droits de création « Veille juridique » **et** « Documents juridiques ».
- [ ] Le lien mène à un fichier PDF ou image de 25 Mo au plus (et non à une page web).

**Étapes**
1. Cliquez sur « Importer ». Le dialogue « Importer le texte détecté au registre » s'ouvre (sous-titre : l'adresse du lien). Il précise que le fichier est téléchargé depuis ce lien et qu'aucune analyse IA n'est lancée automatiquement.
2. Vérifiez et complétez les informations, sur le texte lui-même : mêmes champs que l'import manuel (fiche 5.15). L'intitulé, la langue (arabe si le titre contient de l'arabe), la provenance et le lien sont pré-remplis.
3. Cliquez sur « Télécharger et importer » (le bouton affiche « Téléchargement… »).

**Résultat** — Message « « <intitulé> » importé au registre des documents juridiques. », avec le rappel que l'import n'a aucun effet sur les règles ni sur la paie. La carte passe à « Importé au registre » avec « Importé par … le … · voir le registre ».

**Attention**
- « Ce lien ne mène pas à un fichier PDF ou image (page web ?) : ouvrez-le, téléchargez le texte, puis importez-le depuis le registre des documents juridiques. »
- En cas d'échec du téléchargement, le message propose : « … Vous pouvez aussi télécharger le texte vous-même puis l'importer depuis le registre. » (fiche 5.15).
- « Enregistrement du fichier impossible : … » : réessayez plus tard ou importez le fichier à la main.

**Voir aussi** — 5.15 Importer un document juridique · 5.19 Lancer une analyse IA d'un document

---

## 5.25 Gérer les domaines autorisés

> **Vidéo V5.25** · durée estimée 5 min (avec 5.26) · Public : SUPER_ADMIN

**Où la trouver** — Ressources Humaines › Juridique › Veille juridique › onglet « Domaines autorisés » (`/rh/legal/veille?onglet=domaines`).

**À quoi ça sert** — Fixer la liste des sites que la veille a le droit de lire. Seuls ces domaines (et leurs sous-domaines) peuvent être lus, en https.

**Avant de commencer**
- [ ] Disposer du droit de modification « Veille juridique ».
- [ ] Avoir vérifié que le site est officiel ou expressément jugé fiable.

**Étapes**
1. Ouvrez l'onglet « Domaines autorisés ». Le tableau affiche « Domaine », « Organisme », « État » (« Autorisé » ou « Désactivé ») et le bouton « Modifier ».
2. Cliquez sur « Ajouter un domaine ». Le dialogue « Autoriser un domaine » s'ouvre, avec l'avertissement : « N'autorisez que des sites officiels ou expressément jugés fiables. Désactiver un domaine arrête la lecture de ses sources et l'import de ses liens. »
3. « Domaine » (obligatoire) : nom de domaine seul, sans https:// ni chemin (par exemple joradp.dz). Il ne se modifie plus ensuite.
4. « Organisme » (obligatoire).
5. Laissez cochée la case « Domaine autorisé ».
6. Cliquez sur « Enregistrer ».
7. Pour désactiver un domaine, cliquez sur « Modifier » (dialogue « Modifier le domaine autorisé »), décochez « Domaine autorisé », puis enregistrez.

**Résultat** — Message « Domaine <domaine> autorisé. » ou « Domaine <domaine> modifié. »

**Attention**
- Les adresses internes sont toujours refusées, même derrière un domaine autorisé.
- Liste vide : « Aucun domaine autorisé. » Le bouton « Ajouter une source » reste inactif tant qu'aucun domaine n'est autorisé.

**Voir aussi** — 5.26 Gérer les sources surveillées · 5.22 Suivre la veille juridique et lancer une vérification

---

## 5.26 Gérer les sources surveillées

> **Vidéo V5.25** · durée estimée 5 min (avec 5.25) · Public : SUPER_ADMIN

**Où la trouver** — Ressources Humaines › Juridique › Veille juridique › onglet « Sources surveillées » (`/rh/legal/veille?onglet=sources`).

**À quoi ça sert** — Indiquer les pages officielles à lire à chaque vérification (liste de textes, rubrique « nouveautés »…), et suivre leur état.

**Avant de commencer**
- [ ] Disposer du droit de modification « Veille juridique ».
- [ ] Le domaine de la page est autorisé (fiche 5.25).
- [ ] Les conditions d'utilisation du site ont été vérifiées.

**Étapes**
1. Ouvrez l'onglet « Sources surveillées ». Le tableau affiche :
   - « Source » : libellé et adresse ;
   - « Fréquence » ;
   - « Dernière vérification » ;
   - « Prochaine » : « après le … », « à la prochaine » ou « — » ;
   - « État » : « Désactivée », « Lue », « Inchangée », « Erreur » ou « Jamais vérifiée », « N échecs de suite », « Référence à établir », et le message d'erreur éventuel ;
   - bouton « Modifier ».
2. Cliquez sur « Ajouter une source ». Le dialogue « Ajouter une source surveillée » s'ouvre.
3. « Libellé » (obligatoire, 120 caractères au maximum).
4. « Adresse de la page » (obligatoire) : adresse https sur un domaine autorisé.
5. « Fréquence » (obligatoire) : « Quotidienne », « Hebdomadaire » (par défaut) ou « Mensuelle ».
6. Laissez cochée la case « Source active ».
7. Cliquez sur « Enregistrer ».
8. Pour modifier ou désactiver une source, cliquez sur « Modifier » (dialogue « Modifier la source »), changez les champs ou décochez « Source active », puis enregistrez.

**Résultat** — Message « Source « <libellé> » ajoutée : sa première lecture servira de référence. » ou « Source « <libellé> » modifiée. »

**Attention**
- La première lecture d'une nouvelle source ne signale aucun lien : elle sert de référence. Seuls les liens apparus ensuite seront signalés.
- « Changer l'adresse fait établir une nouvelle référence à la prochaine lecture. »
- Liste vide : « Aucune source surveillée. Ajoutez l'adresse d'une page officielle qui liste les nouveaux textes (après avoir vérifié ses conditions d'utilisation). »

**Voir aussi** — 5.25 Gérer les domaines autorisés · 5.22 Suivre la veille juridique et lancer une vérification

---

## 5.27 Gérer les mots-clés de la veille

> **Vidéo V5.27** · durée estimée 2 min · Public : SUPER_ADMIN

**Où la trouver** — Ressources Humaines › Juridique › Veille juridique › onglet « Mots-clés » (`/rh/legal/veille?onglet=mots-cles`).

**À quoi ça sert** — Définir les mots qui rendent un lien « pertinent ». Un lien est signalé comme pertinent si son titre ou son adresse contient un mot-clé actif, sans tenir compte des majuscules ni des accents.

**Avant de commencer**
- [ ] Disposer du droit de modification « Veille juridique ».

**Étapes**
1. Ouvrez l'onglet « Mots-clés ».
2. Tapez un mot ou une expression dans « Nouveau mot-clé (ex. allocation familiale, المنح) » (2 à 80 caractères). Vous pouvez saisir des mots en arabe.
3. Cliquez sur « Ajouter ».
4. Pour suspendre un mot-clé, cliquez sur « Désactiver » à côté de lui ; pour le remettre en service, cliquez sur « Réactiver ».

**Résultat** — Message « Mot-clé « <mot> » ajouté. », « … désactivé. » ou « … réactivé. » Un mot-clé désactivé apparaît barré.

**Attention**
- Les mots-clés s'appliquent aux liens détectés **après** leur ajout.
- Aucun texte n'est envoyé à l'IA pendant la veille.

**Voir aussi** — 5.23 Examiner et écarter les textes détectés · 5.22 Suivre la veille juridique et lancer une vérification
