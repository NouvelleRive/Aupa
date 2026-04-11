import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { resolve } from 'path';

const app = initializeApp({ credential: cert(resolve(__dirname, '../serviceAccountKey.json')) });
const db = getFirestore(app);

async function main() {
  // ===== PARTIE 1 : Supprimer "Epices guaca" du guacamole et de la collection ingredients =====
  console.log('=== 1) Suppression "Epices guaca" ===\n');

  // Retirer de toutes les recettes qui l'utilisent
  const recSnap = await db.collection('recettes').get();
  let recCleaned = 0;

  for (const doc of recSnap.docs) {
    const data = doc.data();
    const lignes: any[] = data.ingredients || [];
    const filtered = lignes.filter((l: any) => l.nomIngredient !== 'Epices guaca');

    if (filtered.length < lignes.length) {
      await doc.ref.update({ ingredients: filtered });
      console.log(`   ✔ Retiré "Epices guaca" de "${data.nom}" (${doc.id})`);
      recCleaned++;
    }
  }
  console.log(`   ${recCleaned} recette(s) nettoyée(s)\n`);

  // Supprimer les produits fournisseurs liés
  const pfGuacaSnap = await db.collection('produitsFournisseurs').get();
  let pfDeleted = 0;
  for (const doc of pfGuacaSnap.docs) {
    if (doc.data().ingredient === 'Epices guaca') {
      await doc.ref.delete();
      console.log(`   ✔ Supprimé PF "${doc.data().nom || doc.data().designation}" (${doc.id})`);
      pfDeleted++;
    }
  }
  console.log(`   ${pfDeleted} produit(s) fournisseur(s) supprimé(s)\n`);

  // Supprimer l'ingrédient
  const ingGuacaSnap = await db.collection('ingredients').where('nom', '==', 'Epices guaca').get();
  for (const doc of ingGuacaSnap.docs) {
    await doc.ref.delete();
    console.log(`   ✔ Ingrédient "Epices guaca" supprimé (${doc.id})`);
  }

  // ===== PARTIE 2 : Fusion "Curry de metro" + "Epices curry" → "Curry" =====
  console.log('\n=== 2) Fusion "Curry de metro" + "Epices curry" → "Curry" ===\n');

  const OLD_NAMES = ['Curry de metro', 'Epices curry'];
  const NEW_NAME = 'Curry';

  // Remplacer dans les recettes
  console.log('2a) Remplacement dans les recettes...');
  let recUpdated = 0;

  for (const doc of recSnap.docs) {
    // Re-read in case we updated in part 1
    const fresh = await doc.ref.get();
    const data = fresh.data()!;
    const lignes: any[] = data.ingredients || [];
    let changed = false;

    const newLignes = lignes.map((l: any) => {
      if (OLD_NAMES.includes(l.nomIngredient)) {
        changed = true;
        return { ...l, nomIngredient: NEW_NAME };
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

  // Remplacer dans produitsFournisseurs
  console.log('2b) Remplacement dans produitsFournisseurs...');
  const pfSnap = await db.collection('produitsFournisseurs').get();
  let pfUpdated = 0;

  for (const doc of pfSnap.docs) {
    if (OLD_NAMES.includes(doc.data().ingredient)) {
      await doc.ref.update({ ingredient: NEW_NAME });
      console.log(`   ✔ PF ${doc.data().nom || doc.data().designation} (${doc.id})`);
      pfUpdated++;
    }
  }
  console.log(`   ${pfUpdated} produit(s) fournisseur(s) modifié(s)\n`);

  // Nettoyage dans ingredients
  console.log('2c) Nettoyage dans ingredients...');
  const existSnap = await db.collection('ingredients').where('nom', '==', NEW_NAME).get();

  for (const old of OLD_NAMES) {
    const snap = await db.collection('ingredients').where('nom', '==', old).get();
    if (snap.empty) continue;
    for (const doc of snap.docs) {
      if (existSnap.empty) {
        await doc.ref.update({ nom: NEW_NAME });
        console.log(`   ✔ Renommé "${old}" → "${NEW_NAME}" (${doc.id})`);
      } else {
        await doc.ref.delete();
        console.log(`   ✔ Supprimé doublon "${old}" (${doc.id})`);
      }
    }
  }

  console.log('\n=== Terminé ===');
}

main().catch(err => { console.error('Erreur:', err); process.exit(1); });
