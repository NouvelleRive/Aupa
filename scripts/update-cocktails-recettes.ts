// Remplit les 15 recettes cocktails avec leurs ingrédients.
// Défauts : 1 cuillère = 5 mL (sirop) ou 5 g (sucre), tranche citron jaune = 0,1 pièce.

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const app = initializeApp({ credential: cert('./serviceAccountKey.json') });
const db = getFirestore(app);

type Ing = { ingredientId: string; grammage: number };

async function main() {
  const ingSnap = await db.collection('ingredients').get();
  const byNom = new Map<string, string>();
  for (const d of ingSnap.docs) byNom.set(d.data().nom, d.id);

  const id = (nom: string): string => {
    const i = byNom.get(nom);
    if (!i) throw new Error(`Ingrédient manquant : ${nom}`);
    return i;
  };

  // Convertisseurs : toutes les quantités sont stockées en unité de base
  // (kg pour solides, L pour liquides, pièce pour items)
  const cl = (n: number) => n / 100; // cl → L
  const g = (n: number) => n / 1000; // g → kg

  const RECETTES: { nom: string; ingredients: Ing[] }[] = [
    {
      nom: 'Spritz', // Apérol Spritz
      ingredients: [
        { ingredientId: id('Eau gazeuse'), grammage: cl(4) },
        { ingredientId: id('Frizzante'), grammage: cl(10) },
        { ingredientId: id('Aperol'), grammage: cl(4) },
      ],
    },
    {
      nom: 'Mojito',
      ingredients: [
        { ingredientId: id('Eau gazeuse'), grammage: cl(4) },
        { ingredientId: id('Rhum cocktail'), grammage: 0.04 /* pièce unit fallback */ },
        { ingredientId: id('Menthe'), grammage: 0.2 },
        { ingredientId: id('Sirop de sucre de canne'), grammage: cl(1) /* 2c = 10mL */ },
        { ingredientId: id('Citron vert'), grammage: 0.05 },
      ],
    },
    {
      nom: 'Ti punch',
      ingredients: [
        { ingredientId: id('Rhum cocktail'), grammage: 0.04 },
        { ingredientId: id('Citron vert'), grammage: 0.05 },
        { ingredientId: id('Sucre'), grammage: g(10) /* 2c = 10g */ },
      ],
    },
    {
      nom: 'Caipirinha',
      ingredients: [
        { ingredientId: id('Cachaca'), grammage: cl(4) },
        { ingredientId: id('Citron vert'), grammage: 0.05 },
        { ingredientId: id('Sucre'), grammage: g(5) /* 1c = 5g */ },
      ],
    },
    {
      nom: 'Petrouchka',
      ingredients: [
        { ingredientId: id('Limonade'), grammage: cl(15) },
        { ingredientId: id('Vodka'), grammage: cl(4) },
        { ingredientId: id('Sirop de violette'), grammage: cl(1) },
        { ingredientId: id('Citron jaune'), grammage: 0.1 },
      ],
    },
    {
      nom: 'Gin tonic',
      ingredients: [
        { ingredientId: id('Tonic'), grammage: cl(15) },
        { ingredientId: id('Gin'), grammage: cl(4) },
        { ingredientId: id('Citron vert'), grammage: 0.025 },
        { ingredientId: id('Citron jaune'), grammage: 0.1 },
      ],
    },
    {
      nom: 'Moscow mule',
      ingredients: [
        { ingredientId: id('Ginger beer'), grammage: cl(15) },
        { ingredientId: id('Vodka'), grammage: cl(4) },
        { ingredientId: id('Citron vert'), grammage: 0.025 },
      ],
    },
    {
      nom: 'London mule',
      ingredients: [
        { ingredientId: id('Ginger beer'), grammage: cl(15) },
        { ingredientId: id('Gin'), grammage: cl(4) },
        { ingredientId: id('Citron vert'), grammage: 0.025 },
      ],
    },
    {
      nom: 'Jamaican mule',
      ingredients: [
        { ingredientId: id('Ginger beer'), grammage: cl(15) },
        { ingredientId: id('Rhum cocktail'), grammage: 0.04 },
        { ingredientId: id('Citron vert'), grammage: 0.025 },
      ],
    },
    {
      nom: 'Le Maxim\'s',
      ingredients: [
        { ingredientId: id('Tonic'), grammage: cl(5) },
        { ingredientId: id('Gin'), grammage: cl(4) },
        { ingredientId: id('Jus de cranberry'), grammage: cl(2) },
        { ingredientId: id('Citron vert'), grammage: 0.02 /* ~2cl jus */ },
        { ingredientId: id('Sirop de sucre de canne'), grammage: cl(1) },
      ],
    },
    {
      nom: 'Spritz suze',
      ingredients: [
        { ingredientId: id('Eau gazeuse'), grammage: cl(4) },
        { ingredientId: id('Frizzante'), grammage: cl(7) },
        { ingredientId: id('Suze'), grammage: cl(4) },
        { ingredientId: id('Citron jaune'), grammage: 0.1 },
      ],
    },
    {
      nom: 'Spritz St Germain',
      ingredients: [
        { ingredientId: id('Eau gazeuse'), grammage: cl(4) },
        { ingredientId: id('Frizzante'), grammage: cl(7) },
        { ingredientId: id('St ger'), grammage: cl(4) },
        { ingredientId: id('Citron jaune'), grammage: 0.1 },
      ],
    },
    {
      nom: 'Expresso martini',
      ingredients: [
        { ingredientId: id('Vodka'), grammage: cl(5) },
        { ingredientId: id('Kahlúa'), grammage: cl(2) },
        { ingredientId: id('Café'), grammage: 0.012 /* 12g comme Expresso */ },
        { ingredientId: id('Sirop de sucre de canne'), grammage: cl(1) },
      ],
    },
    {
      nom: 'Suze tonic',
      ingredients: [
        { ingredientId: id('Tonic'), grammage: cl(10) },
        { ingredientId: id('Suze'), grammage: cl(4) },
        { ingredientId: id('Citron jaune'), grammage: 0.1 },
      ],
    },
    {
      nom: 'Mocktail fruits rouges',
      ingredients: [
        { ingredientId: id('Eau gazeuse'), grammage: cl(10) },
        { ingredientId: id('Jus de cranberry'), grammage: cl(5) },
        { ingredientId: id('Jus de fraise'), grammage: cl(3) },
        { ingredientId: id('Citron vert'), grammage: 0.02 },
        { ingredientId: id('Grenadine'), grammage: cl(1) },
        { ingredientId: id('Citron jaune'), grammage: 0.1 },
      ],
    },
  ];

  const recSnap = await db.collection('recettes').get();
  const recByNom = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();
  for (const d of recSnap.docs) recByNom.set(d.data().nom, d);

  let updated = 0;
  let missing: string[] = [];
  for (const r of RECETTES) {
    const doc = recByNom.get(r.nom);
    if (!doc) { missing.push(r.nom); continue; }
    await doc.ref.update({
      ingredients: r.ingredients,
      updatedAt: new Date().toISOString(),
    });
    console.log(`✅ ${r.nom} — ${r.ingredients.length} ingrédients`);
    updated++;
  }

  if (missing.length > 0) console.log(`\n❌ Recettes introuvables : ${missing.join(', ')}`);
  console.log(`\n✅ ${updated}/${RECETTES.length} recettes mises à jour.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
