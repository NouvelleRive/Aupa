import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { resolve } from 'path';

const app = initializeApp({ credential: cert(resolve(__dirname, '../serviceAccountKey.json')) });
const db = getFirestore(app);

async function main() {
  const recSnap = await db.collection('recettes').get();
  const ingSnap = await db.collection('ingredients').get();

  // Recettes digestifs
  for (const doc of recSnap.docs) {
    const data = doc.data();
    if (data.categorie === 'Les Apéritifs et Digestifs') {
      console.log(`RECETTE: ${data.nom} (${doc.id}) | ingredients:`, JSON.stringify(data.ingredients || []));
    }
  }

  // Ingrédients qui pourraient correspondre
  console.log('\nINGRÉDIENTS BOISSON/ALCOOL:');
  for (const doc of ingSnap.docs) {
    const data = doc.data();
    if (data.categorie === 'boisson' || data.nom.toLowerCase().match(/baileys|calva|cognac|armagnac|pastis|whisky|limoncello|martini|ouzo|picon|get 27|get 31|diplomatico|poire/i)) {
      console.log(`  ${data.nom} (${doc.id}) | unite: ${data.unite} | cat: ${data.categorie}`);
    }
  }
}

main().catch(err => { console.error(err); process.exit(1); });
