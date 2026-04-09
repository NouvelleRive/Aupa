import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const app = initializeApp({ credential: cert('./serviceAccountKey.json') });
const db = getFirestore(app);

async function repairRecettes() {
  console.log('=== Réparation des recettes ===\n');

  // 1. Charger les ingrédients canoniques actuels
  const ingSnap = await db.collection('ingredients').get();
  const ingByNom = new Map<string, string>(); // nom → id
  for (const d of ingSnap.docs) {
    ingByNom.set(d.data().nom, d.id);
  }
  console.log(`${ingSnap.size} ingrédients canoniques chargés\n`);

  // 2. Charger toutes les recettes
  const recSnap = await db.collection('recettes').get();
  console.log(`${recSnap.size} recettes trouvées\n`);

  let repaired = 0;
  let skipped = 0;
  let broken = 0;

  for (const d of recSnap.docs) {
    const data = d.data();
    const lignes = data.ingredients || [];
    if (lignes.length === 0) { skipped++; continue; }

    let changed = false;
    const newLignes = lignes.map((l: any) => {
      // Si l'ingredientId pointe vers un ingrédient existant, OK
      if (l.ingredientId && ingSnap.docs.some(i => i.id === l.ingredientId)) {
        // Ajouter nomIngredient si manquant
        if (!l.nomIngredient) {
          const ing = ingSnap.docs.find(i => i.id === l.ingredientId);
          if (ing) {
            changed = true;
            return { ...l, nomIngredient: ing.data().nom };
          }
        }
        return l;
      }

      // Si on a un nomIngredient, chercher le bon ingrédient canonique
      if (l.nomIngredient) {
        const newId = ingByNom.get(l.nomIngredient);
        if (newId) {
          changed = true;
          return { ...l, ingredientId: newId };
        } else {
          console.log(`  ⚠️  "${data.nom}": ingrédient "${l.nomIngredient}" introuvable dans les canoniques`);
          broken++;
          return l;
        }
      }

      // Si c'est une ligne de préparation (recetteId), on ne touche pas
      if (l.recetteId) return l;

      console.log(`  ⚠️  "${data.nom}": ligne sans nomIngredient ni ingredientId valide`, l);
      broken++;
      return l;
    });

    if (changed) {
      await d.ref.update({ ingredients: newLignes });
      console.log(`  ✅ "${data.nom}" réparée (${newLignes.length} lignes)`);
      repaired++;
    } else {
      skipped++;
    }
  }

  console.log(`\n=== Résultat ===`);
  console.log(`  ${repaired} recettes réparées`);
  console.log(`  ${skipped} recettes inchangées`);
  console.log(`  ${broken} lignes sans correspondance`);
}

repairRecettes().catch(console.error);
