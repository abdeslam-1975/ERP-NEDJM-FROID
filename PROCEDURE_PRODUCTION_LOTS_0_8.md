# Mise en production des lots 0 à 8 — procédure à exécuter vous-même

Ce document décrit comment appliquer en production les 10 migrations des lots 0 à 8 puis déployer le code correspondant.
Toutes les commandes ci-dessous sont à lancer **par vous** : elles touchent la base de production.

> Ne collez jamais de mot de passe, de clé ou de jeton dans une conversation. Si une commande échoue, envoyez seulement le
> message d'erreur, après avoir masqué toute valeur secrète.

## Ce qui va être appliqué

`origin/main` est au commit `ef43fee`. La branche `feat/lot8-veille-juridique` y ajoute 10 commits (lots 0, 1, 2, 3a, 3b, 4,
5, 6, 7, 8) et ces 10 migrations, dans cet ordre :

| Ordre | Migration | Contenu |
|---|---|---|
| 1 | `20260930180000_lot0_decisions_notifications.sql` | Centre de décisions, notifications, plus de paie automatique (D3/D4) |
| 2 | `20261001090000_lot1_referentiel_affectations.sql` | Wilayas codées, affectations datées des contrats (D8/D13) |
| 3 | `20261002090000_lot2_versions_approbation.sql` | Versions et approbation des règles légales (D2, D16) |
| 4 | `20261003090000_lot3a_reouverture_tracabilite.sql` | Réouverture de paie (D7), versions de bulletins, chaînes (D6) |
| 5 | `20261004090000_lot3b_virements_declarations.sql` | Contrôles virements (D9) et déclarations (D10), opérations externes |
| 6 | `20261005090000_lot4_documents_juridiques.sql` | Registre des documents juridiques |
| 7 | `20261006090000_lot5_import_presences.sql` | Import des archives de présence (D5/D11/D12) |
| 8 | `20261007090000_lot6_preparation_mensuelle.sql` | Préparation mensuelle de la paie (D1), coefficients datés (D14) |
| 9 | `20261008090000_lot7_extraction_ia.sql` | Extraction IA des documents juridiques (D15) |
| 10 | `20261009090000_lot8_veille_juridique.sql` | Veille juridique |

Chaque migration est une transaction : si l'une échoue, elle est annulée entièrement, mais les migrations précédentes
restent appliquées.

### Effets sur les données existantes

Les migrations ajoutent surtout des tables, des fonctions, des écrans et des droits. Elles modifient aussi des éléments
existants :

- **Lot 0** remplace la fonction d'enregistrement des bulletins `hr_payroll_replace_slips` par une version qui exige une
  décision. Le code actuellement en production appelle l'ancienne version : **entre l'étape 5 (migrations) et l'étape 6
  (déploiement du code), la génération de paie échouera.** Les deux étapes doivent se suivre immédiatement.
- **Lot 1** ajoute deux colonnes à `hr_contracts` et crée pour chaque contrat existant une « affectation initiale » (son
  chantier à sa date de début). Il ajoute aussi une colonne wilaya à `ref_sites`.
- **Lot 2** ajoute des colonnes de traçabilité aux règles en vigueur ; les barèmes IRG existants prennent le statut
  `LEGACY` (valeur existante, non vérifiée).
- **Lot 3b** crée le dossier de stockage privé `hr-external-docs`.
- **Lot 4** crée le dossier de stockage privé `legal-documents`.
- **Lot 5** ajoute une colonne à `hr_attendance` et une règle : une présence d'origine `IMPORT` doit être liée à un lot
  d'import. Il crée le dossier de stockage privé `attendance-imports`.
- **Lot 6** recopie le coefficient actuel de chaque code de présence comme version initiale.
- **Lot 8** ajoute le type de notification `LEGAL_WATCH` et pré-remplit 5 domaines officiels et 22 mots-clés.

## Étape 0 — Avant de commencer

- [ ] Choisir un moment **hors traitement de paie**, et prévenir les utilisateurs qu'aucune paie ne doit être générée
      pendant l'opération.
- [ ] Prérequis du plan : MFA activée sur le projet Supabase hébergé (prévu avant le lot 3), conditions d'utilisation de
      Gemini acceptées (prévu avant le lot 7).
- [ ] Préparer une valeur longue et aléatoire pour `CRON_SECRET` (au moins 32 caractères). Ne la partagez avec personne.

## Étape 1 — Sauvegarde

Dans le tableau de bord Supabase, menu **Database → Backups** : vérifier qu'une sauvegarde récente existe (ou que la
restauration à un instant précis, PITR, est active).

Si votre offre ne propose pas de sauvegarde téléchargeable, faites un export depuis le dossier du projet (le mot de passe
de la base vous sera demandé) :

```powershell
cd "D:\OneDrive\Desktop\TEST APP"
npx supabase db dump --linked -f "$env:USERPROFILE\Documents\sauvegarde_prod_schema.sql"
npx supabase db dump --linked --data-only -f "$env:USERPROFILE\Documents\sauvegarde_prod_donnees.sql"
```

> Ces fichiers contiennent des données personnelles et des salaires : gardez-les hors du dépôt et hors des dossiers
> partagés.

## Étape 2 — Vérifier ce qui reste à appliquer

```powershell
cd "D:\OneDrive\Desktop\TEST APP"
git switch feat/lot8-veille-juridique
git pull
npx supabase migration list --linked
```

Résultat attendu : les 10 migrations ci-dessus ont la colonne **Remote** vide, et toutes les autres sont présentes des deux
côtés.

**Arrêtez-vous** si d'autres migrations apparaissent comme non appliquées, ou si une migration distante n'existe pas en
local, et envoyez-moi la liste.

## Étape 3 — Contrôles en lecture seule (éditeur SQL de Supabase)

Ces requêtes ne modifient rien.

```sql
-- Doit renvoyer 0 : sinon la règle du lot 5 sur les présences importées échouera.
select count(*) as presences_import_sans_lot from public.hr_attendance where source_code = 'IMPORT';

-- Doit renvoyer 0 ligne : une paie en cours de génération ne doit pas tourner pendant l'opération.
select id, period_year, period_month, status_code, updated_at
from public.hr_payroll_runs
where updated_at > now() - interval '30 minutes';

-- Pour information : dossiers de stockage déjà existants portant le même nom (ils seront remis en privé).
select id, public from storage.buckets where id in ('hr-external-docs', 'legal-documents', 'attendance-imports');
```

**Arrêtez-vous** si la première requête renvoie autre chose que 0, et envoyez-moi le nombre.

## Étape 4 — Simulation

```powershell
npx supabase db push --linked --dry-run
```

La commande liste les migrations qui seraient appliquées, sans rien exécuter. Elle doit afficher exactement les 10
migrations, dans l'ordre du tableau.

## Étape 5 — Application des migrations

```powershell
npx supabase db push --linked
```

- Succès : passez **immédiatement** à l'étape 6.
- Échec : notez le nom de la migration et le message d'erreur (sans valeur secrète), ne relancez pas, et envoyez-les moi.
  Les migrations déjà passées restent appliquées ; la génération de paie reste bloquée jusqu'à l'étape 6.

## Étape 6 — Déploiement du code

1. Dans Vercel, **Settings → Environment Variables**, environnement *Production* :
   - ajouter `CRON_SECRET` avec la valeur préparée à l'étape 0 ;
   - vérifier que `SUPABASE_SERVICE_ROLE_KEY` et `GEMINI_API_KEY` existent déjà (le code actuel les utilise).
2. Sur GitHub, ouvrir une Pull Request `feat/lot8-veille-juridique` → `main`, puis la fusionner.
3. Attendre la fin du déploiement de production dans Vercel (statut *Ready*).

## Étape 7 — Vérifications après déploiement

Connecté en SUPER_ADMIN :

- [ ] `/decisions` : le Centre de décisions s'ouvre ; traitez les demandes éventuelles.
- [ ] `/rh/paie/preparation` : le tableau du mois s'affiche.
- [ ] `/rh/legal/documents`, `/rh/legal/propositions`, `/rh/legal/extraction-ia` : les écrans s'ouvrent.
- [ ] `/rh/presence/imports` et `/rh/paie/operations-externes` : les écrans s'ouvrent.
- [ ] `/rh/legal/veille` : pas d'avertissement « cron non configuré » ; ajoutez les pages à surveiller (onglet
      *Sources*), puis cliquez sur **Vérifier maintenant**. La première lecture de chaque page sert de référence et ne
      crée pas de notification.
- [ ] Vercel, **Settings → Cron Jobs** : la tâche `/api/cron/veille` apparaît (tous les jours à 06:00 UTC, soit 07:00 à
      Alger). Après son premier passage, l'onglet *Historique* de la veille montre une vérification « planifiée ».
- [ ] Générer une paie de test sur un mois ouvert : elle passe désormais par une demande de décision (D4).

## En cas de problème grave

Il n'existe pas de migration inverse. Le retour arrière consiste à **restaurer la sauvegarde de l'étape 1 et revenir au
déploiement Vercel précédent en même temps** : l'ancien code ne fonctionne pas avec la nouvelle base, ni le nouveau code
avec l'ancienne. Avant toute restauration, envoyez-moi l'erreur rencontrée : une correction ciblée est souvent possible.

---

## ملخص بالعربية

1. اختر وقتاً خارج معالجة الأجور، وأبلغ المستخدمين بعدم توليد أي أجر أثناء العملية.
2. خذ نسخة احتياطية من قاعدة الإنتاج واحفظها خارج المستودع، لأنها تحتوي على بيانات شخصية ورواتب.
3. شغّل `npx supabase migration list --linked` وتأكد أن الهجرات العشر وحدها غير مطبّقة.
4. نفّذ استعلامات الفحص للقراءة فقط. يجب أن يكون عدد الحضور ذي المصدر `IMPORT` صفراً.
5. شغّل `npx supabase db push --linked --dry-run` ثم `npx supabase db push --linked`.
6. أضف `CRON_SECRET` في Vercel، ثم افتح Pull Request نحو `main` وادمجه فوراً. بين الخطوتين 5 و6 يتعطل توليد الأجور.
7. تحقق من الشاشات الجديدة، وأضف الصفحات المراد رصدها، واضغط «Vérifier maintenant».

إذا فشلت أي خطوة فتوقف، وأرسل لي رسالة الخطأ فقط دون أي قيمة سرية.
