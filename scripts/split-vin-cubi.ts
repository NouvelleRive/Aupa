import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { resolve } from 'path';

const app = initializeApp({ credential: cert(resolve(__dirname, '../serviceAccountKey.json')) });
const db = getFirestore(app);

async function main() {
  // 1) Créer l'ingrédient "Vin rouge cubi"
  const ref = await db.collection('ingredients').add({
    nom: 'Vin rouge cubi',
    unite: 'L',
    categorie: 'boisson',
  });
  console.log(`✔ Créé ingrédient "Vin rouge cubi" (${ref.id})`);

  // 2) Mettre à jour Prépa bourguignon et Vin chaud : remplacer Vin rouge → Vin rouge cubi
  const recSnap = await db.collection('recettes').get();
  const VIN_ROUGE_ID = 'uYMrPPEtppz1hcVli4lZ';

  for (const doc of recSnap.docs) {
    const data = doc.data();
    // Ne pas toucher aux recettes de vin (Les Wines)
    if (data.categorie === 'Les Wines') continue;

    const lignes: any[] = data.ingredients || [];
    let changed = false;

    const newLignes = lignes.map((l: any) => {
      if (l.ingredientId === VIN_ROUGE_ID || l.nomIngredient === 'Vin rouge' || l.nomIngredient === 'Vin') {
        changed = true;
        return { ...l, ingredientId: ref.id, nomIngredient: 'Vin rouge cubi' };
      }
      return l;
    });

    if (changed) {
      await doc.ref.update({ ingredients: newLignes });
      console.log(`✔ ${data.nom} → Vin rouge cubi`);
    }
  }

  console.log('\nTerminé');
}

main().catch(err => { console.error(err); process.exit(1); });
