# 4 Documents — الوثائق

**Dans ce chapitre** — La section « Documents » regroupe tous les documents RH numérotés de l'entreprise : fiches de renseignements, contrats de travail, ordres de mission, titres de congé, bulletins de paie, attestations et courriers. Vous y apprendrez à retrouver un document dans le registre, à établir un ordre de mission ou un titre de congé, à imprimer une attestation, un certificat, un reçu pour solde de tout compte ou une mise en demeure, et à réimprimer un courrier sous le même numéro. Chaque document reçoit une référence unique, attribuée automatiquement à l'enregistrement.

| Fonction | Vidéo | Public |
|---|---|---|
| 4.1 Consulter le registre des documents | V4.1 | Tous les rôles ayant accès aux documents RH |
| 4.2 Afficher, imprimer ou compléter une fiche de renseignements | V4.2 | ADMIN_RH, GERANT |
| 4.3 Consulter le registre des contrats de travail | V4.3 | ADMIN_RH, GERANT |
| 4.4 Consulter le registre des bulletins de paie | V4.3 | ADMIN_RH, GERANT, ADMIN_FINANCE |
| 4.5 Établir un ordre de mission | V4.5 | ADMIN_RH, GERANT |
| 4.6 Retrouver, consulter ou modifier un ordre de mission | V4.6 | ADMIN_RH, GERANT |
| 4.7 Établir un titre de congé | V4.7 | ADMIN_RH, GERANT |
| 4.8 Compléter et imprimer un titre de congé existant | V4.8 | ADMIN_RH, GERANT |
| 4.9 Établir une attestation ou un certificat de travail | V4.9 | ADMIN_RH |
| 4.10 Établir un reçu pour solde de tout compte | V4.10 | ADMIN_RH |
| 4.11 Établir une mise en demeure | V4.11 | ADMIN_RH |
| 4.12 Consulter l'historique et réimprimer un courrier | V4.12 | ADMIN_RH |

## 4.0 L'écran en un coup d'œil

La section « Documents » de la barre RH contient deux onglets : « Registre » et « Attestations ».

**Onglet « Registre »** (`/rh/documents`)
- En-tête « Documents », avec la phrase « Chaque document reçoit une référence unique, jamais réutilisée. »
- Cinq cartes, une par type de document. Chaque carte affiche un compteur ; un clic sur la carte affiche le registre correspondant sous les cartes :
  - « Fiche de renseignements » (nombre de fiches) ;
  - « Contrat de travail » (nombre de contrats) ;
  - « Ordre de mission » (nombre d'ordres) — carte sélectionnée à l'ouverture de la page ;
  - « Titre de congé » (nombre de titres) ;
  - « Bulletin de paie » (mention « Par période de paie »).
- Sous les cartes, le registre choisi : un titre, un bouton de création à droite, puis un tableau. Les registres des contrats et des bulletins se chargent à la demande (message « Chargement du registre… »).
- Chaque tableau propose : un champ de recherche, le menu « Colonnes » pour choisir les colonnes affichées, le tri en cliquant sur un en-tête de colonne, et une pagination avec les boutons « Précédent » et « Suivant ».
- Les messages de confirmation (en vert) et d'erreur (en rouge) s'affichent juste sous les cartes.

**Onglet « Attestations »** (`/rh/attestations`)
- Titre « Attestations & courriers ».
- Panneau « Établir un document » : listes « Employé » et « Document », bouton « Préparer ». Une note rappelle : « Les titres de congé s'impriment depuis le Registre ; certificat et solde de tout compte sont aussi accessibles depuis Sorties. »
- En dessous, l'historique des courriers émis : colonnes « N° », « Document », « Employé », « Établi le », et bouton « Réimprimer » sur chaque ligne.

---

## 4.1 Consulter le registre des documents

> **Vidéo V4.1** · durée estimée 3 min · Public : tous les rôles ayant accès aux documents RH (ADMIN_RH, GERANT, ADMIN_FINANCE, CHEF_CHANTIER, READ_ONLY)

**Où la trouver** — Ressources Humaines › Documents › Registre (`/rh/documents`).

**À quoi ça sert** — Retrouver n'importe quel document RH numéroté, l'ouvrir, l'imprimer ou ouvrir son PDF archivé. Le registre est aussi le point de départ pour établir un ordre de mission ou un titre de congé.

**Avant de commencer**
- [ ] Disposer du droit de lecture « Documents RH ». Sans ce droit, la section « Documents » n'apparaît pas.

**Étapes**
1. Dans la barre RH, cliquez sur « Documents », puis sur l'onglet « Registre ». La carte « Ordre de mission » est sélectionnée par défaut.
2. Cliquez sur la carte du type de document recherché : « Fiche de renseignements », « Contrat de travail », « Ordre de mission », « Titre de congé » ou « Bulletin de paie ».
3. Tapez un matricule, un nom ou une référence dans le champ de recherche du registre. La liste se filtre au fur et à mesure.
   - Astuce : cliquez sur un en-tête de colonne pour trier ; utilisez « Colonnes » pour masquer ou afficher une colonne.
4. Utilisez les boutons placés au bout de chaque ligne (par exemple « Consulter », « Ouvrir le PDF archivé », « Imprimer ») pour ouvrir ou imprimer le document.

**Résultat** — Le document s'ouvre dans un nouvel onglet (PDF archivé) ou dans une fenêtre d'impression.

**Comment les documents sont numérotés**
- Le numéro est attribué automatiquement **au moment de l'enregistrement**. Avant l'enregistrement, le champ numéro affiche « — » ou « Nouveau ».
- Format : 6 chiffres, une barre oblique, puis les 2 derniers chiffres de l'année. Exemple : 000005/26.
- Le compteur repart à 000001 chaque 1er janvier.
- Le même compteur sert à tous les courriers RH : ordres de mission, titres de congé, attestations, certificats, reçus pour solde de tout compte et mises en demeure. Les numéros d'un même type ne se suivent donc pas toujours. Exemple : un ordre de mission reçoit 000012/26, puis une attestation reçoit 000013/26 ; l'ordre de mission suivant recevra 000014/26.
- À l'impression, la référence prend la forme :
  - ordre de mission : NF/OM/0005/26 ;
  - titre de congé : NF/CNG/0005/26 ;
  - attestations et courriers : « N° : 000005/26 ».

**Comment les documents sont archivés**
- À l'enregistrement d'une fiche de renseignements, d'un ordre de mission ou d'un titre de congé, l'application produit un PDF et le range dans le dossier de l'employé.
- Si la production du PDF échoue, le document reste bien enregistré ; le message de confirmation le signale (« Archive non créée : … » ou « PDF plus tard : … »).

**Attention**
- Aucun écran ne permet de supprimer un document numéroté. Un numéro n'est jamais réutilisé.
- Un titre de congé peut être annulé (depuis l'écran Congés) : il reste au registre avec l'état « Annulé » et garde son numéro.
- Message « Numéro déjà attribué, réessayez. » : deux personnes ont enregistré un document au même instant. Cliquez à nouveau sur le bouton d'enregistrement.

**Voir aussi** — 4.5 Établir un ordre de mission · 4.7 Établir un titre de congé · 4.12 Consulter l'historique et réimprimer un courrier

---

## 4.2 Afficher, imprimer ou compléter une fiche de renseignements

> **Vidéo V4.2** · durée estimée 3 min · Public : ADMIN_RH, GERANT (lecture : tous les rôles ayant accès aux documents RH)

**Où la trouver** — Ressources Humaines › Documents › Registre › carte « Fiche de renseignements » (`/rh/documents?onglet=fiches`).

**À quoi ça sert** — Afficher, imprimer ou compléter la fiche signalétique officielle d'un employé. Il existe une fiche par employé ; elle reprend les informations saisies dans le dossier de l'employé.

**Avant de commencer**
- [ ] Disposer du droit de lecture « Documents RH ».
- [ ] Pour modifier une fiche : disposer du droit de modifier les employés.

**Étapes**
1. Cliquez sur la carte « Fiche de renseignements ». Le registre « Fiches de renseignements » s'affiche (« Une fiche par employé : affichez-la, imprimez-la ou complétez-la. »).
2. Recherchez l'employé dans le champ « Matricule, nom, NSS, NIN… ».
3. Choisissez l'action voulue au bout de la ligne :
   - « Afficher la fiche » : un aperçu au format A4 s'ouvre, avec le nom de l'employé en titre et « Matricule … » en sous-titre. Boutons « Fermer », « Modifier » et « Imprimer ».
   - « Imprimer la fiche » : la fenêtre d'impression s'ouvre directement.
   - « Modifier la fiche » : le formulaire de l'employé s'ouvre (le même que dans Personnel › Employés).
4. Après une modification, cliquez sur « Enregistrer ».
5. Pour ouvrir la dernière version archivée, cliquez sur « Ouvrir le PDF » dans la colonne « PDF archivé ».

**Résultat** — Message « Fiche enregistrée. PDF : … ». Le PDF de la fiche est rangé dans le dossier de l'employé et la colonne « PDF archivé » affiche « Ouvrir le PDF ».

**Attention**
- « Pas encore archivée » dans la colonne « PDF archivé » : la fiche n'a jamais été enregistrée depuis cet écran ou depuis le formulaire employé.
- Message « Fiche enregistrée. PDF plus tard : … » : les informations sont bien enregistrées, mais le PDF n'a pas été produit. Si le message persiste, prévenez l'administrateur.
- Le bouton « Fiche employé » en haut du registre ouvre un formulaire **vide** : il sert à créer un **nouvel employé**, pas une deuxième fiche pour un employé existant.

**Voir aussi** — Chapitre 1 Personnel (créer et modifier un employé) · 4.1 Consulter le registre des documents

---

## 4.3 Consulter le registre des contrats de travail

> **Vidéo V4.3** · durée estimée 3 min (avec 4.4) · Public : ADMIN_RH, GERANT

**Où la trouver** — Ressources Humaines › Documents › Registre › carte « Contrat de travail » (`/rh/documents?onglet=contrats`). Les alertes de contrats du tableau de bord RH mènent aussi à ce registre.

**À quoi ça sert** — Voir tous les contrats de travail avec leur statut, les ouvrir, les imprimer ou ouvrir leur PDF archivé. La création et la modification d'un contrat sont décrites au chapitre 1.

**Avant de commencer**
- [ ] Disposer du droit de lecture « Documents RH ».

**Étapes**
1. Cliquez sur la carte « Contrat de travail ». Patientez pendant le message « Chargement du registre… ».
2. Le registre « Contrats de travail » s'affiche. Sa description rappelle que le chantier porte l'activité et le CACOBATPH, que les rubriques sont réparties en cinq classes, et que les contrats brouillon entrent aussi en paie.
3. Recherchez un contrat dans le champ « Employé, matricule, affectation… ».
4. Lisez les colonnes : Employé, Affectation, Type, Net chantier, Statut. Valeurs possibles du statut : « Brouillon », « Actif », « Suspendu », « Clôturé ».
5. Utilisez les actions de la ligne : « Afficher », « Modifier », « Imprimer », « PDF archivé ».
6. La barre d'outils du registre propose aussi : « Exceptions » (ouvre l'écran des rubriques exceptionnelles de la paie), « Importer des contrats », « Contrat PDF » et « Nouveau contrat ».

**Résultat** — Le contrat s'affiche, s'imprime ou s'ouvre en PDF.

**Attention**
- Toute nouvelle date de début de contrat doit être le 1er du mois.
- Un contrat au statut « Brouillon » est quand même pris en compte dans la paie.

**Voir aussi** — Chapitre 1 Personnel (créer, modifier, importer un contrat) · Chapitre 3 Paie (rubriques exceptionnelles) · 4.4 Consulter le registre des bulletins de paie

---

## 4.4 Consulter le registre des bulletins de paie

> **Vidéo V4.3** · durée estimée 3 min (avec 4.3) · Public : ADMIN_RH, GERANT, ADMIN_FINANCE

**Où la trouver** — Ressources Humaines › Documents › Registre › carte « Bulletin de paie » (`/rh/documents?onglet=bulletins`).

**À quoi ça sert** — Retrouver un bulletin de paie déjà établi, tous mois confondus, pour l'afficher, l'imprimer ou ouvrir son PDF archivé. Le calcul, le recalcul et l'établissement des bulletins sont expliqués au chapitre 3.

**Avant de commencer**
- [ ] Disposer du droit de lecture « Documents RH » et de la paie.

**Étapes**
1. Cliquez sur la carte « Bulletin de paie ». Patientez pendant le message « Chargement du registre… ».
2. Le registre « Bulletins de paie » s'affiche.
3. Filtrez la liste :
   - champ « Rechercher (matricule, nom, chantier)… » ;
   - sélecteur de période (par défaut « Toutes les périodes ») ; le compteur indique le nombre de bulletins affichés.
4. Lisez les colonnes : Période (MM/AAAA), Employé, Chantier, Jours, Net à payer DA, Statut (« Brouillon », « Validée », « Clôturée »). Le tableau affiche 50 lignes par page.
5. Utilisez les actions de la ligne : « Afficher », « Imprimer », « PDF archivé » (bulletins validés ou clôturés).

**Résultat** — Le bulletin s'affiche dans une fenêtre, s'imprime ou s'ouvre en PDF.

**Attention**
- Le bouton « Recalculer » (bulletins brouillon uniquement) et le bouton « Nouveau bulletin de paie » passent par une décision du Centre de décisions (D4, D3 ou D1) avec une justification d'au moins 10 caractères. Leur fonctionnement est décrit au chapitre 3.
- Si un bulletin brouillon n'est plus à jour, son ouverture propose aussi une décision.
- Un bulletin validé ou clôturé n'est jamais recalculé : ses montants sont figés.

**Voir aussi** — Chapitre 3 Paie (fiches sur les bulletins de paie, établir un nouveau bulletin, décisions D3 et D4) · 4.3 Consulter le registre des contrats de travail

---

## 4.5 Établir un ordre de mission

> **Vidéo V4.5** · durée estimée 5 min · Public : ADMIN_RH, GERANT

**Où la trouver** — Ressources Humaines › Documents › Registre › carte « Ordre de mission » › bouton « Nouvel ordre de mission » (`/rh/documents?nouveau=om`).

**À quoi ça sert** — Établir l'ordre de mission numéroté d'un employé qui se déplace, l'imprimer et l'archiver. À l'enregistrement, les jours de mission sont proposés automatiquement dans le pointage de l'employé avec le code « MS ».

**Avant de commencer**
- [ ] Disposer du droit de création « Documents RH » sur le chantier concerné.
- [ ] L'employé existe dans le Personnel.
- [ ] Le chantier d'affectation existe dans la liste des chantiers (sinon l'ordre ne peut pas être relié au pointage).
- [ ] La date de départ est aujourd'hui ou plus tard.

**Étapes**
1. Cliquez sur la carte « Ordre de mission », puis sur « Nouvel ordre de mission ». La fenêtre « Ordre de Mission » s'ouvre avec le sous-titre « Nouveau ».
2. Bloc « Identification » :
   - Le champ « N° Ordre de Mission » affiche « — » : le numéro sera attribué à l'enregistrement.
   - Dans « Rechercher un employé », tapez un matricule, un nom ou un prénom, puis cliquez sur « Chercher ». La recherche trouve un matricule exact, un début de nom, ou un mot contenu dans le nom dès 3 lettres. Si plusieurs employés correspondent, cliquez sur le bon dans la liste.
   - Les champs « Nom », « Prénom », « Affectation » et « Fonction / Poste » se remplissent depuis la fiche et le contrat de l'employé. Vérifiez-les.
   - « Affectation » : choisissez le chantier dans la liste (obligatoire pour relier l'ordre au pointage).
   - « Code affectation — رمز التعيين » : facultatif.
   - « Fonction / Poste » : choisissez dans la liste des postes.
3. Bloc « Déplacement » :
   - « 1ère destination » et « 2ème destination » : tapez un lieu ; la liste propose les chantiers.
   - « Lieu de départ » : Hassi Messaoud par défaut.
   - « Date de départ — تاريخ الذهاب » (obligatoire) : aujourd'hui ou une date future.
   - « Lieu de retour ».
   - « Date de retour — تاريخ العودة » : laissez vide pour une mission ouverte ; l'ordre imprimera alors « Fin de mission ».
   - « Motif du déplacement » : décrivez l'objet de la mission.
   - Avec l'ancien modèle d'impression, deux champs s'ajoutent : « Heure de départ » et « Heure de retour ».
4. Bloc « Transport » :
   - « Moyen de transport » : « Tous moyens de transport » ou « Véhicule de service ».
   - « Véhicule — Modèle », « Immatriculation », « Kilométrage au départ », « Kilométrage au retour ».
5. Bloc « Pièce d'identité du missionnaire » :
   - « Type de pièce » (par exemple carte d'identité) et « N° pièce ».
   - Avec l'ancien modèle : « Délivré le » et « À (lieu) ».
6. Bloc « Donneur de l'OM & émission » :
   - « Donneur de l'OM » : « Service RH » par défaut.
   - « Fonction du donneur de l'OM ».
   - « Fait à » : HMD par défaut.
   - « Date du document » : date du jour par défaut.
   - « Modèle d'impression — نموذج الطباعة » : « Nouveau modèle » ou « Ancien modèle ».
7. Cliquez sur « ENREGISTRER ».
8. Rouvrez l'ordre (fiche 4.6) et cliquez sur « IMPRIMER », ou cliquez sur « Consulter » dans le registre pour ouvrir le PDF archivé.
   - Astuce : enregistrez toujours avant d'imprimer, pour que la référence NF/OM/… figure sur le document.

**Résultat**
- Message « Ordre … enregistré et archivé. Jours MS proposés dans le pointage, à valider. », suivi du lien « Ouvrir le pointage ».
- L'ordre apparaît en tête du registre avec sa référence (par exemple NF/OM/0014/26) et la mention « Établi le jj/mm/aaaa ».
- Les jours du départ au retour sont **proposés** avec le code « MS » dans la feuille de présence de l'employé. Ils apparaissent en italique gris et doivent être **validés** dans l'écran Présence pour compter dans la paie.
- Mission ouverte (sans date de retour) : les jours « MS » sont proposés sur les mois à venir, jusqu'au document suivant de l'employé (autre ordre de mission ou congé).

**Attention**
- « Employé requis. » : vous n'avez pas sélectionné d'employé avec « Chercher ».
- « Le matricule et le nom sont obligatoires. » : la recherche de l'employé n'a pas rempli ces champs ; recommencez la recherche.
- « Date de départ obligatoire. » / « La date de départ doit être aujourd'hui ou une date future. » : corrigez la date de départ.
- « La date de retour doit être une date future. » / « La date de retour doit être postérieure à la date de départ. » / « La date de retour précède le départ. » : corrigez la date de retour.
- « Affectation introuvable : impossible de lier l'ordre au pointage. » : choisissez un chantier dans la liste « Affectation ».
- « Numéro déjà attribué, réessayez. » : cliquez à nouveau sur « ENREGISTRER ».
- « Archive non créée : … » : l'ordre est enregistré, mais le PDF n'a pas été produit.
- Le bouton « NOUVEAU » vide la fenêtre pour saisir un autre ordre.

**Voir aussi** — 4.6 Retrouver, consulter ou modifier un ordre de mission · Chapitre 2 Temps & présence (valider les jours proposés dans la feuille de présence)

---

## 4.6 Retrouver, consulter ou modifier un ordre de mission

> **Vidéo V4.6** · durée estimée 3 min · Public : ADMIN_RH, GERANT (consultation : tous les rôles ayant accès aux documents RH)

**Où la trouver** — Ressources Humaines › Documents › Registre › carte « Ordre de mission » (`/rh/documents?onglet=missions`).

**À quoi ça sert** — Retrouver un ordre de mission, ouvrir son PDF archivé, le corriger, clôturer une mission ouverte en saisissant la date de retour, ou ouvrir le pointage de l'employé pour le mois de la mission.

**Avant de commencer**
- [ ] Pour modifier : disposer du droit de modification « Documents RH » sur le chantier.

**Étapes**
1. Cliquez sur la carte « Ordre de mission ». Le registre « Ordres de mission » s'affiche (« Archivés à l'enregistrement et consultables à tout moment. »).
2. Recherchez l'ordre dans le champ « Référence, matricule, nom… ».
3. Lisez les colonnes :
   - « Référence » : NF/OM/… et « Établi le jj/mm/aaaa » ;
   - « Employé » ;
   - « Mission » : destination et période (« Fin de mission » s'il n'y a pas de date de retour) ;
   - « Établi par ».
4. Choisissez l'action au bout de la ligne :
   - « Consulter » : ouvre le PDF archivé ; s'il n'existe pas, lance l'impression.
   - « Voir le pointage » : ouvre la feuille de présence de l'employé, sur le chantier et le mois du départ.
   - « Modifier » : ouvre la fenêtre « Ordre de Mission » avec le numéro en sous-titre.
5. Dans la fenêtre, vous pouvez passer à un autre ordre sans la fermer :
   - tapez un numéro, un matricule ou un nom dans « Rechercher par N° OM, matricule ou nom... », puis cliquez sur « RECHERCHER » ;
   - ou utilisez « ❮ Précédent » et « Suivant ❯ ».
6. Modifiez les champs voulus (mêmes blocs que dans la fiche 4.5). Pour clôturer une mission ouverte, renseignez la « Date de retour — تاريخ العودة ».
7. Cliquez sur « MODIFIER ». Cliquez sur « IMPRIMER » si besoin.

**Résultat** — L'ordre est mis à jour sous le **même numéro**. Les jours « MS » proposés dans le pointage sont ajustés : les jours devenus inutiles sont retirés, sauf dans les mois clôturés et sauf les jours déjà validés d'un mois dont la paie est validée.

**Attention**
- En modification, les dates déjà enregistrées ne sont pas contrôlées par rapport à la date du jour. Pour clôturer une mission, la date de retour doit seulement être postérieure à la date de départ.
- « Veuillez entrer un critère. » : le champ de recherche de la fenêtre est vide.
- « Aucun ordre trouvé. » : aucun ordre ne correspond au numéro, au matricule ou au nom saisi.
- Il n'existe pas de bouton pour annuler ou supprimer un ordre de mission.

**Voir aussi** — 4.5 Établir un ordre de mission · Chapitre 2 Temps & présence (feuille de présence, jours proposés par les ordres de mission)

---

## 4.7 Établir un titre de congé

> **Vidéo V4.7** · durée estimée 4 min · Public : ADMIN_RH, GERANT

**Où la trouver** — Ressources Humaines › Documents › Registre › carte « Titre de congé » › bouton « Nouveau titre de congé » (`/rh/documents?onglet=conges`).

**À quoi ça sert** — Saisir en une seule fois un congé et son titre numéroté : l'application crée la demande de congé, l'approuve, numérote le titre, l'archive en PDF et propose les jours de congé dans le pointage.

**Avant de commencer**
- [ ] Disposer du droit « Documents RH » et du droit de créer une demande de congé.
- [ ] Pour que le titre soit numéroté tout de suite : disposer du droit d'approuver les congés (SUPER_ADMIN, ADMIN_RH, GERANT).
- [ ] Pour un congé annuel : connaître le solde de l'employé (écran Congés, onglet des soldes).

**Étapes**
1. Cliquez sur la carte « Titre de congé », puis sur « Nouveau titre de congé ». La fenêtre « Titre de Congé » s'ouvre avec le sous-titre « Nouveau ».
2. Bloc « Identification » :
   - Dans « Rechercher un employé », tapez un matricule, un nom ou un prénom, puis cliquez sur « Chercher ». Choisissez l'employé dans la liste si plusieurs correspondent.
   - « Matricule » (non modifiable), « Nom », « Prénom », « Affectation » et « Fonction / Poste » se remplissent. Vérifiez-les.
3. Bloc « Congé — الإجازة » :
   - « Nature du congé — طبيعة الإجازة » : Congé annuel (CA), Récupération (CRP), Congé maladie (CM), Congé sans solde (CSS) ou Absence autorisée payée (AOP).
   - « Du — من » (obligatoire) : premier jour du congé.
   - « Au (inclus) — إلى » (obligatoire) : dernier jour du congé.
   - « Nombre de jours — عدد الأيام » : l'aide sous le champ indique le nombre de jours calendaires (« N j calendaires »). Laissez le champ vide pour retenir ce nombre, ou tapez une autre valeur.
   - « Date de reprise — تاريخ الاستئناف » : calculée automatiquement (lendemain du dernier jour), non modifiable.
   - Exemple : du 05/10/2026 au 18/10/2026 inclus, l'aide affiche « 14 j calendaires » et la date de reprise est le 19/10/2026.
4. Bloc « Transport » : « Moyen de transport », « Véhicule — Modèle », « Immatriculation », « Kilométrage au départ », « Kilométrage au retour » (facultatifs).
5. Bloc « Pièce d'identité de l'intéressé(e) — وثيقة التعريف » : « Type de pièce », « N° pièce » (pré-remplis depuis la fiche de l'employé).
6. Bloc « Validation & émission — المصادقة والإصدار » : « Établi par », « Fonction », « Fait à », « Date du document ».
7. Cliquez sur « ENREGISTRER ».
8. Cliquez sur « Imprimer » dans le registre, ou rouvrez le titre et cliquez sur « IMPRIMER ».

**Résultat**
- Message « Titre de congé NF/CNG/… enregistré et archivé en PDF. Jours proposés dans le pointage, à valider. »
- Le titre apparaît au registre avec sa référence (par exemple NF/CNG/0015/26), la nature, la période, le nombre de jours et l'état « Complété ».
- La demande de congé est enregistrée **et approuvée** ; elle apparaît dans l'écran Congés.
- Les jours du congé sont proposés avec le code de la nature (CA, CRP, CM, CSS ou AOP) dans la feuille de présence. Ils doivent être validés dans l'écran Présence pour compter dans la paie.

**Attention**
- Congé annuel avec un solde insuffisant : la question « Solde insuffisant (X j disponibles pour Y j demandés). Enregistrer quand même ? » s'affiche. Cliquez sur « OK » pour enregistrer malgré tout, ou sur « Annuler » pour revenir à la saisie.
- Sans droit d'approbation : message « Demande de congé enregistrée, en attente d'approbation : le titre sera établi à l'approbation. » Le titre n'est pas encore numéroté ; il apparaîtra au registre quand un responsable aura approuvé la demande dans l'écran Congés.
- « Recherchez d'abord l'employé. » : aucun employé n'a été sélectionné.
- « Dates du congé requises (du … au …). » : renseignez « Du » et « Au (inclus) ».
- « Le matricule et le nom sont obligatoires. » : recommencez la recherche de l'employé.
- « Saisissez un matricule, un nom ou un prénom. » / « Aucun employé trouvé pour « … ». » : corrigez le texte de recherche.

**Voir aussi** — 4.8 Compléter et imprimer un titre de congé existant · Chapitre 2 Temps & présence (demandes de congé, approbation, soldes, validation des jours proposés)

---

## 4.8 Compléter et imprimer un titre de congé existant

> **Vidéo V4.8** · durée estimée 2 min · Public : ADMIN_RH, GERANT

**Où la trouver** — Ressources Humaines › Documents › Registre › carte « Titre de congé » (`/rh/documents?onglet=conges`). Depuis l'écran Congés, le bouton « Titre de congé » d'une demande approuvée ouvre directement le titre dans ce registre.

**À quoi ça sert** — Compléter les informations d'impression d'un titre créé lors de l'approbation d'un congé, le réimprimer ou ouvrir son PDF archivé.

**Avant de commencer**
- [ ] Le congé est approuvé (le titre est numéroté).
- [ ] Disposer du droit de modification « Documents RH ».

**Étapes**
1. Cliquez sur la carte « Titre de congé ». Le registre « Titres de congé » s'affiche (« Un titre numéroté par congé approuvé : complétez-le, puis imprimez. »).
2. Recherchez le titre dans le champ « Référence, matricule, nom… ».
3. Repérez l'état dans la colonne « État » :
   - « À compléter » : le titre a été créé par l'approbation du congé, ses informations d'impression n'ont jamais été enregistrées ;
   - « Complété » : les informations d'impression ont été enregistrées ;
   - « Annulé » : le congé a été annulé.
4. Cliquez sur « Ouvrir le titre ». Dans le bloc « Congé — الإجازة », la nature, les dates, le nombre de jours et la date de reprise sont en lecture seule.
5. Complétez ou corrigez les blocs « Identification » (« Nom », « Prénom », « Affectation », « Fonction / Poste »), « Transport », « Pièce d'identité de l'intéressé(e) — وثيقة التعريف » et « Validation & émission — المصادقة والإصدار ».
6. Cliquez sur « ENREGISTRER » (ou « MODIFIER » si le titre était déjà complété).
7. Cliquez sur « IMPRIMER ».
   - Astuce : pour passer à un autre titre sans fermer la fenêtre, utilisez « Rechercher par N° titre, matricule ou nom... » puis « RECHERCHER », ou les boutons « ❮ Précédent » et « Suivant ❯ ».
8. Pour ouvrir directement la version archivée, cliquez sur « Ouvrir le PDF archivé » dans le registre ; pour imprimer sans ouvrir la fenêtre, cliquez sur « Imprimer ».

**Résultat** — Message « Titre de congé NF/CNG/… enregistré et archivé en PDF. » L'état passe à « Complété » et le PDF archivé est mis à jour dans le dossier de l'employé.

**Attention**
- La note du bloc « Congé » rappelle : « Nature et dates viennent de la demande de congé approuvée et se modifient depuis celle-ci. » Pour changer les dates, passez par l'écran Congés.
- Titre d'un congé annulé : le message « Ce congé a été annulé : le titre ne peut plus être imprimé. » s'affiche ; les boutons « IMPRIMER » et « ENREGISTRER » sont désactivés et aucune action n'est proposée dans le registre.
- « Aucun titre trouvé. » : aucun titre ne correspond à la recherche dans la fenêtre.

**Voir aussi** — 4.7 Établir un titre de congé · Chapitre 2 Temps & présence (approuver, annuler un congé, imprimer le titre depuis la liste des demandes)

---

## 4.9 Établir une attestation ou un certificat de travail

> **Vidéo V4.9** · durée estimée 3 min · Public : ADMIN_RH

**Où la trouver** — Ressources Humaines › Documents › Attestations › panneau « Établir un document » (`/rh/attestations`). Le certificat de travail est aussi accessible depuis Personnel › Sorties.

**À quoi ça sert** — Imprimer, en français ou en arabe, une attestation de travail (pour un employé en poste) ou un certificat de travail (pour un employé sorti), numérotés et conservés dans l'historique.

**Avant de commencer**
- [ ] Disposer du droit « Attestations & courriers ».
- [ ] La fiche de l'employé est complète : nom en arabe, date et lieu de naissance, poste en français et en arabe.
- [ ] Pour un certificat de travail : la sortie de l'employé est enregistrée (la date de sortie est reprise automatiquement).

**Étapes**
1. Dans la liste « Employé », choisissez l'employé. Un employé sorti est suivi de la mention « (sorti) ».
2. Dans la liste « Document », choisissez « Attestation de travail · إفادة عمل » ou « Certificat de travail · شهادة عمل ».
3. Cliquez sur « Préparer ». La fenêtre s'ouvre avec le titre du document en français et en arabe.
4. Choisissez la langue du document : bouton « Français » ou bouton « العربية ». Choisissez la civilité : « Monsieur · السيد » ou « Madame · السيدة ».
5. Vérifiez les champs pré-remplis, communs aux deux documents : « Nom et prénom (FR) », « الاسم واللقب », « Matricule », « Date du document », « Poste (FR) », « المنصب ».
6. Vérifiez les champs propres au document :
   - attestation de travail : « Né(e) le », « Lieu de naissance (FR) », « مكان الميلاد », « En poste depuis le » (date de début du premier contrat) ;
   - certificat de travail : « Né(e) le », « Lieu de naissance (FR) », « مكان الميلاد », « Du », « Au (date de sortie) ».
7. Facultatif : cochez « Modifier le texte librement » pour retoucher le texte du courrier. L'aperçu, à droite, se met à jour en direct.
8. Cliquez sur « Enregistrer et imprimer ».

**Résultat** — Le courrier reçoit un numéro (par exemple 000013/26), affiché « N° 000013/26 » dans la fenêtre et imprimé « N° : 000013/26 ». La fenêtre d'impression s'ouvre et le courrier apparaît en tête de l'historique.

**Attention**
- Changer de langue efface le texte libre déjà saisi : choisissez la langue avant de modifier le texte.
- Chaque passage par « Préparer » puis « Enregistrer et imprimer » crée un **nouveau numéro**. Pour réimprimer un courrier existant sous le même numéro, utilisez « Réimprimer » (fiche 4.12).
- Les modifications faites dans la fenêtre ne changent pas la fiche de l'employé. Corrigez la fiche (chapitre 1) pour que les prochains courriers soient justes.

**Voir aussi** — 4.12 Consulter l'historique et réimprimer un courrier · Chapitre 1 Personnel (fiche employé, sorties)

---

## 4.10 Établir un reçu pour solde de tout compte

> **Vidéo V4.10** · durée estimée 3 min · Public : ADMIN_RH

**Où la trouver** — Ressources Humaines › Documents › Attestations › panneau « Établir un document » (`/rh/attestations`). Aussi accessible depuis Personnel › Sorties.

**À quoi ça sert** — Imprimer le reçu signé par l'employé sortant pour la somme reçue au titre du solde de tout compte, avec un détail facultatif des montants.

**Avant de commencer**
- [ ] Disposer du droit « Attestations & courriers ».
- [ ] La sortie de l'employé est enregistrée (date de sortie et, si possible, lignes de solde).
- [ ] Le bulletin de paie du mois de sortie est établi, si vous voulez que la somme soit reprise automatiquement.

**Étapes**
1. Choisissez l'employé dans « Employé », puis « Reçu pour solde de tout compte · وصل تصفية كل حساب » dans « Document ».
2. Cliquez sur « Préparer ».
3. Choisissez la langue (« Français » ou « العربية ») et la civilité.
4. Vérifiez les champs communs (« Nom et prénom (FR) », « الاسم واللقب », « Matricule », « Date du document », « Poste (FR) », « المنصب »).
5. Vérifiez les champs du reçu :
   - « Du » : début de la période ;
   - « Au (date de sortie) » : reprise de la sortie enregistrée ;
   - « Somme reçue (DA) » : pré-remplie (voir l'encadré ci-dessous).
6. Facultatif — bloc « Détail du solde (facultatif) » : chaque ligne comprend une désignation en français (« Désignation »), une désignation en arabe (« البيان ») et un montant. Cliquez sur « Ajouter une ligne » pour en ajouter une, sur « Retirer » pour en supprimer une.
7. Facultatif : cochez « Modifier le texte librement ».
8. Cliquez sur « Enregistrer et imprimer ».

**Comment la somme est pré-remplie**
- L'application additionne le net à payer des bulletins de l'employé pour le mois de sa date de sortie.
- S'il n'y a pas de bulletin pour ce mois, elle additionne les montants des lignes de solde de la sortie.
- Exemple : sortie le 15/09/2026, bulletin de septembre 2026 avec un net à payer de 48 500 DA : « Somme reçue (DA) » affiche 48500.00. Sans bulletin, avec deux lignes de solde de 30 000 DA et 12 000 DA, le champ affiche 42000.00.

**Résultat** — Le reçu est numéroté (compteur commun des courriers RH), imprimé et ajouté à l'historique.

**Attention**
- Vérifiez toujours la somme avant d'imprimer : elle est seulement proposée, vous pouvez la corriger.
- Le détail du solde accepte 30 lignes au maximum.

**Voir aussi** — 4.9 Établir une attestation ou un certificat de travail · 4.12 Consulter l'historique et réimprimer un courrier · Chapitre 1 Personnel (sorties) · Chapitre 3 Paie (bulletins)

---

## 4.11 Établir une mise en demeure

> **Vidéo V4.11** · durée estimée 4 min · Public : ADMIN_RH

**Où la trouver** — Ressources Humaines › Documents › Attestations › panneau « Établir un document » (`/rh/attestations`).

**À quoi ça sert** — Adresser à un employé absent une première mise en demeure, puis, si nécessaire, une deuxième et dernière mise en demeure qui rappelle la première, en français ou en arabe.

**Avant de commencer**
- [ ] Disposer du droit « Attestations & courriers ».
- [ ] Connaître l'adresse de l'employé (en français et en arabe) et le premier jour d'absence.
- [ ] Pour la deuxième mise en demeure : la première a été établie dans l'application (ses références sont alors reprises automatiquement).

**Étapes**
1. Choisissez l'employé dans « Employé ».
2. Dans « Document », choisissez « Mise en demeure (1ère) · إعذار أول » ou « Mise en demeure (2ème et dernière) · إعذار ثانٍ وأخير ».
3. Cliquez sur « Préparer ».
4. Choisissez la langue : « Français » ou « العربية ». Choisissez la civilité : « Monsieur · السيد » ou « Madame · السيدة ».
5. Vérifiez les champs communs (« Nom et prénom (FR) », « الاسم واللقب », « Matricule », « Date du document », « Poste (FR) », « المنصب »).
6. Renseignez les champs de la mise en demeure :
   - « Adresse (FR) » et « العنوان » ;
   - « Absent depuis le » : premier jour d'absence ;
   - « Délai (jours) » : délai laissé à l'employé pour reprendre ou se justifier.
   - Exemple : absent depuis le 01/10/2026, délai de 8 jours.
7. Pour la deuxième mise en demeure, vérifiez en plus « N° 1ère mise en demeure » et « Date 1ère mise en demeure ». Ces champs, ainsi que « Absent depuis le », sont repris de la dernière première mise en demeure de l'employé.
8. Facultatif : cochez « Modifier le texte librement ».
9. Cliquez sur « Enregistrer et imprimer ».

**Résultat** — La mise en demeure est numérotée, imprimée et ajoutée à l'historique, avec la langue choisie indiquée entre parenthèses (FR ou AR).

**Attention**
- Établissez toujours la première mise en demeure dans l'application : sinon les champs de rappel de la deuxième restent vides et doivent être saisis à la main.
- Changer de langue efface le texte libre déjà saisi.

**Voir aussi** — 4.12 Consulter l'historique et réimprimer un courrier · Chapitre 1 Personnel (sorties)

---

## 4.12 Consulter l'historique et réimprimer un courrier

> **Vidéo V4.12** · durée estimée 2 min · Public : ADMIN_RH

**Où la trouver** — Ressources Humaines › Documents › Attestations › tableau d'historique (`/rh/attestations`).

**À quoi ça sert** — Retrouver une attestation, un certificat, un reçu pour solde de tout compte ou une mise en demeure déjà émis, et le réimprimer en conservant **le même numéro**.

**Avant de commencer**
- [ ] Disposer du droit « Attestations & courriers ».

**Étapes**
1. Sous le panneau « Établir un document », repérez le tableau d'historique. Il affiche les 300 courriers les plus récents, du plus récent au plus ancien.
2. Tapez un numéro, un matricule ou un nom dans le champ « Rechercher… ».
3. Lisez les colonnes : « N° », « Document » (avec la langue entre parenthèses, FR ou AR), « Employé » (matricule · nom), « Établi le ».
4. Cliquez sur « Réimprimer » au bout de la ligne. La fenêtre s'ouvre avec les valeurs enregistrées et le numéro du courrier.
5. Si besoin, corrigez un champ ou la langue.
6. Cliquez sur « Enregistrer et imprimer ».

**Résultat** — Le courrier est réimprimé sous le même numéro. Aucun nouveau numéro n'est consommé.

**Attention**
- Les corrections faites lors d'une réimpression remplacent le contenu enregistré du courrier. La date de la colonne « Établi le » ne change pas.
- Les titres de congé n'apparaissent pas dans cet historique : réimprimez-les depuis le registre (fiche 4.8).
- Les courriers annulés n'apparaissent pas dans l'historique.

**Voir aussi** — 4.9 Établir une attestation ou un certificat de travail · 4.10 Établir un reçu pour solde de tout compte · 4.11 Établir une mise en demeure · 4.1 Consulter le registre des documents
