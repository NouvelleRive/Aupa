import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { resolve } from 'path';

const app = initializeApp({ credential: cert(resolve(__dirname, '../serviceAccountKey.json')) });
const db = getFirestore(app);

async function main() {
  const ingSnap = await db.collection('ingredients').get();
  const ingMap: Record<string, string> = {};
  for (const doc of ingSnap.docs) ingMap[doc.data().nom] = doc.id;

  // Vérifier que Sirop, Alex et Limonade existent
  console.log('=== Ingrédients ===');
  for (const nom of ['Sirop', 'Alex', 'Limonade']) {
    if (ingMap[nom]) {
      console.log(`  "${nom}" existe (${ingMap[nom]})`);
    } else {
      console.log(`  ❌ "${nom}" manquant`);
    }
  }

  const siropId = ingMap['Sirop'];
  const alexId = ingMap['Alex'];
  const limonadeId = ingMap['Limonade'];

  if (!siropId || !alexId || !limonadeId) {
    console.log('Ingrédients manquants, abandon');
    return;
  }

  // Monaco demi : sirop 0.02L, alex 0.20L, limonade 0.03L
  await db.collection('recettes').add({
    nom: 'Monaco demi',
    categorie: 'Les Binouz',
    type: 'boisson',
    actif: true,
    prixVente: 0,
    ingredients: [
      { ingredientId: siropId, nomIngredient: 'Sirop', grammage: 0.02 },
      { ingredientId: alexId, nomIngredient: 'Alex', grammage: 0.20 },
      { ingredientId: limonadeId, nomIngredient: 'Limonade', grammage: 0.03 },
    ],
    options: [],
    coutCalcule: 0,
    updatedAt: new Date().toISOString(),
  });
  console.log('\n✔ Créé "Monaco demi" → Sirop 0.02L + Alex 0.20L + Limonade 0.03L');

  // Monaco pinte : sirop 0.04L, alex 0.40L, limonade 0.06L
  await db.collection('recettes').add({
    nom: 'Monaco pinte',
    categorie: 'Les Binouz',
    type: 'boisson',
    actif: true,
    prixVente: 0,
    ingredients: [
      { ingredientId: siropId, nomIngredient: 'Sirop', grammage: 0.04 },
      { ingredientId: alexId, nomIngredient: 'Alex', grammage: 0.40 },
      { ingredientId: limonadeId, nomIngredient: 'Limonade', grammage: 0.06 },
    ],
    options: [],
    coutCalcule: 0,
    updatedAt: new Date().toISOString(),
  });
  console.log('✔ Créé "Monaco pinte" → Sirop 0.04L + Alex 0.40L + Limonade 0.06L');

  console.log('\nTerminé');
}

main().catch(err => { console.error(err); process.exit(1); });
