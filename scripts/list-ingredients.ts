import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { resolve } from 'path';

const app = initializeApp({ credential: cert(resolve(__dirname, '../serviceAccountKey.json')) });
const db = getFirestore(app);

async function main() {
  const snap = await db.collection('ingredients').get();
  const ings = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a: any, b: any) => a.nom.localeCompare(b.nom));
  for (const ing of ings) {
    console.log(`${(ing as any).nom}\t${(ing as any).categorie}\t${(ing as any).unite}`);
  }
  console.log(`\nTotal: ${ings.length}`);
}

main().catch(err => { console.error(err); process.exit(1); });
