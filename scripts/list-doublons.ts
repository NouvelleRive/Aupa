// Liste TOUS les PFs (tous fournisseurs confondus) qui ont un nom similaire
// à ceux qu'on vient de mettre à jour côté Foodflow.
import 'dotenv/config';
import { db } from '../lib/firebase';
import { collection, getDocs } from 'firebase/firestore';

function norm(s: string) {
  return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
}

const NOMS = [
  'Citron jaune', 'Citron vert', 'Orange à jus', 'Myrtille barquette 125Gr',
  'Pastèque ~8kg Pièce', 'Melon charentais ~1kg pièce', 'Fraise',
  'Coulis Fruits Rouges Frais Ponthier 1KG', 'Pomme Golden pâtisserie (petite)',
  'Ananas sweet bateau ~1,5kg pièce', 'Banane moyenne',
  'Purée de fruits rouges frais Ponthier 1kg', 'Purée Fruit de la Passion Ponthier 1KG',
  'Coulis Fruits Exotiques Frais Ponthier 1KG', 'Grenade ~500g pièce',
];

async function main() {
  const pfSnap = await getDocs(collection(db, 'produitsFournisseurs'));
  const all = pfSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));

  for (const target of NOMS) {
    const matches = all.filter(p => norm(p.nom) === norm(target));
    if (matches.length <= 1) continue;
    console.log(`\n── "${target}" (${matches.length} PFs) ──`);
    for (const m of matches) {
      console.log(`  ${m.id} | fournisseur=${m.fournisseur || '—'} | categorie=${m.categorie} | code=${m.foodflowCode || '—'} | prix=${m.prix} ${m.unite}`);
    }
  }
}
main().catch(e => { console.error(e); process.exit(1); });
