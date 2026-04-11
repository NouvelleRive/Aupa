import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { resolve } from 'path';

const app = initializeApp({ credential: cert(resolve(__dirname, '../serviceAccountKey.json')) });
const db = getFirestore(app);

async function main() {
  const recSnap = await db.collection('recettes').get();
  const ingSnap = await db.collection('ingredients').get();

  console.log('=== RECETTES WINES ===');
  for (const doc of recSnap.docs) {
    const data = doc.data();
    if (data.categorie === 'Les Wines') {
      console.log(`${data.nom} (${doc.id}) | ingredients:`, JSON.stringify(data.ingredients || []));
    }
  }

  console.log('\n=== INGRÉDIENTS VIN ===');
  for (const doc of ingSnap.docs) {
    const nom = doc.data().nom.toLowerCase();
    if (nom.includes('vin') || nom.includes('prosecco') || nom.includes('frizzante') || nom.includes('rose') || nom.includes('rosé')) {
      console.log(`${doc.data().nom} (${doc.id}) | unite: ${doc.data().unite}`);
    }
  }
}

main().catch(err => { console.error(err); process.exit(1); });
