import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { resolve } from 'path';

const app = initializeApp({ credential: cert(resolve(__dirname, '../serviceAccountKey.json')) });
const db = getFirestore(app);

async function main() {
  const recSnap = await db.collection('recettes').get();
  const ingSnap = await db.collection('ingredients').get();

  // Map ingrédients par nom
  const ingByNom: Record<string, string> = {};
  for (const d of ingSnap.docs) {
    ingByNom[d.data().nom] = d.id;
  }

  // IDs ingrédients existants
  const EAU_PLATE = ingByNom['Eau'] || '';
  const CITRON_VERT = ingByNom['Citron vert'] || '';
  const CITRON_JAUNE = ingByNom['Citron jaune'] || '';
  const PERRIER = ingByNom['Perrier 33cl'] || ingByNom['Perrier 1L'] || '';
  const SIROP_SUCRE = ingByNom['Sirop de sucre de canne'] || '';
  const SIROP_PECHE = ingByNom['Sirop pêche'] || '';
  const GINGER = ingByNom['Ginger beer'] || '';
  const ORANGE = ingByNom['Orange'] || '';

  console.log('IDs ingrédients:');
  console.log({ EAU_PLATE, CITRON_VERT, CITRON_JAUNE, PERRIER, SIROP_SUCRE, SIROP_PECHE, GINGER, ORANGE });

  // 1. Créer prépa orange pressée (vide)
  const prepaRef = await db.collection('recettes').add({
    nom: 'Prépa orange pressée',
    categorie: 'Préparations',
    type: 'boisson',
    prixVente: 0,
    ingredients: [],
    options: [],
    actif: true,
    saisons: [],
    carte: '',
    coutCalcule: 0,
    updatedAt: new Date().toISOString(),
  });
  console.log(`✅ Prépa orange pressée créée (${prepaRef.id})`);

  // 2. Trouver prépa thé glacé
  let prepaTheGlaceId = '';
  for (const d of recSnap.docs) {
    if (d.data().nom === 'Prépa thé glacé') {
      prepaTheGlaceId = d.id;
      break;
    }
  }
  console.log(`Prépa thé glacé: ${prepaTheGlaceId}`);

  // Recettes de la fiche:
  // Thé glacé: 24cL thé glacé + sirop pêche (quantité non précisée sur fiche, on met 1cL)
  // Limonade: 20cL Perrier + 5cL citron vert + 5cL sirop sucre
  // Citronade: 20cL eau plate + 5cL citron vert + 0.5cL sirop sucre
  // Orange pressé: 25cL orange pressée (prépa)
  // Orangina: 20cL Perrier + 5cL orange (prépa) + 0.5cL sirop sucre
  // Ginger beer: 15cL Perrier + 3cL ginger + 5cL citron vert + 0.5cL sirop sucre

  const now = new Date().toISOString();
  const base = {
    type: 'boisson' as const,
    categorie: 'Fresh & Detox',
    actif: true,
    saisons: [],
    carte: '',
    options: [],
    coutCalcule: 0,
    updatedAt: now,
  };

  // 3. Créer les recettes manquantes
  const nouvelles = [
    {
      nom: 'Limonade maison',
      prixVente: 6.5,
      ingredients: [
        { ingredientId: PERRIER, nomIngredient: 'Perrier 33cl', grammage: 0.2 },
        { ingredientId: CITRON_VERT, nomIngredient: 'Citron vert', grammage: 0.05 },
        { ingredientId: SIROP_SUCRE, nomIngredient: 'Sirop de sucre de canne', grammage: 0.05 },
      ],
    },
    {
      nom: 'Citronnade maison',
      prixVente: 5.5,
      ingredients: [
        { ingredientId: EAU_PLATE, nomIngredient: 'Eau', grammage: 0.2 },
        { ingredientId: CITRON_VERT, nomIngredient: 'Citron vert', grammage: 0.05 },
        { ingredientId: SIROP_SUCRE, nomIngredient: 'Sirop de sucre de canne', grammage: 0.005 },
      ],
    },
    {
      nom: 'Orange pressée',
      prixVente: 6.5,
      ingredients: [
        { preparationId: prepaRef.id, nomIngredient: 'Prépa orange pressée', grammage: 0.25 },
      ],
    },
    {
      nom: 'Ginger beer maison',
      prixVente: 6.5,
      ingredients: [
        { ingredientId: PERRIER, nomIngredient: 'Perrier 33cl', grammage: 0.15 },
        { ingredientId: GINGER, nomIngredient: 'Ginger beer', grammage: 0.03 },
        { ingredientId: CITRON_VERT, nomIngredient: 'Citron vert', grammage: 0.05 },
        { ingredientId: SIROP_SUCRE, nomIngredient: 'Sirop de sucre de canne', grammage: 0.005 },
      ],
    },
  ];

  for (const r of nouvelles) {
    await db.collection('recettes').add({ ...base, ...r });
    console.log(`✅ ${r.nom} créée (${r.prixVente} €)`);
  }

  // 4. Mettre à jour Citron pressé : catégorie → Fresh & Detox
  for (const d of recSnap.docs) {
    const data = d.data();
    if (data.nom === 'Citron pressé') {
      await db.collection('recettes').doc(d.id).update({ categorie: 'Fresh & Detox' });
      console.log(`✅ Citron pressé → Fresh & Detox`);
    }
  }

  // 5. Mettre à jour Orangina : catégorie → Fresh & Detox + ingrédients
  for (const d of recSnap.docs) {
    const data = d.data();
    if (data.nom === 'Orangina') {
      await db.collection('recettes').doc(d.id).update({
        categorie: 'Fresh & Detox',
        prixVente: 5.5,
        ingredients: [
          { ingredientId: PERRIER, nomIngredient: 'Perrier 33cl', grammage: 0.2 },
          { preparationId: prepaRef.id, nomIngredient: 'Prépa orange pressée', grammage: 0.05 },
          { ingredientId: SIROP_SUCRE, nomIngredient: 'Sirop de sucre de canne', grammage: 0.005 },
        ],
      });
      console.log(`✅ Orangina → Fresh & Detox + ingrédients`);
    }
  }

  console.log('\nTerminé !');
}

main().catch(err => { console.error(err); process.exit(1); });
