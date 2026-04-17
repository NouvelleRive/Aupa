// Remplit les recettes boissons chaudes (7) + jus/fresh (7) + crée Prépa thé glacé + concentré gingembre

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const app = initializeApp({ credential: cert('./serviceAccountKey.json') });
const db = getFirestore(app);

type Ing = { ingredientId: string; grammage: number };

async function main() {
  const ingSnap = await db.collection('ingredients').get();
  const byNom = new Map<string, string>();
  for (const d of ingSnap.docs) byNom.set(d.data().nom, d.id);

  const recSnap = await db.collection('recettes').get();
  const recByNom = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();
  for (const d of recSnap.docs) recByNom.set(d.data().nom, d);

  // === Créer ingrédient Concentré gingembre si absent ===
  if (!byNom.has('Concentré gingembre')) {
    const ref = await db.collection('ingredients').add({
      nom: 'Concentré gingembre', unite: 'L', categorie: 'boisson',
      updatedAt: new Date().toISOString(),
    });
    byNom.set('Concentré gingembre', ref.id);
    console.log(`✅ Ingrédient créé : Concentré gingembre`);
  }

  // === Créer Prépa thé glacé si absente ===
  if (!recByNom.has('Prépa thé glacé')) {
    const ref = await db.collection('recettes').add({
      nom: 'Prépa thé glacé', categorie: 'Préparations',
      saisons: [], carte: '', actif: true, type: 'boisson',
      prixVente: 0, ingredients: [], options: [],
      coutCalcule: 0, updatedAt: new Date().toISOString(),
    });
    recByNom.set('Prépa thé glacé', { ref } as any);
    byNom.set('Prépa thé glacé', ref.id);
    console.log(`✅ Recette créée : Prépa thé glacé (vide, à remplir)`);
  } else {
    byNom.set('Prépa thé glacé', recByNom.get('Prépa thé glacé')!.id);
  }

  const id = (nom: string): string => {
    const i = byNom.get(nom);
    if (!i) throw new Error(`Ingrédient manquant : ${nom}`);
    return i;
  };

  const cl = (n: number) => n / 100;
  const g = (n: number) => n / 1000;

  // === Boissons chaudes ===
  const CHAUDS: { nom: string; ingredients: Ing[] }[] = [
    {
      nom: 'Chicorée crème',
      ingredients: [
        { ingredientId: id('Lait'), grammage: 0.35 }, // 30cl + 5cl mousse
        { ingredientId: id('Chicorée'), grammage: g(30) }, // 2 càs
      ],
    },
    {
      nom: 'Café crème',
      ingredients: [
        { ingredientId: id('Lait'), grammage: 0.15 }, // 10cl + 5cl mousse
        { ingredientId: id('Café'), grammage: 0.012 },
      ],
    },
    // Cappuccino déjà rempli — skip
    {
      nom: 'Chocolat chaud',
      ingredients: [
        { ingredientId: id('Lait'), grammage: 0.30 }, // 25cl + 5cl mousse
        { ingredientId: id('Chocolat en poudre'), grammage: g(25) },
        { ingredientId: id('Chocolat'), grammage: g(15) }, // pépites 55%
      ],
    },
    {
      nom: 'Golden latte',
      ingredients: [
        { ingredientId: id('Lait'), grammage: 0.35 },
        { ingredientId: id('Muscade de metro'), grammage: g(1) },
        { ingredientId: id('Canelle'), grammage: g(1) },
        { ingredientId: id('Gingembre'), grammage: g(1) },
        { ingredientId: id('Piment'), grammage: g(1) },
      ],
    },
    {
      nom: 'Chai latte',
      ingredients: [
        { ingredientId: id('Lait'), grammage: 0.35 },
        { ingredientId: id('Poudre chai'), grammage: g(15) },
      ],
    },
    {
      nom: 'Matcha latte',
      ingredients: [
        { ingredientId: id('Lait'), grammage: 0.35 },
        { ingredientId: id('Matcha'), grammage: g(15) },
      ],
    },
  ];

  // === Jus / Fresh / Iced ===
  const FRESH: { nom: string; ingredients: Ing[] }[] = [
    {
      nom: 'Citronnade',
      ingredients: [
        { ingredientId: id('Eau'), grammage: cl(20) },
        { ingredientId: id('Citron vert'), grammage: 0.05 }, // 5cl jus ≈ 50g
        { ingredientId: id('Sirop de sucre de canne'), grammage: cl(0.5) },
      ],
    },
    {
      nom: 'Limonade maison',
      ingredients: [
        { ingredientId: id('Eau gazeuse'), grammage: cl(20) }, // Perrier
        { ingredientId: id('Citron vert'), grammage: 0.05 },
        { ingredientId: id('Sirop de sucre de canne'), grammage: cl(0.5) },
      ],
    },
    {
      nom: 'Ginger beer maison',
      ingredients: [
        { ingredientId: id('Eau gazeuse'), grammage: cl(15) }, // Perrier
        { ingredientId: id('Concentré gingembre'), grammage: cl(3) },
        { ingredientId: id('Citron vert'), grammage: 0.05 },
        { ingredientId: id('Sirop de sucre de canne'), grammage: cl(0.5) },
      ],
    },
    {
      nom: 'Orange pressée',
      ingredients: [
        { ingredientId: id('Orange'), grammage: 4 }, // ~4 oranges pour 25cl
      ],
    },
    {
      nom: 'Orangina maison',
      ingredients: [
        { ingredientId: id('Eau gazeuse'), grammage: cl(20) },
        { ingredientId: id('Orange'), grammage: 1 }, // ~1 orange pour 5cl
        { ingredientId: id('Sirop de sucre de canne'), grammage: cl(0.5) },
      ],
    },
    {
      nom: 'Citron pressé',
      ingredients: [
        { ingredientId: id('Eau'), grammage: cl(20) },
        { ingredientId: id('Citron jaune'), grammage: 1 }, // ~1 citron pour 5cl
      ],
    },
    {
      nom: 'Thé glacé maison',
      ingredients: [
        { ingredientId: id('Prépa thé glacé'), grammage: cl(24) },
        { ingredientId: id('Sirop pêche'), grammage: cl(1) },
      ],
    },
  ];

  const ALL = [...CHAUDS, ...FRESH];
  let updated = 0;
  const missing: string[] = [];
  for (const r of ALL) {
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
  console.log(`\n✅ ${updated}/${ALL.length} recettes mises à jour.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
