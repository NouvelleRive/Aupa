import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { resolve } from 'path';

const app = initializeApp({ credential: cert(resolve(__dirname, '../serviceAccountKey.json')) });
const db = getFirestore(app);

async function main() {
  // Supprimer l'ingrédient "Ratatouille"
  const ingSnap = await db.collection('ingredients').where('nom', '==', 'Ratatouille').get();
  for (const doc of ingSnap.docs) {
    await doc.ref.delete();
    console.log(`✔ Ingrédient "Ratatouille" supprimé (${doc.id})`);
  }

  // Supprimer PF liés
  const pfSnap = await db.collection('produitsFournisseurs').get();
  for (const doc of pfSnap.docs) {
    if (doc.data().ingredient === 'Ratatouille') {
      await doc.ref.delete();
      console.log(`✔ PF supprimé (${doc.id})`);
    }
  }

  console.log('Terminé');
}

main().catch(err => { console.error(err); process.exit(1); });
