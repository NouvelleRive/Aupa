// Corrige les recettes boissons chaudes d'après la fiche :
// - Lait 0.30L (25cl + 5cl mousse) pour chico/golden/chaï/matcha (était 0.35)
// - Chicorée crème : 1 c.à.c = 5g (était 30g)
// - Golden latte : remplace muscade/canelle/gingembre/piment par "Golden épices" 15g
// - Cappuccino : même recette que café crème (lait 0.15 + café 0.012)
// - Ne touche PAS au sucre bûche

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { resolve } from 'path';

const app = initializeApp({ credential: cert(resolve(__dirname, '../serviceAccountKey.json')) });
const db = getFirestore(app);

type Ing = { ingredientId: string; grammage: number };

async function main() {
  const ingSnap = await db.collection('ingredients').get();
  const byNom = new Map<string, string>();
  for (const d of ingSnap.docs) byNom.set(d.data().nom, d.id);

  const recSnap = await db.collection('recettes').get();
  const recByNom = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();
  for (const d of recSnap.docs) recByNom.set(d.data().nom, d);

  const id = (nom: string): string => {
    const i = byNom.get(nom);
    if (!i) throw new Error(`Ingrédient manquant : ${nom}`);
    return i;
  };

  const g = (n: number) => n / 1000;

  // Vérifier que Golden épices existe
  if (!byNom.has('Golden épices')) {
    throw new Error('Ingrédient "Golden épices" introuvable en base. Vérifie le nom exact.');
  }

  const FIXES: { nom: string; ingredients: Ing[] }[] = [
    {
      nom: 'Café crème',
      ingredients: [
        { ingredientId: id('Lait'), grammage: 0.15 }, // 10cl + 5cl mousse
        { ingredientId: id('Café'), grammage: 0.012 },
      ],
    },
    {
      nom: 'Cappuccino',
      ingredients: [
        { ingredientId: id('Lait'), grammage: 0.15 }, // 10cl + 5cl mousse
        { ingredientId: id('Café'), grammage: 0.012 },
      ],
    },
    {
      nom: 'Chicorée crème',
      ingredients: [
        { ingredientId: id('Lait'), grammage: 0.30 }, // 25cl + 5cl mousse
        { ingredientId: id('Chicorée'), grammage: g(5) }, // 1 c.à.c = 5g
      ],
    },
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
        { ingredientId: id('Lait'), grammage: 0.30 }, // 25cl + 5cl mousse
        { ingredientId: id('Golden épices'), grammage: g(15) }, // 1 c.à.s
      ],
    },
    {
      nom: 'Chai latte',
      ingredients: [
        { ingredientId: id('Lait'), grammage: 0.30 }, // 25cl + 5cl mousse
        { ingredientId: id('Poudre chai'), grammage: g(15) }, // 1 c.à.s
      ],
    },
    {
      nom: 'Matcha latte',
      ingredients: [
        { ingredientId: id('Lait'), grammage: 0.30 }, // 25cl + 5cl mousse
        { ingredientId: id('Matcha'), grammage: g(15) }, // 1 c.à.s
      ],
    },
  ];

  let updated = 0;
  const missing: string[] = [];

  for (const fix of FIXES) {
    const doc = recByNom.get(fix.nom);
    if (!doc) { missing.push(fix.nom); continue; }

    // Récupérer le sucre bûche existant pour ne pas le perdre
    const existing = doc.data().ingredients || [];
    const sucreBuche = existing.find((i: any) =>
      i.ingredientId && byNom.get('Sucre bûche') === i.ingredientId
    );

    const newIngredients = [...fix.ingredients];
    if (sucreBuche) {
      newIngredients.push(sucreBuche);
    }

    await doc.ref.update({
      ingredients: newIngredients,
      updatedAt: new Date().toISOString(),
    });
    console.log(`✅ ${fix.nom} — ${newIngredients.length} ingrédients${sucreBuche ? ' (sucre bûche conservé)' : ''}`);
    updated++;
  }

  if (missing.length > 0) console.log(`\n❌ Recettes introuvables : ${missing.join(', ')}`);
  console.log(`\n✅ ${updated}/${FIXES.length} recettes corrigées.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
