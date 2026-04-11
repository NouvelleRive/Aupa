import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { resolve } from 'path';

const app = initializeApp({ credential: cert(resolve(__dirname, '../serviceAccountKey.json')) });
const db = getFirestore(app);

async function main() {
  const snap = await db.collection('ingredients').get();
  for (const doc of snap.docs) {
    const nom = doc.data().nom.toLowerCase();
    if (nom.includes('guaca') || nom.includes('épice') || nom.includes('epice')) {
      console.log('ING:', doc.id, JSON.stringify(doc.data()));
    }
  }

  const recSnap = await db.collection('recettes').get();
  for (const doc of recSnap.docs) {
    const data = doc.data();
    if (data.nom.toLowerCase().includes('guaca')) {
      console.log('RECETTE:', doc.id, data.nom);
      for (const ing of (data.ingredients || [])) {
        console.log('  -', ing.nomIngredient, ing.grammage, ing.unite);
      }
    }
  }

  // Check remaining curry ingredients
  for (const doc of snap.docs) {
    const nom = doc.data().nom.toLowerCase();
    if (nom.includes('curry')) {
      console.log('ING CURRY:', doc.id, doc.data().nom);
    }
  }
}

main().catch(err => { console.error(err); process.exit(1); });
