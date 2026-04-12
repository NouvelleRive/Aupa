import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, updateDoc, deleteDoc } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyDAjm-Sg5ABbkoU54noDFsyADAYfTnXHDc",
  authDomain: "aupa-be0e5.firebaseapp.com",
  projectId: "aupa-be0e5",
  storageBucket: "aupa-be0e5.firebasestorage.app",
  messagingSenderId: "1069749466934",
  appId: "1:1069749466934:web:33a4d4b04e9a9772cf2597",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const LAIT_ID = 'hClJcJms68PPdbKynvXG';        // Lait (on garde celui-ci)
const LAIT_ENTIER_ID = 'meB4pa2zyee6aMAZlgNp';  // Lait entier (à supprimer)

// 1. Mettre à jour les recettes
const recSnap = await getDocs(collection(db, 'recettes'));
let recUpdated = 0;
for (const d of recSnap.docs) {
  const data = d.data();
  const ings = data.ingredients || [];
  let changed = false;
  const newIngs = ings.map(i => {
    if (i.ingredientId === LAIT_ENTIER_ID) {
      changed = true;
      return { ...i, ingredientId: LAIT_ID, nomIngredient: 'Lait' };
    }
    if (i.nomIngredient === 'Lait entier' && !i.ingredientId) {
      changed = true;
      return { ...i, ingredientId: LAIT_ID, nomIngredient: 'Lait' };
    }
    return i;
  });
  if (changed) {
    await updateDoc(doc(db, 'recettes', d.id), { ingredients: newIngs });
    console.log(`  Recette mise à jour: ${data.nom}`);
    recUpdated++;
  }
}
console.log(`\n${recUpdated} recette(s) mise(s) à jour`);

// 2. Mettre à jour les produits fournisseurs
const pfSnap = await getDocs(collection(db, 'produitsFournisseurs'));
let pfUpdated = 0;
for (const d of pfSnap.docs) {
  const data = d.data();
  const updates = {};
  if (data.ingredientId === LAIT_ENTIER_ID) updates.ingredientId = LAIT_ID;
  if (data.ingredient === 'Lait entier') updates.ingredient = 'Lait';
  if (Object.keys(updates).length > 0) {
    await updateDoc(doc(db, 'produitsFournisseurs', d.id), updates);
    console.log(`  PF mis à jour: ${data.nom}`);
    pfUpdated++;
  }
}
console.log(`${pfUpdated} produit(s) fournisseur(s) mis à jour`);

// 3. Mettre à jour le fournisseurRefId de l'ingrédient "Lait" s'il pointait vers Lait entier
const ingSnap = await getDocs(collection(db, 'ingredients'));
for (const d of ingSnap.docs) {
  if (d.id === LAIT_ID && d.data().fournisseurRefId) {
    // garder tel quel
  }
}

// 4. Supprimer l'ingrédient "Lait entier"
await deleteDoc(doc(db, 'ingredients', LAIT_ENTIER_ID));
console.log('\nIngrédient "Lait entier" supprimé de Firestore');

console.log('\nFusion terminée !');
