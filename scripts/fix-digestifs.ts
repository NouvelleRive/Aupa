import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { resolve } from 'path';

const app = initializeApp({ credential: cert(resolve(__dirname, '../serviceAccountKey.json')) });
const db = getFirestore(app);

// Mapping recette nom → ingredientId + nomIngredient
const DIGESTIFS: Record<string, { ingredientId: string; nomIngredient: string }> = {
  'Armagnac':      { ingredientId: 'qmTIWrh8bdPd2N98mIah', nomIngredient: 'Armagnac' },
  'Baileys':       { ingredientId: 'e0bb96BmOayBBXLEfv8v', nomIngredient: 'Baileys' },
  'Calva':         { ingredientId: 'c2hYcQ1Xk97CQduvBGKP', nomIngredient: 'Calva' },
  'Cognac':        { ingredientId: 'OOwRdyeuopcc0BMN3mjN', nomIngredient: 'Cognac' },
  'Diplomatico':   { ingredientId: 'OOwRdyeuopcc0BMN3mjN', nomIngredient: 'Cognac' }, // pas d'ingrédient Diplomatico, on skip
  'Get 27':        { ingredientId: 'UAtyPW0IhZV37G39oajw', nomIngredient: 'Get 27' },
  'Get 31':        { ingredientId: 'k8llQATEBOarQaOGTmDa', nomIngredient: 'Get 31' },
  'Limoncello':    { ingredientId: 'RaMSMQxmR5a4DPTbab1G', nomIngredient: 'Limoncello' },
  'Martini blanc': { ingredientId: '4dzzSoNQjSZH1KbvjSms', nomIngredient: 'Martini blanc' },
  'Martini rouge': { ingredientId: 'uEXMugvNjplPJ1GD5jeR', nomIngredient: 'Martini rouge' },
  'Ouzo':          { ingredientId: 'Yo9Q7lx9MwqOHYKleHvD', nomIngredient: 'Ouzo' },
  'Pastis':        { ingredientId: 'RuYEn43doDP8v8A40HT1', nomIngredient: 'Pastis' },
  'Poire williams': { ingredientId: '', nomIngredient: '' }, // pas d'ingrédient, on skip
  'Whisky':        { ingredientId: 'S9QPOz15FXkAfl9xIFsQ', nomIngredient: 'Whisky' },
};

async function main() {
  const recSnap = await db.collection('recettes').get();
  let updated = 0;

  for (const doc of recSnap.docs) {
    const data = doc.data();
    if (data.categorie !== 'Les Apéritifs et Digestifs') continue;
    if (data.nom === 'Picon bière') continue;

    const mapping = DIGESTIFS[data.nom];
    if (!mapping || !mapping.ingredientId) {
      console.log(`⏭ ${data.nom} — pas d'ingrédient correspondant, skippé`);
      continue;
    }

    const ingredients = [{
      ingredientId: mapping.ingredientId,
      nomIngredient: mapping.nomIngredient,
      grammage: 0.05, // 5 cL = 0.05 L
    }];

    await doc.ref.update({ ingredients });
    console.log(`✔ ${data.nom} → ${mapping.nomIngredient} 0.05 L`);
    updated++;
  }

  console.log(`\n${updated} recette(s) mises à jour`);
}

main().catch(err => { console.error(err); process.exit(1); });
