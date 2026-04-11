import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { resolve } from 'path';

const app = initializeApp({ credential: cert(resolve(__dirname, '../serviceAccountKey.json')) });
const db = getFirestore(app);

async function main() {
  const recSnap = await db.collection('recettes').get();

  for (const doc of recSnap.docs) {
    const data = doc.data();
    for (const ing of (data.ingredients || [])) {
      if (ing.nomIngredient?.toLowerCase().includes('cheddar')) {
        const ok = ing.grammage === 0.03 ? '✔' : '❌';
        console.log(`${ok} ${data.nom.padEnd(35)} → ${ing.nomIngredient} ${ing.grammage} (${data.categorie})`);
      }
    }
  }
}

main().catch(err => { console.error(err); process.exit(1); });
