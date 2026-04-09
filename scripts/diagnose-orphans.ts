import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const app = initializeApp({ credential: cert('./serviceAccountKey.json') });
const db = getFirestore(app);

async function diagnose() {
  const [ingSnap, recSnap, pfSnap] = await Promise.all([
    db.collection('ingredients').get(),
    db.collection('recettes').get(),
    db.collection('produitsFournisseurs').get(),
  ]);

  const validIds = new Set(ingSnap.docs.map(d => d.id));

  // Grouper les IDs orphelins avec contexte
  const orphans = new Map<string, { recettes: string[]; grammages: number[] }>();

  for (const d of recSnap.docs) {
    const data = d.data();
    const lignes = data.ingredients || [];
    for (const l of lignes) {
      if (l.ingredientId && !validIds.has(l.ingredientId) && !l.nomIngredient) {
        const id = l.ingredientId;
        if (!orphans.has(id)) orphans.set(id, { recettes: [], grammages: [] });
        const entry = orphans.get(id)!;
        if (!entry.recettes.includes(data.nom)) entry.recettes.push(data.nom);
        entry.grammages.push(l.grammage);
      }
    }
  }

  // Vérifier si certains orphelins existent dans PF (même ID)
  const pfIds = new Set(pfSnap.docs.map(d => d.id));
  const pfByNom = new Map<string, string>();
  for (const d of pfSnap.docs) {
    const data = d.data();
    pfByNom.set(d.id, data.nom || data.ingredient || '?');
  }

  console.log(`=== ${orphans.size} IDs orphelins uniques ===\n`);

  for (const [id, info] of [...orphans.entries()].sort((a, b) => b[1].recettes.length - a[1].recettes.length)) {
    const avgGrammage = info.grammages.reduce((s, g) => s + g, 0) / info.grammages.length;
    const inPF = pfIds.has(id) ? ` → TROUVÉ dans PF: "${pfByNom.get(id)}"` : '';
    console.log(`ID: ${id}`);
    console.log(`  Utilisé dans ${info.recettes.length} recettes: ${info.recettes.slice(0, 5).join(', ')}${info.recettes.length > 5 ? '...' : ''}`);
    console.log(`  Grammage moyen: ${avgGrammage.toFixed(3)}${inPF}`);
    console.log('');
  }
}

diagnose().catch(console.error);
