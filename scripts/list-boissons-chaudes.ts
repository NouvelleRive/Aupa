import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { resolve } from 'path';

const app = initializeApp({ credential: cert(resolve(__dirname, '../serviceAccountKey.json')) });
const db = getFirestore(app);

async function main() {
  const recSnap = await db.collection('recettes').get();

  const chaudes = recSnap.docs
    .map(d => d.data())
    .filter(r => r.categorie === 'Le Chaud' && r.type === 'boisson')
    .sort((a, b) => a.nom.localeCompare(b.nom));

  console.log(`${chaudes.length} boissons chaudes :\n`);
  for (const r of chaudes) {
    const ings = (r.ingredients || []).map((i: any) => i.nomIngredient || i.preparationId || '?').join(', ');
    console.log(`- ${r.nom} (${ings})`);
  }
}

main().catch(err => { console.error(err); process.exit(1); });
