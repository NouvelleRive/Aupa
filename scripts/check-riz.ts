import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const app = initializeApp({ credential: cert('./serviceAccountKey.json') });
const db = getFirestore(app);

async function check() {
  const pfSnap = await db.collection('produitsFournisseurs').get();
  const riz = pfSnap.docs.filter(d => {
    const data = d.data();
    return data.nom?.toLowerCase().includes('riz') || data.ingredient?.toLowerCase().includes('riz');
  });

  if (riz.length === 0) {
    console.log('Aucun produit fournisseur contenant "riz"');
  } else {
    for (const d of riz) {
      const data = d.data();
      console.log(`ID: ${d.id}`);
      console.log(`  nom: ${data.nom}`);
      console.log(`  ingredient: ${data.ingredient || '(non défini)'}`);
      console.log(`  prix: ${data.prix}, unite: ${data.unite}, rendement: ${data.rendement}`);
    }
  }
}

check().catch(console.error);
