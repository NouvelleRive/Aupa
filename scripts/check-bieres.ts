import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { resolve } from 'path';

const app = initializeApp({ credential: cert(resolve(__dirname, '../serviceAccountKey.json')) });
const db = getFirestore(app);

async function main() {
  const recSnap = await db.collection('recettes').get();
  const ingSnap = await db.collection('ingredients').get();
  const menuSnap = await db.collection('menus').get();

  console.log('=== RECETTES BINOUZ EXISTANTES ===\n');
  for (const doc of recSnap.docs) {
    const data = doc.data();
    if (data.categorie === 'Les Binouz') {
      console.log(`${data.nom.padEnd(30)} | ingredients: ${JSON.stringify(data.ingredients || [])}`);
    }
  }

  console.log('\n=== BIERES DANS LES MENUS ===\n');
  for (const doc of menuSnap.docs) {
    const data = doc.data();
    const cats = data.categories || [];
    for (const cat of cats) {
      if (cat.nom === 'Les Binouz') {
        console.log(`Menu ${data.nom}:`);
        for (const r of (cat.recettes || [])) {
          const rec = recSnap.docs.find(d => d.id === r.id);
          console.log(`  ${rec ? rec.data().nom : r.id} (${r.prixVente}€)`);
        }
      }
    }
  }

  console.log('\n=== INGREDIENTS BIERE ===\n');
  for (const doc of ingSnap.docs) {
    const nom = doc.data().nom.toLowerCase();
    if (nom.includes('bière') || nom.includes('biere') || nom.includes('ipa') || nom.includes('cidre') || nom.includes('corona') || nom.includes('triple') || nom.includes('alex') || nom.includes('neipa')) {
      console.log(`${doc.data().nom} (${doc.id}) | unite: ${doc.data().unite}`);
    }
  }

  console.log('\n=== NOMS CAISSE BINOUZ ===\n');
  const caisseNoms = [
    '33 neipa', 'Alex 33cl', 'Alex demi', 'Alex pinte',
    'Cidre pinte', 'Corona', 'Demi cidre',
    'IPA demi', 'IPA pinte', 'Monaco pinte',
    'Season demi NEIPA', 'Season pinte NEIPA', 'TRIPLE',
  ];
  for (const c of caisseNoms) console.log(`  ${c}`);
}

main().catch(err => { console.error(err); process.exit(1); });
