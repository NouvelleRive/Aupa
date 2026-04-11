import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { resolve } from 'path';

const app = initializeApp({ credential: cert(resolve(__dirname, '../serviceAccountKey.json')) });
const db = getFirestore(app);

async function main() {
  const snap = await db.collection('ventes').get();
  console.log(`${snap.size} ventes à supprimer...`);

  const batch = db.batch();
  let count = 0;
  for (const doc of snap.docs) {
    batch.delete(doc.ref);
    count++;
    if (count % 500 === 0) {
      await batch.commit();
      console.log(`  ${count} supprimées...`);
    }
  }
  if (count % 500 !== 0) await batch.commit();
  console.log(`✔ ${count} ventes supprimées`);
}

main().catch(err => { console.error(err); process.exit(1); });
