import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { resolve } from 'path';

const app = initializeApp({ credential: cert(resolve(__dirname, '../serviceAccountKey.json')) });
const db = getFirestore(app);

async function main() {
  const snap = await db.collection('recettes').get();
  const recettes = snap.docs.map(d => ({ id: d.id, nom: d.data().nom, categorie: d.data().categorie, actif: d.data().actif }));

  // Sort by category then name
  recettes.sort((a, b) => a.categorie.localeCompare(b.categorie) || a.nom.localeCompare(b.nom));

  for (const r of recettes) {
    if (r.categorie === 'Préparations') continue; // Skip prépas
    console.log(`${r.categorie.padEnd(20)} | ${r.nom}`);
  }
  console.log(`\nTotal: ${recettes.filter(r => r.categorie !== 'Préparations').length} recettes (hors prépas)`);
}

main().catch(err => { console.error(err); process.exit(1); });
