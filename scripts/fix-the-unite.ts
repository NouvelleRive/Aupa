import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { resolve } from 'path';

const app = initializeApp({ credential: cert(resolve(__dirname, '../serviceAccountKey.json')) });
const db = getFirestore(app);

async function main() {
  console.log('=== Changement unité Thé: kg → pièce ===\n');
  const snap = await db.collection('ingredients').where('nom', '==', 'Thé').get();
  if (snap.empty) {
    console.log('⚠ Aucun doc "Thé" trouvé');
  } else {
    for (const doc of snap.docs) {
      await doc.ref.update({ unite: 'pièce' });
      console.log(`✔ Thé (${doc.id}) → unité: pièce`);
    }
  }
  console.log('\n=== Terminé ===');
}

main().catch(err => { console.error('Erreur:', err); process.exit(1); });
