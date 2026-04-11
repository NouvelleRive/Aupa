import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { resolve } from 'path';

const app = initializeApp({ credential: cert(resolve(__dirname, '../serviceAccountKey.json')) });
const db = getFirestore(app);

async function main() {
  // Check ingredients collection
  const ingSnap = await db.collection('ingredients').get();
  for (const doc of ingSnap.docs) {
    if (doc.data().nom.toLowerCase().includes('ratatouille')) {
      console.log('ING:', doc.id, JSON.stringify(doc.data()));
    }
  }

  // Check recettes (prepas)
  const recSnap = await db.collection('recettes').get();
  for (const doc of recSnap.docs) {
    const data = doc.data();
    if (data.nom.toLowerCase().includes('ratatouille')) {
      console.log('RECETTE:', doc.id, data.nom, '| categorie:', data.categorie);
    }
  }

  // Check if any recipe uses "Ratatouille" as ingredient
  for (const doc of recSnap.docs) {
    const data = doc.data();
    for (const ing of (data.ingredients || [])) {
      if (ing.nomIngredient?.toLowerCase().includes('ratatouille')) {
        console.log('UTILISÉ DANS:', data.nom, '→', ing.nomIngredient, '| recetteId:', ing.recetteId || 'AUCUN');
      }
    }
  }
}

main().catch(err => { console.error(err); process.exit(1); });
