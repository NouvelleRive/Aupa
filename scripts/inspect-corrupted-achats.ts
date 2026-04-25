// Examine TOUS les achats par foodflowCode pour les 23 PF corrompus
// Pour comprendre pourquoi le "dernier achat" donne parfois un autre produit
import 'dotenv/config';
import { db } from '../lib/firebase';
import { collection, getDocs } from 'firebase/firestore';

async function main() {
  const [pfSnap, achatsSnap] = await Promise.all([
    getDocs(collection(db, 'produitsFournisseurs')),
    getDocs(collection(db, 'achats')),
  ]);
  const allPfs = pfSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
  const allAchats = achatsSnap.docs.map(d => d.data() as any);

  const corrompus = allPfs.filter(p => p.fournisseur === 'Foodflow' && p.proposition === true && p.foodflowCode);

  for (const pf of corrompus) {
    // Tous les achats avec cette pfId
    const achatsByPfId = allAchats.filter(a => a.pfId === pf.id).sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    // Tous les achats avec ce code
    const achatsByCode = allAchats.filter(a => a.code === pf.foodflowCode && a.fournisseur === 'Foodflow').sort((a, b) => (a.date || '').localeCompare(b.date || ''));

    const namesByPfId = [...new Set(achatsByPfId.map(a => a.nom))];
    const namesByCode = [...new Set(achatsByCode.map(a => a.nom))];

    console.log(`\n${pf.foodflowCode} (PF ${pf.id})`);
    console.log(`  Nom corrompu: "${pf.nom}"`);
    console.log(`  Achats par pfId : ${achatsByPfId.length} (${namesByPfId.length} noms uniques)`);
    if (namesByPfId.length === 1) {
      console.log(`    → "${namesByPfId[0]}"`);
    } else if (namesByPfId.length > 1) {
      for (const n of namesByPfId) {
        const cnt = achatsByPfId.filter(a => a.nom === n).length;
        const last = achatsByPfId.filter(a => a.nom === n).pop();
        console.log(`    × ${cnt} : "${n}" (dernier: ${last?.date?.slice(0, 10)})`);
      }
    }
    console.log(`  Achats par code : ${achatsByCode.length} (${namesByCode.length} noms uniques)`);
    if (achatsByCode.length !== achatsByPfId.length) {
      console.log(`    ⚠️ DIFFÉRENCE pfId vs code : ${achatsByCode.length - achatsByPfId.length}`);
      for (const n of namesByCode) {
        const cnt = achatsByCode.filter(a => a.nom === n).length;
        console.log(`    × ${cnt} : "${n}"`);
      }
    }
  }
}

main().catch(e => { console.error('ERR:', e); process.exit(1); });
