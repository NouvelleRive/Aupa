import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { resolve } from 'path';

const app = initializeApp({ credential: cert(resolve(__dirname, '../serviceAccountKey.json')) });
const db = getFirestore(app);

async function main() {
  console.log('=== Tag fournisseur sur les PF existants ===\n');

  const snap = await db.collection('produitsFournisseurs').get();
  let updated = 0;

  for (const doc of snap.docs) {
    const data = doc.data();
    if (data.fournisseur) continue; // déjà taggué

    let fournisseur = '';
    if (data.foodflowCode) fournisseur = 'Foodflow';
    else if (data.millietCode) fournisseur = 'Milliet';
    else if (data.lbaCode) fournisseur = 'LBA';

    if (fournisseur) {
      await doc.ref.update({ fournisseur });
      console.log(`  ✔ ${data.nom}: ${fournisseur}`);
      updated++;
    }
  }

  console.log(`\n  ${updated} produit(s) taggués`);
  console.log('\n=== Terminé ===');
}

main().catch(err => { console.error('Erreur:', err); process.exit(1); });
