// Usage : npx tsx scripts/apply-foodflow-prix.ts "<nom>" <prix> <unite>
// Ex   : npx tsx scripts/apply-foodflow-prix.ts "Citron vert" 3.16 kg
import 'dotenv/config';
import { db } from '../lib/firebase';
import { collection, getDocs, doc, updateDoc, deleteDoc } from 'firebase/firestore';

function norm(s: string) {
  return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
}

async function main() {
  const target = process.argv[2];
  const prix = parseFloat(process.argv[3]);
  const unite = process.argv[4];
  if (!target || isNaN(prix) || !unite) {
    console.log('Usage : npx tsx scripts/apply-foodflow-prix.ts "<nom>" <prix> <unite>');
    process.exit(1);
  }

  const pfSnap = await getDocs(collection(db, 'produitsFournisseurs'));
  const matches = pfSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }))
    .filter(p => p.fournisseur === 'Foodflow' && norm(p.nom) === norm(target));

  if (matches.length === 0) { console.log(`✗ "${target}" introuvable`); return; }

  // Garder celui avec foodflowCode, sinon le premier
  const toKeep = matches.find(m => m.foodflowCode) || matches[0];
  console.log(`${matches.length} PF(s) "${target}" trouvé(s)`);

  // Update le bon
  await updateDoc(doc(db, 'produitsFournisseurs', toKeep.id), {
    prix, unite, quantite: 1, updatedAt: new Date().toISOString(),
  });
  console.log(`✓ "${toKeep.nom}" (${toKeep.foodflowCode || 'sans code'}) : ${prix} €/${unite}`);

  // Supprimer les autres
  for (const m of matches) {
    if (m.id === toKeep.id) continue;
    await deleteDoc(doc(db, 'produitsFournisseurs', m.id));
    console.log(`  ✗ supprimé doublon ${m.id}`);
  }
}
main().catch(e => { console.error(e); process.exit(1); });
