import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const app = initializeApp({ credential: cert('./serviceAccountKey.json') });
const db = getFirestore(app);

async function migrate3() {
  const snap = await db.collection('produitsFournisseurs').get();
  for (const d of snap.docs) {
    const data = d.data();
    if (data.nomXL !== undefined) {
      await d.ref.update({ ingredient: data.nomXL, nomXL: FieldValue.delete() });
      console.log(`  ✓ ${data.nom}: nomXL → ingredient`);
    }
  }
  console.log('=== Terminé ===');
}

migrate3().catch(console.error);
