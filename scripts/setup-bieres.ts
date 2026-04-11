import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { resolve } from 'path';

const app = initializeApp({ credential: cert(resolve(__dirname, '../serviceAccountKey.json')) });
const db = getFirestore(app);

async function main() {
  const ingSnap = await db.collection('ingredients').get();
  const recSnap = await db.collection('recettes').get();

  const ingMap: Record<string, string> = {};
  for (const doc of ingSnap.docs) ingMap[doc.data().nom] = doc.id;

  const recMap: Record<string, any> = {};
  for (const doc of recSnap.docs) recMap[doc.data().nom] = { id: doc.id, ref: doc.ref };

  // 1) Créer les ingrédients manquants
  console.log('=== 1) Ingrédients ===\n');
  const needed = ['Alex', 'Blanche', 'Bière sans alcool', 'Corona', 'Bière du moment', 'Triple'];
  for (const nom of needed) {
    if (ingMap[nom]) {
      console.log(`  "${nom}" existe déjà (${ingMap[nom]})`);
    } else {
      const ref = await db.collection('ingredients').add({ nom, unite: 'L', categorie: 'boisson' });
      ingMap[nom] = ref.id;
      console.log(`✔ Créé "${nom}" (${ref.id})`);
    }
  }
  // IPA et Cidre existent déjà
  console.log(`  "IPA" existe déjà (${ingMap['IPA']})`);
  console.log(`  "Cidre" existe déjà (${ingMap['Cidre']})`);

  // 2) Définir toutes les recettes bière
  console.log('\n=== 2) Recettes ===\n');

  const BIERES = [
    // Pinte + demi
    { nom: 'Alex demi', ingredient: 'Alex', litres: 0.25 },
    { nom: 'Alex pinte', ingredient: 'Alex', litres: 0.50 },
    { nom: 'Bière du moment demi', ingredient: 'Bière du moment', litres: 0.25 },
    { nom: 'Bière du moment pinte', ingredient: 'Bière du moment', litres: 0.50 },
    { nom: 'IPA', ingredient: 'IPA', litres: 0.25 },           // demi
    { nom: 'IPA pinte', ingredient: 'IPA', litres: 0.50 },
    { nom: 'Triple demi', ingredient: 'Triple', litres: 0.25 },
    { nom: 'Triple pinte', ingredient: 'Triple', litres: 0.50 },
    { nom: 'Cidre demi', ingredient: 'Cidre', litres: 0.25 },
    { nom: 'Cidre pinte', ingredient: 'Cidre', litres: 0.50 },
    // Pas de pinte/demi
    { nom: 'Corona', ingredient: 'Corona', litres: 0.33 },
    { nom: 'Blanche', ingredient: 'Blanche', litres: 0.33 },
    { nom: 'Bière sans alcool', ingredient: 'Bière sans alcool', litres: 0.33 },
  ];

  for (const b of BIERES) {
    const ingredients = [{
      ingredientId: ingMap[b.ingredient],
      nomIngredient: b.ingredient,
      grammage: b.litres,
    }];

    if (recMap[b.nom]) {
      await recMap[b.nom].ref.update({ ingredients });
      console.log(`✔ Mis à jour "${b.nom}" → ${b.ingredient} ${b.litres} L`);
    } else {
      await db.collection('recettes').add({
        nom: b.nom,
        categorie: 'Les Binouz',
        type: 'boisson',
        actif: true,
        prixVente: 0,
        ingredients,
        options: [],
        coutCalcule: 0,
        updatedAt: new Date().toISOString(),
      });
      console.log(`✔ Créé "${b.nom}" → ${b.ingredient} ${b.litres} L`);
    }
  }

  // 3) Supprimer "Bière pression" et "Cidre bouteille" si plus utiles
  console.log('\n=== 3) Nettoyage ===\n');
  if (recMap['Bière pression']) {
    await recMap['Bière pression'].ref.delete();
    console.log('✔ Supprimé "Bière pression" (doublon)');
  }

  console.log('\nTerminé');
}

main().catch(err => { console.error(err); process.exit(1); });
