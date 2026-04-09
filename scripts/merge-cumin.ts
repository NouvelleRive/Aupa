import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { resolve } from 'path';

const app = initializeApp({ credential: cert(resolve(__dirname, '../serviceAccountKey.json')) });
const db = getFirestore(app);

const OLD_NAMES = ['Cumin de metro', 'Cumin metro'];
const NEW_NAME = 'Cumin';

async function main() {
  console.log(`=== Fusion ${OLD_NAMES.join(' + ')} → "${NEW_NAME}" ===\n`);

  // 1. Remplacer dans les recettes
  console.log('1) Remplacement dans les recettes...');
  const recSnap = await db.collection('recettes').get();
  let recUpdated = 0;

  for (const doc of recSnap.docs) {
    const data = doc.data();
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

  // 2. Remplacer dans produitsFournisseurs
  console.log('2) Remplacement dans produitsFournisseurs...');
  const pfSnap = await db.collection('produitsFournisseurs').get();
  let pfUpdated = 0;

  for (const doc of pfSnap.docs) {
    if (OLD_NAMES.includes(doc.data().ingredient)) {
      await doc.ref.update({ ingredient: NEW_NAME });
      console.log(`   ✔ PF ${doc.id}`);
      pfUpdated++;
    }
  }
  console.log(`   ${pfUpdated} produit(s) fournisseur(s) modifié(s)\n`);

  // 3. Supprimer les anciens docs, garder ou créer le nouveau
  console.log('3) Nettoyage dans ingredients...');
  const existSnap = await db.collection('ingredients').where('nom', '==', NEW_NAME).get();

  for (const old of OLD_NAMES) {
    const snap = await db.collection('ingredients').where('nom', '==', old).get();
    if (snap.empty) continue;
    for (const doc of snap.docs) {
      if (existSnap.empty) {
        // Renommer le premier trouvé
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
