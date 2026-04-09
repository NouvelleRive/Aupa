import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const app = initializeApp({ credential: cert('./serviceAccountKey.json') });
const db = getFirestore(app);

async function repairV2() {
  console.log('=== Réparation V2 : déduction des IDs orphelins ===\n');

  const [ingSnap, recSnap] = await Promise.all([
    db.collection('ingredients').get(),
    db.collection('recettes').get(),
  ]);

  const ingById = new Map(ingSnap.docs.map(d => [d.id, d.data().nom as string]));
  const ingByNom = new Map(ingSnap.docs.map(d => [d.data().nom as string, d.id]));

  // Pour chaque recette, lister les ingrédients connus et les orphelins
  const recettes = recSnap.docs.map(d => ({ id: d.id, ...d.data() })) as any[];

  // Collecter les orphelins avec contexte complet
  const orphanContext = new Map<string, {
    recettesAvecConnus: { recette: string; connus: string[]; grammage: number }[]
  }>();

  for (const r of recettes) {
    const lignes = r.ingredients || [];
    const connus: string[] = [];
    const orphansInRecette: { id: string; grammage: number }[] = [];

    for (const l of lignes) {
      if (l.nomIngredient) {
        connus.push(l.nomIngredient);
      } else if (l.ingredientId && ingById.has(l.ingredientId)) {
        connus.push(ingById.get(l.ingredientId)!);
      } else if (l.ingredientId) {
        orphansInRecette.push({ id: l.ingredientId, grammage: l.grammage });
      }
    }

    for (const o of orphansInRecette) {
      if (!orphanContext.has(o.id)) orphanContext.set(o.id, { recettesAvecConnus: [] });
      orphanContext.get(o.id)!.recettesAvecConnus.push({
        recette: r.nom, connus, grammage: o.grammage
      });
    }
  }

  // Afficher le contexte pour chaque orphelin
  console.log(`${orphanContext.size} IDs orphelins à identifier\n`);

  for (const [id, ctx] of [...orphanContext.entries()].sort((a, b) =>
    b[1].recettesAvecConnus.length - a[1].recettesAvecConnus.length
  )) {
    console.log(`─────────────────────────────────────`);
    console.log(`ID: ${id}`);
    console.log(`Utilisé dans ${ctx.recettesAvecConnus.length} recettes:`);
    for (const r of ctx.recettesAvecConnus.slice(0, 5)) {
      console.log(`  "${r.recette}" (grammage: ${r.grammage})`);
      if (r.connus.length > 0) console.log(`    Autres ingrédients connus: ${r.connus.join(', ')}`);
    }
    console.log('');
  }
}

repairV2().catch(console.error);
