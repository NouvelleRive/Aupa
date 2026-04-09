import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { resolve } from 'path';

const app = initializeApp({ credential: cert(resolve(__dirname, '../serviceAccountKey.json')) });
const db = getFirestore(app);

async function main() {
  console.log('=== Fusion "Beurre de lidl" → "Beurre" ===\n');

  // 1. Remplacer dans les recettes
  console.log('1) Remplacement dans les recettes...');
  const recSnap = await db.collection('recettes').get();
  let recUpdated = 0;

  for (const doc of recSnap.docs) {
    const data = doc.data();
    const lignes: any[] = data.ingredients || [];
    let changed = false;

    const newLignes = lignes.map((l: any) => {
      if (l.nomIngredient === 'Beurre de lidl') {
        changed = true;
        return { ...l, nomIngredient: 'Beurre' };
      }
      return l;
    });

    if (changed) {
      await doc.ref.update({ ingredients: newLignes });
      console.log(`   ✔ Recette "${data.nom}" (${doc.id})`);
      recUpdated++;
    }
  }
  console.log(`   ${recUpdated} recette(s) modifiée(s)\n`);

  // 2. Remplacer dans produitsFournisseurs
  console.log('2) Remplacement dans produitsFournisseurs...');
  const pfSnap = await db.collection('produitsFournisseurs').get();
  let pfUpdated = 0;

  for (const doc of pfSnap.docs) {
    if (doc.data().ingredient === 'Beurre de lidl') {
      await doc.ref.update({ ingredient: 'Beurre' });
      console.log(`   ✔ PF ${doc.id}`);
      pfUpdated++;
    }
  }
  console.log(`   ${pfUpdated} produit(s) fournisseur(s) modifié(s)\n`);

  // 3. Supprimer le doc "Beurre de lidl" de ingredients
  console.log('3) Suppression du doc "Beurre de lidl" dans ingredients...');
  const ingSnap = await db.collection('ingredients').where('nom', '==', 'Beurre de lidl').get();

  if (ingSnap.empty) {
    console.log('   ⚠ Aucun doc trouvé\n');
  } else {
    for (const doc of ingSnap.docs) {
      await doc.ref.delete();
      console.log(`   ✔ Supprimé (${doc.id})`);
    }
  }

  console.log('\n=== Terminé ===');
}

main().catch(err => { console.error('Erreur:', err); process.exit(1); });
