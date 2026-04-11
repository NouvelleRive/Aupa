import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { resolve } from 'path';

const app = initializeApp({ credential: cert(resolve(__dirname, '../serviceAccountKey.json')) });
const db = getFirestore(app);

async function main() {
  // Diplomatico → Rhum 0.05 L
  const recSnap = await db.collection('recettes').get();
  for (const doc of recSnap.docs) {
    if (doc.data().nom === 'Diplomatico') {
      await doc.ref.update({
        ingredients: [{
          ingredientId: 'NSQiJ5sfxUwCyzCAUHIV',
          nomIngredient: 'Rhum',
          grammage: 0.05,
        }]
      });
      console.log('✔ Diplomatico → Rhum 0.05 L');
    }
  }
}

main().catch(err => { console.error(err); process.exit(1); });
