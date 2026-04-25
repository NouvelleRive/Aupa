// Script de récupération suite à l'incident du 2026-04-25 :
// - Foodflow refresh route a écrasé 25 PF Foodflow existants (avec foodflowCode)
//   en y mettant des propositions auto-générées (nom/prix/unite faux)
// - Rungis refresh route + Foodflow refresh route ont créé ~248 PF "garbage"
//   (avec proposition:true mais sans foodflowCode/rungisCode)
//
// Stratégie :
// 1. Garbage = proposition:true ET pas de foodflowCode/rungisCode → DELETE
// 2. Corrompu = Foodflow avec foodflowCode ET proposition:true → restaurer prix
//    depuis historiquesPrix[last], enlever les champs que j'ai ajoutés
//    (proposition, sku, url, ingredientId, ingredient)
//    Le nom/unite/quantite restent perdus, à fixer manuellement ou via Gmail backfill
//
// USAGE :
//   - DRY-RUN (par défaut) : npx tsx scripts/recovery-foodflow-rungis-2026-04-25.ts
//   - APPLIQUER : npx tsx scripts/recovery-foodflow-rungis-2026-04-25.ts --apply

import 'dotenv/config';
import { db } from '../lib/firebase';
import { collection, getDocs, deleteDoc, updateDoc, doc, deleteField } from 'firebase/firestore';

const APPLY = process.argv.includes('--apply');

type AnyPF = {
  id: string;
  fournisseur?: string;
  proposition?: boolean;
  foodflowCode?: string;
  rungisCode?: string;
  nom?: string;
  prix?: number;
  unite?: string;
  quantite?: number;
  sku?: string;
  url?: string;
  ingredientId?: string;
  ingredient?: string;
  historiquesPrix?: Array<{ date: string; prix: number }>;
  updatedAt?: string;
};

async function main() {
  console.log(`Mode : ${APPLY ? 'APPLY (modifs réelles)' : 'DRY-RUN (lecture seule)'}\n`);

  const pfSnap = await getDocs(collection(db, 'produitsFournisseurs'));
  const allPfs = pfSnap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<AnyPF, 'id'>) }));
  console.log(`Total PF dans Firestore : ${allPfs.length}\n`);

  const propPfs = allPfs.filter(p => p.proposition === true);
  console.log(`PF avec proposition:true : ${propPfs.length}`);

  // --- 1. GARBAGE : à DELETE (Foodflow sans foodflowCode, ou Rungis tout court)
  const garbageFoodflow = propPfs.filter(p => p.fournisseur === 'Foodflow' && !p.foodflowCode);
  const garbageRungis = propPfs.filter(p => p.fournisseur === 'Rungis'); // Rungis n'a jamais de code, tout est garbage
  const garbage = [...garbageFoodflow, ...garbageRungis];
  console.log(`  → Garbage Foodflow (sans foodflowCode) : ${garbageFoodflow.length}`);
  console.log(`  → Garbage Rungis : ${garbageRungis.length}`);
  console.log(`  TOTAL à DELETE : ${garbage.length}\n`);

  // --- 2. CORROMPUS : Foodflow avec foodflowCode + proposition (= PF original écrasé)
  const corrompus = propPfs.filter(p => p.fournisseur === 'Foodflow' && p.foodflowCode);
  console.log(`PF Foodflow corrompus (avec foodflowCode + proposition) : ${corrompus.length}`);

  // Sauvegarde la liste pour l'utilisatrice
  console.log('\n──── DÉTAIL DES PF CORROMPUS ────');
  for (const pf of corrompus) {
    const lastHist = pf.historiquesPrix?.[pf.historiquesPrix.length - 1];
    const restoredPrix = lastHist?.prix ?? pf.prix ?? 0;
    console.log(`\n  ID: ${pf.id}`);
    console.log(`  foodflowCode: ${pf.foodflowCode}`);
    console.log(`  Nom actuel (corrompu): "${pf.nom}"`);
    console.log(`  Prix actuel (corrompu): ${pf.prix} → restoré à ${restoredPrix} (depuis historique du ${lastHist?.date || '?'})`);
    console.log(`  Unite actuelle (corrompue): ${pf.unite}, quantite: ${pf.quantite}`);
  }

  // --- 3. Vérifier les PF de réf impactés
  const ingSnap = await getDocs(collection(db, 'ingredients'));
  const ings = ingSnap.docs.map(d => ({ id: d.id, ...(d.data() as { nom: string; fournisseurRefId?: string }) }));
  const refIds = new Set(ings.map(i => i.fournisseurRefId).filter(Boolean));

  const corrompusRef = corrompus.filter(p => refIds.has(p.id));
  const garbageRef = garbage.filter(p => refIds.has(p.id));
  console.log(`\n  → Parmi les corrompus, ${corrompusRef.length} sont des PF de réf`);
  console.log(`  → Parmi les garbage, ${garbageRef.length} sont des PF de réf (devrait être 0)`);

  if (garbageRef.length > 0) {
    console.log('  ⚠️  ATTENTION : des garbage sont des PF de réf, on ne peut pas les supprimer sans casser la réf');
    for (const g of garbageRef) {
      const ing = ings.find(i => i.fournisseurRefId === g.id);
      console.log(`    - PF ${g.id} ("${g.nom}") référencé par ingrédient "${ing?.nom}"`);
    }
  }

  if (!APPLY) {
    console.log('\n[DRY-RUN] Pour appliquer : npx tsx scripts/recovery-foodflow-rungis-2026-04-25.ts --apply');
    return;
  }

  console.log('\n=== APPLICATION DES MODIFS ===');

  // Delete garbage (sauf ceux qui sont PF de réf — sécurité)
  const garbageSafeToDelete = garbage.filter(p => !refIds.has(p.id));
  console.log(`\nSuppression de ${garbageSafeToDelete.length} PF garbage...`);
  let deleted = 0;
  for (const pf of garbageSafeToDelete) {
    await deleteDoc(doc(db, 'produitsFournisseurs', pf.id));
    deleted++;
    if (deleted % 50 === 0) console.log(`  ${deleted}/${garbageSafeToDelete.length}`);
  }
  console.log(`✓ ${deleted} garbage supprimés`);

  // Restaurer les corrompus
  console.log(`\nRestauration de ${corrompus.length} PF corrompus...`);
  let restored = 0;
  for (const pf of corrompus) {
    const lastHist = pf.historiquesPrix?.[pf.historiquesPrix.length - 1];
    const restoredPrix = lastHist?.prix ?? pf.prix;
    const updatePayload: Record<string, unknown> = {
      prix: restoredPrix,
      proposition: deleteField(),
      sku: deleteField(),
      url: deleteField(),
      ingredientId: deleteField(),
      ingredient: deleteField(),
    };
    await updateDoc(doc(db, 'produitsFournisseurs', pf.id), updatePayload);
    restored++;
  }
  console.log(`✓ ${restored} corrompus restaurés (prix OK, nom/unite/quantite encore à fixer)`);

  console.log('\n=== TERMINÉ ===');
  console.log(`- ${deleted} PF garbage supprimés`);
  console.log(`- ${restored} PF corrompus partiellement restaurés (prix OK)`);
  console.log(`- ${corrompus.length} noms/unite/quantite à fixer manuellement (cf. liste ci-dessus)`);
}

main().catch(e => { console.error('ERR:', e); process.exit(1); });
