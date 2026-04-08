import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const app = initializeApp({ credential: cert('./serviceAccountKey.json') });
const db = getFirestore(app);

async function migrate2() {
  // 1. Supprimer l'ancienne collection ingredients
  console.log('Suppression ancienne collection ingredients...');
  const oldSnap = await db.collection('ingredients').get();
  for (const d of oldSnap.docs) {
    await d.ref.delete();
    console.log(`  [SUPPRIMÉ] ${d.data().nom}`);
  }

  // 2. Copier ingredientsCanoniques → ingredients
  console.log('Copie ingredientsCanoniques → ingredients...');
  const canonSnap = await db.collection('ingredientsCanoniques').get();
  for (const d of canonSnap.docs) {
    await db.collection('ingredients').doc(d.id).set(d.data());
    console.log(`  [COPIÉ] ${d.data().nom}`);
  }

  console.log('=== Terminé ===');
}

migrate2().catch(console.error);
