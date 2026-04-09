import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { resolve } from 'path';

const app = initializeApp({ credential: cert(resolve(__dirname, '../serviceAccountKey.json')) });
const db = getFirestore(app);

async function main() {
  console.log('=== Fusion "Beurre salé de lidl" → "Beurre salé" ===\n');

  // 1. Remplacer dans les recettes
  console.log('1) Remplacement dans les recettes...');
  const recSnap = await db.collection('recettes').get();
  let recUpdated = 0;

  for (const doc of recSnap.docs) {
    const data = doc.data();
    const lignes: any[] = data.ingredients || [];
    let changed = false;

    const newLignes = lignes.map((l: any) => {
      if (l.nomIngredient === 'Beurre salé de lidl') {
        changed = true;
        return { ...l, nomIngredient: 'Beurre salé' };
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
    if (doc.data().ingredient === 'Beurre salé de lidl') {
      await doc.ref.update({ ingredient: 'Beurre salé' });
      console.log(`   ✔ PF ${doc.id}`);
      pfUpdated++;
    }
  }
  console.log(`   ${pfUpdated} produit(s) fournisseur(s) modifié(s)\n`);

  // 3. Renommer le doc dans ingredients (ou supprimer si "Beurre salé" existe déjà)
  console.log('3) Mise à jour dans ingredients...');
  const existSnap = await db.collection('ingredients').where('nom', '==', 'Beurre salé').get();
  const oldSnap = await db.collection('ingredients').where('nom', '==', 'Beurre salé de lidl').get();

  if (oldSnap.empty) {
    console.log('   ⚠ Aucun doc "Beurre salé de lidl" trouvé');
  } else if (!existSnap.empty) {
    // "Beurre salé" existe déjà, supprimer le doublon
    for (const doc of oldSnap.docs) {
      await doc.ref.delete();
      console.log(`   ✔ Supprimé doublon (${doc.id})`);
    }
  } else {
    // Renommer
    for (const doc of oldSnap.docs) {
      await doc.ref.update({ nom: 'Beurre salé' });
      console.log(`   ✔ Renommé (${doc.id})`);
    }
  }

  console.log('\n=== Terminé ===');
}

main().catch(err => { console.error('Erreur:', err); process.exit(1); });
