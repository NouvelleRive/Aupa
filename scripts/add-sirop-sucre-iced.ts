import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { resolve } from 'path';

const app = initializeApp({ credential: cert(resolve(__dirname, '../serviceAccountKey.json')) });
const db = getFirestore(app);

const SIROP_ID = 'qKK3OdfC1SoFpHlaLEoX';
const SIROP_NOM = 'Sirop de sucre de canne';

async function main() {
  const recSnap = await db.collection('recettes').get();
  let count = 0;
  let skipped: string[] = [];

  for (const docSnap of recSnap.docs) {
    const data = docSnap.data();
    if (!data.nom?.toLowerCase().includes('iced') && !data.nom?.toLowerCase().includes('ice tea')) continue;

    const ingredients = data.ingredients || [];

    // Vérifier si un sirop de sucre est déjà présent
    const dejaSirop = ingredients.some((i: any) =>
      i.nomIngredient?.toLowerCase().includes('sirop de sucre') ||
      i.nomIngredient?.toLowerCase().includes('sirop sucre') ||
      i.ingredientId === SIROP_ID
    );

    if (dejaSirop) {
      skipped.push(data.nom);
      continue;
    }

    ingredients.push({
      ingredientId: SIROP_ID,
      nomIngredient: SIROP_NOM,
      grammage: 0.01, // 1 cL = 0.01 L
    });

    await db.collection('recettes').doc(docSnap.id).update({ ingredients });
    console.log(`+ Sirop de sucre de canne → ${data.nom}`);
    count++;
  }

  if (skipped.length) {
    console.log(`\nDéjà du sirop, ignorées : ${skipped.join(', ')}`);
  }
  console.log(`\nTerminé : ${count} recettes mises à jour`);
}

main().catch(err => { console.error(err); process.exit(1); });
