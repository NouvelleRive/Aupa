import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { resolve } from 'path';

const app = initializeApp({ credential: cert(resolve(__dirname, '../serviceAccountKey.json')) });
const db = getFirestore(app);

// verre=14cL, 1/4=25cL, 1/2=50cL, bouteille=75cL
const FORMATS = [
  { suffix: '(verre)', litres: 0.14 },
  { suffix: '1/4', litres: 0.25 },
  { suffix: '1/2', litres: 0.50 },
  { suffix: 'bouteille', litres: 0.75 },
];

const VINS = [
  { recetteBase: 'Vin blanc', ingredient: 'Vin blanc' },
  { recetteBase: 'Vin rosé', ingredient: 'Vin rosé' },
  { recetteBase: 'Vin rouge', ingredient: 'Vin rouge' },
  { recetteBase: 'Pétillant', ingredient: 'Frizzante' },
];

async function main() {
  const ingSnap = await db.collection('ingredients').get();
  const recSnap = await db.collection('recettes').get();

  // 1) S'assurer que les 4 ingrédients existent
  console.log('=== 1) Ingrédients ===\n');

  // Renommer "Vin" → "Vin rouge" s'il existe
  for (const doc of ingSnap.docs) {
    if (doc.data().nom === 'Vin') {
      await doc.ref.update({ nom: 'Vin rouge' });
      console.log(`✔ Renommé "Vin" → "Vin rouge" (${doc.id})`);
    }
  }

  const ingMap: Record<string, string> = {}; // nom → id
  const freshIngSnap = await db.collection('ingredients').get();
  for (const doc of freshIngSnap.docs) {
    ingMap[doc.data().nom] = doc.id;
  }

  // Créer les manquants
  for (const vin of VINS) {
    if (!ingMap[vin.ingredient]) {
      const ref = await db.collection('ingredients').add({
        nom: vin.ingredient,
        unite: 'L',
        categorie: 'boisson',
      });
      ingMap[vin.ingredient] = ref.id;
      console.log(`✔ Créé ingrédient "${vin.ingredient}" (${ref.id})`);
    } else {
      console.log(`  "${vin.ingredient}" existe déjà (${ingMap[vin.ingredient]})`);
    }
  }

  // 2) Créer/mettre à jour les 16 recettes
  console.log('\n=== 2) Recettes ===\n');

  const existingRecettes: Record<string, any> = {};
  for (const doc of recSnap.docs) {
    existingRecettes[doc.data().nom] = { id: doc.id, ref: doc.ref };
  }

  for (const vin of VINS) {
    const ingId = ingMap[vin.ingredient];

    for (const format of FORMATS) {
      const nomRecette = `${vin.recetteBase} ${format.suffix}`;
      const ingredients = [{
        ingredientId: ingId,
        nomIngredient: vin.ingredient,
        grammage: format.litres,
      }];

      if (existingRecettes[nomRecette]) {
        await existingRecettes[nomRecette].ref.update({ ingredients });
        console.log(`✔ Mis à jour "${nomRecette}" → ${vin.ingredient} ${format.litres} L`);
      } else {
        await db.collection('recettes').add({
          nom: nomRecette,
          categorie: 'Les Wines',
          type: 'boisson',
          actif: true,
          prixVente: 0,
          ingredients,
          options: [],
          coutCalcule: 0,
          updatedAt: new Date().toISOString(),
        });
        console.log(`✔ Créé "${nomRecette}" → ${vin.ingredient} ${format.litres} L`);
      }
    }
  }

  console.log('\n=== Terminé ===');
}

main().catch(err => { console.error(err); process.exit(1); });
