// Recovery final via achats — v2
// Pour chaque PF Foodflow corrompu (proposition:true + foodflowCode) :
// - nom = mode (nom le plus fréquent) parmi les achats avec ce pfId
// - prix = prixUnitaire du dernier achat (par date)
// - unite et quantite : ON N'Y TOUCHE PAS (consigne explicite)
// - on retire les flags que j'ai ajoutés (proposition, sku, url, ingredientId, ingredient)
//
// On supprime aussi les ~248 PF garbage (proposition:true sans foodflowCode/Foodflow,
// ou tout PF Rungis avec proposition:true) — sauf ceux référencés en PF de réf.
//
// USAGE :
//   DRY-RUN : npx tsx scripts/recovery-final-v2.ts
//   APPLY   : npx tsx scripts/recovery-final-v2.ts --apply

import 'dotenv/config';
import { db } from '../lib/firebase';
import { collection, getDocs, doc, updateDoc, deleteDoc, deleteField } from 'firebase/firestore';

const APPLY = process.argv.includes('--apply');

type AnyPF = {
  id: string;
  fournisseur?: string;
  proposition?: boolean;
  foodflowCode?: string;
  nom?: string;
  prix?: number;
  unite?: string;
  quantite?: number;
};

type Achat = {
  pfId?: string;
  code?: string;
  nom?: string;
  qte?: number;
  prixUnitaire?: number;
  date?: string;
  fournisseur?: string;
};

function detectUnite(nom: string): string {
  const n = nom.toLowerCase();
  if (n.includes('1kg') || n.includes('2kg') || n.includes('5kg') || /\d+kg/.test(n)) return 'kg';
  if (n.includes('500g') || n.includes('150g') || n.includes('125g') || /\d+g[^r]/.test(n)) return 'g';
  if (n.includes('1l') || n.includes('5l') || n.includes('1.5l') || /\d+l$/.test(n)) return 'L';
  if (n.includes('cl')) return 'cL';
  if (n.includes('botte') || n.includes('pièce') || /x\s?\d+/.test(n)) return 'pièce';
  if (n.includes('lot')) return 'lot';
  return 'pièce';
}

function modeName(achats: Achat[]): string | undefined {
  const counts = new Map<string, number>();
  for (const a of achats) {
    if (!a.nom) continue;
    counts.set(a.nom, (counts.get(a.nom) || 0) + 1);
  }
  let best: string | undefined;
  let bestCount = 0;
  for (const [n, c] of counts) {
    if (c > bestCount) { best = n; bestCount = c; }
  }
  return best;
}

async function main() {
  console.log(`Mode : ${APPLY ? 'APPLY' : 'DRY-RUN'}\n`);

  const [pfSnap, ingSnap, achatsSnap] = await Promise.all([
    getDocs(collection(db, 'produitsFournisseurs')),
    getDocs(collection(db, 'ingredients')),
    getDocs(collection(db, 'achats')),
  ]);
  const allPfs = pfSnap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<AnyPF, 'id'>) }));
  const ings = ingSnap.docs.map(d => ({ id: d.id, ...(d.data() as { nom: string; fournisseurRefId?: string }) }));
  const allAchats = achatsSnap.docs.map(d => d.data() as Achat);
  const refIds = new Set(ings.map(i => i.fournisseurRefId).filter(Boolean));

  console.log(`PF : ${allPfs.length} | ingrédients : ${ings.length} | achats : ${allAchats.length}\n`);

  const corrompus = allPfs.filter(p => p.fournisseur === 'Foodflow' && p.proposition === true && p.foodflowCode);
  const garbageFoodflow = allPfs.filter(p => p.fournisseur === 'Foodflow' && p.proposition === true && !p.foodflowCode);
  const garbageRungis = allPfs.filter(p => p.fournisseur === 'Rungis' && p.proposition === true);
  const allGarbage = [...garbageFoodflow, ...garbageRungis];
  const garbageSafe = allGarbage.filter(p => !refIds.has(p.id));
  const garbageRef = allGarbage.filter(p => refIds.has(p.id));

  console.log(`Corrompus à restaurer : ${corrompus.length}`);
  console.log(`Garbage à supprimer : ${garbageSafe.length} safe + ${garbageRef.length} référencés (à voir avec toi)`);

  // Plan de restauration
  console.log('\n──── Plan de restauration des 23 corrompus ────');
  const plans: Array<{ pf: AnyPF; nomRestaure?: string; prixRestaure?: number; qteRestauree?: number; uniteRestauree?: string; isPfDeRef: boolean }> = [];

  for (const pf of corrompus) {
    const achatsForPf = allAchats.filter(a => a.pfId === pf.id);
    const nomR = modeName(achatsForPf);
    // Prix et qte = dernier achat par date
    const sorted = [...achatsForPf].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    const last = sorted[sorted.length - 1];
    const uniteR = nomR ? detectUnite(nomR) : undefined;
    plans.push({
      pf,
      nomRestaure: nomR,
      prixRestaure: last?.prixUnitaire,
      qteRestauree: last?.qte,
      uniteRestauree: uniteR,
      isPfDeRef: refIds.has(pf.id),
    });
  }

  for (const p of plans) {
    const ref = p.isPfDeRef ? ' [PF DE RÉF]' : '';
    console.log(`\n  ${p.pf.foodflowCode}${ref}`);
    console.log(`    nom    : "${p.pf.nom}" → "${p.nomRestaure || '???'}"`);
    console.log(`    prix   : ${p.pf.prix} → ${p.prixRestaure}`);
    console.log(`    unite  : ${p.pf.unite} (qte ${p.pf.quantite}) → ${p.uniteRestauree} (qte ${p.qteRestauree})`);
  }

  console.log(`\n──── Garbage référencés (à investiguer manuellement) ────`);
  for (const g of garbageRef) {
    const ing = ings.find(i => i.fournisseurRefId === g.id);
    console.log(`  PF ${g.id} ("${g.nom}", ${g.fournisseur}) ← ingrédient "${ing?.nom}"`);
  }

  if (!APPLY) {
    console.log('\n[DRY-RUN] Pour appliquer : npx tsx scripts/recovery-final-v2.ts --apply');
    return;
  }

  console.log('\n──── APPLICATION ────');

  // 1. Restaurer les corrompus
  let restored = 0, errors = 0;
  for (const p of plans) {
    if (!p.nomRestaure || p.prixRestaure == null || p.qteRestauree == null) {
      console.log(`  ⚠️  ${p.pf.foodflowCode} : pas assez de données dans achats, on saute`);
      errors++;
      continue;
    }
    try {
      await updateDoc(doc(db, 'produitsFournisseurs', p.pf.id), {
        nom: p.nomRestaure,
        prix: p.prixRestaure,
        unite: p.uniteRestauree,
        quantite: p.qteRestauree,
        proposition: deleteField(),
        sku: deleteField(),
        url: deleteField(),
        ingredientId: deleteField(),
        ingredient: deleteField(),
      });
      restored++;
    } catch (e: any) {
      console.error(`  ✗ ${p.pf.foodflowCode}: ${e.message}`);
      errors++;
    }
  }
  console.log(`✓ ${restored} corrompus restaurés (${errors} erreurs)`);

  // 2. Delete garbage safe
  let deleted = 0;
  for (const g of garbageSafe) {
    try {
      await deleteDoc(doc(db, 'produitsFournisseurs', g.id));
      deleted++;
      if (deleted % 50 === 0) console.log(`  ...${deleted}/${garbageSafe.length}`);
    } catch (e: any) {
      console.error(`  ✗ del ${g.id}: ${e.message}`);
    }
  }
  console.log(`✓ ${deleted} garbage supprimés`);
  console.log(`⚠️  ${garbageRef.length} garbage référencés laissés en place`);
}

main().catch(e => { console.error('ERR:', e); process.exit(1); });
