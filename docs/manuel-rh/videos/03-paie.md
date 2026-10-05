# Scripts vidéo — Chapitre 3 Paie — الأجور

Données fictives communes à toutes les vidéos (ne jamais utiliser de vraies personnes) :
- Chantier « Chantier Démo Oran » (wilaya renseignée) et « Chantier Démo Sétif ».
- Salariés : « M-0042 Karim Benali » (salaire de base 45 000 DA), « M-0057 Samir Haddad », « M-0063 Nadia Rahmani ».
- Mois opérationnel : septembre 2026. Mois de reprise : juin 2026.
- Comptes de démonstration : un compte ADMIN_RH, un compte GERANT, un compte SUPER_ADMIN, un compte ADMIN_FINANCE.

---

## V3.0 — Vue d'ensemble de la paie
- **Durée cible** : 3 min · **Public** : tous les utilisateurs de la paie · **Fiche du manuel** : 3.0
- **Objectif** : à la fin, le spectateur sait où se trouvent les écrans de la paie, ce que signifient les statuts « Brouillon », « Validée », « Clôturée » et pourquoi rien n'est recalculé automatiquement.
- **À préparer avant l'enregistrement** : compte ADMIN_RH ; paie brouillon de septembre 2026 pour « Chantier Démo Oran » avec une donnée modifiée après le calcul (chip « Données modifiées depuis le calcul » visible).

| # | À l'écran (action) | Voix off (arabe) | Durée |
|---|---|---|---|
| 1 | Accueil, clic sur « Ressources Humaines » puis sur la section « Paie » de la barre d'onglets | مرحبًا بكم. في هذا الفيديو نتعرف على وحدة الأجور: أين نجدها، وكيف تسير الأجرة الشهرية من البداية إلى النهاية. | 0:00–0:20 |
| 2 | Survol des sous-onglets « Préparation du mois », « Calcul de la paie », « Simulateur », « Exceptions », « Avances » | في قسم « Paie » نجد عدة تبويبات: التحضير للشهر، وحساب الأجور، والمحاكي، والبنود الاستثنائية، والتسبيقات. | 0:20–0:40 |
| 3 | Survol de « Virements », « Déclarations », « Opérations externes », « Coûts » | ثم التحويلات البنكية، والتصريحات، والعمليات الخارجية، وأخيرًا تكاليف الأجور حسب الورشة. | 0:40–1:00 |
| 4 | Ouverture de « Calcul de la paie », zoom sur la phrase « Aucune paie n'est créée ni recalculée automatiquement… » | القاعدة الذهبية: لا يُنشأ أي أجر ولا يُعاد حسابه تلقائيًا. كل حساب يمر عبر قرار في « Centre de décisions ». | 1:00–1:20 |
| 5 | Zoom sur la barre d'état : « Paie 09/2026 · Chantier Démo Oran » et le chip « Brouillon » | الأجرة تُعدّ لكل شهر ولكل ورشة. حالتها الأولى « Brouillon » أي مسودة، ويمكن إعادة حسابها. | 1:20–1:40 |
| 6 | Incrustation des trois statuts | بعد المراجعة تصبح « Validée » أي مصادقًا عليها ومجمّدة، ثم « Clôturée » أي مغلقة نهائيًا. لا رجوع إلا بقرار إعادة الفتح D7. | 1:40–2:00 |
| 7 | Zoom sur le chip « Données modifiées depuis le calcul (1) · décision requise » | إذا تغيّرت معلومة بعد الحساب، مثل الحضور أو العقد، لا يتغير الكشف وحده. يظهر هذا التنبيه ويُفتح طلب قرار إعادة الحساب D3. | 2:00–2:20 |
| 8 | Survol du tableau : plusieurs lignes de chantiers différents | انتبهوا: الجدول يعرض كل كشوف الشهر لكل الورشات، أما أزرار شريط الحالة فتخص الورشة المختارة فقط. | 2:20–2:40 |
| 9 | Retour à l'accueil de la section « Paie » | الخلاصة: نحضّر، ثم نطلب الحساب، ثم نراجع، ثم نصادق ونغلق. في الفيديو التالي نتعلم تحضير الشهر. | 2:40–3:00 |

- **Texte à l'écran (incrustations)** : « Paie : vue d'ensemble » · « Brouillon → Validée → Clôturée » · « Aucun recalcul automatique ».
- **Résultat montré** : la carte des sous-onglets et la barre d'état d'une paie brouillon.
- **Erreurs à montrer (optionnel)** : aucune.

---

## V3.1 — Préparer le mois de paie
- **Durée cible** : 4 min · **Public** : gestionnaire de paie · **Fiche du manuel** : 3.1
- **Objectif** : à la fin, le spectateur sait lire les contrôles du mois, corriger un point bloquant et demander la génération (D4) ou la décision D1.
- **À préparer avant l'enregistrement** : compte ADMIN_RH ; septembre 2026 sans paie ; un contrat sans présence sur « Chantier Démo Oran » ; aucune règle légale en attente (prévoir aussi un second mois avec une règle en attente pour montrer D1).

| # | À l'écran (action) | Voix off (arabe) | Durée |
|---|---|---|---|
| 1 | Clic sur « Paie » puis « Préparation du mois » | في هذا الفيديو نتعلم كيف نحضّر شهر الأجور قبل إطلاق الحساب. نفتح « Paie » ثم « Préparation du mois ». | 0:00–0:20 |
| 2 | Zoom sur le titre « Préparation — septembre 2026 » et la description | هذه الشاشة للمراقبة فقط، لا تحسب شيئًا. إطلاق الأجرة يتم دائمًا عبر قرار. | 0:20–0:40 |
| 3 | Choix du « Mois » 2026-09 et du « Chantier » « Chantier Démo Oran » | نختار الشهر، ثم الورشة إن أردنا. يمكن أيضًا اختيار « Tous les chantiers ». | 0:40–1:00 |
| 4 | Zoom sur le chip « Mois opérationnel » | هذا الرمز يبين أن الشهر تشغيلي. الأشهر من جانفي إلى أوت 2026 تظهر كأشهر استرجاع. | 1:00–1:20 |
| 5 | Zoom sur l'alerte « Aucun blocage : la génération peut être demandée (décision D4). » | هذه الرسالة تدلنا على الطريق: لا يوجد مانع، ويمكن طلب التوليد بالقرار D4. | 1:20–1:40 |
| 6 | Défilement du bloc « Contrôles du mois », niveaux « Conforme », « À vérifier », « Bloquant » | ننزل إلى « Contrôles du mois ». لكل نقطة مستوى: مطابق، أو معلومة، أو يجب التحقق، أو مانع. | 1:40–2:00 |
| 7 | Pointage du contrôle « Contrats sans présence » au niveau « À vérifier » | هنا عقد بدون حضور هذا الشهر. هذا العامل لن يكون له كشف إذا لم نصحح الحضور. | 2:00–2:20 |
| 8 | Clic sur « Ouvrir » : l'écran de pointage s'ouvre | نضغط على « Ouvrir » فتُفتح الشاشة المعنية مباشرة. نصحح ثم نعود إلى التحضير. | 2:20–2:40 |
| 9 | Retour, survol des panneaux « Règles en attente (bloquent la paie réelle) » et « Décisions ouvertes pour ce mois » | نراجع أيضًا القواعد المنتظرة والقرارات المفتوحة لهذا الشهر. | 2:40–3:00 |
| 10 | Clic sur « Demander la génération (D4) » | كل شيء جاهز. نضغط على « Demander la génération (D4) ». | 3:00–3:20 |
| 11 | La page de la décision s'ouvre au Centre de décisions | يُنشأ طلب قرار ويُبلَّغ المقررون. لم يُحسب أي كشف بعد. | 3:20–3:40 |
| 12 | Incrustation du résumé | النتيجة: طلب D4 مفتوح. في الفيديو التالي نطلب التوليد أو إعادة الحساب من شاشة الأجور. | 3:40–4:00 |

- **Texte à l'écran (incrustations)** : « Lecture seule » · « Ouvrir = corriger à la source » · « D4 = génération ».
- **Résultat montré** : la décision D4 créée au Centre de décisions.
- **Erreurs à montrer (optionnel)** : sur le mois avec règle en attente, l'alerte « Règles en attente : la génération réelle est bloquée. Demandez la décision D1 (attendre ou simulation non validable). » et le bouton « Demander la décision D1 ».

---

## V3.2 — Demander la génération ou un recalcul de la paie
- **Durée cible** : 4 min · **Public** : gestionnaire de paie · **Fiche du manuel** : 3.2
- **Objectif** : à la fin, le spectateur sait demander la génération (D4) ou le recalcul (D3) depuis l'écran Paie, et traiter le cas d'un salarié sans bulletin.
- **À préparer avant l'enregistrement** : compte ADMIN_RH ; « Chantier Démo Sétif » sans paie en septembre 2026 ; « Chantier Démo Oran » avec paie brouillon ; « M-0063 Nadia Rahmani » sans bulletin.

| # | À l'écran (action) | Voix off (arabe) | Durée |
|---|---|---|---|
| 1 | Clic sur « Paie » puis « Calcul de la paie » | في هذا الفيديو نطلب توليد الأجرة أو إعادة حسابها من شاشة « Calcul de la paie ». | 0:00–0:20 |
| 2 | Barre de période : choix de « Chantier Démo Sétif », « Année » 2026, « Mois » 09 | في شريط الفترة نختار الورشة والسنة والشهر. | 0:20–0:40 |
| 3 | Clic sur « Voir ce mois » | ثم نضغط على « Voir ce mois ». هذا الزر يعمل فقط عند تغيير الفترة. | 0:40–1:00 |
| 4 | Zoom sur « Pas encore générée pour ce chantier. » | لا توجد أجرة لهذه الورشة بعد. | 1:00–1:20 |
| 5 | Survol du bouton « Demander la génération » (infobulle visible) | الزر « Demander la génération » يفتح قرار التوليد D4 في مركز القرارات. | 1:20–1:40 |
| 6 | Clic : la page de décision s'ouvre | نضغط، فتُفتح صفحة القرار مباشرة. شخص آخر مخوّل سيقرر. | 1:40–2:00 |
| 7 | Retour, choix de « Chantier Démo Oran », « Voir ce mois » ; le bouton devient « Demander un recalcul » | الآن ورشة لها أجرة في حالة مسودة. الزر يصبح « Demander un recalcul ». | 2:00–2:20 |
| 8 | Clic sur « Demander un recalcul » | إعادة الحساب من هنا تشمل كل أجرة الورشة لهذا الشهر، عبر القرار D3. | 2:20–2:40 |
| 9 | Notification visible « Recalcul demandé depuis l'écran Paie… » | يصل إشعار للمقررين: لم يُعد أي حساب بعد، القرار مطلوب. | 2:40–3:00 |
| 10 | Recherche « Rahmani » dans « Rechercher un employé (matricule, nom, NSS)… » | حالة خاصة: نبحث عن عاملة ليس لها كشف هذا الشهر. | 3:00–3:20 |
| 11 | Alerte « Pas encore de bulletin pour 09/2026 : » et bouton « Demander la paie Chantier Démo Oran 09/2026 » | يظهر تنبيه مع زر لطلب أجرتها. إذا لم يكن لها عقد رئيسي، يظهر رابط « Contrats » لإنشائه أولًا. | 3:20–3:40 |
| 12 | Incrustation du résumé | النتيجة: طلب قرار مفتوح، ولا مبلغ تغيّر بعد. في الفيديو التالي نتعلم كيف نتخذ القرار. | 3:40–4:00 |

- **Texte à l'écran (incrustations)** : « Pas de paie → D4 » · « Paie brouillon → D3 » · « Rien ne change avant la décision ».
- **Résultat montré** : une demande D4 et une demande D3 ouvertes.
- **Erreurs à montrer (optionnel)** : sur une paie validée, le bouton grisé et le message « Paie validée : aucun recalcul possible sans réouverture. »

---

## V3.3 — Décider la génération, le recalcul ou la simulation
- **Durée cible** : 5 min · **Public** : décideur habilité · **Fiche du manuel** : 3.3
- **Objectif** : à la fin, le spectateur sait trancher une décision D4, D3 ou D1 et lire le résultat du calcul.
- **À préparer avant l'enregistrement** : compte GERANT (qui n'est pas l'auteur des demandes) ; une demande D4 pour « Chantier Démo Sétif » ; une demande D3 pour « Chantier Démo Oran » ; un mois avec une demande D1.

| # | À l'écran (action) | Voix off (arabe) | Durée |
|---|---|---|---|
| 1 | Clic sur une notification de décision, ouverture de la page de décision D4 | في هذا الفيديو نتخذ قرار الأجرة في « Centre de décisions ». نفتح الطلب من الإشعار. | 0:00–0:20 |
| 2 | Zoom sur les faits « Période », « Chantier », « Origine », « Classe », « Pointages validés du mois » | نقرأ أولًا المعلومات: الفترة، والورشة، ومصدر الطلب، وعدد أيام الحضور المصادق عليها. | 0:20–0:40 |
| 3 | Zoom sur le bloc « Votre décision » et ses deux options | في « Votre décision » نجد خيارين: « Générer la paie du mois » أو « Ne pas générer ». | 0:40–1:00 |
| 4 | Sélection de « Générer la paie du mois » | نختار التوليد. تُحسب الأجرة كمسودة بالقواعد السارية في أول الشهر. | 1:00–1:20 |
| 5 | Saisie dans « Justification (obligatoire, tracée) » : « Pointage de septembre validé, génération de la paie. » | نكتب تبريرًا واضحًا من عشرة أحرف على الأقل. هذا التبرير يبقى محفوظًا. | 1:20–1:40 |
| 6 | Zoom sur « La décision est définitive : elle ne peut être ni modifiée ni supprimée. » | انتبهوا: القرار نهائي، لا يُعدَّل ولا يُحذف. | 1:40–2:00 |
| 7 | Clic sur « Décider et exécuter » | نضغط على « Décider et exécuter ». | 2:00–2:20 |
| 8 | Message « Décision enregistrée et exécutée : 12 bulletin(s) calculé(s). » et avertissements | تظهر رسالة بعدد الكشوف المحسوبة، مع تنبيهات يجب قراءتها، مثل رقم ضمان ناقص. | 2:20–2:40 |
| 9 | Ouverture de la demande D3, options « Recalculer les bulletins concernés » / « Conserver les bulletins tels quels » | الآن قرار إعادة الحساب D3. إما نعيد حساب الكشوف المعنية، أو نحتفظ بها كما هي. | 2:40–3:00 |
| 10 | Sélection de « Recalculer les bulletins concernés », justification, « Décider et exécuter » | نختار إعادة الحساب، نكتب التبرير ونضغط. تختفي إشارة « Données modifiées depuis le calcul ». | 3:00–3:20 |
| 11 | Ouverture d'une demande D1, options « Attendre l'approbation des règles » / « Calculer une simulation non validable » | في القرار D1 توجد قواعد غير مصادق عليها. يمكن الانتظار أو حساب محاكاة غير قابلة للمصادقة. | 3:20–3:40 |
| 12 | Sélection de la simulation, message « … Aucun bulletin créé. » | المحاكاة لا تُنشئ أي كشف حقيقي، ويمكن تصديرها إلى Excel من شاشة التحضير. | 3:40–4:00 |
| 13 | Exemple de message « Les données ont changé depuis l'affichage : la demande a été mise à jour… » | إذا تغيّرت البيانات أثناء القراءة، يُحدَّث الطلب ويجب إعادة قراءته قبل القرار. | 4:00–4:20 |
| 14 | Zoom sur « Séparation des tâches : vous êtes à l'origine de cette demande… » (compte ADMIN_RH) | ومن طلب القرار لا يمكنه أن يقرر بنفسه، إلا المدير العام للنظام SUPER_ADMIN. | 4:20–4:40 |
| 15 | Retour à l'écran Paie : bulletins brouillon visibles | النتيجة: الأجرة محسوبة كمسودة. في الفيديو التالي نراجع الكشوف. | 4:40–5:00 |

- **Texte à l'écran (incrustations)** : « D4 = générer » · « D3 = recalculer ou conserver » · « D1 = attendre ou simuler » · « Décision définitive ».
- **Résultat montré** : paie brouillon calculée, signal de modification soldé.
- **Erreurs à montrer (optionnel)** : « Justification obligatoire (10 caractères minimum). »

---

## V3.4 — Consulter la paie du mois (Fiches, Social, Fiscal)
- **Durée cible** : 4 min · **Public** : gestionnaire de paie · **Fiche du manuel** : 3.4
- **Objectif** : à la fin, le spectateur sait contrôler les bulletins du mois dans les trois vues et retrouver un salarié.
- **À préparer avant l'enregistrement** : compte ADMIN_RH ; paie brouillon de septembre 2026 sur deux chantiers ; un salarié sans NSS.

| # | À l'écran (action) | Voix off (arabe) | Durée |
|---|---|---|---|
| 1 | « Paie » › « Calcul de la paie », période 09/2026, « Voir ce mois » | في هذا الفيديو نراجع كشوف الشهر. نفتح « Calcul de la paie » ونختار الفترة. | 0:00–0:20 |
| 2 | Zoom sur la barre d'état : « Brouillon », « 12 bulletin(s) » | شريط الحالة يبين حالة الأجرة وعدد الكشوف للورشة المختارة. | 0:20–0:40 |
| 3 | Vue « Fiches » : colonnes « Employé », « Jours », « Net » | العرض « Fiches » يبين لكل عامل عدد الأيام والصافي. | 0:40–1:00 |
| 4 | Défilement horizontal des colonnes de rubriques groupées par classe | ثم عمود لكل بند مستعمل، مرتبة حسب الصنف، مع الرمز والوحدة، وأخيرًا عمود الحالة. | 1:00–1:20 |
| 5 | Clic sur le raccourci « Social » | العرض « Social » مخصص للاشتراكات الاجتماعية. | 1:20–1:40 |
| 6 | Zoom sur « SS salarié », « SS employeur », « CACOBATPH », « Intemp. sal. » | نرى حصة العامل وحصة المستخدم في الضمان الاجتماعي، وصندوق العطل والبطالة الجوية إن وُجد. | 1:40–2:00 |
| 7 | Zoom sur la mention « NSS manquant » | هذه الإشارة تعني أن رقم الضمان الاجتماعي ناقص. يجب إكماله قبل التصريح. | 2:00–2:20 |
| 8 | Clic sur « Fiscal » : colonnes « Base IRG », « IRG » | العرض « Fiscal » يبين وعاء الضريبة على الدخل ومبلغها لكل عامل. | 2:20–2:40 |
| 9 | Retour à « Fiches », saisie « Benali » dans la recherche, compteur « 1 / 12 bulletin(s) » | للبحث عن عامل نكتب رقمه أو اسمه أو رقم ضمانه. العداد يبين النتائج. | 2:40–3:00 |
| 10 | Pointage d'une ligne d'un autre chantier dans le tableau | تذكير: الجدول يعرض كل ورشات الشهر، ولكل سطر حالته الخاصة. | 3:00–3:20 |
| 11 | Survol des actions de ligne « Bulletin de Paie », « Imprimer », « Traçabilité » ; boutons « Précédent » / « Suivant » | في كل سطر أزرار للعرض والطباعة والتتبع. والجدول يعرض أربعين كشفًا في كل صفحة. | 3:20–3:40 |
| 12 | Incrustation du résumé | النتيجة: راجعنا الكشوف دون تغيير أي شيء. في الفيديو التالي نعرض الكشف ونطبعه. | 3:40–4:00 |

- **Texte à l'écran (incrustations)** : « Fiches = rubriques » · « Social = CNAS » · « Fiscal = IRG ».
- **Résultat montré** : les trois vues et la recherche.
- **Erreurs à montrer (optionnel)** : « Aucun bulletin ne correspond à « … ». »

---

## V3.5 — Afficher et imprimer les bulletins depuis l'écran Paie
- **Durée cible** : 3 min · **Public** : gestionnaire de paie · **Fiche du manuel** : 3.5
- **Objectif** : à la fin, le spectateur sait afficher, imprimer un bulletin ou une page de bulletins, et ouvrir le PDF archivé.
- **À préparer avant l'enregistrement** : compte ADMIN_RH ; paie de septembre 2026 avec au moins un chantier validé.

| # | À l'écran (action) | Voix off (arabe) | Durée |
|---|---|---|---|
| 1 | « Paie » › « Calcul de la paie », période 09/2026 | في هذا الفيديو نعرض كشف الأجر ونطبعه من شاشة الأجور. | 0:00–0:20 |
| 2 | Clic sur « Bulletin de Paie » dans la ligne « M-0042 Karim Benali » | نضغط على « Bulletin de Paie » في سطر العامل. | 0:20–0:40 |
| 3 | Aperçu : zoom sur l'en-tête employeur et salarié | يظهر الكشف كما سيُطبع: معلومات المستخدم والعامل. | 0:40–1:00 |
| 4 | Zoom sur les colonnes Nbr, Base, Taux, Gain, Retenue et la ligne « SALAIRE DE BASE » | الأعمدة: العدد، والأساس، والنسبة، والربح، والاقتطاع. في سطر الأجر الأساسي، العدد هو الأيام المدفوعة دون أيام الاسترجاع. | 1:00–1:20 |
| 5 | Zoom sur les totaux, charges et explication IRG | في الأسفل المجاميع، والأعباء، وشرح حساب الضريبة على الدخل. | 1:20–1:40 |
| 6 | Clic sur « Imprimer / PDF », fenêtre d'impression du navigateur | نضغط على « Imprimer / PDF » للطباعة أو للحفظ كملف PDF. | 1:40–2:00 |
| 7 | Fermeture, clic sur « Imprimer les bulletins » dans la barre de période | لطباعة عدة كشوف نستعمل « Imprimer les bulletins ». يشمل الصفحة المعروضة فقط، أي أربعين كشفًا على الأكثر. | 2:00–2:20 |
| 8 | Sur une ligne validée, clic sur « PDF archivé » | للكشف المصادق عليه، الزر « PDF archivé » يفتح النسخة المجمدة المحفوظة عند المصادقة. | 2:20–2:40 |
| 9 | Incrustation du résumé | النتيجة: كشف معروض ومطبوع. في الفيديو التالي نفهم كيف يُحسب الكشف. | 2:40–3:00 |

- **Texte à l'écran (incrustations)** : « Une page = 40 bulletins » · « PDF archivé = version figée ».
- **Résultat montré** : un bulletin imprimé en PDF.
- **Erreurs à montrer (optionnel)** : aucune.

---

## V3.6 — Comprendre le calcul du bulletin
- **Durée cible** : 6 min · **Public** : tous les utilisateurs de la paie · **Fiche du manuel** : 3.6
- **Objectif** : à la fin, le spectateur sait expliquer l'ordre du calcul (jours, salaire de base, rubriques, récupération, retenues, cotisations, IRG, net, avance) sur l'exemple de M. Benali.
- **À préparer avant l'enregistrement** : bulletin brouillon de septembre 2026 de « M-0042 Karim Benali » conforme à l'exemple de la fiche 3.6 (22 jours de présence, 4 jours « CRP », 4 jours de repos payés ; rubriques d'exemple ; avance de 15 000 DA à 5 000 DA par mois) ; barème IRG de l'exemple ; incrustations des calculs préparées.

| # | À l'écran (action) | Voix off (arabe) | Durée |
|---|---|---|---|
| 1 | Aperçu « Bulletin de Paie » de Karim Benali | في هذا الفيديو نفهم كيف يُحسب كشف الأجر، خطوة بخطوة، بمثال العامل كريم بن علي لشهر سبتمبر 2026. | 0:00–0:20 |
| 2 | Pointage du mois à côté : 22 « P », 4 « CRP », 4 jours de repos | الخطوة الأولى: الأيام. الشهر ثلاثون يومًا، كلها مدفوعة: اثنان وعشرون يوم حضور، وأربعة أيام استرجاع، وأربعة أيام راحة. | 0:20–0:40 |
| 3 | Incrustation : jours payés 30, CRP 4, payés hors récupération 26, travaillés 22 | الأيام المدفوعة ثلاثون. دون أيام الاسترجاع تبقى ستة وعشرون. والأيام المعمولة فعلًا اثنان وعشرون. | 0:40–1:00 |
| 4 | Zoom sur la ligne « SALAIRE DE BASE » : Nbr 26, Base 45 000, Taux 1 500 | الأجر الأساسي يساوي الأجر الشهري مقسومًا على أيام الشهر، مضروبًا في الأيام المدفوعة دون الاسترجاع: خمسة وأربعون ألفًا على ثلاثين، ضرب ستة وعشرين، أي تسعة وثلاثون ألف دينار. | 1:00–1:20 |
| 5 | Incrustation : « Mois complet payé = salaire entier » | ملاحظة: الشهر الكامل المدفوع يعطي الأجر كاملًا سواء كان الشهر ثمانية وعشرين أو واحدًا وثلاثين يومًا. وكل يوم غير مدفوع ينقص جزءًا من ثلاثين. | 1:20–1:40 |
| 6 | Zoom sur « Prime de rendement » 3 000 et « Indemnité de nuisance » 4 500 | البنود الثابتة: « Montant /F » مبلغ ثابت للشهر، و« Pourcentage *% » نسبة من الأجر الشهري. أيام الاسترجاع لا تنقص منهما. | 1:40–2:00 |
| 7 | Zoom sur « Indemnité de transport » 2 600 et « Prime de panier » 6 600 | البنود اليومية: « Journalier *J » على الأيام المدفوعة دون الاسترجاع، و« Journalier présence » على أيام الحضور فقط. | 2:00–2:20 |
| 8 | Zoom sur « Indemnité de zone » 2 200 | والبند « Mensuel ÷ jours du mois »: ثلاثة آلاف على ثلاثين، ضرب اثنين وعشرين يوم عمل، أي ألفان ومئتا دينار. | 2:20–2:40 |
| 9 | Incrustation heures supplémentaires : 45 000 ÷ 173,33 = 259,62 ; 8 h × 259,62 × 1,5 = 3 115,44 | للساعات الإضافية: سعر الساعة هو الأجر الشهري على مئة وثلاث وسبعين ساعة وثلث، مضروبًا في نسبة الزيادة. كريم ليس له ساعات إضافية هذا الشهر. | 2:40–3:00 |
| 10 | Zoom sur « Indemnité de récupération (récupération) » 3 000 | بنود الاسترجاع تُدفع فقط عن أيام « CRP »: سبعمئة وخمسون دينارًا ضرب أربعة أيام، أي ثلاثة آلاف. | 3:00–3:20 |
| 11 | Incrustation « Pas de double paiement » | إذا كان البند نفسه مدفوعًا كاملًا كمبلغ ثابت أو نسبة، فلا يُضاف مرة ثانية للاسترجاع. وبند « Remboursement » يُحسب مثل التعويض تمامًا. | 3:20–3:40 |
| 12 | Zoom sur « Retenue de garantie » − 7 800 | الاقتطاعات من الصنف الخامس تُحسب بالتناسب مثل الأجر الأساسي: تسعة آلاف على ثلاثين ضرب ستة وعشرين، أي سبعة آلاف وثمانمئة. | 3:40–4:00 |
| 13 | Incrustation : brut cotisable 51 700, CNAS salarié 9 % = 4 653 | الخاضع للاشتراك هو أصناف واحد واثنان: واحد وخمسون ألفًا وسبعمئة. حصة العامل في الضمان الاجتماعي تسعة بالمئة: أربعة آلاف وستمئة وثلاثة وخمسون. | 4:00–4:20 |
| 14 | Incrustation : base IRG 47 047, IRG 5 002,69 | وعاء الضريبة هو الخاضع للضريبة ناقص حصة الضمان: سبعة وأربعون ألفًا وسبعة وأربعون. حسب السلم في هذا المثال، الضريبة خمسة آلاف واثنان دينار وتسعة وستون سنتيمًا. | 4:20–4:40 |
| 15 | Incrustation : net = 60 900 − 7 800 − 4 653 − 5 002,69 = 43 444,31 | الصافي هو مجموع الأرباح ناقص الاقتطاعات وحصة الضمان والضريبة: ثلاثة وأربعون ألفًا وأربعمئة وأربعة وأربعون دينارًا. | 4:40–5:00 |
| 16 | Zoom sur « Retenue avance » − 5 000, « Net à payer » 38 444,31 | وأخيرًا التسبيق يُقتطع بعد الضريبة، دون أن يصبح الصافي سالبًا. الصافي للدفع: ثمانية وثلاثون ألفًا وأربعمئة وأربعة وأربعون. | 5:00–5:20 |
| 17 | Modification fictive du contrat, retour au bulletin : montants inchangés, note « Données modifiées depuis le calcul » | مهم جدًا: الكشف المحسوب لا يتغير وحده إذا غيّرنا قاعدة أو معلومة. تظهر فقط إشارة « Données modifiées depuis le calcul ». | 5:20–5:40 |
| 18 | Pointage du bouton « Recalculer » (Documents) et « Demander un recalcul » (Paie) | لتطبيق التغيير نستعمل « Recalculer » أو « Demander un recalcul ». في الفيديو التالي نرى تتبع مصدر كل مبلغ. | 5:40–6:00 |

- **Texte à l'écran (incrustations)** : « 1. Jours » · « 2. Salaire de base = base ÷ jours du mois × jours payés hors CRP » · « 3. Rubriques par mode » · « 4. Récupération (CRP) » · « 5. Retenues classe 5 » · « 6. CNAS » · « 7. IRG » · « 8. Net » · « 9. Avance » · « Pas de mise à jour automatique : Recalculer ».
- **Résultat montré** : le bulletin de M. Benali expliqué ligne par ligne, net à payer 38 444,31 DA.
- **Erreurs à montrer (optionnel)** : aucune.

---

## V3.7 — Consulter la traçabilité d'un bulletin
- **Durée cible** : 3 min · **Public** : gestionnaire de paie · **Fiche du manuel** : 3.7
- **Objectif** : à la fin, le spectateur sait retrouver la décision, le contrat, l'affectation, la version de salaire et les règles qui ont servi à un bulletin.
- **À préparer avant l'enregistrement** : compte ADMIN_RH ; bulletin de « M-0042 Karim Benali » calculé avec au moins une règle non vérifiée (icône d'alerte visible).

| # | À l'écran (action) | Voix off (arabe) | Durée |
|---|---|---|---|
| 1 | « Paie » › « Calcul de la paie », ligne de Karim Benali | في هذا الفيديو نتتبع مصدر كل مبلغ في الكشف. نفتح شاشة الأجور ونجد سطر العامل. | 0:00–0:20 |
| 2 | Zoom sur l'icône d'alerte de « Traçabilité » | هذه العلامة تعني أن قواعد غير مُتحقق منها استُعملت في الحساب. | 0:20–0:40 |
| 3 | Clic sur « Traçabilité », fenêtre « Traçabilité du bulletin » | نضغط على « Traçabilité » فتُفتح نافذة التتبع. | 0:40–1:00 |
| 4 | Zoom sur « Décision de paie (D4 / D3) » | أولًا القرار الذي حسب هذا الكشف، مع رابط إليه. | 1:00–1:20 |
| 5 | Zoom sur « Contrat », « Affectation du mois », « Version de salaire » | ثم العقد، والورشة المعتمدة لهذا الشهر، ونسخة الأجر المستعملة. | 1:20–1:40 |
| 6 | Zoom sur le tableau « Règle », « Version », « Statut », « Décision D2 » | ثم جدول القواعد القانونية: نسب الضمان، وسلم الضريبة، مع النسخة والحالة والقرار D2. | 1:40–2:00 |
| 7 | Zoom sur l'avertissement et le lien « Cotisations & impôts » | إذا كانت قاعدة غير متحقق منها، نضغط على « Cotisations & impôts » لطلب المصادقة عليها. | 2:00–2:20 |
| 8 | Fermeture de la fenêtre | هذه النافذة للقراءة فقط ولا تغيّر شيئًا. | 2:20–2:40 |
| 9 | Incrustation du résumé | النتيجة: لكل كشف تبرير كامل. في الفيديو التالي نصادق على الأجرة. | 2:40–3:00 |

- **Texte à l'écran (incrustations)** : « Qui a décidé ? Quel contrat ? Quelles règles ? ».
- **Résultat montré** : la fenêtre « Traçabilité du bulletin » complète.
- **Erreurs à montrer (optionnel)** : aucune.

---

## V3.8 — Valider la paie
- **Durée cible** : 4 min · **Public** : ADMIN_RH, GERANT, SUPER_ADMIN · **Fiche du manuel** : 3.8
- **Objectif** : à la fin, le spectateur sait vérifier les conditions et valider la paie d'un chantier.
- **À préparer avant l'enregistrement** : compte ADMIN_RH ; paie brouillon de septembre 2026 « Chantier Démo Oran » prête ; une seconde paie avec des jours « proposés » non validés pour montrer l'erreur ; tous les mois de reprise clôturés (ou D6 tranchée).

| # | À l'écran (action) | Voix off (arabe) | Durée |
|---|---|---|---|
| 1 | « Paie » › « Calcul de la paie », « Chantier Démo Oran », 09/2026 | في هذا الفيديو نصادق على أجرة ورشة لشهر معين. | 0:00–0:20 |
| 2 | Incrustation de la liste de contrôle | قبل المصادقة نتأكد: الأجرة مسودة، فيها كشوف، لا تغييرات بعد الحساب، ولا أيام مقترحة غير مصادق عليها. | 0:20–0:40 |
| 3 | Zoom sur la barre d'état : « Brouillon », pas de chip d'alerte | شريط الحالة لا يحمل أي تنبيه. هذا جيد. | 0:40–1:00 |
| 4 | Exemple sur une autre paie : chip « Données modifiées depuis le calcul… », bouton « Valider la paie » grisé | لو ظهرت إشارة التغيير، يكون زر المصادقة معطلًا حتى يُتخذ قرار إعادة الحساب D3. | 1:00–1:20 |
| 5 | Retour sur « Chantier Démo Oran », clic sur « Valider la paie » | نعود إلى ورشتنا ونضغط على « Valider la paie ». المصادقة فورية. | 1:20–1:40 |
| 6 | Message « Paie validée : bulletins et pointage du mois figés… » | تظهر رسالة: الكشوف والحضور مجمدة، ولا تُعاد إلا بقرار D7 من SUPER_ADMIN. | 1:40–2:00 |
| 7 | Zoom sur « 12 bulletin(s) archivé(s) en PDF. » | وتُحفظ الكشوف كملفات PDF ثابتة. | 2:00–2:20 |
| 8 | Zoom sur le chip « Validée » et les statuts des lignes | الحالة أصبحت « Validée » لكل كشوف هذه الورشة. | 2:20–2:40 |
| 9 | Clic sur « PDF archivé » d'une ligne | زر « PDF archivé » يفتح النسخة المحفوظة. | 2:40–3:00 |
| 10 | Ouverture du pointage du mois : saisie bloquée | حضور هذا الشهر لم يعد قابلًا للتعديل. | 3:00–3:20 |
| 11 | Exemple d'erreur : « 2 jour(s) proposé(s) (ordres de mission) non validé(s) dans le pointage. » | وإذا بقيت أيام مقترحة من أوامر المهمة، تُرفض المصادقة. نصححها في الحضور أولًا. | 3:20–3:40 |
| 12 | Incrustation du résumé | النتيجة: الأجرة مصادق عليها. في الفيديو التالي نرى حالة أشهر الاسترجاع المفتوحة والقرار D6. | 3:40–4:00 |

- **Texte à l'écran (incrustations)** : « Valider = figer bulletins + pointage » · « PDF archivés ».
- **Résultat montré** : paie au statut « Validée » avec PDF archivés.
- **Erreurs à montrer (optionnel)** : « Aucun bulletin à valider : générez la paie d'abord. »

---

## V3.9 — Demander la décision D6 (mois de reprise ouverts)
- **Durée cible** : 3 min · **Public** : ADMIN_RH, GERANT, SUPER_ADMIN · **Fiche du manuel** : 3.9
- **Objectif** : à la fin, le spectateur sait pourquoi la validation exige la décision D6 et comment la demander.
- **À préparer avant l'enregistrement** : compte ADMIN_RH ; juin 2026 encore ouvert ; paie brouillon de septembre 2026 prête ; un compte GERANT pour trancher.

| # | À l'écran (action) | Voix off (arabe) | Durée |
|---|---|---|---|
| 1 | « Paie » › « Calcul de la paie », 09/2026 | في هذا الفيديو نتعامل مع حالة خاصة: أشهر الاسترجاع ما زالت مفتوحة. | 0:00–0:20 |
| 2 | Zoom sur le chip « Validation soumise à décision D6 (mois de reprise ouverts) » | أشهر جانفي إلى أوت 2026 دُفعت خارج التطبيق. إذا بقي أحدها مفتوحًا، تحتاج المصادقة إلى القرار D6. | 0:20–0:40 |
| 3 | Zoom sur le bouton « Demander la décision D6 » à la place de « Valider la paie » | لهذا يظهر زر « Demander la décision D6 » مكان زر المصادقة. | 0:40–1:00 |
| 4 | Clic sur le bouton | نضغط عليه. يُنشأ الطلب ويُبلَّغ المقررون. | 1:00–1:20 |
| 5 | Zoom sur le chip « Validation bloquée · décision D6 en attente » | أثناء الانتظار تبقى المصادقة متوقفة. | 1:20–1:40 |
| 6 | Compte GERANT : page de décision, options « Attendre », « Valider en figeant les paramètres des mois de reprise », « Chaîne de clôture séparée pour les mois de reprise » | المقرر يختار: الانتظار، أو المصادقة مع تجميد إعدادات أشهر الاسترجاع، أو سلسلة إغلاق منفصلة لها. | 1:40–2:00 |
| 7 | Cochage de la case de risque, justification, « Enregistrer la décision » | إنه قرار خطير ونهائي: نؤكد الاطلاع على العواقب ونكتب التبرير. | 2:00–2:20 |
| 8 | Retour à l'écran Paie, bouton « Valider la paie » de nouveau disponible | بعد القرار، تتم المصادقة من شاشة الأجور كالمعتاد. | 2:20–2:40 |
| 9 | Incrustation du résumé | النتيجة: القرار D6 مُتخذ. في الفيديو التالي نغلق الشهر نهائيًا. | 2:40–3:00 |

- **Texte à l'écran (incrustations)** : « Mois de reprise : janvier → août 2026 » · « D6 = définitive ».
- **Résultat montré** : D6 tranchée, validation possible.
- **Erreurs à montrer (optionnel)** : message « Validation bloquée : des mois de reprise (janvier à août 2026) restent ouverts… ».

---

## V3.10 — Clôturer le mois
- **Durée cible** : 2 min · **Public** : GERANT, SUPER_ADMIN · **Fiche du manuel** : 3.10
- **Objectif** : à la fin, le spectateur sait clôturer définitivement la paie validée d'un chantier.
- **À préparer avant l'enregistrement** : compte GERANT ; paie de septembre 2026 « Chantier Démo Oran » au statut « Validée ».

| # | À l'écran (action) | Voix off (arabe) | Durée |
|---|---|---|---|
| 1 | « Paie » › « Calcul de la paie », « Chantier Démo Oran », 09/2026, chip « Validée » | في هذا الفيديو نغلق شهر الأجور نهائيًا. الأجرة يجب أن تكون مصادقًا عليها. | 0:00–0:20 |
| 2 | Clic sur « Clôturer le mois » | نضغط على « Clôturer le mois ». هذا الزر خاص بالمسير والمدير العام للنظام. | 0:20–0:40 |
| 3 | Zoom sur la confirmation « Clôturer définitivement la paie 09/2026 — Chantier Démo Oran ? … » | نقرأ التأكيد: الكشوف والحضور تُجمَّد، وأي تصحيح يمر كاستدراك في الشهر الموالي. | 0:40–1:00 |
| 4 | Clic sur « OK », message « Paie clôturée définitivement. » | نضغط « OK ». الأجرة مغلقة نهائيًا. | 1:00–1:20 |
| 5 | Zoom sur le chip « Clôturée » | الحالة الآن « Clôturée »، والكشوف التي لم تكن محفوظة تُحفظ كملفات PDF. | 1:20–1:40 |
| 6 | Incrustation du résumé | النتيجة: الشهر مغلق. في الفيديو التالي نتعلم كيف نطلب إعادة فتح أجرة. | 1:40–2:00 |

- **Texte à l'écran (incrustations)** : « Clôture = définitive » · « Corrections → rappel le mois suivant ».
- **Résultat montré** : paie « Clôturée ».
- **Erreurs à montrer (optionnel)** : avec un compte ADMIN_RH, « Clôture réservée à SUPER_ADMIN et GERANT. »

---

## V3.11 — Réouvrir une paie (D7) et consulter l'historique
- **Durée cible** : 5 min · **Public** : ADMIN_RH, GERANT (demande), SUPER_ADMIN (décision) · **Fiches du manuel** : 3.11 et 3.12
- **Objectif** : à la fin, le spectateur sait demander la réouverture d'une paie, comprendre ce que fait la décision D7 et retrouver les copies figées.
- **À préparer avant l'enregistrement** : compte ADMIN_RH et compte SUPER_ADMIN ; paie de septembre 2026 « Chantier Démo Oran » validée sans lot de virement actif ; une autre paie avec un lot généré pour montrer le blocage.

| # | À l'écran (action) | Voix off (arabe) | Durée |
|---|---|---|---|
| 1 | « Paie » › « Calcul de la paie », paie « Validée » | في هذا الفيديو نتعلم إعادة فتح أجرة مصادق عليها أو مغلقة، ثم مراجعة النسخ المجمدة. | 0:00–0:20 |
| 2 | Incrustation des conditions | الشروط: الأجرة مصادق عليها أو مغلقة، ولا يوجد طلب D7 مفتوح، ولا دفعة تحويل مولّدة أو مودعة. | 0:20–0:40 |
| 3 | Clic sur « Demander la réouverture (D7) » | نضغط على « Demander la réouverture (D7) ». | 0:40–1:00 |
| 4 | Fenêtre « Demander la réouverture — 09/2026 · Chantier Démo Oran », zoom sur l'avertissement | نقرأ التحذير: تبقى الأجرة مصادقًا عليها حتى القرار، وتُحفظ نسخة مجمدة، والتحويلات المنفذة والتصريحات لا تُلغى. | 1:00–1:20 |
| 5 | Saisie du « Motif de la réouverture » : « Oubli de la prime de rendement de M-0042. » | نكتب سبب إعادة الفتح، من عشرة إلى خمسمئة حرف. المقرر سيقرؤه. | 1:20–1:40 |
| 6 | Clic sur « Envoyer la demande », chip « Réouverture demandée · décision D7 en attente » | نرسل الطلب. تظهر إشارة الانتظار في شريط الحالة. | 1:40–2:00 |
| 7 | Compte SUPER_ADMIN : page de décision D7, défilement du contexte | المدير العام للنظام وحده يقرر. يرى السياق: الكشوف، والمبالغ، والتحويلات، والتصريحات، والوثائق الصادرة. | 2:00–2:20 |
| 8 | Choix « Réouvrir la paie », case de risque, justification, « Décider et exécuter » | يختار « Réouvrir la paie »، يؤكد الاطلاع على العواقب ويكتب التبرير. | 2:20–2:40 |
| 9 | Retour à l'écran Paie : chip « Brouillon » | الأجرة عادت مسودة، والحضور قابل للتعديل من جديد. | 2:40–3:00 |
| 10 | Incrustation « Aucun recalcul sans D3 » | انتبهوا: إعادة الفتح لا تعيد الحساب. نصحح البيانات ثم نطلب إعادة الحساب بالقرار D3. | 3:00–3:20 |
| 11 | Clic sur « Historique (1) » | الآن نفتح « Historique » لرؤية النسخ المجمدة. | 3:20–3:40 |
| 12 | Fenêtre « Historique des bulletins — … », colonnes Salarié, V., Statut, Brut, IRG, Net, « Figée le » | لكل عامل نسخة برقم إصدار، مع الإجمالي والضريبة والصافي وتاريخ التجميد. | 3:40–4:00 |
| 13 | Recherche « Benali » dans « Rechercher un salarié… » | يمكن البحث عن عامل. هذه النسخ للقراءة فقط ولا تُسترجع تلقائيًا. | 4:00–4:20 |
| 14 | Exemple : autre paie avec lot généré, message « Lot de virement généré ou déposé pour cette paie… » | وإذا وُجدت دفعة تحويل مولّدة أو مودعة، تُرفض إعادة الفتح. نلغي الدفعة أو نسجل تنفيذها أولًا. | 4:20–4:40 |
| 15 | Incrustation du résumé | النتيجة: الأجرة أُعيد فتحها مع حفظ نسخة. في الفيديو التالي نعمل على الكشوف من قسم الوثائق. | 4:40–5:00 |

- **Texte à l'écran (incrustations)** : « D7 = SUPER_ADMIN seulement » · « Copie figée conservée » · « Puis recalcul D3 ».
- **Résultat montré** : paie repassée en « Brouillon », historique avec une copie figée.
- **Erreurs à montrer (optionnel)** : « Motif de la réouverture obligatoire (10 caractères minimum). »

---

## V3.12 — Afficher, imprimer ou recalculer un bulletin depuis Documents
- **Durée cible** : 4 min · **Public** : gestionnaire de paie (recalcul direct : SUPER_ADMIN) · **Fiche du manuel** : 3.13
- **Objectif** : à la fin, le spectateur sait retrouver un bulletin dans le registre, l'afficher, l'imprimer et le recalculer quand ses données ont changé.
- **À préparer avant l'enregistrement** : compte SUPER_ADMIN ; paie brouillon de septembre 2026 ; une modification du contrat de « M-0042 Karim Benali » faite après le calcul ; un bulletin validé d'août.

| # | À l'écran (action) | Voix off (arabe) | Durée |
|---|---|---|---|
| 1 | « Ressources Humaines » › « Documents » › « Registre », carte « Bulletin de paie » | في هذا الفيديو نعمل على الكشوف من قسم الوثائق. نفتح السجل ثم بطاقة « Bulletin de paie ». | 0:00–0:20 |
| 2 | Écran « Bulletins de paie », colonnes Période, Employé, Chantier, Jours, Net à payer, Statut | هنا كل الكشوف المُعدّة، لكل الأشهر. | 0:20–0:40 |
| 3 | Saisie « Benali » dans « Rechercher (matricule, nom, chantier)… », période « 09/2026 » | نبحث بالرقم أو الاسم أو الورشة، ونختار الفترة. | 0:40–1:00 |
| 4 | Sur le bulletin d'août validé : clic sur « Afficher », fenêtre « Bulletin de paie 08/2026 », « Imprimer » | للكشف المصادق عليه، « Afficher » يعرضه مباشرة، ويمكن طباعته. وزر « PDF archivé » يفتح النسخة المحفوظة. | 1:00–1:20 |
| 5 | Sur le bulletin brouillon de septembre : clic sur « Afficher » | الآن كشف سبتمبر في حالة مسودة، وقد تغيّر عقد العامل بعد الحساب. | 1:20–1:40 |
| 6 | Fenêtre « Décision D3 — 09/2026 », zoom sur « Son bulletin brouillon a été calculé avant les dernières modifications… » | بدل عرض نسخة قديمة، تُفتح نافذة قرار: الكشف حُسب قبل آخر التعديلات ويجب إعادة حسابه. | 1:40–2:00 |
| 7 | Zoom sur la « Justification de la décision » pré-remplie | التبرير مكتوب مسبقًا، ويمكن تعديله. عشرة أحرف على الأقل. | 2:00–2:20 |
| 8 | Clic sur « Recalculer et afficher », libellé « Calcul de la paie… » | نضغط على « Recalculer et afficher ». تُعاد حساب أجرة الشهر كلها لهذه الورشة، ثم يظهر الكشف المحدّث. | 2:20–2:40 |
| 9 | Bulletin à jour affiché | هذا هو الكشف الصحيح بالبيانات الحالية. | 2:40–3:00 |
| 10 | Pointage de « Afficher sans recalculer » (sans cliquer) | الخيار « Afficher sans recalculer » يعرض الكشف بمبالغه القديمة. | 3:00–3:20 |
| 11 | Survol du bouton « Recalculer » (infobulle « Recalculer ce bulletin brouillon avec les règles et données actuelles ») | والزر « Recalculer » يطلب إعادة الحساب حتى دون إشارة تغيير. لا يظهر للكشف المصادق عليه. | 3:20–3:40 |
| 12 | Incrustation du résumé | تذكير: الكشف المحسوب لا يتغير وحده. النتيجة: كشف محدّث ومطبوع. في الفيديو التالي نُعدّ كشفًا جديدًا. | 3:40–4:00 |

- **Texte à l'écran (incrustations)** : « Données modifiées → Recalculer et afficher » · « Validé = montants figés ».
- **Résultat montré** : bulletin recalculé affiché.
- **Erreurs à montrer (optionnel)** : avec un compte ADMIN_RH, le message « Vous êtes à l'origine de la demande : un autre décideur doit la trancher au Centre de décisions… ».

---

## V3.13 — Établir un nouveau bulletin de paie
- **Durée cible** : 4 min · **Public** : gestionnaire de paie (décision directe : SUPER_ADMIN) · **Fiche du manuel** : 3.14
- **Objectif** : à la fin, le spectateur sait obtenir le bulletin d'un salarié pour un mois, avec ou sans décision.
- **À préparer avant l'enregistrement** : compte SUPER_ADMIN ; octobre 2026 sans paie, contrat et pointage validé de « M-0057 Samir Haddad » ; un salarié sans contrat pour l'erreur.

| # | À l'écran (action) | Voix off (arabe) | Durée |
|---|---|---|---|
| 1 | Documents › « Registre » › « Bulletin de paie », clic sur « Nouveau bulletin de paie » | في هذا الفيديو نُعدّ كشف أجر لعامل ولشهر معين. نضغط على « Nouveau bulletin de paie ». | 0:00–0:20 |
| 2 | Zoom sur le sous-titre « Choisissez l'employé et le mois… » | أجرة الشهر تشمل كل الورشات التي عمل فيها العامل. | 0:20–0:40 |
| 3 | Choix de « M-0057 Samir Haddad » dans « Employé », « Mois » 10, « Année » 2026 | نختار العامل، والشهر، والسنة. | 0:40–1:00 |
| 4 | Clic sur « Établir le bulletin », libellé « Recherche… » | نضغط على « Établir le bulletin ». | 1:00–1:20 |
| 5 | Encadré « Décision D4 — 10/2026 » et texte « Générer la paie du mois (tous les chantiers)… » | لا توجد أجرة لهذا الشهر، فيُفتح قرار التوليد D4. تُنشأ أجرة مسودة دون مصادقة أو دفع أو تصريح. | 1:20–1:40 |
| 6 | Zoom sur « Justification de la décision » : « Bulletin de paie 10/2026 de M-0057 Samir Haddad. » | التبرير مكتوب مسبقًا. | 1:40–2:00 |
| 7 | Clic sur « Générer et afficher », « Calcul de la paie… » | كمدير عام للنظام، نضغط على « Générer et afficher ». | 2:00–2:20 |
| 8 | Le bulletin s'affiche | يظهر الكشف مباشرة. | 2:20–2:40 |
| 9 | Incrustation : « Pas de paie par chantier → paie pour toute l'entreprise » | ملاحظة: إذا لم توجد أجرة حسب الورشة لهذا الشهر، يُنشئ هذا الطريق أجرة واحدة لكل المؤسسة. | 2:40–3:00 |
| 10 | Compte ADMIN_RH : même démarche, message « Vous êtes à l'origine de la demande… », bouton « Fermer » | إذا لم تكن مديرًا عامًا للنظام، يبقى الطلب مفتوحًا ويقرر فيه شخص آخر، ثم يظهر الكشف في القائمة. | 3:00–3:20 |
| 11 | Erreur : salarié sans contrat, « Aucun contrat de travail payable en 10/2026 pour cet employé… » | وإذا لم يكن للعامل عقد صالح لهذا الشهر، نسجّل عقده أولًا. | 3:20–3:40 |
| 12 | Incrustation du résumé | النتيجة: كشف مُعدّ ومعروض. في الفيديو التالي نضيف بندًا استثنائيًا. | 3:40–4:00 |

- **Texte à l'écran (incrustations)** : « Bulletin à jour → affiché » · « Sinon → décision D4 / D3 / D1 ».
- **Résultat montré** : bulletin d'octobre de Samir Haddad affiché.
- **Erreurs à montrer (optionnel)** : « La paie de MM/AAAA est établie par chantier (…) et ce salarié n'y figure pas… ».

---

## V3.14 — Saisir et approuver une rubrique exceptionnelle
- **Durée cible** : 5 min · **Public** : ADMIN_RH, GERANT, SUPER_ADMIN · **Fiche du manuel** : 3.15
- **Objectif** : à la fin, le spectateur sait saisir une exception, la faire approuver par une autre personne et la gérer (modifier, supprimer, annuler).
- **À préparer avant l'enregistrement** : compte ADMIN_RH (saisie) et compte GERANT (approbation) ; rubrique de classe 1 « Prime exceptionnelle » (exemple) et rubrique de classe 5 ; septembre 2026 ouvert.

| # | À l'écran (action) | Voix off (arabe) | Durée |
|---|---|---|---|
| 1 | « Paie » › « Exceptions », écran « Rubriques exceptionnelles » | في هذا الفيديو نضيف بندًا استثنائيًا لعامل، مثل منحة أو اقتطاع لشهر واحد. | 0:00–0:20 |
| 2 | Zoom sur la description de l'écran | البند الاستثنائي خارج العقد الدائم، يحتاج سببًا وفترة، ويجب أن يصادق عليه شخص آخر. | 0:20–0:40 |
| 3 | Clic sur « Nouvelle exception », fenêtre « Exception salariale » | نضغط على « Nouvelle exception ». | 0:40–1:00 |
| 4 | Choix de « M-0042 Karim Benali », « Classe » 1, « Rubrique » « Prime exceptionnelle » | نختار العامل، ثم الصنف، ثم البند. المبلغ والوحدة الافتراضيان يظهران تلقائيًا. | 1:00–1:20 |
| 5 | « Mode » Montant (/F), « Valeur » 5 000 | نختار طريقة الحساب: مبلغ ثابت، ونكتب القيمة خمسة آلاف دينار. | 1:20–1:40 |
| 6 | Démonstration sur une rubrique de classe 5 : mention « · retenue » | في الصنف الخامس يُكتب المبلغ موجبًا، ويُقتطع من الصافي. | 1:40–2:00 |
| 7 | « Année » 2026, « Mois » 09, « Durée » « Une fois ce mois » | نحدد السنة والشهر، والمدة: مرة واحدة هذا الشهر، أو حتى شهر معين. | 2:00–2:20 |
| 8 | « Motif obligatoire » : « Prime de fin de chantier Oran. », clic sur « Enregistrer » | نكتب السبب، ثمانية أحرف على الأقل، ثم نحفظ. | 2:20–2:40 |
| 9 | Message « Brouillon enregistré : il doit être approuvé pour entrer en paie. » | البند الآن مسودة ولن يدخل الأجرة قبل المصادقة. | 2:40–3:00 |
| 10 | Zoom sur « À approuver par un autre responsable » | لا يمكنني المصادقة على ما كتبته بنفسي. المسير والمدير العام للنظام فقط يمكنهما ذلك. | 3:00–3:20 |
| 11 | Compte GERANT : clic sur « Approuver », statut « Approuvée » | يدخل المسير ويضغط على « Approuver ». الحالة تصبح « Approuvée ». | 3:20–3:40 |
| 12 | Écran Paie : chip « Données modifiées depuis le calcul » | المصادقة تغيّر بيانات الأجرة، فيظهر طلب إعادة الحساب D3. | 3:40–4:00 |
| 13 | Survol des actions « Modifier », « Supprimer » (brouillon) et « Annuler » (approuvée) | المسودة يمكن تعديلها أو حذفها. البند المصادق عليه يُلغى فقط مع سبب اختياري. | 4:00–4:20 |
| 14 | Erreur : mois validé, « Mois 08/2026 déjà validé ou clôturé pour cet employé : choisissez un mois ouvert (rappel). » | لا يمكن إضافة بند لشهر مصادق عليه. نختار شهرًا مفتوحًا كاستدراك. | 4:20–4:40 |
| 15 | Incrustation du résumé | النتيجة: بند استثنائي مصادق عليه سيدخل الكشف بعد إعادة الحساب. في الفيديو التالي نسجل تسبيقًا أو قرضًا. | 4:40–5:00 |

- **Texte à l'écran (incrustations)** : « Saisie → Approbation par un autre → Recalcul » · « Classe 5 = retenue ».
- **Résultat montré** : exception « Approuvée » et signal de recalcul.
- **Erreurs à montrer (optionnel)** : « Double validation : l'exception doit être approuvée par une autre personne (Gérant ou autre responsable). »

---

## V3.15 — Enregistrer une avance ou un prêt
- **Durée cible** : 4 min · **Public** : ADMIN_RH, GERANT, SUPER_ADMIN · **Fiche du manuel** : 3.16
- **Objectif** : à la fin, le spectateur sait enregistrer une avance ou un prêt, suivre le reste à retenir et l'annuler.
- **À préparer avant l'enregistrement** : compte ADMIN_RH ; « M-0042 Karim Benali » ; paie brouillon de septembre 2026.

| # | À l'écran (action) | Voix off (arabe) | Durée |
|---|---|---|---|
| 1 | « Paie » › « Avances », écran « Avances & prêts » | في هذا الفيديو نسجل تسبيقًا على الأجر أو قرضًا لعامل. | 0:00–0:20 |
| 2 | Zoom sur l'alerte d'information | كل شهر تقتطع الأجرة القسط حتى التسديد الكامل، دون أن يصبح الصافي سالبًا. | 0:20–0:40 |
| 3 | Formulaire « Nouvelle avance / prêt » : « Employé » « M-0042 Karim Benali » | في استمارة « Nouvelle avance / prêt » نختار العامل. | 0:40–1:00 |
| 4 | « Type » « Avance sur salaire », « Montant accordé » 15 000 | نختار النوع: تسبيق على الأجر أو قرض، ونكتب المبلغ الممنوح. | 1:00–1:20 |
| 5 | « Retenue mensuelle » 5 000, indication « 3 mois » | نكتب الاقتطاع الشهري. يظهر عدد الأشهر. إذا تركناه فارغًا للتسبيق، يُقتطع المبلغ كله مرة واحدة. | 1:20–1:40 |
| 6 | « Première retenue (mois) » 09/2026, « Date d'octroi », « Motif » « Avance rentrée scolaire » | نحدد شهر أول اقتطاع، وتاريخ المنح، والسبب. | 1:40–2:00 |
| 7 | Clic sur « Enregistrer », message « Enregistré : la retenue sera appliquée sur les prochaines paies. » | نحفظ. سيُطبق الاقتطاع في الأجور القادمة. | 2:00–2:20 |
| 8 | Filtre « En cours », total « Reste à retenir », colonnes Retenu et Reste | نتابع المبلغ المقتطع والمتبقي لكل تسبيق. | 2:20–2:40 |
| 9 | Écran Paie : chip « Données modifiées depuis le calcul » | التسجيل يغيّر بيانات الأجرة المسودة، فيلزم قرار إعادة الحساب. | 2:40–3:00 |
| 10 | Bulletin recalculé : ligne « Retenue avance » − 5 000 | في الكشف يظهر السطر « Retenue avance ». يُقتطع بعد الضريبة، ولا يخضع للاشتراك ولا للضريبة. | 3:00–3:20 |
| 11 | Clic sur « Annuler », confirmation « Annuler … ? Le reste ne sera plus retenu. » (annuler la boîte sans valider) | لإيقاف الاقتطاعات نضغط على « Annuler » ونؤكد. المتبقي لن يُقتطع بعد ذلك. | 3:20–3:40 |
| 12 | Incrustation du résumé | النتيجة: تسبيق مسجل ومتابع. في شهر خروج العامل يُقتطع كل المتبقي. في الفيديو التالي نحضّر التحويلات. | 3:40–4:00 |

- **Texte à l'écran (incrustations)** : « Retenue après IRG » · « Net jamais négatif ».
- **Résultat montré** : avance en cours avec « Reste » à jour.
- **Erreurs à montrer (optionnel)** : « La mensualité dépasse le montant. »

---

## V3.16 — Préparer et suivre un lot de virements
- **Durée cible** : 6 min · **Public** : ADMIN_RH, GERANT, SUPER_ADMIN · **Fiche du manuel** : 3.17
- **Objectif** : à la fin, le spectateur sait préparer un lot CCP ou banque, générer le fichier et suivre son dépôt et son exécution.
- **À préparer avant l'enregistrement** : compte ADMIN_RH ; paie de septembre 2026 validée ; un salarié avec un compte CCP sans clé (pour l'aperçu) ; compte donneur d'ordre fictif.

| # | À l'écran (action) | Voix off (arabe) | Durée |
|---|---|---|---|
| 1 | « Paie » › « Virements », écran « Virements des salaires » | في هذا الفيديو نحضّر ملف تحويل الأجور إلى البريد أو البنك. | 0:00–0:20 |
| 2 | Zoom sur la description | الملفات تُحضّر من الكشوف المصادق عليها أو المغلقة فقط. يجب أن يصادق البنك أو بريد الجزائر على شكل الملف قبل أول إيداع. | 0:20–0:40 |
| 3 | « Année » 2026, « Mois » 09 | نختار السنة والشهر. | 0:40–1:00 |
| 4 | « Mode » « CCP · texte à positions fixes » | نختار الطريقة: الحساب البريدي الجاري أو البنك. | 1:00–1:20 |
| 5 | « Chantier » « Tous les chantiers » | نختار الورشة أو كل الورشات. | 1:20–1:40 |
| 6 | Saisie du « Compte donneur d'ordre » et de la « Date de valeur » | نكتب حساب المؤسسة وتاريخ القيمة. | 1:40–2:00 |
| 7 | Clic sur « Préparer le lot » | نضغط على « Préparer le lot ». | 2:00–2:20 |
| 8 | Aperçu « 11 virement(s) · X DA » et chip « compte(s) à corriger » | يظهر عدد التحويلات والمبلغ الإجمالي، والكشوف المستبعدة. | 2:20–2:40 |
| 9 | Zoom sur le motif « Clé CCP (2 chiffres) manquante » | هنا حساب بريدي ينقصه المفتاح. نصححه في بطاقة العامل ثم نحضّر من جديد. | 2:40–3:00 |
| 10 | Clic sur « Générer le fichier », lecture de la confirmation | نضغط على « Générer le fichier ». التأكيد ينبهنا: الكشوف المدرجة لا يمكن إعادة فتحها ما دامت الدفعة قائمة. | 3:00–3:20 |
| 11 | Le lot apparaît dans le tableau, statut « Généré » | تظهر الدفعة في الجدول برقمها وبصمة التحقق. | 3:20–3:40 |
| 12 | Clic sur « Fichier » : téléchargement | نضغط على « Fichier » لتحميل الملف وتسليمه للبريد أو البنك. | 3:40–4:00 |
| 13 | Clic sur « Déposé », fenêtre « Dépôt du lot … » | بعد الإيداع نضغط على « Déposé ». | 4:00–4:20 |
| 14 | Saisie de la « Référence du bordereau / accusé » et de la « Date de dépôt », « Enregistrer le dépôt » | نكتب مرجع الوصل، وهو إجباري، وتاريخ الإيداع، ثم نحفظ. | 4:20–4:40 |
| 15 | Clic sur « Exécuté », statut « Exécuté » | عندما يؤكد البنك الدفع نضغط على « Exécuté ». | 4:40–5:00 |
| 16 | Survol de « Annuler le dépôt » et « Annuler le lot » (motif obligatoire) | يمكن إلغاء الإيداع، أو إلغاء الدفعة مع سبب إجباري. | 5:00–5:20 |
| 17 | Zoom sur le chip « 1 lot(s) actif(s) · X DA » | هذا الملخص يبين الدفعات النشطة للشهر. كل كشف يدخل دفعة نشطة واحدة فقط. | 5:20–5:40 |
| 18 | Incrustation du résumé | النتيجة: دفعة مولّدة ومودعة ومنفذة. في الفيديو التالي نعالج الكشوف الممنوعة من التحويل بالقرار D9. | 5:40–6:00 |

- **Texte à l'écran (incrustations)** : « Préparer → Générer → Fichier → Déposé → Exécuté ».
- **Résultat montré** : lot au statut « Exécuté ».
- **Erreurs à montrer (optionnel)** : « Aucun bulletin virable par un lot ordinaire pour ce mode (déjà en lot, brouillon, compte manquant ou bloqué D9). »

---

## V3.17 — Débloquer des virements (décision D9)
- **Durée cible** : 4 min · **Public** : ADMIN_RH, GERANT, SUPER_ADMIN · **Fiche du manuel** : 3.18
- **Objectif** : à la fin, le spectateur sait demander la décision D9 pour des bulletins bloqués et exécuter l'option décidée une seule fois.
- **À préparer avant l'enregistrement** : compte ADMIN_RH et compte GERANT ; paie de juin 2026 (reprise) validée ; un paiement externe enregistré pour un salarié de septembre.

| # | À l'écran (action) | Voix off (arabe) | Durée |
|---|---|---|---|
| 1 | « Paie » › « Virements », mois 06/2026, bandeau « reprise » | في هذا الفيديو نعالج الكشوف الممنوعة من التحويل لتفادي الدفع مرتين. | 0:00–0:20 |
| 2 | Zone « N bulletin(s) bloqué(s) · X DA — aucun virement sans décision D9 » | هذه الكشوف لا تدخل أي دفعة عادية دون القرار D9. | 0:20–0:40 |
| 3 | Zoom sur les motifs : paie de reprise, « Paiement externe enregistré » | الأسباب: شهر استرجاع دُفع خارج التطبيق، أو أجر حُوّل سابقًا، أو دفع خارجي مسجل. | 0:40–1:00 |
| 4 | Cochage des bulletins | نختار الكشوف المعنية. | 1:00–1:20 |
| 5 | Saisie du « Motif de la demande D9 » | نكتب سبب الطلب، من عشرة إلى خمسمئة حرف. | 1:20–1:40 |
| 6 | Clic sur « Demander la décision D9 (3) », message « Décision D9 demandée… », lien « Ouvrir la décision » | نضغط على زر الطلب. لا تحويل قبل أن يقرر شخص مخوّل. | 1:40–2:00 |
| 7 | Compte GERANT : options « Aucun virement », « État de rapprochement non bancaire », « Lot de virement réel — risque de double paiement » | المقرر يختار: لا تحويل، أو كشف مطابقة غير بنكي، أو دفعة حقيقية مع خطر الدفع المزدوج. | 2:00–2:20 |
| 8 | Choix « État de rapprochement non bancaire », case de risque, justification, décision | في مثالنا يختار كشف المطابقة، يؤكد الاطلاع على الخطر ويكتب التبرير. | 2:20–2:40 |
| 9 | Retour à « Virements », liste « Décisions D9 du mois » | نعود إلى التحويلات. القرار يظهر في قائمة قرارات الشهر. | 2:40–3:00 |
| 10 | Clic sur « Produire l'état de rapprochement », confirmation « …(une seule fois) ? Ce n'est pas un ordre de paiement. » | نضغط لإنتاج كشف المطابقة، مرة واحدة فقط. إنه ليس أمر دفع. | 3:00–3:20 |
| 11 | Fichier CSV ouvert, en-tête « ETAT DE RAPPROCHEMENT NON BANCAIRE - CE N'EST PAS UN ORDRE DE PAIEMENT - NE PAS DEPOSER » | الملف يحمل عبارة واضحة: لا يُودع في البنك. | 3:20–3:40 |
| 12 | Incrustation du résumé | النتيجة: الكشوف الممنوعة عولجت بقرار موثق. في الفيديو التالي ننتج التصريحات. | 3:40–4:00 |

- **Texte à l'écran (incrustations)** : « D9 = éviter le double paiement » · « Une seule fois ».
- **Résultat montré** : état de rapprochement produit.
- **Erreurs à montrer (optionnel)** : « Lot différent du périmètre de la décision D9 (mois, chantier ou mode). »

---

## V3.18 — Produire les déclarations depuis l'écran Paie
- **Durée cible** : 5 min · **Public** : ADMIN_RH, GERANT, SUPER_ADMIN · **Fiche du manuel** : 3.19
- **Objectif** : à la fin, le spectateur sait produire le classeur mensuel, les fichiers CNAS et DAS et l'état G50, et reconnaître un fichier provisoire.
- **À préparer avant l'enregistrement** : compte ADMIN_RH ; paie de septembre 2026 validée sur « Chantier Démo Oran », brouillon sur « Chantier Démo Sétif » ; un salarié sans NSS.

| # | À l'écran (action) | Voix off (arabe) | Durée |
|---|---|---|---|
| 1 | « Paie » › « Calcul de la paie », 09/2026, barre des déclarations | في هذا الفيديو ننتج ملفات التصريح: الضمان الاجتماعي، والضريبة على الأجور G50، والتصريح السنوي DAS. | 0:00–0:20 |
| 2 | Zoom sur le chip « Provisoire : paie non validée » | إذا لم تكن الأجرة مصادقًا عليها، تكون الملفات مؤقتة. الأفضل التصريح بعد المصادقة. | 0:20–0:40 |
| 3 | Clic sur « CNAS · G50 · CACOBATPH · Virements (Excel) » | نضغط على زر الملف الشهري الشامل. | 0:40–1:00 |
| 4 | Fenêtre « Déclarations mensuelles (G50 + CNAS) · 09/2026 », « Vérification du registre et des décisions… » | تُفتح نافذة التصدير وتتحقق من السجل والقرارات. | 1:00–1:20 |
| 5 | Zoom sur « Registre des exports de l'application » et « Déclarations externes enregistrées » | نرى الملفات المنتجة سابقًا، والتصريحات المسجلة خارج التطبيق. | 1:20–1:40 |
| 6 | Clic sur « Produire le fichier », message « Fichier produit et inscrit au registre des exports de déclaration. » | نضغط على « Produire le fichier ». يُحمَّل الملف ويُسجل في السجل. | 1:40–2:00 |
| 7 | Ouverture du classeur : feuille « Récapitulatif » | في ورقة الملخص نجد المجاميع، وقائمة ما يجب تصحيحه قبل الإيداع. | 2:00–2:20 |
| 8 | Zoom sur « MANQUANT » dans la feuille « CNAS » | هنا رقم ضمان ناقص. نصححه في بطاقة العامل قبل أي إيداع. | 2:20–2:40 |
| 9 | Survol des feuilles « Livre de paie », « IRG (G50) », « CACOBATPH », « Virements » | باقي الأوراق: دفتر الأجور، والضريبة، وصندوق العطل، والتحويلات. | 2:40–3:00 |
| 10 | Retour, survol de « Ce chantier seulement » | الزر « Ce chantier seulement » ينتج الملف نفسه للورشة المختارة فقط. | 3:00–3:20 |
| 11 | Clic sur « Fichier CNAS (CSV) », production | الملف « Fichier CNAS (CSV) » هو ملف اشتراكات الشهر. | 3:20–3:40 |
| 12 | Survol de « DAS annuelle 2026 » et « Fichier DAS (CSV) » | للتصريح السنوي نستعمل « DAS annuelle » أو « Fichier DAS (CSV) ». | 3:40–4:00 |
| 13 | Clic sur « État G50 (imprimer) », « Produire et imprimer » | والزر « État G50 (imprimer) » يعطي كشف الضريبة على الأجور للنقل إلى G50. | 4:00–4:20 |
| 14 | Zoom sur un nom de fichier commençant par PROVISOIRE_ et la mention « Ne pas déposer. » | الملف المؤقت يبدأ اسمه بكلمة PROVISOIRE، ولا يجب إيداعه. | 4:20–4:40 |
| 15 | Incrustation du résumé | النتيجة: ملفات التصريح منتجة ومسجلة. في الفيديو التالي نرى القرار D10 عندما يكون التصدير ممنوعًا. | 4:40–5:00 |

- **Texte à l'écran (incrustations)** : « Valider avant de déclarer » · « PROVISOIRE_ = ne pas déposer ».
- **Résultat montré** : classeur mensuel téléchargé et inscrit au registre.
- **Erreurs à montrer (optionnel)** : « Aucun bulletin pour cette période. »

---

## V3.19 — Débloquer une déclaration (décision D10)
- **Durée cible** : 4 min · **Public** : ADMIN_RH, GERANT, SUPER_ADMIN · **Fiche du manuel** : 3.20
- **Objectif** : à la fin, le spectateur sait demander la décision D10 et produire le fichier décidé une seule fois.
- **À préparer avant l'enregistrement** : compte ADMIN_RH et compte GERANT ; DAS annuelle 2026 incluant des mois de reprise.

| # | À l'écran (action) | Voix off (arabe) | Durée |
|---|---|---|---|
| 1 | Écran Paie, clic sur « DAS annuelle 2026 » | في هذا الفيديو نعالج تصديرًا ممنوعًا لتفادي التصريح مرتين. | 0:00–0:20 |
| 2 | Zoom sur « Export bloqué : décision D10 requise. » | التصدير ممنوع لأن بعض الأشهر صُرّح بها خارج التطبيق. | 0:20–0:40 |
| 3 | Section « Mois soumis à décision D10 », motifs « Mois de reprise, déclaré hors de l'application » | نقرأ الأشهر المعنية وسبب كل منها. | 0:40–1:00 |
| 4 | Saisie du « Motif de la demande D10 » | نكتب سبب الطلب، من عشرة إلى خمسمئة حرف. | 1:00–1:20 |
| 5 | Clic sur « Demander la décision D10 », message « Décision D10 demandée : aucun fichier tant qu'elle n'est pas tranchée. » | نرسل الطلب. لا ملف قبل القرار. | 1:20–1:40 |
| 6 | Compte GERANT : options « Exclure les mois concernés », « État de contrôle interne », « Fichier officiel — risque de double déclaration » | المقرر يختار: استبعاد الأشهر المعنية، أو كشف مراقبة داخلي، أو ملف رسمي مع خطر التصريح المزدوج. | 1:40–2:00 |
| 7 | Choix « Exclure les mois concernés », case de risque, justification | في مثالنا نستبعد أشهر الاسترجاع. قرار خطير يحتاج تأكيدًا وتبريرًا. | 2:00–2:20 |
| 8 | Retour à la fenêtre d'export : « Décision D10 : … Mois inclus… · exclus… » | نعيد فتح نافذة التصدير. تظهر الأشهر المدرجة والمستبعدة. | 2:20–2:40 |
| 9 | Clic sur « Produire (D10 · option) — une seule fois » | نضغط على زر الإنتاج. يعمل مرة واحدة فقط. | 2:40–3:00 |
| 10 | Exemple d'état de contrôle : nom CONTROLE_ et mention « ÉTAT DE CONTRÔLE — … NE PAS DÉPOSER. » | لو اختير كشف المراقبة، يبدأ اسم الملف بكلمة CONTROLE ولا يُودع أبدًا. | 3:00–3:20 |
| 11 | Registre des déclarations : ligne avec « Décision D10 » | الملف يظهر في سجل التصريحات مع رابط القرار. | 3:20–3:40 |
| 12 | Incrustation du résumé | النتيجة: تصدير موثق دون تصريح مزدوج. في الفيديو التالي نتصفح سجل التصريحات. | 3:40–4:00 |

- **Texte à l'écran (incrustations)** : « D10 = éviter la double déclaration » · « CONTROLE_ = ne pas déposer ».
- **Résultat montré** : fichier produit avec les mois exclus.
- **Erreurs à montrer (optionnel)** : aucune.

---

## V3.20 — Consulter le registre des déclarations
- **Durée cible** : 3 min · **Public** : ADMIN_RH, GERANT, SUPER_ADMIN · **Fiche du manuel** : 3.21
- **Objectif** : à la fin, le spectateur sait lire le registre des exports et préparer un nouvel export depuis cet écran.
- **À préparer avant l'enregistrement** : compte ADMIN_RH ; plusieurs exports produits en 2026 (officiel, provisoire, état de contrôle).

| # | À l'écran (action) | Voix off (arabe) | Durée |
|---|---|---|---|
| 1 | « Paie » › « Déclarations », écran « Registre des exports de déclaration » | في هذا الفيديو نتصفح سجل كل ملفات التصريح المنتجة من التطبيق. | 0:00–0:20 |
| 2 | Choix de l'« Année » 2026 | نختار السنة. | 0:20–0:40 |
| 3 | Zoom sur les colonnes Type, Période, Chantier, Nature | لكل ملف نوعه وفترته وورشته وطبيعته. | 0:40–1:00 |
| 4 | Zoom sur « Officiel », « État de contrôle », « Paie non validée », « Risque de double déclaration » | الطبيعة تبين إن كان الملف رسميًا، أو كشف مراقبة، أو مؤقتًا، أو فيه خطر تصريح مزدوج. | 1:00–1:20 |
| 5 | Zoom sur « Mois inclus », « Fichier » (empreinte), « Produit » | نرى الأشهر المدرجة، وبصمة الملف، ومن أنتجه ومتى. | 1:20–1:40 |
| 6 | « Nouvel export » : choix du type, « Mois », « Chantier » | لإنتاج ملف جديد نختار النوع والشهر والورشة. | 1:40–2:00 |
| 7 | Clic sur « Préparer l'export » : la fenêtre d'export s'ouvre | نضغط على « Préparer l'export » فتُفتح نفس نافذة التصدير. | 2:00–2:20 |
| 8 | Incrustation « Déclaration faite hors application → Opérations externes » | تذكير: التصريح الذي يتم خارج التطبيق لا يظهر هنا. يجب تسجيله في العمليات الخارجية. | 2:20–2:40 |
| 9 | Incrustation du résumé | النتيجة: سجل كامل ومؤرخ. في الفيديو التالي نسجل عملية خارجية. | 2:40–3:00 |

- **Texte à l'écran (incrustations)** : « Qui ? Quand ? Quels mois ? Officiel ou non ? ».
- **Résultat montré** : registre filtré sur 2026.
- **Erreurs à montrer (optionnel)** : aucune.

---

## V3.21 — Enregistrer et suivre une opération externe
- **Durée cible** : 6 min · **Public** : utilisateurs autorisés aux opérations externes · **Fiche du manuel** : 3.22
- **Objectif** : à la fin, le spectateur sait enregistrer un paiement ou une déclaration fait hors de l'application, le confirmer, joindre et examiner une pièce, le corriger ou le retirer.
- **À préparer avant l'enregistrement** : compte avec droit de saisie, compte avec droit de confirmation et d'examen ; une pièce PDF fictive (bordereau G50 de démonstration).

| # | À l'écran (action) | Voix off (arabe) | Durée |
|---|---|---|---|
| 1 | « Paie » › « Opérations externes » | في هذا الفيديو نسجل دفعًا أو تصريحًا تم خارج التطبيق. | 0:00–0:20 |
| 2 | Zoom sur la description | الهدف منع التكرار: الدفع الخارجي يمنع التحويل دون القرار D9، والتصريح الخارجي يمنع التصدير دون القرار D10. | 0:20–0:40 |
| 3 | Filtres « Année » 2026, « Type » « Déclarations » | يمكن التصفية حسب السنة والنوع. | 0:40–1:00 |
| 4 | Clic sur « Nouvelle opération externe » | نضغط على « Nouvelle opération externe ». | 1:00–1:20 |
| 5 | « Type » Déclaration, « Sous-type » G50 (IRG) | نختار النوع: تصريح، والنوع الفرعي: G50. | 1:20–1:40 |
| 6 | « Période : du mois » 06/2026 « au mois » 06/2026, « Chantiers » Tous, « Salariés » Tous | نحدد الفترة، اثنا عشر شهرًا على الأكثر، والورشات والعمال المعنيين. | 1:40–2:00 |
| 7 | « Date de l'opération », « Référence », « Organisme », « Montant (DA) » | نكتب التاريخ والمرجع والهيئة والمبلغ. | 2:00–2:20 |
| 8 | « Origine de l'information » « Sur pièce (à joindre ensuite) », « Description » | نحدد مصدر المعلومة، ونكتب وصفًا من عشرة أحرف على الأقل. | 2:20–2:40 |
| 9 | Clic sur « Enregistrer », message « Opération externe enregistrée. » | نحفظ. تظهر العملية كبطاقة. | 2:40–3:00 |
| 10 | Zoom sur les trois indicateurs de la carte | في البطاقة ثلاثة مؤشرات: معلومة مصرح بها، وتأكيد التسجيل، وحالة الوثيقة. | 3:00–3:20 |
| 11 | Compte de confirmation : « Confirmer l'enregistrement », lecture de la confirmation | المسؤول المخوّل يؤكد التسجيل. التطبيق لا يتحقق من حقيقة الدفع أو التصريح. | 3:20–3:40 |
| 12 | « Joindre une pièce » : choix du PDF, message « Pièce jointe, non examinée. » | نرفق الوثيقة: PDF أو صورة، خمسة عشر ميغابايت على الأكثر. | 3:40–4:00 |
| 13 | « Voir » puis « Examiner », observation, message « Pièce examinée. » | المسؤول عن الفحص يفتح الوثيقة ويكتب ملاحظته. | 4:00–4:20 |
| 14 | « Corriger » : « Motif de la correction », nouvelle « Version 2 » | للتصحيح نضغط على « Corriger ». تُنشأ نسخة جديدة وتبقى القديمة محفوظة. | 4:20–4:40 |
| 15 | Zoom sur le statut « Remplacée par une correction » de l'ancienne version | النسخة القديمة تظهر كنسخة مستبدلة. | 4:40–5:00 |
| 16 | « Retirer » avec motif, statut « Retirée · compte toujours pour le blocage » | يمكن سحب العملية مع سبب، لكنها تبقى في السجل. | 5:00–5:20 |
| 17 | Incrustation « Même retirée, l'opération bloque toujours » | مهم: العملية، حتى المسحوبة أو المستبدلة أو غير المؤكدة، تبقى تمنع التحويلات والتصريحات المعنية. | 5:20–5:40 |
| 18 | Incrustation du résumé | النتيجة: عملية خارجية موثقة. في الفيديو التالي نحلل تكاليف الأجور. | 5:40–6:00 |

- **Texte à l'écran (incrustations)** : « Paiement externe → D9 » · « Déclaration externe → D10 » · « Rien n'est supprimé ».
- **Résultat montré** : opération confirmée, pièce examinée, version corrigée.
- **Erreurs à montrer (optionnel)** : « Pièce refusée : PDF, JPEG, PNG ou WebP uniquement. »

---

## V3.22 — Analyser les coûts de la paie et paramétrer le plan de comptes
- **Durée cible** : 4 min · **Public** : ADMIN_RH, GERANT, ADMIN_FINANCE, SUPER_ADMIN · **Fiches du manuel** : 3.23 et 3.24
- **Objectif** : à la fin, le spectateur sait lire le coût employeur par chantier et par contrat, exporter l'écriture comptable et adapter le plan de comptes.
- **À préparer avant l'enregistrement** : compte ADMIN_FINANCE ; paie de septembre 2026 validée sur deux chantiers ; deux contrats clients actifs sur « Chantier Démo Oran ».

| # | À l'écran (action) | Voix off (arabe) | Durée |
|---|---|---|---|
| 1 | « Paie » › « Coûts » | في هذا الفيديو نحلل تكلفة الأجور حسب الورشة والعقد، ونصدّر القيد المحاسبي. | 0:00–0:20 |
| 2 | « Année » 2026, « Mois » 09 ; indicateurs Bulletins, Coût employeur total, Chantiers | نختار الفترة. نرى عدد الكشوف والتكلفة الإجمالية للمستخدم. | 0:20–0:40 |
| 3 | Tableau par chantier : Brut, Charges patronales, Coût employeur | تكلفة المستخدم هي الإجمالي زائد الأعباء التي يدفعها المستخدم. | 0:40–1:00 |
| 4 | Tableau par contrat client : Quote-part, Coût imputé | تُوزّع تكلفة الورشة على عقود الزبائن النشطة حسب أيام نشاطها في الشهر. | 1:00–1:20 |
| 5 | Incrustation : 300 000 × 30 ÷ 45 = 200 000 | مثال: ورشة تكلف ثلاثمئة ألف، عقد نشط ثلاثين يومًا وآخر خمسة عشر يومًا: الأول يأخذ مئتي ألف والثاني مئة ألف. | 1:20–1:40 |
| 6 | Tableau « Écriture de paie · journal PAIE », chip « Équilibrée » | القيد المحاسبي متوازن: المدين يساوي الدائن. | 1:40–2:00 |
| 7 | Clic sur « Écritures comptables (CSV) » | نضغط لتصدير القيد إلى المحاسبة. | 2:00–2:20 |
| 8 | Clic sur « Répartition (CSV) » | ونصدّر جدول التوزيع إن احتجنا. | 2:20–2:40 |
| 9 | Clic sur « Plan de comptes », fenêtre « Plan de comptes de la paie » | لتغيير الحسابات نضغط على « Plan de comptes ». هذا خاص بالمالية والتسيير. | 2:40–3:00 |
| 10 | Saisie du « Code journal » et d'un compte, rappel « Défaut 631 » | نكتب رمز اليومية والحسابات. القيمة الافتراضية مذكورة تحت كل حقل. | 3:00–3:20 |
| 11 | Clic sur « Enregistrer », message « Plan de comptes enregistré. » | نحفظ. القيود القادمة تستعمل هذه الحسابات. | 3:20–3:40 |
| 12 | Incrustation du résumé | النتيجة: تكاليف واضحة وقيد جاهز للمحاسبة. في الفيديو التالي نجرب المحاكي. | 3:40–4:00 |

- **Texte à l'écran (incrustations)** : « Coût employeur = Brut + charges patronales » · « Écriture équilibrée = export possible ».
- **Résultat montré** : fichier ECRITURES_PAIE_2026_09.csv téléchargé.
- **Erreurs à montrer (optionnel)** : « Écriture déséquilibrée : export bloqué. » ; « Paie du mois non validée : chiffres provisoires. »

---

## V3.23 — Simuler une fiche de paie
- **Durée cible** : 6 min · **Public** : utilisateurs autorisés à lire la paie · **Fiche du manuel** : 3.25
- **Objectif** : à la fin, le spectateur sait tester l'effet d'un changement sur un bulletin sans rien enregistrer.
- **À préparer avant l'enregistrement** : compte ADMIN_RH ; « M-0042 Karim Benali » avec contrat et pointage de septembre 2026.

| # | À l'écran (action) | Voix off (arabe) | Durée |
|---|---|---|---|
| 1 | Menu « Pilotage » › « Simulateur » (ou raccourci « Simulateur » de l'écran Paie) | في هذا الفيديو نجرب تأثير تغيير على كشف الأجر دون حفظ أي شيء، باستعمال المحاكي. | 0:00–0:20 |
| 2 | Galerie « Quel élément voulez-vous tester ? » | نختار العنصر الذي نريد تجربته. | 0:20–0:40 |
| 3 | « Élément à tester » : « Fiche de paie » | نختار « Fiche de paie ». | 0:40–1:00 |
| 4 | « Salarié » « M-0042 Karim Benali », « Mois » Septembre, « Année » 2026 | نختار العامل والشهر والسنة. يمكن ترك العامل فارغًا لسيناريو حر. | 1:00–1:20 |
| 5 | Bandeau d'indicateurs : « Brut cotisable », « IRG », « Net à payer », « Coût employeur » | في الأعلى المؤشرات: الخاضع للاشتراك، والضريبة، والصافي، وتكلفة المستخدم. | 1:20–1:40 |
| 6 | Clic sur « Figer comme référence » | نثبت الحالة الحالية كمرجع للمقارنة. | 1:40–2:00 |
| 7 | « Chercher et ajouter une variable » : « Salaire de base » dans la zone « Droite » | نضيف متغير الأجر الأساسي في المنطقة اليمنى. | 2:00–2:20 |
| 8 | Changement du salaire de base de 45 000 à 50 000 | نغيّر الأجر من خمسة وأربعين ألفًا إلى خمسين ألفًا. | 2:20–2:40 |
| 9 | Zoom sur les écarts « vs réf. » des indicateurs | نرى الفرق فورًا في الصافي والضريبة وتكلفة المستخدم. | 2:40–3:00 |
| 10 | « Afficher à côté » : « Pointage mensuel », chip « Liés » | نعرض الحضور بجانب الكشف. الوثيقتان مرتبطتان. | 3:00–3:20 |
| 11 | Clic sur une case du pointage : un jour « P » devient « CRP » | نغيّر يوم حضور إلى يوم استرجاع. | 3:20–3:40 |
| 12 | Le bulletin se recalcule : salaire de base réduit, ligne « (récupération) » | الكشف يُعاد حسابه فورًا: الأجر الأساسي ينقص، وتظهر بنود الاسترجاع. | 3:40–4:00 |
| 13 | Clic sur une case du bulletin, rappel « ERP : … » | يمكن أيضًا الضغط على خانة في الكشف لتغييرها. القيمة الحقيقية تبقى مذكورة. | 4:00–4:20 |
| 14 | Zone « Bas » : variable « Option IRG » | يمكن تجربة خيارات الضريبة، أو السلم، أو نسب الضمان. | 4:20–4:40 |
| 15 | Zoom sur « Valeurs légales modifiées dans cette simulation (valeurs non officielles). Rien n'est enregistré. » | هذا التنبيه يذكرنا: القيم القانونية المعدلة غير رسمية، ولا شيء يُحفظ. | 4:40–5:00 |
| 16 | Zoom sur « Modifiées hors panneaux : … » | هنا قائمة القيم التي غيّرناها بالضغط على الوثيقة. | 5:00–5:20 |
| 17 | Clic sur « Tout rétablir » | نضغط على « Tout rétablir » للرجوع إلى القيم الحقيقية. | 5:20–5:40 |
| 18 | Incrustation du résumé | النتيجة: جربنا دون أي خطر. لتطبيق تغيير حقيقي نعدّل المعلومة الأصلية ثم نطلب إعادة الحساب. بهذا ينتهي فصل الأجور. | 5:40–6:00 |

- **Texte à l'écran (incrustations)** : « Simulation : rien n'est enregistré » · « Figer comme référence » · « Tout rétablir ».
- **Résultat montré** : écarts de net affichés puis valeurs rétablies.
- **Erreurs à montrer (optionnel)** : avec un compte sans lecture de la paie, « Accès au simulateur non autorisé pour votre rôle (lecture de la paie requise). »
