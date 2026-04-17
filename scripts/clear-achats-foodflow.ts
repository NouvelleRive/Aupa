import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const app = initializeApp({ credential: cert('./serviceAccountKey.json') });
const db = getFirestore(app);

async function main() {
  const snap = await db.collection('achats').where('fournisseur', '==', 'Foodflow').get();
  console.log(`${snap.size} achats Foodflow à supprimer`);
  let count = 0;
  let batch = db.batch();
  for (const doc of snap.docs) {
    batch.delete(doc.ref);
    count++;
    if (count % 400 === 0) {
      await batch.commit();
      batch = db.batch();
      console.log(`  ${count} supprimés...`);
    }
  }
  if (count % 400 !== 0) await batch.commit();
  console.log(`${count} achats Foodflow supprimés. Prêt pour re-import.`);
}

main().catch(console.error);
