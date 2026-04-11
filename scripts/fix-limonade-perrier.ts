import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { resolve } from 'path';

const app = initializeApp({ credential: cert(resolve(__dirname, '../serviceAccountKey.json')) });
const db = getFirestore(app);

async function main() {
  const recSnap = await db.collection('recettes').get();
  const PERRIER_33_ID = 'wQpXZFRCAPTaAyUzeMum';
  const PERRIER_1L_ID = 'LznaemZV9nOmZ9k7aQs1';

  for (const doc of recSnap.docs) {
    const data = doc.data();
    if (data.nom === 'Limonade maison') {
      const lignes = (data.ingredients || []).map((l: any) => {
        if (l.ingredientId === PERRIER_33_ID || l.nomIngredient === 'Perrier 33cl' || l.nomIngredient === 'Perrier') {
          return { ...l, ingredientId: PERRIER_1L_ID, nomIngredient: 'Perrier 1L' };
        }
        return l;
      });
      await doc.ref.update({ ingredients: lignes });
      console.log('✔ Limonade maison → Perrier 1L');
    }
  }
}

main().catch(err => { console.error(err); process.exit(1); });
