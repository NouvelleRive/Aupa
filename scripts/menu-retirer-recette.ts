import { config } from 'dotenv';
config({ path: '.env.local' });
import { db } from '../lib/firebase';
import { doc, getDoc, updateDoc } from 'firebase/firestore';

// Usage: npx tsx scripts/menu-retirer-recette.ts <menuId> <recetteId> [--apply]
const [menuId, recetteId] = process.argv.slice(2);
const APPLY = process.argv.includes('--apply');

(async () => {
  const ref = doc(db, 'menus', menuId);
  const m = (await getDoc(ref)).data() as any;
  let n = 0;
  const categories = m.categories.map((c: any) => {
    const recettes = c.recettes.filter((r: any) => r.id !== recetteId);
    if (recettes.length !== c.recettes.length) { n += c.recettes.length - recettes.length; console.log(`${m.nom} / ${c.nom} : retire ${recetteId}`); }
    return { ...c, recettes };
  });
  if (n === 0) { console.log('Recette absente du menu'); process.exit(1); }
  if (!APPLY) { console.log('(dry-run)'); process.exit(0); }
  await updateDoc(ref, { categories });
  console.log('OK');
  process.exit(0);
})();
