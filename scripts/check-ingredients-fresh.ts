import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { resolve } from 'path';

const app = initializeApp({ credential: cert(resolve(__dirname, '../serviceAccountKey.json')) });
const db = getFirestore(app);

async function main() {
  const ingSnap = await db.collection('ingredients').get();
  const noms = ['eau', 'citron', 'orange', 'perrier', 'ginger', 'sirop', 'thé glacé', 'thé'];

  for (const search of noms) {
    const matches = ingSnap.docs.filter(d => d.data().nom?.toLowerCase().includes(search));
    for (const m of matches) {
      const data = m.data();
      console.log(`${data.nom} | ${data.unite} | ${data.categorie} | id: ${m.id}`);
    }
  }

  // Check categories used for fresh/sodas
  console.log('\n--- Catégories des recettes sodas/fresh ---');
  const recSnap = await db.collection('recettes').get();
  const cats = new Set<string>();
  for (const d of recSnap.docs) {
    const data = d.data();
    if (data.categorie?.includes('Fresh') || data.categorie?.includes('Soda') || data.categorie?.includes('Detox')) {
      cats.add(data.categorie);
      console.log(`${data.nom} → [${data.categorie}] type=${data.type}`);
    }
  }

  // Also check Citron pressé and Orangina details
  console.log('\n--- Citron pressé & Orangina détails ---');
  for (const d of recSnap.docs) {
    const data = d.data();
    if (data.nom === 'Citron pressé' || data.nom === 'Orangina') {
      console.log(`\n${data.nom} (id: ${d.id})`);
      console.log(`  categorie: ${data.categorie}, type: ${data.type}, prixVente: ${data.prixVente}, carte: ${data.carte}`);
      console.log(`  ingredients:`, JSON.stringify(data.ingredients));
    }
  }
}

main().catch(err => { console.error(err); process.exit(1); });
