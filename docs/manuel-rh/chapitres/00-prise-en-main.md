# 0 Prise en main — البداية

**Dans ce chapitre** — Vous apprenez à vous connecter à NEDJM FROID ERP, à ouvrir le module Ressources Humaines et à vous déplacer dans sa barre de sections et d'onglets. Vous apprenez aussi à adapter cette barre à votre usage (mode « Réorganiser »), à lire le tableau de bord RH, à traiter le rapport « Qualité des données » et à comprendre ce que votre rôle vous permet de faire. Le chapitre se termine par les conventions utilisées dans tout le manuel : lisez-les une fois avant les autres chapitres.

| Fonction | Vidéo | Public |
|---|---|---|
| 0.0 L'écran en un coup d'œil | V0.2 | Tous |
| 0.1 Se connecter et ouvrir le module RH | V0.1 | Tous |
| 0.2 Se repérer dans la barre RH | V0.2 | Tous |
| 0.3 Réorganiser la barre RH et créer vos sections | V0.3 | Tous |
| 0.4 Lire le tableau de bord RH | V0.4 | Tous |
| 0.5 Traiter les alertes et utiliser les actions rapides | V0.5 | ADMIN_RH, GERANT |
| 0.6 Confirmer la wilaya codée d'un chantier | V0.6 | ADMIN_RH, SUPER_ADMIN |
| 0.7 Demander une décision D13 pour un contrat ne commençant pas le 1er | V0.7 | ADMIN_RH, GERANT |
| 0.8 Ajouter la contrainte « début au 1er du mois » | V0.7 | SUPER_ADMIN |
| 0.9 Connaître votre rôle et vos droits | V0.8 | Tous |
| 0.10 Conventions du manuel | — | Tous |
| Annexe B Le mois de paie pas à pas (vue d'ensemble) | V0.9 | ADMIN_RH, GERANT, SUPER_ADMIN |

---

## 0.0 L'écran en un coup d'œil

Toutes les pages de l'application partagent la même mise en page.

**À gauche : le menu latéral.** Il regroupe les modules par groupe : « Pilotage » (« Tableau de Bord », « Simulateur », « Centre de décisions »), « Ressources Humaines », « Sites & activités », « Commercial », « Finance & Achats », « Administration » (« Utilisateurs », « Rôles & droits », « Paramètres »). Vous ne voyez que les modules ouverts pour votre rôle. En bas du menu se trouvent :
- la liste « Site actif », qui indique le chantier sur lequel vous travaillez (si un seul site vous est attribué, il est déjà choisi) ;
- les boutons « Thème » (clair ou sombre) et « Réduire » (menu réduit aux icônes) ;
- votre nom et votre rôle, suivis de l'icône « Déconnexion », qui ferme votre session.

**En haut : la barre supérieure.** Elle contient, de gauche à droite :
- dans le module RH, la **barre de sections** (« Vue d'ensemble », « Personnel », « Temps & présence »…) et, juste en dessous, la **rangée d'onglets** de la section ouverte (voir 0.2) ; dans les autres modules, le titre de la page ;
- le champ « Rechercher » (raccourci clavier Ctrl K) : tapez un mot (« Employés », « Congés », « Présence / pointage »…) pour aller directement à un écran ; un employé trouvé ouvre la liste des employés filtrée sur lui ;
- le bouton « Réorganiser » (icône de flèches en croix), qui permet de déplacer les onglets (voir 0.3) ;
- la cloche « Notifications » : un badge rouge indique le nombre de notifications non lues (« 9+ » au-delà de 9). Les notifications vous préviennent qu'une décision vous attend ou qu'une décision que vous avez demandée a été prise. Cliquez sur une notification pour ouvrir la décision. Ouvrir la liste marque tout comme lu. Aucune notification n'est envoyée par e-mail.

**Au centre : le contenu de la page.** Dans le module RH, il commence en général par un en-tête (sur-titre, titre, courte description), puis des filtres, puis des tableaux. Les tableaux ont un champ de recherche, un menu « Colonnes » pour choisir les colonnes affichées, un tri par clic sur l'en-tête de colonne et des boutons « Précédent » / « Suivant » pour changer de page.

**Langue des écrans.** Les écrans RH sont en français. L'arabe apparaît à certains endroits seulement : nom des sections en infobulle, certains titres, certains champs (ordre de mission, titre de congé, fiche employé) et certains messages d'erreur, écrits « texte français · النص العربي ».

---

## 0.1 Se connecter et ouvrir le module RH

> **Vidéo V0.1** · durée estimée 3 min · Public : Tous

**Où la trouver** — Adresse de l'application communiquée par votre administrateur › page « Connexion à l'espace de travail ». Puis menu latéral › « Ressources Humaines » (`/rh`).

**À quoi ça sert** — Ouvrir votre session de travail avec votre compte personnel, puis accéder à l'« Espace RH ». Chaque action que vous faites ensuite est enregistrée à votre nom.

**Avant de commencer**
- [ ] Votre compte a été créé par un administrateur (écran « Utilisateurs », voir chapitre 6). L'accès se fait uniquement sur invitation : la page l'indique (« Accès sur invitation uniquement »).
- [ ] Vous connaissez votre adresse e-mail de connexion et le mot de passe initial que l'administrateur vous a communiqué.
- [ ] Un rôle donnant accès au module RH vous a été attribué (voir 0.9).

**Étapes**
1. Ouvrez l'adresse de l'application dans votre navigateur. La page « Connexion à l'espace de travail » s'affiche.
2. Renseignez « Adresse e-mail » (obligatoire).
3. Renseignez « Mot de passe » (obligatoire, 8 caractères minimum). L'icône en forme d'œil affiche ou masque le mot de passe saisi.
4. Cliquez sur « Se connecter ». Le bouton affiche « Connexion… » pendant la vérification.
5. **Première connexion seulement** : la page « Changement de mot de passe obligatoire » s'affiche avec le message « Un administrateur a défini votre mot de passe initial. Vous devez en choisir un nouveau avant d'accéder à l'ERP. »
   - Renseignez « Mot de passe temporaire / actuel » (obligatoire) : le mot de passe reçu de l'administrateur.
   - Renseignez « Nouveau mot de passe (min. 10) » (obligatoire) : au moins 10 caractères, différent de l'actuel.
   - Renseignez « Confirmer le nouveau mot de passe » (obligatoire) : la même valeur.
   - Cliquez sur « Enregistrer et continuer ». Le bouton « Se déconnecter » permet d'abandonner.
6. La page d'accueil de l'application (« Tableau de Bord ») s'affiche.
7. Si vous travaillez sur plusieurs chantiers, choisissez votre chantier dans la liste « Site actif » en bas du menu latéral. Votre nom et votre rôle s'affichent juste en dessous.
8. Dans le menu latéral, groupe « Ressources Humaines », cliquez sur « Ressources Humaines ». Le tableau de bord RH s'ouvre (titre « Ressources humaines », onglet du navigateur « Espace RH »).
9. Pour quitter, cliquez sur l'icône « Déconnexion », à droite de votre nom en bas du menu latéral.

**Résultat** — Vous êtes connecté et vous voyez l'Espace RH, avec la barre de sections en haut de page. Seuls les sections, onglets et boutons autorisés pour votre rôle sont affichés.

**Attention**
- « E-mail ou mot de passe incorrect. » : vérifiez la saisie (majuscules, clavier arabe ou français). Après plusieurs échecs, demandez une réinitialisation à votre administrateur : il vous donnera un nouveau mot de passe temporaire, à changer à la connexion suivante.
- « Compte désactivé ou suspendu. Contactez un administrateur. » : votre compte a été désactivé ; seul un administrateur peut le réactiver.
- « La confirmation ne correspond pas » ou « Le nouveau mot de passe doit être différent de l'actuel » : corrigez les champs du changement de mot de passe.
- « Serveur momentanément indisponible. Réessayez dans quelques secondes. » : patientez puis cliquez de nouveau sur « Se connecter ».
- Ne partagez jamais votre compte : les décisions et validations sont tracées au nom de la personne connectée.

**Voir aussi** — 0.2 Se repérer dans la barre RH · 0.9 Connaître votre rôle et vos droits · Annexe D, messages de connexion

---

## 0.2 Se repérer dans la barre RH

> **Vidéo V0.2** · durée estimée 3 min · Public : Tous

**Où la trouver** — Ressources Humaines › barre de sections en haut de toutes les pages RH.

**À quoi ça sert** — Passer d'un écran RH à l'autre. Les écrans sont rangés en **sections** (première rangée) ; chaque section contient des **onglets** (seconde rangée).

**Avant de commencer**
- [ ] Être connecté et avoir ouvert le module « Ressources Humaines » (0.1).

**Étapes**
1. Repérez la barre de sections en haut de la page. Passez la souris sur une section : son nom arabe s'affiche en infobulle.
2. Cliquez sur une section. L'application ouvre le **premier onglet visible** de cette section.
3. Si la section contient au moins deux onglets, une seconde rangée d'onglets apparaît sous la barre. Cliquez sur l'onglet voulu.
4. Utilisez le tableau ci-dessous pour savoir où se trouve chaque écran (ordre d'origine) :

| Section | Arabe | Onglets d'origine |
|---|---|---|
| « Vue d'ensemble » | نظرة عامة | « Tableau de bord », « Qualité des données » |
| « Personnel » | العمال | « Employés », « Postes & grille », « Intérim », « Sorties » |
| « Temps & présence » | الوقت والحضور | « Présence », « Imports de présences », « Congés » |
| « Paie » | الأجور | « Préparation du mois », « Calcul de la paie », « Simulateur » (icône ↗), « Exceptions », « Avances », « Virements », « Déclarations », « Opérations externes », « Coûts » |
| « Documents » | الوثائق | « Registre », « Attestations » |
| « Juridique » | القانوني | « Cotisations & impôts », « Propositions légales », « Documents juridiques », « Extraction IA », « Veille juridique » |
| « Autres » | أخرى | vide à l'origine (section de rangement) |
| « Paramètres » | الإعدادات | « Paramètres » |

**Résultat** — L'écran choisi s'affiche ; la section et l'onglet actifs sont mis en évidence.

**Attention**
- Les **contrats de travail** et les **bulletins de paie** ne sont pas dans « Personnel » ni dans « Paie » : ils se trouvent dans « Documents » › « Registre », sur les cartes « Contrat de travail » et « Bulletin de paie ». Les anciennes adresses des contrats et des bulletins mènent automatiquement à ces cartes.
- L'onglet « Simulateur » (icône ↗) est un raccourci : il ouvre le Simulateur général de l'application, hors du module RH.
- La section « Autres » est toujours présente. Une section vide affiche l'infobulle « Vide : cliquez pour y ranger des onglets (Réorganiser) ».
- L'ordre et les noms décrits ici sont ceux d'origine. Votre administrateur peut avoir masqué, renommé ou déplacé des onglets pour votre rôle, et vous-même pouvez les réorganiser (0.3). **Si un onglet décrit dans ce manuel n'apparaît pas, demandez à votre administrateur** : un onglet masqué bloque aussi la page correspondante.

**Voir aussi** — 0.3 Réorganiser la barre RH et créer vos sections · 0.9 Connaître votre rôle et vos droits

---

## 0.3 Réorganiser la barre RH et créer vos sections

> **Vidéo V0.3** · durée estimée 4 min · Public : Tous

**Où la trouver** — Barre supérieure › bouton « Réorganiser » (icône de flèches en croix, infobulle « Réorganiser la page : déplacer les onglets, le menu et les boutons »).

**À quoi ça sert** — Adapter la barre RH à votre travail : changer l'ordre des sections et des onglets, déplacer un onglet d'une section à une autre, renommer une section, créer vos propres sections (par exemple « Mon mois de paie ») ou ranger dans « Autres » les onglets que vous utilisez peu.

**Avant de commencer**
- [ ] Aucun droit particulier n'est nécessaire pour réorganiser votre propre barre (« Pour moi »).
- [ ] Seul le SUPER_ADMIN voit le choix « Pour tout le monde », qui applique l'agencement à tous les utilisateurs.

**Étapes**
1. Cliquez sur « Réorganiser ». Un bandeau apparaît en bas de l'écran : « Réorganiser · إعادة الترتيب — faites glisser les onglets, les menus et les boutons encadrés. » Les éléments déplaçables sont encadrés.
2. SUPER_ADMIN uniquement : choisissez la portée « Pour moi » ou « Pour tout le monde ».
3. Faites glisser une section ou un onglet à sa nouvelle place. Vous pouvez déposer un onglet dans une autre section.
   - Astuce : le bouton « Listes » ouvre le panneau « Listes de la page » (« Faites glisser les lignes pour changer l'ordre. »), avec les rubriques « Menu latéral » et « Barre RH ». Il est plus pratique pour déplacer de nombreux éléments.
4. Pour **renommer** une section, cliquez sur son icône crayon (« Renommer »), tapez le nouveau nom et validez. Pour une section d'origine, effacer le nom lui rend son nom d'origine.
5. Pour **créer une section**, cliquez sur « Nouvel onglet · تبويب جديد » en fin de barre, tapez son nom et validez, puis faites-y glisser les onglets voulus. Vous pouvez créer 12 sections au maximum.
6. Pour **supprimer** une section que vous avez créée, cliquez sur son icône corbeille : ses onglets sont rangés dans « Autres ». Sur une section d'origine, la corbeille la vide de la même façon (ses onglets vont dans « Autres »), sans la supprimer.
7. Terminez par « Enregistrer · حفظ ». Si vous n'avez rien changé, le bouton affiche « Terminer ».
   - « Annuler » abandonne toutes les modifications en cours.
   - « Ordre de l'administrateur » revient à l'agencement défini par l'administrateur pour tout le monde. Pour le SUPER_ADMIN en mode « Pour tout le monde », le bouton s'appelle « Ordre d'origine » et revient à l'agencement livré avec l'application.

**Résultat** — Votre agencement est mémorisé pour votre compte et s'applique à toutes vos pages RH, sur tous vos postes de travail. Les autres utilisateurs ne sont pas concernés (sauf « Pour tout le monde »).

**Attention**
- Réorganiser ne change pas vos droits : vous ne pouvez ni afficher un onglet que l'administrateur a masqué pour votre rôle, ni ouvrir un écran que vos droits ne permettent pas.
- « 12 onglets créés au maximum. » : vous avez atteint la limite de sections personnelles ; supprimez-en une avant d'en créer une autre.
- La section « Autres » ne peut pas être supprimée.
- Le bouton « Nouvel onglet » crée une **section** de la barre (première rangée), pas un nouvel écran.
- Un utilisateur ne peut supprimer que les sections qu'il a créées ; les sections créées par le SUPER_ADMIN pour tout le monde ne sont supprimées que par lui.

**Voir aussi** — 0.2 Se repérer dans la barre RH · chapitre 6, réglage de l'interface par rôle

---

## 0.4 Lire le tableau de bord RH

> **Vidéo V0.4** · durée estimée 4 min · Public : Tous

**Où la trouver** — Ressources Humaines › Vue d'ensemble › Tableau de bord (`/rh`).

**À quoi ça sert** — Voir en un coup d'œil l'effectif, la masse salariale, la présence du jour, l'évolution des effectifs et la répartition des contrats, avant d'ouvrir les écrans détaillés. La page se consulte seulement : aucun chiffre ne s'y modifie.

**Avant de commencer**
- [ ] Avoir accès à l'onglet « Tableau de bord ».
- [ ] Les chiffres portent sur les employés, contrats et pointages que vos droits vous permettent de voir. Deux personnes de rôles différents peuvent donc voir des chiffres différents.

**Étapes**
1. Lisez l'en-tête : la date du jour, le titre « Ressources humaines » et deux boutons, « Pointage » (ouvre la page Présence) et « Nouvel employé » (ouvre une fiche employé vierge).
2. Lisez la carte **« Effectif actif »** :
   - le grand nombre = employés dont la fiche est au statut « Actif » ou « Invité » ;
   - la pastille verte ou rouge compare ce nombre aux employés actifs déjà recrutés à la fin du mois précédent. Elle mesure donc surtout les recrutements du mois en cours. Exemple : 48 employés actifs aujourd'hui, dont 45 recrutés avant la fin du mois dernier → (48 − 45) ÷ 45 = « +6,7 % » ;
   - la ligne « X inscrits · N contrats ouverts » : X = toutes les fiches employés, quel que soit leur statut ; N = contrats au statut Brouillon, Actif ou Suspendu ;
   - la petite courbe reprend l'évolution des effectifs sur 12 mois.
3. Lisez la carte **« Masse salariale »** :
   - le montant = somme des salaires de base mensuels des contrats au statut **Actif** (les brouillons et contrats suspendus ne sont pas comptés). Au-delà d'un million, il s'affiche en « M DA ». Exemple : trois contrats actifs à 60 000, 45 000 et 45 000 DA → 150 000 DA ;
   - « Couverture contractuelle » = part des employés actifs qui ont un contrat ouvert (Brouillon, Actif ou Suspendu). Exemple : 45 employés couverts sur 48 actifs → 94 % ;
   - « Salaires de base mensuels · moyenne » = masse salariale ÷ nombre de contrats actifs. Dans l'exemple : 150 000 ÷ 3 = 50 000 DA.
4. Lisez la carte **« Présence »** (cliquable, elle ouvre la page Présence) :
   - l'application prend le **dernier jour pointé** des 31 derniers jours ;
   - elle range chaque code de ce jour en quatre familles : « En mission » (code MS ou libellé commençant par « mission »), « En congé » (libellé commençant par « congé »), « Absents » (libellé commençant par « absence » ou « abandon »), « Présents » (code qui compte comme présence). Les autres codes (week-end, jour férié…) ne sont pas comptés ;
   - pourcentage = (présents + en mission) ÷ (présents + absents + en congé + en mission). Exemple : 30 présents, 6 en mission, 4 absents, 10 en congé → 36 ÷ 50 = 72 % ;
   - le texte dessous indique « 36 présents · 5 oct. » (présents et missions additionnés, puis la date du jour retenu), ou « Aucun pointage ce mois-ci ».
5. Lisez le bandeau **« Tableau de présence »** : le mois en cours, le dernier jour pointé et les quatre compteurs « Présents », « Absents », « En congé », « En mission » du même jour. Cliquez sur « Ouvrir le tableau » pour aller à la grille de présence.
6. Lisez le graphique **« Évolution des effectifs »** : pour chaque mois, le nombre d'employés différents ayant un contrat en vigueur au dernier jour du mois (aujourd'hui pour le mois en cours). Les contrats en brouillon ne sont pas comptés. Choisissez « 6 mois » ou « 12 mois » ; passez la souris sur un point pour lire le nombre exact.
7. Lisez l'anneau **« Répartition des contrats »** : les contrats ouverts (Brouillon, Actif, Suspendu) par type de contrat. Un contrat sans type apparaît sous « Non renseigné ». Passez la souris sur une part pour voir son libellé et son nombre.
8. Descendez jusqu'aux panneaux « Alertes », « Derniers recrutements » et « Actions rapides » (fiche 0.5).

**Résultat** — Vous connaissez la situation RH du jour et savez quel écran ouvrir pour agir.

**Attention**
- La carte « Présence » et le bandeau « Tableau de présence » comptent aussi les jours **proposés** et pas encore validés (par exemple les jours de mission proposés par un ordre de mission). Pour la paie, seuls les jours validés comptent (chapitre 2).
- Ces chiffres ne sont pas filtrés par le chantier choisi dans la grille de présence.
- Si la page Présence est masquée pour votre rôle, le bandeau « Tableau de présence » n'apparaît pas.
- Un message rouge en haut de la page signale un problème de chargement des données : rechargez la page ; si le message persiste, prévenez votre administrateur.

**Voir aussi** — 0.5 Traiter les alertes et utiliser les actions rapides · chapitre 2, fiche « Consulter la grille de présence » · chapitre 1, fiche « Créer un employé »

---

## 0.5 Traiter les alertes et utiliser les actions rapides

> **Vidéo V0.5** · durée estimée 3 min · Public : ADMIN_RH, GERANT

**Où la trouver** — Ressources Humaines › Vue d'ensemble › Tableau de bord › panneaux « Alertes », « Derniers recrutements » et « Actions rapides » (bas de page).

**À quoi ça sert** — Repérer les contrats à régulariser avant qu'ils ne bloquent la paie, retrouver les dernières embauches et ouvrir en un clic les écrans les plus utilisés.

**Avant de commencer**
- [ ] Avoir accès au tableau de bord RH.
- [ ] Pour corriger un contrat : avoir le droit de modifier les contrats (chapitre 1).

**Étapes**
1. Regardez le badge rouge à droite du titre « Alertes » : c'est le nombre total d'éléments à traiter.
2. Lisez chaque ligne d'alerte :
   - « Fin de contrat » : contrats actifs qui se terminent dans les 30 jours. La ligne donne le nom du salarié concerné (ou « Nom et N autre(s) ») et le délai du plus proche : « Dans N jours » ou « Aujourd'hui » ;
   - « Contrats à finaliser » : « N contrats en brouillon », mention « À finaliser » ;
   - « Employés sans contrat » : employés actifs sans contrat ouvert (le nom, ou « N employés actifs »), mention « À régulariser ».
3. Cliquez sur une ligne d'alerte. Le registre des contrats s'ouvre (Documents › Registre › carte « Contrat de travail »).
4. Traitez chaque cas : renouvelez ou clôturez le contrat qui se termine, complétez et passez au statut Actif le contrat en brouillon, créez le contrat de l'employé qui n'en a pas (chapitre 1).
5. Dans « Derniers recrutements », consultez les 4 embauches les plus récentes (nom, poste du contrat principal ou matricule, date d'embauche). Cliquez sur une ligne pour ouvrir la liste des employés filtrée sur ce matricule, ou sur « Voir tout » pour la liste complète.
6. Dans « Actions rapides », cliquez sur le raccourci voulu :
   - « Pointage » : grille de présence ;
   - « Nouvel employé » : fiche employé vierge ;
   - « Attestation » : page des attestations et courriers ;
   - « Congé » : page des congés ;
   - « Avance » : page des avances et prêts ;
   - « Documents » : registre des documents.

**Résultat** — Quand tout est régularisé, le panneau « Alertes » affiche « Tout est à jour ».

**Attention**
- Un employé actif sans contrat n'a pas de bulletin : la paie ne peut pas être calculée pour lui.
- Un contrat en brouillon **entre aussi dans la paie**. Finalisez-le avant le calcul pour éviter un bulletin basé sur des données incomplètes.
- Un raccourci dont l'écran vous est fermé n'est pas affiché.

**Voir aussi** — 0.4 Lire le tableau de bord RH · chapitre 1, fiche « Créer un contrat de travail » · chapitre 4, fiche « Établir une attestation ou un courrier »

---

## 0.6 Confirmer la wilaya codée d'un chantier

> **Vidéo V0.6** · durée estimée 3 min · Public : ADMIN_RH, SUPER_ADMIN

**Où la trouver** — Ressources Humaines › Vue d'ensemble › Qualité des données (`/rh/qualite-donnees`) › panneau « Chantiers sans wilaya codée · N ». La page est aussi accessible par la tuile « Qualité des données » des Paramètres RH.

**À quoi ça sert** — Remplacer la wilaya saisie librement sur un chantier par une wilaya officielle de la liste. La wilaya codée détermine la **zone IRG** (Sud, Extrême Sud) appliquée sur les bulletins des salariés de ce chantier. La page contrôle, et ne corrige rien d'office : « Rien n'est corrigé d'office : chaque point est confirmé ou soumis à décision. »

**Avant de commencer**
- [ ] Avoir le droit de modifier les chantiers.
- [ ] Connaître la wilaya réelle du chantier (en cas de doute, vérifiez auprès du responsable du chantier avant de confirmer).

**Étapes**
1. Ouvrez la page « Qualité des données ». Le panneau « Chantiers sans wilaya codée · N » liste les chantiers à traiter, avec trois colonnes : « Chantier » (code et nom, « (inactif) » si le chantier est désactivé), « Saisie libre actuelle », « Wilaya codée ».
2. Dans la colonne « Wilaya codée », choisissez la wilaya dans la liste « code · nom ».
   - Une wilaya peut être déjà proposée, avec la mention « Proposée d'après la saisie libre : à vérifier. » Contrôlez-la : ce n'est qu'une suggestion.
3. Cliquez sur « Confirmer » sur la ligne du chantier. Le bouton reste grisé tant qu'aucune wilaya n'est choisie.

**Résultat** — Le message « CODE : wilaya confirmée. » s'affiche (CODE = code du chantier) et la ligne disparaît du panneau. Le motif « Confirmation depuis le rapport de qualité des données » est enregistré automatiquement. La wilaya s'applique depuis l'ouverture du chantier et fixe la zone IRG de tous les mois dont la paie n'est pas encore validée. Quand tous les chantiers sont traités, le panneau affiche « Tous les chantiers ont une wilaya codée. »

**Attention**
- Les paies **brouillon** concernées ne sont pas recalculées : elles sont signalées « Données modifiées depuis le calcul » et une décision D3 (Recalcul des paies brouillon) est demandée au Centre de décisions. Si le message ajoute « Paie brouillon non signalée : … », prévenez la personne qui gère la paie pour qu'elle demande un recalcul depuis l'écran Paie.
- Les mois dont la paie est déjà validée ou clôturée ne changent pas.
- Tant que la wilaya n'est pas confirmée, l'application continue d'utiliser la saisie libre.

**Voir aussi** — 0.7 Demander une décision D13 · chapitre 5, onglet IRG de « Cotisations & impôts » · chapitre 3, fiche « Recalculer un bulletin »

---

## 0.7 Demander une décision D13 pour un contrat ne commençant pas le 1er

> **Vidéo V0.7** · durée estimée 4 min · Public : ADMIN_RH, GERANT

**Où la trouver** — Ressources Humaines › Vue d'ensemble › Qualité des données › panneau « Contrats ne commençant pas le 1er du mois · N ».

**À quoi ça sert** — Régulariser les contrats existants dont la date de début n'est pas le 1er du mois. Aujourd'hui, un nouveau contrat commence toujours le 1er ; les anciens contrats hors de cette règle doivent être soit corrigés, soit documentés comme exception, par une décision D13 (Contrat ne commençant pas le 1er).

**Avant de commencer**
- [ ] Avoir le droit de modifier les contrats sur le chantier du contrat.
- [ ] Un décideur habilité pour la décision D13 (par défaut le SUPER_ADMIN) devra trancher la demande.

**Étapes**
1. Ouvrez le panneau « Contrats ne commençant pas le 1er du mois · N ». Colonnes : « Salarié », « Chantier », « Début », « Fin », « Correction possible », « Décision ».
2. Utilisez au besoin le champ « Rechercher un salarié ou un chantier… ».
3. Lisez la colonne « Correction possible » :
   - « Oui » : la date de début pourra être ramenée au 1er du mois ;
   - « Mois traité : exception seulement » : la paie de ce mois est déjà validée ou clôturée (ou le mois est antérieur à septembre 2026) ; seule l'exception documentée sera possible.
4. Cliquez sur « Demander D13 » sur la ligne du contrat, ou sur « Demander les N décision(s) D13 » pour envoyer en une fois une demande pour tous les contrats sans demande ouverte.
5. Le décideur ouvre la demande au Centre de décisions et choisit l'une des deux options :
   - « Corriger la date de début au 1er du mois » : la date de début devient le 1er du même mois ; l'affectation et le salaire initiaux suivent. Exemple : un contrat commencé le 10/10/2026 passe au 01/10/2026 ;
   - « Marquer comme exception historique documentée » : la date reste inchangée ; la décision sert de justificatif et aucun montant ne change.

**Résultat** — Message « Demande D13 envoyée au Centre de décisions : rien n'est modifié avant la décision. » (ou « N demande(s) D13 envoyée(s) au Centre de décisions. »). Le décideur reçoit une notification. Dans la colonne « Décision », le bouton est remplacé par la pastille de statut de la demande (« En attente », « Exécutée »…) : cliquez dessus pour ouvrir la décision. Quand plus aucun contrat n'est concerné, le panneau affiche « Aucun contrat hors du 1er du mois — Parmi les contrats visibles avec vos droits. »

**Attention**
- Rien n'est modifié tant que la décision n'est pas prise.
- Une seule demande ouverte par contrat : une nouvelle demande pour le même contrat n'en crée pas une deuxième.
- La personne qui a fait la demande ne peut pas la trancher elle-même (sauf le SUPER_ADMIN).
- Si la date est corrigée, les paies brouillon concernées sont signalées pour un recalcul (décision D3, Recalcul des paies brouillon).
- « Demande non autorisée pour ce contrat. » : vous n'avez pas le droit de modifier les contrats de ce chantier.
- Le panneau ne liste que les contrats visibles avec vos droits.

**Voir aussi** — 0.8 Ajouter la contrainte « début au 1er du mois » · chapitre 6, fiche « Décider au Centre de décisions » · chapitre 1, fiche « Créer un contrat de travail »

---

## 0.8 Ajouter la contrainte « début au 1er du mois »

> **Vidéo V0.7** · durée estimée 1 min (dans la vidéo V0.7) · Public : SUPER_ADMIN

**Où la trouver** — Ressources Humaines › Vue d'ensemble › Qualité des données › panneau « Contrainte « début au 1er du mois » ».

**À quoi ça sert** — Rendre la règle définitive : une fois la contrainte ajoutée, plus aucun contrat ne peut commencer ailleurs que le 1er du mois, sauf les exceptions historiques documentées par décision D13 (Contrat ne commençant pas le 1er).

**Avant de commencer**
- [ ] Être SUPER_ADMIN.
- [ ] Toutes les demandes D13 ont été tranchées : le compteur « Contrats sans décision » est à 0.

**Étapes**
1. Lisez le panneau : « État » (« Pas encore ajoutée » ou « Active · date · auteur »), « Contrats sans décision », « Exceptions documentées ».
2. Cliquez sur « Ajouter la contrainte à la base ». Le bouton reste grisé tant que des contrats attendent une décision.
3. Confirmez dans la fenêtre « Ajouter la contrainte « début au 1er du mois » à la base ? Elle refusera ensuite tout contrat hors du 1er, sauf les exceptions historiques documentées. »

**Résultat** — Message « Contrainte ajoutée à la base. » (ou « Contrainte déjà active. »). L'« État » passe à « Active » avec la date et votre nom.

**Attention**
- La note du panneau le rappelle : « Toute nouvelle date de début hors du 1er est déjà refusée. » La contrainte ajoute une protection supplémentaire, pour tous les chantiers.
- Les autres rôles voient le panneau, sans le bouton (« Réservé au SUPER_ADMIN. »).

**Voir aussi** — 0.7 Demander une décision D13

---

## 0.9 Connaître votre rôle et vos droits

> **Vidéo V0.8** · durée estimée 4 min · Public : Tous

**Où la trouver** — Votre rôle principal est rappelé sur la page d'accueil de l'application (« Tableau de Bord », carte « Rôle principal »). Les droits se règlent dans Administration › « Rôles & droits » et « Paramètres » (chapitre 6).

**À quoi ça sert** — Comprendre pourquoi vous voyez ou non un écran ou un bouton, et savoir quoi faire quand une page vous est refusée.

**Avant de commencer**
- [ ] Être connecté.

**Comment les droits fonctionnent**
1. Chaque compte a un ou plusieurs **rôles**. Un rôle peut être attribué pour toute l'entreprise (« Global ») ou pour un chantier précis : vous ne voyez alors que les données de vos chantiers.
2. Pour chaque rôle et chaque écran, la **matrice des droits** indique six droits : L = lire, C = créer, M = modifier, S = supprimer, I = imprimer, E = exporter. Pour une décision du Centre de décisions, « M » veut dire **décider** ce type de décision.
3. Certaines actions sensibles sont en plus réservées à des rôles précis (validation et clôture de la paie, saisie des montants, décisions non délégables).
4. Le SUPER_ADMIN peut aussi **masquer** des modules et des onglets pour un rôle, ou choisir les modules et onglets d'un compte précis (« Accès par compte »). Masquer un élément n'ouvre ni ne retire aucun droit sur les données : la matrice continue de les protéger.

**Ce que chaque rôle peut faire par défaut dans le module RH**

Ces droits sont ceux livrés à l'installation. Votre SUPER_ADMIN a pu les modifier : en cas de doute, c'est la matrice des droits qui fait foi.

| Rôle | Ce qu'il peut faire en RH |
|---|---|
| SUPER_ADMIN (Super administrateur) | Tout. Il voit tous les chantiers et a toujours tous les droits. Par défaut, c'est le seul à pouvoir **décider** au Centre de décisions (D1 à D15) ; il peut déléguer ce droit, sauf pour les décisions D5 (Conflit d'un import de présences), D7 (Réouverture d'une paie) et D12 (Validation d'un import par son auteur), qui lui restent réservées. Seul à gérer la matrice des droits, l'interface par rôle, l'accès par compte, le dictionnaire des rubriques de salaire, la feuille de présence, l'extraction IA et la veille juridique. |
| ADMIN_RH (Admin RH) | Lire tous les écrans RH ; créer et modifier employés, contrats, pointage, documents et paramètres RH ; saisir les montants (rubriques, exceptions, avances) ; approuver les congés ; préparer et **valider** la paie ; préparer les virements et les exports de déclarations ; proposer des taux et documents juridiques ; créer des utilisateurs de niveau inférieur. Ne clôture pas la paie. |
| GERANT (Gérant) | Comme l'ADMIN_RH pour la saisie, les congés et la validation de la paie, et en plus **clôturer** le mois de paie. Consulte les rôles et la matrice des droits sans pouvoir les modifier. Consulte « Cotisations & impôts » sans les modifier. |
| ADMIN_FINANCE (Admin finance) | Lire les écrans RH ; modifier « Cotisations & impôts », proposer des règles légales, importer des documents juridiques ; consulter l'Intérim et les coûts de la paie ; régler le plan de comptes de la paie ; clôturer les périodes comptables. Ne valide pas la paie. |
| CHEF_CHANTIER (Chef de chantier) | Consulter et mettre à jour les employés et le **pointage** de ses chantiers ; consulter le tableau de bord RH et le registre des documents. N'a accès ni aux contrats, ni à la paie, ni aux paramètres RH (aucun montant n'est visible). |
| READ_ONLY (Lecture seule) | Consulter les écrans RH principaux, sans rien créer ni modifier. |

**Étapes quand une page vous est refusée**
1. Lisez le message affiché en haut de la page d'accueil, où l'application vous a renvoyé :
   - « Accès refusé pour votre rôle. » : votre rôle n'a pas le droit d'ouvrir cet écran ;
   - « Cette page n'est pas affichée pour votre rôle (Paramètres → Interface). » : l'écran a été masqué pour votre rôle.
2. Vérifiez que vous avez choisi le bon chantier dans « Site actif ».
3. Si vous pensez avoir besoin de cet écran pour votre travail, demandez à votre SUPER_ADMIN, en précisant l'écran (son nom dans la barre RH) et l'action voulue (lire, créer, modifier, décider).
4. Pour un refus sur un bouton (par exemple « Saisie des montants réservée à SUPER_ADMIN, ADMIN_RH et GERANT. »), demandez à une personne ayant le bon rôle de faire l'opération, ou faites ajuster vos droits.

**Résultat** — Vous savez ce que votre rôle permet, et à qui vous adresser pour obtenir un accès.

**Attention**
- **Séparation des tâches** : la personne qui demande une décision ne peut pas la trancher (sauf le SUPER_ADMIN). De même, une exception de paie est approuvée par une autre personne que celle qui l'a saisie (le Gérant et le SUPER_ADMIN peuvent approuver leurs propres saisies), et un lot de présences importé est validé par une autre personne que son auteur (sauf décision D12 contraire).
- Un droit accordé dans la matrice prend effet à la page suivante que vous ouvrez.
- Toutes les modifications de droits sont tracées dans le journal d'audit.

**Voir aussi** — chapitre 6, fiches sur les rôles, la matrice des droits et l'accès par compte · Annexe D, messages d'accès

---

## 0.10 Conventions du manuel

**Comment lire une fiche.** Chaque opération fait l'objet d'une fiche numérotée « N.k » (N = numéro du chapitre). Une fiche contient toujours, dans cet ordre :
- un encadré « Vidéo · durée estimée · Public » : le numéro de la vidéo tutorielle qui montre l'opération, sa durée et les rôles concernés ;
- **Où la trouver** : le chemin dans l'application, puis l'adresse de la page entre parenthèses ;
- **À quoi ça sert** : le but de l'opération en quelques phrases ;
- **Avant de commencer** : une liste de cases à cocher ; vérifiez chaque point avant de commencer ;
- **Étapes** : les actions à faire, dans l'ordre ;
- **Résultat** : ce qui a été créé ou modifié, et où le retrouver ;
- **Attention** : les règles, blocages, décisions nécessaires et messages d'erreur possibles ;
- **Voir aussi** : les fiches liées.

Chaque chapitre commence par une fiche « N.0 L'écran en un coup d'œil » qui décrit la mise en page des écrans du chapitre.

**Libellés entre « ».** Tout texte écrit entre guillemets « » est recopié exactement de l'écran : nom de bouton, de champ, d'onglet, de colonne, de statut ou de message. Cherchez-le tel quel à l'écran. Quand un libellé contient une partie variable, elle est indiquée en lettres : « N » pour un nombre, « MM/AAAA » pour un mois, « CODE » pour un code, « … » pour un texte qui dépend de la situation.

**Chemins.** Le signe › sépare les niveaux à parcourir : « Ressources Humaines › Paie › Calcul de la paie » signifie : menu latéral « Ressources Humaines », section « Paie », onglet « Calcul de la paie ».

**Champs obligatoires.** Dans le manuel, un champ obligatoire est signalé « (obligatoire) ». À l'écran, il est suivi d'un astérisque rouge « * ».

**Décisions Dx.** Dans l'application, aucune paie n'est générée ni recalculée automatiquement, et certaines opérations sensibles ne s'exécutent qu'après une **décision** motivée prise au Centre de décisions. Chaque type de décision porte un code de D1 à D15. Dans une fiche, la décision est écrite en entier au premier emploi, par exemple « décision D3 (Recalcul des paies brouillon) », puis seulement « D3 ». La liste complète figure en annexe A. Les plus fréquentes en RH :
- D1 (Paie d'un mois aux règles non approuvées) ;
- D2 (Date d'application d'une règle légale) ;
- D3 (Recalcul des paies brouillon) ;
- D4 (Génération de paie) ;
- D6 (Clôture des mois de reprise) ;
- D7 (Réouverture d'une paie), réservée au SUPER_ADMIN ;
- D13 (Contrat ne commençant pas le 1er).

Une décision est **définitive** : elle ne se modifie pas et ne se supprime pas. Pour changer d'avis, il faut une nouvelle demande.

**Rôles.** Les rôles sont écrits avec leur code, tel qu'il apparaît dans l'application : SUPER_ADMIN, ADMIN_RH, GERANT, ADMIN_FINANCE, CHEF_CHANTIER, READ_ONLY (voir 0.9).

**Signes utilisés.**
- [ ] : case à cocher d'une liste de vérification (« Avant de commencer », annexe B).
- › : séparateur de chemin.
- ↗ : onglet raccourci qui ouvre un écran hors du module RH (par exemple « Simulateur »).
- ◀ ▶ : boutons « Mois précédent » / « Mois suivant ».
- Point orange sur un bouton (par exemple « Valider » dans la grille de présence) : des modifications ne sont pas encore enregistrées.
- Cases en *italique gris* dans la grille de présence : jours **proposés** (par un ordre de mission, un congé ou un import), pas encore validés.

**Dates, montants et exemples.** Les dates s'écrivent JJ/MM/AAAA et les mois MM/AAAA. Les montants sont en dinars algériens (DA). Tous les noms, matricules et montants des exemples et des vidéos sont fictifs.

**Mois de reprise et mois opérationnels.** Les mois de janvier à août 2026 sont des **mois de reprise** : leur paie a été versée et déclarée hors de l'application et n'est reprise que pour l'historique. À partir de septembre 2026, les mois sont **opérationnels** : virements et déclarations se préparent dans l'application. Cette distinction revient souvent dans les chapitres 2 et 3.

**Voir aussi** — Annexe A Décisions D1–D15 · Annexe B Le mois de paie pas à pas · Annexe C Glossaire · Annexe D Messages fréquents et solutions
