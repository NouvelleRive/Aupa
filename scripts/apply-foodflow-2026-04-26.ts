// Applique la liste Foodflow 2026-04-26 (noms, prix, unités) aux PF.
// Règle : on lit le €/xx.
//  - €/kg → unite=kg, prix=as-is
//  - €/L  → unite=L,  prix=as-is
//  - €/p  → si conditionnement en kg/L : prix=prix_p / cond, unite=kg|L
//          sinon (g, mL, pièce indivisible) : unite=pièce, prix=as-is
//
// USAGE :
//  - DRY 1 item : npx tsx scripts/apply-foodflow-2026-04-26.ts --dry --name="Lait Entier UHT Valco"
//  - DRY all    : npx tsx scripts/apply-foodflow-2026-04-26.ts --dry
//  - APPLY      : npx tsx scripts/apply-foodflow-2026-04-26.ts --apply
import 'dotenv/config';
import { db } from '../lib/firebase';
import { collection, getDocs, doc, updateDoc } from 'firebase/firestore';
import { recalculerTousLesCouts } from '../lib/recalculCouts';

const RAW = `Fruits
Citron jaune
Colis -2%

Citron jaune
Lot - 1.00 kg
2.48€/kg
Citron vert
-6%
Colis -8%

Citron vert
Lot - 1.00 kg
3.16€/kg
3.37€
Orange à jus
-7%
Colis -9%

Orange à jus
Lot - 1.00 kg
1.34€/kg
1.44€
Myrtille barquette 125Gr
Colis

Myrtille barquette 125Gr
Unité - 130.00 g
2.41€/p
Pastèque ~8kg Pièce

Pastèque ~8kg Pièce
Unité - 8.00 kg
3.14€/kg
Melon charentais ~1kg pièce
Temporairement indisponible
Melon charentais ~1kg pièce
Lot - 1.00 kg
5.00€/kg
Fraise

Fraise
Lot - 1.00 kg
5.42€/kg
Coulis Fruits Rouges Frais Ponthier 1KG

Coulis Fruits Rouges Frais Ponthier 1KG
Unité - 1.00 kg
11.90€/p
Pomme Golden pâtisserie (petite)
-17%
Colis -19%

Pomme Golden pâtisserie (petite)
Lot - 1.00 kg
1.64€/kg
1.97€
Ananas sweet bateau ~1,5kg pièce

Ananas sweet bateau ~1,5kg pièce
Unité - 1.50 kg
1.75€/kg
Banane moyenne
Colis -2%

Banane moyenne
Lot - 1.00 kg
2.07€/kg
Purée de fruits rouges frais Ponthier 1kg

Purée de fruits rouges frais Ponthier 1kg
Unité - 1.00 kg
12.35€/p
Purée Fruit de la Passion Ponthier 1KG
-8%
Colis -10%

Purée Fruit de la Passion Ponthier 1KG
Unité - 1.00 kg
10.50€/p
11.39€
Coulis Fruits Exotiques Frais Ponthier 1KG

Coulis Fruits Exotiques Frais Ponthier 1KG
Unité - 1.00 kg
9.15€/p
Grenade ~500g pièce

Grenade ~500g pièce
Unité - 500.00 g
5.00€/kg
Boucherie
Bourguignon UE ~4kg S/V
-3%

Bourguignon UE ~4kg S/V
Poche - 4.00 kg
12.49€/kg
12.88€
Rôti de dinde cuit filet ±2,3kg

Rôti de dinde cuit filet ±2,3kg
Unité - 2.30 kg
19.45€/kg
Filet de poulet halal UE 2,5kg S/V
Colis -2%

Filet de poulet halal UE 2,5kg S/V
Barquette - 2.50 kg
7.05€/kg
Échine de porc français désossée ~2kg S/AT
-10%

Échine de porc français désossée ~2kg S/AT
Unité - 2.00 kg
6.25€/kg
6.95€
Steak haché Socopa rond 150g façon bouchère 15%MG VBF X8
-5%
Colis -7%

Steak haché Socopa rond 150g façon bouchère 15%MG VBF X8
Barquette - 1.20 kg
15.88€/kg
16.65€
Paleron halal UE ~2,5kg S/V
Colis -2%

Paleron halal UE ~2,5kg S/V
Poche - 2.50 kg
13.57€/kg
Cuisse de canard confite UE ~250g S/V X2

Cuisse de canard confite UE ~250g S/V X2
Unité - 500.00 g
7.48€/p
Paleron UE ~2,5kg S/V
Colis -2%

Paleron UE ~2,5kg S/V
Poche - 2.50 kg
13.57€/kg
Filet de poulet français halal 2,5kg S/AT
-4%
Colis -6%

Filet de poulet français halal 2,5kg S/AT
Barquette - 2.50 kg
8.98€/kg
9.36€
Steak haché Elivia rond 150g façon bouchère 15%MG VBF X8
-5%
Colis -7%

Steak haché Elivia rond 150g façon bouchère 15%MG VBF X8
Barquette - 1.20 kg
15.83€/kg
16.59€
Palette de porc français sans os ~6kg S/AT

Palette de porc français sans os ~6kg S/AT
Unité - 6.00 kg
5.94€/kg
Sauté de veau UE ~2kg S/V

Sauté de veau UE ~2kg S/V
Poche - 2.00 kg
16.84€/kg
Confit de canard 6 cuisses S/V 1,5kg

Confit de canard 6 cuisses S/V 1,5kg
Unité - 1.50 kg
19.11€/kg
Steak haché Socopa rond 150g strié 15%MG VBF X8
Colis -2%

Steak haché Socopa rond 150g strié 15%MG VBF X8
Barquette - 1.20 kg
15.96€/kg
Charcuterie
Jambon Coupé 2KG env.
-7%

Jambon Coupé 2KG env.
Unité - 2.00 kg
4.75€/kg
5.10€
Pastrami de boeuf français fumé cuit "Smocmeat" ~3kg non tranché

Pastrami de boeuf français fumé cuit "Smocmeat" ~3kg non tranché
Lot - 3.00 kg
21.45€/kg
Jambon cuit supérieur AC 10 tranches 450g
-12%

Jambon cuit supérieur AC 10 tranches 450g
Unité - 450.00 g
5.69€/p
6.48€
Plateau de charcuterie (jambon, coppa, rosette) 200g
-11%

Plateau de charcuterie (jambon, coppa, rosette) 200g
Unité - 200.00 g
3.95€/p
4.44€
Saucisse fumée à cuire supérieure ~120g X 15 S/AT
-9%

Saucisse fumée à cuire supérieure ~120g X 15 S/AT
Lot - 1.80 kg
7.78€/kg
8.59€
Jambon sec supérieur tranché sans conservateurs 500 Gr
-10%

Jambon sec supérieur tranché sans conservateurs 500 Gr
Unité - 500.00 g
8.19€/p
9.10€
Jambon Serrano Tranché 500g

Jambon Serrano Tranché 500g
Unité - 500.00 g
7.95€/p
Saucisse de Toulouse ~160g x 8 S/V

Saucisse de Toulouse ~160g x 8 S/V
Lot - 1.30 kg
11.50€/kg
Fuet 160g
-5%

Fuet 160g
Pièce - 160.00 g
2.36€/p
2.49€
Hygiène
Bobine Essuie-tout 450 Feuilles x 6 Pc
-3%

Bobine Essuie-tout 450 Feuilles x 6 Pc
Pack - 2.50 kg
9.69€/p
9.95€
Vinaigre Cristal x 1.5L
-13%
Colis -15%

Vinaigre Cristal x 1.5L
Unité - 1.50 L
0.87€/p
0.99€
Spray nettoyant désinfectant cuisine 750 ml
Colis -2%

Spray nettoyant désinfectant cuisine 750 ml
Unité - 750.00 mL
4.20€/p
Rouleau 20 sacs poubelle 70µ 130L
Carton -2%

Rouleau 20 sacs poubelle 70µ 130L
Rouleau - 300.00 g
5.45€/p
Nettoyant sol floor neutre 5L
-15%
Colis -17%

Nettoyant sol floor neutre 5L
Unité - 5.00 L
9.50€/p
11.15€
Papier toilette 2 plis rouleau x 12
Colis -2%

Papier toilette 2 plis rouleau x 12
Pack - 3.00 kg
4.16€/p
Spray nettoyant multi-surfaces 5 en 1 - parfum clémentine/orange 750 mL
-16%
Colis -18%

Spray nettoyant multi-surfaces 5 en 1 - parfum clémentine/orange 750 mL
Unité - 750.00 mL
4.70€/p
5.60€
Liquide vaisselle écolabel 1L

Liquide vaisselle écolabel 1L
Unité - 1.00 L
3.90€/p
Eponge inox 40g x 10
-11%

Eponge inox 40g x 10
Lot - 400.00 g
5.32€/p
5.99€
Éponge récurante verte x 10

Éponge récurante verte x 10
Lot - 500.00 g
7.32€/p
Liquide lave-verre Orlav 5 L
-12%
Colis -14%

Liquide lave-verre Orlav 5 L
Unité - 5.00 kg
19.26€/p
21.76€
Javel nature 2,6% 5L
-7%

Javel nature 2,6% 5L
Colis - 20.00 L
2.31€/p
2.49€
Liquide vaisselle plonge citron 5L
Colis -2%

Liquide vaisselle plonge citron 5L
Unité - 5.00 L
6.06€/p
Crème lavante mains parfum fleur de lin 5L
-6%
Colis -8%

Crème lavante mains parfum fleur de lin 5L
Unité - 5.00 L
8.73€/p
9.34€
Gel nettoyant WC détartrant 750 ml
-10%
Colis -12%

Gel nettoyant WC détartrant 750 ml
Unité - 750.00 mL
1.70€/p
1.89€
Spray désinfectant multi surfaces sans rinçage 750 mL
-8%
Colis -10%

Spray désinfectant multi surfaces sans rinçage 750 mL
Unité - 750.00 mL
5.03€/p
5.48€
Nettoyant multi-surfaces 5 en 1 L'Indispensable - clémentine/orange 5L
-15%
Colis -17%

Nettoyant multi-surfaces 5 en 1 L'Indispensable - clémentine/orange 5L
Unité - 5.00 L
6.62€/p
7.80€
Lavettes microfibre 36x32 x 6

Lavettes microfibre 36x32 x 6
Lot - 500.00 g
6.95€/p
Rouleau 20 sacs poubelle 80µ 150L
Carton -2%

Rouleau 20 sacs poubelle 80µ 150L
Rouleau - 300.00 g
8.45€/p
Spray ultra détartrant 750 mL

Spray ultra détartrant 750 mL
Unité - 750.00 mL
5.03€/p
Spray dégraissant multi-surface 750ml

Spray dégraissant multi-surface 750ml
Pièce - 750.00 mL
6.95€/p
Crémerie
Cheddar Tranché 1KG
-7%
Colis -9%

Cheddar Tranché 1KG
Lot - 1.00 kg
9.45€/p
10.15€
Emmental Tranches 9x9 500g
-10%
Colis -12%

Emmental Tranches 9x9 500g
Unité - 500.00 g
10.06€/kg
11.22€
Camembert au lait Pasteurisé 200g

Camembert au lait Pasteurisé 200g
Unité - 200.00 g
1.55€/p
Mozzarella Pain 1KG
Colis -2%

Mozzarella Pain 1KG
Lot - 1.00 kg
9.33€/kg
Lait Entier UHT Valco Pack 6x1L

Lait Entier UHT Valco Pack 6x1L
Pack - 6.00 L
7.09€/p
Feta Bloc 1kg
Colis -2%

Feta Bloc 1kg
Unité - 1.00 kg
13.58€/kg
Burrata 125g x16

Burrata 125g x16
Carton - 2.00 kg
11.98€/kg
Brie Pasteurisé 3KG
-7%

Brie Pasteurisé 3KG
Unité - 3.00 kg
7.39€/kg
7.95€
Jaune d'Œuf 1L
Pack -2%

Jaune d'Œuf 1L
L - 1.00 L
9.15€/L
Yaourt Grec 1 KG
Colis -2%

Yaourt Grec 1 KG
Lot - 1.00 kg
4.77€/p
Crème liquide 18% Baignes 6x1L

Crème liquide 18% Baignes 6x1L
Pack - 6.00 L
3.51€/L
Oeuf plein air gros calibre x180

Oeuf plein air gros calibre x180
Carton - 12.00 kg
46.15€/p
Crème Excellence Elle & Vire 35% 6x1L

Crème Excellence Elle & Vire 35% 6x1L
Pack - 6.00 L
5.89€/L
Saint Nectaire Laitier 1.9KG env.
-8%

Saint Nectaire Laitier 1.9KG env.
Unité - 1.90 kg
12.41€/kg
13.46€
Crème liquide 12% Baignes 6x1L

Crème liquide 12% Baignes 6x1L
Pack - 6.00 L
2.98€/L
Oeuf plein air moyen x90

Oeuf plein air moyen x90
Carton - 6.00 kg
23.98€/p
Crème liquide 35% Baignes 6x1L

Crème liquide 35% Baignes 6x1L
Pack - 6.00 L
4.86€/L
Crème liquide 30% Baignes 6x1L

Crème liquide 30% Baignes 6x1L
Pack - 6.00 L
4.12€/L
Camembert lait Cru 250Gr
Colis -2%

Camembert lait Cru 250Gr
Unité - 250.00 g
3.44€/p
Comté bloc 4 mois AOP 2-3KG
-7%

Comté bloc 4 mois AOP 2-3KG
Unité - 2.50 kg
16.73€/kg
18.07€
Gouda 50 tranches 10x10cm 500g

Gouda 50 tranches 10x10cm 500g
Unité - 500.00 g
14.85€/kg
Parmesan Reggiano Bloc 1KG

Parmesan Reggiano Bloc 1KG
Unité - 1.00 kg
19.77€/kg
Crème fouettée à la vanille de Madagascar Isigny aérosol 500g
Colis -2%

Crème fouettée à la vanille de Madagascar Isigny aérosol 500g
Unité - 500.00 g
6.25€/p
Chèvre Affiné Spécial Cuisson 20Gr X 24Pc

Chèvre Affiné Spécial Cuisson 20Gr X 24Pc
Caissette - 480.00 g
11.84€/p
Chèvre frais Sous Vide 1KG

Chèvre frais Sous Vide 1KG
Unité - 1.00 kg
13.65€/p
Œuf Entier 1L
Pack -2%

Œuf Entier 1L
L - 1.00 L
4.38€/L
Beurre extra fin origine France 1kg
Colis -2%

Beurre extra fin origine France 1kg
Unité - 1.00 kg
9.50€/p
Stracciatella 200g
Colis -2%

Stracciatella 200g
Unité - 200.00 g
3.08€/p
Emmental Tranches 1KG

Emmental Tranches 1KG
Unité - 1.00 kg
9.90€/kg
Mascarpone Granarolo 500gr
Colis -2%

Mascarpone Granarolo 500gr
Unité - 500.00 g
3.96€/p
Raclette nature tranchée 400g

Raclette nature tranchée 400g
Unité - 400.00 g
5.08€/p
Comté 18 mois 3KG

Comté 18 mois 3KG
Unité - 3.00 kg
19.98€/kg
Jaune d'Œuf plein air 1L
Pack -2%

Jaune d'Œuf plein air 1L
L - 1.00 L
10.94€/L
Comté 6 mois 3KG
-4%

Comté 6 mois 3KG
Unité - 3.00 kg
14.73€/kg
15.29€
Lait végétal avoine Alpro Barista 1Lx8
-3%

Lait végétal avoine Alpro Barista 1Lx8
Pack - 8.00 L
1.94€/L
1.99€
Beurre Micro 1/2 Sel 10gr X 100
-6%

Beurre Micro 1/2 Sel 10gr X 100
Boîte - 1.00 kg
12.41€/p
13.25€
Mini Camembert 150Gr
Colis -2%

Mini Camembert 150Gr
Unité - 150.00 g
2.15€/p
Lait végétal coco Alpro Barista 1Lx8

Lait végétal coco Alpro Barista 1Lx8
Pack - 8.00 L
2.72€/L
Lait végétal soja Alpro Barista 1Lx8
-8%

Lait végétal soja Alpro Barista 1Lx8
Pack - 8.00 L
1.73€/L
1.89€
ALT MLK BARISTA AVOINE 1Lx6 - Lait d'avoine végétal

ALT MLK BARISTA AVOINE 1Lx6 - Lait d'avoine végétal
Pack - 6.00 L
1.99€/L
ALT MLK BARISTA AMANDE 1Lx6 - Lait d'amande végétal

ALT MLK BARISTA AMANDE 1Lx6 - Lait d'amande végétal
Pack - 6.00 L
2.30€/L
ALT MLK BARISTA COCO 1Lx6 - Lait de coco végétal
Temporairement indisponible
De retour le 30 avril
ALT MLK BARISTA COCO 1Lx6 - Lait de coco végétal
Pack - 6.00 L
2.30€/L
Tomme Fraiche Aligot 1.8KG env.

Tomme Fraiche Aligot 1.8KG env.
Unité - 1.80 kg
10.36€/kg
Raclette fumée tranchée 200g
Temporairement indisponible
Raclette fumée tranchée 200g
Unité - 200.00 g
5.92€/p
Raclette nature tranchée 800g

Raclette nature tranchée 800g
Unité - 800.00 g
9.90€/p
Tomme Blanche 1,8KG env.

Tomme Blanche 1,8KG env.
Unité - 1.80 kg
11.99€/kg
Cheddar rouge pour burger 50 tranches 1kg

Cheddar rouge pour burger 50 tranches 1kg
Lot - 1.00 kg
16.80€/kg
Blanc d'Œuf 1L
-11%
Pack -13%

Blanc d'Œuf 1L
L - 1.00 L
3.56€/L
3.98€
Brie 1kg

Brie 1kg
Unité - 1.00 kg
9.49€/p
Épicerie salée
Saumon Fumé Norvège Tranché 1kg
Colis -2%

Saumon Fumé Norvège Tranché 1kg
Lot - 1.00 kg
29.85€/kg
Ketchup Louis Martin 5kg
-9%

Ketchup Louis Martin 5kg
Unité - 5.00 kg
2.08€/kg
2.29€
Polpa Mutti 5/1
-9%
Colis -11%

Polpa Mutti 5/1
Unité - 4.00 kg
7.17€/p
7.88€
Cacahuètes grillées salées 1 KG
Colis

Cacahuètes grillées salées 1 KG
Unité - 1.00 kg
4.30€/p
Olive noire dénoyautée 5/1
Colis -2%

Olive noire dénoyautée 5/1
Unité - 4.00 kg
11.39€/p
Farine T55 1kg x10
-16%

Farine T55 1kg x10
Pack 10x1kg - 10.00 kg
0.75€/kg
0.89€
Jus de veau Knorr Essentiel 750g
-9%
Colis -11%

Jus de veau Knorr Essentiel 750g
Unité - 750.00 g
11.77€/p
12.90€
Huile GID 100% Tournesol X 5L
-8%

Huile GID 100% Tournesol X 5L
Unité - 5.00 L
1.99€/L
2.16€
Vinaigre Framboise 50CL
-6%

Vinaigre Framboise 50CL
Unité - 50.00 g
3.55€/p
3.80€
Moutarde à l'ancienne seau 1kg
-12%

Moutarde à l'ancienne seau 1kg
Unité - 1.00 kg
3.08€/p
3.52€
Moutarde de Dijon 5kg
-9%

Moutarde de Dijon 5kg
Unité - 5.00 kg
2.22€/kg
2.45€
Câpres Fines 4/4
-9%
Colis -11%

Câpres Fines 4/4
Unité - 800.00 g
4.01€/p
4.39€
Double concentré de tomate 4/4 0,88kg
Colis -2%

Double concentré de tomate 4/4 0,88kg
Unité - 800.00 g
2.89€/p
Sel de mer fin seau 5kg

Sel de mer fin seau 5kg
Unité - 5.00 kg
5.75€/p
Thon Huile 4/4
Colis -2%

Thon Huile 4/4
Unité - 800.00 g
6.70€/p
Vinaigre de vin rouge 1L

Vinaigre de vin rouge 1L
Unité - 1.50 L
1.35€/p
Ail semoule sac 1kg
-8%

Ail semoule sac 1kg
Lot - 1.00 kg
10.12€/kg
10.99€
Piment doux fumé (paprika fumé) tubo 450g

Piment doux fumé (paprika fumé) tubo 450g
Unité - 450.00 g
13.65€/p
Riz Basmati 5kg

Riz Basmati 5kg
Unité - 5.00 kg
3.05€/kg
Huile d'Olive Vierge Extra X 1L
Colis -2%

Huile d'Olive Vierge Extra X 1L
L - 1.00 L
7.24€/L
Huile 100% Tournesol X 1L
Colis

Huile 100% Tournesol X 1L
Unité - 1.00 L
2.22€/L
Curry Madras Moulu 500GR

Curry Madras Moulu 500GR
Unité - 500.00 g
4.45€/p
Polenta express 1kg
Colis -2%

Polenta express 1kg
Unité - 1.00 kg
3.95€/p
Harissa Cap Bon 4/4
-7%
Colis -9%

Harissa Cap Bon 4/4
Unité - 800.00 g
2.60€/p
2.79€
Olive noire dénoyautée 34/40 4/4 (0,85kg)
Colis -2%

Olive noire dénoyautée 34/40 4/4 (0,85kg)
Unité - 820.00 g
3.05€/p
Pois chiches 4/4
Colis -2%

Pois chiches 4/4
Unité - 800.00 g
1.78€/p
Olives noires lamelles 3/1
-8%
Colis -10%

Olives noires lamelles 3/1
Unité - 3.00 kg
7.82€/p
8.49€
Poivre noir moulu 500GR

Poivre noir moulu 500GR
Unité - 500.00 g
6.79€/p
Harissa Cap Bon tube 70g
-6%

Harissa Cap Bon tube 70g
Unité - 140.00 g
0.77€/p
0.82€
Sauce Worcestershire Heinz 150 ML
Colis -2%

Sauce Worcestershire Heinz 150 ML
Unité - 150.00 mL
2.99€/p
Tabasco rouge 60 ML
-7%
Colis -9%

Tabasco rouge 60 ML
Unité - 60.00 mL
3.49€/p
3.75€
Origan 500GR

Origan 500GR
Unité - 500.00 g
9.94€/p
Poivre noir moulu 1kg
-8%

Poivre noir moulu 1kg
Unité - 1.00 kg
14.60€/p
15.95€
Huile arôme truffe blanche 250ml

Huile arôme truffe blanche 250ml
Unité - 250.00 g
7.65€/p
Mix tandoori 450g

Mix tandoori 450g
Unité - 450.00 g
8.99€/p
Cannelle Moulue 450GR

Cannelle Moulue 450GR
Unité - 450.00 g
7.55€/p
Double concentré de tomates Louis Martin 4/4 0,88kg

Double concentré de tomates Louis Martin 4/4 0,88kg
Unité - 800.00 g
3.79€/p
Poivre noir concassé 500GR

Poivre noir concassé 500GR
Unité - 500.00 g
9.99€/p
Riz Rond 5 KG

Riz Rond 5 KG
Unité - 5.00 kg
2.18€/kg
Mélange 5 baies 1KG

Mélange 5 baies 1KG
Unité - 1.00 kg
20.70€/p
Gingembre Moulu 500GR

Gingembre Moulu 500GR
Unité - 500.00 g
6.49€/p
Clous de girofle 50g

Clous de girofle 50g
Unité - 50.00 g
2.89€/p
Curry de Madras tubo 330ml 125g

Curry de Madras tubo 330ml 125g
Unité - 130.00 g
3.85€/p
Sauce Tomate Tabana 5/1

Sauce Tomate Tabana 5/1
Unité - 4.00 kg
7.95€/p
Riz Basmati Bio 5kg

Riz Basmati Bio 5kg
Unité - 5.00 kg
3.79€/kg
Légumes
Mélange de jeunes pousses thermo 1kg

Mélange de jeunes pousses thermo 1kg
Lot - 1.00 kg
6.78€/kg
Concombre pièce ~300g
Colis -2%

Concombre pièce ~300g
Unité - 300.00 g
0.86€/p
Tomate rouge ronde N°3
-17%
Colis -19%

Tomate rouge ronde N°3
Lot - 1.00 kg
3.15€/kg
3.79€
Pdt GT lavée
Lot - 1.00 kg
1.25€/kg
Oignon jaune
-20%
Sac -22%

Oignon jaune
Lot - 1.00 kg
0.67€/kg
0.84€
Oignon rouge
Colis -2%

Oignon rouge
Lot - 1.00 kg
1.20€/kg
Basilic botte

Basilic botte
Unité - 30.00 g
0.65€/p
Cebette botte

Cebette botte
Unité - 100.00 g
0.99€/p
Coriandre botte

Coriandre botte
Unité - 30.00 g
0.59€/p
Menthe botte
-12%

Menthe botte
Unité - 30.00 g
0.52€/p
0.59€
Persil plat botte

Persil plat botte
Unité - 30.00 g
0.59€/p
Carotte 40+ lavée
Sac -2%

Carotte 40+ lavée
Unité - 1.00 kg
0.98€/kg
Chou rouge ~1,3kg pièce
-18%

Chou rouge ~1,3kg pièce
Unité - 1.30 kg
1.29€/kg
1.57€
Courgette verte cal. 14/21
Colis -2%

Courgette verte cal. 14/21
Lot - 1.00 kg
2.11€/kg
Aubergine
Colis -2%

Aubergine
Lot - 1.00 kg
2.52€/kg
Champignon de Paris *pied coupé* blanc 3kg

Champignon de Paris *pied coupé* blanc 3kg
Colis - 3.00 kg
3.56€/kg
Ail pelée 1KG

Ail pelée 1KG
Unité - 1.00 kg
6.87€/p
Poivron rouge
Colis -2%

Poivron rouge
Lot - 1.00 kg
2.97€/kg
Romarin botte

Romarin botte
Unité - 50.00 g
0.80€/p
Champignon Portobello 2kg
-11%

Champignon Portobello 2kg
Colis - 2.00 kg
5.99€/kg
6.75€
Potimarron ~1,6kg pièce

Potimarron ~1,6kg pièce
Unité - 1.60 kg
2.75€/kg
Échalote longue
Sac -2%

Échalote longue
Lot - 1.00 kg
2.85€/kg
Betterave Crue

Betterave Crue
Lot - 1.00 kg
3.00€/kg
Piment Rouge

Piment Rouge
Lot - 1.00 kg
6.85€/kg
Poivron jaune
Colis

Poivron jaune
Lot - 1.00 kg
2.92€/kg
Poivron vert
Colis

Poivron vert
Lot - 1.00 kg
2.53€/kg
Tomate Cerise Multicolore

Tomate Cerise Multicolore
Lot - 1.00 kg
6.08€/kg
Salade Iceberg
-5%

Salade Iceberg
Unité - 350.00 g
1.40€/p
1.48€
Aneth botte
-16%

Aneth botte
Unité - 30.00 g
0.68€/p
0.81€
Avocat Hass cal 22
-4%
Colis -6%

Avocat Hass cal 22
Unité - 180.00 g
0.94€/p
0.98€
Avocat Hass cal 18
Colis -2%

Avocat Hass cal 18
Unité - 220.00 g
1.35€/p
Patate douce
Colis -2%

Patate douce
Lot - 1.00 kg
1.74€/kg
Butternut ~1,6kg pièce
Colis -2%

Butternut ~1,6kg pièce
Unité - 1.60 kg
1.43€/kg
Panais
Colis -2%

Panais
Lot - 1.00 kg
1.99€/kg
Ciboulette botte

Ciboulette botte
Unité - 30.00 g
0.59€/p
Tomate à farcir (N°2)
Colis

Tomate à farcir (N°2)
Lot - 1.00 kg
4.70€/kg
Mesclun thermo 1kg

Mesclun thermo 1kg
Lot - 1.00 kg
7.75€/kg
Tomate Roma

Tomate Roma
Lot - 1.00 kg
4.52€/kg
Équipements
Pique en bambou "golf" 15cm x200
-10%

Pique en bambou "golf" 15cm x200
Lot - 150.00 g
3.55€/p
3.95€
Cartouche de gaz pour chalumeau 360ml
-7%

Cartouche de gaz pour chalumeau 360ml
Unité - 190.00 g
7.61€/p
8.19€
Papier Aluminium 0,29 x 200 m
-10%
Colis -12%

Papier Aluminium 0,29 x 200 m
Unité - 3.00 kg
13.88€/p
15.43€
Film Alimentaire 0,30 x 300 m
Colis -2%

Film Alimentaire 0,30 x 300 m
Unité - 3.00 kg
8.07€/p
Gobelet 10cL carton brun x50
Temporairement indisponible
De retour le 27 avril
Gobelet 10cL carton brun x50
Lot - 1.00 kg
1.54€/p
1.95€
Bloc maitre hotel 8 x 15 cm x10
-13%

Bloc maitre hotel 8 x 15 cm x10
Lot - 1.00 kg
14.70€/p
16.95€
Kit 3/1 (fourchette, couteau, serviette 1 pli) x250

Kit 3/1 (fourchette, couteau, serviette 1 pli) x250
Lot - 3.00 kg
20.01€/p
Boîte burger kraft brun 120x116x70 x100
-10%

Boîte burger kraft brun 120x116x70 x100
Lot - 3.00 kg
16.96€/p
18.75€
Gant Jetable Vinyl T9/L x 100 Pc

Gant Jetable Vinyl T9/L x 100 Pc
Boîte - 1.00 kg
3.95€/p
Pot salade 780mL carton kraft brun PP x50
-9%

Pot salade 780mL carton kraft brun PP x50
Lot - 2.00 kg
4.53€/p
4.99€
Couvercle pot salade 780mL PP x50

Couvercle pot salade 780mL PP x50
Lot - 1.00 kg
4.39€/p
50 serviettes blanches double point tissue 40x40cm pliée en 8
-19%
Colis -21%

50 serviettes blanches double point tissue 40x40cm pliée en 8
Sachet - 500.00 g
2.03€/p
2.49€
Étiquette traçabilité 100x40mm post-it x300
Colis -2%

Étiquette traçabilité 100x40mm post-it x300
Unité - 50.00 g
18.90€/p
Colis de 50 bobines thermiques CB 57x40x12mm 18m

Colis de 50 bobines thermiques CB 57x40x12mm 18m
Unité - 4.00 kg
17.50€/p
Pot salade 1100mL carton kraft brun PP x50
-9%

Pot salade 1100mL carton kraft brun PP x50
Lot - 5.00 kg
5.66€/p
6.25€
Couvercle pot salade 1100mL PP x50
-9%

Couvercle pot salade 1100mL PP x50
Lot - 1.00 kg
5.75€/p
6.35€
Barquette alu 350mL x100

Barquette alu 350mL x100
Lot - 3.00 kg
8.49€/p
Gant Jetable Latex L x 100 Pc

Gant Jetable Latex L x 100 Pc
Boîte - 1.00 kg
5.80€/p
Colis de 30 bobines thermiques Caisse Enr. 80x80x12mm 75m

Colis de 30 bobines thermiques Caisse Enr. 80x80x12mm 75m
Carton - 4.00 kg
49.90€/p
Poche patissiere jetable 27x50cm x100

Poche patissiere jetable 27x50cm x100
Lot - 1.18 kg
12.86€/p
Gant nitrile noir L x100
-13%

Gant nitrile noir L x100
Unité - 100.00 g
4.13€/p
4.75€
Nappe papier blanche 30x40cm x 500

Nappe papier blanche 30x40cm x 500
Lot - 1.00 kg
16.13€/p
Agitateurs café bambou 12cm x1000

Agitateurs café bambou 12cm x1000
Unité - 300.00 g
4.95€/p
Torchon usage professionnel 50x70cm X12

Torchon usage professionnel 50x70cm X12
Unité - 200.00 g
15.25€/p
Tablier coton bleu - la pièce

Tablier coton bleu - la pièce
Unité - 200.00 g
13.49€/p
Sac kraft sans poignée (29,5x19x12 cm) X250
-8%
Colis -10%

Sac kraft sans poignée (29,5x19x12 cm) X250
Unité - 1.00 kg
59.87€/p
64.95€
Calot papier frange rouge  x 100

Calot papier frange rouge x 100
Lot - 500.00 g
7.30€/p
Gobelet 17cL carton brun x50
-19%

Gobelet 17cL carton brun x50
Lot - 1.00 kg
2.02€/p
2.50€
Essuie-mains 200 feuilles 19,5x23cm x20
-12%

Essuie-mains 200 feuilles 19,5x23cm x20
Unité - 7.60 kg
30.63€/p
34.90€
Gobelet 24cL carton brun x50
-11%

Gobelet 24cL carton brun x50
Lot - 1.00 kg
1.64€/p
1.85€
Pique en bambou "golf" 9cm x100

Pique en bambou "golf" 9cm x100
Lot - 150.00 g
3.25€/p
Assiette 180mm diamètre carton brun × 50

Assiette 180mm diamètre carton brun × 50
Lot - 500.00 g
3.75€/p
Assiette 230mm diamètre carton brun × 50

Assiette 230mm diamètre carton brun × 50
Lot - 500.00 g
3.85€/p
Fourchette bambou 17cm X50

Fourchette bambou 17cm X50
Unité - 100.00 g
5.79€/p
Couteau bambou 17cm X50

Couteau bambou 17cm X50
Unité - 100.00 g
6.45€/p
Cuillère bambou 17cm X50

Cuillère bambou 17cm X50
Unité - 100.00 g
6.20€/p
Cure-dents X1000 Pc

Cure-dents X1000 Pc
Unité - 10.00 g
1.34€/p
Couvercle gobelet 24cL carton x50

Couvercle gobelet 24cL carton x50
Lot - 500.00 g
1.95€/p
Épicerie sucrée
Pack sucre semoule 10X1kg
-16%

Pack sucre semoule 10X1kg
Pack - 10.00 kg
1.34€/kg
1.59€
Sucre cassonade 1kg
-9%
Colis -11%

Sucre cassonade 1kg
Unité - 1.00 kg
2.52€/kg
2.78€
Chocolat pistol noir Barry 50% 5kg
-5%

Chocolat pistol noir Barry 50% 5kg
Unité - 5.00 kg
64.96€/p
68.25€
Amandes Poudre 1KG
-10%
Colis -12%

Amandes Poudre 1KG
Unité - 1.00 kg
10.38€/p
11.49€
Arôme Vanille 1L
Colis -2%

Arôme Vanille 1L
Unité - 1.00 L
7.75€/p
Spéculoos Concassé 1.1kg
-11%
Colis -13%

Spéculoos Concassé 1.1kg
Unité - 750.00 g
6.25€/p
6.99€
Noisette hachée grillée 1kg
-4%
Colis -6%

Noisette hachée grillée 1kg
Unité - 1.00 kg
16.46€/p
17.10€
Praliné amandes noisettes 50% seau 1kg
-12%
Colis -14%

Praliné amandes noisettes 50% seau 1kg
Lot - 1.00 kg
19.91€/kg
22.50€
Pignons de Pin 1KG

Pignons de Pin 1KG
Unité - 1.00 kg
30.99€/p
Nutella 1kg
Colis -2%

Nutella 1kg
Unité - 1.00 kg
7.85€/p
Miel squeez 500GR
Colis -2%

Miel squeez 500GR
Unité - 500.00 g
6.15€/p
Tahine (crème de sésame) seau 3kg

Tahine (crème de sésame) seau 3kg
Unité - 3.00 kg
18.80€/p
Pâte d'arachide 4/4

Pâte d'arachide 4/4
Unité - 1.00 kg
6.97€/p
Cerneaux de Noix 1KG
-7%
Colis -9%

Cerneaux de Noix 1KG
Unité - 1.00 kg
8.61€/p
9.29€
Thé blanc bai mu dan BIO x15 sachets

Thé blanc bai mu dan BIO x15 sachets
Unité - 30.00 g
6.97€/p
Thé noir Earl Grey arôme naturel de bergamote BIO x15 sachets
-12%

Thé noir Earl Grey arôme naturel de bergamote BIO x15 sachets
Unité - 30.00 g
6.10€/p
6.97€
Thé vert à la menthe BIO x15 sachets

Thé vert à la menthe BIO x15 sachets
Unité - 30.00 g
6.97€/p
Thé vert arôme naturel de jasmin BIO x15 sachets
Temporairement indisponible
Thé vert arôme naturel de jasmin BIO x15 sachets
Unité - 30.00 g
6.10€/p
6.97€
Matcha 1kg - Grade premium

Matcha 1kg - Grade premium
Poche - 1.00 kg
98.00€/kg
Chicorée nature
Temporairement indisponible
De retour le 28 avril
Chicorée nature
Unité - 80.00 g
5.68€/p
Chaï Latte BIO 1kg :  Spicy & Delicious
Temporairement indisponible
De retour le 27 avril
Chaï Latte BIO 1kg : Spicy & Delicious
Lot - 1.00 kg
29.00€/kg
Chocolat pistol noir 55% 5kg

Chocolat pistol noir 55% 5kg
Unité - 5.00 kg
78.90€/p
Instantanée - CHERICO "CHICOREE NATURE" 250G
Carton -2%

Instantanée - CHERICO "CHICOREE NATURE" 250G
Unité - 250.00 g
17.78€/p
Thé vert au gingembre et citron BIO x15 sachets

Thé vert au gingembre et citron BIO x15 sachets
Unité - 30.00 g
6.91€/p
Golden latte Monbana 350g

Golden latte Monbana 350g
Unité - 350.00 g
12.53€/p
Sucre glace 1kg
Colis -2%

Sucre glace 1kg
Lot - 1.00 kg
2.84€/kg
Colorant alimentaire rouge 50ml

Colorant alimentaire rouge 50ml
Unité - 50.00 g
2.43€/p
La Cave
Cubi Vin Rouge 10 L
-12%

Cubi Vin Rouge 10 L
Unité - 10.00 kg
16.02€/p
18.22€
Le Rouge - Les Essentiels x Domaine Isle Saint Pierre 12,5%vol 75cl
Carton -5%

Le Rouge - Les Essentiels x Domaine Isle Saint Pierre 12,5%vol 75cl
Bouteille - 750.00 mL
6.00€/p
Le Rouge - Les Essentiels x Domaine Isle Saint Pierre 12,5%vol Bib 5L

Le Rouge - Les Essentiels x Domaine Isle Saint Pierre 12,5%vol Bib 5L
Cubi - 5.00 L
16.79€/p
Le Blanc - Les Essentiels x Domaine Isle Saint-Pierre 12,5%vol 75cl
Carton -5%

Le Blanc - Les Essentiels x Domaine Isle Saint-Pierre 12,5%vol 75cl
Bouteille - 750.00 mL
6.00€/p
Merlot rouge IGP Pays d'Oc fontaine 10L

Merlot rouge IGP Pays d'Oc fontaine 10L
Unité - 10.00 kg
22.09€/p
Viognier 75cl
Carton

Viognier 75cl
Bouteille - 750.00 mL
6.65€/p
Marsanne 75cl
Carton

Marsanne 75cl
Bouteille - 750.00 mL
5.15€/p
Colombelle l'Original IGP Côtes de Gascogne blanc 75cl

Colombelle l'Original IGP Côtes de Gascogne blanc 75cl
Unité - 750.00 g
4.14€/p
Velodoro Prosecco DOC extra dry 75cl

Velodoro Prosecco DOC extra dry 75cl
Unité - 750.00 g
4.39€/p
Spiritueux
Crème (de whisky) Irlandaise Bailey's 17% 1L
Colis -5%

Crème (de whisky) Irlandaise Bailey's 17% 1L
Unité - 1.00 L
18.45€/p
Vodka Poliakov 37,5% 70cl
Colis -5%

Vodka Poliakov 37,5% 70cl
Unité - 700.00 mL
9.42€/p
Gin Gibson's 37,5% 70cl
Colis -2%

Gin Gibson's 37,5% 70cl
Unité - 700.00 mL
9.38€/p
Gin Gordon's 37,5% 70cl
Temporairement indisponible
Gin Gordon's 37,5% 70cl
Unité - 700.00 mL
11.38€/p
Martini Bianco 14,5% 1L
Colis -5%

Martini Bianco 14,5% 1L
Unité - 1.00 L
9.70€/p
Crème de cassis 18% 1L
Colis -2%

Crème de cassis 18% 1L
L - 1.00 L
8.97€/L
Whisky Ballantines 40% 70cl

Whisky Ballantines 40% 70cl
Unité - 700.00 mL
13.36€/p
Rhum blanc agricol St James 40% 70cl
Colis -5%

Rhum blanc agricol St James 40% 70cl
Unité - 700.00 mL
9.30€/p
Ricard 45% 1L
Colis -5%

Ricard 45% 1L
Unité - 1.00 L
16.89€/p
Pastis 51 45% 1L

Pastis 51 45% 1L
Unité - 1.00 L
21.00€/p
Limoncello 25% 70cl
Colis -5%

Limoncello 25% 70cl
Unité - 700.00 mL
8.79€/p
Picon Bière 18% 1L
Colis -5%

Picon Bière 18% 1L
Unité - 1.00 L
9.89€/p
Crème de pêche 18% 1L
-15%
Colis -17%

Crème de pêche 18% 1L
L - 1.00 L
8.49€/L
9.99€
Crème de mûre 18% 1L

Crème de mûre 18% 1L
Unité - 1.00 L
10.49€/p
Aperol 12,5% 70cl
-4%
Colis -6%

Aperol 12,5% 70cl
Unité - 700.00 mL
10.56€/p
10.98€
Get 27 17,9% 70cl
Colis -2%

Get 27 17,9% 70cl
Unité - 1.10 kg
11.74€/p
Boissons
Perrier 1L x6

Perrier 1L x6
Pack - 6.00 L
5.16€/p
Sirop de grenadine 1L

Sirop de grenadine 1L
Unité - 1.00 L
2.86€/p
Jus d'orange Granini 1L X6

Jus d'orange Granini 1L X6
Pack - 6.00 L
22.99€/p
CIAO KOMBUCHA saveur gingembre hibiscus 330mlx6

CIAO KOMBUCHA saveur gingembre hibiscus 330mlx6
Carton - 3.36 kg
13.44€/p
Limonade arôme naturel citron 1,5L
Colis

Limonade arôme naturel citron 1,5L
Unité - 1.50 L
1.33€/p
Schweppes Indian Tonic 1,5L
Temporairement indisponible
De retour le 27 avril
Schweppes Indian Tonic 1,5L
Unité - 1.50 L
2.32€/p
Surgelé
Chute de saumon fumé 1kg
Colis -2%

Chute de saumon fumé 1kg
Unité - 1.00 kg
12.24€/p
Framboise 1kg

Framboise 1kg
Unité - 1.00 kg
10.69€/kg
Myrtille 1kg

Myrtille 1kg
Unité - 1.00 kg
10.69€/kg
`;

const COND_REGEX = /^(Lot|Pack 10x1kg|Pack|Carton|Sachet|Boîte|Bouteille|Cubi|Pièce|Caissette|Poche|Barquette|Rouleau|Unité|Colis|L) - ([\d.,]+) (kg|g|L|mL)$/;
const PRICE_REGEX = /^([\d.,]+)€\/(kg|L|p)$/;

type SrcUnit = 'kg' | 'L' | 'p';
type CondUnit = 'kg' | 'g' | 'L' | 'mL';
type FinalUnit = 'kg' | 'g' | 'L' | 'cL' | 'pièce' | 'lot';

interface Item {
  nom: string;
  section: string;
  condValue: number;
  condUnit: CondUnit;
  prixSrc: number;
  unitSrc: SrcUnit;
  prix: number;
  unite: FinalUnit;
}

const SECTIONS = new Set([
  'Fruits', 'Boucherie', 'Charcuterie', 'Hygiène', 'Crémerie',
  'Épicerie salée', 'Légumes', 'Équipements', 'Épicerie sucrée',
  'La Cave', 'Spiritueux', 'Boissons', 'Surgelé',
]);

// Sections de consommables — on les skip pour ce batch (à traiter plus tard)
const SKIP_SECTIONS = new Set(['Hygiène', 'Équipements']);

// Items où Foodflow met une conditionnement kg/L trompeuse (poids emballage,
// poids bouteille, etc.). On les skip pour ne pas écraser le prix correct en DB.
const SKIP_NAMES = new Set([
  'Oeuf plein air gros calibre x180',           // Carton 12kg = poids du carton
  'Oeuf plein air moyen x90',                    // Carton 6kg = poids du carton
  'Cubi Vin Rouge 10 L',                         // "10 kg" = poids cubi (à régler manuellement)
  "Merlot rouge IGP Pays d'Oc fontaine 10L",     // idem
  'Get 27 17,9% 70cl',                           // "1.1 kg" = poids bouteille
  'CIAO KOMBUCHA saveur gingembre hibiscus 330mlx6', // 3.36 kg = poids carton
]);

function num(s: string): number {
  return parseFloat(s.replace(',', '.'));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function parse(raw: string): Item[] {
  const lines = raw.split('\n').map(l => l.trim());
  const items: Item[] = [];
  let currentSection = '';
  for (let i = 0; i < lines.length; i++) {
    if (SECTIONS.has(lines[i])) { currentSection = lines[i]; continue; }
    if (i < 2) continue;

    const priceMatch = lines[i].match(PRICE_REGEX);
    if (!priceMatch) continue;
    const condMatch = lines[i - 1].match(COND_REGEX);
    if (!condMatch) continue;
    const nom = lines[i - 2];
    if (!nom || COND_REGEX.test(nom) || PRICE_REGEX.test(nom)) continue;
    if (SKIP_SECTIONS.has(currentSection)) continue;
    const nomTrim = lines[i - 2];
    if (SKIP_NAMES.has(nomTrim)) continue;

    const condValue = num(condMatch[2]);
    const condUnit = condMatch[3] as CondUnit;
    const prixSrc = num(priceMatch[1]);
    const unitSrc = priceMatch[2] as SrcUnit;

    let prix: number;
    let unite: FinalUnit;
    if (unitSrc === 'kg') { prix = prixSrc; unite = 'kg'; }
    else if (unitSrc === 'L') { prix = prixSrc; unite = 'L'; }
    else {
      if (condUnit === 'kg') { prix = prixSrc / condValue; unite = 'kg'; }
      else if (condUnit === 'L') { prix = prixSrc / condValue; unite = 'L'; }
      else { prix = prixSrc; unite = 'pièce'; }
    }

    items.push({ nom, section: currentSection, condValue, condUnit, prixSrc, unitSrc, prix: round2(prix), unite });
  }
  return items;
}

function norm(s: string): string {
  return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
}

async function main() {
  const APPLY = process.argv.includes('--apply');
  const focus = process.argv.find(a => a.startsWith('--name='))?.slice('--name='.length);

  const items = parse(RAW);
  console.log(`${items.length} items parsés`);

  let toProcess = items;
  if (focus) {
    const fNorm = norm(focus);
    toProcess = items.filter(i => norm(i.nom).includes(fNorm));
    console.log(`Focus "${focus}" → ${toProcess.length} item(s)\n`);
  }

  const pfSnap = await getDocs(collection(db, 'produitsFournisseurs'));
  const all = pfSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
  const ff = all.filter(p => p.fournisseur === 'Foodflow');
  console.log(`PF Foodflow en DB : ${ff.length}\n`);

  let updated = 0, missing = 0;
  const missingList: Item[] = [];
  const changedList: { nom: string; before: any; after: any; src: string }[] = [];

  for (const p of toProcess) {
    const pNorm = norm(p.nom);
    const candidates = ff.filter(x => {
      const xNorm = norm(x.nom);
      if (!xNorm) return false;
      if (xNorm === pNorm) return true;
      if (xNorm.length >= 8 && pNorm.startsWith(xNorm + ' ')) return true;
      if (pNorm.length >= 8 && xNorm.startsWith(pNorm + ' ')) return true;
      return false;
    });

    if (candidates.length === 0) {
      missingList.push(p);
      missing++;
      continue;
    }

    const real = candidates
      .filter(c => c.foodflowCode)
      .sort((a, b) => norm(b.nom).length - norm(a.nom).length)[0]
      || candidates[0];

    const before = { nom: real.nom, prix: real.prix, unite: real.unite };
    const after = { nom: p.nom, prix: p.prix, unite: p.unite };
    const changed = before.nom !== after.nom || before.prix !== after.prix || before.unite !== after.unite;

    const srcStr = `${p.prixSrc}€/${p.unitSrc} sur ${p.condValue}${p.condUnit}`;
    if (changed) changedList.push({ nom: p.nom, before, after, src: srcStr });

    if (APPLY) {
      await updateDoc(doc(db, 'produitsFournisseurs', real.id), {
        nom: p.nom,
        prix: p.prix,
        unite: p.unite,
        quantite: 1,
        updatedAt: new Date().toISOString(),
      });
      updated++;
    }
  }

  console.log('──── DIFFS (items qui changent) ────');
  for (const c of changedList) {
    console.log(`${c.nom}`);
    console.log(`  AVANT : ${c.before.prix}€/${c.before.unite}  | nom: ${c.before.nom}`);
    console.log(`  APRÈS : ${c.after.prix}€/${c.after.unite}  | source: ${c.src}`);
  }

  console.log(`\n──── STATS ────`);
  console.log(`  Items parsés     : ${items.length}`);
  console.log(`  Items traités    : ${toProcess.length}`);
  console.log(`  Items qui changent : ${changedList.length}`);
  console.log(`  Introuvables     : ${missing}`);
  if (missingList.length) {
    console.log(`\nIntrouvables :`);
    for (const m of missingList) console.log(`  - ${m.nom} (→ ${m.prix}€/${m.unite})`);
  }

  if (!APPLY) {
    console.log(`\n[DRY-RUN] Pour appliquer : npx tsx scripts/apply-foodflow-2026-04-26.ts --apply`);
    return;
  }

  console.log(`\n✓ ${updated} mis à jour`);
  console.log(`Recalcul des coûts...`);
  await recalculerTousLesCouts();
  console.log(`✓ Coûts recalculés`);
}

main().catch(e => { console.error('ERR:', e); process.exit(1); });
