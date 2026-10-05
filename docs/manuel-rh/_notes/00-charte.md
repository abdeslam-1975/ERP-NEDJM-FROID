# Charte de rédaction — Manuel d'utilisation du module Ressources Humaines (NEDJM FROID ERP)

## Livrables
- Manuel écrit : `docs/manuel-rh/chapitres/NN-titre.md` (un fichier par chapitre), en **français** (langue des écrans), titres de chapitre doublés en arabe.
- Scripts vidéo : `docs/manuel-rh/videos/NN-titre.md` (un fichier par chapitre), narration (voix off) en **arabe simple** (فصحى مبسطة), libellés des écrans cités **tels quels en français** entre « ».
- Points à vérifier (bugs, incohérences, écrans non développés, doutes) : NE PAS les mettre dans le manuel. Les ajouter à `docs/manuel-rh/_notes/points-a-verifier-NN.md`.

## Plan général (numérotation fixe)
- 0 Prise en main — البداية (accès, navigation RH, tableau de bord, qualité des données, rôles, conventions)
- 1 Personnel — العمال (employés, fiche, postes & grille, contrats, intérim, sorties)
- 2 Temps & présence — الوقت والحضور (pointage, imports, congés, ordres de mission, codes)
- 3 Paie — الأجور (préparation, calcul, validation/clôture, bulletins, exceptions, avances, virements, déclarations, opérations externes, coûts, simulateur)
- 4 Documents — الوثائق (registre, fiche de renseignements, registres contrats/bulletins, OM, titres de congé, attestations & courriers)
- 5 Juridique — القانوني (cotisations & impôts, propositions légales, documents juridiques, extraction IA, veille)
- 6 Paramètres RH & administration — الإعدادات والإدارة (paramètres RH, rubriques, listes et codes, modèles, centre de décisions, droits, accès par compte, clôture, audit)
- Annexes : A Décisions D1–D15 · B Le mois de paie pas à pas · C Glossaire · D Messages fréquents et solutions

## Gabarit d'une fiche fonction (chapitres)
Chaque fonction = une section numérotée `## N.k Titre` (verbe à l'infinitif : « Créer un employé »). Contenu, dans cet ordre :

```
## 1.3 Créer un employé

> **Vidéo V1.3** · durée estimée 4 min · Public : ADMIN_RH

**Où la trouver** — Ressources Humaines › Personnel › Employés › bouton « Nouvel employé » (`/rh/employes`).

**À quoi ça sert** — 1 à 3 phrases.

**Avant de commencer**
- [ ] prérequis 1 (données, droits)
- [ ] prérequis 2

**Étapes**
1. Cliquez sur « … ».
2. Renseignez … (champ obligatoire). Valeurs possibles : …
   - Astuce / précision éventuelle.
3. Cliquez sur « Enregistrer ».

**Résultat** — ce qui est créé / modifié, où on le retrouve, statut.

**Attention**
- règle métier, blocage, décision nécessaire, message d'erreur possible → signification et solution.

**Voir aussi** — 1.4 Modifier un contrat · 3.2 Calculer la paie
```

Règles :
- Libellés d'écran exacts entre « » (copiés des notes, ne rien inventer). Les champs obligatoires sont signalés « (obligatoire) ».
- Phrases courtes, impératif, vouvoiement. Pas d'emoji. Pas de noms de fichiers de code, pas de noms de tables SQL, pas de jargon technique (RLS, RPC, PostgREST…) : traduire en langage utilisateur (« vos droits ne le permettent pas »).
- Les décisions s'écrivent « décision D3 (Recalcul de la paie) » au premier emploi dans une fiche.
- Les formules de calcul s'expliquent avec un exemple chiffré simple.
- Chaque chapitre commence par : titre `# N Titre — العنوان`, un paragraphe « Dans ce chapitre », un tableau « Fonction | Vidéo | Public », puis une section `## N.0 L'écran en un coup d'œil` décrivant la mise en page (onglets, filtres, colonnes, boutons).
- Une fiche par opération réelle ; regrouper les micro-actions (ex. trier/filtrer) dans la fiche de consultation.

## Gabarit d'un script vidéo (fichier videos)
```
## V1.3 — Créer un employé
- **Durée cible** : 4 min · **Public** : ADMIN_RH · **Fiche du manuel** : 1.3
- **Objectif** : à la fin, le spectateur sait …
- **À préparer avant l'enregistrement** : compte ADMIN_RH, chantier « … » existant, données fictives (nom, NIN…).

| # | À l'écran (action) | Voix off (arabe) | Durée |
|---|---|---|---|
| 1 | Écran d'accueil, clic sur « Ressources Humaines » dans le menu latéral | في هذا الفيديو سنتعلم كيف نضيف عاملًا جديدًا … | 0:00–0:15 |
| … | … | … | … |

- **Texte à l'écran (incrustations)** : titres courts en français.
- **Résultat montré** : …
- **Erreurs à montrer (optionnel)** : …
```
Règles vidéo : 2 à 6 minutes par vidéo ; une vidéo = une fiche (ou deux fiches très liées) ; séquence = 10 à 30 s ; toujours commencer par « où trouver » et finir par « le résultat » + « la vidéo suivante ». Utiliser des données fictives (jamais de vraies personnes).
