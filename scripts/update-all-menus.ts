import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const app = initializeApp({ credential: cert('./serviceAccountKey.json') });
const db = getFirestore(app);

// =====================================================
// PRIX PAR MENU (lus directement sur les PDFs)
// =====================================================

const HIVER25: Record<string, number> = {
  // Entrées
  'Velouté entrée': 6.50, 'Œuf entrée': 7.90, 'Avocado entrée': 8.90,
  'Camembert entrée': 6.90, 'Croissant grilled cheese entrée': 6.90, 'Guaca entrée': 8.90,
  // Crogers
  'Bourguignon croger': 13.90, 'Pulled pork croger': 13.90, 'Forestier croger': 13.90,
  'sup for croger': 3.90, 'Raclette croger': 15.90, 'sup rac croger': 3.90,
  'Ratatouille croger': 11.90, 'Polpette croger': 13.90, 'Poivre croger': 14.90,
  'Rougail croger': 15.90, 'Blanquette croger': 15.90, 'Poulet croger': 13.90,
  'Jambon croger': 8.90, 'Camembertha croger': 15.90, 'Canard croger': 15.90,
  'Dinde croger': 13.90, 'Caprese croger': 10.90, 'Thon croger': 9.90,
  'Pastrami croger': 13.90, 'Tartare croger': 13.90,
  // Mini Croger
  'Bourguignon mini croger': 6.63, 'Pulled pork mini croger': 6.63, 'Poulet mini croger': 6.63,
  'Raclette mini croger': 6.63, 'Forestier mini croger': 6.63, 'Canard mini croger': 6.63,
  'Dinde mini croger': 13.90, 'Jambon mini croger': 7.90, 'Thon mini croger': 9.90,
  'Pastrami mini croger': 13.90, 'Caprese mini croger': 10.90, 'Ratatouille mini croger': 9.90,
  'Polpette mini croger': 13.90,
  // Bols
  'Bourguignon bol': 14.90, 'Pulled pork bol': 14.90, 'Poulet bol': 14.90,
  'Rougail bol': 14.90, 'Forestier bol': 14.90, 'Raclette bol': 14.90,
  'Dinde bol': 14.90, 'Jambon bol': 14.90, 'Thon bol': 14.90,
  'Pastrami bol': 14.90, 'Caprese bol': 14.90, 'Ratatouille bol': 14.90,
  // Plats
  'Assiette boulette': 15.90, 'Assiette steak poivre': 15.90,
  // Salades
  'Salade parisienne': 13.90, 'Salade française': 13.90, 'Salade grecque': 13.90,
  // Sides
  'Potatoes': 4.90, 'Aligot': 4.90, 'Ratatouille side': 4.90, 'Fraicheur': 4.90,
  'Salade pdt': 5.90, 'Polenta': 5.90,
  // Grignotage
  'PLANCHE': 14.90, 'Planche mixte': 13.90, 'Planche charcuteries ou fromages': 11.90,
  // Desserts
  'Micuit': 6.90, 'Crumble': 5.90, 'Riz au lait': 5.90, 'Crème Brulée': 5.90,
  'Croissant perdu': 8.90, 'Café gour': 9.90, 'Croissant choco': 8.90,
};

const ETE25: Record<string, number> = {
  // Entrées
  'Œuf mimosa entrée': 5.50, 'Œuf entrée': 7.90, 'Avocado entrée': 8.90,
  'Camembert entrée': 6.90, 'Croissant grilled cheese entrée': 6.90,
  // Crogers
  'Bourguignon croger': 13.90, 'Pulled pork croger': 13.90, 'Poulet croger': 13.90,
  'Caprese croger': 12.90, 'Ratatouille croger': 11.90, 'Polpette croger': 13.90,
  'Tartare croger': 13.90, 'Thon croger': 12.90, 'Dinde croger': 13.90,
  'Eggs croger': 13.90, 'Jambon croger': 8.90,
  // Bols
  'Bourguignon bol': 14.90, 'Pulled pork bol': 14.90, 'Poulet bol': 14.90,
  'Caprese bol': 14.90,
  // Plats
  'Tartare plat': 15.90, 'Bol boulette': 15.90,
  // Salades
  'Salade parisienne': 13.90, 'Salade française': 13.90, 'Salade grecque': 13.90,
  'Salade tunisienne': 13.90, 'Salade new-yorkaise': 13.90,
  // Sides
  'Potatoes': 5.90, 'Salade pdt': 5.90, 'Ratatouille side': 5.90, 'Fraicheur': 4.90,
  // Grignotage
  'PLANCHE': 14.90, 'Planche mixte': 13.90, 'Planche charcuteries ou fromages': 11.90,
  'Guaca entrée': 8.90,
  // Desserts
  'Micuit': 6.90, 'Crumble': 5.90, 'Croissant choco': 8.90, 'Crème Brulée': 4.90,
  'Croissant perdu': 8.90, 'Café gour': 9.90,
};

const HIVER24: Record<string, number> = {
  // Entrées
  'Velouté entrée': 7.50, 'Œuf entrée': 7.90, 'Avocado entrée': 8.90,
  'Camembert entrée': 6.90, 'Croissant fromage entrée': 9.90,
  // Crogers
  'Bourguignon croger': 12.90, 'Canard croger': 15.90, 'Pulled pork croger': 12.90,
  'Raclette croger': 13.90, 'sup rac croger': 3.90, 'Polpette croger': 13.90,
  'Forestier croger': 11.90, 'sup for croger': 3.90, 'Poulet croger': 12.90,
  'Dinde croger': 14.90, 'Ratatouille croger': 9.90, 'Rougail croger': 13.90,
  'Jambon croger': 7.90,
  // Bols
  'Bourguignon bol': 14.90, 'Pulled pork bol': 14.90, 'Poulet bol': 14.90,
  'Forestier bol': 14.90, 'Rougail bol': 14.90,
  // Plats
  'Bol coquillettes': 15.90, 'Bol boulette': 15.90,
  // Salades
  'Salade parisienne': 13.90, 'Salade chèvre chaud': 13.90,
  // Sides
  'Potatoes': 5.90, 'Polenta': 5.90, 'Ratatouille side': 5.90, 'Fraicheur': 4.90,
  // Grignotage
  'Planche mixte': 13.90, 'Planche charcuteries ou fromages': 11.90, 'Guaca entrée': 8.90,
  // Desserts
  'Micuit': 6.90, 'Crumble': 5.90, 'Croissant choco': 8.90, 'Crème Brulée': 4.90,
  'Croissant perdu': 8.90, 'Café gour': 9.90,
};

// Boissons (mêmes prix sur les 3 menus sauf quelques différences)
const BOISSONS_HIVER25: Record<string, number> = {
  'Chicorée': 1.50, 'Expresso': 2, 'Crème': 4, 'Cappuccino': 5, 'Déca': 2.50,
  'Thé': 4, 'Chocolat chaud': 6, 'Latte aux épices': 6.50, 'Pumpkin latte': 7,
  'Chai latte': 7, 'Matcha latte': 6.50, 'Ube latte': 7, 'Grog': 7,
  'Vin chaud': 6, 'Cidre chaud': 6,
  'Iced coffee': 4, 'Iced café latte': 6, 'Iced chocolate': 7, 'Iced matcha': 7,
  'Iced spice latte': 7.50, 'Iced pumpkin spice latte': 8.50, 'Iced chai latte': 8,
  'Café frappé': 5,
  'Smoothie': 8, 'Orange pressée': 6.50, 'Citron pressé': 5, 'Citronnade': 5.50,
  'Limonade maison': 6.50, 'Orangina maison': 5.50, 'Thé glacé maison': 5.50,
  'Ginger beer maison': 6.50,
  'Shot gingembre': 2, "Shot fleur d'oranger": 3, 'Shot cranberry': 2,
  'Coca': 3.50, 'Coca zero': 3.50, 'Tonic': 4, 'Diabolo': 3.50,
  'Jus de fruit': 3.50, "Sirop à l'eau": 3,
  'Eau Evian 1L': 4.90, 'Perrier bouteille': 3.90, 'San Pellegrino 1L': 5.90,
  'Bière pression': 4.50, 'IPA pinte': 6.90, 'Triple pinte': 7.90,
  'Cidre pinte': 7.90, 'Corona': 5, 'Bière sans alcool': 6,
  'Vin blanc (verre)': 5, 'Vin rouge (verre)': 5, 'Vin rosé (verre)': 5,
  'Pétillant (verre)': 7,
  'Spritz': 8, 'Spritz St Germain': 11, 'Expresso martini': 9,
  'Gin tonic': 7, 'Suze tonic': 7, 'Mojito': 8, 'Ti punch': 7,
  'Caipirinha': 8, 'Moscow mule': 7, 'Parma violet': 7,
  'Rhum arrangé': 7, 'Virgin cocktail': 6,
  'Kir': 6, 'Kir royal': 8, 'Pastis': 3, 'Ouzo': 5,
  'Martini rouge': 5, 'Martini blanc': 5, 'Limoncello': 6,
  'Get 27': 5.50, 'Get 31': 5.50, 'Baileys': 5.50,
  'Calva': 8, 'Cognac': 8, 'Armagnac': 8, 'Diplomatico': 8, 'Whisky': 8,
  'Picon bière': 5, 'Poire williams': 8,
};

const BOISSONS_ETE25: Record<string, number> = {
  ...BOISSONS_HIVER25,
  'Crème': 3, 'Grog': 6.50, 'Chocolat chaud': 5, 'Latte aux épices': 5.50,
  'Chai latte': 6, 'Matcha latte': 6,
  'Iced café latte': 5, 'Iced spice latte': 6.50,
  'Café frappé': 5, 'Thé glacé pêche': 5.50,
};

const BOISSONS_HIVER24: Record<string, number> = {
  ...BOISSONS_HIVER25,
  'Crème': 3, 'Chocolat chaud': 5, 'Grog': 7, 'Latte aux épices': 5.50,
  'Vin chaud': 6.50, 'Cidre chaud': 7, 'Pumpkin latte': 7, 'Chai latte': 6,
  'Café frappé': 5, 'Matcha latte': 6,
  'Orange pressée': 6, 'Citronnade': 5.50, 'Limonade maison': 6.50,
  'Orangina maison': 6.50, 'Thé glacé maison': 6.50,
  'Coca': 3.90, 'Coca zero': 3.90, 'Ice tea': 3.90, 'Orangina': 4,
};

// Catégories food par menu
const MENU_CATS_HIVER25 = [
  { nom: 'Entrées', recettes: ['Velouté entrée', 'Œuf entrée', 'Avocado entrée', 'Camembert entrée', 'Croissant grilled cheese entrée', 'Guaca entrée'] },
  { nom: 'Croger', recettes: ['Bourguignon croger', 'Pulled pork croger', 'Forestier croger', 'sup for croger', 'Raclette croger', 'sup rac croger', 'Ratatouille croger', 'Polpette croger', 'Poivre croger', 'Rougail croger', 'Blanquette croger', 'Poulet croger', 'Jambon croger', 'Camembertha croger', 'Canard croger', 'Dinde croger', 'Caprese croger', 'Thon croger', 'Pastrami croger', 'Tartare croger'] },
  { nom: 'Mini Croger', recettes: ['Bourguignon mini croger', 'Pulled pork mini croger', 'Poulet mini croger', 'Raclette mini croger', 'Forestier mini croger', 'Canard mini croger', 'Dinde mini croger', 'Jambon mini croger', 'Thon mini croger', 'Pastrami mini croger', 'Caprese mini croger', 'Ratatouille mini croger', 'Polpette mini croger'] },
  { nom: 'Bols', recettes: ['Bourguignon bol', 'Pulled pork bol', 'Poulet bol', 'Rougail bol', 'Forestier bol', 'Raclette bol', 'Dinde bol', 'Jambon bol', 'Thon bol', 'Pastrami bol', 'Caprese bol', 'Ratatouille bol'] },
  { nom: 'Plats', recettes: ['Assiette boulette', 'Assiette steak poivre'] },
  { nom: 'Salades', recettes: ['Salade parisienne', 'Salade française', 'Salade grecque'] },
  { nom: 'Sides', recettes: ['Potatoes', 'Aligot', 'Ratatouille side', 'Fraicheur', 'Salade pdt', 'Polenta'] },
  { nom: 'Grignotage', recettes: ['PLANCHE', 'Planche mixte', 'Planche charcuteries ou fromages'] },
  { nom: 'Desserts', recettes: ['Micuit', 'Crumble', 'Riz au lait', 'Crème Brulée', 'Croissant perdu', 'Café gour', 'Croissant choco'] },
];

const MENU_CATS_ETE25 = [
  { nom: 'Entrées', recettes: ['Œuf mimosa entrée', 'Œuf entrée', 'Avocado entrée', 'Camembert entrée', 'Croissant grilled cheese entrée'] },
  { nom: 'Croger', recettes: ['Bourguignon croger', 'Pulled pork croger', 'Poulet croger', 'Caprese croger', 'Ratatouille croger', 'Polpette croger', 'Tartare croger', 'Thon croger', 'Dinde croger', 'Eggs croger', 'Jambon croger'] },
  { nom: 'Bols', recettes: ['Bourguignon bol', 'Pulled pork bol', 'Poulet bol', 'Caprese bol'] },
  { nom: 'Plats', recettes: ['Tartare plat', 'Bol boulette'] },
  { nom: 'Salades', recettes: ['Salade parisienne', 'Salade française', 'Salade grecque', 'Salade tunisienne', 'Salade new-yorkaise'] },
  { nom: 'Sides', recettes: ['Potatoes', 'Salade pdt', 'Ratatouille side', 'Fraicheur'] },
  { nom: 'Grignotage', recettes: ['PLANCHE', 'Planche mixte', 'Planche charcuteries ou fromages', 'Guaca entrée'] },
  { nom: 'Desserts', recettes: ['Micuit', 'Crumble', 'Croissant choco', 'Crème Brulée', 'Croissant perdu', 'Café gour'] },
];

const MENU_CATS_HIVER24 = [
  { nom: 'Entrées', recettes: ['Velouté entrée', 'Œuf entrée', 'Avocado entrée', 'Camembert entrée', 'Croissant fromage entrée'] },
  { nom: 'Croger', recettes: ['Bourguignon croger', 'Canard croger', 'Pulled pork croger', 'Raclette croger', 'sup rac croger', 'Polpette croger', 'Forestier croger', 'sup for croger', 'Poulet croger', 'Dinde croger', 'Ratatouille croger', 'Rougail croger', 'Jambon croger'] },
  { nom: 'Mini Croger', recettes: ['Bourguignon mini croger', 'Pulled pork mini croger', 'Poulet mini croger', 'Forestier mini croger', 'Raclette mini croger'] },
  { nom: 'Bols', recettes: ['Bourguignon bol', 'Pulled pork bol', 'Poulet bol', 'Forestier bol', 'Rougail bol'] },
  { nom: 'Plats', recettes: ['Bol coquillettes', 'Bol boulette'] },
  { nom: 'Salades', recettes: ['Salade parisienne', 'Salade chèvre chaud'] },
  { nom: 'Sides', recettes: ['Potatoes', 'Polenta', 'Ratatouille side', 'Fraicheur'] },
  { nom: 'Grignotage', recettes: ['Planche mixte', 'Planche charcuteries ou fromages', 'Guaca entrée'] },
  { nom: 'Desserts', recettes: ['Micuit', 'Crumble', 'Croissant choco', 'Crème Brulée', 'Croissant perdu', 'Café gour'] },
];

// Catégories pour les recettes à créer
const CATEGORIE_MAP: Record<string, { categorie: string; type: string }> = {
  'Poivre croger': { categorie: 'Croger', type: 'food' },
  'Blanquette croger': { categorie: 'Croger', type: 'food' },
  'Eggs croger': { categorie: 'Croger', type: 'food' },
  'Croissant grilled cheese entrée': { categorie: 'Entrées', type: 'food' },
  'Croissant fromage entrée': { categorie: 'Entrées', type: 'food' },
  'Œuf mimosa entrée': { categorie: 'Entrées', type: 'food' },
  'Aligot': { categorie: 'Sides', type: 'food' },
  'Ratatouille side': { categorie: 'Sides', type: 'food' },
  'Riz au lait': { categorie: 'Desserts', type: 'food' },
  'Salade parisienne': { categorie: 'Salade', type: 'food' },
  'Salade française': { categorie: 'Salade', type: 'food' },
  'Salade grecque': { categorie: 'Salade', type: 'food' },
  'Salade tunisienne': { categorie: 'Salade', type: 'food' },
  'Salade new-yorkaise': { categorie: 'Salade', type: 'food' },
  'Salade chèvre chaud': { categorie: 'Salade', type: 'food' },
  'Assiette boulette': { categorie: 'Croger', type: 'food' },
  'Assiette steak poivre': { categorie: 'Croger', type: 'food' },
  'Tartare plat': { categorie: 'Croger', type: 'food' },
  'Bol boulette': { categorie: 'Bols', type: 'food' },
  'Bol coquillettes': { categorie: 'Bols', type: 'food' },
  'Planche mixte': { categorie: 'Grignotage', type: 'food' },
  'Planche charcuteries ou fromages': { categorie: 'Grignotage', type: 'food' },
  // Boissons manquantes
  'Iced coffee': { categorie: 'Les Iced', type: 'boisson' },
  'Iced café latte': { categorie: 'Les Iced', type: 'boisson' },
  'Iced chocolate': { categorie: 'Les Iced', type: 'boisson' },
  'Iced matcha': { categorie: 'Les Iced', type: 'boisson' },
  'Iced spice latte': { categorie: 'Les Iced', type: 'boisson' },
  'Iced pumpkin spice latte': { categorie: 'Les Iced', type: 'boisson' },
  'Iced chai latte': { categorie: 'Les Iced', type: 'boisson' },
  'Ube latte': { categorie: 'Le Chaud', type: 'boisson' },
  'Orangina maison': { categorie: 'Les Iced', type: 'boisson' },
  'Thé glacé maison': { categorie: 'Les Iced', type: 'boisson' },
  'Thé glacé pêche': { categorie: 'Les Iced', type: 'boisson' },
  'Ginger beer maison': { categorie: 'Les Iced', type: 'boisson' },
  'Tonic': { categorie: 'Les Sodas', type: 'boisson' },
  'Jus de fruit': { categorie: 'Les Iced', type: 'boisson' },
  'Eau Evian 1L': { categorie: 'Les Eaux', type: 'boisson' },
  'San Pellegrino 1L': { categorie: 'Les Eaux', type: 'boisson' },
  'IPA pinte': { categorie: 'Les Binouz', type: 'boisson' },
  'Triple pinte': { categorie: 'Les Binouz', type: 'boisson' },
  'Cidre pinte': { categorie: 'Les Binouz', type: 'boisson' },
  'Bière sans alcool': { categorie: 'Les Binouz', type: 'boisson' },
  'Spritz St Germain': { categorie: 'Les Cocktailz', type: 'boisson' },
  'Expresso martini': { categorie: 'Les Cocktailz', type: 'boisson' },
  'Rhum arrangé': { categorie: 'Les Cocktailz', type: 'boisson' },
  'Ice tea': { categorie: 'Les Sodas', type: 'boisson' },
  'Orangina': { categorie: 'Les Sodas', type: 'boisson' },
};

async function run() {
  const snap = await db.collection('recettes').get();
  const recettesMap = new Map<string, string>();
  snap.docs.forEach(d => recettesMap.set(d.data().nom, d.id));

  // 1. Collecter toutes les recettes nécessaires
  const allNames = new Set([
    ...Object.keys(HIVER25), ...Object.keys(ETE25), ...Object.keys(HIVER24),
    ...Object.keys(BOISSONS_HIVER25), ...Object.keys(BOISSONS_ETE25), ...Object.keys(BOISSONS_HIVER24),
  ]);

  // 2. Créer les manquantes
  let created = 0;
  for (const nom of allNames) {
    if (recettesMap.has(nom)) continue;
    const info = CATEGORIE_MAP[nom];
    if (!info) continue; // On ne crée que celles qu'on connaît
    const prix = HIVER25[nom] || ETE25[nom] || HIVER24[nom] || BOISSONS_HIVER25[nom] || 0;
    const ref = await db.collection('recettes').add({
      nom, categorie: info.categorie, type: info.type, actif: true,
      prixVente: prix, ingredients: [], options: [], coutCalcule: 0,
      needsIngredients: true,
      updatedAt: new Date().toISOString(),
    });
    recettesMap.set(nom, ref.id);
    console.log(`  + ${nom} (${info.categorie})`);
    created++;
  }
  console.log(`${created} recettes créées (needsIngredients: true)\n`);

  // 3. Écrire les prix par menu sur chaque recette
  let pricesWritten = 0;
  for (const [nom, id] of recettesMap) {
    const updates: Record<string, any> = {};
    const h25 = HIVER25[nom] || BOISSONS_HIVER25[nom];
    const e25 = ETE25[nom] || BOISSONS_ETE25[nom];
    const h24 = HIVER24[nom] || BOISSONS_HIVER24[nom];
    if (h25) updates.prixHIVER25 = h25;
    if (e25) updates.prixETE25 = e25;
    if (h24) updates.prixHIVER24 = h24;
    // prixVente = prix le plus récent
    if (h25) updates.prixVente = h25;
    else if (e25) updates.prixVente = e25;
    if (Object.keys(updates).length > 0) {
      await db.collection('recettes').doc(id).update(updates);
      pricesWritten++;
    }
  }
  console.log(`${pricesWritten} recettes avec prix mis à jour\n`);

  // 4. Recréer les 3 menus
  const menus = [
    { nom: 'HIVER25', saison: 'hiver', annee: 2025, dateDebut: '2025-10-31', dateFin: '2026-04-10', cats: MENU_CATS_HIVER25, prix: HIVER25 },
    { nom: 'ETE25', saison: 'été', annee: 2025, dateDebut: '2025-05-08', dateFin: '2025-10-30', cats: MENU_CATS_ETE25, prix: ETE25 },
    { nom: 'HIVER24', saison: 'hiver', annee: 2024, dateDebut: '2024-10-31', dateFin: '2025-05-07', cats: MENU_CATS_HIVER24, prix: HIVER24 },
  ];

  for (const menu of menus) {
    const existing = await db.collection('menus').where('nom', '==', menu.nom).get();
    for (const d of existing.docs) await d.ref.delete();

    const categories = menu.cats.map(cat => ({
      nom: cat.nom,
      recettes: cat.recettes.map(nom => {
        const id = recettesMap.get(nom);
        if (!id) console.warn(`  ⚠️ ${menu.nom}/${cat.nom}: "${nom}" introuvable`);
        return id ? { id, prixVente: menu.prix[nom] || 0 } : null;
      }).filter(Boolean),
    }));

    await db.collection('menus').add({
      nom: menu.nom, saison: menu.saison, annee: menu.annee,
      dateDebut: menu.dateDebut, dateFin: menu.dateFin, actif: true,
      categories, createdAt: new Date().toISOString(),
    });

    const total = categories.reduce((s, c) => s + c.recettes.length, 0);
    console.log(`✅ ${menu.nom} → ${total} recettes`);
  }
}

run().catch(console.error);
