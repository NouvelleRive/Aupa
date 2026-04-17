import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { resolve } from 'path';

const app = initializeApp({ credential: cert(resolve(__dirname, '../serviceAccountKey.json')) });
const db = getFirestore(app);

async function main() {
  // Lister les boissons iced
  const recSnap = await db.collection('recettes').get();
  const iced = recSnap.docs
    .map(d => d.data())
    .filter(r => r.nom?.toLowerCase().includes('iced') || r.nom?.toLowerCase().includes('ice'))
    .sort((a, b) => a.nom.localeCompare(b.nom));

  console.log(`${iced.length} boissons iced :\n`);
  for (const r of iced) {
    const ings = (r.ingredients || []).map((i: any) => i.nomIngredient || '?').join(', ');
    console.log(`- ${r.nom} [${r.categorie}] (${ings})`);
  }

  // Chercher sirop de sucre dans produitsFournisseurs
  console.log('\n--- Produits fournisseurs "sirop" ---');
  const pfSnap = await db.collection('produitsFournisseurs').get();
  for (const d of pfSnap.docs) {
    const data = d.data();
    if (data.nom?.toLowerCase().includes('sirop') && data.nom?.toLowerCase().includes('sucre')) {
      console.log(`PF: ${data.nom} | ${data.prix}€ | ${data.unite} | fournisseur: ${data.fournisseur} | ingredientId: ${data.ingredientId || 'non lié'}`);
    }
  }

  // Chercher dans ingredients
  console.log('\n--- Ingrédients "sirop" ---');
  const ingSnap = await db.collection('ingredients').get();
  for (const d of ingSnap.docs) {
    const data = d.data();
    if (data.nom?.toLowerCase().includes('sirop')) {
      console.log(`Ing: ${data.nom} | ${data.unite} | ${data.categorie} | id: ${d.id}`);
    }
  }
}

main().catch(err => { console.error(err); process.exit(1); });
