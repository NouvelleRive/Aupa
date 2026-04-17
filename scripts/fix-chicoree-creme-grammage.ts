import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { resolve } from 'path';

const app = initializeApp({ credential: cert(resolve(__dirname, '../serviceAccountKey.json')) });
const db = getFirestore(app);

async function main() {
  const recSnap = await db.collection('recettes').get();

  for (const docSnap of recSnap.docs) {
    const data = docSnap.data();
    if (!data.nom?.toLowerCase().includes('chicorée crème')) continue;

    const ingredients = data.ingredients || [];
    let updated = false;

    for (const ing of ingredients) {
      if (ing.nomIngredient?.toLowerCase().includes('chicorée')) {
        console.log(`Avant: ${data.nom} → ${ing.nomIngredient} grammage=${ing.grammage}`);
        ing.grammage = 0.01;
        updated = true;
        console.log(`Après: ${data.nom} → ${ing.nomIngredient} grammage=${ing.grammage}`);
      }
    }

    if (updated) {
      await db.collection('recettes').doc(docSnap.id).update({ ingredients });
      console.log(`Done "${data.nom}" mise a jour`);
    }
  }
}

main().catch(err => { console.error(err); process.exit(1); });
