// Recherche des PFs partiels pour les introuvables
import 'dotenv/config';
import { db } from '../lib/firebase';
import { collection, getDocs } from 'firebase/firestore';

const KEYWORDS = ['saumon', 'fuet', 'sucre glace', 'sucre', 'kombucha', 'ciao', 'granini', 'jus d\'orange',
  'crème de pêche', 'crème de mûre', 'crème de cassis', 'colorant', 'golden latte', 'betterave', 'œuf', 'oeuf'];

function norm(s: string): string {
  return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

async function main() {
  const snap = await getDocs(collection(db, 'produitsFournisseurs'));
  const all = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
  const ff = all.filter(p => p.fournisseur === 'Foodflow');
  console.log(`Total PF Foodflow : ${ff.length}`);

  for (const kw of KEYWORDS) {
    console.log(`\n=== "${kw}" ===`);
    const matches = ff.filter(p => norm(p.nom || '').includes(norm(kw)));
    if (matches.length === 0) {
      console.log('  (aucun)');
      continue;
    }
    for (const m of matches) {
      console.log(`  [${m.foodflowCode || '—'}] ${m.nom} | ${m.prix}€/${m.unite}`);
    }
  }
}

main().catch(e => { console.error(e); process.exit(1); });
