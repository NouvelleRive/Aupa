import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const app = initializeApp({ credential: cert('./serviceAccountKey.json') });
const db = getFirestore(app);

// Prix du menu HIVER25 lus directement sur le PDF
const PRIX: Record<string, number> = {
  // Entrées
  'Velouté entrée': 6.50,
  'Œuf entrée': 7.90,
  'Avocado entrée': 8.90,
  'Camembert entrée': 6.90,
  'Croissant grilled cheese entrée': 6.90,
  'Guaca entrée': 8.90,
  // Crogers
  'Bourguignon croger': 13.90,
  'Pulled pork croger': 13.90,
  'Forestier croger': 13.90,
  'sup for croger': 3.90,
  'Raclette croger': 15.90,
  'sup rac croger': 3.90,
  'Ratatouille croger': 11.90,
  'Polpette croger': 13.90,
  'Poivre croger': 14.90,
  'Rougail croger': 15.90,
  'Blanquette croger': 15.90,
  'Poulet croger': 13.90,
  'Jambon croger': 8.90,
  'Camembertha croger': 15.90,
  'Canard croger': 15.90,
  'Dinde croger': 13.90,
  'Caprese croger': 10.90,
  'Thon croger': 9.90,
  'Pastrami croger': 13.90,
  'Tartare croger': 13.90,
  'Trio baby croger': 19.90,
  // Mini Croger
  'Bourguignon mini croger': 6.63,
  'Pulled pork mini croger': 6.63,
  'Poulet mini croger': 6.63,
  'Raclette mini croger': 6.63,
  'Forestier mini croger': 6.63,
  'Canard mini croger': 6.63,
  'Dinde mini croger': 13.90,
  'Jambon mini croger': 7.90,
  'Thon mini croger': 9.90,
  'Pastrami mini croger': 13.90,
  'Caprese mini croger': 10.90,
  'Ratatouille mini croger': 9.90,
  'Polpette mini croger': 13.90,
  // Bols
  'Bourguignon bol': 14.90,
  'Pulled pork bol': 14.90,
  'Poulet bol': 14.90,
  'Rougail bol': 14.90,
  'Forestier bol': 14.90,
  'Raclette bol': 14.90,
  'Dinde bol': 14.90,
  'Jambon bol': 14.90,
  'Thon bol': 14.90,
  'Pastrami bol': 14.90,
  'Caprese bol': 14.90,
  'Ratatouille bol': 14.90,
  // Sides
  'Potatoes': 4.90,
  'Aligot': 4.90,
  'Ratatouille side': 4.90,
  'Fraicheur': 4.90,
  'Salade pdt': 5.90,
  'Polenta': 5.90,
  // Grignotage
  'PLANCHE': 14.90,
  'Planche mixte': 13.90,
  'Planche charcuteries ou fromages': 11.90,
  // Salades
  'Salade parisienne': 13.90,
  'Salade française': 13.90,
  'Salade grecque': 13.90,
  // Plats
  'Assiette boulette': 15.90,
  'Assiette steak poivre': 15.90,
  // Desserts
  'Micuit': 6.90,
  'Crumble': 5.90,
  'Riz au lait': 5.90,
  'Crème Brulée': 5.90,
  'Croissant perdu': 8.90,
  'Café gour': 9.90,
  'Croissant choco': 8.90,
  // Boissons chaudes
  'Chicorée': 1.50,
  'Expresso': 2,
  'Crème': 4,
  'Cappuccino': 5,
  'Déca': 2.50,
  'Thé': 4,
  'Chocolat chaud': 6,
  'Latte aux épices': 6.50,
  'Pumpkin latte': 7,
  'Chai latte': 7,
  'Matcha latte': 6.50,
  'Ube latte': 7,
  'Grog': 7,
  'Vin chaud': 6,
  'Cidre chaud': 6,
  // Iced
  'Iced coffee': 4,
  'Iced café latte': 6,
  'Iced chocolate': 7,
  'Iced matcha': 7,
  'Iced spice latte': 7.50,
  'Iced pumpkin spice latte': 8.50,
  'Iced chai latte': 8,
  'Café frappé': 5,
  // Detox / Iced maison
  'Smoothie': 8,
  'Orange pressée': 6.50,
  'Citron pressé': 5,
  'Citronnade': 5.50,
  'Limonade maison': 6.50,
  'Orangina maison': 5.50,
  'Thé glacé maison': 5.50,
  'Ginger beer maison': 6.50,
  // Shots
  'Shot gingembre': 2,
  "Shot fleur d'oranger": 3,
  'Shot cranberry': 2,
  // Sodas
  'Coca': 3.50,
  'Coca zero': 3.50,
  'Tonic': 4,
  'Diabolo': 3.50,
  'Jus de fruit': 3.50,
  "Sirop à l'eau": 3,
  // Eaux
  'Eau Evian 1L': 4.90,
  'Perrier bouteille': 3.90,
  'San Pellegrino 1L': 5.90,
  // Binouz pinte
  'Bière pression': 4.50,
  'IPA pinte': 6.90,
  'Triple pinte': 7.90,
  'Cidre pinte': 7.90,
  'Corona': 5,
  'Bière sans alcool': 6,
  // Wines verre
  'Vin blanc (verre)': 5,
  'Vin rouge (verre)': 5,
  'Vin rosé (verre)': 5,
  'Pétillant (verre)': 7,
  // Cocktails
  'Spritz': 8,
  'Spritz St Germain': 11,
  'Expresso martini': 9,
  'Gin tonic': 7,
  'Suze tonic': 7,
  'Mojito': 8,
  'Ti punch': 7,
  'Caipirinha': 8,
  'Moscow mule': 7,
  'Parma violet': 7,
  'Rhum arrangé': 7,
  'Virgin cocktail': 6,
  'Kir': 6,
  'Kir royal': 8,
  // Apéritifs
  'Pastis': 3,
  'Ouzo': 5,
  'Martini rouge': 5,
  'Martini blanc': 5,
  'Limoncello': 6,
  'Get 27': 5.50,
  'Get 31': 5.50,
  'Baileys': 5.50,
  'Calva': 8,
  'Cognac': 8,
  'Armagnac': 8,
  'Diplomatico': 8,
  'Whisky': 8,
  'Picon bière': 5,
  'Poire williams': 8,
};

async function run() {
  const snap = await db.collection('recettes').get();
  const recettesMap = new Map<string, string>();
  snap.docs.forEach(d => recettesMap.set(d.data().nom, d.id));

  // 1. Mettre à jour prixVente et prixHIVER25 pour toutes les recettes matchées
  let updated = 0;
  for (const [nom, prix] of Object.entries(PRIX)) {
    const id = recettesMap.get(nom);
    if (id) {
      await db.collection('recettes').doc(id).update({ prixVente: prix, prixHIVER25: prix });
      updated++;
    }
  }
  console.log(`${updated} recettes mises à jour avec les prix HIVER25`);

  // 2. Lister les recettes du menu qui n'existent pas en base
  const missing: string[] = [];
  for (const nom of Object.keys(PRIX)) {
    if (!recettesMap.has(nom)) missing.push(nom);
  }
  if (missing.length > 0) {
    console.log(`\n${missing.length} recettes manquantes (à créer manuellement dans l'app) :`);
    missing.forEach(n => console.log(`  - ${n} (${PRIX[n]} €)`));
  }

  // 3. Recréer le menu HIVER25
  const existing = await db.collection('menus').where('nom', '==', 'HIVER25').get();
  for (const d of existing.docs) await d.ref.delete();

  // Recharger les recettes (certaines ont pu être créées)
  const snap2 = await db.collection('recettes').get();
  const map2 = new Map<string, string>();
  snap2.docs.forEach(d => map2.set(d.data().nom, d.id));

  const menuCategories = [
    { nom: 'Entrées', recettes: ['Velouté entrée', 'Œuf entrée', 'Avocado entrée', 'Camembert entrée', 'Croissant grilled cheese entrée', 'Guaca entrée'] },
    { nom: 'Croger', recettes: ['Bourguignon croger', 'Pulled pork croger', 'Forestier croger', 'sup for croger', 'Raclette croger', 'sup rac croger', 'Ratatouille croger', 'Polpette croger', 'Poivre croger', 'Rougail croger', 'Blanquette croger', 'Poulet croger', 'Jambon croger', 'Camembertha croger', 'Canard croger', 'Dinde croger', 'Caprese croger', 'Thon croger', 'Pastrami croger', 'Tartare croger'] },
    { nom: 'Mini Croger', recettes: ['Bourguignon mini croger', 'Pulled pork mini croger', 'Poulet mini croger', 'Raclette mini croger', 'Forestier mini croger', 'Canard mini croger', 'Dinde mini croger', 'Jambon mini croger', 'Thon mini croger', 'Pastrami mini croger', 'Caprese mini croger', 'Ratatouille mini croger', 'Polpette mini croger'] },
    { nom: 'Bols', recettes: ['Bourguignon bol', 'Pulled pork bol', 'Poulet bol', 'Rougail bol', 'Forestier bol', 'Raclette bol', 'Dinde bol', 'Jambon bol', 'Thon bol', 'Pastrami bol', 'Caprese bol', 'Ratatouille bol'] },
    { nom: 'Salades', recettes: ['Salade parisienne', 'Salade française', 'Salade grecque'] },
    { nom: 'Sides', recettes: ['Potatoes', 'Aligot', 'Ratatouille side', 'Fraicheur', 'Salade pdt', 'Polenta'] },
    { nom: 'Grignotage', recettes: ['PLANCHE', 'Planche mixte', 'Planche charcuteries ou fromages'] },
    { nom: 'Desserts', recettes: ['Micuit', 'Crumble', 'Riz au lait', 'Crème Brulée', 'Croissant perdu', 'Café gour', 'Croissant choco'] },
  ];

  const categories = menuCategories.map(cat => ({
    nom: cat.nom,
    recettes: cat.recettes.map(nom => {
      const id = map2.get(nom);
      if (!id) console.warn(`  ⚠️ HIVER25/${cat.nom}: "${nom}" introuvable`);
      return id ? { id, prixVente: PRIX[nom] || 0 } : null;
    }).filter(Boolean),
  }));

  await db.collection('menus').add({
    nom: 'HIVER25', saison: 'hiver', annee: 2025,
    dateDebut: '2025-10-31', dateFin: '2026-04-10', actif: true,
    categories, createdAt: new Date().toISOString(),
  });

  const total = categories.reduce((s, c) => s + c.recettes.length, 0);
  console.log(`\n✅ Menu HIVER25 créé → ${total} recettes`);
}

run().catch(console.error);
