import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

import { resolve } from 'path';

const app = initializeApp({ credential: cert(resolve(__dirname, '../serviceAccountKey.json')) });
const db = getFirestore(app);

async function main() {
  console.log('=== Cleanup: Prépa thon + fusion Ail pelé → Ail ===\n');

  // ── 1. Créer la recette "Prépa thon" ─────────────────────────────
  console.log('1) Création de la recette "Prépa thon"...');
  const newRef = db.collection('recettes').doc();
  await newRef.set({
    nom: 'Prépa thon',
    categorie: 'Préparations',
    type: 'food',
    actif: true,
    ingredients: [],
    options: [],
    coutCalcule: 0,
    saisons: [],
    carte: '',
    prixVente: 0,
    updatedAt: new Date().toISOString(),
  });
  console.log(`   ✔ Recette créée (id: ${newRef.id})\n`);

  // ── 2. Remplacer "Ail pelé" → "Ail" dans les ingrédients des recettes ──
  console.log('2) Remplacement "Ail pelé" → "Ail" dans les recettes...');
  const recSnap = await db.collection('recettes').get();
  let recettesUpdated = 0;

  for (const doc of recSnap.docs) {
    const data = doc.data();
    const lignes: any[] = data.ingredients || [];
    let changed = false;

    const newLignes = lignes.map((l: any) => {
      if (l.nomIngredient === 'Ail pelé') {
        changed = true;
        return { ...l, nomIngredient: 'Ail' };
      }
      return l;
    });

    if (changed) {
      await doc.ref.update({ ingredients: newLignes });
      console.log(`   ✔ Recette "${data.nom}" (${doc.id}) mise à jour`);
      recettesUpdated++;
    }
  }
  console.log(`   ${recettesUpdated} recette(s) modifiée(s)\n`);

  // ── 3. Remplacer "Ail pelé" → "Ail" dans produitsFournisseurs ────
  console.log('3) Remplacement "Ail pelé" → "Ail" dans produitsFournisseurs...');
  const pfSnap = await db.collection('produitsFournisseurs').get();
  let pfUpdated = 0;

  for (const doc of pfSnap.docs) {
    if (doc.data().ingredient === 'Ail pelé') {
      await doc.ref.update({ ingredient: 'Ail' });
      console.log(`   ✔ ProduitFournisseur ${doc.id} mis à jour`);
      pfUpdated++;
    }
  }
  console.log(`   ${pfUpdated} produit(s) fournisseur(s) modifié(s)\n`);

  // ── 4. Supprimer le doc "Ail pelé" de la collection ingredients ───
  console.log('4) Suppression du doc "Ail pelé" dans ingredients...');
  const ingSnap = await db
    .collection('ingredients')
    .where('nom', '==', 'Ail pelé')
    .get();

  if (ingSnap.empty) {
    console.log('   ⚠ Aucun doc "Ail pelé" trouvé dans ingredients\n');
  } else {
    for (const doc of ingSnap.docs) {
      await doc.ref.delete();
      console.log(`   ✔ Ingrédient supprimé (${doc.id})`);
    }
    console.log(`   ${ingSnap.size} doc(s) supprimé(s)\n`);
  }

  console.log('=== Terminé ===');
}

main().catch((err) => {
  console.error('Erreur:', err);
  process.exit(1);
});
