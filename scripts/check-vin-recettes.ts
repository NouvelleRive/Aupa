import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { resolve } from 'path';

const app = initializeApp({ credential: cert(resolve(__dirname, '../serviceAccountKey.json')) });
const db = getFirestore(app);

async function main() {
  const recSnap = await db.collection('recettes').get();

  // Trouver les recettes qui utilisent "Vin rouge" ou "Vin blanc" comme ingrédient
  for (const doc of recSnap.docs) {
    const data = doc.data();
    if (data.categorie === 'Les Wines') continue;
    for (const ing of (data.ingredients || [])) {
      if (ing.nomIngredient?.toLowerCase().includes('vin')) {
        console.log(`${data.nom} → ${ing.nomIngredient} (${ing.grammage} ${ing.unite || ''}) | ingredientId: ${ing.ingredientId || 'aucun'}`);
      }
    }
  }

  // Vérifier l'ingrédient "Vin blanc"
  const ingSnap = await db.collection('ingredients').get();
  for (const doc of ingSnap.docs) {
    if (doc.data().nom.includes('Vin')) {
      console.log(`\nING: ${doc.data().nom} (${doc.id})`);
    }
  }
}

main().catch(err => { console.error(err); process.exit(1); });
