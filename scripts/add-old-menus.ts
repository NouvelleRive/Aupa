import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const app = initializeApp({ credential: cert('./serviceAccountKey.json') });
const db = getFirestore(app);

// =====================================================
// ETE24 (mai 2024 - oct 2024)
// =====================================================
const ETE24: Record<string, number> = {
  // Entrées
  'Œuf mimosa entrée': 5.50, 'Œuf entrée': 7.90, 'Avocado entrée': 8.90,
  'Salmon entrée': 8.90, 'Camembert entrée': 6.90,
  // Crogers
  'Bourguignon croger': 12.90, 'Eggs croger': 13.90, 'Pulled pork croger': 12.90,
  'Tartare croger': 13.90, 'Polpette croger': 13.90, 'Forestier croger': 11.90,
  'sup for croger': 3.90, 'Poulet croger': 12.90, 'Thon croger': 10.90,
  'Caprese croger': 10.90, 'Ratatouille croger': 9.90, 'Rougail croger': 13.90,
  'Jambon croger': 7.90,
  // Bols (10.90 base + 4.90 garniture = 15.80)
  'Bourguignon bol': 15.80, 'Pulled pork bol': 15.80, 'Poulet bol': 15.80,
  'Caprese bol': 15.80, 'Rougail bol': 15.80,
  // Plats
  'Tartare plat': 15.90,
  // Salades
  'Salade parisienne': 13.90, 'Salade grecque': 13.90,
  'Salade tunisienne': 13.90, 'Salade new-yorkaise': 13.90,
  // Sides
  'Potatoes': 5.90, 'Salade pdt': 5.90, 'Fraicheur': 4.90,
  // Grignotage
  'Guaca entrée': 8.90, 'Planche mixte': 13.90, 'Planche charcuteries ou fromages': 11.90,
  // Desserts
  'Micuit': 6.90, 'Crumble': 5.90, 'Croissant choco': 8.90,
  'Crème Brulée': 4.90, 'Croissant perdu': 8.90, 'Café gour': 9.90,
};

const CATS_ETE24 = [
  { nom: 'Entrées', recettes: ['Œuf mimosa entrée', 'Œuf entrée', 'Avocado entrée', 'Salmon entrée', 'Camembert entrée'] },
  { nom: 'Croger', recettes: ['Bourguignon croger', 'Eggs croger', 'Pulled pork croger', 'Tartare croger', 'Polpette croger', 'Forestier croger', 'sup for croger', 'Poulet croger', 'Thon croger', 'Caprese croger', 'Ratatouille croger', 'Rougail croger', 'Jambon croger'] },
  { nom: 'Bols', recettes: ['Bourguignon bol', 'Pulled pork bol', 'Poulet bol', 'Caprese bol', 'Rougail bol'] },
  { nom: 'Plats', recettes: ['Tartare plat'] },
  { nom: 'Salades', recettes: ['Salade parisienne', 'Salade grecque', 'Salade tunisienne', 'Salade new-yorkaise'] },
  { nom: 'Sides', recettes: ['Potatoes', 'Salade pdt', 'Fraicheur'] },
  { nom: 'Grignotage', recettes: ['Guaca entrée', 'Planche mixte', 'Planche charcuteries ou fromages'] },
  { nom: 'Desserts', recettes: ['Micuit', 'Crumble', 'Croissant choco', 'Crème Brulée', 'Croissant perdu', 'Café gour'] },
];

// =====================================================
// HIVER23 (oct 2023 - mai 2024)
// =====================================================
const HIVER23: Record<string, number> = {
  // Entrées
  'Œuf entrée': 8.90, 'Velouté entrée': 7.50, 'Avocado entrée': 8.90,
  'Salmon entrée': 8.90, 'Camembert entrée': 7.90,
  // Crogers
  'Bourguignon croger': 11.90, 'Pulled pork croger': 11.90,
  'Raclette croger': 13.90, 'sup rac croger': 3.90,
  'Forestier croger': 11.90, 'sup for croger': 3.90,
  'Poulet croger': 10.90, 'Thon croger': 9.90,
  'Pastrami croger': 13.90, 'Caprese croger': 10.90,
  'Ratatouille croger': 9.90, 'Rougail croger': 10.90, 'Jambon croger': 7.90,
  // Bols
  'Bourguignon bol': 14.90, 'Pulled pork bol': 14.90, 'Poulet bol': 14.90,
  'Caprese bol': 14.90, 'Rougail bol': 14.90, 'Raclette bol': 15.90,
  // Sides
  'Potatoes': 6, 'Polenta': 6.50, 'Fraicheur': 5,
  // Grignotage
  'Planche mixte': 14, 'Planche charcuteries ou fromages': 12,
  // Desserts
  'Micuit': 6.90, 'Crumble': 5.90, 'Croissant choco': 8.90,
  'Crème Brulée': 4.90, 'Café gour': 9.90,
};

const CATS_HIVER23 = [
  { nom: 'Entrées', recettes: ['Œuf entrée', 'Velouté entrée', 'Avocado entrée', 'Salmon entrée', 'Camembert entrée'] },
  { nom: 'Croger', recettes: ['Bourguignon croger', 'Pulled pork croger', 'Raclette croger', 'sup rac croger', 'Forestier croger', 'sup for croger', 'Poulet croger', 'Thon croger', 'Pastrami croger', 'Caprese croger', 'Ratatouille croger', 'Rougail croger', 'Jambon croger'] },
  { nom: 'Bols', recettes: ['Bourguignon bol', 'Pulled pork bol', 'Poulet bol', 'Caprese bol', 'Rougail bol', 'Raclette bol'] },
  { nom: 'Sides', recettes: ['Potatoes', 'Polenta', 'Fraicheur'] },
  { nom: 'Grignotage', recettes: ['Planche mixte', 'Planche charcuteries ou fromages'] },
  { nom: 'Desserts', recettes: ['Micuit', 'Crumble', 'Croissant choco', 'Crème Brulée', 'Café gour'] },
];

// =====================================================
// ETE23 (avr 2023 - oct 2023)
// =====================================================
const ETE23: Record<string, number> = {
  // Entrées
  'Burrata entrée': 9, 'Avocado entrée': 8, 'Salmon entrée': 8,
  'Œuf entrée': 7, 'Camembert entrée': 7, 'Guaca entrée': 7,
  // Crogers
  'Bourguignon croger': 10.90, 'Pulled pork croger': 9.90,
  'Tartare croger': 12.90, 'Rougail croger': 11.90,
  'Poulet croger': 10.90, 'Thon croger': 10.90,
  'Pastrami croger': 11.90, 'Caprese croger': 8.90,
  'Ratatouille croger': 10.90, 'Dinde croger': 9.90, 'Jambon croger': 7.90,
  // Sides
  'Potatoes': 6, 'Salade pdt': 6, 'Fraicheur': 5,
  // Grignotage
  'Planche mixte': 14, 'Planche charcuteries ou fromages': 12,
  // Salades
  'Salade parisienne': 13.90, 'Salade grecque': 13.90,
  'Salade tunisienne': 13.90, 'Tartare plat': 15.90,
  // Desserts
  'Micuit': 6.90, 'Crumble': 5.90, 'Croissant choco': 8.90,
  'Crème Brulée': 4.90, 'Café gour': 9.90,
};

const CATS_ETE23 = [
  { nom: 'Entrées', recettes: ['Burrata entrée', 'Avocado entrée', 'Salmon entrée', 'Œuf entrée', 'Camembert entrée', 'Guaca entrée'] },
  { nom: 'Croger', recettes: ['Bourguignon croger', 'Pulled pork croger', 'Tartare croger', 'Rougail croger', 'Poulet croger', 'Thon croger', 'Pastrami croger', 'Caprese croger', 'Ratatouille croger', 'Dinde croger', 'Jambon croger'] },
  { nom: 'Sides', recettes: ['Potatoes', 'Salade pdt', 'Fraicheur'] },
  { nom: 'Grignotage', recettes: ['Planche mixte', 'Planche charcuteries ou fromages'] },
  { nom: 'Salades', recettes: ['Salade parisienne', 'Salade grecque', 'Salade tunisienne', 'Tartare plat'] },
  { nom: 'Desserts', recettes: ['Micuit', 'Crumble', 'Croissant choco', 'Crème Brulée', 'Café gour'] },
];

async function run() {
  const snap = await db.collection('recettes').get();
  const recettesMap = new Map<string, string>();
  snap.docs.forEach(d => recettesMap.set(d.data().nom, d.id));

  // 1. Créer les recettes manquantes
  const allNames = new Set([...Object.keys(ETE24), ...Object.keys(HIVER23), ...Object.keys(ETE23)]);
  let created = 0;
  for (const nom of allNames) {
    if (recettesMap.has(nom)) continue;
    // Deviner la catégorie depuis le nom
    let categorie = 'Croger';
    let type = 'food';
    if (nom.includes('entrée')) categorie = 'Entrées';
    else if (nom.includes('bol')) categorie = 'Bols';
    else if (nom.includes('Salade') || nom.includes('salade')) categorie = 'Salade';
    else if (nom.includes('Planche') || nom.includes('Guaca')) categorie = 'Grignotage';
    else if (['Potatoes', 'Salade pdt', 'Fraicheur', 'Polenta'].includes(nom)) categorie = 'Sides';
    else if (['Micuit', 'Crumble', 'Croissant choco', 'Crème Brulée', 'Croissant perdu', 'Café gour'].includes(nom)) categorie = 'Desserts';
    else if (nom.includes('plat')) categorie = 'Croger';
    const prix = ETE24[nom] || HIVER23[nom] || ETE23[nom] || 0;
    const ref = await db.collection('recettes').add({
      nom, categorie, type, actif: true, prixVente: prix,
      ingredients: [], options: [], coutCalcule: 0,
      needsIngredients: true, updatedAt: new Date().toISOString(),
    });
    recettesMap.set(nom, ref.id);
    console.log(`  + ${nom} (${categorie})`);
    created++;
  }
  console.log(`${created} recettes créées\n`);

  // 2. Écrire les prix par menu sur chaque recette
  let pricesWritten = 0;
  for (const [nom, id] of recettesMap) {
    const updates: Record<string, any> = {};
    if (ETE24[nom]) updates.prixETE24 = ETE24[nom];
    if (HIVER23[nom]) updates.prixHIVER23 = HIVER23[nom];
    if (ETE23[nom]) updates.prixETE23 = ETE23[nom];
    if (Object.keys(updates).length > 0) {
      await db.collection('recettes').doc(id).update(updates);
      pricesWritten++;
    }
  }
  console.log(`${pricesWritten} recettes avec prix mis à jour\n`);

  // 3. Créer les 3 menus
  const menus = [
    { nom: 'ETE24', saison: 'été', annee: 2024, dateDebut: '2024-05-18', dateFin: '2024-10-30', cats: CATS_ETE24, prix: ETE24 },
    { nom: 'HIVER23', saison: 'hiver', annee: 2023, dateDebut: '2023-10-30', dateFin: '2024-05-17', cats: CATS_HIVER23, prix: HIVER23 },
    { nom: 'ETE23', saison: 'été', annee: 2023, dateDebut: '2023-04-12', dateFin: '2023-10-29', cats: CATS_ETE23, prix: ETE23 },
  ];

  for (const menu of menus) {
    // Supprimer l'ancien si existe
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
