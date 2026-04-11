import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { resolve } from 'path';

const app = initializeApp({ credential: cert(resolve(__dirname, '../serviceAccountKey.json')) });
const db = getFirestore(app);

async function main() {
  const ingSnap = await db.collection('ingredients').get();
  const recSnap = await db.collection('recettes').get();

  // Trouver l'ingrédient Perrier actuel
  let perrierDoc: any = null;
  for (const doc of ingSnap.docs) {
    if (doc.data().nom === 'Perrier') {
      perrierDoc = doc;
      console.log(`Perrier actuel: ${doc.id}`);
    }
  }

  // Vérifier les recettes qui utilisent Perrier
  console.log('\n=== Utilisation actuelle ===');
  for (const doc of recSnap.docs) {
    const data = doc.data();
    for (const ing of (data.ingredients || [])) {
      if (ing.nomIngredient === 'Perrier' || (perrierDoc && ing.ingredientId === perrierDoc.id)) {
        console.log(`${data.nom} → ${ing.grammage} L`);
      }
    }
  }

  // Recette existante ?
  for (const doc of recSnap.docs) {
    if (doc.data().nom?.includes('Perrier')) {
      console.log(`\nRecette existante: "${doc.data().nom}" (${doc.id})`);
    }
  }

  // 1) Renommer Perrier → Perrier 33cl
  if (perrierDoc) {
    await perrierDoc.ref.update({ nom: 'Perrier 33cl' });
    console.log('\n✔ Renommé "Perrier" → "Perrier 33cl"');
  }

  // 2) Créer ingrédient "Perrier 1L"
  const ref1L = await db.collection('ingredients').add({ nom: 'Perrier 1L', unite: 'pièce', categorie: 'boisson' });
  console.log(`✔ Créé "Perrier 1L" (${ref1L.id})`);

  // 3) Mettre à jour la recette "Perrier bouteille" → Perrier 33cl, 1 pièce
  for (const doc of recSnap.docs) {
    if (doc.data().nom === 'Perrier bouteille') {
      await doc.ref.update({
        ingredients: [{ ingredientId: perrierDoc.id, nomIngredient: 'Perrier 33cl', grammage: 1 }],
      });
      console.log('✔ Mis à jour "Perrier bouteille" → Perrier 33cl x1');
    }
  }

  // 4) Créer recette "Perrier 1L"
  await db.collection('recettes').add({
    nom: 'Perrier 1L',
    categorie: 'Les Sodas',
    type: 'boisson',
    actif: true,
    prixVente: 0,
    ingredients: [{ ingredientId: ref1L.id, nomIngredient: 'Perrier 1L', grammage: 1 }],
    options: [],
    coutCalcule: 0,
    updatedAt: new Date().toISOString(),
  });
  console.log('✔ Créé recette "Perrier 1L"');

  // 5) Mettre à jour les PF
  const pfSnap = await db.collection('produitsFournisseurs').get();
  for (const doc of pfSnap.docs) {
    if (doc.data().ingredient === 'Perrier') {
      await doc.ref.update({ ingredient: 'Perrier 33cl' });
      console.log(`✔ PF "${doc.data().nom}" → Perrier 33cl`);
    }
  }

  console.log('\nTerminé');
}

main().catch(err => { console.error(err); process.exit(1); });
