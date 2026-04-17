import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { resolve } from 'path';

const app = initializeApp({ credential: cert(resolve(__dirname, '../serviceAccountKey.json')) });
const db = getFirestore(app);

async function main() {
  const now = new Date().toISOString();

  // 1. Créer ingrédients manquants
  const cassis = await db.collection('ingredients').add({
    nom: 'Crème de cassis', unite: 'L', categorie: 'boisson',
  });
  console.log(`Ingrédient "Crème de cassis" créé (${cassis.id})`);

  const frizzante = await db.collection('ingredients').add({
    nom: 'Frizzante', unite: 'L', categorie: 'boisson',
  });
  console.log(`Ingrédient "Frizzante" créé (${frizzante.id})`);

  // Récupérer vin blanc
  const ingSnap = await db.collection('ingredients').get();
  const vinBlanc = ingSnap.docs.find(d => d.data().nom === 'Vin blanc');
  if (!vinBlanc) { console.log('Vin blanc non trouvé!'); return; }

  // Récupérer rhum
  const rhumArrange = ingSnap.docs.find(d => d.data().nom === 'Rhum digestif');

  const base = {
    type: 'boisson',
    categorie: 'Les Apéritifs et Digestifs',
    actif: true,
    saisons: [],
    carte: '',
    options: [],
    coutCalcule: 0,
    updatedAt: now,
  };

  // 2. Créer les recettes
  const recettes = [
    {
      nom: 'Kir',
      prixVente: 6,
      ingredients: [
        { ingredientId: cassis.id, nomIngredient: 'Crème de cassis', grammage: 0 },
        { ingredientId: vinBlanc.id, nomIngredient: 'Vin blanc', grammage: 0 },
      ],
    },
    {
      nom: 'Kir royal',
      prixVente: 8,
      ingredients: [
        { ingredientId: cassis.id, nomIngredient: 'Crème de cassis', grammage: 0 },
        { ingredientId: frizzante.id, nomIngredient: 'Frizzante', grammage: 0 },
      ],
    },
    {
      nom: 'Rhum arrangé',
      prixVente: 0,
      ingredients: rhumArrange ? [
        { ingredientId: rhumArrange.id, nomIngredient: 'Rhum digestif', grammage: 0 },
      ] : [],
    },
  ];

  const createdIds: { id: string; prixVente: number; nom: string }[] = [];
  for (const r of recettes) {
    const ref = await db.collection('recettes').add({ ...base, ...r });
    createdIds.push({ id: ref.id, prixVente: r.prixVente, nom: r.nom });
    console.log(`✅ ${r.nom} créée (${r.prixVente} €) — id: ${ref.id}`);
  }

  // 3. Ajouter au menu ETE26
  const menuDoc = await db.collection('menus').doc('fJWV9He5oV6jBKaI7FuH').get();
  const categories = menuDoc.data()!.categories;
  const aperoIdx = categories.findIndex((c: any) => c.nom === 'Les Apéritifs et Digestifs');

  for (const r of createdIds) {
    categories[aperoIdx].recettes.push({ id: r.id, prixVente: r.prixVente });
  }

  await db.collection('menus').doc('fJWV9He5oV6jBKaI7FuH').update({ categories });
  console.log(`\n✅ 3 recettes ajoutées au menu ETE26`);
}

main().catch(err => { console.error(err); process.exit(1); });
