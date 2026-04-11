import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { resolve } from 'path';

const app = initializeApp({ credential: cert(resolve(__dirname, '../serviceAccountKey.json')) });
const db = getFirestore(app);

const OLD_RHUM_ID = 'NSQiJ5sfxUwCyzCAUHIV';

async function main() {
  // 1) Voir comment Rhum est utilisé
  const recSnap = await db.collection('recettes').get();
  console.log('=== Utilisation de Rhum ===\n');
  for (const doc of recSnap.docs) {
    const data = doc.data();
    for (const ing of (data.ingredients || [])) {
      if (ing.ingredientId === OLD_RHUM_ID || ing.nomIngredient === 'Rhum') {
        console.log(`${data.categorie.padEnd(25)} | ${data.nom} → ${ing.grammage} L`);
      }
    }
  }

  // 2) Renommer l'ancien "Rhum" → "Rhum cocktail"
  await db.collection('ingredients').doc(OLD_RHUM_ID).update({ nom: 'Rhum cocktail' });
  console.log(`\n✔ Renommé "Rhum" → "Rhum cocktail" (${OLD_RHUM_ID})`);

  // 3) Créer "Rhum digestif"
  const ref = await db.collection('ingredients').add({
    nom: 'Rhum digestif',
    unite: 'L',
    categorie: 'boisson',
  });
  console.log(`✔ Créé "Rhum digestif" (${ref.id})`);

  // 4) Mettre à jour les recettes
  for (const doc of recSnap.docs) {
    const data = doc.data();
    const lignes: any[] = data.ingredients || [];
    let changed = false;

    const newLignes = lignes.map((l: any) => {
      if (l.ingredientId === OLD_RHUM_ID || l.nomIngredient === 'Rhum') {
        changed = true;
        // Digestifs → Rhum digestif
        if (data.categorie === 'Les Apéritifs et Digestifs') {
          return { ...l, ingredientId: ref.id, nomIngredient: 'Rhum digestif' };
        }
        // Cocktails et autres → Rhum cocktail
        return { ...l, ingredientId: OLD_RHUM_ID, nomIngredient: 'Rhum cocktail' };
      }
      return l;
    });

    if (changed) {
      await doc.ref.update({ ingredients: newLignes });
      console.log(`✔ ${data.nom} → ${data.categorie === 'Les Apéritifs et Digestifs' ? 'Rhum digestif' : 'Rhum cocktail'}`);
    }
  }

  // 5) Mettre à jour les produits fournisseurs
  const pfSnap = await db.collection('produitsFournisseurs').get();
  for (const doc of pfSnap.docs) {
    if (doc.data().ingredient === 'Rhum') {
      await doc.ref.update({ ingredient: 'Rhum cocktail' });
      console.log(`✔ PF "${doc.data().nom}" → Rhum cocktail`);
    }
  }

  console.log('\nTerminé');
}

main().catch(err => { console.error(err); process.exit(1); });
