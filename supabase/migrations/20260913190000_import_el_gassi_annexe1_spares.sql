-- =============================================================================
-- Import ANNEXE 1 (Documents Financiers) SPARE_PART lines for El Gassi contract
-- Source: EL_GASSI CONTRAT N° 111-2024 — Fourniture à la demande (203 lines)
-- Contract: I/111/HMD-DEG/2024
-- Verified: sum(total_price_ht) = 26 498 650,00 DA/HT
-- Replaces LABOR + SPARE_PART lines; sets contractual HT (not via canva RPC)
-- =============================================================================

begin;

-- Replace LABOR lines (drop leftovers like LAB-EXEMPLE from canva seed)
delete from public.contract_items ci
using public.ref_contracts c
where ci.contract_id = c.id
  and c.contract_number = 'I/111/HMD-DEG/2024'
  and ci.item_type = 'LABOR';

-- Align LABOR designations with Annexe 1 wording (amounts already correct)
with c as (
  select id from public.ref_contracts where contract_number = 'I/111/HMD-DEG/2024'
),
labor(item_code, designation, quantity, unit_price_ht, total_price_ht, sort_order) as (
  values
    ('LAB-CHEF-HVAC',     'Chef de maintenance HVAC',      1::numeric, 23000.00, 23000.00, 1),
    ('LAB-TECH-SUP-HVAC', 'Technicien Supérieur HVAC',     4::numeric, 18500.00, 74000.00, 2),
    ('LAB-TECH-HVAC',     'Technicien HVAC',               4::numeric, 17500.00, 70000.00, 3),
    ('LAB-FRIGO',         'Agent frigoriste',              2::numeric, 16400.00, 32800.00, 4),
    ('LAB-FACTOTUM',      'Factotum',                      2::numeric, 16400.00, 32800.00, 5)
)
insert into public.contract_items (
  contract_id, item_type, item_code, designation, unit,
  quantity, unit_price_ht, total_price_ht, sort_order
)
select
  c.id, 'LABOR', l.item_code, l.designation, 'JOUR',
  l.quantity, l.unit_price_ht, l.total_price_ht, l.sort_order
from c cross join labor l
on conflict (contract_id, item_type, item_code) do update
  set designation = excluded.designation,
      quantity = excluded.quantity,
      unit_price_ht = excluded.unit_price_ht,
      total_price_ht = excluded.total_price_ht,
      sort_order = excluded.sort_order,
      unit = excluded.unit,
      updated_at = now();

-- Replace SPARE_PART lines only
delete from public.contract_items ci
using public.ref_contracts c
where ci.contract_id = c.id
  and c.contract_number = 'I/111/HMD-DEG/2024'
  and ci.item_type = 'SPARE_PART';

insert into public.contract_items (
  contract_id, item_type, item_code, designation, unit,
  quantity, unit_price_ht, total_price_ht, sort_order
)
select
  c.id,
  'SPARE_PART',
  v.item_code,
  v.designation,
  v.unit,
  v.quantity,
  v.unit_price_ht,
  v.total_price_ht,
  v.sort_order
from public.ref_contracts c
cross join (
  values
    ('SP-001', 'Compresseurs hermétique 1/5 CV, R134A, Réfrigérateur 350L', 'U', 5.0000, 7800.0000, 39000.00, 1),
    ('SP-002', 'Compresseurs hermétique 1/6 CV, R134A, Réfrigérateur 240L', 'U', 10.0000, 7500.0000, 75000.00, 2),
    ('SP-003', 'Compresseurs hermétique 1/8 CV, R134A, Réfrigérateur 160L', 'U', 20.0000, 6000.0000, 120000.00, 3),
    ('SP-004', 'Compresseurs hermétique 1/10 CV, R134A, Réfrigérateur 50L', 'U', 20.0000, 5200.0000, 104000.00, 4),
    ('SP-005', 'Relais de démarrage compresseur 1/5 CV de réfrigérateur 350L', 'U', 5.0000, 150.0000, 750.00, 5),
    ('SP-006', 'Relais de démarrage compresseur 1/6 CV de réfrigérateur 240L', 'U', 10.0000, 150.0000, 1500.00, 6),
    ('SP-007', 'Relais de démarrage compresseur 1/8 CV de réfrigérateur 160L', 'U', 20.0000, 150.0000, 3000.00, 7),
    ('SP-008', 'Joint de porte pour réfrigérateur ENIEM 240L', 'U', 5.0000, 2600.0000, 13000.00, 8),
    ('SP-009', 'Joint de porte pour réfrigérateur ENIEM 160L', 'U', 10.0000, 2600.0000, 26000.00, 9),
    ('SP-010', 'Evaporateur (Roll bond) pour réfrigérateurs ENIEM 240L', 'U', 10.0000, 3800.0000, 38000.00, 10),
    ('SP-011', 'Evaporateur (Roll bond) pour réfrigérateurs ENIEM 160L', 'U', 10.0000, 15000.0000, 150000.00, 11),
    ('SP-012', 'Thermostat VP4 ou VC1 pour réfrigérateurs ENIEM 240L et 160L', 'U', 20.0000, 950.0000, 19000.00, 12),
    ('SP-013', 'Filtres déshydrateurs à souder de : 10 grammes', 'U', 80.0000, 200.0000, 16000.00, 13),
    ('SP-014', 'Filtres déshydrateurs à souder de : 15 grammes', 'U', 30.0000, 200.0000, 6000.00, 14),
    ('SP-015', 'Tube de charge Schrader 1/4" à souder.', 'U', 150.0000, 100.0000, 15000.00, 15),
    ('SP-016', 'Ampoule d’éclairage pour Réfrigérateur E14 – 15 Watts – 230 Vac.', 'U', 100.0000, 80.0000, 8000.00, 16),
    ('SP-017', 'Compresseur hermétique rotatif R22 pour climatiseur monobloc LG 11000Btu/h', 'U', 20.0000, 16500.0000, 330000.00, 17),
    ('SP-018', 'Compresseur hermétique rotatif tropicalisé pour climatiseur 12000Btu/h, fréon R22, (de marque : LG, Toshiba, Matsushita, Panasonic ou Danfoss.)', 'U', 60.0000, 16500.0000, 990000.00, 18),
    ('SP-019', 'Compresseur hermétique rotatif tropicalisé pour climatiseur 18000Btu/h, fréon R22 (de marque : LG, Toshiba, Matsushita, Panasonic ou Danfoss.)', 'U', 20.0000, 21000.0000, 420000.00, 19),
    ('SP-020', 'Compresseur hermétique rotatif tropicalisé pour climatiseur 12000Btu/h, fréon R410 ou R407C (de marque : LG, Toshiba, Matsushita, Panasonic ou Danfoss.)', 'U', 60.0000, 21500.0000, 1290000.00, 20),
    ('SP-021', 'Compresseur hermétique rotatif tropicalisé pour climatiseur 18000Btu/h, fréon R410 ou R407C (de marque : LG, Toshiba, Matsushita, Panasonic ou Danfoss.)', 'U', 10.0000, 27500.0000, 275000.00, 21),
    ('SP-022', 'Compresseur hermétique rotatif tropicalisé pour climatiseur 24000Btu/h, fréon R410 ou R407C (de marque : LG, Toshiba, Matsushita, Panasonic ou Danfoss.)', 'U', 10.0000, 39000.0000, 390000.00, 22),
    ('SP-023', 'Ventilateur centrifuge de l’unité intérieure de climatiseur type split système 12000 Btu/h', 'U', 40.0000, 2900.0000, 116000.00, 23),
    ('SP-024', 'Ventilateur centrifuge de l’unité intérieure de climatiseur type split système 18000 Btu/h', 'U', 15.0000, 2900.0000, 43500.00, 24),
    ('SP-025', 'Ventilateur centrifuge de l’unité intérieure de climatiseur type split système 24000 Btu/h', 'U', 10.0000, 3800.0000, 38000.00, 25),
    ('SP-026', 'Ventilateur hélicoïde pour l’unité extérieure de climatiseur type Split System 12000 Btu/h.', 'U', 15.0000, 3500.0000, 52500.00, 26),
    ('SP-027', 'Ventilateur hélicoïde pour l’unité extérieure de climatiseur type Split System 18000 Btu/h', 'U', 10.0000, 3500.0000, 35000.00, 27),
    ('SP-028', 'Ventilateur hélicoïde pour l’unité extérieure de climatiseur type Split System 24000 Btu/h', 'U', 5.0000, 3500.0000, 17500.00, 28),
    ('SP-029', 'Moteur électrique pour ventilo-condenseur de climatiseur type split système 12000 BTU/h.', 'U', 20.0000, 3500.0000, 70000.00, 29),
    ('SP-030', 'Moteur électrique pour ventilo-condenseur de climatiseur type split système 18000 BTU/h.', 'U', 10.0000, 3500.0000, 35000.00, 30),
    ('SP-031', 'Moteur électrique pour ventilo-condenseur de climatiseur type split système 24000 BTU/h.', 'U', 10.0000, 3500.0000, 35000.00, 31),
    ('SP-032', 'Moteur turbine de l’unité intérieure de climatiseur type split système 12000 Btu/h', 'U', 15.0000, 3500.0000, 52500.00, 32),
    ('SP-033', 'Moteur turbine de l’unité intérieure de climatiseur type split système 18000 Btu/h', 'U', 10.0000, 3500.0000, 35000.00, 33),
    ('SP-034', 'Moteur turbine de l’unité intérieure de climatiseur type split système 24000 Btu/h', 'U', 5.0000, 3500.0000, 17500.00, 34),
    ('SP-035', 'Carte Électronique avec variateur de vitesse type standard pour split système.', 'U', 40.0000, 2200.0000, 88000.00, 35),
    ('SP-036', 'Carte Électronique sans variateur de vitesse type standard pour split système.', 'U', 40.0000, 2200.0000, 88000.00, 36),
    ('SP-037', 'Télécommande universelle pour climatiseurs (Split Système)', 'U', 30.0000, 600.0000, 18000.00, 37),
    ('SP-038', 'Condensateurs de : 01 à 05 µf « microfarad »', 'U', 40.0000, 150.0000, 6000.00, 38),
    ('SP-039', 'Condensateurs de : 06 à 10 µf « microfarad »', 'U', 20.0000, 450.0000, 9000.00, 39),
    ('SP-040', 'Condensateurs de : 25 à 30 µf « microfarad »', 'U', 150.0000, 400.0000, 60000.00, 40),
    ('SP-041', 'Condensateurs de : 35 à 40 µf « microfarad »', 'U', 120.0000, 500.0000, 60000.00, 41),
    ('SP-042', 'Condensateurs de : 45 à 50 µf « microfarad »', 'U', 80.0000, 550.0000, 44000.00, 42),
    ('SP-043', 'Condensateur combine : 30 /1.5 µf « microfarad »', 'U', 70.0000, 450.0000, 31500.00, 43),
    ('SP-044', 'Électrovanne à 4 voies pour climatiseur split système 12000 BTU/h', 'U', 15.0000, 1800.0000, 27000.00, 44),
    ('SP-045', 'Électrovanne à 4 voies pour climatiseur split système 18000 BTU/h', 'U', 10.0000, 2400.0000, 24000.00, 45),
    ('SP-046', 'Électrovanne à 4 voies pour climatiseur split système 24000 BTU/h', 'U', 8.0000, 3600.0000, 28800.00, 46),
    ('SP-047', 'Compresseur à piston, UNITE HERMITIQUE, modèle : AEZ4430Y, R134a, 220V, ou un équivalant.', 'U', 1.0000, 17800.0000, 17800.00, 47),
    ('SP-048', 'Compresseur à piston, UNITE HERMITIQUE, modèle : AE4450Y, R134a, 220V, ou un équivalent.', 'U', 1.0000, 21500.0000, 21500.00, 48),
    ('SP-049', 'Compresseur à piston, ELECTROLUX, modèle : GP12TB, R134a, 220V, ou un équivalant.', 'U', 1.0000, 17800.0000, 17800.00, 49),
    ('SP-050', 'Compresseur à piston, ELECTROLUX, modèle : GL90TB, R134a, 220V, ou un équivalent.', 'U', 1.0000, 9000.0000, 9000.00, 50),
    ('SP-051', 'Compresseur à piston, DANFOSS, modèle : SC18G, R134a, 220V, ou un équivalant.', 'U', 1.0000, 26800.0000, 26800.00, 51),
    ('SP-052', 'Compresseur à piston, DANFOSS, modèle : FR8.5CL, R404a, 220V, ou un équivalent.', 'U', 1.0000, 29000.0000, 29000.00, 52),
    ('SP-053', 'Compresseur à piston, DANFOSS, modèle : SC18CL, R404a, 220V, ou un équivalent.', 'U', 1.0000, 32000.0000, 32000.00, 53),
    ('SP-054', 'Compresseur à piston, UNITE HERMITIQUE, modèle : CAJ2446Z, R404a, 220V, ou un équivalent.', 'U', 1.0000, 49500.0000, 49500.00, 54),
    ('SP-055', 'Filtre déshydrateurs 1/2", avec raccords à visser compatible avec le R404a.', 'U', 3.0000, 2600.0000, 7800.00, 55),
    ('SP-056', 'Filtre déshydrateurs 3/8", à souder, compatible avec le R407c.', 'U', 3.0000, 2600.0000, 7800.00, 56),
    ('SP-057', 'Filtre déshydrateurs 5/8", avec raccords à visser compatible avec le R404a.', 'U', 2.0000, 3400.0000, 6800.00, 57),
    ('SP-058', 'Filtre déshydrateurs 7/8", à souder compatible avec le R134a.', 'U', 4.0000, 5400.0000, 21600.00, 58),
    ('SP-059', 'Filtre déshydrateurs en cartouche, compatible avec le R134a.', 'U', 10.0000, 2100.0000, 21000.00, 59),
    ('SP-060', 'Électrovanne à 4 voies, 1/2"- 3/4", avec bobine 230V, pour armoire de climatisation 48000 Btu/h.', 'U', 4.0000, 6500.0000, 26000.00, 60),
    ('SP-061', 'Électrovanne à 4 voies, 7/8" - 1 1/8", avec bobine 230V, pour roof top York 62000 Btu/h.', 'U', 4.0000, 6500.0000, 26000.00, 61),
    ('SP-062', 'Electrovanne droite à souder 1 5/8"', 'U', 2.0000, 12000.0000, 24000.00, 62),
    ('SP-063', 'Electrovanne droite à souder 1 1/8"', 'U', 2.0000, 12000.0000, 24000.00, 63),
    ('SP-064', 'Electrovanne droite à souder 3/8"', 'U', 4.0000, 5400.0000, 21600.00, 64),
    ('SP-065', 'Electrovanne droite à souder 1/2"', 'U', 2.0000, 4600.0000, 9200.00, 65),
    ('SP-066', 'Bobine électrique d’électrovanne liquide, 220V, 50Hz, de 6 Watts à 17 Watts', 'U', 15.0000, 2300.0000, 34500.00, 66),
    ('SP-067', 'Clapet anti-retour droit à souder, NRV 3/8, -50⁰c à 140⁰c.', 'U', 2.0000, 5500.0000, 11000.00, 67),
    ('SP-068', 'Huile frigorifique utilisé avec les fluides frigorigènes HFC (R407C, R410A, R134A) comme le : BSE170, POE 160SZ, DAPHNE FVC68D, OZ140POE, OZ213POE, SOLEST 170, ou des huiles ressemblantes', 'Litre', 80.0000, 8700.0000, 696000.00, 68),
    ('SP-069', 'Huile frigorifique compatible avec les fluides frigorigènes HCFC (R22)', 'Litre', 30.0000, 1200.0000, 36000.00, 69),
    ('SP-070', 'Fluide frigorigène R22, bouteille de 13Kg', 'U', 150.0000, 24000.0000, 3600000.00, 70),
    ('SP-071', 'Fluide frigorigène R404A, bouteille de 13Kg', 'U', 100.0000, 18000.0000, 1800000.00, 71),
    ('SP-072', 'Fluide frigorigène R407C, bouteille de 13Kg', 'U', 100.0000, 19000.0000, 1900000.00, 72),
    ('SP-073', 'Fluide frigorigène R410A, bouteille de 13Kg', 'U', 20.0000, 19000.0000, 380000.00, 73),
    ('SP-074', 'Fluide frigorigène R141B, bouteille de 13Kg, ou un équivalent.', 'U', 180.0000, 24000.0000, 4320000.00, 74),
    ('SP-075', 'Fluide frigorigène R134A, bouteille de 13Kg', 'U', 150.0000, 19000.0000, 2850000.00, 75),
    ('SP-076', 'Relais KRIWAN type INT 69 DMY pour compresseur scroll Danfoss', 'U', 20.0000, 22000.0000, 440000.00, 76),
    ('SP-077', 'Moteur turbine de l’unité intérieure d’armoire de climatisation 60000 Btu/h', 'U', 3.0000, 9500.0000, 28500.00, 77),
    ('SP-078', 'Moto-ventilo condenseur pour armoire de climatisation 60000 Btu/h.', 'U', 3.0000, 9500.0000, 28500.00, 78),
    ('SP-079', 'Extracteur d’air, 230V, 50HZ, 11W, 118x118x37 mm', 'U', 8.0000, 3500.0000, 28000.00, 79),
    ('SP-080', 'Extracteur d’air, 230V, 50HZ, 22W, 150x150 mm', 'U', 6.0000, 4500.0000, 27000.00, 80),
    ('SP-081', 'Carte de commande électronique de ventilo-convecteur AIRWELL, 220-240 V, 50/60 HZ, FCU-BU, modèle 926A194- 04, ou un équivalent', 'U', 3.0000, 24000.0000, 72000.00, 81),
    ('SP-082', 'Pressostat de sécurité HP préréglé, à souder, et a réarmement automatique, DANFOSS, mod : ACB-2UA355W, ou un équivalent.', 'U', 3.0000, 4500.0000, 13500.00, 82),
    ('SP-083', 'Pressostat de sécurité HP préréglé, à raccord femelle 1/4", DANFOSS, pression de déclanchement 22.8 Bars, pression de ré-enclenchement 15.9 Bars, mod : G63P3031, ou un équivalent', 'U', 1.0000, 4500.0000, 4500.00, 83),
    ('SP-084', 'Pressostat de sécurité HP préréglé, à raccord femelle 1/4", pression de déclanchement 30 Bars, pression de ré- enclenchement : 24 Bars.', 'U', 2.0000, 4500.0000, 9000.00, 84),
    ('SP-085', 'Pressostat de sécurité HP préréglé, à raccord femelle 1/4", pression de déclanchement 27 Bars, pression de ré- enclenchement 18Bars, 6A, 240 VAC, modèle PS80-01-0009 (Texas Instruments), ou un équivalent', 'U', 4.0000, 4500.0000, 18000.00, 85),
    ('SP-086', 'Pressostat de sécurité BP préréglé, à raccord femelle 1/4", déclanchement 02 Bars, et à réarmement manuel.', 'U', 2.0000, 4500.0000, 9000.00, 86),
    ('SP-087', 'Pressostat de sécurité BP préréglé, à raccord femelle 1/4", pression de déclanchement 0.5 Bar, pression de ré- enclenchement : 1.5 Bars.', 'U', 2.0000, 4500.0000, 9000.00, 87),
    ('SP-088', 'Pressostat de sécurité BP préréglé, à souder 1/4", DANFOSS (ACB-2UA355W)', 'U', 2.0000, 4500.0000, 9000.00, 88),
    ('SP-089', 'Pressostat combiné HP/BP, RANCO, BP= - 0.5 bar à 7 bars, HP= 3 bars à 30 bars, ou un équivalant', 'U', 4.0000, 4500.0000, 18000.00, 89),
    ('SP-090', 'Pressostat BP, KP1 DANFOSS / Set point : - 0,2 à 7,5 Bars, Diff : 0.7 à 4 Bars, ou un équivalent.', 'U', 4.0000, 4500.0000, 18000.00, 90),
    ('SP-091', 'Pressostat HP, RANCO, 016 H6750, Set point : 7 à 30 bars, Diff : 1 à 8 bars, ou un équivalent.', 'U', 6.0000, 4500.0000, 27000.00, 91),
    ('SP-092', 'Pressostat d’air différentiel (Aérostat), set : 0.5 à 5 mbar, IP54, HONEYWELL mod : HWL-205B, ou un', 'U', 15.0000, 4500.0000, 67500.00, 92),
    ('SP-093', 'Thermostat électronique (Thermorégulateur) avec sonde, DIXELL, 8+8+8A, 230VAC, modèle: XR06CX', 'U', 2.0000, 6900.0000, 13800.00, 93),
    ('SP-094', 'Détendeur thermostatique à charge MOP, ALCO CONTROLS, R410A, mod : TX3-Z38, ou un équivalent.', 'U', 1.0000, 15800.0000, 15800.00, 94),
    ('SP-095', 'Détendeur thermostatique à charge MOP, ALCO CONTROLS, R410A, mod : TX6-Z13, ou un équivalent.', 'U', 1.0000, 15800.0000, 15800.00, 95),
    ('SP-096', 'Détendeur thermostatique à charge MOP, SPORLAN, R404A, mod : KT- 43-SZ, ou un équivalent.', 'U', 1.0000, 15800.0000, 15800.00, 96),
    ('SP-097', 'Purgeurs d’air automatique, avec raccord male 15/21 - (1/2")', 'U', 30.0000, 3500.0000, 105000.00, 97),
    ('SP-098', 'Capillaire flexible en thermoplastique (Polyamide) avec 02 écrous 1/4", temp/s : - 40°c au + 80°c, pres/s : 30 bar .', 'M/L', 150.0000, 500.0000, 75000.00, 98),
    ('SP-099', 'Manomètre de lecture HP à bain d’huile encastrable, pour circuit frigorifique, avec diamètre de cadran de 63 mm, connexion 1/4", fréon R22, R134a, R404a, R407c.', 'U', 15.0000, 3500.0000, 52500.00, 99),
    ('SP-100', 'Manomètre de lecture BP à bain d’huile encastrable, pour circuit frigorifique, avec diamètre de cadran de 63 mm, connexion 1/4", fréon R22, R134a, R404a, R407c.', 'U', 15.0000, 3500.0000, 52500.00, 100),
    ('SP-101', 'Thermomètre de circuit hydraulique à cadran en inox de diamètre 100mm, plage de lecture : -10 à 60°C, le doigt plongeur : 63 mm, diamètre de doigt plongeur : 8 mm, raccord arrière centré avec filetage 15/21(1/2").', 'U', 10.0000, 1800.0000, 18000.00, 101),
    ('SP-102', 'Manomètre de circuit hydraulique à cadran en inox de diamètre 100 mm, plage de lecture : 0 à 10 bar, avec un raccord inferieur fileté: 15/21 (1/2").', 'U', 10.0000, 3500.0000, 35000.00, 102),
    ('SP-103', 'Roulement a une rangé de billes étanche CES.205', 'U', 20.0000, 1500.0000, 30000.00, 103),
    ('SP-104', 'Roulement a une rangé de billes étanche 608- 2RSH/C3 ou 608-ZZ', 'U', 210.0000, 1500.0000, 315000.00, 104),
    ('SP-105', 'Roulement a une rangé de billes étanche 6001- 2RSH/C3 ou 6001-ZZ', 'U', 20.0000, 1500.0000, 30000.00, 105),
    ('SP-106', 'Roulement a une rangé de billes étanche 6004- 2RSH/C3 ou 6004-ZZ', 'U', 20.0000, 1500.0000, 30000.00, 106),
    ('SP-107', 'Roulement a une rangé de billes étanche 6005- 2RSH/C3 ou 6005-ZZ', 'U', 20.0000, 1500.0000, 30000.00, 107),
    ('SP-108', 'Roulement a une rangé de billes étanche 6200- 2RSH/C3 ou 6200-ZZ', 'U', 50.0000, 1500.0000, 75000.00, 108),
    ('SP-109', 'Roulement a une rangé de billes étanche 6201- 2RSH/C3 ou 6201-ZZ', 'U', 50.0000, 1500.0000, 75000.00, 109),
    ('SP-110', 'Roulement a une rangé de billes étanche 6202- 2RSH/C3 ou 6202-ZZ', 'U', 30.0000, 1500.0000, 45000.00, 110),
    ('SP-111', 'Roulement a une rangé de billes étanche 6203- 2RSH/C3 ou 6203-ZZ', 'U', 30.0000, 1500.0000, 45000.00, 111),
    ('SP-112', 'Roulement a une rangé de billes étanche 6204- 2RSH/C3 ou 6204-ZZ', 'U', 50.0000, 1500.0000, 75000.00, 112),
    ('SP-113', 'Roulement a une rangé de billes étanche 6205- 2RSH/C3 ou 6205-ZZ', 'U', 30.0000, 1500.0000, 45000.00, 113),
    ('SP-114', 'Roulement a une rangé de billes étanche 6206- 2RSH/C3 ou 6206-ZZ', 'U', 30.0000, 1500.0000, 45000.00, 114),
    ('SP-115', 'Roulement a une rangé de billes étanche 6304- 2RSH/C3 ou 6304-ZZ', 'U', 20.0000, 1500.0000, 30000.00, 115),
    ('SP-116', 'Roulement a une rangé de billes étanche 6306- 2RSH/C3 ou 6306-ZZ', 'U', 20.0000, 1500.0000, 30000.00, 116),
    ('SP-117', 'Roulement a une rangé de billes étanche 6308- 2RSH/C3 ou 6308-ZZ', 'U', 20.0000, 1500.0000, 30000.00, 117),
    ('SP-118', 'Roulement a une rangé de billes étanche 6309- 2RSH/C3 ou 6309-ZZ', 'U', 10.0000, 1500.0000, 15000.00, 118),
    ('SP-119', 'Roulement a une rangé de billes étanche 6311- 2RSH/C3 ou 6311-ZZ', 'U', 10.0000, 1500.0000, 15000.00, 119),
    ('SP-120', 'Roulement a une rangé de billes étanche 6312- 2RSH/C3 ou 6312-ZZ', 'U', 10.0000, 1500.0000, 15000.00, 120),
    ('SP-121', 'Courroie SPA entre : 900mm et 1000mm', 'U', 60.0000, 1500.0000, 90000.00, 121),
    ('SP-122', 'Courroie SPA entre : 1000mm et 1500mm', 'U', 100.0000, 1500.0000, 150000.00, 122),
    ('SP-123', 'Courroie SPA entre : 1500mm et 2000mm', 'U', 40.0000, 1500.0000, 60000.00, 123),
    ('SP-124', 'Courroie SPZ entre : 1325mm et 1475mm', 'U', 40.0000, 1500.0000, 60000.00, 124),
    ('SP-125', 'Courroie SPB entre : 1900mm et 2800mm', 'U', 40.0000, 1500.0000, 60000.00, 125),
    ('SP-126', 'Courroie BX entre : BX90 et BX 108', 'U', 30.0000, 1500.0000, 45000.00, 126),
    ('SP-127', 'Résistance de porte pour chambres froides négatives, 120 Watts, 230 Volts, L= 5.86 m.', 'U', 10.0000, 3800.0000, 38000.00, 127),
    ('SP-128', 'Kit de résistances de dégivrage de l’évaporateur LU-VE (F35HC59-6), 230V, 4 X 450Watts + 1 X 275Watts.', 'U', 1.0000, 34000.0000, 34000.00, 128),
    ('SP-129', 'Kit de résistances de dégivrage de l’évaporateur LU-VE (F35HC1176), 230V, 4 X 800Watts + 1 X 480Watts.', 'U', 1.0000, 34000.0000, 34000.00, 129),
    ('SP-130', 'Résistance de carter pour compresseurs BITZER : 4EC-6.2 Y-40S, et 2CC-4.2Y-40S, type CTP autorégulant, 0-120 Watts, 230V, ou une équivalente.', 'U', 2.0000, 12500.0000, 25000.00, 130),
    ('SP-131', 'Résistance de carter 65w-100w / 520mm-800mm pour gamme de compresseurs DANFOSS', 'U', 20.0000, 12500.0000, 250000.00, 131),
    ('SP-132', 'Résistance carter 100w-130w / 760mm-1050mm pour gamme de compresseurs DANFOSS', 'U', 20.0000, 12500.0000, 250000.00, 132),
    ('SP-133', 'Résistance d’écoulement pour chambre froide 21770-HP5 et 21 771-HP5, RES/SC', 'U', 14.0000, 12500.0000, 175000.00, 133),
    ('SP-134', 'Transformateur de tension pour circuit de commande 24V/230V, 150VA.', 'U', 1.0000, 5000.0000, 5000.00, 134),
    ('SP-135', 'Interrupteur à bascule lumineux vert bipolaire Marche-arrêt, 230V, 16A.', 'U', 10.0000, 350.0000, 3500.00, 135),
    ('SP-136', 'Fusible 10 x 38 gG différant calibre de 1A à 20A', 'U', 60.0000, 100.0000, 6000.00, 136),
    ('SP-137', 'Kit de Garniture mécanique de pompe à eau différents diamètres de 10 à 40 mm', 'U', 10.0000, 2500.0000, 25000.00, 137),
    ('SP-138', 'Lampes de signalisation à LED, 230Vac, INF 20mA, marque : GAVE ou SCHNEIDER, model: 560L 230V, ou une équivalente.', 'U', 30.0000, 650.0000, 19500.00, 138),
    ('SP-139', 'Lampe de signalisation à LED TELEMECANIQUE, couleur blanche, Rouge, Orange et Bleu 24 Volts, mod : XB4BVB1, ou une équivalente.', 'U', 100.0000, 650.0000, 65000.00, 139),
    ('SP-140', 'Contacteur modulaire, type CT, 02 pôles NO, 25A, 230-240V, MERLIN-GERIN PN 15959, ou un équivalent.', 'U', 1.0000, 10700.0000, 10700.00, 140),
    ('SP-141', 'Contacteur SIEMENS 3RT1045-3AL20, 3Phases, 120A, 230V, 50/60HZ, ou un équivalent.', 'U', 1.0000, 4000.0000, 4000.00, 141),
    ('SP-142', 'Contacteur SIEMENS 3RT1035-3AL20, 3Phases, 60A, 230V, 50/60HZ, ou un équivalent.', 'U', 1.0000, 2000.0000, 2000.00, 142),
    ('SP-143', 'Contacteur SIEMENS 3RT1026-3AL20, 3Phases, 25A, 230V, 50/60 HZ, ou un équivalent.', 'U', 3.0000, 10700.0000, 32100.00, 143),
    ('SP-144', 'Contacteur SIEMENS 3RT1017-2AP02, 3Phases, 22A, 230V, 50/60 HZ, ou un équivalent.', 'U', 2.0000, 15000.0000, 30000.00, 144),
    ('SP-145', 'Relais thermique SIEMENS 3RU1116-1JC1, avec une plage de réglage de : 7 à 10A, 1NO, 1NC, ou un équivalent.', 'U', 2.0000, 3600.0000, 7200.00, 145),
    ('SP-146', 'Relais thermique SIEMENS 3RU1116-1HC1, avec une plage de réglage de : 5.5 à 8A, 1NO, 1NC, ou un équivalent.', 'U', 2.0000, 3600.0000, 7200.00, 146),
    ('SP-147', 'Relais auxiliaire SCHNEIDER 24V, RXL4A06B1B7 OU RXM4AB1B7, 6A-250VAC, 50/60HZ, ou un équivalent.', 'U', 6.0000, 3600.0000, 21600.00, 147),
    ('SP-148', 'Relais de phase (contrôle d’asymétrie de phases, séquence de phases, perte de phase)', 'U', 10.0000, 1200.0000, 12000.00, 148),
    ('SP-149', 'Interrupteur différentiel, 4poles, 40A, 30mA, gamme : ACTI 9, Schneider Electric ou équivalent', 'U', 2.0000, 14000.0000, 28000.00, 149),
    ('SP-150', 'Bouton poussoir noir TELEMECANIQUE, mod : XB4BA21, ou un équivalent.', 'U', 3.0000, 800.0000, 2400.00, 150),
    ('SP-151', 'Commutateur sélecteur à 02 positions, TELEMECANIQUE, 3A, 15 AC, 240V, modèle : XB4BD21, ou un équivalent', 'U', 10.0000, 850.0000, 8500.00, 151),
    ('SP-152', 'Additif de contact auxiliaire frontal, SCHNEIDER GVAE11, 2,5A, 250V, 120VA/240V, AC15.', 'U', 2.0000, 1500.0000, 3000.00, 152),
    ('SP-153', 'Disjoncteur moteur TELEMECANIQUE, model : GV2ME03.', 'U', 1.0000, 10000.0000, 10000.00, 153),
    ('SP-154', 'Disjoncteur moteur TELEMECANIQUE, model : GV2ME05.', 'U', 1.0000, 11000.0000, 11000.00, 154),
    ('SP-155', 'Disjoncteur moteur TELEMECANIQUE, model : GV2ME06.', 'U', 1.0000, 12000.0000, 12000.00, 155),
    ('SP-156', 'Disjoncteur moteur TELEMECANIQUE, model : GV2ME08.', 'U', 2.0000, 14000.0000, 28000.00, 156),
    ('SP-157', 'Disjoncteur moteur TELEMECANIQUE, model : GV2ME10.', 'U', 2.0000, 15000.0000, 30000.00, 157),
    ('SP-158', 'Disjoncteur moteur TELEMECANIQUE, model : GV2ME14.', 'U', 2.0000, 18000.0000, 36000.00, 158),
    ('SP-159', 'Disjoncteur moteur TELEMECANIQUE, model : GV2ME16.', 'U', 2.0000, 20000.0000, 40000.00, 159),
    ('SP-160', 'Disjoncteur moteur TELEMECANIQUE, model : GV2ME20.', 'U', 1.0000, 22000.0000, 22000.00, 160),
    ('SP-161', 'Disjoncteur moteur TELEMECANIQUE, model : GV2ME22', 'U', 2.0000, 25000.0000, 50000.00, 161),
    ('SP-162', 'Disjoncteur moteur TELEMECANIQUE, model : GV2ME32.', 'U', 2.0000, 30000.0000, 60000.00, 162),
    ('SP-163', 'Ampoule d’éclairage pour centrale de traitement d’air E27, 60W, 24 Vac.', 'U', 36.0000, 900.0000, 32400.00, 163),
    ('SP-164', 'Goulotte pour climatiseur split système 100 x 50mm (longueur : 2m).', 'U', 240.0000, 1400.0000, 336000.00, 164),
    ('SP-165', 'Isolant thermique pour tuyauterie 1/2" (longueur : 2m)', 'U', 300.0000, 150.0000, 45000.00, 165),
    ('SP-166', 'Isolant thermique pour tuyauterie 1/4" (longueur : 2m)', 'U', 300.0000, 150.0000, 45000.00, 166),
    ('SP-167', 'Ruban adhésif en aluminium (pour climatisation), 50 x 1000 mm', 'U', 50.0000, 200.0000, 10000.00, 167),
    ('SP-168', 'Isolant thermique adhésif 3 x 50 x 10000 mm.', 'U', 150.0000, 1500.0000, 225000.00, 168),
    ('SP-169', 'Décapant utilisé dans la soudure avec du Bronze.', 'Boite', 2.0000, 800.0000, 1600.00, 169),
    ('SP-170', 'Décapant utilisé avec la soudure de l’Aluminium.', 'Boite', 2.0000, 1000.0000, 2000.00, 170),
    ('SP-171', 'Etain pour dépannage électronique (cid:0)(cid:0)0,5/5000 mm', 'Bobine', 4.0000, 800.0000, 3200.00, 171),
    ('SP-172', 'Cosse femelle 1.5 mm2 « Sachet de 100U »', 'Sac', 6.0000, 800.0000, 4800.00, 172),
    ('SP-173', 'Cosse femelle 2.5 mm2 « Sachet de 100U »', 'Sac', 5.0000, 800.0000, 4000.00, 173),
    ('SP-174', 'Dégrippant-lubrifiant aérosol 300 ml', 'U', 10.0000, 900.0000, 9000.00, 174),
    ('SP-175', 'Colle forte spéciale pour obturer les fuites', 'U', 6.0000, 2300.0000, 13800.00, 175),
    ('SP-176', 'Toile émeri de polissage (Entre P150 et P 220)', 'rouleaux', 1.0000, 6000.0000, 6000.00, 176),
    ('SP-177', 'Collier colson en plastique 360 x 3.5 mm (Sac de 100U)', 'Sachet', 5.0000, 2500.0000, 12500.00, 177),
    ('SP-178', 'Cheville métalliques M06 (Brique)', 'U', 200.0000, 50.0000, 10000.00, 178),
    ('SP-179', 'Cheville métalliques M08 (Brique)', 'U', 200.0000, 60.0000, 12000.00, 179),
    ('SP-180', 'Cheville métalliques M10 (Brique)', 'U', 250.0000, 70.0000, 17500.00, 180),
    ('SP-181', 'Cheville plastiques diamètre 06mm (Sac de 500U)', 'Sac', 2.0000, 600.0000, 1200.00, 181),
    ('SP-182', 'Cheville plastiques diamètre 08 mm (Sac de 500U)', 'Sac', 2.0000, 600.0000, 1200.00, 182),
    ('SP-183', 'Cheville plastiques diamètre 10 mm (Sac de 500U)', 'Sac', 1.0000, 600.0000, 600.00, 183),
    ('SP-184', 'Vis Parker 40mm', 'Kg', 3.0000, 2000.0000, 6000.00, 184),
    ('SP-185', 'Pate thermique pour sonde de température', 'U', 6.0000, 800.0000, 4800.00, 185),
    ('SP-186', 'Coffré des joints toriques de différents diamètres', 'U', 2.0000, 14000.0000, 28000.00, 186),
    ('SP-187', 'Transformateur de tension 24V, Prim : 220/240VAC, Sec : 24V VAC, 75VA, 50/60HZ', 'U', 5.0000, 5500.0000, 27500.00, 187),
    ('SP-188', 'Fusible SEIMENS, type Gl/Gg 50A , PN: 5SB4 21; ou un équivalent', 'U', 10.0000, 350.0000, 3500.00, 188),
    ('SP-189', 'Fusible SEIMENS, type Gl/Gg 16A , PN: 55B2 61; ou un équivalent', 'U', 20.0000, 250.0000, 5000.00, 189),
    ('SP-190', 'Fusible SEIMENS, type Gl/Gg 10A , PN: 53B2 51; ou un équivalent', 'U', 10.0000, 250.0000, 2500.00, 190),
    ('SP-191', 'Fusible SEIMENS, type Gl/Gg 4A , PN: 5SB2 21; ou un équivalent', 'U', 20.0000, 200.0000, 4000.00, 191),
    ('SP-192', 'Fusible SEIMENS, type Gl/Gg 2A, PN: 5SE2 202 ; ou un équivalent', 'U', 10.0000, 150.0000, 1500.00, 192),
    ('SP-193', 'Fusible SEIMENS, type Gl/Gg 2A , PN: 5SB2.11; ou un équivalent', 'U', 10.0000, 150.0000, 1500.00, 193),
    ('SP-194', 'Contacteur SEIMENS, 18A-690V, 230V, 50/60 HZ, PN : 3RT1015-2AP02 ; ou un équivalent', 'U', 4.0000, 4700.0000, 18800.00, 194),
    ('SP-195', 'Relais miniature OMRON, mod: MY2; ou un équivalent', 'U', 2.0000, 1900.0000, 3800.00, 195),
    ('SP-196', 'Relais thermique SEIMENS, 7 à 10A, PN: 3RU1116-1JC1; ou un équivalent', 'U', 2.0000, 4600.0000, 9200.00, 196),
    ('SP-197', 'Relais de phase SEIMENS, PN: 3UG3511-1BQ50; ou un équivalent', 'U', 2.0000, 15000.0000, 30000.00, 197),
    ('SP-198', 'Sectionneur Technoelectric, PN: VC2P 3X160ME; ou un équivalent', 'U', 1.0000, 16000.0000, 16000.00, 198),
    ('SP-199', 'Sectionneur GEWISS, 4P, 32 A , 500V , IP65, PN: GW70436 ; ou un équivalent', 'U', 1.0000, 4300.0000, 4300.00, 199),
    ('SP-200', 'Sectionneur GEWISS, 4P, 16 A , 500V , IP65, PN: GW70433 ; ou un équivalent', 'U', 1.0000, 4300.0000, 4300.00, 200),
    ('SP-201', 'Contrôleur de débit d''eau, MECANICA TOVO, mod: SFS050M1G1/4 ; ou un équivalent.', 'U', 2.0000, 6500.0000, 13000.00, 201),
    ('SP-202', 'Servomoteur de vanne papillon BELIMO GM24, 30NM, 24v AC/DC, 6VA, 3W, 50/60Hz, IP54; ou un équivalent.', 'U', 4.0000, 11000.0000, 44000.00, 202),
    ('SP-203', 'Filtre à eau CILLIT, DN20 90-110μm ; ou un équivalent.', 'U', 3.0000, 9000.0000, 27000.00, 203)
) as v(item_code, designation, unit, quantity, unit_price_ht, total_price_ht, sort_order)
where c.contract_number = 'I/111/HMD-DEG/2024';

-- Update contract attributes + keep contractual HT (permanente + fourniture)
update public.ref_contracts c
set
  total_amount_ht = 281195650.00,
  caution_amount = round(281195650.00 * c.caution_rate, 2),
  attributes = coalesce(c.attributes, '{}'::jsonb)
    || jsonb_build_object(
      'prestation_permanente_ht', 254697000.00,
      'fourniture_demande_ht', 26498650.00,
      'daily_rate_ht', 232600.00,
      'spare_parts_seed_status', 'IMPORTED_FROM_ANNEXE1',
      'spare_parts_expected_count', 203,
      'spare_parts_imported_count', 203,
      'spare_parts_imported_ht', 26498650.00,
      'source_annexe', 'ANNEXE_1_DOCUMENTS_FINANCIERS_N111_2024'
    ),
  updated_at = now()
where c.contract_number = 'I/111/HMD-DEG/2024';

-- Integrity assertions
do $$
declare
  v_contract uuid;
  v_labor numeric;
  v_spare numeric;
  v_spare_n int;
  v_total numeric;
begin
  select id, total_amount_ht into v_contract, v_total
  from public.ref_contracts
  where contract_number = 'I/111/HMD-DEG/2024';

  if v_contract is null then
    raise exception 'Annexe1 import failed: contract I/111/HMD-DEG/2024 missing';
  end if;

  select coalesce(sum(total_price_ht),0) into v_labor
  from public.contract_items
  where contract_id = v_contract and item_type = 'LABOR';

  select coalesce(sum(total_price_ht),0), count(*) into v_spare, v_spare_n
  from public.contract_items
  where contract_id = v_contract and item_type = 'SPARE_PART';

  if v_labor <> 232600.00 then
    raise exception 'Annexe1 import failed: LABOR daily % <> 232600', v_labor;
  end if;
  if v_spare_n <> 203 then
    raise exception 'Annexe1 import failed: SPARE count % <> 203', v_spare_n;
  end if;
  if v_spare <> 26498650.00 then
    raise exception 'Annexe1 import failed: SPARE HT % <> 26498650', v_spare;
  end if;
  if v_total <> 281195650.00 then
    raise exception 'Annexe1 import failed: contract HT % <> 281195650', v_total;
  end if;
end $$;

commit;
