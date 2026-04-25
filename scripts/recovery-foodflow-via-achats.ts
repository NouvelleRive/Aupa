// Test local du recovery via la collection achats
import 'dotenv/config';
import { db } from '../lib/firebase';
import { collection, getDocs } from 'firebase/firestore';

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

async function main() {
  const [pfSnap, ingSnap, achatsSnap] = await Promise.all([
    getDocs(collection(db, 'produitsFournisseurs')),
    getDocs(collection(db, 'ingredients')),
    getDocs(collection(db, 'achats')),
  ]);
  const allPfs = pfSnap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<AnyPF, 'id'>) }));
  const ings = ingSnap.docs.map(d => ({ id: d.id, ...(d.data() as { nom: string; fournisseurRefId?: string }) }));
  const allAchats = achatsSnap.docs.map(d => d.data() as Achat);
  const refIds = new Set(ings.map(i => i.fournisseurRefId).filter(Boolean));

  console.log(`PF : ${allPfs.length} | Achats : ${allAchats.length} | PF de réf : ${refIds.size}\n`);

  // Examiner un achat exemple pour voir sa structure
  const sampleAchat = allAchats.find(a => a.fournisseur === 'Foodflow');
  console.log('Exemple achat Foodflow :', JSON.stringify(sampleAchat, null, 2));

  const corrompus = allPfs.filter(p => p.fournisseur === 'Foodflow' && p.proposition === true && p.foodflowCode);

  // Indexer achats par code
  const lastAchatByCode = new Map<string, Achat>();
  for (const a of allAchats) {
    if (a.fournisseur !== 'Foodflow' || !a.code) continue;
    const ex = lastAchatByCode.get(a.code);
    if (!ex || (a.date && ex.date && a.date > ex.date)) lastAchatByCode.set(a.code, a);
  }
  console.log(`\nAchats Foodflow uniques par code : ${lastAchatByCode.size}`);

  console.log('\n--- Plan de restauration ---');
  for (const pf of corrompus) {
    const a = lastAchatByCode.get(pf.foodflowCode!);
    const ref = refIds.has(pf.id) ? ' [PF DE RÉF]' : '';
    console.log(`\n  ${pf.foodflowCode}${ref}`);
    if (a) {
      console.log(`    nom corrompu  : "${pf.nom}"`);
      console.log(`    nom restoré   : "${a.nom}"`);
      console.log(`    prix corrompu : ${pf.prix}`);
      console.log(`    prix restoré  : ${a.prixUnitaire}`);
      console.log(`    unite corr.   : ${pf.unite} (qte ${pf.quantite})`);
      console.log(`    unite restorée: ${detectUnite(a.nom || '')} (qte ${a.qte})`);
      console.log(`    date achat    : ${a.date?.slice(0, 10)}`);
    } else {
      console.log(`    nom : "${pf.nom}" → ❌ AUCUN ACHAT trouvé pour ${pf.foodflowCode}`);
    }
  }
}

main().catch(e => { console.error('ERR:', e); process.exit(1); });
