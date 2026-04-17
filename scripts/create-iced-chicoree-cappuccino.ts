import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { resolve } from 'path';

const app = initializeApp({ credential: cert(resolve(__dirname, '../serviceAccountKey.json')) });
const db = getFirestore(app);

const LAIT = 'hClJcJms68PPdbKynvXG';
const LAIT_VEGE = 'WEtbESpvqpLIf22H4Wb4';
const CHICOREE = '94PVyhwiP6yAuGtW4xdk';
const CAFE = 'o2lssgNF8MZSBH8PbudY';
const SIROP_SUCRE = 'qKK3OdfC1SoFpHlaLEoX';

async function main() {
  const now = new Date().toISOString();
  const base = {
    type: 'boisson',
    categorie: 'Les Iced',
    actif: true,
    saisons: [],
    carte: '',
    options: [],
    coutCalcule: 0,
    updatedAt: now,
  };

  const recettes = [
    {
      nom: 'Iced chicorée crème',
      prixVente: 3.5,
      ingredients: [
        { ingredientId: LAIT, nomIngredient: 'Lait', grammage: 0.35 },
        { ingredientId: CHICOREE, nomIngredient: 'Chicorée', grammage: 0.01 },
        { ingredientId: SIROP_SUCRE, nomIngredient: 'Sirop de sucre de canne', grammage: 0.01 },
      ],
    },
    {
      nom: 'Iced chicorée crème lait végétal',
      prixVente: 4,
      ingredients: [
        { ingredientId: LAIT_VEGE, nomIngredient: 'Lait végétal', grammage: 0.35 },
        { ingredientId: CHICOREE, nomIngredient: 'Chicorée', grammage: 0.01 },
        { ingredientId: SIROP_SUCRE, nomIngredient: 'Sirop de sucre de canne', grammage: 0.01 },
      ],
    },
    {
      nom: 'Iced cappuccino',
      prixVente: 5.5,
      ingredients: [
        { ingredientId: CAFE, nomIngredient: 'Café', grammage: 0.012 },
        { ingredientId: LAIT, nomIngredient: 'Lait', grammage: 0.15 },
        { ingredientId: SIROP_SUCRE, nomIngredient: 'Sirop de sucre de canne', grammage: 0.01 },
      ],
    },
    {
      nom: 'Iced cappuccino lait végétal',
      prixVente: 6,
      ingredients: [
        { ingredientId: CAFE, nomIngredient: 'Café', grammage: 0.012 },
        { ingredientId: LAIT_VEGE, nomIngredient: 'Lait végétal', grammage: 0.15 },
        { ingredientId: SIROP_SUCRE, nomIngredient: 'Sirop de sucre de canne', grammage: 0.01 },
      ],
    },
  ];

  // Créer les recettes et ajouter au menu
  const menuDoc = await db.collection('menus').doc('fJWV9He5oV6jBKaI7FuH').get();
  const categories = menuDoc.data()!.categories;
  const icedIdx = categories.findIndex((c: any) => c.nom === 'Les Iced');

  for (const r of recettes) {
    const ref = await db.collection('recettes').add({ ...base, ...r });
    categories[icedIdx].recettes.push({ id: ref.id, prixVente: r.prixVente });
    console.log(`✅ ${r.nom} (${r.prixVente} €)`);
  }

  await db.collection('menus').doc('fJWV9He5oV6jBKaI7FuH').update({ categories });
  console.log('\n✅ 4 recettes ajoutées au menu ETE26 (Les Iced)');
}

main().catch(err => { console.error(err); process.exit(1); });
