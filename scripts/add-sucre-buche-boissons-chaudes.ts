import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { resolve } from 'path';

const app = initializeApp({ credential: cert(resolve(__dirname, '../serviceAccountKey.json')) });
const db = getFirestore(app);

const EXCLUES = ['Cidre chaud', 'Vin chaud', 'Grog'];

async function main() {
  // 1. Créer l'ingrédient "Sucre bûche"
  const ingRef = await db.collection('ingredients').add({
    nom: 'Sucre bûche',
    unite: 'kg',
    categorie: 'épicerie sucrée',
  });
  console.log(`Ingrédient "Sucre bûche" créé (${ingRef.id})`);

  // 2. Lier le produit fournisseur LBA au nouvel ingrédient
  const pfSnap = await db.collection('produitsFournisseurs').get();
  for (const docSnap of pfSnap.docs) {
    const data = docSnap.data();
    if (data.nom?.toLowerCase().includes('sucre buche') && data.fournisseur === 'LBA') {
      await db.collection('produitsFournisseurs').doc(docSnap.id).update({
        ingredientId: ingRef.id,
        ingredient: 'Sucre bûche',
      });
      console.log(`PF "${data.nom}" lié à l'ingrédient`);

      // 3. Mettre le fournisseurRefId sur l'ingrédient
      await db.collection('ingredients').doc(ingRef.id).update({
        fournisseurRefId: docSnap.id,
      });
      console.log(`FournisseurRefId mis à jour sur l'ingrédient`);
      break;
    }
  }

  // 4. Ajouter 0.002 kg de sucre bûche à toutes les boissons chaudes sauf exclues
  const recSnap = await db.collection('recettes').get();
  let count = 0;

  for (const docSnap of recSnap.docs) {
    const data = docSnap.data();
    if (data.categorie !== 'Le Chaud' || data.type !== 'boisson') continue;
    if (EXCLUES.includes(data.nom)) continue;

    const ingredients = data.ingredients || [];

    // Vérifier que le sucre bûche n'est pas déjà présent
    const dejaPres = ingredients.some((i: any) =>
      i.nomIngredient?.toLowerCase().includes('sucre bûche') ||
      i.ingredientId === ingRef.id
    );
    if (dejaPres) continue;

    ingredients.push({
      ingredientId: ingRef.id,
      nomIngredient: 'Sucre bûche',
      grammage: 0.002,
    });

    await db.collection('recettes').doc(docSnap.id).update({ ingredients });
    console.log(`+ Sucre bûche → ${data.nom}`);
    count++;
  }

  console.log(`\nTerminé : ${count} recettes mises à jour`);
}

main().catch(err => { console.error(err); process.exit(1); });
