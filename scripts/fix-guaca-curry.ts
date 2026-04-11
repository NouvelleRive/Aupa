import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { resolve } from 'path';

const app = initializeApp({ credential: cert(resolve(__dirname, '../serviceAccountKey.json')) });
const db = getFirestore(app);

async function main() {
  // ===== 1) Retirer "Epices guaca de metro" des recettes + supprimer l'ingrédient =====
  console.log('=== 1) Suppression "Epices guaca de metro" ===\n');

  const recSnap = await db.collection('recettes').get();
  let recCleaned = 0;

  for (const doc of recSnap.docs) {
    const data = doc.data();
    const lignes: any[] = data.ingredients || [];
    const filtered = lignes.filter((l: any) => l.nomIngredient !== 'Epices guaca de metro');

    if (filtered.length < lignes.length) {
      await doc.ref.update({ ingredients: filtered });
      console.log(`   ✔ Retiré de "${data.nom}" (${doc.id})`);
      recCleaned++;
    }
  }
  console.log(`   ${recCleaned} recette(s) nettoyée(s)\n`);

  // Supprimer PF liés
  const pfSnap = await db.collection('produitsFournisseurs').get();
  let pfDel = 0;
  for (const doc of pfSnap.docs) {
    if (doc.data().ingredient === 'Epices guaca de metro') {
      await doc.ref.delete();
      console.log(`   ✔ Supprimé PF (${doc.id})`);
      pfDel++;
    }
  }
  console.log(`   ${pfDel} PF supprimé(s)\n`);

  // Supprimer l'ingrédient
  const ingSnap = await db.collection('ingredients').where('nom', '==', 'Epices guaca de metro').get();
  for (const doc of ingSnap.docs) {
    await doc.ref.delete();
    console.log(`   ✔ Ingrédient supprimé (${doc.id})`);
  }

  // ===== 2) Dédoublonner "Curry" (le script précédent a renommé les deux) =====
  console.log('\n=== 2) Dédoublonnage "Curry" ===\n');

  const currySnap = await db.collection('ingredients').where('nom', '==', 'Curry').get();
  if (currySnap.size > 1) {
    const [keep, ...dupes] = currySnap.docs;
    console.log(`   Garde: ${keep.id}`);
    for (const dup of dupes) {
      await dup.ref.delete();
      console.log(`   ✔ Doublon supprimé (${dup.id})`);
    }
  } else {
    console.log('   Pas de doublon');
  }

  console.log('\n=== Terminé ===');
}

main().catch(err => { console.error(err); process.exit(1); });
